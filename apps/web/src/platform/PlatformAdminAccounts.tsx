import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, Field, FieldGroup, PageHeader, Skeleton } from '../ui/components';
import { DangerousActionDialog } from './ReauthGate';
import { useDangerousAction } from './consoleHelpers';
import {
  platformSchools, provisionSchoolAdmin,
  type ProvisionSchoolAdminResult, type SchoolSummary
} from './platformClient';

type SchoolMode = 'existing' | 'new';

/** The platform-only account factory. It never exposes the generated internal auth email. */
export function PlatformAdminAccountsPage() {
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [mode, setMode] = useState<SchoolMode>('existing');
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [academicYear, setAcademicYear] = useState('2569');
  const [term, setTerm] = useState('1');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, request, dismiss } = useDangerousAction();

  useEffect(() => {
    void platformSchools().then(setSchools).catch(() => setError('โหลดรายชื่อโรงเรียนไม่สำเร็จ'));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null); setError(null);
    if (password !== confirmPassword) { setError('รหัสผ่านใหม่ไม่ตรงกัน'); return; }
    if (mode === 'existing' && !schoolId) { setError('กรุณาเลือกโรงเรียน'); return; }
    if (mode === 'new' && !/^[A-Za-z0-9-]{3,20}$/.test(schoolCode.trim())) {
      setError('รหัสโรงเรียนใช้ A-Z 0-9 และขีดกลาง 3–20 ตัว'); return;
    }
    request({
      summary: mode === 'new'
        ? `สร้างโรงเรียน ${schoolName.trim()} พร้อมบัญชีแอดมิน ${displayName.trim()}`
        : `เพิ่มบัญชีแอดมิน ${displayName.trim()} ให้โรงเรียนที่เลือก`,
      consequence: 'ระบบจะสร้างบัญชีที่ใช้ชื่อและรหัสผ่านนี้เข้าสู่ระบบได้ทันที และบันทึกการดำเนินการไว้ในประวัติความปลอดภัยของแพลตฟอร์ม',
      confirmLabel: 'สร้างบัญชีแอดมิน',
      run: async () => {
        const result = await provisionSchoolAdmin({
          ...(mode === 'existing' ? { schoolId } : {
            schoolName: schoolName.trim(), schoolCode: schoolCode.trim().toUpperCase(),
            academicYear: academicYear.trim(), term: term.trim()
          }),
          displayName: displayName.trim(), password, recordId: crypto.randomUUID()
        });
        showSuccess(result);
      }
    });
  }

  function showSuccess(result: ProvisionSchoolAdminResult) {
    setMessage(result.createdSchool
      ? `สร้างโรงเรียน ${result.schoolName} และบัญชีแอดมิน ${result.displayName} พร้อมใช้แล้ว`
      : `เพิ่มบัญชีแอดมิน ${result.displayName} ให้ ${result.schoolName} พร้อมใช้แล้ว`);
    setDisplayName(''); setPassword(''); setConfirmPassword('');
    if (result.createdSchool) {
      setSchoolName(''); setSchoolCode('');
      setMode('existing'); setSchoolId(result.schoolId);
      void platformSchools().then(setSchools).catch(() => undefined);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PLATFORM ADMINISTRATION"
        title="สร้างแอดมินโรงเรียน"
        description="สร้างบัญชีผู้ดูแลโรงเรียนจากศูนย์ Super Admin ได้ทันที ไม่ต้องสมัครเอง"
      />
      <Card>
        <CardHeader title="ข้อมูลโรงเรียน" description="เลือกโรงเรียนเดิม หรือสร้างโรงเรียนใหม่พร้อมบัญชีแอดมินในครั้งเดียว" />
        <div className="ui-segmented" role="tablist" aria-label="วิธีเลือกโรงเรียน">
          <button type="button" role="tab" aria-selected={mode === 'existing'} className={mode === 'existing' ? 'selected' : ''} onClick={() => setMode('existing')}>เลือกโรงเรียนเดิม</button>
          <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'selected' : ''} onClick={() => setMode('new')}>สร้างโรงเรียนใหม่</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'existing' ? (
            <Field label="โรงเรียน" hint="แอดมินจะดูแลได้เฉพาะโรงเรียนที่เลือกนี้">
              <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required>
                <option value="">เลือกโรงเรียน</option>
                {(schools ?? []).map((school) => <option key={school.schoolId} value={school.schoolId}>{school.name} · {school.code}</option>)}
              </select>
            </Field>
          ) : (
            <FieldGroup columns={2}>
              <Field label="ชื่อโรงเรียน"><input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="เช่น โรงเรียนใหม่" required /></Field>
              <Field label="รหัสโรงเรียน"><input value={schoolCode} onChange={(event) => setSchoolCode(event.target.value.toUpperCase())} placeholder="เช่น SC-02" required /></Field>
              <Field label="ปีการศึกษา"><input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} required /></Field>
              <Field label="ภาคเรียน"><input value={term} onChange={(event) => setTerm(event.target.value)} required /></Field>
            </FieldGroup>
          )}

          <CardHeader title="บัญชีแอดมินใหม่" description="ใช้ชื่อและรหัสผ่านนี้เข้าสู่หน้าแอดมินโรงเรียนได้ทันที" />
          <FieldGroup columns={2}>
            <Field label="ชื่อ-สกุล"><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น สมชาย ใจดี" minLength={2} required /></Field>
            <Field label="รหัสผ่านสำหรับแอดมิน" hint="อย่างน้อย 8 ตัวอักษร"><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></Field>
            <Field label="ยืนยันรหัสผ่าน"><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></Field>
          </FieldGroup>
          {schools === null && mode === 'existing' && <Skeleton lines={2} />}
          {message && <div className="alert success" role="status">{message}</div>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="ui-card-actions">
            <Button variant="primary" type="submit" disabled={!displayName.trim() || password.length < 8 || password !== confirmPassword}>
              สร้างบัญชีพร้อมใช้
            </Button>
          </div>
        </form>
      </Card>
      {pending && <DangerousActionDialog action={pending} onClose={dismiss} onDone={() => undefined} />}
    </>
  );
}
