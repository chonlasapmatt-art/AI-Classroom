import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';

const roleLabels: Record<PublicRegistrationRole, string> = {
  teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง'
};

export function RegisterPage() {
  const auth = useAuth();
  const [role, setRole] = useState<PublicRegistrationRole>('teacher');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.session && !message) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    if (password !== String(values.get('confirmPassword') ?? '')) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); setBusy(false); return;
    }
    try {
      const result = await auth.signUp({
        displayName: String(values.get('displayName') ?? ''),
        email: String(values.get('email') ?? ''), password, role
      });
      setMessage(result.emailConfirmationRequired
        ? 'สร้างบัญชีแล้ว กรุณาตรวจอีเมลเพื่อยืนยัน จากนั้นโรงเรียนจะตรวจสอบสิทธิ์เข้าใช้งาน'
        : 'สร้างบัญชีแล้ว กำลังเข้าสู่ขั้นตอนตรวจสอบสิทธิ์ของโรงเรียน');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'สร้างบัญชีไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-art"><div className="brand-mark">SC</div><span className="eyebrow">เริ่มต้นใช้งาน</span><h1>สร้างบัญชี<br/>Smart Classroom</h1><p>บัญชีใหม่จะเข้าใช้งานข้อมูลโรงเรียนได้หลังผ่านการเชิญหรือการตรวจสอบสิทธิ์เท่านั้น</p></section><form className="auth-card" onSubmit={(event) => void submit(event)}><h2>สร้างบัญชี</h2><fieldset className="role-choice"><legend>ฉันเป็น</legend>{(Object.keys(roleLabels) as PublicRegistrationRole[]).map((value) => <label key={value}><input type="radio" name="role" checked={role === value} onChange={() => setRole(value)} />{roleLabels[value]}</label>)}</fieldset><label>ชื่อที่ใช้ในระบบ<input name="displayName" autoComplete="name" minLength={2} maxLength={200} required /></label><label>อีเมล<input name="email" type="email" autoComplete="email" required /></label><label>รหัสผ่าน<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="primary-button" disabled={busy || Boolean(message)}>{busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี'}</button><div className="auth-links"><Link to="/login">กลับไปเข้าสู่ระบบ</Link></div></form></main>;
}

export function ForgotPasswordPage() {
  const auth = useAuth(); const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await auth.requestPasswordReset(String(new FormData(event.currentTarget).get('email') ?? '')); setMessage('หากอีเมลนี้มีบัญชี ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ส่งคำขอไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page compact"><form className="auth-card" onSubmit={(event) => void submit(event)}><h1>ตั้งรหัสผ่านใหม่</h1><p>กรอกอีเมลที่ใช้กับ Smart Classroom</p><label>อีเมล<input name="email" type="email" autoComplete="email" required /></label>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="primary-button" disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่าน'}</button><div className="auth-links"><Link to="/login">กลับไปเข้าสู่ระบบ</Link></div></form></main>;
}

export function ResetPasswordPage() {
  const auth = useAuth(); const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const password = String(values.get('password') ?? '');
    if (password !== String(values.get('confirmPassword') ?? '')) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setBusy(true); setError(null);
    try { await auth.updatePassword(password); setMessage('บันทึกรหัสผ่านใหม่แล้ว'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page compact"><form className="auth-card" onSubmit={(event) => void submit(event)}><h1>กำหนดรหัสผ่านใหม่</h1><label>รหัสผ่านใหม่<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>{message && <div className="auth-links"><Link to="/">ไปหน้าหลัก</Link></div>}</form></main>;
}

export function AwaitingMembershipPage() {
  const auth = useAuth();
  const requestedRole = auth.session?.user.user_metadata.requested_role as PublicRegistrationRole | undefined;
  const [code, setCode] = useState(''); const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { data, error } = await requireSupabase().functions.invoke('member-invitation', { body: { action: 'redeem', code } });
      if (error) throw error;
      const state = (data as { accountState?: string } | null)?.accountState;
      await auth.refreshMemberships();
      setMessage(state === 'verification_pending' ? 'เชื่อมบัญชีแล้ว กำลังรอการตรวจสอบสถานะครู' : 'เชื่อมบัญชีกับโรงเรียนแล้ว');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'ใช้คำเชิญไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <main className="center-state account-state"><div className="brand-mark" aria-hidden="true">SC</div><h1>บัญชีกำลังรอเชื่อมกับโรงเรียน</h1><p>{requestedRole ? `ประเภทบัญชีที่ขอ: ${roleLabels[requestedRole]}` : 'บัญชีนี้ยังไม่มีสิทธิ์ในโรงเรียน'}</p><p>ใช้คำเชิญของโรงเรียนเพื่อเชื่อมกับข้อมูลเดิม ระบบจะไม่สร้างนักเรียน ครู หรือผู้ปกครองซ้ำ</p><form className="invite-code-form" onSubmit={(event) => void redeem(event)}><label>รหัสคำเชิญ 8 หลัก<input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label><button className="primary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'ใช้คำเชิญ'}</button></form>{message && <div className="alert" role="status">{message}</div>}<button className="secondary-button" onClick={() => void auth.refreshMemberships()}>ตรวจสอบสถานะอีกครั้ง</button><button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button></main>;
}
