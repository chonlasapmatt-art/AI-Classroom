import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useRememberedClass } from '../../app/useRememberedClass';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { TimetableEntry } from '../../domain/types';
import { teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import { Button, Card, CardHeader, EmptyState, Field, FieldGroup, Modal, PageHeader, Segmented, Stat } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { useViewportAtLeast } from './useWideViewport';

const dayNames = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const shortDayNames = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const teachingDays = [1, 2, 3, 4, 5];
const periods = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * The width at which a week fits without anybody having to push it sideways.
 *
 * Five day columns and a period rail need roughly 840px of content, and the content column is the
 * window less the menu. Below this the week becomes one day at a time instead of a grid that has to
 * be dragged — see the note on the day view.
 */
const WEEK_FITS_FROM = 1120;

/** Default clock for a new slot, so adding a period rarely needs the time fields touched. */
const periodClock: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '08:30', endTime: '09:20' }, 2: { startTime: '09:30', endTime: '10:20' },
  3: { startTime: '10:30', endTime: '11:20' }, 4: { startTime: '11:30', endTime: '12:20' },
  5: { startTime: '13:00', endTime: '13:50' }, 6: { startTime: '14:00', endTime: '14:50' },
  7: { startTime: '15:00', endTime: '15:50' }, 8: { startTime: '16:00', endTime: '16:50' }
};

interface SlotDraft { dayOfWeek: number; period: number; entry: TimetableEntry | null }

/** Monday is 1 here, as everywhere else in this file; `getDay()` calls Sunday 0. */
function todayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

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
  // Somebody who lays out a week wants the week's totals; somebody who attends it does not.
  const planner = membership.role === 'admin' || membership.role === 'teacher';

  /*
   * One day, or the whole week.
   *
   * The week used to be the only shape: eight period columns beside five day rows, 1180px wide, in
   * a content column that is under 900px on an ordinary laptop. So it was scrolled sideways, and a
   * sticky day column was pinned over the scroll to keep the days in view — which is precisely how
   * a lesson ends up sliding underneath the day it belongs to. Measured mid-scroll, a whole 120px
   * card sat behind the rail. No amount of shading fixes that; the card really is under there.
   *
   * The week is a grid again, transposed: five day columns and eight period rows fit in the space
   * available, so there is no sideways scroll, no pinned column, and nothing that can be covered by
   * anything. Below that width the same data is read a day at a time — which is the question people
   * actually ask ("what do I have on Wednesday") and the only shape that works on a phone.
   */
  const weekFits = useViewportAtLeast(WEEK_FITS_FROM);
  const [preferredView, setPreferredView] = useState<'day' | 'week'>('week');
  const view = weekFits ? preferredView : 'day';
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = todayIndex();
    return teachingDays.includes(today) ? today : teachingDays[0]!;
  });

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
  const lessonsPerDay = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of plannedSlots) counts.set(entry.dayOfWeek, (counts.get(entry.dayOfWeek) ?? 0) + 1);
    return counts;
  }, [plannedSlots]);

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

  function drop(event: DragEvent<HTMLElement>, dayOfWeek: number, period: number) {
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

  /** What is written inside one slot, in either shape. */
  function slotContent(entry: TimetableEntry | null, showClock: boolean): ReactNode {
    if (!entry) {
      return (
        <>
          {/*
            One label, not two.
            The cell used to say "ว่าง" and then "เพิ่มคาบเรียน" underneath it in 10px grey — the
            same fact twice, the second time below the size at which body text is legible. Somebody
            who can put a lesson here is told what pressing does; somebody who cannot is told what
            the cell is. Neither needs both.
          */}
          <span className="slot-empty-icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
          <span className="slot-empty">{canEdit ? 'เพิ่มคาบเรียน' : 'ว่าง'}</span>
        </>
      );
    }
    const subject = snapshot.subjects.find((row) => row.id === entry.subjectId);
    const teacher = snapshot.teachers.find((row) => row.id === entry.teacherId);
    return (
      <>
        {/* The dot is the visual; the word inside it is for a reader who cannot see a dot. */}
        <div className="slot-topline">
          <span className="slot-status"><span>มีเรียน</span></span>
        </div>
        <strong>{subject?.name ?? 'ไม่ระบุวิชา'}</strong>
        <span>{teacher?.displayName ?? 'ยังไม่กำหนดครู'}</span>
        {entry.room && <span>{entry.room}</span>}
        {showClock && <span className="slot-time">{entry.startTime}–{entry.endTime}</span>}
      </>
    );
  }

  /** The label a screen reader hears, which has to say where the slot is as well as what is in it. */
  function slotLabel(entry: TimetableEntry | null, day: number, period: number, carrying: boolean): string {
    const place = `${dayNames[day - 1]} คาบ ${period}`;
    const subject = entry ? snapshot.subjects.find((row) => row.id === entry.subjectId)?.name ?? 'มีเรียน' : null;
    if (carrying) {
      const carried = moving ? subjectName(moving) ?? 'คาบที่ย้าย' : 'คาบที่ย้าย';
      return entry
        ? `สลับ ${carried} กับ ${subject} ที่ ${place}`
        : `ย้าย ${carried} มาที่ ${place} ซึ่งว่างอยู่`;
    }
    return `${place}${entry ? ` ${subject}` : ' ว่าง เพิ่มคาบเรียน'}`;
  }

  /** The pressable part of a slot, shared by the week grid and the day list. */
  function slotControl(entry: TimetableEntry | null, day: number, period: number, showClock: boolean) {
    const carrying = Boolean(moving) && moving?.id !== entry?.id;
    const content = slotContent(entry, showClock);
    if (!canEdit) return content;
    return (
      <button
        type="button"
        className="slot-button"
        aria-label={slotLabel(entry, day, period, carrying)}
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
    );
  }

  function slotClassName(entry: TimetableEntry | null, base: string) {
    const carrying = Boolean(moving) && moving?.id !== entry?.id;
    return [
      base,
      entry ? 'filled' : '',
      entry && moving?.id === entry.id ? 'slot-lifted' : '',
      carrying ? 'slot-target' : ''
    ].filter(Boolean).join(' ');
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

  const today = todayIndex();
  /*
   * The week's totals are for the person laying the week out — and even for them they are not the
   * first thing on a phone. Four full-height cards counting slots, subjects and staff filled the
   * screen before a single lesson appeared, so on a narrow screen they move below the timetable:
   * the lessons are what the page is, the totals are what it adds up to.
   */
  const summary = planner && visibleClasses.length > 0 ? (
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
  ) : null;

  const dayLessons = periods
    .map((period) => ({ period, entry: slots.get(`${selectedDay}-${period}`) ?? null }))
    // A person who cannot edit has nothing to do with an empty period, and eight rows of "ว่าง" is
    // the whole screen saying nothing. A person who can edit needs them: that is where a lesson goes.
    .filter((row) => canEdit || row.entry);

  return (
    <>
      <PageHeader
        eyebrow="ตารางเรียน"
        title={planner ? 'ตารางสอน' : 'ตารางเรียน'}
        description={`ปีการศึกษา ${activeTerm.academicYear} · ภาคเรียนที่ ${activeTerm.term}`}
        action={visibleClasses.length > 1 ? (
          <Field label="ห้องเรียน">
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        ) : undefined}
      />

      {weekFits && summary}

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
            title={view === 'week' ? 'ตารางประจำสัปดาห์' : 'ตารางรายวัน'}
            description={canEdit
              ? 'กดช่องว่างเพื่อเพิ่มคาบ กดคาบเดิมเพื่อแก้ไข หรือลากคาบไปวางในช่องอื่นเพื่อย้ายและสลับ'
              : 'คาบเรียนของห้องที่คุณสังกัด · เวลาตามที่โรงเรียนกำหนด'}
            action={weekFits ? (
              <Segmented
                ariaLabel="รูปแบบการดูตาราง"
                value={preferredView}
                onChange={setPreferredView}
                options={[
                  { value: 'day' as const, label: 'รายวัน' },
                  { value: 'week' as const, label: 'ทั้งสัปดาห์' }
                ]}
              />
            ) : undefined}
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

          {view === 'week' ? (
            /*
              A day per column, a period per row.
              This is the orientation that fits: five columns and a period rail come in under the
              width of the content area, so the week is a grid that is simply there rather than a
              wide table dragged past a pinned column.
            */
            <table className="timetable-week">
              <thead>
                <tr>
                  <th scope="col" className="timetable-week-corner">คาบ</th>
                  {teachingDays.map((day) => (
                    <th key={day} scope="col" className={day === today ? 'is-today' : undefined}>
                      {dayNames[day - 1]}
                      <span>{day === today ? 'วันนี้' : `${lessonsPerDay.get(day) ?? 0} คาบ`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period}>
                    <th scope="row" className="timetable-week-period">
                      คาบ {period}
                      <span>{periodClock[period]?.startTime}–{periodClock[period]?.endTime}</span>
                    </th>
                    {teachingDays.map((day) => {
                      const entry = slots.get(`${day}-${period}`) ?? null;
                      return (
                        <td
                          key={day}
                          className={slotClassName(entry, 'slot')}
                          data-day={dayNames[day - 1]}
                          data-period={period}
                          onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                          onDrop={canEdit ? (event) => drop(event, day, period) : undefined}
                        >
                          {slotControl(entry, day, period, false)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              {/* The days as a row of buttons rather than a table axis, so choosing one is a tap. */}
              <div className="timetable-days" role="tablist" aria-label="เลือกวัน">
                {teachingDays.map((day) => {
                  const count = lessonsPerDay.get(day) ?? 0;
                  return (
                    <button
                      key={day}
                      type="button"
                      role="tab"
                      aria-selected={day === selectedDay}
                      className={`timetable-day-chip${day === selectedDay ? ' is-selected' : ''}${day === today ? ' is-today' : ''}`}
                      onClick={() => setSelectedDay(day)}
                    >
                      <span className="timetable-day-name">{shortDayNames[day - 1]}</span>
                      <span className="timetable-day-count">{count > 0 ? `${count} คาบ` : 'ว่าง'}</span>
                    </button>
                  );
                })}
              </div>

              <p className="timetable-day-title">
                {dayNames[selectedDay - 1]}
                {selectedDay === today && <span className="timetable-today-tag">วันนี้</span>}
              </p>

              {dayLessons.length === 0 ? (
                <EmptyState
                  icon={<Icon name="timetable" size={28} />}
                  title={`${dayNames[selectedDay - 1]}นี้ไม่มีคาบเรียน`}
                  description="ถ้าคิดว่าไม่ถูกต้อง กรุณาแจ้งคุณครูประจำชั้น"
                />
              ) : (
                <ol className="timetable-daylist">
                  {dayLessons.map(({ period, entry }) => (
                    <li
                      key={period}
                      className={slotClassName(entry, 'timetable-dayrow')}
                      data-day={dayNames[selectedDay - 1]}
                      data-period={period}
                      onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                      onDrop={canEdit ? (event) => drop(event, selectedDay, period) : undefined}
                    >
                      <div className="timetable-dayrow-when">
                        <strong>คาบ {period}</strong>
                        <span>{entry?.startTime ?? periodClock[period]?.startTime}–{entry?.endTime ?? periodClock[period]?.endTime}</span>
                      </div>
                      <div className="timetable-dayrow-body">
                        {slotControl(entry, selectedDay, period, false)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </Card>
      )}

      {!weekFits && summary}

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
