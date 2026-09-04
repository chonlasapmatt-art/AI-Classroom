// The one screen everybody starts from.
//
// It asks who you are first, because the three public entrances need genuinely different things: an
// admin uses the private control-room entrance with their name plus the saved account password, a teacher with their name plus the
// teacher code issued by the school, a parent with their name plus a password, and a student with a
// name and a student number. Nobody self-registers
// as a teacher or student; those accounts are prepared by the school.

import { useEffect, useState, type FormEvent, type PointerEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { recall } from '../../app/deviceMemory';
import { useTheme } from '../../app/ThemeContext';
import { themeModes, themePresets, type ThemeMode, type ThemePreset } from '../../app/theme';
import { enablePreviewMode, isPreviewModeAvailable } from '../../preview/previewMode';
import {
  isCompleteMemberLogin, memberLogin, normalizeTeacherCode, teacherLogin, type MemberAccountChoice, type MemberRole
} from './memberAccess';
import { isCompleteStudentLogin, studentLogin, type SchoolChoice } from './studentAccess';
import { PasswordInput } from '../../ui/components';

type Who = Exclude<MemberRole, 'admin'>;

const whoLabels: Record<Who, string> = { teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };
const whoIcons: Record<Who, string> = { teacher: '✎', student: '◉', parent: '♧' };

type LoginChoice = MemberAccountChoice | SchoolChoice;

export function LoginPage() {
  const auth = useAuth();
  const { mode, preset, motion, setMode, setPreset, setMotion } = useTheme();
  const [who, setWho] = useState<Who | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [choices, setChoices] = useState<LoginChoice[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const lastSchool = recall('last-school-name');

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (auth.session) return <Navigate to="/" replace />;

  function choose(next: Who) {
    setWho(next); setError(null); setChoices([]); setProfileId(''); setPassword('');
  }

  function moveHero(event: PointerEvent<HTMLElement>) {
    if (motion === 'reduced') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty('--auth-pointer-x', `${x * 14}px`);
    event.currentTarget.style.setProperty('--auth-pointer-y', `${y * 10}px`);
    event.currentTarget.style.setProperty('--auth-pointer-x-soft', `${x * 6}px`);
    event.currentTarget.style.setProperty('--auth-pointer-y-soft', `${y * 5}px`);
    event.currentTarget.style.setProperty('--auth-pointer-x-focus', `${x * 4}px`);
    event.currentTarget.style.setProperty('--auth-pointer-y-focus', `${y * 3}px`);
  }

  function resetHero(event: PointerEvent<HTMLElement>) {
    for (const name of ['--auth-pointer-x', '--auth-pointer-y', '--auth-pointer-x-soft', '--auth-pointer-y-soft', '--auth-pointer-x-focus', '--auth-pointer-y-focus']) {
      event.currentTarget.style.setProperty(name, '0px');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (who === null) return;
    setBusy(true); setError(null);
    try {
      if (who === 'teacher') {
        const result = await teacherLogin({
          displayName,
          teacherCode: password,
          ...(profileId ? { teacherId: profileId } : {})
        });
        if (result.outcome === 'session') { await auth.applySession(result.session); return; }
        if (result.outcome === 'account-required') {
          setChoices(result.accounts);
          setError('มีครูชื่อนี้และรหัสนี้มากกว่าหนึ่งโรงเรียน กรุณาเลือกโรงเรียนของคุณ');
          return;
        }
        setError(result.message);
        return;
      }

      if (who === 'student') {
        const result = await studentLogin({
          displayName,
          studentCode: password,
          ...(profileId ? { schoolId: profileId } : {})
        });
        if (result.outcome === 'session') { await auth.applyStudentSession(result.session); return; }
        if (result.outcome === 'school-required') {
          setChoices(result.schools);
          setError('มีนักเรียนชื่อนี้และเลขประจำตัวนี้มากกว่าหนึ่งโรงเรียน กรุณาเลือกโรงเรียนของคุณ');
          return;
        }
        setError(result.message);
        return;
      }

      const result = await memberLogin({ role: 'parent', displayName, password, ...(profileId ? { profileId } : {}) });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') {
        setChoices(result.accounts);
        setError('มีบัญชีชื่อนี้มากกว่าหนึ่งบัญชี กรุณาเลือกโรงเรียนของคุณ');
        return;
      }
      setError(result.message);
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <div className={`auth-appearance ${showAppearance ? 'open' : ''}`}>
        <button
          type="button"
          className="auth-appearance-trigger"
          aria-expanded={showAppearance}
          aria-controls="auth-appearance-panel"
          onClick={() => setShowAppearance((value) => !value)}
        >
          <span aria-hidden="true">✦</span>
          ปรับบรรยากาศ
          <span className="auth-appearance-chevron" aria-hidden="true">{showAppearance ? '⌃' : '⌄'}</span>
        </button>
        {showAppearance && (
          <div className="auth-appearance-panel" id="auth-appearance-panel">
            <div className="auth-appearance-heading">
              <div><strong>สไตล์ของคุณ</strong><span>เปลี่ยนได้ทันทีและบันทึกอัตโนมัติ</span></div>
              <span className="auth-live-dot" aria-hidden="true" />
            </div>
            <div className="auth-preset-list" aria-label="เลือกโทนสี">
              {themePresets.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`auth-preset ${preset === item.value ? 'selected' : ''}`}
                  onClick={() => setPreset(item.value as ThemePreset)}
                  aria-label={`ใช้โทนสี ${item.label}`}
                  aria-pressed={preset === item.value}
                >
                  <span className="auth-preset-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                  <span>{item.label}</span>
                  {preset === item.value && <span className="auth-preset-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
            <div className="auth-appearance-actions">
              <label className="auth-appearance-select">
                <span>หน้าจอ</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as ThemeMode)}>
                  {themeModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <button
                type="button"
                className={`auth-motion-toggle ${motion === 'full' ? 'active' : ''}`}
                onClick={() => setMotion(motion === 'full' ? 'reduced' : 'full')}
                aria-pressed={motion === 'full'}
              >
                <span aria-hidden="true">{motion === 'full' ? '◌' : '◍'}</span>
                {motion === 'full' ? 'เปิด motion' : 'ลด motion'}
              </button>
            </div>
          </div>
        )}
      </div>
      <section className="auth-art" onPointerMove={moveHero} onPointerLeave={resetHero}>
        <div className="auth-art-grid" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <div className="auth-particle-field" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="auth-light-beam" aria-hidden="true" />
        <div className="brand-mark">SC</div>
        <span className="eyebrow">ห้องเรียนที่ทำงานได้ แม้อินเทอร์เน็ตสะดุด</span>
        <h1>ยินดีต้อนรับสู่<br/>Smart Classroom</h1>
        <p>จัดการชั้นเรียน เช็กชื่อ คะแนน และการสื่อสารกับผู้ปกครองในระบบเดียว</p>
        <div className="auth-feature-pills" aria-label="จุดเด่นของระบบ">
          <span><i aria-hidden="true">✦</i> Local-first</span>
          <span><i aria-hidden="true">✓</i> ปลอดภัย</span>
          <span><i aria-hidden="true">↗</i> Sync พร้อม</span>
        </div>
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
          {/* What this device is pointed at, before anybody types anything. On a shared tablet the
              school name is the difference between signing in and wondering why the roster is
              somebody else's; the connection state is why a correct password can still be refused. */}
          <div className="login-status" role="status">
            <span className={`sync-pill ${online ? 'online' : 'offline'}`}>
              <span />{online ? 'ออนไลน์' : 'ออฟไลน์ — เข้าสู่ระบบครั้งแรกต้องออนไลน์'}
            </span>
            {lastSchool && <span className="login-school">โรงเรียนล่าสุดบนเครื่องนี้ · {lastSchool}</span>}
          </div>
          <p className="fine-print">บัญชีทั้งหมดสร้างและกำหนดรหัสผ่านโดยแอดมินโรงเรียน</p>
          <p className="fine-print">การเข้าใช้งานครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ต</p>
          <Link className="text-button login-admin-link" to="/admin-access">เข้าสู่ระบบผู้ดูแลโรงเรียน</Link>
          {/* The platform console is a different product with a different door. It is named, not
              hidden — hiding it only means the operator types the URL from memory — and it sits last
              because a teacher who lands here should never think it is one of their choices. */}
          <a className="text-button login-platform-link" href="/platform/">เข้าสู่ Platform Console (ผู้ดูแลระบบส่วนกลาง)</a>
          {isPreviewModeAvailable && <button type="button" className="text-button" onClick={() => { enablePreviewMode(); window.location.reload(); }}>เข้าสู่โหมด Preview (สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง)</button>}
        </div>
      ) : (
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <h2>เข้าสู่ระบบ{whoLabels[who]}</h2>
          <p className="role-hint">
            {who === 'teacher' ? 'ใช้ชื่อและรหัสครูที่แอดมินโรงเรียนบันทึกให้' :
              who === 'student' ? 'ใช้ชื่อและเลขประจำตัวที่โรงเรียนบันทึกให้' :
                'ใช้ชื่อและรหัสผ่านที่แอดมินโรงเรียนสร้างให้'}
          </p>
          {/* The hint sits outside the label so the field keeps its short name — a screen reader
              announces the label, then the description, rather than one long sentence. */}
          <label>
            {who === 'teacher' ? 'ชื่อครู' : who === 'student' ? 'ชื่อนักเรียน' : 'ชื่อผู้ปกครอง'}
            <input
              name="displayName" autoComplete="name" value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="เช่น สมชาย ใจดี" aria-describedby="login-name-hint" required
            />
          </label>
          <p className="field-hint" id="login-name-hint">ใช้ชื่อเดียวกับที่แอดมินบันทึกไว้ (ตัวพิมพ์เล็กใหญ่และเว้นวรรคไม่มีผล)</p>
          <label>
            {who === 'teacher' ? 'รหัสครู' : who === 'student' ? 'เลขประจำตัวนักเรียน' : 'รหัสผ่าน'}
            {/* A teacher code and a student number are not secrets — they are read off a printout
                and typed, so masking them would only hide the typo. Only a parent's password is
                masked, and that one gets the reveal. */}
            {who === 'parent' ? (
              <PasswordInput
                name="password" value={password} onChange={setPassword}
                autoComplete="current-password" placeholder="รหัสผ่านของคุณ" required
              />
            ) : (
              <input
                name={who === 'teacher' ? 'teacherCode' : 'studentCode'}
                type="text" autoComplete="off" value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={who === 'teacher' ? 'เช่น SC-001' : 'เช่น 00001'} required
              />
            )}
          </label>
          <p className="field-hint">
            {who === 'teacher' ? 'ใช้รหัสครูที่แอดมินบันทึกไว้ ไม่ใช่รหัสผ่าน' :
              who === 'student' ? 'ใช้เลขประจำตัวนักเรียนที่ครูบันทึกไว้' :
                'ใช้รหัสผ่านของคุณที่แอดมินสร้างให้'}
          </p>
          {choices.length > 0 && (
            <label>
              โรงเรียน
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
                <option value="">เลือกโรงเรียน</option>
                {choices.map((choice) => (
                  <option
                    key={'profileId' in choice ? choice.profileId : choice.schoolId}
                    value={'profileId' in choice ? choice.profileId : choice.schoolId}
                  >
                    {'schoolName' in choice ? choice.schoolName : choice.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button
            className="primary-button big-button"
            disabled={busy || !(who === 'teacher'
              ? displayName.trim().length >= 2 && normalizeTeacherCode(password).length >= 1
              : who === 'student'
                ? isCompleteStudentLogin(displayName, password)
                : isCompleteMemberLogin(displayName, password))}
          >
            {busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
          <p className="fine-print">หากเข้าระบบไม่ได้ ให้ติดต่อแอดมินเพื่อกำหนดรหัสผ่านใหม่</p>
          <button type="button" className="text-button" onClick={() => setWho(null)}>เปลี่ยนประเภทผู้ใช้</button>
        </form>
      )}
    </main>
  );
}
