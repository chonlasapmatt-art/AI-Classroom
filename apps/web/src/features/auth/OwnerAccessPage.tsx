import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';
import { isCompleteMemberRegistration, registerOwner } from './memberAccess';
import { AdminSchoolSetupPage } from './AdminSchoolSetupPage';

/**
 * Private owner-only entry. No public screen links to this route.
 *
 * It carries the account step as well as the school step, because the first school is created before
 * any school exists to register a teacher against. Creating the account here grants nothing on its
 * own: the code below is checked on the server, rate limited and audited, and it is the only thing
 * that turns this person into an administrator.
 */
export function OwnerAccessPage() {
  const auth = useAuth();
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  if (complete) return <Navigate to="/" replace />;

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await registerOwner({ firstName, lastName, password });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      setError(result.outcome === 'error' ? result.message : 'สร้างบัญชีไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { data, error: invokeError } = await requireSupabase().functions.invoke('admin-access', {
        body: {
          accessCode: String(values.accessCode ?? ''), schoolName: String(values.schoolName ?? ''),
          schoolCode: String(values.schoolCode ?? ''), academicYear: String(values.academicYear ?? ''),
          term: String(values.term ?? '')
        }
      });
      if (invokeError) throw invokeError;
      if (!(data as { schoolId?: string } | null)?.schoolId) throw new Error('การยืนยันไม่สมบูรณ์');
      await auth.refreshMemberships(); setComplete(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ยืนยันสิทธิ์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (!auth.session) {
    return (
      <main className="setup-page">
        <form className="configuration-card" onSubmit={(event) => void createAccount(event)}>
          <span className="eyebrow">PRIVATE OWNER ENTRY</span>
          <h1>สร้างบัญชีเจ้าของระบบ</h1>
          <p>ใช้ชื่อกับรหัสผ่านเหมือนผู้ใช้ทั่วไป บัญชีนี้ยังไม่มีสิทธิ์ใด ๆ จนกว่าจะยืนยันรหัสเจ้าของในขั้นถัดไป</p>
          <div className="form-grid">
            <label>ชื่อจริง<input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="เช่น สมชาย" required /></label>
            <label>นามสกุล<input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="เช่น ใจดี" required /></label>
          </div>
          <label>รหัสผ่าน<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" required /></label>
          <label>ยืนยันรหัสผ่าน<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="พิมพ์รหัสผ่านเดิมอีกครั้ง" required /></label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="primary-button" disabled={busy || !isCompleteMemberRegistration({ firstName, lastName, password, confirmPassword })}>
            {busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและไปขั้นถัดไป'}
          </button>
          <p className="fine-print">มีบัญชีอยู่แล้ว? เข้าสู่ระบบตามปกติแล้วเปิดหน้านี้อีกครั้ง</p>
        </form>
      </main>
    );
  }

  // Reuse the same mobile-friendly wizard used by the normal no-membership gate. This keeps the
  // private product entry and a packaged app's first launch on one predictable setup experience.
  return <AdminSchoolSetupPage />;

  return (
    <main className="setup-page">
      <form className="configuration-card" onSubmit={(event) => void submit(event)}>
        <span className="eyebrow">PRIVATE OWNER ENTRY</span>
        <h1>ยืนยันเจ้าของและสร้างโรงเรียน</h1>
        <p>ระบบจะตรวจรหัสที่ฝั่งเซิร์ฟเวอร์ พร้อมจำกัดความถี่และบันทึกเหตุการณ์ รหัสไม่ถูกเก็บในเบราว์เซอร์</p>
        <label>
          รหัสยืนยันเจ้าของ
          <input name="accessCode" type="password" autoComplete="one-time-code" minLength={4} maxLength={128} aria-describedby="owner-code-hint" required />
        </label>
        <p className="field-hint" id="owner-code-hint">รหัสที่ตั้งไว้ฝั่งเซิร์ฟเวอร์ตอนติดตั้ง ไม่ใช่รหัสผ่านของบัญชีนี้</p>
        <div className="form-grid">
          <label>ชื่อโรงเรียน<input name="schoolName" placeholder="เช่น โรงเรียนสาธิตสมาร์ท" minLength={2} maxLength={200} required /></label>
          <label>รหัสโรงเรียน<input name="schoolCode" placeholder="เช่น SC-01" pattern="[A-Za-z0-9-]{3,20}" required /></label>
          <label>ปีการศึกษา<input name="academicYear" placeholder="เช่น 2569" minLength={2} maxLength={20} required /></label>
          <label>ภาคเรียน<input name="term" placeholder="เช่น 1" minLength={1} maxLength={20} required /></label>
        </div>
        <p className="field-hint">รหัสโรงเรียนใช้ A-Z 0-9 และขีดกลาง 3–20 ตัว ห้ามซ้ำกับโรงเรียนอื่นในระบบ</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="primary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'ยืนยันและเริ่มตั้งค่าโรงเรียน'}</button>
      </form>
    </main>
  );
}
