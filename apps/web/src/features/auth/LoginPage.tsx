import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { enablePreviewMode, isPreviewModeAvailable } from '../../preview/previewMode';

type LoginMode = 'otp' | 'password';

export function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<LoginMode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === 'password') {
        await auth.signIn(email, password);
      } else if (!otpSent) {
        await auth.sendEmailOtp(email);
        setOtpSent(true);
        setMessage('ส่งอีเมลแล้ว กดปุ่มในอีเมลเพื่อเข้าเว็บได้ทันที หรือกรอกรหัส 6 หลักด้านล่าง');
      } else {
        await auth.verifyEmailOtp(email, otp);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  function chooseMode(next: LoginMode) {
    setMode(next); setError(null); setMessage(null); setOtpSent(false); setOtp('');
  }

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand-mark">SC</div>
        <span className="eyebrow">ห้องเรียนที่ทำงานได้ แม้อินเทอร์เน็ตสะดุด</span>
        <h1>ยินดีต้อนรับสู่<br/>Smart Classroom</h1>
        <p>จัดการชั้นเรียน เช็กชื่อ คะแนน และการสื่อสารกับผู้ปกครองในระบบเดียว</p>
      </section>
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h2>เข้าสู่ระบบ</h2>
        {/* Students authenticate with a name and a student number instead of an email, so the very
            first choice on this screen sends them to their own entrance rather than making them
            work out that none of the fields below apply to them. */}
        <p className="role-hint">
          สำหรับครูและผู้ปกครอง · <Link to="/student">นักเรียนกดที่นี่</Link>
        </p>
        <div className="auth-mode-tabs" role="tablist" aria-label="วิธีเข้าสู่ระบบ">
          <button type="button" role="tab" aria-selected={mode === 'otp'} className={mode === 'otp' ? 'active' : ''} onClick={() => chooseMode('otp')}>รหัสจากอีเมล</button>
          <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => chooseMode('password')}>รหัสผ่าน</button>
        </div>
        <label>อีเมล<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} readOnly={mode === 'otp' && otpSent} required /></label>
        {mode === 'password' ? (
          <label>รหัสผ่าน<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        ) : otpSent ? (
          <label>รหัสยืนยัน 6 หลัก<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required /></label>
        ) : (
          <p className="hint">ระบบจะส่งอีเมลที่มีทั้งปุ่มเข้าสู่เว็บและรหัส OTP 6 หลัก</p>
        )}
        {error && <div className="alert error" role="alert">{error}<br/><small>ตรวจสอบข้อมูลหรือการเชื่อมต่อแล้วลองอีกครั้ง</small></div>}
        {message && <div className="alert success" role="status">{message}</div>}
        <button className="primary-button" disabled={busy || (mode === 'otp' && otpSent && otp.length !== 6)}>
          {busy ? 'กำลังตรวจสอบ...' : mode === 'password' ? 'เข้าสู่ระบบ' : otpSent ? 'ยืนยันรหัส 6 หลัก' : 'ส่งรหัสเข้าอีเมล'}
        </button>
        {mode === 'otp' && otpSent && <button type="button" className="text-button" onClick={() => { setOtpSent(false); setOtp(''); setMessage(null); }}>เปลี่ยนอีเมลหรือส่งใหม่</button>}
        <div className="auth-links"><Link to="/register">สร้างบัญชีใหม่</Link><Link to="/forgot-password">ลืมรหัสผ่าน</Link></div>
        <p className="fine-print">การเข้าใช้งานครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ต</p>
        {isPreviewModeAvailable && <button type="button" className="text-button" onClick={() => { enablePreviewMode(); window.location.reload(); }}>เข้าสู่โหมด Preview (สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง)</button>}
      </form>
    </main>
  );
}
