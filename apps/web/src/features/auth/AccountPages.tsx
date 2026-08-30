import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';
import { ChildLinkPanel } from '../parents/ChildLinkPanel';
import { searchSchools, type SchoolChoice } from './studentAccess';
import {
  isCompleteMemberRegistration, MEMBER_PASSWORD_MINIMUM, registerParent, registerTeacher,
  requestMemberPasswordReset, type MemberRole
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
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolId, setSchoolId] = useState('');
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
        ? await registerTeacher({ firstName, lastName, schoolId, password })
        : await registerParent({ firstName, lastName, password });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') { setError('มีบัญชีชื่อนี้อยู่แล้ว กรุณาเข้าสู่ระบบแทน'); return; }
      setError(result.message);
    } finally { setBusy(false); }
  }

  const complete = role !== null && isCompleteMemberRegistration({
    firstName, lastName, password, confirmPassword,
    ...(role === 'teacher' ? { schoolId } : {})
  });

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand-mark">SC</div>
        <span className="eyebrow">เริ่มต้นใช้งาน</span>
        <h1>สมัครใช้งาน<br/>Smart Classroom</h1>
        <p>ใช้ชื่อจริงกับรหัสผ่าน ไม่ต้องใช้อีเมล ไม่ต้องรออนุมัติ</p>
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
          <div className="form-grid">
            <label>ชื่อจริง<input name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} minLength={1} required /></label>
            <label>นามสกุล<input name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} minLength={1} required /></label>
          </div>
          {role === 'teacher' && (
            <>
              <label>
                โรงเรียน
                <input
                  name="school" value={schoolQuery} placeholder="พิมพ์ชื่อโรงเรียน"
                  onChange={(event) => { setSchoolQuery(event.target.value); setSchoolId(''); }}
                  required
                />
              </label>
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
              {schoolId && <p className="fine-print">เลือกโรงเรียนแล้ว · เริ่มใช้งานได้ทันทีหลังสมัคร</p>}
            </>
          )}
          <label>รหัสผ่าน<input name="password" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autoComplete="new-password" minLength={MEMBER_PASSWORD_MINIMUM} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {role === 'parent' && <p className="hint">เพิ่มลูกได้หลังเข้าสู่ระบบ โดยกรอกแค่ชื่อจริงของลูก</p>}
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

/**
 * Recovery without an inbox. The person says who they are, and the request goes to the school staff
 * who already run that school; they set a new password. The old one is never read back, and this
 * screen answers the same way whether or not that name has an account.
 */
export function ForgotPasswordPage() {
  const [role, setRole] = useState<MemberRole>('teacher');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      await requestMemberPasswordReset({ role, displayName });
      setMessage('ส่งคำขอตั้งรหัสผ่านใหม่แล้ว กรุณาติดต่อคุณครูหรือเจ้าหน้าที่ของโรงเรียนเพื่อรับรหัสผ่านใหม่');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page compact">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h1>ขอตั้งรหัสผ่านใหม่</h1>
        <p>ระบบจะไม่บอกรหัสผ่านเดิม แต่จะให้โรงเรียนตั้งรหัสผ่านใหม่ให้</p>
        <fieldset className="role-choice">
          <legend>ฉันเป็น</legend>
          {(['teacher', 'parent'] as MemberRole[]).map((value) => (
            <label key={value}>
              <input type="radio" name="role" checked={role === value} onChange={() => setRole(value)} />
              {roleLabels[value]}
            </label>
          ))}
        </fieldset>
        <label>ชื่อ<input name="displayName" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} required /></label>
        {message && <div className="alert success" role="status">{message}</div>}
        <button className="primary-button" disabled={busy || displayName.trim().length < 2}>{busy ? 'กำลังส่ง...' : 'ส่งคำขอ'}</button>
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
