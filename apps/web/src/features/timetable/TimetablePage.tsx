import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { TimetableEntry } from '../../domain/types';
import { teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import { Button, Card, CardHeader, EmptyState, Field, FieldGroup, Modal, PageHeader, Stat } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

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
  const { toast } = useToast();
  const [draft, setDraft] = useState<SlotDraft | null>(null);

  const activeTerm = snapshot.terms.find((term) => term.status === 'active') ?? snapshot.terms[0] ?? null;

  // A student or parent sees the class they belong to; staff pick any class.
  const ownStudent = snapshot.students.find((student) => student.profileId === membership.profileId);
  const ownClassId = ownStudent
    ? snapshot.enrollments.find((row) => row.studentId === ownStudent.id && row.status === 'active')?.classId ?? null
    : null;
  const visibleClasses = membership.role === 'admin' || membership.role === 'teacher'
    ? snapshot.classes
    : snapshot.classes.filter((row) => row.id === ownClassId);
  const [classId, setClassId] = useState<string>(ownClassId ?? '');
  const selectedClassId = classId || visibleClasses[0]?.id || '';
  const canEdit = membership.role === 'admin' || (membership.role === 'teacher' && teacherOwnedSubjectIds(snapshot, membership.profileId, selectedClassId).size > 0);

  const slots = useMemo(() => {
    const map = new Map<string, TimetableEntry>();
    for (const entry of snapshot.timetable) {
      if (entry.classId !== selectedClassId || entry.status !== 'active') continue;
      if (activeTerm && entry.academicTermId !== activeTerm.id) continue;
      map.set(`${entry.dayOfWeek}-${entry.period}`, entry);
    }
    return map;
  }, [activeTerm, selectedClassId, snapshot.timetable]);

  const selectedClass = visibleClasses.find((item) => item.id === selectedClassId) ?? null;
  const plannedSlots = useMemo(() => [...slots.values()], [slots]);
  const subjectCount = new Set(plannedSlots.map((entry) => entry.subjectId).filter(Boolean)).size;
  const teacherCount = new Set(plannedSlots.map((entry) => entry.teacherId).filter(Boolean)).size;
  const totalSlots = periods.length * teachingDays.length;

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
      toast('บันทึกคาบเรียนแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกคาบเรียนไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function remove(entry: TimetableEntry) {
    try {
      await repository.removeTimetableEntry(entry.id);
      setDraft(null);
      toast('ลบคาบเรียนแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ลบคาบเรียนไม่สำเร็จ', { tone: 'error' });
    }
  }

  if (!activeTerm) {
    return (
      <>
        <PageHeader eyebrow="ตารางเรียน" title="ตารางสอน" />
        <Card>
          <EmptyState
            icon={<Icon name="calendar" size={28} />}
            title="ยังไม่มีปีการศึกษาที่เปิดใช้งาน"
            description="ตารางสอนผูกกับปีการศึกษา · เปิดปีการศึกษาที่หน้า “เลื่อนชั้น” ก่อน แล้วกลับมาที่นี่"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="ตารางเรียน"
        title="ตารางสอน"
        description={`ปีการศึกษา ${activeTerm.academicYear} · ภาคเรียนที่ ${activeTerm.term}`}
        action={visibleClasses.length > 1 ? (
          <Field label="ห้องเรียน">
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        ) : undefined}
      />

      {visibleClasses.length > 0 && (
        <div className="ui-stat-grid">
          <Stat
            label="คาบที่จัดไว้"
            value={slots.size}
            hint={`จาก ${totalSlots} ช่องในสัปดาห์`}
            tone={slots.size > 0 ? 'brand' : 'neutral'}
            icon={<Icon name="timetable" size={18} />}
          />
          <Stat label="รายวิชา" value={subjectCount} hint="วิชาที่อยู่ในตาราง" tone="info" icon={<Icon name="subjects" size={18} />} />
          <Stat
            label="ครูผู้สอน"
            value={teacherCount}
            hint="คนที่ได้รับมอบหมาย"
            tone={teacherCount > 0 ? 'success' : 'warning'}
            icon={<Icon name="teachers" size={18} />}
          />
          <Stat
            label="ห้องเรียน"
            value={selectedClass?.name ?? '—'}
            hint={canEdit ? 'กดช่องในตารางเพื่อจัดคาบ' : 'ตารางของห้องที่คุณสังกัด'}
            tone="neutral"
            icon={<Icon name="classes" size={18} />}
          />
        </div>
      )}

      {visibleClasses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="timetable" size={28} />}
            title="ยังไม่มีห้องเรียน"
            description="ยังไม่มีห้องเรียนที่คุณมีสิทธิ์ดูตารางได้ · ถ้าคิดว่าผิด กรุณาแจ้งผู้ดูแลโรงเรียน"
          />
        </Card>
      ) : (
        <Card className="timetable-panel">
          <CardHeader
            title="ตารางประจำสัปดาห์"
            description={canEdit ? 'กดช่องว่างเพื่อเพิ่มคาบ หรือกดคาบเดิมเพื่อแก้ไข' : 'แสดงเฉพาะตารางของห้องที่คุณสังกัด'}
            action={(
              <div className="timetable-legend" aria-label="คำอธิบายสี">
                <span><i className="legend-dot filled" aria-hidden="true" />มีเรียน</span>
                <span><i className="legend-dot empty" aria-hidden="true" />ว่าง</span>
              </div>
            )}
          />
          <div className="scroll-x timetable-scroll">
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
                        {/* The dot is the visual; the word inside it is for a reader who cannot see
                            a dot. It was being clipped rather than hidden, so it was real text
                            painted at the size of a full stop in whatever colour it inherited. */}
                        <div className="slot-topline">
                          <span className="slot-period-label">คาบ {period}</span>
                          <span className="slot-status"><span>มีเรียน</span></span>
                        </div>
                        <strong>{subject?.name ?? 'ไม่ระบุวิชา'}</strong>
                        <span>{teacher?.displayName ?? 'ยังไม่กำหนดครู'}</span>
                        {entry.room && <span>{entry.room}</span>}
                        <span className="slot-time">{entry.startTime}–{entry.endTime}</span>
                      </>
                    ) : (
                      <>
                        {/* Was the full-width plus sign "＋", which is a different glyph from the
                            ordinary one and renders at a different size in most Thai fonts. */}
                        <span className="slot-empty-icon" aria-hidden="true"><Icon name="plus" size={16} /></span>
                        <span className="slot-empty">ว่าง</span>
                        {canEdit && <small>เพิ่มคาบเรียน</small>}
                      </>
                    );
                    return (
                      <td key={day} className={entry ? 'slot filled' : 'slot'} data-day={dayNames[day - 1]} data-period={period}>
                        {canEdit ? (
                          <button type="button" className="slot-button" aria-label={`${dayNames[day - 1]} คาบ ${period}${entry ? ` ${subject?.name ?? 'มีเรียน'}` : ' ว่าง เพิ่มคาบเรียน'}`} onClick={() => setDraft({ dayOfWeek: day, period, entry })}>
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
          </div>
        </Card>
      )}

      {/* Was a hand-built backdrop with no focus trap, no Escape and no focus returned — on a form
          a teacher opens dozens of times while laying out a week. */}
      {draft && (
        <Modal
          title={`${dayNames[draft.dayOfWeek - 1]} · คาบ ${draft.period}`}
          description="เวลาที่ตั้งไว้ที่นี่คือเวลาที่หน้าเช็กชื่อใช้แยกคาบของวันนั้น"
          onClose={() => setDraft(null)}
        >
          <form onSubmit={(event) => void save(event)}>
            <FieldGroup>
              <Field label="รายวิชา">
                <select name="subjectId" defaultValue={draft.entry?.subjectId ?? ''}>
                  <option value="">ไม่ระบุ</option>
                  {snapshot.subjects.filter((row) => row.status === 'active')
                    .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>
              <Field label="ครูผู้สอน">
                <select name="teacherId" defaultValue={draft.entry?.teacherId ?? ''}>
                  <option value="">ไม่ระบุ</option>
                  {snapshot.teachers.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </Field>
              <Field label="เวลาเริ่ม">
                <input name="startTime" type="time" required defaultValue={draft.entry?.startTime ?? periodClock[draft.period]?.startTime ?? '08:30'} />
              </Field>
              <Field label="เวลาสิ้นสุด">
                <input name="endTime" type="time" required defaultValue={draft.entry?.endTime ?? periodClock[draft.period]?.endTime ?? '09:20'} />
              </Field>
              <Field label="ห้อง" hint="ไม่บังคับ"><input name="room" defaultValue={draft.entry?.room ?? ''} /></Field>
            </FieldGroup>
            <div className="ui-page-actions">
              <Button variant="ghost" type="button" onClick={() => setDraft(null)}>ยกเลิก</Button>
              {draft.entry && (
                <Button variant="danger" type="button" onClick={() => void remove(draft.entry!)}>ลบคาบนี้</Button>
              )}
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

    </>
  );
}
