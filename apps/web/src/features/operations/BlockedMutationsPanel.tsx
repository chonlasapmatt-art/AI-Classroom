import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import {
  discardBlockedMutation, listBlockedMutations, retryBlockedMutation, type BlockedMutation
} from './blockedMutations';
import { Badge, Button, Card, CardHeader, ConfirmDialog } from '../../ui/components';
import { Icon } from '../../ui/Icon';

/**
 * The changes the server would not take.
 *
 * This screen counted them and said nothing else, so "ต้องตรวจสอบ 10" was the whole story a teacher
 * got after importing the same roster twice. Each one now says what it was, why it was refused, and
 * what to do — and offers the two things there are to do about it.
 */
export function BlockedMutationsPanel() {
  const { membership, mode } = useSession();
  const [rows, setRows] = useState<BlockedMutation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<BlockedMutation | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listBlockedMutations(membership.schoolId)); }
    catch { setRows([]); }
  }, [membership.schoolId]);

  /*
   * The first read is cancelled when this panel goes away.
   *
   * Reading the queue is a trip to IndexedDB, and somebody opening Sync & Backup and moving on
   * before it answers used to leave a write landing on a component that no longer exists. React
   * reports that as an error rather than acting on it, so it was invisible in a browser and showed
   * up only as an intermittent failure after the test environment had been torn down. `load` is
   * called directly by retry and discard, which are acts of a panel that is on screen, so only the
   * one that races an unmount needs the guard.
   */
  useEffect(() => {
    let cancelled = false;
    void listBlockedMutations(membership.schoolId)
      .then((next) => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [membership.schoolId]);

  async function retry(row: BlockedMutation) {
    setBusy(row.queueId);
    try {
      await retryBlockedMutation(row.queueId);
      setMessage('ส่งเข้าคิวอีกครั้งแล้ว จะลองใหม่ในการซิงก์ครั้งถัดไป');
      await load();
    } finally { setBusy(null); }
  }

  async function discard(row: BlockedMutation) {
    setDiscarding(null);
    setBusy(row.queueId);
    try {
      await discardBlockedMutation(row.queueId);
      setMessage(row.removesLocalRecord
        ? 'ทิ้งรายการแล้ว · ข้อมูลนี้ไม่เคยขึ้นเซิร์ฟเวอร์ จึงถูกลบออกจากเครื่องนี้ด้วย'
        : 'ทิ้งการแก้ไขนี้แล้ว · ข้อมูลบนเซิร์ฟเวอร์ยังเป็นค่าเดิม');
      await load();
    } finally { setBusy(null); }
  }

  if (mode === 'preview') return null;
  if (rows === null || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="รายการที่ต้องตรวจสอบ"
        description="เซิร์ฟเวอร์ไม่รับรายการเหล่านี้ และจะไม่ลองส่งอีกจนกว่าจะจัดการ"
        action={<Badge tone="warning">{rows.length} รายการ</Badge>}
      />
      {message && <div className="alert" role="status">{message}</div>}
      <ul className="blocked-list">
        {rows.map((row) => (
          <li key={row.queueId}>
            <div className="blocked-head">
              <div className="blocked-what">
                <strong>{row.entityLabel}{row.name ? ` · ${row.name}` : ''}</strong>
                <span>{row.reason}</span>
              </div>
              <Badge tone="neutral">{new Date(row.blockedAt).toLocaleString('th-TH')}</Badge>
            </div>
            <p className="blocked-fix"><Icon name="info" size={14} />{row.fix}</p>
            <div className="blocked-actions">
              <Button variant="secondary" size="sm" loading={busy === row.queueId} onClick={() => void retry(row)}>
                ลองใหม่
              </Button>
              {/* Discarding a change the server never took removes it from this device too when it
                  never existed anywhere else. That was one press with nothing asked. */}
              <Button variant="danger" size="sm" disabled={busy === row.queueId} onClick={() => setDiscarding(row)}>
                {row.removesLocalRecord ? 'ทิ้งรายการนี้' : 'ทิ้งการแก้ไขนี้'}
              </Button>
            </div>
            {/* The server's own words, for the case nobody anticipated and for the message an
                administrator would otherwise have to be told over the phone. */}
            <details className="access-code-options">
              <summary>รายละเอียดจากเซิร์ฟเวอร์</summary>
              <p className="sync-detail">{row.detail}</p>
            </details>
          </li>
        ))}
      </ul>

      {discarding && (
        <ConfirmDialog
          title={discarding.removesLocalRecord ? `ทิ้ง ${discarding.entityLabel} นี้` : `ทิ้งการแก้ไข ${discarding.entityLabel}`}
          description={discarding.removesLocalRecord
            ? 'รายการนี้ยังไม่เคยขึ้นเซิร์ฟเวอร์ การทิ้งจะลบออกจากเครื่องนี้ด้วย และเรียกกลับไม่ได้'
            : 'การแก้ไขนี้จะถูกทิ้งไป ข้อมูลบนเซิร์ฟเวอร์ยังเป็นค่าเดิม · ถ้าอยากเก็บไว้ ให้กด “ลองใหม่” แทน'}
          confirmLabel={discarding.removesLocalRecord ? 'ทิ้งรายการนี้' : 'ทิ้งการแก้ไขนี้'}
          onCancel={() => setDiscarding(null)}
          onConfirm={() => void discard(discarding)}
        />
      )}
    </Card>
  );
}
