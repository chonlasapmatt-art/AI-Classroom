// The two staff queues the simple login model creates.
//
// A parent who adds a child by name alone does not get their data on the strength of that name; the
// request lands here, and a teacher decides. The second queue is what replaces a password reset
// email: the account holder asks, and staff set a new password. Neither queue can be worked from the
// browser alone — every button below goes through a trusted server function that checks the school.

import { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '../../services/supabase';
import { completeMemberPasswordReset, MEMBER_PASSWORD_MINIMUM } from '../auth/memberAccess';
import { Badge, Button, Card, CardHeader, EmptyState } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

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
  const { toast } = useToast();
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
    setBusy(true);
    try {
      const { error } = await requireSupabase().rpc('set_parent_link_state', { p_link_id: linkId, p_state: state });
      toast(error
        ? 'ดำเนินการไม่สำเร็จ'
        : state === 'revoke' ? 'ยกเลิกความสัมพันธ์แล้ว' : 'อนุมัติความสัมพันธ์แล้ว ผู้ปกครองเห็นข้อมูลได้ทันที');
      await reload();
    } finally { setBusy(false); }
  }

  async function resetPassword(request: ResetRequest) {
    setBusy(true);
    try {
      const newPassword = generatedPassword();
      const done = await completeMemberPasswordReset({ requestId: request.id, newPassword });
      if (!done) { toast('ตั้งรหัสผ่านใหม่ไม่สำเร็จ'); return; }
      // Shown once, to be read out to the account holder. It is never stored anywhere on this device,
      // and the row deliberately stays on screen — reloading the queue now would take the only copy
      // of the new password away before anyone could pass it on.
      setIssued((current) => ({ ...current, [request.id]: newPassword }));
      toast(`ตั้งรหัสผ่านใหม่ให้ ${request.displayName} แล้ว แจ้งรหัสนี้กับเจ้าของบัญชีโดยตรง`);
    } finally { setBusy(false); }
  }

  const pending = links.filter((item) => item.status === 'pending');

  return (
    <>
      <Card>
        <CardHeader
          title="คำขอเชื่อมบัญชีผู้ปกครอง"
          description="ผู้ปกครองที่เพิ่มลูกด้วยชื่ออย่างเดียวจะยังไม่เห็นข้อมูลใด ๆ จนกว่าจะอนุมัติที่นี่"
          action={<Badge tone={pending.length > 0 ? 'warning' : 'success'}>
            {pending.length > 0 ? `${pending.length} รออนุมัติ` : 'ไม่มีค้าง'}
          </Badge>}
        />
        {links.length === 0 ? (
          <EmptyState
            icon={<Icon name="parents" size={28} />}
            title="ยังไม่มีคำขอ"
            description="ผู้ปกครองที่เพิ่มลูกด้วยชื่อจะปรากฏที่นี่ พร้อมชื่อนักเรียนและห้องให้ตรวจก่อนอนุมัติ"
          />
        ) : (
          <ul className="request-list">
            {links.map((request) => (
              <li key={request.linkId}>
                <div className="request-main">
                  <strong>{request.parentName}</strong>
                  <span>{request.relationship} ของ {request.studentName}{request.className ? ` · ${request.className}` : ''}</span>
                  <span>{request.requestedAt ? new Date(request.requestedAt).toLocaleString('th-TH') : ''}</span>
                </div>
                <Badge tone={request.status === 'linked' ? 'success' : request.status === 'pending' ? 'warning' : 'danger'}>
                  {statusLabels[request.status] ?? request.status}
                </Badge>
                <div className="request-actions">
                  {request.status !== 'linked' && (
                    <Button variant="primary" size="sm" disabled={busy} onClick={() => void decide(request.linkId, request.status === 'revoked' ? 'restore' : 'approve')}>
                      {request.status === 'revoked' ? 'คืนสิทธิ์' : 'อนุมัติ'}
                    </Button>
                  )}
                  {request.status !== 'revoked' && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void decide(request.linkId, 'revoke')}>ยกเลิก</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="คำขอตั้งรหัสผ่านใหม่"
          description="ระบบไม่แสดงรหัสผ่านเดิมและไม่มีใครอ่านได้ · ตั้งรหัสใหม่แล้วแจ้งเจ้าของบัญชีโดยตรง"
          action={<Badge tone={resets.length > 0 ? 'warning' : 'success'}>
            {resets.length > 0 ? `${resets.length} รอดำเนินการ` : 'ไม่มีค้าง'}
          </Badge>}
        />
        {resets.length === 0 ? (
          <EmptyState
            icon={<Icon name="profile" size={28} />}
            title="ยังไม่มีคำขอ"
            description="คำขอจากครูและผู้ปกครองที่เข้าระบบไม่ได้จะปรากฏที่นี่"
          />
        ) : (
          <ul className="request-list">
            {resets.map((request) => (
              <li key={request.id}>
                <div className="request-main">
                  <strong>{request.displayName}</strong>
                  <span>{request.role === 'teacher' ? 'ครู' : 'ผู้ปกครอง'} · {request.requestedAt ? new Date(request.requestedAt).toLocaleString('th-TH') : ''}</span>
                  {issued[request.id] && (
                    // Shown once and never stored. It stays on screen deliberately: reloading the
                    // queue would take the only copy away before anyone could pass it on.
                    <span className="issued-password">
                      <Icon name="info" size={14} />
                      รหัสผ่านใหม่: <code>{issued[request.id]}</code>
                    </span>
                  )}
                </div>
                <div className="request-actions">
                  <Button
                    variant={issued[request.id] ? 'ghost' : 'primary'} size="sm"
                    disabled={busy || Boolean(issued[request.id])}
                    onClick={() => void resetPassword(request)}
                  >
                    {issued[request.id] ? 'ตั้งรหัสผ่านใหม่แล้ว' : 'ตั้งรหัสผ่านใหม่'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

    </>
  );
}
