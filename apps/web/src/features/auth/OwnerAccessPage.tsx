import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';

/** Private owner-only entry. No public screen links to this route. */
export function OwnerAccessPage() {
  const auth = useAuth(); const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (complete) return <Navigate to="/" replace />;
  if (!auth.session) return <main className="center-state account-state"><h1>ต้องยืนยันบัญชีก่อน</h1><p>เข้าสู่ระบบด้วยบัญชีเจ้าของที่ได้รับอนุญาต แล้วกลับมายังทางเข้าส่วนตัวนี้</p><Link className="primary-button" to="/login">เข้าสู่ระบบ</Link></main>;

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

  return <main className="setup-page"><form className="configuration-card" onSubmit={(event) => void submit(event)}><span className="eyebrow">PRIVATE OWNER ENTRY</span><h1>ยืนยันเจ้าของและสร้างโรงเรียน</h1><p>ระบบจะตรวจรหัสที่ฝั่งเซิร์ฟเวอร์ พร้อมจำกัดความถี่และบันทึกเหตุการณ์ รหัสไม่ถูกเก็บในเบราว์เซอร์</p><label>รหัสยืนยันเจ้าของ<input name="accessCode" type="password" autoComplete="one-time-code" minLength={4} maxLength={128} required /></label><div className="form-grid"><label>ชื่อโรงเรียน<input name="schoolName" minLength={2} maxLength={200} required /></label><label>รหัสโรงเรียน<input name="schoolCode" pattern="[A-Za-z0-9-]{3,20}" required /></label><label>ปีการศึกษา<input name="academicYear" minLength={2} maxLength={20} required /></label><label>ภาคเรียน<input name="term" minLength={1} maxLength={20} required /></label></div>{error && <div className="alert error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'ยืนยันและเริ่มตั้งค่าโรงเรียน'}</button></form></main>;
}
