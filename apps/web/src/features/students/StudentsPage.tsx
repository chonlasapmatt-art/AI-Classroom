import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, classIdOfStudent, rosterFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { AvatarStudio } from '../avatars/AvatarStudio';
import type { Student } from '../../domain/types';
import { previewStudentCsv } from './csvImport';
import { requireSupabase } from '../../services/supabase';

export function StudentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [studioStudent, setStudioStudent] = useState<Student | null>(null);
  const [renaming, setRenaming] = useState<Student | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const canEdit = membership.role === 'admin' || membership.role === 'teacher';
  const students = useMemo(
    () => (selectedClassId ? rosterFor(snapshot, selectedClassId) : snapshot.students),
    [snapshot, selectedClassId]
  );
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];

  /**
   * Turns an existing student record into a login. The invitation is addressed to this record, so
   * redeeming it links the new account to the student already in the register — it never creates a
   * second student.
   */
  async function activateLogin(student: Student) {
    const email = window.prompt(`อีเมลสำหรับบัญชีของ ${student.displayName}\nนักเรียนต้องสมัครด้วยอีเมลนี้แล้วกรอกรหัสคำเชิญ`);
    if (!email) return;
    try {
      const { data, error } = await requireSupabase().functions.invoke('member-invitation', {
        body: { action: 'create', schoolId: membership.schoolId, role: 'student', targetEntityId: student.id, email: email.trim() }
      });
      if (error) throw error;
      const code = (data as { code?: string } | null)?.code;
      setMessage(code
        ? `รหัสคำเชิญของ ${student.displayName}: ${code} (ใช้ได้ 48 ชั่วโมง ครั้งเดียว)`
        : 'สร้างคำเชิญแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'สร้างคำเชิญไม่สำเร็จ');
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentCode = String(data.get('code') ?? '').trim();
    const displayName = String(data.get('name') ?? '').trim();
    if (!studentCode || !displayName) return;
    if (snapshot.students.some((item) => item.studentCode === studentCode)) {
      setMessage('รหัสนักเรียนนี้มีอยู่แล้ว');
      return;
    }
    try {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode, displayName, avatarIndex: snapshot.students.length * 7 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
      form.reset();
      setOpen(false);
      setMessage(`เพิ่ม ${displayName} แล้ว`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  async function importCsv() {
    const existing = new Set(snapshot.students.map((item) => item.studentCode));
    const preview = previewStudentCsv(csv, existing);
    if (preview.errors.length > 0) setMessage(`ข้าม ${preview.errors.length} แถว: ${preview.errors[0]!.message}`);
    for (const row of preview.rows) {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode: row.studentCode, displayName: row.displayName, avatarIndex: row.rowNumber * 5 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
    }
    if (preview.rows.length > 0) setMessage(`นำเข้า ${preview.rows.length} คนแล้ว`);
    setCsv('');
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">ข้อมูลตามสิทธิ์</span>
          <h1>นักเรียน</h1>
          <p>{students.length} คนในขอบเขตที่คุณเข้าถึงได้</p>
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
          <form onSubmit={(event) => void addStudent(event)}>
            <div className="form-grid">
              <label>รหัสนักเรียน<input name="code" required /></label>
              <label>ชื่อ-สกุล<input name="name" required /></label>
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
                    <button className="text-button" onClick={() => setStudioStudent(student)}>ปรับแต่งอวตาร</button>
                    {canEdit && <button className="text-button" onClick={() => setRenaming(student)}>แก้ไข</button>}
                    {canEdit && mode === 'cloud' && !student.profileId && (
                      <button className="text-button" onClick={() => void activateLogin(student)}>เปิดบัญชีเข้าใช้งาน</button>
                    )}
                    {student.profileId && <span className="status-chip success">มีบัญชีแล้ว</span>}
                    {canEdit && (
                      <button
                        className="text-button danger"
                        onClick={() => void repository.removeStudent(student.id).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ'))}
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
                }).then(() => { setRenaming(null); setMessage('บันทึกการแก้ไขแล้ว'); });
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

      {studioStudent && (
        <AvatarStudio
          avatarIndex={studioStudent.avatarIndex}
          config={studioStudent.avatarConfig}
          studentName={studioStudent.displayName}
          onClose={() => setStudioStudent(null)}
          onSave={(config) => {
            void repository.saveStudentAvatar(studioStudent.id, config)
              .then(() => { setStudioStudent(null); setMessage('บันทึกอวตารแล้ว'); })
              .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'บันทึกอวตารไม่สำเร็จ'));
          }}
        />
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
