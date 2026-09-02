import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import {
  discardBlockedMutation, listBlockedMutations, retryBlockedMutation, type BlockedMutation
} from './blockedMutations';

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

  const load = useCallback(async () => {
    try { setRows(await listBlockedMutations(membership.schoolId)); }
    catch { setRows([]); }
  }, [membership.schoolId]);

  useEffect(() => { void load(); }, [load]);

  async function retry(row: BlockedMutation) {
    setBusy(row.queueId);
    try {
      await retryBlockedMutation(row.queueId);
      setMessage('ส่งเข้าคิวอีกครั้งแล้ว จะลองใหม่ในการซิงก์ครั้งถัดไป');
      await load();
    } finally { setBusy(null); }
  }

  async function discard(row: BlockedMutation) {
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
    <section className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h2>รายการที่ต้องตรวจสอบ</h2>
          <p>{rows.length} รายการที่เซิร์ฟเวอร์ไม่รับ จนกว่าจะจัดการ รายการเหล่านี้จะไม่ถูกส่งอีก</p>
        </div>
        <span className="status-chip warning">{rows.length}</span>
      </div>
      <ul className="record-list">
        {rows.map((row) => (
          <li key={row.queueId}>
            <div className="record-main">
              <div>
                <strong>{row.entityLabel}{row.name ? ` · ${row.name}` : ''}</strong>
                <span>{row.reason}</span>
                <span className="hint">{row.fix}</span>
              </div>
              <span className="status-chip">{new Date(row.blockedAt).toLocaleString('th-TH')}</span>
            </div>
            <div className="record-actions">
              <button className="secondary-button" disabled={busy === row.queueId} onClick={() => void retry(row)}>
                ลองใหม่
              </button>
              <button className="text-button danger" disabled={busy === row.queueId} onClick={() => void discard(row)}>
                {row.removesLocalRecord ? 'ทิ้งรายการนี้' : 'ทิ้งการแก้ไขนี้'}
              </button>
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
      {message && <div className="alert" role="status">{message}</div>}
    </section>
  );
}
