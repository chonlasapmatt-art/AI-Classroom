// The one screen everybody starts from.
//
// It asks who you are first, because the three public entrances need genuinely different things: an
// admin uses the private control-room entrance with their name plus the saved account password, a teacher with their name plus the
// teacher code issued by the school, a parent with their name plus a password, and a student with a
// name and a student number. Nobody self-registers
// as a teacher or student; those accounts are prepared by the school.

import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { recall } from '../../app/deviceMemory';
import {
  isCompleteMemberLogin, memberLogin, normalizeTeacherCode, teacherLogin, type MemberAccountChoice, type MemberRole
} from './memberAccess';
import { isCompleteStudentLogin, studentLogin, type SchoolChoice } from './studentAccess';
import { Button, PasswordInput } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { ThemePicker } from '../../ui/ThemePicker';

type Who = Exclude<MemberRole, 'admin'>;

const whoLabels: Record<Who, string> = { teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };

const pills: Array<{ icon: IconName; label: string }> = [
  { icon: 'star', label: 'Local-first' },
  { icon: 'check', label: 'ปลอดภัย' },
  { icon: 'sync', label: 'Sync พร้อม' }
];

type LoginChoice = MemberAccountChoice | SchoolChoice;

export function LoginPage() {
  const auth = useAuth();
  const [search] = useSearchParams();
  /*
   * The welcome page's doors arrive here already knowing who they are.
   *
   * Anything else in the parameter is rejected: an unrecognised value returns to the public Home,
   * never to a form for a role nobody chose.
   */
  const asked = search.get('as');
  const who: Who | null = asked === 'teacher' || asked === 'student' || asked === 'parent' ? asked : null;
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [choices, setChoices] = useState<LoginChoice[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    setPassword(''); setError(null); setChoices([]); setProfileId('');
  }, [who]);

  if (auth.session) return <Navigate to="/" replace />;
  if (!who) return <Navigate to="/welcome" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (who === null || busy) return;
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
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <div className="auth-appearance"><ThemePicker /></div>
      {/*
        The panel beside the form is a calm one on purpose.
        It used to carry an orbiting particle field, a sweeping light beam and a heading that pulsed,
        all of them looping forever beside the two fields somebody is trying to read off a printed
        card and type correctly. Motion that never resolves pulls the eye back on every cycle, and on
        a school tablet it kept a compositor busy for as long as the login screen stayed open. What
        is left states what the product is and then gets out of the way — the same language the
        public Home speaks, so crossing from one to the other is not a scene change.
      */}
      <section className="auth-art">
        <div className="brand-mark">SC</div>
        <span className="eyebrow">ห้องเรียนที่ทำงานได้ แม้อินเทอร์เน็ตสะดุด</span>
        <h1>ยินดีต้อนรับสู่<br/>Smart Classroom</h1>
        <p>จัดการชั้นเรียน เช็กชื่อ คะแนน และการสื่อสารกับผู้ปกครองในระบบเดียว</p>
        <div className="auth-feature-pills" aria-label="จุดเด่นของระบบ">
          {pills.map((pill) => (
            <span key={pill.label}><Icon name={pill.icon} size={14} /> {pill.label}</span>
          ))}
        </div>
      </section>

        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <h2>เข้าสู่ระบบ{whoLabels[who]}</h2>
          <div className="login-status" role="status">
            <span className={`sync-pill ${online ? 'online' : 'offline'}`}>
              <span />{online ? 'ออนไลน์' : 'ออฟไลน์ — เข้าสู่ระบบครั้งแรกต้องออนไลน์'}
            </span>
            {lastSchool && <span className="login-school">โรงเรียนล่าสุดบนเครื่องนี้ · {lastSchool}</span>}
          </div>
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
          <Button
            variant="primary" size="lg" className="big-button" loading={busy}
            disabled={!(who === 'teacher'
              ? displayName.trim().length >= 2 && normalizeTeacherCode(password).length >= 1
              : who === 'student'
                ? isCompleteStudentLogin(displayName, password)
                : isCompleteMemberLogin(displayName, password))}
          >
            เข้าสู่ระบบ
          </Button>
          <p className="fine-print">หากเข้าระบบไม่ได้ ให้ติดต่อแอดมินเพื่อกำหนดรหัสผ่านใหม่</p>
          <Link className="text-button" to="/welcome">ย้อนกลับไปยังหน้า Home</Link>
        </form>
    </main>
  );
}
