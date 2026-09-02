// The one screen a student ever sees before the dashboard.
//
// The bar these have to clear is a nine-year-old on a shared tablet: two fields, one button, no
// email, no password, no verification step. Everything that makes that safe happens server-side,
// so the only complexity allowed on screen is the school picker, and that appears only when two
// schools genuinely issued the same student number to a same-named child.

import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import {
  isCompleteStudentLogin, studentLogin,
  type SchoolChoice, type StudentAccessResult
} from './studentAccess';

function StudentBrandPanel({ headline, lead }: { headline: string; lead: string }) {
  return (
    <section className="auth-art student-art">
      <div className="brand-mark">SC</div>
      <span className="eyebrow">สำหรับนักเรียน</span>
      <h1>{headline}</h1>
      <p>{lead}</p>
    </section>
  );
}

export function StudentLoginPage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [schools, setSchools] = useState<SchoolChoice[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result: StudentAccessResult = await studentLogin({
        displayName, studentCode, ...(schoolId ? { schoolId } : {})
      });
      if (result.outcome === 'session') { await auth.applyStudentSession(result.session); return; }
      if (result.outcome === 'school-required') {
        setSchools(result.schools);
        setError('มีนักเรียนชื่อและเลขประจำตัวนี้มากกว่าหนึ่งโรงเรียน กรุณาเลือกโรงเรียนของหนู');
        return;
      }
      setError(result.message);
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page student-auth">
      <StudentBrandPanel
        headline={'สวัสดี\nเข้าห้องเรียนกันเลย'}
        lead="กรอกแค่ชื่อกับเลขประจำตัวนักเรียน ไม่ต้องใช้อีเมลและรหัสผ่าน"
      />
      <form className="auth-card student-card" onSubmit={(event) => void submit(event)}>
        <h2>เข้าใช้งาน</h2>
        <p>ใช้ชื่อและเลขประจำตัวที่คุณครูใช้เรียก</p>
        <label>
          ชื่อ
          <input
            name="displayName" autoComplete="name" value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="ชื่อ นามสกุล" required
          />
        </label>
        <label>
          เลขประจำตัวนักเรียน
          <input
            name="studentCode" inputMode="text" value={studentCode}
            onChange={(event) => setStudentCode(event.target.value)}
            placeholder="เช่น 1285 หรือ ป.6/1-15" aria-describedby="student-code-hint" required
          />
        </label>
        <p className="field-hint" id="student-code-hint">เลขที่คุณครูให้ไว้ มีขีดหรือเว้นวรรคก็พิมพ์ได้ตามที่เห็น</p>
        {schools.length > 0 && (
          <label>
            โรงเรียน
            <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required>
              <option value="">เลือกโรงเรียน</option>
              {schools.map((school) => <option key={school.schoolId} value={school.schoolId}>{school.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="primary-button big-button" disabled={busy || !isCompleteStudentLogin(displayName, studentCode)}>
          {busy ? 'กำลังเข้าใช้งาน...' : 'เข้าใช้งาน'}
        </button>
        <div className="auth-links">
          <span className="fine-print">บัญชีนักเรียนจัดเตรียมโดยครูหรือผู้ดูแลโรงเรียน</span>
          <Link to="/login">ฉันเป็นครูหรือผู้ปกครอง</Link>
        </div>
      </form>
    </main>
  );
}
