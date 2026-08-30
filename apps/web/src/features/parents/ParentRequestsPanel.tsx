// The two staff queues the simple login model creates.
//
// A parent who adds a child by name alone does not get their data on the strength of that name; the
// request lands here, and a teacher decides. The second queue is what replaces a password reset
// email: the account holder asks, and staff set a new password. Neither queue can be worked from the
// browser alone — every button below goes through a trusted server function that checks the school.

import { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '../../services/supabase';
import { completeMemberPasswordReset, MEMBER_PASSWORD_MINIMUM } from '../auth/memberAccess';

interface LinkRequest {
  linkId: string;
  parentName: string;
  studentName: string;
  className: string;
  relationship: string;
  status: string;
  requestedAt: string;
}

interface ResetRequest {
  id: string;
  displayName: string;
  role: string;
  requestedAt: string;
}

const statusLabels: Record<string, string> = {
  linked: 'อนุมัติแล้ว', pending: 'รออนุมัติ', revoked: 'ยกเลิกแล้ว'
};

/** A one-off password the staff member reads out. Random, never derived from anything about the person. */
function generatedPassword(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(3));
  const body = [...bytes].map((value) => value.toString(36)).join('');
  return `SC-${body}`.slice(0, Math.max(MEMBER_PASSWORD_MINIMUM + 4, 16));
}

export function ParentRequestsPanel({ schoolId }: { schoolId: string }) {
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [resets, setResets] = useState<ResetRequest[]>([]);
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const client = requireSupabase();
    const [linkResult, resetResult] = await Promise.all([
      client.rpc('list_parent_link_requests', { p_school_id: schoolId }),
      client.from('password_reset_requests').select('id,display_name,role,requested_at')
        .eq('school_id', schoolId).eq('status', 'open').order('requested_at', { ascending: false }).limit(50)
    ]);
    if (!linkResult.error) {
      setLinks(((linkResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
        linkId: String(row.link_id), parentName: String(row.parent_name ?? ''),
        studentName: String(row.student_name ?? ''), className: String(row.class_name ?? ''),
        relationship: String(row.relationship ?? ''), status: String(row.status ?? 'pending'),
        requestedAt: String(row.requested_at ?? '')
      })));
    }
    if (!resetResult.error) {
      setResets(((resetResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id), displayName: String(row.display_name ?? ''),
        role: String(row.role ?? ''), requestedAt: String(row.requested_at ?? '')
      })));
    }
  }, [schoolId]);

  useEffect(() => { void reload(); }, [reload]);

  async function decide(linkId: string, state: 'approve' | 'revoke' | 'restore') {
    setBusy(true); setMessage(null);
    try {
      const { error } = await requireSupabase().rpc('set_parent_link_state', { p_link_id: linkId, p_state: state });
      setMessage(error
        ? 'ดำเนินการไม่สำเร็จ'
        : state === 'revoke' ? 'ยกเลิกความสัมพันธ์แล้ว' : 'อนุมัติความสัมพันธ์แล้ว ผู้ปกครองเห็นข้อมูลได้ทันที');
      await reload();
    } finally { setBusy(false); }
  }

  async function resetPassword(request: ResetRequest) {
    setBusy(true); setMessage(null);
    try {
      const newPassword = generatedPassword();
      const done = await completeMemberPasswordReset({ requestId: request.id, newPassword });
      if (!done) { setMessage('ตั้งรหัสผ่านใหม่ไม่สำเร็จ'); return; }
      // Shown once, to be read out to the account holder. It is never stored anywhere on this device,
      // and the row deliberately stays on screen — reloading the queue now would take the only copy
      // of the new password away before anyone could pass it on.
      setIssued((current) => ({ ...current, [request.id]: newPassword }));
      setMessage(`ตั้งรหัสผ่านใหม่ให้ ${request.displayName} แล้ว แจ้งรหัสนี้กับเจ้าของบัญชีโดยตรง`);
    } finally { setBusy(false); }
  }

  const pending = links.filter((item) => item.status === 'pending');

  return (
    <>
      <section className="panel data-panel">
        <div className="panel-heading">
          <h2>คำขอเชื่อมบัญชีผู้ปกครอง</h2>
          <p>{pending.length} รายการรออนุมัติ จากทั้งหมด {links.length} รายการ</p>
        </div>
        {links.length === 0 ? (
          <div className="empty-state"><span>♧</span><h3>ยังไม่มีคำขอ</h3><p>ผู้ปกครองที่เพิ่มลูกด้วยชื่อจะปรากฏที่นี่</p></div>
        ) : (
          <ul className="record-list">
            {links.map((request) => (
              <li key={request.linkId}>
                <div className="record-main">
                  <div>
                    <strong>{request.parentName}</strong>
                    <span>{request.relationship} ของ {request.studentName}{request.className ? ` · ${request.className}` : ''}</span>
                    <span>{request.requestedAt ? new Date(request.requestedAt).toLocaleString('th-TH') : ''}</span>
                  </div>
                  <span className={`status-chip ${request.status === 'linked' ? 'success' : request.status === 'pending' ? 'warning' : 'danger'}`}>
                    {statusLabels[request.status] ?? request.status}
                  </span>
                </div>
                <div className="record-actions">
                  {request.status !== 'linked' && (
                    <button className="secondary-button" disabled={busy} onClick={() => void decide(request.linkId, request.status === 'revoked' ? 'restore' : 'approve')}>
                      {request.status === 'revoked' ? 'คืนสิทธิ์' : 'อนุมัติ'}
                    </button>
                  )}
                  {request.status !== 'revoked' && (
                    <button className="text-button" disabled={busy} onClick={() => void decide(request.linkId, 'revoke')}>ยกเลิก</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel data-panel">
        <div className="panel-heading">
          <h2>คำขอตั้งรหัสผ่านใหม่</h2>
          <p>ระบบไม่แสดงรหัสผ่านเดิม ตั้งรหัสใหม่แล้วแจ้งเจ้าของบัญชีโดยตรง</p>
        </div>
        {resets.length === 0 ? (
          <div className="empty-state"><span>✎</span><h3>ยังไม่มีคำขอ</h3><p>คำขอจากครูและผู้ปกครองจะปรากฏที่นี่</p></div>
        ) : (
          <ul className="record-list">
            {resets.map((request) => (
              <li key={request.id}>
                <div className="record-main">
                  <div>
                    <strong>{request.displayName}</strong>
                    <span>{request.role === 'teacher' ? 'ครู' : 'ผู้ปกครอง'} · {request.requestedAt ? new Date(request.requestedAt).toLocaleString('th-TH') : ''}</span>
                    {issued[request.id] && <span className="issued-password">รหัสผ่านใหม่: {issued[request.id]}</span>}
                  </div>
                </div>
                <div className="record-actions">
                  <button className="secondary-button" disabled={busy || Boolean(issued[request.id])} onClick={() => void resetPassword(request)}>
                    {issued[request.id] ? 'ตั้งรหัสผ่านใหม่แล้ว' : 'ตั้งรหัสผ่านใหม่'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
