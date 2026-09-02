import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { requireSupabase } from '../../services/supabase';

/**
 * First-run setup for a teacher who bought a standalone school server. It is deliberately shown
 * from the no-membership state: there is no half-configured school shell to get lost inside, and
 * the same route works after packaging the web app as a desktop/mobile application.
 */
export function AdminSchoolSetupPage() {
  const auth = useAuth();
  const initialName = String(auth.session?.user.user_metadata.display_name ?? '').trim();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(initialName);
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('1');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (step === 1 && displayName.trim().length < 2) { setError('กรุณาใส่ชื่อผู้ดูแลอย่างน้อย 2 ตัวอักษร'); return; }
    if (step === 2 && (schoolName.trim().length < 2 || !/^[A-Za-z0-9-]{3,20}$/.test(schoolCode.trim()))) {
      setError('กรุณาใส่ชื่อโรงเรียน และรหัสโรงเรียน A-Z, 0-9 หรือขีดกลาง 3–20 ตัว'); return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessCode.trim().length < 4 || academicYear.trim().length < 2 || term.trim().length < 1) {
      setError('กรุณากรอกปีการศึกษา ภาคเรียน และรหัสเปิดใช้งานให้ครบ'); return;
    }
    setBusy(true); setError(null);
    try {
      const { data, error: invokeError } = await requireSupabase().functions.invoke('admin-access', {
        body: {
          accessCode: accessCode.trim(), displayName: displayName.trim(), schoolName: schoolName.trim(),
          schoolCode: schoolCode.trim().toUpperCase(), academicYear: academicYear.trim(), term: term.trim()
        }
      });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) as { code?: string } | null : null;
        throw new Error(body?.code === 'SCHOOL_CODE_EXISTS' ? 'รหัสโรงเรียนนี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น' : body?.code === 'TEMPORARILY_LOCKED' ? 'ลองรหัสเปิดใช้งานหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' : 'ตั้งค่าโรงเรียนไม่สำเร็จ กรุณาตรวจข้อมูลและรหัสเปิดใช้งาน');
      }
      if (!(data as { schoolId?: string } | null)?.schoolId) throw new Error('ตั้งค่าโรงเรียนไม่สมบูรณ์');
      await auth.refreshMemberships();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ตั้งค่าโรงเรียนไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (auth.active) return <Navigate to="/" replace />;

  const steps = [
    { number: 1, title: 'ผู้ดูแล', description: 'ชื่อที่ใช้แสดงในระบบ' },
    { number: 2, title: 'โรงเรียน', description: 'ข้อมูลเซิร์ฟของคุณ' },
    { number: 3, title: 'เปิดใช้งาน', description: 'ปีการศึกษาและรหัสสินค้า' }
  ];

  return (
    <main className="setup-page admin-setup-page">
      <section className="admin-setup-card">
        <div className="admin-setup-intro">
          <div className="brand-mark" aria-hidden="true">SC</div>
          <span className="eyebrow">WELCOME TO YOUR SCHOOL SERVER</span>
          <h1>ตั้งค่าโรงเรียนของคุณ</h1>
          <p>ตั้งค่าครั้งเดียว แล้วคุณจะเป็นผู้ดูแลระบบของโรงเรียนนี้เต็มรูปแบบ ข้อมูลจะถูกผูกกับเซิร์ฟของคุณ</p>
        </div>
        <ol className="admin-setup-steps" aria-label="ขั้นตอนการตั้งค่าโรงเรียน">
          {steps.map((item) => <li key={item.number} className={step === item.number ? 'current' : step > item.number ? 'done' : ''}><span>{step > item.number ? '✓' : item.number}</span><div><strong>{item.title}</strong><small>{item.description}</small></div></li>)}
        </ol>

        {step < 3 ? (
          <form onSubmit={next} className="admin-setup-form">
            {step === 1 ? <>
              <span className="ui-eyebrow">STEP 01 · ADMIN PROFILE</span>
              <h2>คุณคือผู้ดูแลคนไหน?</h2>
              <p className="form-intro">ชื่อนี้จะแสดงในเมนูผู้ดูแลและใช้ระบุตัวคุณในบันทึกกิจกรรม เปลี่ยนได้ภายหลังที่โปรไฟล์</p>
              <label>ชื่อผู้ดูแลเว็บไซต์<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น ครูสมชาย ใจดี" minLength={2} maxLength={200} required /></label>
            </> : <>
              <span className="ui-eyebrow">STEP 02 · SCHOOL IDENTITY</span>
              <h2>ข้อมูลโรงเรียน</h2>
              <p className="form-intro">ใช้ชื่อที่ครู นักเรียน และผู้ปกครองจะเห็นเมื่อเข้าสู่ระบบ</p>
              <label>ชื่อโรงเรียน<input autoFocus value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="เช่น โรงเรียนบ้านไทเกอร์" minLength={2} maxLength={200} required /></label>
              <label>รหัสโรงเรียน<input value={schoolCode} onChange={(event) => setSchoolCode(event.target.value.toUpperCase())} placeholder="เช่น TIGER-01" pattern="[A-Za-z0-9-]{3,20}" maxLength={20} required /></label>
              <p className="field-hint">รหัสนี้ใช้แยกเซิร์ฟของคุณจากโรงเรียนอื่น และเปลี่ยนภายหลังไม่ได้ง่าย ๆ</p>
            </>}
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="admin-setup-actions"><button type="submit" className="primary-button">ถัดไป <span aria-hidden="true">→</span></button></div>
          </form>
        ) : (
          <form onSubmit={(event) => void finish(event)} className="admin-setup-form">
            <span className="ui-eyebrow">STEP 03 · ACTIVATE SERVER</span>
            <h2>เปิดใช้งานเซิร์ฟโรงเรียน</h2>
            <p className="form-intro">ข้อมูลนี้ใช้เริ่มต้นโครงสร้างโรงเรียนของคุณ และรหัสเปิดใช้งานจะตรวจสอบบนเซิร์ฟเวอร์เท่านั้น</p>
            <div className="admin-setup-summary"><div><span>ผู้ดูแล</span><strong>{displayName}</strong></div><div><span>โรงเรียน</span><strong>{schoolName} · {schoolCode.toUpperCase()}</strong></div></div>
            <div className="form-grid"><label>ปีการศึกษา<input autoFocus value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="เช่น 2569" minLength={2} maxLength={20} required /></label><label>ภาคเรียน<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="เช่น 1" maxLength={20} required /></label></div>
            <label>รหัสเปิดใช้งานสินค้า<input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="ใส่รหัสที่ได้รับตอนซื้อระบบ" minLength={4} maxLength={128} autoComplete="one-time-code" required /></label>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="admin-setup-actions"><button type="button" className="text-button" onClick={() => { setError(null); setStep(2); }}>ย้อนกลับ</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'กำลังเปิดใช้งาน...' : 'บันทึกและเข้าใช้งาน'}</button></div>
          </form>
        )}
        <p className="admin-setup-footnote">ตั้งค่าในภายหลังได้ที่ ตั้งค่า → ข้อมูลโรงเรียน · รองรับหน้าจอมือถือและแอพติดตั้ง</p>
      </section>
    </main>
  );
}
