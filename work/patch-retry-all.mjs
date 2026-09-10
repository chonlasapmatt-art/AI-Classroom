import { patch } from './patchlib.mjs';

/* ── The queue operation ── */
patch('apps/web/src/features/operations/blockedMutations.ts', [[
  `/** Puts one change back in the queue for the next sync. */
export async function retryBlockedMutation(queueId: string): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'pending', attemptCount: 0, nextRetryAt: new Date().toISOString(), lastError: null
  });
}`,
  `/** Puts one change back in the queue for the next sync. */
export async function retryBlockedMutation(queueId: string): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'pending', attemptCount: 0, nextRetryAt: new Date().toISOString(), lastError: null
  });
}

/**
 * Puts every blocked change back at once.
 *
 * A blocked row is one the server refused and will not be tried again, which is right while the
 * reason still stands. The reason often does not: most of these are refused by one server-side rule,
 * and when that rule is corrected every row it stopped becomes deliverable in the same moment. Until
 * now the only way through that was to press "ลองใหม่" once per row — and the rule that refused every
 * pupil's turn-in left far more rows than anybody would sit through.
 *
 * Nothing is forced past the server. Each one is simply offered again, and anything still refused
 * comes back to this list with whatever the server says about it this time.
 */
export async function retryAllBlockedMutations(schoolId: string): Promise<number> {
  const items = await db.syncQueue.where({ schoolId, status: 'blocked' }).toArray();
  const now = new Date().toISOString();
  await db.transaction('rw', db.syncQueue, async () => {
    for (const item of items) {
      await db.syncQueue.update(item.queueId, {
        status: 'pending', attemptCount: 0, nextRetryAt: now, lastError: null
      });
    }
  });
  return items.length;
}`
]]);

/* ── The control ── */
patch('apps/web/src/features/operations/BlockedMutationsPanel.tsx', [
  [
    `  discardBlockedMutation, listBlockedMutations, retryBlockedMutation, type BlockedMutation`,
    `  discardBlockedMutation, listBlockedMutations, retryAllBlockedMutations, retryBlockedMutation,
  type BlockedMutation`
  ],
  [
    `  async function discard(row: BlockedMutation) {`,
    `  /*
   * Everything at once, for the case that produces most of these rows: one server-side rule
   * refused a whole class of writes, somebody has since corrected it, and every row it stopped is
   * now deliverable. One press per row is not a remedy when the rule refused a term of turned-in
   * work.
   */
  async function retryEverything() {
    setBusy('all');
    try {
      const count = await retryAllBlockedMutations(membership.schoolId);
      setMessage(\`ส่งกลับเข้าคิวแล้ว \${count} รายการ · จะลองใหม่ในการซิงก์ครั้งถัดไป · รายการที่ยังถูกปฏิเสธจะกลับมาแสดงที่นี่พร้อมเหตุผลใหม่\`);
      await load();
    } finally { setBusy(null); }
  }

  async function discard(row: BlockedMutation) {`
  ],
  [
    `        action={<Badge tone="warning">{rows.length} รายการ</Badge>}
      />`,
    `        action={
          <>
            {rows.length > 1 && (
              <Button variant="secondary" size="sm" loading={busy === 'all'} onClick={() => void retryEverything()}>
                ลองใหม่ทั้งหมด
              </Button>
            )}
            <Badge tone="warning">{rows.length} รายการ</Badge>
          </>
        }
      />`
  ]
]);
console.log('blocked rows can be re-driven together');
