// The one screen everybody starts from.
//
// It asks who you are first, because the three answers need genuinely different things: a teacher
// or a parent signs in with the name they are known by plus a password, and a student with a name
// and a student number. Nothing here asks for an email address, a code from an inbox, a school code
// or an invitation code — all of that lives behind the trusted gateways instead.

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { enablePreviewMode, isPreviewModeAvailable } from '../../preview/previewMode';
import {
  isCompleteMemberLogin, memberLogin, type MemberAccountChoice, type MemberRole
} from './memberAccess';

type Who = MemberRole | 'student';

const whoLabels: Record<Who, string> = { teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };
const whoIcons: Record<Who, string> = { teacher: '✎', student: '◉', parent: '♧' };

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [who, setWho] = useState<Who | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState<MemberAccountChoice[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.session) return <Navigate to="/" replace />;

  function choose(next: Who) {
    if (next === 'student') { navigate('/student'); return; }
    setWho(next); setError(null); setAccounts([]); setProfileId(''); setPassword('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (who === null || who === 'student') return;
    setBusy(true); setError(null);
    try {
      const result = await memberLogin({
        role: who, displayName, password, ...(profileId ? { profileId } : {})
      });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') {
        setAccounts(result.accounts);
        setError('มีบัญชีชื่อนี้มากกว่าหนึ่งบัญชี กรุณาเลือกโรงเรียนของคุณ');
        return;
      }
      setError(result.message);
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand-mark">SC</div>
        <span className="eyebrow">ห้องเรียนที่ทำงานได้ แม้อินเทอร์เน็ตสะดุด</span>
        <h1>ยินดีต้อนรับสู่<br/>Smart Classroom</h1>
        <p>จัดการชั้นเรียน เช็กชื่อ คะแนน และการสื่อสารกับผู้ปกครองในระบบเดียว</p>
      </section>

      {who === null ? (
        <div className="auth-card">
          <h2>คุณคือใคร?</h2>
          <p className="role-hint">เลือกหนึ่งข้อเพื่อเข้าใช้งาน</p>
          <div className="who-choice">
            {(['teacher', 'student', 'parent'] as Who[]).map((value) => (
              <button
                key={value} type="button" className="who-button"
                onClick={() => choose(value)}
              >
                <span aria-hidden="true">{whoIcons[value]}</span>
                {whoLabels[value]}
              </button>
            ))}
          </div>
          <div className="auth-links">
            <Link to="/register">ยังไม่มีบัญชี สมัครใช้งาน</Link>
            <Link to="/student">นักเรียนกดที่นี่</Link>
          </div>
          <p className="fine-print">การเข้าใช้งานครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ต</p>
          {isPreviewModeAvailable && <button type="button" className="text-button" onClick={() => { enablePreviewMode(); window.location.reload(); }}>เข้าสู่โหมด Preview (สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง)</button>}
        </div>
      ) : (
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <h2>เข้าสู่ระบบ{whoLabels[who]}</h2>
          <p className="role-hint">ใช้ชื่อกับรหัสผ่านเท่านั้น ไม่ต้องใช้อีเมล</p>
          {/* The hint sits outside the label so the field keeps its short name — a screen reader
              announces the label, then the description, rather than one long sentence. */}
          <label>
            ชื่อ
            <input
              name="displayName" autoComplete="name" value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="เช่น สมชาย ใจดี" aria-describedby="login-name-hint" required
            />
          </label>
          <p className="field-hint" id="login-name-hint">ชื่อจริงและนามสกุล แบบเดียวกับตอนสมัคร (ตัวพิมพ์เล็กใหญ่และเว้นวรรคไม่มีผล)</p>
          <label>
            รหัสผ่าน
            <input
              name="password" type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="รหัสผ่านที่ตั้งไว้ตอนสมัคร" required
            />
          </label>
          {accounts.length > 0 && (
            <label>
              โรงเรียน
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
                <option value="">เลือกโรงเรียน</option>
                {accounts.map((account) => (
                  <option key={account.profileId} value={account.profileId}>{account.schoolName}</option>
                ))}
              </select>
            </label>
          )}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="primary-button big-button" disabled={busy || !isCompleteMemberLogin(displayName, password)}>
            {busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
          <div className="auth-links">
            <Link to="/register">สมัครใช้งานครั้งแรก</Link>
            <Link to="/forgot-password">ลืมรหัสผ่าน</Link>
          </div>
          <button type="button" className="text-button" onClick={() => setWho(null)}>เปลี่ยนประเภทผู้ใช้</button>
          <p className="role-hint">นักเรียนใช้ชื่อกับเลขประจำตัว · <Link to="/student">นักเรียนกดที่นี่</Link></p>
        </form>
      )}
    </main>
  );
}
