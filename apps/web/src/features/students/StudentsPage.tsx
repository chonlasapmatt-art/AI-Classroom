import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, classIdOfStudent, rosterFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { AvatarStudio } from '../avatars/AvatarStudio';
import type { Student } from '../../domain/types';
import { previewStudentCsv } from './csvImport';
import { requireSupabase } from '../../services/supabase';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { EraseAccountButton } from '../auth/EraseAccountButton';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';
import { useToast } from '../../ui/toastContext';

export function StudentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const { toast } = useToast();
  const [studioStudent, setStudioStudent] = useState<Student | null>(null);
  const [renaming, setRenaming] = useState<Student | null>(null);
  const [passwordStudent, setPasswordStudent] = useState<Student | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const canEdit = membership.role === 'admin';
  const isStudentView = membership.role === 'student';
  const students = useMemo(
    () => (selectedClassId ? rosterFor(snapshot, selectedClassId) : snapshot.students),
    [snapshot, selectedClassId]
  );
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];

  /**
   * Students sign in with the name and student number already on this card, so there is nothing to
   * hand out — the only lever a teacher needs is the ability to close that door again when a record
   * is disputed or a device is lost. Turning access off also releases the account binding, which
   * ends any session already open against the record.
   */
  /**
   * Puts one student's record into every state the sign-in checks, and says what to type.
   *
   * "เปิดการเข้าใช้งาน" only flipped one switch; a record that was archived, soft-deleted or never
   * marked active stayed unreachable and the screen said nothing about which. This sets all of them.
   */
  async function activate(studentId: string) {
    try {
      toast(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'student', recordId: studentId
      })));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function setAccess(student: Student, enabled: boolean) {
    try {
      const { error } = await requireSupabase().rpc('set_student_access', {
        p_student_id: student.id, p_enabled: enabled
      });
      if (error) throw error;
      toast(enabled
        ? `เปิดการเข้าใช้งานของ ${student.displayName} แล้ว`
        : `ปิดการเข้าใช้งานของ ${student.displayName} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ปรับสิทธิ์เข้าใช้งานไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentCode = String(data.get('code') ?? '').trim();
    const password = String(data.get('password') ?? '');
    // The student later signs in by typing this name back, so it is stored exactly as the two
    // fields the teacher filled in, with the whitespace between them normalised.
    const displayName = `${String(data.get('firstName') ?? '').trim()} ${String(data.get('lastName') ?? '').trim()}`
      .replace(/\s+/g, ' ').trim();
    if (!studentCode || !displayName) return;
    if (password.length < 8) { toast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    if (snapshot.students.some((item) => item.studentCode === studentCode)) {
      toast('รหัสนักเรียนนี้มีอยู่แล้ว');
      return;
    }
    try {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode, displayName, avatarIndex: snapshot.students.length * 7 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
      if (mode === 'cloud') await provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: id, displayName, password });
      form.reset();
      setOpen(false);
      toast(`เพิ่ม ${displayName} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function importCsv() {
    const existing = new Set(snapshot.students.map((item) => item.studentCode));
    const preview = previewStudentCsv(csv, existing);
    if (preview.errors.length > 0) toast(`ข้าม ${preview.errors.length} แถว: ${preview.errors[0]!.message}`);
    for (const row of preview.rows) {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode: row.studentCode, displayName: row.displayName, avatarIndex: row.rowNumber * 5 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
    }
    if (preview.rows.length > 0) toast(`นำเข้า ${preview.rows.length} คนแล้ว`);
    setCsv('');
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">ข้อมูลตามสิทธิ์</span>
          <h1>{isStudentView ? 'เพื่อนร่วมชั้น' : 'นักเรียน'}</h1>
          <p>{isStudentView ? `${students.length} คนในห้องเรียนของคุณ` : `${students.length} คนในขอบเขตที่คุณเข้าถึงได้`}</p>
        </div>
        {canEdit && <button className="primary-button" onClick={() => setOpen((value) => !value)}>+ เพิ่มนักเรียน</button>}
      </section>

      <div className="toolbar">
        <label>
          ห้องเรียน
          <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {open && canEdit && (
        <section className="panel inline-form">
          <div className="panel-heading"><h2>เพิ่มนักเรียนใหม่</h2></div>
          <p className="hint">แอดมินกำหนดชื่อและรหัสผ่านให้ นักเรียนจึงเข้าใช้งานได้ทันทีจากหน้า Login</p>
          <form onSubmit={(event) => void addStudent(event)}>
            <div className="form-grid">
              <label>ชื่อจริง<input name="firstName" required /></label>
              <label>นามสกุล<input name="lastName" required /></label>
              <label>เลขประจำตัวนักเรียน<input name="code" required /></label>
              <label>รหัสผ่านเริ่มต้น<input name="password" type="password" minLength={8} autoComplete="new-password" required /><span className="hint">อย่างน้อย 8 ตัวอักษร แอดมินเปลี่ยนภายหลังได้</span></label>
            </div>
            <button className="primary-button">บันทึก</button>
          </form>
          <div className="panel-heading spaced"><h2>นำเข้าจาก CSV</h2></div>
          <label>
            วางข้อมูล (header: student_code,display_name)
            <textarea rows={4} value={csv} onChange={(event) => setCsv(event.target.value)} />
          </label>
          <button className="secondary-button" onClick={() => void importCsv()} disabled={!csv.trim()}>ตรวจและนำเข้า</button>
        </section>
      )}

      <section className="panel data-panel">
        {students.length === 0 ? (
          <div className="empty-state">
            <span>◉</span><h3>ยังไม่มีนักเรียนในห้องนี้</h3>
            <p>เพิ่มรายชื่อทีละคน หรือนำเข้าจากไฟล์ CSV</p>
          </div>
        ) : (
          <div className="student-grid">
            {students.map((student) => (
              <article key={student.id} className="student-card">
                <ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={56} />
                <div>
                  <strong>{student.displayName}</strong>
                  <span>
                    {student.studentCode} · {classes.find((item) => item.id === classIdOfStudent(snapshot, student.id))?.name ?? 'ยังไม่มีห้อง'}
                  </span>
                  <div className="record-actions">
                    {!isStudentView && <button className="text-button" onClick={() => setStudioStudent(student)}>ปรับแต่งอวตาร</button>}
                    {canEdit && <button className="text-button" onClick={() => setRenaming(student)}>แก้ไข</button>}
                    {canEdit && <button className="text-button" onClick={() => setPasswordStudent(student)}>{student.profileId ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}</button>}
                    {student.profileId && <span className="status-chip success">เคยเข้าใช้งานแล้ว</span>}
                    {canEdit && mode === 'cloud' && (
                      <>
                        <button className="secondary-button" onClick={() => void activate(student.id)}>ยืนยันไอดี</button>
                        <button className="text-button" onClick={() => void setAccess(student, false)}>ปิดการเข้าใช้งาน</button>
                        {student.profileId && (
                          <EraseAccountButton
                            schoolId={membership.schoolId} role="student" profileId={student.profileId}
                            displayName={student.displayName} onDone={toast}
                          />
                        )}
                      </>
                    )}
                    {canEdit && (
                      <button
                        className="text-button danger"
                        onClick={() => void repository.removeStudent(student.id).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ', { tone: 'error' }))}
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {renaming && canEdit && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขข้อมูลนักเรียน">
          <section className="modal-card">
            <div className="panel-heading"><h2>แก้ไข {renaming.displayName}</h2><button className="icon-button" onClick={() => setRenaming(null)} aria-label="ปิด">×</button></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void repository.saveStudent({
                  id: renaming.id,
                  studentCode: String(data.get('code') ?? '').trim(),
                  displayName: String(data.get('name') ?? '').trim(),
                  avatarIndex: renaming.avatarIndex
                }).then(() => { setRenaming(null); toast('บันทึกการแก้ไขแล้ว'); });
              }}
            >
              <div className="form-grid">
                <label>รหัสนักเรียน<input name="code" defaultValue={renaming.studentCode} required /></label>
                <label>ชื่อ-สกุล<input name="name" defaultValue={renaming.displayName} required /></label>
              </div>
              <div className="modal-actions">
                <button type="button" className="text-button" onClick={() => setRenaming(null)}>ยกเลิก</button>
                <button className="primary-button">บันทึก</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {passwordStudent && canEdit && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ตั้งรหัสผ่านนักเรียน">
          <section className="modal-card">
            <div className="panel-heading"><h2>{passwordStudent.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · {passwordStudent.displayName}</h2><button type="button" className="icon-button" onClick={() => setPasswordStudent(null)} aria-label="ปิด">×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password') ?? ''); const confirm = String(data.get('confirm') ?? ''); if (password.length < 8 || password !== confirm) { toast(password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; } void (passwordStudent.profileId ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'student', profileId: passwordStudent.profileId, password }) : provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: passwordStudent.id, displayName: passwordStudent.displayName, password })).then(() => { setPasswordStudent(null); toast('บันทึกรหัสผ่านนักเรียนแล้ว'); }).catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ', { tone: 'error' })); }}>
              <ManagedPasswordFields />
              <div className="modal-actions"><button type="button" className="text-button" onClick={() => setPasswordStudent(null)}>ยกเลิก</button><button className="primary-button">บันทึก</button></div>
            </form>
          </section>
        </div>
      )}

      {studioStudent && (
        <AvatarStudio
          avatarIndex={studioStudent.avatarIndex}
          config={studioStudent.avatarConfig}
          studentName={studioStudent.displayName}
          onClose={() => setStudioStudent(null)}
          onSave={(config) => {
            void repository.saveStudentAvatar(studioStudent.id, config)
              .then(() => { setStudioStudent(null); toast('บันทึกอวตารแล้ว'); })
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกอวตารไม่สำเร็จ', { tone: 'error' }));
          }}
        />
      )}

    </>
  );
}
