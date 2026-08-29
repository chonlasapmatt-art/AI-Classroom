import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { enablePreviewMode, isPreviewModeAvailable } from '../../preview/previewMode';

export function LoginPage() {
  const auth = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (auth.session) return <Navigate to="/" replace />;
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await auth.signIn(email, password); } catch (reason) { setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ'); } finally { setBusy(false); } }
  return <main className="auth-page"><section className="auth-art"><div className="brand-mark">SC</div><span className="eyebrow">ห้องเรียนที่ทำงานได้ แม้อินเทอร์เน็ตสะดุด</span><h1>ยินดีต้อนรับสู่<br/>Smart Classroom</h1><p>จัดการชั้นเรียน เช็กชื่อ คะแนน และการสื่อสารกับผู้ปกครองในระบบเดียว</p></section><form className="auth-card" onSubmit={submit}><h2>เข้าสู่ระบบ</h2><p>ใช้บัญชีที่ผู้ดูแลโรงเรียนสร้างให้</p><label>อีเมล<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>รหัสผ่าน<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <div className="alert error" role="alert">{error}<br/><small>ตรวจสอบข้อมูลหรือการเชื่อมต่อแล้วลองอีกครั้ง</small></div>}<button className="primary-button" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button><p className="fine-print">การเข้าใช้งานครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ต</p>{isPreviewModeAvailable && <button type="button" className="text-button" onClick={() => { enablePreviewMode(); window.location.reload(); }}>เข้าสู่โหมด Preview (สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง)</button>}</form></main>;
}
