import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';

const roleLabels: Record<PublicRegistrationRole, string> = {
  teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง'
};

// Students no longer hold an email account at all, so this screen — which exists to create one —
// offers the two roles that still need one and points students at their own entrance instead.
const emailRegistrationRoles: PublicRegistrationRole[] = ['teacher', 'parent'];

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
        ? 'สร้างบัญชีแล้ว กรุณากดปุ่มยืนยันในอีเมล ระบบจะพากลับเข้าเว็บเพื่อกรอกข้อมูลโรงเรียนต่อ'
        : 'สร้างบัญชีแล้ว กำลังเข้าสู่ขั้นตอนกรอกข้อมูลโรงเรียน');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'สร้างบัญชีไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-art"><div className="brand-mark">SC</div><span className="eyebrow">เริ่มต้นใช้งาน</span><h1>สร้างบัญชี<br/>Smart Classroom</h1><p>ยืนยันอีเมลก่อน แล้วระบบจะตรวจข้อมูลโรงเรียนตามบทบาทเพื่อไม่สร้างข้อมูลซ้ำ</p></section>
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h2>สร้างบัญชี</h2>
        <fieldset className="role-choice"><legend>ฉันเป็น</legend>{emailRegistrationRoles.map((value) => <label key={value}><input type="radio" name="role" checked={role === value} onChange={() => setRole(value)} />{roleLabels[value]}</label>)}</fieldset>
        <p className="role-hint">{roleLabels.student}ไม่ต้องใช้อีเมล · <Link to="/student/first-time">สมัครใช้งานครั้งแรกสำหรับนักเรียน</Link></p>
        <label>ชื่อที่ใช้ในระบบ<input name="displayName" autoComplete="name" minLength={2} maxLength={200} required /></label>
        <label>อีเมล<input name="email" type="email" autoComplete="email" required /></label>
        <label>รหัสผ่าน<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        {message && <div className="alert success" role="status">{message}</div>}
        <button className="primary-button" disabled={busy || Boolean(message)}>{busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี'}</button>
        <div className="auth-links"><Link to="/login">กลับไปเข้าสู่ระบบ</Link></div>
      </form>
    </main>
  );
}

export function AuthCallbackPage() {
  const auth = useAuth();
  if (auth.loading) return <main className="center-state"><div className="spinner"/><p>กำลังยืนยันอีเมลและเข้าสู่ระบบ...</p></main>;
  if (auth.session) return <Navigate to="/" replace />;
  return <main className="center-state account-state"><div className="brand-mark">SC</div><h1>ลิงก์ไม่พร้อมใช้งาน</h1><p>ลิงก์อาจหมดอายุหรือถูกใช้แล้ว กรุณาขอรหัสใหม่จากหน้าเข้าสู่ระบบ</p><Link className="primary-button" to="/login">กลับไปเข้าสู่ระบบ</Link></main>;
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

function RoleOnboardingForm({ role, onComplete }: { role: PublicRegistrationRole; onComplete(message: string): void }) {
  const auth = useAuth();
  const defaultName = String(auth.session?.user.user_metadata.display_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const values = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      action: role,
      schoolCode: String(values.get('schoolCode') ?? ''),
      displayName: String(values.get('displayName') ?? '')
    };
    if (role === 'student' || role === 'parent') body.studentCode = String(values.get('studentCode') ?? '');
    if (role === 'parent') {
      body.studentName = String(values.get('studentName') ?? '');
      body.relationship = String(values.get('relationship') ?? '');
    }
    try {
      const { data, error: invokeError } = await requireSupabase().functions.invoke('account-onboarding', { body });
      if (invokeError) throw invokeError;
      const result = data as { schoolName?: string; accountState?: string; linkState?: string } | null;
      await auth.refreshMemberships();
      if (role === 'teacher') onComplete(`ส่งคำขอเข้า ${result?.schoolName ?? 'โรงเรียน'} แล้ว กรุณารอผู้ดูแลยืนยันสถานะครู`);
      else if (role === 'parent') onComplete(`เชื่อมบัญชีกับ ${result?.schoolName ?? 'โรงเรียน'} แล้ว คำขอเชื่อมบุตรกำลังรอครูอนุมัติ`);
      else onComplete(`ยืนยันข้อมูลนักเรียนและเชื่อมกับ ${result?.schoolName ?? 'โรงเรียน'} แล้ว`);
    } catch {
      setError('ข้อมูลไม่ตรงกับทะเบียนโรงเรียน หรือมีบัญชีเชื่อมกับรายการนี้แล้ว กรุณาตรวจรหัสและชื่ออีกครั้ง');
    } finally { setBusy(false); }
  }

  return (
    <form className="onboarding-form" onSubmit={(event) => void submit(event)}>
      <h2>{role === 'teacher' ? 'ข้อมูลครูครั้งแรก' : role === 'student' ? 'ยืนยันตัวนักเรียน' : 'เชื่อมบัญชีกับบุตรหลาน'}</h2>
      <p className="hint">ใช้รหัสโรงเรียนที่ได้รับจากโรงเรียน ข้อมูลทั้งหมดตรวจสอบที่เซิร์ฟเวอร์และไม่ค้นหาข้ามโรงเรียน</p>
      <label>ชื่อของคุณ<input name="displayName" defaultValue={defaultName} minLength={2} required /></label>
      <label>รหัสโรงเรียน<input name="schoolCode" autoCapitalize="characters" pattern="[A-Za-z0-9-]{3,20}" placeholder="เช่น SBAC-01" required /></label>
      {(role === 'student' || role === 'parent') && <label>รหัสนักเรียน<input name="studentCode" maxLength={40} required /></label>}
      {role === 'parent' && <><label>ชื่อ-นามสกุลบุตรตามทะเบียน<input name="studentName" minLength={2} required /></label><label>ความสัมพันธ์<input name="relationship" placeholder="มารดา / บิดา / ผู้ปกครอง" minLength={2} required /></label></>}
      {role === 'teacher' && <div className="alert">บัญชีครูจะเข้าใช้ข้อมูลโรงเรียนได้หลังผู้ดูแลตรวจสอบและอนุมัติ</div>}
      {role === 'parent' && <div className="alert">เพื่อความปลอดภัย ชื่ออย่างเดียวไม่เพียงพอ และข้อมูลนักเรียนจะเปิดหลังโรงเรียนอนุมัติคำขอ</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : role === 'parent' ? 'ส่งคำขอเชื่อมบุตร' : 'ยืนยันข้อมูล'}</button>
    </form>
  );
}

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
    } catch { setMessage('ใช้คำเชิญไม่สำเร็จ กรุณาตรวจรหัสและอีเมลของบัญชี'); }
    finally { setBusy(false); }
  }

  return (
    <main className="center-state account-state onboarding-state">
      <div className="brand-mark" aria-hidden="true">SC</div>
      <h1>ตั้งค่าบัญชีครั้งแรก</h1>
      <p>{requestedRole ? `ประเภทบัญชี: ${roleLabels[requestedRole]}` : 'บัญชีนี้ยังไม่มีสิทธิ์ในโรงเรียน'}</p>
      {message && <div className="alert success" role="status">{message}</div>}
      {requestedRole && <RoleOnboardingForm role={requestedRole} onComplete={setMessage} />}
      <details className="invitation-alternative">
        <summary>มีรหัสคำเชิญ 8 หลักจากโรงเรียน</summary>
        <form className="invite-code-form" onSubmit={(event) => void redeem(event)}>
          <label>รหัสคำเชิญ<input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label>
          <button className="secondary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'ใช้คำเชิญ'}</button>
        </form>
      </details>
      <button className="secondary-button" onClick={() => void auth.refreshMemberships()}>ตรวจสอบสถานะอีกครั้ง</button>
      <button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
    </main>
  );
}
