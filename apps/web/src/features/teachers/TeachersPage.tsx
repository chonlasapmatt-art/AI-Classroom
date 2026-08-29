import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';

export function TeachersPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<{ teacherId: string; classId: string; role: 'primary' | 'assistant' }>({
    teacherId: '', classId: '', role: 'primary'
  });

  const canEdit = membership.role === 'admin' && repository.canManageStructure;

  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await repository.saveTeacher({
        teacherCode: String(data.get('code') ?? '').trim(),
        displayName: String(data.get('name') ?? '').trim(),
        email: String(data.get('email') ?? '').trim(),
        subject: String(data.get('subject') ?? '').trim()
      });
      form.reset();
      setMessage('เพิ่มครูแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  async function assign() {
    if (!assignment.teacherId || !assignment.classId) return;
    try {
      await repository.assignTeacher(assignment.classId, assignment.teacherId, assignment.role);
      setMessage('กำหนดครูประจำห้องแล้ว');
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
            <label>รหัสครู<input name="code" required /></label>
            <label>ชื่อ-สกุล<input name="name" required /></label>
            <label>อีเมล<input name="email" type="email" required /></label>
            <label>กลุ่มสาระ<input name="subject" required /></label>
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
                    <span>{teacher.teacherCode} · {teacher.subject} · {teacher.email}</span>
                  </div>
                  <span className="status-chip success">{links.length} ห้อง</span>
                </div>
                {links.length > 0 && (
                  <div className="record-actions">
                    {links.map((link) => {
                      const classroom = snapshot.classes.find((item) => item.id === link.classId);
                      return (
                        <span key={link.id} className="status-chip">
                          {classroom?.name ?? 'ห้องที่ถูกลบ'} · {link.role === 'primary' ? 'ครูประจำชั้น' : 'ครูผู้ช่วย'}
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
              บทบาท
              <select value={assignment.role} onChange={(event) => setAssignment({ ...assignment, role: event.target.value as 'primary' | 'assistant' })}>
                <option value="primary">ครูประจำชั้น</option>
                <option value="assistant">ครูผู้ช่วย</option>
              </select>
            </label>
          </div>
          <button className="secondary-button" onClick={() => void assign()}>บันทึกการมอบหมาย</button>
        </section>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
