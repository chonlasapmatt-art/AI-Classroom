import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import {
  activateSchool, isCompleteSchoolIdentity, issueProductKey, SchoolSetupError, type ProductKey
} from './schoolActivation';

/**
 * First-run setup for a school that has just bought the product. It is deliberately shown from the
 * no-membership state: there is no half-configured school shell to get lost inside, and the same
 * route works after packaging the web app as a desktop/mobile application.
 *
 * The three steps are the three things the customer has to do, in the order they can do them:
 *
 *   1. Say who the first administrator is and what the school is called. Nothing is created yet.
 *   2. Take the product key. The server draws it, shows it once and keeps only its digest.
 *   3. Type the key back, with the academic year and term, and the school exists.
 *
 * Step 3 asking for the key again is what makes step 2 real. A customer who skipped past the key
 * without saving it is stopped here, while drawing another is still one click away — rather than in
 * six months when the key is the only thing that can reactivate their server.
 *
 * The same screen adds the second school and the third. An administrator who already runs one campus
 * reaches it from the school settings, activates the next one under a key of its own, and lands
 * inside it — the account keeps both, and the shell switches between them.
 */
export function AdminSchoolSetupPage({ mode = 'first-run' }: { mode?: 'first-run' | 'additional' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const additional = mode === 'additional';
  const initialName = String(
    auth.active?.displayName ?? auth.session?.user.user_metadata.display_name ?? ''
  ).trim();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(initialName);
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [productKey, setProductKey] = useState<ProductKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [academicYear, setAcademicYear] = useState(() => String(new Date().getFullYear() + 543));
  const [term, setTerm] = useState('1');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdSchoolId, setCreatedSchoolId] = useState<string | null>(null);

  const draw = useCallback(async () => {
    setDrawing(true); setError(null); setCopied(false);
    try {
      setProductKey(await issueProductKey());
    } catch (reason) {
      setProductKey(null);
      setError(reason instanceof SchoolSetupError ? reason.message : 'สร้างคีย์ผลิตภัณฑ์ไม่สำเร็จ');
    } finally { setDrawing(false); }
  }, []);

  // Drawn on arrival at step 2 rather than on the button, so the key is on screen the moment the
  // customer gets there. Going back to step 1 and forward again keeps the key already drawn: each
  // draw retires the one before it, and silently swapping the key under somebody mid-copy is how a
  // customer ends up holding a key the server no longer knows.
  useEffect(() => {
    if (step === 2 && !productKey && !drawing) void draw();
  }, [draw, drawing, productKey, step]);

  async function copyKey() {
    if (!productKey) return;
    try {
      await navigator.clipboard.writeText(productKey.productKey);
      setCopied(true);
    } catch {
      // Clipboard access is refused over plain HTTP and in some packaged shells. The key is on
      // screen either way, so let the customer past — step 3 still makes them prove they have it.
      setCopied(true);
      setError('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกคีย์บนหน้าจอแล้วคัดลอกเอง');
    }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (step === 1 && !isCompleteSchoolIdentity({ displayName, schoolName, schoolCode })) {
      setError('กรุณาใส่ชื่อผู้ดูแลอย่างน้อย 2 ตัวอักษร ชื่อโรงเรียน และรหัสโรงเรียน A-Z, 0-9 หรือขีดกลาง 3–20 ตัว');
      return;
    }
    if (step === 2 && !copied) { setError('กรุณาคัดลอกคีย์ผลิตภัณฑ์เก็บไว้ก่อน แล้วจึงไปขั้นถัดไป'); return; }
    setStep((current) => Math.min(3, current + 1));
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessCode.trim().length < 4) { setError('กรุณากรอกรหัสเปิดใช้งานสินค้าให้ครบ'); return; }
    if (academicYear.trim().length < 2 || term.trim().length < 1) {
      setError('กรุณาระบุปีการศึกษาและภาคเรียน'); return;
    }
    setBusy(true); setError(null);
    try {
      const schoolId = await activateSchool({ displayName, schoolName, schoolCode, academicYear, term, accessCode });
      setCreatedSchoolId(schoolId);
      await auth.refreshMemberships();
    } catch (reason) {
      setError(reason instanceof SchoolSetupError ? reason.message : 'ตั้งค่าโรงเรียนไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  // A first-run account lands in its new school on its own: the membership arrives and the shell
  // replaces this screen. An administrator who already had a school is still standing in the old
  // one, so the new membership has to be chosen for them — otherwise activation looks like nothing
  // happened.
  useEffect(() => {
    if (!createdSchoolId) return;
    const created = auth.memberships.find((item) => item.schoolId === createdSchoolId);
    if (!created) return;
    auth.selectMembership(created.membershipId);
    navigate('/', { replace: true });
  }, [auth, createdSchoolId, navigate]);

  if (auth.active && !additional) return <Navigate to="/" replace />;
  // Only an administrator adds a school. The gateway refuses anybody else with `ADMIN_ROLE_REQUIRED`;
  // this keeps a teacher or a parent from reaching a screen that would only refuse them.
  if (additional && auth.active && auth.active.role !== 'admin') return <Navigate to="/" replace />;

  const steps = [
    { number: 1, title: 'ผู้ดูแลและโรงเรียน', description: 'ชื่อผู้ดูแลคนแรกและข้อมูลโรงเรียน' },
    { number: 2, title: 'คีย์ผลิตภัณฑ์', description: 'คัดลอกเก็บไว้ แสดงครั้งเดียว' },
    { number: 3, title: 'เปิดใช้งาน', description: 'ปีการศึกษา ภาคเรียน และรหัสสินค้า' }
  ];

  return (
    <main className="setup-page admin-setup-page">
      <section className="admin-setup-card">
        <div className="admin-setup-intro">
          <div className="brand-mark" aria-hidden="true">SC</div>
          <span className="eyebrow">{additional ? 'ADD ANOTHER SCHOOL' : 'WELCOME TO YOUR SCHOOL SERVER'}</span>
          <h1>{additional ? 'สร้างโรงเรียนใหม่' : 'ตั้งค่าโรงเรียนของคุณ'}</h1>
          <p>
            {additional
              ? 'โรงเรียนใหม่ใช้คีย์ผลิตภัณฑ์ของตัวเองคนละใบ ข้อมูลแยกจากโรงเรียนเดิมทั้งหมด และคุณสลับไปมาได้จากแถบบน'
              : 'ตั้งค่าครั้งเดียว แล้วคุณจะเป็นผู้ดูแลระบบของโรงเรียนนี้เต็มรูปแบบ ข้อมูลจะถูกผูกกับเซิร์ฟของคุณ'}
          </p>
          {additional && auth.active && (
            <Link className="text-button" to="/">ย้อนกลับไป {auth.active.schoolName}</Link>
          )}
        </div>
        <ol className="admin-setup-steps" aria-label="ขั้นตอนการตั้งค่าโรงเรียน">
          {steps.map((item) => <li key={item.number} className={step === item.number ? 'current' : step > item.number ? 'done' : ''}><span>{step > item.number ? '✓' : item.number}</span><div><strong>{item.title}</strong><small>{item.description}</small></div></li>)}
        </ol>

        {step === 1 && (
          <form onSubmit={next} className="admin-setup-form">
            <span className="ui-eyebrow">STEP 01 · ADMIN &amp; SCHOOL</span>
            <h2>ผู้ดูแลคนแรกและโรงเรียนของคุณ</h2>
            <p className="form-intro">ชื่อผู้ดูแลจะแสดงในเมนูและบันทึกกิจกรรม ส่วนชื่อโรงเรียนคือชื่อที่ครู นักเรียน และผู้ปกครองจะเห็น</p>
            <label>ชื่อผู้ดูแลเว็บไซต์<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น ครูสมชาย ใจดี" minLength={2} maxLength={200} required /></label>
            <label>ชื่อโรงเรียน<input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="เช่น โรงเรียนบ้านไทเกอร์" minLength={2} maxLength={200} required /></label>
            <label>รหัสโรงเรียน<input value={schoolCode} onChange={(event) => setSchoolCode(event.target.value.toUpperCase())} placeholder="เช่น TIGER-01" pattern="[A-Za-z0-9-]{3,20}" maxLength={20} required /></label>
            <p className="field-hint">รหัสนี้ใช้แยกเซิร์ฟของคุณจากโรงเรียนอื่น และเปลี่ยนภายหลังไม่ได้ง่าย ๆ</p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="admin-setup-actions"><button type="submit" className="primary-button">ถัดไป <span aria-hidden="true">→</span></button></div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={next} className="admin-setup-form">
            <span className="ui-eyebrow">STEP 02 · PRODUCT KEY</span>
            <h2>คีย์ผลิตภัณฑ์ของคุณ</h2>
            <p className="form-intro">
              {additional
                ? 'คีย์ใบนี้เป็นของโรงเรียนใหม่โดยเฉพาะ คีย์ของโรงเรียนเดิมไม่เปลี่ยนและยังใช้ได้ตามเดิม กรุณาคัดลอกเก็บไว้ แล้วนำไปกรอกในขั้นถัดไปเพื่อเปิดใช้งาน'
                : 'ระบบสุ่มคีย์นี้ให้เซิร์ฟของคุณโดยเฉพาะ หนึ่งบัญชีมีคีย์เดียวและสุ่มใหม่ไม่ได้ กรุณาคัดลอกเก็บไว้ในที่ปลอดภัย แล้วนำไปกรอกในขั้นถัดไปเพื่อเปิดใช้งาน'}
            </p>
            <div className="access-code-display">
              <strong className="access-code-value">{drawing ? 'กำลังสุ่มคีย์...' : productKey?.productKey ?? '—'}</strong>
              {productKey && <p className="field-hint">เก็บคีย์นี้ไว้ใช้ยืนยันการเปิดใช้งาน · เปิดหน้านี้ใหม่จะได้คีย์เดิมเสมอ</p>}
            </div>
            <div className="admin-setup-actions">
              <button type="button" className="primary-button" onClick={() => void copyKey()} disabled={!productKey || drawing}>
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกคีย์'}
              </button>
            </div>
            {/*
              There is no "draw again". A key that changes under somebody who wrote it down is a key
              they stop trusting, and two keys in a customer's notes with one that works is the
              support call this screen exists to prevent. Losing it is recoverable a different way:
              the operator who sold the server can read this exact key back.
            */}
            <p className="fine-print">
              {additional
                ? 'คีย์จะผูกกับโรงเรียนใหม่เมื่อเปิดใช้งานสำเร็จ · หากทำหาย ติดต่อผู้ดูแลระบบเพื่อขอดูคีย์เดิมได้'
                : 'คีย์นี้ผูกกับบัญชีของคุณถาวร · หากทำหาย ติดต่อผู้ดูแลระบบเพื่อขอดูคีย์เดิมได้'}
            </p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="admin-setup-actions">
              <button type="button" className="text-button" onClick={() => { setError(null); setStep(1); }}>ย้อนกลับ</button>
              <button type="submit" className="primary-button" disabled={!copied || drawing}>ถัดไป <span aria-hidden="true">→</span></button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={(event) => void finish(event)} className="admin-setup-form">
            <span className="ui-eyebrow">STEP 03 · ACTIVATE SERVER</span>
            <h2>เปิดใช้งานเซิร์ฟโรงเรียน</h2>
            <p className="form-intro">ระบุปีการศึกษากับภาคเรียนที่จะเริ่มใช้ แล้วกรอกคีย์ผลิตภัณฑ์ที่คัดลอกไว้เพื่อยืนยัน</p>
            <div className="admin-setup-summary"><div><span>ผู้ดูแล</span><strong>{displayName}</strong></div><div><span>โรงเรียน</span><strong>{schoolName} · {schoolCode.toUpperCase()}</strong></div>{productKey && <div><span>คีย์ผลิตภัณฑ์</span><strong>{productKey.hint}</strong></div>}</div>
            <label>ปีการศึกษา<input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="เช่น 2569" minLength={2} maxLength={20} required /></label>
            <label>ภาคเรียน<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="เช่น 1" minLength={1} maxLength={20} required /></label>
            <label>รหัสเปิดใช้งานสินค้า<input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="วางคีย์ที่คัดลอกไว้" minLength={4} maxLength={128} autoComplete="one-time-code" required /></label>
            <p className="field-hint">แก้ปีการศึกษาและภาคเรียนได้ภายหลังในเมนูตั้งค่าโรงเรียน</p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="admin-setup-actions"><button type="button" className="text-button" onClick={() => { setError(null); setStep(2); }}>ย้อนกลับ</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'กำลังเปิดใช้งาน...' : 'บันทึกและเข้าใช้งาน'}</button></div>
          </form>
        )}
        <p className="admin-setup-footnote">ตั้งค่าในภายหลังได้ที่ ตั้งค่า → ข้อมูลโรงเรียน · รองรับหน้าจอมือถือและแอพติดตั้ง</p>
      </section>
    </main>
  );
}
