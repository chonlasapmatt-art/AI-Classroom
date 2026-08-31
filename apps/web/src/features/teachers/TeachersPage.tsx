import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { requireSupabase } from '../../services/supabase';
import { TeacherAccessCodePanel } from './TeacherAccessCodePanel';
import type { TeacherVerificationStatus } from '../../domain/types';

const verificationLabels: Record<TeacherVerificationStatus, string> = {
  teacher_requested: 'ขอสิทธิ์ครู', verification_pending: 'รอตรวจสอบ',
  verified_teacher: 'ยืนยันแล้ว', revoked: 'ถูกเพิกถอน'
};
const verificationTone: Record<TeacherVerificationStatus, string> = {
  teacher_requested: 'warning', verification_pending: 'warning', verified_teacher: 'success', revoked: 'danger'
};

export function TeachersPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<{ teacherId: string; classId: string; role: 'primary' | 'assistant' }>({
    teacherId: '', classId: '', role: 'primary'
  });

  const canEdit = (membership.role === 'admin' || membership.role === 'teacher') && repository.canManageStructure;

  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const teacherId = crypto.randomUUID();
      await repository.saveTeacher({
        id: teacherId,
        teacherCode: String(data.get('code') ?? '').trim(),
        displayName: String(data.get('name') ?? '').trim(),
        email: String(data.get('email') ?? '').trim(),
        subject: String(data.get('subject') ?? '').trim()
      });
      if (mode === 'cloud' && data.get('invite') === 'on') {
        const { data: invitation, error } = await requireSupabase().functions.invoke('member-invitation', {
          body: { action: 'create', schoolId: membership.schoolId, role: 'teacher', targetEntityId: teacherId, email: String(data.get('email') ?? '').trim() }
        });
        if (error) throw error;
        setMessage(`เพิ่มครูแล้ว · รหัสคำเชิญ ${(invitation as { code?: string } | null)?.code ?? 'สร้างแล้ว'}`);
      } else {
        setMessage('เพิ่มครูแล้ว');
      }
      form.reset();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
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

      <TeacherAccessCodePanel />

      {canEdit && (
        <form className="panel inline-form" onSubmit={(event) => void createTeacher(event)}>
          <div className="panel-heading"><h2>เพิ่มครู</h2></div>
          <div className="form-grid">
            <label>รหัสครู<input name="code" required /></label>
            <label>ชื่อ-สกุล<input name="name" required /></label>
            <label>อีเมล<input name="email" type="email" required /></label>
            <label>กลุ่มสาระ<input name="subject" required /></label>
            {mode === 'cloud' && <label className="checkbox-field"><input name="invite" type="checkbox" /> สร้างคำเชิญบัญชีเข้าใช้งาน</label>}
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
