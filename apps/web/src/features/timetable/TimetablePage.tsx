import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useRememberedClass } from '../../app/useRememberedClass';
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
  /*
   * The period currently being carried to another slot.
   *
   * Dragging is one way to pick it up and it is not the only one: a drag needs a pointer that can
   * hold, which rules out touch on this table and rules out a keyboard entirely. Pressing "ย้ายคาบนี้"
   * arms the same move, every slot then answers as a destination, and Escape puts it down.
   */
  const [moving, setMoving] = useState<TimetableEntry | null>(null);

  useEffect(() => {
    if (!moving) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoving(null); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [moving]);

  const activeTerm = snapshot.terms.find((term) => term.status === 'active') ?? snapshot.terms[0] ?? null;

  // A student or parent sees the class they belong to; staff pick any class.
  const ownStudent = snapshot.students.find((student) => student.profileId === membership.profileId);
  const ownClassId = ownStudent
    ? snapshot.enrollments.find((row) => row.studentId === ownStudent.id && row.status === 'active')?.classId ?? null
    : null;
  const visibleClasses = membership.role === 'admin' || membership.role === 'teacher'
    ? snapshot.classes
    : snapshot.classes.filter((row) => row.id === ownClassId);
  /*
   * A class named in the address wins the first pick.
   *
   * Attendance sends people here when the day has no timetable, and it knows which room they were
   * looking at. Without this they landed on whichever class sorts first and had to find theirs again
   * — the second half of the errand they were sent on. It is only the starting point: the picker
   * below still changes it, and an id that names no class this person may see is ignored rather than
   * shown as an empty table.
   */
  const [searchParams] = useSearchParams();
  const requestedClassId = searchParams.get('class') ?? '';
  const [selectedClassId, setClassId] = useRememberedClass(visibleClasses, requestedClassId || ownClassId);
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

  const clockFor = (period: number, fallback: { startTime: string; endTime: string }) => periodClock[period] ?? fallback;
  const subjectName = (entry: TimetableEntry) => snapshot.subjects.find((row) => row.id === entry.subjectId)?.name ?? null;

  /**
   * Puts a period down in another slot, trading places with whatever was already there.
   *
   * Re-typing a lesson into the slot next door and deleting the old one is the same week either
   * way, and it is four screens of work per move. This is one gesture, and the swap is the point:
   * a full timetable has no empty slot to move into, so "move" without "swap" would refuse most of
   * the moves anybody actually wants to make.
   */
  async function moveEntry(entry: TimetableEntry, dayOfWeek: number, period: number) {
    const own = { startTime: entry.startTime, endTime: entry.endTime };
    const displaced = slots.get(`${dayOfWeek}-${period}`) ?? null;
    try {
      await repository.moveTimetableEntry({
        entryId: entry.id, dayOfWeek, period,
        destinationClock: clockFor(period, own),
        originClock: clockFor(entry.period, own)
      });
      const where = `${dayNames[dayOfWeek - 1]} คาบ ${period}`;
      toast(displaced && displaced.id !== entry.id ? `สลับคาบกับ ${where} แล้ว` : `ย้ายไป ${where} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ย้ายคาบเรียนไม่สำเร็จ', { tone: 'error' });
    } finally {
      setMoving(null);
    }
  }

  function drop(event: DragEvent<HTMLTableCellElement>, dayOfWeek: number, period: number) {
    event.preventDefault();
    const carried = event.dataTransfer.getData('text/timetable-entry');
    const entry = plannedSlots.find((row) => row.id === carried) ?? moving;
    if (entry) void moveEntry(entry, dayOfWeek, period);
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
            description={canEdit
              ? 'อ่านทีละวันจากซ้ายไปขวา · กดช่องว่างเพื่อเพิ่มคาบ กดคาบเดิมเพื่อแก้ไข หรือลากคาบไปวางในช่องอื่นเพื่อย้ายและสลับ'
              : 'อ่านทีละวันจากซ้ายไปขวา · แสดงเฉพาะตารางของห้องที่คุณสังกัด'}
            action={(
              <div className="timetable-legend" aria-label="คำอธิบายสี">
                <span><i className="legend-dot filled" aria-hidden="true" />มีเรียน</span>
                <span><i className="legend-dot empty" aria-hidden="true" />ว่าง</span>
              </div>
            )}
          />
          {moving && (
            <div className="timetable-moving" role="status">
              <span className="timetable-moving-copy">
                <strong>กำลังย้าย {subjectName(moving) ?? 'คาบเรียน'}</strong>
                <span>จาก {dayNames[moving.dayOfWeek - 1]} คาบ {moving.period} · เลือกช่องปลายทางในตาราง หรือกด Esc เพื่อยกเลิก</span>
              </span>
              <Button variant="ghost" type="button" onClick={() => setMoving(null)}>ยกเลิกการย้าย</Button>
            </div>
          )}
          {/*
            A day per row, a period per column.
            The week used to run downwards: to read Monday somebody read down the first column, and
            to compare Monday with Tuesday they read two columns in parallel. A day is the unit
            everybody actually asks for — "what do I have on Wednesday" — so a day is now a line,
            read left to right the way the day is lived.
          */}
          <div className="scroll-x timetable-scroll">
            <table className="timetable-grid">
            <thead>
              <tr>
                <th scope="col" className="timetable-corner">วัน</th>
                {periods.map((period) => (
                  <th key={period} scope="col">
                    คาบ {period}
                    <span>{periodClock[period]?.startTime}–{periodClock[period]?.endTime}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachingDays.map((day) => (
                <tr key={day}>
                  <th scope="row" className="timetable-day">{dayNames[day - 1]}</th>
                  {periods.map((period) => {
                    const entry = slots.get(`${day}-${period}`) ?? null;
                    const subject = entry ? snapshot.subjects.find((row) => row.id === entry.subjectId) : undefined;
                    const teacher = entry ? snapshot.teachers.find((row) => row.id === entry.teacherId) : undefined;
                    const carrying = Boolean(moving) && moving?.id !== entry?.id;
                    const content = entry ? (
                      <>
                        {/* The dot is the visual; the word inside it is for a reader who cannot see
                            a dot. It was being clipped rather than hidden, so it was real text
                            painted at the size of a full stop in whatever colour it inherited. */}
                        <div className="slot-topline">
                          <span className="slot-status"><span>มีเรียน</span></span>
                        </div>
                        <strong>{subject?.name ?? 'ไม่ระบุวิชา'}</strong>
                        <span>{teacher?.displayName ?? 'ยังไม่กำหนดครู'}</span>
                        {entry.room && <span>{entry.room}</span>}
                        <span className="slot-time">{entry.startTime}–{entry.endTime}</span>
                      </>
                    ) : (
                      <>
                        {/*
                          One label, not two.
                          The cell used to say "ว่าง" and then "เพิ่มคาบเรียน" underneath it in 10px
                          grey — the same fact twice, the second time below the size at which body
                          text is legible. Somebody who can put a lesson here is told what pressing
                          does; somebody who cannot is told what the cell is. Neither needs both.
                          The glyph is the product's own plus, not the full-width "＋", which is a
                          different character and renders at a different size in most Thai fonts.
                        */}
                        <span className="slot-empty-icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
                        <span className="slot-empty">{canEdit ? 'เพิ่มคาบเรียน' : 'ว่าง'}</span>
                      </>
                    );
                    const place = `${dayNames[day - 1]} คาบ ${period}`;
                    const label = carrying
                      ? (entry ? `สลับ ${subjectName(moving!) ?? 'คาบที่ย้าย'} กับ ${subject?.name ?? 'คาบนี้'} ที่ ${place}` : `ย้าย ${subjectName(moving!) ?? 'คาบที่ย้าย'} มาที่ ${place} ซึ่งว่างอยู่`)
                      : `${place}${entry ? ` ${subject?.name ?? 'มีเรียน'}` : ' ว่าง เพิ่มคาบเรียน'}`;
                    return (
                      <td
                        key={period}
                        className={`${entry ? 'slot filled' : 'slot'}${moving?.id === entry?.id && entry ? ' slot-lifted' : ''}${carrying ? ' slot-target' : ''}`}
                        data-day={dayNames[day - 1]}
                        data-period={period}
                        onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                        onDrop={canEdit ? (event) => drop(event, day, period) : undefined}
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            className="slot-button"
                            aria-label={label}
                            draggable={Boolean(entry)}
                            onDragStart={entry ? (event) => {
                              event.dataTransfer.setData('text/timetable-entry', entry.id);
                              event.dataTransfer.effectAllowed = 'move';
                              setMoving(entry);
                            } : undefined}
                            onDragEnd={() => setMoving(null)}
                            onClick={() => {
                              if (moving && moving.id !== entry?.id) void moveEntry(moving, day, period);
                              else setDraft({ dayOfWeek: day, period, entry });
                            }}
                          >
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
                <>
                  {/* WCAG 2.2 asks that anything a drag can do, a single tap can do too. This is that
                      tap: it arms the move and the table takes the next press as the destination. */}
                  <Button
                    variant="secondary" type="button" icon={<Icon name="promotion" size={16} />}
                    onClick={() => { setMoving(draft.entry); setDraft(null); }}
                  >
                    ย้ายคาบนี้
                  </Button>
                  <Button variant="danger" type="button" onClick={() => void remove(draft.entry!)}>ลบคาบนี้</Button>
                </>
              )}
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

    </>
  );
}
