import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';
import { ChildLinkPanel } from '../parents/ChildLinkPanel';
import { searchSchools, type SchoolChoice } from './studentAccess';
import {
  isCompleteMemberRegistration, MEMBER_PASSWORD_MINIMUM, registerParent, registerTeacher,
  type MemberRole
} from './memberAccess';

const roleLabels: Record<PublicRegistrationRole, string> = {
  teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง'
};

// Signing up asks for a name and a password. A student needs neither, so this screen offers the two
// roles that hold a password and sends students to their own entrance instead.
const passwordRegistrationRoles: MemberRole[] = ['teacher', 'parent'];

export function RegisterPage() {
  const auth = useAuth();
  const [role, setRole] = useState<MemberRole | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [options, setOptions] = useState<SchoolChoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (role !== 'teacher' || schoolId) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void searchSchools(schoolQuery).then(setOptions); }, 250);
    return () => window.clearTimeout(debounce.current);
  }, [role, schoolId, schoolQuery]);

  if (auth.session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) return;
    if (password !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setBusy(true); setError(null);
    try {
      const result = role === 'teacher'
        ? await registerTeacher({ firstName, lastName, schoolId, password, recoveryEmail, accessCode })
        : await registerParent({ firstName, lastName, password, recoveryEmail });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') { setError('มีบัญชีชื่อนี้อยู่แล้ว กรุณาเข้าสู่ระบบแทน'); return; }
      setError(result.message);
    } finally { setBusy(false); }
  }

  const complete = role !== null && isCompleteMemberRegistration({
    firstName, lastName, password, confirmPassword, recoveryEmail,
    ...(role === 'teacher' ? { schoolId, accessCode } : {})
  });

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand-mark">SC</div>
        <span className="eyebrow">เริ่มต้นใช้งาน</span>
        <h1>สมัครใช้งาน<br/>Smart Classroom</h1>
        <p>เข้าสู่ระบบด้วยชื่อจริงกับรหัสผ่าน อีเมลใช้เฉพาะเมื่อลืมรหัสผ่าน</p>
      </section>

      {role === null ? (
        <div className="auth-card">
          <h2>คุณคือใคร?</h2>
          <div className="who-choice">
            {passwordRegistrationRoles.map((value) => (
              <button key={value} type="button" className="who-button" onClick={() => { setRole(value); setError(null); }}>
                <span aria-hidden="true">{value === 'teacher' ? '✎' : '♧'}</span>
                {roleLabels[value]}
              </button>
            ))}
          </div>
          <p className="role-hint">{roleLabels.student}ไม่ต้องใช้รหัสผ่าน · <Link to="/student/first-time">สมัครใช้งานครั้งแรกสำหรับนักเรียน</Link></p>
          <div className="auth-links"><Link to="/login">กลับไปเข้าสู่ระบบ</Link></div>
        </div>
      ) : (
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <h2>สมัครใช้งาน{roleLabels[role]}</h2>
          <p className="field-hint">
            {role === 'teacher'
              ? 'ชื่อกับรหัสผ่านนี้คือสิ่งที่ใช้เข้าสู่ระบบครั้งต่อไป เลือกโรงเรียนแล้วกรอกรหัสสำหรับครูที่ผู้ดูแลโรงเรียนส่งให้ ใช้เฉพาะครั้งแรกครั้งเดียว'
              : 'ชื่อกับรหัสผ่านนี้คือสิ่งที่ใช้เข้าสู่ระบบครั้งต่อไป เพิ่มลูกได้หลังเข้าระบบ โดยกรอกแค่ชื่อจริงของลูก'}
          </p>
          <div className="form-grid">
            <label>ชื่อจริง<input name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="เช่น สมชาย" minLength={1} required /></label>
            <label>นามสกุล<input name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="เช่น ใจดี" minLength={1} required /></label>
          </div>
          <label>
            อีเมลกู้คืนบัญชี
            <input name="recoveryEmail" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="เช่น somchai@example.com" aria-describedby="recovery-email-hint" required />
          </label>
          <p className="field-hint" id="recovery-email-hint">ใช้ส่งรหัส OTP 6 หลักเมื่อลืมรหัสผ่านเท่านั้น ไม่ใช้เข้าสู่ระบบปกติ</p>
          {role === 'teacher' && (
            <>
              <label>
                โรงเรียน
                <input
                  name="school" value={schoolQuery} placeholder="เช่น โรงเรียนสาธิตสมาร์ท"
                  onChange={(event) => { setSchoolQuery(event.target.value); setSchoolId(''); }}
                  aria-describedby="register-school-hint" required
                />
              </label>
              <p className="field-hint" id="register-school-hint">พิมพ์ชื่อโรงเรียน 2 ตัวอักษรขึ้นไป แล้วกดเลือกจากรายการที่ขึ้นมา</p>
              {!schoolId && options.length > 0 && (
                <ul className="school-suggestions">
                  {options.map((school) => (
                    <li key={school.schoolId}>
                      <button type="button" className="text-button" onClick={() => { setSchoolId(school.schoolId); setSchoolQuery(school.name); setOptions([]); }}>
                        {school.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {schoolId && <p className="fine-print">เลือกโรงเรียนแล้ว · กรอกรหัสสำหรับครูของโรงเรียนนี้ในช่องถัดไป</p>}
              <label>
                รหัสสำหรับครู
                <input
                  name="accessCode" value={accessCode} onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="เช่น SC-482917" autoComplete="one-time-code" inputMode="text"
                  maxLength={40} aria-describedby="register-code-hint" required
                />
              </label>
              <p className="field-hint" id="register-code-hint">
                รหัสที่ผู้ดูแลโรงเรียนสร้างและส่งให้ครูที่ได้รับอนุญาต ใช้เฉพาะตอนสมัครครั้งแรก
                ครั้งต่อไปเข้าสู่ระบบด้วยชื่อกับรหัสผ่านเท่านั้น
              </p>
            </>
          )}
          <label>
            รหัสผ่าน
            <input name="password" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={`อย่างน้อย ${MEMBER_PASSWORD_MINIMUM} ตัวอักษร`} aria-describedby="register-password-hint" required />
          </label>
          <p className="field-hint" id="register-password-hint">ตั้งเองได้ตามใจ หากลืม ระบบจะส่ง OTP 6 หลักไปยังอีเมลกู้คืนบัญชี</p>
          <label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="พิมพ์รหัสผ่านเดิมอีกครั้ง" required /></label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="primary-button big-button" disabled={busy || !complete}>
            {busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและเข้าใช้งาน'}
          </button>
          <button type="button" className="text-button" onClick={() => setRole(null)}>เปลี่ยนประเภทผู้ใช้</button>
          <div className="auth-links"><Link to="/login">มีบัญชีแล้ว เข้าสู่ระบบ</Link></div>
        </form>
      )}
    </main>
  );
}

export function AuthCallbackPage() {
  const auth = useAuth();
  if (auth.loading) return <main className="center-state"><div className="spinner"/><p>กำลังยืนยันและเข้าสู่ระบบ...</p></main>;
  if (auth.session) return <Navigate to="/" replace />;
  return <main className="center-state account-state"><div className="brand-mark">SC</div><h1>ลิงก์ไม่พร้อมใช้งาน</h1><p>ลิงก์อาจหมดอายุหรือถูกใช้แล้ว กรุณากลับไปหน้าเข้าสู่ระบบ</p><Link className="primary-button" to="/login">กลับไปเข้าสู่ระบบ</Link></main>;
}

/** Recovery email exists only on this route; normal sign-in remains name + password. */
export function ForgotPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await auth.requestPasswordReset(recoveryEmail);
      setSent(true);
      setMessage('หากอีเมลนี้ผูกกับบัญชี ระบบจะส่งรหัส OTP 6 หลักให้ กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม');
    } catch {
      // Keep the response opaque so this page cannot enumerate recovery addresses.
      setSent(true);
      setMessage('หากอีเมลนี้ผูกกับบัญชี ระบบจะส่งรหัส OTP 6 หลักให้ กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม');
    } finally { setBusy(false); }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await auth.verifyPasswordResetOtp(recoveryEmail, otp);
      navigate('/reset-password', { replace: true });
    } catch {
      setError('รหัส OTP ไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page compact">
      <form className="auth-card" onSubmit={(event) => void (sent ? verifyOtp(event) : sendOtp(event))}>
        <h1>ขอตั้งรหัสผ่านใหม่</h1>
        <p>สำหรับครูและผู้ปกครอง ระบบจะส่ง OTP 6 หลักไปยังอีเมลกู้คืนที่บันทึกไว้ตอนสมัคร</p>
        <label>
          อีเมลกู้คืนบัญชี
          <input name="recoveryEmail" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setSent(false); setOtp(''); setMessage(null); setError(null); }} placeholder="เช่น somchai@example.com" required readOnly={busy} />
        </label>
        {sent && <label>รหัส OTP 6 หลัก<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" required /></label>}
        {message && <div className="alert success" role="status">{message}</div>}
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="primary-button" disabled={busy || !recoveryEmail.trim() || (sent && otp.length !== 6)}>{busy ? 'กำลังตรวจสอบ...' : sent ? 'ตรวจสอบ OTP' : 'ส่ง OTP'}</button>
        {sent && <button type="button" className="text-button" onClick={() => { setSent(false); setOtp(''); setMessage(null); setError(null); }}>ขอรหัสใหม่</button>}
        <div className="auth-links"><Link to="/login">กลับไปเข้าสู่ระบบ</Link></div>
      </form>
    </main>
  );
}

/** Setting a new password for the account that is already signed in. */
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
  return <main className="auth-page compact"><form className="auth-card" onSubmit={(event) => void submit(event)}><h1>กำหนดรหัสผ่านใหม่</h1><label>รหัสผ่านใหม่<input name="password" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} required /></label><label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} required /></label>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>{message && <div className="auth-links"><Link to="/">ไปหน้าหลัก</Link></div>}</form></main>;
}

/**
 * Where an account lands when it holds no school membership yet. For a parent that is the normal
 * first minute after signing up — they belong to a school through their child, so the child panel is
 * the whole screen. Anyone else is either waiting for a school to add them or holds an invitation.
 */
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
      {/* An account created through the private owner entry carries a role this screen has no label
          for, and it needs none: it belongs to a school the moment the owner code is accepted. */}
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
      <button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
    </main>
  );
}
