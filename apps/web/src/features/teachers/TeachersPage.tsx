import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { TeacherVerificationStatus } from '../../domain/types';
import { responsibilityLabels, responsibilityOf, type TeacherResponsibility } from '../../data/teacherResponsibilities';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { EraseAccountButton } from '../auth/EraseAccountButton';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';

const verificationLabels: Record<TeacherVerificationStatus, string> = {
  teacher_requested: 'ขอสิทธิ์ครู', verification_pending: 'รอตรวจสอบ',
  verified_teacher: 'ยืนยันแล้ว', revoked: 'ถูกเพิกถอน'
};
const verificationTone: Record<TeacherVerificationStatus, string> = {
  teacher_requested: 'warning', verification_pending: 'warning', verified_teacher: 'success', revoked: 'danger'
};

const responsibilityOptions: Array<{ value: TeacherResponsibility; label: string; needsSubject: boolean }> = [
  { value: 'CLASS_ADVISOR', label: responsibilityLabels.CLASS_ADVISOR, needsSubject: false },
  { value: 'ASSISTANT_ADVISOR', label: responsibilityLabels.ASSISTANT_ADVISOR, needsSubject: false },
  { value: 'SUBJECT_OWNER', label: responsibilityLabels.SUBJECT_OWNER, needsSubject: true },
  { value: 'SUBJECT_CO_TEACHER', label: responsibilityLabels.SUBJECT_CO_TEACHER, needsSubject: true }
];

export function TeachersPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [passwordTeacher, setPasswordTeacher] = useState<typeof snapshot.teachers[number] | null>(null);
  const [assignment, setAssignment] = useState<{ teacherId: string; classId: string; responsibility: TeacherResponsibility; subjectId: string }>({
    teacherId: '', classId: '', responsibility: 'CLASS_ADVISOR', subjectId: ''
  });

  const canEdit = membership.role === 'admin' && repository.canManageStructure;

  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const teacherId = crypto.randomUUID();
      const displayName = String(data.get('name') ?? '').trim();
      const password = String(data.get('password') ?? '');
      if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      const subject = String(data.get('subject') ?? '').trim();
      if (subject) {
        const subjectExists = snapshot.subjects.some((item) => item.status === 'active' && item.name.trim().toLowerCase() === subject.toLowerCase());
        if (!subjectExists) {
          await repository.saveSubject({
            id: crypto.randomUUID(),
            code: `CUSTOM-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
            name: subject,
            colorIndex: snapshot.subjects.length % 6,
            iconKey: 'default',
            sortOrder: snapshot.subjects.length
          });
        }
      }
      await repository.saveTeacher({
        id: teacherId,
        teacherCode: String(data.get('code') ?? '').trim(),
        displayName,
        email: '',
        subject
      });
      if (mode === 'cloud') {
        await provisionManagedAccount({ schoolId: membership.schoolId, role: 'teacher', recordId: teacherId, displayName, password });
      }
      setMessage(`เพิ่มครู ${displayName} แล้ว · ใช้ชื่อกับรหัสผ่านเข้าสู่ระบบได้เลย`);
      form.reset();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  async function activate(teacherId: string) {
    try {
      setMessage(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'teacher', recordId: teacherId
      })));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ');
    }
  }

  async function verify(teacherId: string, displayName: string) {
    const reason = window.prompt(`ยืนยันสถานะครูของ ${displayName}\nระบุเหตุผล (อย่างน้อย 4 ตัวอักษร)`, 'ตรวจสอบเอกสารประจำตัวแล้ว');
    if (reason === null) return;
    try {
      await repository.verifyTeacher(teacherId, reason);
      setMessage(`ยืนยันสถานะครูของ ${displayName} แล้ว`);
    } catch (reason2) {
      setMessage(reason2 instanceof Error ? reason2.message : 'ยืนยันสถานะไม่สำเร็จ');
    }
  }

  async function assign() {
    if (!assignment.teacherId || !assignment.classId) return;
    try {
      const subjectRequired = assignment.responsibility === 'SUBJECT_OWNER' || assignment.responsibility === 'SUBJECT_CO_TEACHER';
      if (subjectRequired && !assignment.subjectId) throw new Error('กรุณาเลือกวิชาสำหรับหน้าที่นี้');
      const role = assignment.responsibility === 'ASSISTANT_ADVISOR' || assignment.responsibility === 'SUBJECT_CO_TEACHER' ? 'assistant' : 'primary';
      await repository.assignTeacher(assignment.classId, assignment.teacherId, role, subjectRequired ? assignment.subjectId : null);
      setMessage(`กำหนด${responsibilityLabels[assignment.responsibility]}แล้ว`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'กำหนดครูไม่สำเร็จ');
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">บุคลากร</span>
          <h1>ครู</h1>
          <p>{snapshot.teachers.length} คน · {snapshot.classTeachers.length} การมอบหมายห้องเรียน</p>
        </div>
      </section>

      {canEdit && (
        <form className="panel inline-form" onSubmit={(event) => void createTeacher(event)}>
          <div className="panel-heading"><h2>เพิ่มครู</h2></div>
          <div className="form-grid">
            <label>
              รหัสครู
              <input name="code" required placeholder="เช่น SC-003" />
              <span className="hint">ใช้เป็นรหัสประจำตัวครู ไม่ใช่รหัสผ่าน</span>
            </label>
            <label>ชื่อ-สกุล<input name="name" required /></label>
            <label>รหัสผ่านเริ่มต้น<input name="password" type="password" minLength={8} autoComplete="new-password" required /><span className="hint">อย่างน้อย 8 ตัวอักษร แอดมินเปลี่ยนภายหลังได้</span></label>
            <label>
              รายวิชาที่รับผิดชอบ
              <input
                name="subject"
                list="teacher-subject-options"
              placeholder="เลือกจากรายการ หรือพิมพ์วิชาใหม่ เช่น Coding"
              />
              <datalist id="teacher-subject-options">
                {snapshot.subjects.map((subject) => <option key={subject.id} value={subject.name} />)}
              </datalist>
              <span className="hint">ไม่ใส่ตอนนี้ได้ แล้วค่อยมอบหมายวิชาภายหลัง หรือพิมพ์ชื่อวิชาใหม่ของโรงเรียนแล้วกดบันทึก</span>
            </label>
          </div>
          <button className="primary-button">บันทึก</button>
        </form>
      )}

      <section className="panel data-panel">
        <ul className="record-list">
          {snapshot.teachers.map((teacher) => {
            const links = snapshot.classTeachers.filter((item) => item.teacherId === teacher.id);
            return (
              <li key={teacher.id}>
                <div className="record-main">
                  <div>
                    <strong>{teacher.displayName}</strong>
                    <span>{teacher.teacherCode} · {teacher.subject || 'ยังไม่ได้ระบุรายวิชา'}</span>
                  </div>
                  <span className={`status-chip ${verificationTone[teacher.verificationStatus]}`}>
                    {verificationLabels[teacher.verificationStatus]}
                  </span>
                  <span className="status-chip success">{links.length} ห้อง</span>
                </div>
                {membership.role === 'admin' && teacher.verificationStatus !== 'verified_teacher' && (
                  <div className="record-actions">
                    <button className="secondary-button" onClick={() => void verify(teacher.id, teacher.displayName)}>
                      ยืนยันสถานะครู
                    </button>
                    <span className="hint">ครูที่ยังไม่ยืนยันจะยังใช้งานข้อมูลห้องเรียนไม่ได้</span>
                  </div>
                )}
                {membership.role === 'admin' && teacher.verificationStatus === 'verified_teacher' && canEdit && (
                  <div className="record-actions">
                    {/* A teacher signs in with their name and code, and the gateway creates the Auth
                        identity on first use — so there is nothing to report about "having" an
                        account. What matters is whether the row is in a state the sign-in accepts,
                        and this makes it so in one click. */}
                    <button className="secondary-button" onClick={() => void activate(teacher.id)}>ยืนยันไอดี</button>
                    <button className="text-button" onClick={() => setPasswordTeacher(teacher)}>
                      {teacher.profileId ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
                    </button>
                    {teacher.profileId && (
                      <EraseAccountButton
                        schoolId={membership.schoolId} role="teacher" profileId={teacher.profileId}
                        displayName={teacher.displayName} onDone={setMessage}
                      />
                    )}
                  </div>
                )}
                {links.length > 0 && (
                  <div className="record-actions">
                    {links.map((link) => {
                      const classroom = snapshot.classes.find((item) => item.id === link.classId);
                      return (
                        <span key={link.id} className="status-chip">
                          {classroom?.name ?? 'ห้องที่ถูกลบ'} · {link.subjectId
                            ? (snapshot.subjects.find((subject) => subject.id === link.subjectId)?.name ?? 'วิชาที่ถูกลบ') + ' · '
                            : ''}{responsibilityLabels[responsibilityOf(link)]}
                          {canEdit && (
                            <button className="text-button" onClick={() => void repository.unassignTeacher(link.id)}>ยกเลิก</button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canEdit && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>มอบหมายครูเข้าห้องเรียน</h2></div>
          <div className="form-grid">
            <label>
              ครู
              <select value={assignment.teacherId} onChange={(event) => setAssignment({ ...assignment, teacherId: event.target.value })}>
                <option value="">เลือกครู</option>
                {snapshot.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
              </select>
            </label>
            <label>
              ห้องเรียน
              <select value={assignment.classId} onChange={(event) => setAssignment({ ...assignment, classId: event.target.value })}>
                <option value="">เลือกห้อง</option>
                {snapshot.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              หน้าที่
              <select value={assignment.responsibility} onChange={(event) => setAssignment({
                ...assignment, responsibility: event.target.value as TeacherResponsibility,
                subjectId: (event.target.value === 'SUBJECT_OWNER' || event.target.value === 'SUBJECT_CO_TEACHER') ? assignment.subjectId : ''
              })}>
                {responsibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              วิชาที่รับผิดชอบ
              <select
                value={assignment.subjectId}
                disabled={!responsibilityOptions.find((option) => option.value === assignment.responsibility)?.needsSubject}
                onChange={(event) => setAssignment({ ...assignment, subjectId: event.target.value })}
              >
                <option value="">{responsibilityOptions.find((option) => option.value === assignment.responsibility)?.needsSubject ? 'เลือกวิชา' : 'ไม่ใช้วิชา'}</option>
                {snapshot.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
          </div>
          <button className="secondary-button" onClick={() => void assign()}>บันทึกการมอบหมาย</button>
        </section>
      )}

      {passwordTeacher && canEdit && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ตั้งรหัสผ่านครู">
          <section className="modal-card">
            <div className="panel-heading"><h2>{passwordTeacher.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · {passwordTeacher.displayName}</h2><button type="button" className="icon-button" onClick={() => setPasswordTeacher(null)} aria-label="ปิด">×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password') ?? ''); const confirm = String(data.get('confirm') ?? ''); if (password.length < 8 || password !== confirm) { setMessage(password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; } void (passwordTeacher.profileId ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'teacher', profileId: passwordTeacher.profileId, password }) : provisionManagedAccount({ schoolId: membership.schoolId, role: 'teacher', recordId: passwordTeacher.id, displayName: passwordTeacher.displayName, password })).then(() => { setPasswordTeacher(null); setMessage('บันทึกรหัสผ่านครูแล้ว'); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ')); }}>
              <ManagedPasswordFields />
              <div className="modal-actions"><button type="button" className="text-button" onClick={() => setPasswordTeacher(null)}>ยกเลิก</button><button className="primary-button">บันทึก</button></div>
            </form>
          </section>
        </div>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
