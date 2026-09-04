import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, subjectById } from '../../data/selectors';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { calendarEntriesFor, groupEntriesByDay, type CalendarEntry, type CalendarKind } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, Toolbar } from '../../ui/components';
import { Icon } from '../../ui/Icon';
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

/**
 * What each kind of entry is called and which colour it wears.
 *
 * The calendar used to colour by subject, which answered a question the subject icon already
 * answered and left the one people scan a month for — "when is the test" — indistinguishable from
 * a piece of homework. These are the accent tokens rather than the status ones: a test is not a
 * failure and homework is not a success, so borrowing the danger red for either would teach people
 * to read the wrong thing into a colour that means something else everywhere else in the product.
 */
const kindMeta: Record<CalendarKind, { label: string; className: string }> = {
  exam: { label: 'สอบ', className: 'kind-exam' },
  homework: { label: 'การบ้าน', className: 'kind-homework' },
  assignment: { label: 'งานที่มอบหมาย', className: 'kind-assignment' },
  project: { label: 'โครงงาน', className: 'kind-project' },
  activity: { label: 'กิจกรรม', className: 'kind-activity' }
};

const kindOrder: CalendarKind[] = ['exam', 'homework', 'assignment', 'project', 'activity'];

function startOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, count: number): Date { return new Date(date.getFullYear(), date.getMonth() + count, 1); }
function addDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}
function isoDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
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
  const [kindFilter, setKindFilter] = useState<CalendarKind | 'all'>('all');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [composing, setComposing] = useState<{ dueAt: string; work: Assignment | null } | null>(null);
  const { toast } = useToast();

  const effectiveClassId = ownClassId ?? classId ?? classes[0]?.id ?? '';
  const selectedClassId = effectiveClassId || classes[0]?.id || '';

  const entries = useMemo(() => calendarEntriesFor(snapshot, {
    classIds: selectedClassId ? [selectedClassId] : classes.map((item) => item.id),
    studentId: ownStudent?.id ?? null,
    subjectId: subjectId || null,
    includeDrafts: membership.role !== 'student'
  }), [snapshot, selectedClassId, classes, ownStudent?.id, subjectId, membership.role]);

  const visible = useMemo(
    () => kindFilter === 'all' ? entries : entries.filter((entry) => entry.kind === kindFilter),
    [entries, kindFilter]
  );
  const byDay = useMemo(() => groupEntriesByDay(visible), [visible]);
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

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => isoDay(addDays(weekStart, index))),
    [weekStart]
  );

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
    toast(publish ? 'เผยแพร่งานให้นักเรียนแล้ว' : 'บันทึกฉบับร่างแล้ว', { tone: 'success' });
  }

  const upcoming = visible
    .filter((entry) => entry.at && Date.parse(entry.at) >= Date.now() - 24 * 3_600_000)
    .slice(0, 12);

  // The wait for the snapshot is the shell's, so that a screen cannot get the hook order wrong by
  // returning early in the wrong place. By the time this renders there is data to render.
  return (
    <>
      <PageHeader
        eyebrow="ปฏิทินการเรียน"
        title="ปฏิทิน"
        description={membership.role === 'student'
          ? 'งานและวันสอบทั้งหมดของฉัน เรียงตามกำหนด'
          : 'ดูภาระงานและวันสอบของห้องเรียนก่อนมอบหมายงานใหม่'}
        action={canCompose && (
          <Button variant="primary" size="lg" icon={<Icon name="plus" size={16} />} onClick={() => composeOn(today)}>
            สร้างงานใหม่
          </Button>
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

      {/*
        * The legend is also the filter.
        *
        * A legend that only names the colours makes the reader do the filtering with their eyes;
        * the same row of labels, made pressable, answers "show me only the tests" in one tap. Each
        * carries the count, so an empty kind says so instead of looking like a filter that broke.
        */}
      <div className="calendar-legend" role="group" aria-label="กรองตามประเภท">
        <button
          type="button" className={`calendar-legend-chip ${kindFilter === 'all' ? 'selected' : ''}`}
          aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}
        >
          ทั้งหมด <span className="calendar-legend-count">{entries.length}</span>
        </button>
        {kindOrder.map((kind) => {
          const count = entries.filter((entry) => entry.kind === kind).length;
          return (
            <button
              key={kind}
              type="button"
              className={`calendar-legend-chip ${kindMeta[kind].className} ${kindFilter === kind ? 'selected' : ''}`}
              aria-pressed={kindFilter === kind}
              onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)}
            >
              <span className="calendar-legend-dot" aria-hidden="true" />
              {kindMeta[kind].label} <span className="calendar-legend-count">{count}</span>
            </button>
          );
        })}
      </div>

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
                {cell.day && (byDay.get(cell.day) ?? []).slice(0, 3).map((entry) => (
                  <CalendarChip key={entry.id} entry={entry} snapshot={snapshot} />
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
        <>
          {/* The week used to be whichever week it happened to be today, with no way to look at the
              next one — which is the week a teacher is actually planning. */}
          <div className="calendar-week-nav">
            <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ สัปดาห์ก่อน</Button>
            <strong>
              {new Date(weekDays[0]!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              {' – '}
              {new Date(weekDays[6]!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </strong>
            <div className="calendar-nav">
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>สัปดาห์นี้</Button>
              <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>สัปดาห์ถัดไป ›</Button>
            </div>
          </div>
          <div className="calendar-week">
            {weekDays.map((day) => (
              <Card key={day} className={day === today ? 'calendar-week-day today' : 'calendar-week-day'}>
                <header>
                  <strong>{new Date(day).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                  <Badge tone={(byDay.get(day) ?? []).length >= 3 ? 'warning' : 'neutral'}>
                    {(byDay.get(day) ?? []).length} รายการ
                  </Badge>
                </header>
                {(byDay.get(day) ?? []).length === 0
                  ? <p className="ui-field-hint">ไม่มีรายการในวันนี้</p>
                  : (byDay.get(day) ?? []).map((entry) => <CalendarRow key={entry.id} entry={entry} snapshot={snapshot} />)}
              </Card>
            ))}
          </div>
        </>
      )}

      {view === 'upcoming' && (
        <Card>
          {upcoming.length === 0
            ? (
              <EmptyState
                icon={<Icon name="calendar" size={28} />}
                title="ไม่มีรายการที่กำลังจะถึงกำหนด"
                description={kindFilter === 'all' ? 'ทุกอย่างเรียบร้อยแล้ว' : `ไม่มี"${kindMeta[kindFilter].label}"ที่กำลังจะถึง`}
                {...(kindFilter === 'all' ? {} : {
                  action: <Button variant="secondary" onClick={() => setKindFilter('all')}>ดูทุกประเภท</Button>
                })}
              />
            )
            : <div className="calendar-upcoming">
              {upcoming.map((entry) => <CalendarRow key={entry.id} entry={entry} snapshot={snapshot} showCountdown />)}
            </div>}
        </Card>
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
    </>
  );
}

function CalendarChip({ entry, snapshot }: { entry: CalendarEntry; snapshot: ReturnType<typeof useSchoolSnapshot> }) {
  const subject = subjectById(snapshot, entry.subjectId);
  return (
    <span
      className={`calendar-chip ${kindMeta[entry.kind].className}`}
      // The kind is in the title as well as in the colour, because the colour is the one channel a
      // reader who cannot separate two hues gets nothing from.
      title={`${kindMeta[entry.kind].label} · ${entry.title}`}
    >
      {subject && <SubjectIcon iconKey={subject.iconKey} size={13} />}
      {entry.title}
    </span>
  );
}

function CalendarRow({ entry, snapshot, showCountdown }: {
  entry: CalendarEntry; snapshot: ReturnType<typeof useSchoolSnapshot>; showCountdown?: boolean;
}) {
  const subject = subjectById(snapshot, entry.subjectId);
  return (
    <article className={`calendar-row ${kindMeta[entry.kind].className}`}>
      <span className="calendar-row-dot" aria-hidden="true" />
      <div>
        <strong>{entry.title}</strong>
        <span>
          {kindMeta[entry.kind].label}
          {` · ${subject?.name ?? 'ไม่ระบุวิชา'}`}
          {entry.at && ` · ${new Date(entry.at).toLocaleString('th-TH', entry.kind === 'exam'
            ? { dateStyle: 'medium' }
            : { dateStyle: 'medium', timeStyle: 'short' })}`}
          {showCountdown && entry.at && entry.kind !== 'exam' && ` · ${timeRemainingLabel(entry.at)}`}
        </span>
      </div>
      {entry.state
        ? <Badge tone={workStateTone[entry.state]}>{workStateLabels[entry.state]}</Badge>
        : <Badge tone="neutral">{kindMeta[entry.kind].label}</Badge>}
    </article>
  );
}
