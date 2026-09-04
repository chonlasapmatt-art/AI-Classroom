import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../app/AuthContext';
import { recall, remember } from '../app/deviceMemory';
import { isCompleteMemberLogin, memberLogin, type MemberAccountChoice } from '../features/auth/memberAccess';
import { isCloudConfigured } from '../services/supabase';
import { Badge, Button, Card, CardHeader, Field } from '../ui/components';
import { ChangelogPage } from './ChangelogPage';
import { PlatformAdminAccountsPage } from './PlatformAdminAccounts';
import { PlatformOperatorsPage } from './PlatformOperators';
import { DevicesPage, ErrorsPage, NotificationsPage, OverviewPage, PlatformSettingsPage, SecurityPage } from './PlatformPages';
import { RecoveryPage } from './PlatformRecovery';
import { SchoolsPage, SupportModeBanner } from './PlatformSchools';
import {
  bootstrapPlatformOperator, currentSupportSession, devSignIn, endSupportSession, enrollPlatformAdmin,
  isDevSignInAvailable,
  isPlatformAdmin, PlatformError,
  type ActiveSupportSession
} from './platformClient';

const sections: { to: string; label: string; end: boolean }[] = [
  { to: '/', label: 'ภาพรวม', end: true },
  { to: '/schools', label: 'โรงเรียน', end: false },
  { to: '/admins', label: 'สร้างแอดมิน', end: false },
  { to: '/operators', label: 'ผู้ดูแลแพลตฟอร์ม', end: false },
  { to: '/recovery', label: 'คีย์และการกู้บัญชี', end: false },
  { to: '/errors', label: 'ศูนย์ข้อผิดพลาด', end: false },
  { to: '/notifications', label: 'ศูนย์แจ้งเตือน', end: false },
  { to: '/devices', label: 'ศูนย์อุปกรณ์', end: false },
  { to: '/changelog', label: 'บันทึกการเปลี่ยนแปลง', end: false },
  { to: '/security', label: 'ความปลอดภัยและบันทึก', end: false },
  { to: '/platform', label: 'Flags และ Releases', end: false }
];

const PLATFORM_OPERATOR_DEVICE_KEY = 'platform-operator-name-saved';

/**
 * The first operator of a deployment that has none.
 *
 * Offered only after the server has said `PLATFORM_NO_OPERATOR`, which means the code was right and
 * there is simply nobody for it to sign in as. Until this existed that message was a dead end: the
 * enrolment screen needs a session, the only door signs you in as an operator who already exists,
 * and nothing could make the first one. The account this creates belongs to no school, which is
 * what keeps a platform operator and a school's administrator two different people.
 */
function BootstrapOperator({ accessCode, onCreated }: { accessCode: string; onCreated(): void }) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = displayName.trim().length < 2 ? 'กรอกชื่อผู้ดูแลอย่างน้อย 2 ตัวอักษร'
    : password.length < 12 ? 'รหัสผ่านอย่างน้อย 12 ตัวอักษร'
      : password !== confirm ? 'รหัสผ่านสองช่องยังไม่ตรงกัน' : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await bootstrapPlatformOperator({ accessCode, displayName: displayName.trim(), password });
      onCreated();
    } catch (reason) {
      setError(reason instanceof PlatformError ? reason.message : 'ตั้งผู้ดูแลคนแรกไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <form className="platform-gate-card platform-bootstrap" onSubmit={(event) => void submit(event)}>
      <header className="platform-gate-head">
        <Badge tone="info">ตั้งค่าครั้งแรก</Badge>
        <h2>สร้างผู้ดูแลแพลตฟอร์มคนแรก</h2>
        <p>
          รหัสสิทธิ์ถูกต้องแล้ว แต่ยังไม่มีผู้ดูแลแพลตฟอร์มให้เข้าใช้งาน
          บัญชีที่สร้างนี้จะ<strong>ไม่สังกัดโรงเรียนใด</strong> และเข้าใช้ได้เฉพาะศูนย์ปฏิบัติการเท่านั้น
        </p>
      </header>

      <Field label="ชื่อผู้ดูแล" hint="ชื่อนี้จะปรากฏในบันทึกความปลอดภัยทุกครั้งที่ทำรายการ">
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น ทีมปฏิบัติการ" required />
      </Field>
      <Field label="รหัสผ่านบัญชีผู้ดูแล" hint="อย่างน้อย 12 ตัวอักษร · บัญชีนี้เห็นทุกโรงเรียน จึงยาวกว่ารหัสผ่านทั่วไป">
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <Field label="พิมพ์รหัสผ่านอีกครั้ง">
        <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      </Field>

      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="platform-gate-actions">
        <Button variant="primary" size="lg" loading={busy} disabled={Boolean(problem)}>สร้างผู้ดูแลคนแรก</Button>
        {problem && <span className="ui-field-hint">{problem}</span>}
      </div>
      <p className="platform-gate-foot">
        ทางลัดนี้ปิดตัวเองทันทีที่มีผู้ดูแลคนแรก · หลังสร้างเสร็จให้เข้าใช้งานด้วยรหัสสิทธิ์ตามปกติ
      </p>
    </form>
  );
}

/** The development door, kept available only when the deployment explicitly opts into it. */
function DevSignIn() {
  const auth = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [needsDisplayName, setNeedsDisplayName] = useState(
    () => recall(PLATFORM_OPERATOR_DEVICE_KEY) !== 'true'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only after the server says the code was right and there is nobody to sign in as. Offering it
  // before that would be an account-creation form guarded by nothing.
  const [noOperator, setNoOperator] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await auth.applySession(await devSignIn(accessCode, needsDisplayName ? displayName : undefined));
      remember(PLATFORM_OPERATOR_DEVICE_KEY, 'true');
    } catch (reason) {
      if (reason instanceof PlatformError && reason.code === 'PLATFORM_DISPLAY_NAME_REQUIRED') {
        setNeedsDisplayName(true);
      }
      if (reason instanceof PlatformError && reason.code === 'PLATFORM_NO_OPERATOR') setNoOperator(true);
      setError(reason instanceof PlatformError ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (noOperator && !created) {
    return <BootstrapOperator accessCode={accessCode} onCreated={() => { setCreated(true); setNoOperator(false); setError(null); }} />;
  }

  /*
   * The code is short, so the button says why it is not ready yet.
   *
   * A primary button greyed to 45% with nothing beside it reads as broken rather than as waiting,
   * and this is the only control on the only door into the console.
   */
  const missing = needsDisplayName && displayName.trim().length < 1
    ? 'กรอกชื่อผู้ดูแลก่อน'
    : accessCode.length < 4 ? 'กรอกรหัสสิทธิ์ก่อน' : null;

  return (
    <form className="platform-gate-card" onSubmit={(event) => void submit(event)}>
      <header className="platform-gate-head">
        <Badge tone="warning">DEVELOPMENT ONLY</Badge>
        <h1>เข้าสู่ศูนย์ปฏิบัติการ</h1>
        <p>
          ศูนย์นี้ดูแลทุกโรงเรียนบนแพลตฟอร์ม จึงเข้าได้ด้วยรหัสสิทธิ์ที่ตั้งไว้ฝั่งเซิร์ฟเวอร์เท่านั้น
          — ไม่ใช่รหัสผ่านของบัญชีใด และการเข้าทางนี้ไม่สร้างบัญชีใหม่
        </p>
      </header>

      {needsDisplayName ? (
        <Field label="ชื่อผู้ดูแล" hint="ตั้งได้ตามต้องการ · บันทึกไว้กับผู้ดูแลที่มีอยู่แล้ว ไม่ใช่การสร้างบัญชี">
          <input
            autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)}
            placeholder="เช่น ทีมปฏิบัติการ" required
          />
        </Field>
      ) : (
        <p className="ui-field-hint">เครื่องนี้เคยบันทึกชื่อผู้ดูแลแล้ว ระบบจะใช้ชื่อเดิมจากเซิร์ฟเวอร์</p>
      )}

      <Field label="รหัสสิทธิ์" hint="ตรวจสอบที่เซิร์ฟเวอร์ และจำกัดไว้ 5 ครั้งต่อ 15 นาทีต่อเครื่อง">
        <input
          type="password" autoComplete="one-time-code" value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="รหัสที่ตั้งไว้ตอนติดตั้งระบบ" required
        />
      </Field>

      {created && (
        <div className="alert success" role="status">
          สร้างผู้ดูแลคนแรกแล้ว · กรอกรหัสสิทธิ์อีกครั้งเพื่อเข้าใช้งาน
        </div>
      )}
      {error && !created && <div className="alert error" role="alert">{error}</div>}

      <div className="platform-gate-actions">
        <Button variant="primary" size="lg" loading={busy} disabled={Boolean(missing)}>เข้าใช้งาน</Button>
        {missing && <span className="ui-field-hint">{missing}</span>}
      </div>

      <p className="platform-gate-foot">
        ทุกครั้งที่เข้าทางนี้ถูกบันทึกไว้ในบันทึกความปลอดภัยของแพลตฟอร์ม พร้อมชื่อผู้ดูแลที่ใช้เข้า
      </p>
    </form>
  );
}

/**
 * Production entry: sign in with the existing administrator account, then let the server decide
 * whether that account is a platform operator. Authentication and platform authority are separate;
 * a successful password check alone never opens the console.
 */
// Kept exported for compatibility with older integration fixtures; PlatformGate intentionally never
// renders this password-based entry anymore.
export function OperatorSignIn() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState<MemberAccountChoice[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await memberLogin({ role: 'admin', displayName, password, ...(profileId ? { profileId } : {}) });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') {
        setAccounts(result.accounts);
        setError('มีบัญชีแอดมินชื่อนี้มากกว่าหนึ่งโรงเรียน กรุณาเลือกโรงเรียน');
      } else setError(result.message);
    } finally { setBusy(false); }
  }

  return (
    <main className="setup-page">
      <form className="configuration-card" onSubmit={(event) => void submit(event)}>
        <span className="eyebrow">PLATFORM OPERATIONS</span>
        <h1>เข้าสู่ Super Admin</h1>
        <p>ใช้ชื่อและรหัสผ่านของบัญชีแอดมินที่มีอยู่แล้ว ระบบจะตรวจสิทธิ์ผู้ดูแลแพลตฟอร์มจากเซิร์ฟเวอร์</p>
        <Field label="ชื่อแอดมิน">
          <input autoComplete="username" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="ชื่อที่แอดมินกำหนดไว้" required />
        </Field>
        <Field label="รหัสผ่าน">
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="รหัสผ่านแอดมิน" required />
        </Field>
        {accounts.length > 0 && (
          <Field label="โรงเรียน">
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
              <option value="">เลือกโรงเรียน</option>
              {accounts.map((account) => <option key={account.profileId} value={account.profileId}>{account.schoolName}</option>)}
            </select>
          </Field>
        )}
        {error && <div className="alert error" role="alert">{error}</div>}
        <Button variant="primary" loading={busy} disabled={!isCompleteMemberLogin(displayName, password)}>เข้าสู่ระบบ</Button>
        <p className="fine-print">บัญชีทั่วไปจะเข้าสู่ศูนย์นี้ไม่ได้ แม้มีชื่อและรหัสผ่านถูกต้อง</p>
      </form>
      {isDevSignInAvailable && <DevSignIn />}
    </main>
  );
}

/**
 * The screen a signed-in account with no platform authority sees.
 *
 * It offers enrolment rather than a dead end, because the first operator of a new deployment has to
 * become one somehow — and the code they need is held in the server environment, so offering the box
 * gives nothing away to somebody who does not have it.
 */
function EnrolmentScreen({ onEnrolled }: { onEnrolled(): void }) {
  const auth = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await enrollPlatformAdmin({ accessCode, displayName });
      onEnrolled();
    } catch (reason) {
      setError(reason instanceof PlatformError ? reason.message : 'ยืนยันสิทธิ์ไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <main className="setup-page">
      <form className="configuration-card" onSubmit={(event) => void submit(event)}>
        <span className="eyebrow">PLATFORM OPERATIONS</span>
        <h1>ยืนยันสิทธิ์ผู้ดูแลแพลตฟอร์ม</h1>
        <p>บัญชีนี้ยังไม่มีสิทธิ์ระดับแพลตฟอร์ม กรอกรหัสที่ตั้งไว้ฝั่งเซิร์ฟเวอร์ตอนติดตั้ง</p>
        <Field label="ชื่อที่แสดง">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น ทีมปฏิบัติการ" />
        </Field>
        <Field label="รหัสยืนยันแพลตฟอร์ม" hint="ไม่ใช่รหัสผ่านของบัญชีนี้ · ตรวจสอบและจำกัดความถี่ที่เซิร์ฟเวอร์">
          <input type="password" autoComplete="one-time-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required />
        </Field>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Button variant="primary" loading={busy}>ยืนยันสิทธิ์</Button>
        <button type="button" className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
      </form>
    </main>
  );
}

function OperationsShell() {
  const auth = useAuth();
  const [support, setSupport] = useState<ActiveSupportSession | null>(null);

  const refreshSupport = useCallback(async () => {
    try {
      const current = await currentSupportSession();
      setSupport(current.active ? current : null);
    } catch { setSupport(null); }
  }, []);

  useEffect(() => {
    void refreshSupport();
    // The server decides when a session ends, so the console asks again periodically rather than
    // trusting its own copy of the expiry.
    const timer = window.setInterval(() => void refreshSupport(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshSupport]);

  return (
    <div className="platform-frame">
      <header className="platform-topbar">
        <div className="platform-brand">
          <span className="brand-mark small">SC</span>
          <div><strong>Operations Center</strong><span>Smart Classroom Platform</span></div>
        </div>
        <nav aria-label="เมนูศูนย์ปฏิบัติการ">
          {sections.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end}>{section.label}</NavLink>
          ))}
        </nav>
        <button type="button" className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
      </header>

      {support && (
        <SupportModeBanner
          session={support}
          onLeave={() => void endSupportSession().then(refreshSupport)}
        />
      )}

      <main className="platform-content">
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="schools" element={<SchoolsPage />} />
          <Route path="admins" element={<PlatformAdminAccountsPage />} />
          <Route path="operators" element={<PlatformOperatorsPage />} />
          <Route path="recovery" element={<RecoveryPage />} />
          <Route path="errors" element={<ErrorsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="changelog" element={<ChangelogPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="platform" element={<PlatformSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function PlatformGate() {
  const auth = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    if (!auth.session) { setAllowed(null); return; }
    setAllowed(await isPlatformAdmin());
  }, [auth.session]);

  useEffect(() => { void check(); }, [check]);

  if (auth.loading) return <main className="center-state"><div className="spinner" /><p>กำลังตรวจสอบสิทธิ์...</p></main>;
  // The platform has one deliberate entry door: the server-checked platform access code. The
  // ordinary school-admin password form remains an unreachable compatibility component for older
  // tests/build references, but is no longer rendered or offered to users here.
  if (!auth.session) {
    if (!isDevSignInAvailable) {
      return (
        <main className="setup-page">
          <Card>
            <CardHeader title="ยังไม่เปิดทางเข้า Super Admin" description="ระบบนี้เปิดเฉพาะการเข้าสู่ระบบด้วยรหัสสิทธิ์จากเซิร์ฟเวอร์" />
            <p className="field-hint">กรุณาเปิด PLATFORM_DEV_SIGN_IN และตั้งค่ารหัสสิทธิ์บน Supabase ก่อน</p>
          </Card>
        </main>
      );
    }
    return <main className="setup-page"><DevSignIn /></main>;
  }
  if (allowed === null) return <main className="center-state"><div className="spinner" /><p>กำลังตรวจสอบสิทธิ์...</p></main>;
  if (!allowed) return <EnrolmentScreen onEnrolled={() => void check()} />;
  return <OperationsShell />;
}

export function PlatformApp() {
  if (!isCloudConfigured) {
    return (
      <main className="setup-page">
        <Card>
          <CardHeader
            title="ยังไม่ได้ตั้งค่าการเชื่อมต่อ"
            description="ศูนย์ปฏิบัติการทำงานกับข้อมูลจริงเท่านั้น ไม่มีโหมดตัวอย่าง"
          />
          <p className="field-hint">ตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY แล้วเปิดหน้านี้ใหม่</p>
        </Card>
      </main>
    );
  }
  return <AuthProvider><PlatformGate /></AuthProvider>;
}
