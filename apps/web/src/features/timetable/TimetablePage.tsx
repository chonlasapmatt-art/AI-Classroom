import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { TimetableEntry } from '../../domain/types';

const dayNames = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const teachingDays = [1, 2, 3, 4, 5];
const periods = [1, 2, 3, 4, 5, 6, 7, 8];

/** Default clock for a new slot, so adding a period rarely needs the time fields touched. */
const periodClock: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '08:30', endTime: '09:20' }, 2: { startTime: '09:30', endTime: '10:20' },
  3: { startTime: '10:30', endTime: '11:20' }, 4: { startTime: '11:30', endTime: '12:20' },
  5: { startTime: '13:00', endTime: '13:50' }, 6: { startTime: '14:00', endTime: '14:50' },
  7: { startTime: '15:00', endTime: '15:50' }, 8: { startTime: '16:00', endTime: '16:50' }
};

interface SlotDraft { dayOfWeek: number; period: number; entry: TimetableEntry | null }

export function TimetablePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);

  const canEdit = membership.role === 'admin' || membership.role === 'teacher';
  const activeTerm = snapshot.terms.find((term) => term.status === 'active') ?? snapshot.terms[0] ?? null;

  // A student or parent sees the class they belong to; staff pick any class.
  const ownStudent = snapshot.students.find((student) => student.profileId === membership.profileId);
  const ownClassId = ownStudent
    ? snapshot.enrollments.find((row) => row.studentId === ownStudent.id && row.status === 'active')?.classId ?? null
    : null;
  const visibleClasses = canEdit ? snapshot.classes : snapshot.classes.filter((row) => row.id === ownClassId);
  const [classId, setClassId] = useState<string>(ownClassId ?? '');
  const selectedClassId = classId || visibleClasses[0]?.id || '';

  const slots = useMemo(() => {
    const map = new Map<string, TimetableEntry>();
    for (const entry of snapshot.timetable) {
      if (entry.classId !== selectedClassId || entry.status !== 'active') continue;
      if (activeTerm && entry.academicTermId !== activeTerm.id) continue;
      map.set(`${entry.dayOfWeek}-${entry.period}`, entry);
    }
    return map;
  }, [activeTerm, selectedClassId, snapshot.timetable]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !activeTerm || !selectedClassId) return;
    const values = new FormData(event.currentTarget);
    try {
      await repository.saveTimetableEntry({
        ...(draft.entry ? { id: draft.entry.id } : {}),
        classId: selectedClassId,
        subjectId: String(values.get('subjectId') ?? '') || null,
        teacherId: String(values.get('teacherId') ?? '') || null,
        academicTermId: activeTerm.id,
        dayOfWeek: draft.dayOfWeek,
        period: draft.period,
        startTime: String(values.get('startTime') ?? ''),
        endTime: String(values.get('endTime') ?? ''),
        room: String(values.get('room') ?? '')
      });
      setDraft(null);
      setMessage('บันทึกคาบเรียนแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกคาบเรียนไม่สำเร็จ');
    }
  }

  async function remove(entry: TimetableEntry) {
    try {
      await repository.removeTimetableEntry(entry.id);
      setDraft(null);
      setMessage('ลบคาบเรียนแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ลบคาบเรียนไม่สำเร็จ');
    }
  }

  if (!activeTerm) {
    return (
      <section className="page-heading">
        <div><h1>ตารางสอน</h1><p>ยังไม่มีปีการศึกษาที่เปิดใช้งาน จึงยังจัดตารางสอนไม่ได้</p></div>
      </section>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">ตารางเรียน</span>
          <h1>ตารางสอน</h1>
          <p>ปีการศึกษา {activeTerm.academicYear} ภาคเรียนที่ {activeTerm.term} · {slots.size} คาบต่อสัปดาห์</p>
        </div>
        {visibleClasses.length > 1 && (
          <label className="inline-select">
            ห้องเรียน
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
      </section>

      {visibleClasses.length === 0 ? (
        <section className="panel"><p>ยังไม่มีห้องเรียนที่ดูตารางได้</p></section>
      ) : (
        <section className="panel data-panel scroll-x">
          <table className="timetable-grid">
            <thead>
              <tr>
                <th scope="col">คาบ</th>
                {teachingDays.map((day) => <th key={day} scope="col">{dayNames[day - 1]}</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period}>
                  <th scope="row">
                    {period}
                    <span>{periodClock[period]?.startTime}</span>
                  </th>
                  {teachingDays.map((day) => {
                    const entry = slots.get(`${day}-${period}`) ?? null;
                    const subject = entry ? snapshot.subjects.find((row) => row.id === entry.subjectId) : undefined;
                    const teacher = entry ? snapshot.teachers.find((row) => row.id === entry.teacherId) : undefined;
                    const content = entry ? (
                      <>
                        <strong>{subject?.name ?? 'ไม่ระบุวิชา'}</strong>
                        <span>{teacher?.displayName ?? 'ยังไม่กำหนดครู'}</span>
                        {entry.room && <span>{entry.room}</span>}
                        <span className="slot-time">{entry.startTime}–{entry.endTime}</span>
                      </>
                    ) : <span className="slot-empty">ว่าง</span>;
                    return (
                      <td key={day} className={entry ? 'slot filled' : 'slot'}>
                        {canEdit ? (
                          <button type="button" className="slot-button" onClick={() => setDraft({ dayOfWeek: day, period, entry })}>
                            {content}
                          </button>
                        ) : content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {draft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขคาบเรียน">
          <form className="modal-card" onSubmit={(event) => void save(event)}>
            <h2>{dayNames[draft.dayOfWeek - 1]} · คาบ {draft.period}</h2>
            <div className="form-grid">
              <label>
                รายวิชา
                <select name="subjectId" defaultValue={draft.entry?.subjectId ?? ''}>
                  <option value="">ไม่ระบุ</option>
                  {snapshot.subjects.filter((row) => row.status === 'active')
                    .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              <label>
                ครูผู้สอน
                <select name="teacherId" defaultValue={draft.entry?.teacherId ?? ''}>
                  <option value="">ไม่ระบุ</option>
                  {snapshot.teachers.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </label>
              <label>เวลาเริ่ม<input name="startTime" type="time" required defaultValue={draft.entry?.startTime ?? periodClock[draft.period]?.startTime ?? '08:30'} /></label>
              <label>เวลาสิ้นสุด<input name="endTime" type="time" required defaultValue={draft.entry?.endTime ?? periodClock[draft.period]?.endTime ?? '09:20'} /></label>
              <label>ห้อง<input name="room" defaultValue={draft.entry?.room ?? ''} /></label>
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="submit">บันทึก</button>
              {draft.entry && (
                <button className="danger-button" type="button" onClick={() => void remove(draft.entry!)}>ลบคาบนี้</button>
              )}
              <button className="text-button" type="button" onClick={() => setDraft(null)}>ยกเลิก</button>
            </div>
          </form>
        </div>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
