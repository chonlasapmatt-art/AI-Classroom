import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../app/AuthContext';
import { isCloudConfigured } from '../services/supabase';
import { Button, Card, CardHeader, Field } from '../ui/components';
import { ChangelogPage } from './ChangelogPage';
import { DevicesPage, ErrorsPage, NotificationsPage, OverviewPage, PlatformSettingsPage, SecurityPage } from './PlatformPages';
import { SchoolsPage, SupportModeBanner } from './PlatformSchools';
import {
  currentSupportSession, devSignIn, endSupportSession, enrollPlatformAdmin, isDevSignInAvailable,
  isPlatformAdmin, PlatformError,
  type ActiveSupportSession
} from './platformClient';

const sections: { to: string; label: string; end: boolean }[] = [
  { to: '/', label: 'ภาพรวม', end: true },
  { to: '/schools', label: 'โรงเรียน', end: false },
  { to: '/errors', label: 'ศูนย์ข้อผิดพลาด', end: false },
  { to: '/notifications', label: 'ศูนย์แจ้งเตือน', end: false },
  { to: '/devices', label: 'ศูนย์อุปกรณ์', end: false },
  { to: '/changelog', label: 'บันทึกการเปลี่ยนแปลง', end: false },
  { to: '/security', label: 'ความปลอดภัยและบันทึก', end: false },
  { to: '/platform', label: 'Flags และ Releases', end: false }
];

/**
 * The development door: the platform code plus the display name to save for the operator.
 *
 * It is shown only in a development build, and it only works against a server that was separately
 * opted in — the endpoint behind it is its own deployable that a production project does not deploy.
 * The card says all of that on its face, because a shortcut that looks like a normal way in is how
 * a shortcut ends up in production.
 */
function DevSignIn() {
  const auth = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await auth.applySession(await devSignIn(accessCode, displayName));
    } catch (reason) {
      setError(reason instanceof PlatformError ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <form className="configuration-card dev-sign-in" onSubmit={(event) => void submit(event)}>
      <span className="eyebrow">DEVELOPMENT ONLY</span>
      <h2>เข้าด้วยรหัสสิทธิ์อย่างเดียว</h2>
      <p className="field-hint">
        ทางลัดสำหรับเครื่องนักพัฒนา ใช้ได้เฉพาะเซิร์ฟเวอร์ที่เปิด PLATFORM_DEV_SIGN_IN ไว้
        ชื่อที่กรอกจะถูกบันทึกเป็นชื่อแสดงของผู้ดูแลแพลตฟอร์มที่มีอยู่แล้ว ไม่สร้างบัญชีและไม่เพิ่มสิทธิ์ให้ใคร
      </p>
      <Field label="ชื่อผู้ดูแล" hint="ตั้งชื่อได้ตามต้องการ และระบบจะบันทึกไว้ในบัญชี">
        <input
          autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)}
          placeholder="เช่น ผู้ดูแลระบบ Smart Classroom" required
        />
      </Field>
      <Field label="รหัสสิทธิ์">
        <input
          type="password" autoComplete="one-time-code" value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="รหัสเดียวกับที่ใช้ยืนยันสิทธิ์แพลตฟอร์ม" required
        />
      </Field>
      {error && <div className="alert error" role="alert">{error}</div>}
      <Button variant="primary" loading={busy} disabled={accessCode.length < 4 || displayName.trim().length < 1}>เข้าใช้งาน</Button>
      <p className="fine-print">ทุกครั้งที่เข้าทางนี้จะถูกบันทึกไว้ในบันทึกความปลอดภัยของแพลตฟอร์ม</p>
    </form>
  );
}

/**
 * Legacy name/password sign-in is intentionally no longer rendered. The only public entry is the
 * development code form above; this component is kept out of the route so no second login surface
 * can return by accident in the console shell.
 *
 * Name and password, through the same gateway as every other entrance in the product — not because
 * the console needs to look consistent, but because an email address is not something an operator
 * has. Accounts created through the private owner entry carry a generated internal address that
 * nobody is ever shown, so a screen asking for an email would be asking for something that does not
 * exist. The name directory already resolves an `admin` identity under the staff role, so this
 * reuses that rather than opening a second way in.
 *
 * Signing in successfully grants nothing here. What makes somebody an operator is a row in
 * `platform_admins`, which this screen cannot create and the server will not infer from a name.
 */
function OperatorSignIn() {
  return <main className="setup-page">{isDevSignInAvailable && <DevSignIn />}</main>;
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
  if (!auth.session) return <OperatorSignIn />;
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
