import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';
import { ChildLinkPanel } from '../parents/ChildLinkPanel';

const roleLabels: Record<PublicRegistrationRole | 'admin', string> = {
  teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง', admin: 'ผู้ดูแล'
};

/** บัญชีทั้งหมดสร้างโดยแอดมินโรงเรียน หน้านี้รองรับเฉพาะบัญชีที่รอถูกผูกกับโรงเรียน */
export function AwaitingMembershipPage() {
  const auth = useAuth();
  const requestedRole = auth.session?.user.user_metadata.requested_role as PublicRegistrationRole | undefined;
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { data, error } = await requireSupabase().functions.invoke('member-invitation', { body: { action: 'redeem', code } });
      if (error) throw error;
      const state = (data as { accountState?: string } | null)?.accountState;
      await auth.refreshMemberships();
      setMessage(state === 'verification_pending' ? 'เชื่อมบัญชีแล้ว กำลังรอการตรวจสอบสถานะครู' : 'เชื่อมบัญชีกับโรงเรียนแล้ว');
    } catch { setMessage('ใช้คำเชิญไม่สำเร็จ กรุณาตรวจรหัสอีกครั้ง'); }
    finally { setBusy(false); }
  }

  if (requestedRole === 'parent') {
    return (
      <main className="center-state account-state onboarding-state parent-onboarding">
        <div className="brand-mark" aria-hidden="true">SC</div>
        <h1>ลูกของฉัน</h1>
        <p>เพิ่มลูกด้วยชื่อจริงของลูกเท่านั้น เมื่อเชื่อมแล้วข้อมูลของลูกจะแสดงทันที</p>
        <ChildLinkPanel onChanged={() => void auth.refreshMemberships()} />
        <button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
      </main>
    );
  }

  return (
    <main className="center-state account-state onboarding-state">
      <div className="brand-mark" aria-hidden="true">SC</div>
      <h1>บัญชีนี้ยังไม่มีสิทธิ์ในโรงเรียน</h1>
      <p>{requestedRole && roleLabels[requestedRole] ? `ประเภทบัญชี: ${roleLabels[requestedRole]}` : 'กรุณาติดต่อโรงเรียนเพื่อเพิ่มบัญชีของคุณ'}</p>
      {message && <div className="alert success" role="status">{message}</div>}
      <details className="invitation-alternative">
        <summary>มีรหัสคำเชิญ 8 หลักจากโรงเรียน</summary>
        <form className="invite-code-form" onSubmit={(event) => void redeem(event)}>
          <label>รหัสคำเชิญ<input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label>
          <button className="secondary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'ใช้คำเชิญ'}</button>
        </form>
      </details>
      <button className="secondary-button" onClick={() => void auth.refreshMemberships()}>ตรวจสอบสถานะอีกครั้ง</button>
      <Link className="text-button" to="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
    </main>
  );
}
