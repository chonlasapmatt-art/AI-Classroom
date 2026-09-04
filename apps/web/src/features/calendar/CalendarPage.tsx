import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, subjectById } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { calendarItemsFor, groupByDay, type CalendarItem } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, Toolbar } from '../../ui/components';
import { useRepository } from '../../data/RepositoryContext';
import { rosterFor } from '../../data/selectors';
import { WorkFormModal } from '../assignments/WorkFormModal';
import type { Assignment } from '../../domain/types';
import type { AssignmentInput } from '../../data/schoolRepository';
import { useToast } from '../../ui/toastContext';

type CalendarView = 'month' | 'week' | 'upcoming';

const views: Array<{ value: CalendarView; label: string }> = [
  { value: 'month', label: 'เดือน' },
  { value: 'week', label: 'สัปดาห์' },
  { value: 'upcoming', label: 'กำลังจะถึง' }
];

function startOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, count: number): Date { return new Date(date.getFullYear(), date.getMonth() + count, 1); }
function isoDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Academic calendar. A teacher sees the class they teach; a student sees only their own class. */
export function CalendarPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);

  const ownStudent = snapshot.students.find((item) => item.profileId === membership.profileId);
  const ownClassId = membership.role === 'student' ? classIdOfStudent(snapshot, ownStudent?.id ?? '') : null;

  const [view, setView] = useState<CalendarView>('month');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [composing, setComposing] = useState<{ dueAt: string; work: Assignment | null } | null>(null);
  const { toast } = useToast();

  const effectiveClassId = ownClassId ?? classId ?? classes[0]?.id ?? '';
  const selectedClassId = effectiveClassId || classes[0]?.id || '';

  const items = useMemo(() => calendarItemsFor(snapshot, {
    classIds: selectedClassId ? [selectedClassId] : classes.map((item) => item.id),
    studentId: ownStudent?.id ?? null,
    subjectId: subjectId || null,
    includeDrafts: membership.role !== 'student'
  }), [snapshot, selectedClassId, classes, ownStudent?.id, subjectId, membership.role]);

  const byDay = useMemo(() => groupByDay(items), [items]);
  const today = isoDay(new Date());

  const monthDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const offset = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: Array<{ day: string | null }> = [];
    for (let index = 0; index < offset; index += 1) cells.push({ day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day: isoDay(new Date(cursor.getFullYear(), cursor.getMonth(), day)) });
    }
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return isoDay(date);
    });
  }, []);

  const canCompose = membership.role === 'admin' || membership.role === 'teacher';
  const roster = rosterFor(snapshot, selectedClassId);

  /** Opens the work form with a deadline of 16:00 on the day that was clicked. */
  function composeOn(day: string) {
    if (!canCompose) return;
    setComposing({ dueAt: `${day}T16:00`, work: null });
  }

  async function saveWork(input: AssignmentInput, publish: boolean) {
    await repository.saveAssignment({ ...input, status: publish ? 'draft' : input.status });
    if (publish && input.id) await repository.publishAssignment(input.id, roster.map((student) => student.id));
    toast(publish ? 'เผยแพร่งานให้นักเรียนแล้ว' : 'บันทึกฉบับร่างแล้ว');
  }

  const upcoming = items
    .filter((item) => item.dueAt && Date.parse(item.dueAt) >= Date.now() - 24 * 3_600_000)
    .slice(0, 12);

  return (
    <>
      <PageHeader
        eyebrow="ปฏิทินการเรียน"
        title="ปฏิทิน"
        description={membership.role === 'student'
          ? 'งานทั้งหมดของฉัน เรียงตามกำหนดส่ง'
          : 'ดูภาระงานของห้องเรียนก่อนมอบหมายงานใหม่'}
        action={canCompose && (
          <Button variant="primary" onClick={() => composeOn(today)}>+ สร้างงาน</Button>
        )}
      />

      <Toolbar>
        {!ownClassId && (
          <Field label="ห้องเรียน">
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="รายวิชา">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">ทุกวิชา</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Segmented ariaLabel="มุมมองปฏิทิน" value={view} onChange={setView} options={views} />
      </Toolbar>

      {view === 'month' && (
        <Card padded={false} className="calendar-card">
          <header className="calendar-head">
            <div className="calendar-nav">
              <button className="ui-icon-button" aria-label="ปีก่อนหน้า" onClick={() => setCursor(addMonths(cursor, -12))}>«</button>
              <button className="ui-icon-button" aria-label="เดือนก่อนหน้า" onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
            </div>
            <strong>{cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong>
            <div className="calendar-nav">
              <button className="ui-icon-button" aria-label="เดือนถัดไป" onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
              <button className="ui-icon-button" aria-label="ปีถัดไป" onClick={() => setCursor(addMonths(cursor, 12))}>»</button>
              <Button size="sm" variant="ghost" onClick={() => setCursor(startOfMonth(new Date()))}>วันนี้</Button>
            </div>
          </header>
          <div className="calendar-grid">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((label) => (
              <span key={label} className="calendar-weekday">{label}</span>
            ))}
            {monthDays.map((cell, index) => (
              <div
                key={cell.day ?? `empty-${index}`}
                className={`calendar-cell ${cell.day === today ? 'today' : ''} ${cell.day ? '' : 'empty'}`}
              >
                {cell.day && (
                  <div className="calendar-date-row">
                    <span className="calendar-date">{Number(cell.day.slice(8))}</span>
                    {canCompose && (
                      <button
                        type="button"
                        className="calendar-add"
                        aria-label={`สร้างงานกำหนดส่งวันที่ ${cell.day}`}
                        onClick={() => composeOn(cell.day!)}
                      >
                        +
                      </button>
                    )}
                  </div>
                )}
                {cell.day && (byDay.get(cell.day) ?? []).slice(0, 3).map((item) => (
                  <CalendarChip key={item.work.id} item={item} snapshot={snapshot} />
                ))}
                {cell.day && (byDay.get(cell.day) ?? []).length > 3 && (
                  <span className="calendar-more">+{(byDay.get(cell.day) ?? []).length - 3}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {view === 'week' && (
        <div className="calendar-week">
          {weekDays.map((day) => (
            <Card key={day} className={day === today ? 'calendar-week-day today' : 'calendar-week-day'}>
              <header>
                <strong>{new Date(day).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                <Badge tone={(byDay.get(day) ?? []).length >= 3 ? 'warning' : 'neutral'}>
                  {(byDay.get(day) ?? []).length} งาน
                </Badge>
              </header>
              {(byDay.get(day) ?? []).length === 0
                ? <p className="ui-field-hint">ไม่มีงานครบกำหนด</p>
                : (byDay.get(day) ?? []).map((item) => <CalendarRow key={item.work.id} item={item} snapshot={snapshot} />)}
            </Card>
          ))}
        </div>
      )}

      {composing && (
        <WorkFormModal
          classId={selectedClassId}
          className={classes.find((item) => item.id === selectedClassId)?.name ?? ''}
          subjects={subjects}
          rubrics={snapshot.rubrics}
          works={snapshot.assignments}
          editing={composing.work}
          defaultDueAt={composing.dueAt}
          actorProfileId={membership.profileId}
          onClose={() => setComposing(null)}
          onSave={saveWork}
        />
      )}


      {view === 'upcoming' && (
        <Card>
          {upcoming.length === 0
            ? <EmptyState icon="🎉" title="ไม่มีงานที่กำลังจะถึงกำหนด" description="ทุกอย่างเรียบร้อยแล้ว" />
            : <div className="calendar-upcoming">
              {upcoming.map((item) => <CalendarRow key={item.work.id} item={item} snapshot={snapshot} showCountdown />)}
            </div>}
        </Card>
      )}
    </>
  );
}

function CalendarChip({ item, snapshot }: { item: CalendarItem; snapshot: ReturnType<typeof useSchoolSnapshot> }) {
  const subject = subjectById(snapshot, item.work.subjectId);
  const color = subject ? subjectColor(subject.colorIndex) : null;
  return (
    <span className="calendar-chip" style={color ? { background: color.soft, color: color.solid } : undefined} title={item.work.title}>
      {subject && <SubjectIcon iconKey={subject.iconKey} size={13} />}
      {item.work.title}
    </span>
  );
}

function CalendarRow({ item, snapshot, showCountdown }: {
  item: CalendarItem; snapshot: ReturnType<typeof useSchoolSnapshot>; showCountdown?: boolean;
}) {
  const subject = subjectById(snapshot, item.work.subjectId);
  const color = subject ? subjectColor(subject.colorIndex) : null;
  return (
    <article className="calendar-row">
      <span className="calendar-row-dot" style={color ? { background: color.solid } : undefined} />
      <div>
        <strong>{item.work.title}</strong>
        <span>
          {subject?.name ?? 'ไม่ระบุวิชา'}
          {item.dueAt && ` · ${new Date(item.dueAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`}
          {showCountdown && item.dueAt && ` · ${timeRemainingLabel(item.dueAt)}`}
        </span>
      </div>
      <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
    </article>
  );
}
