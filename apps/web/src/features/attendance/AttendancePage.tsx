import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import {
  activeClasses, attendanceDailySummary, attendanceDayStatus, attendanceSummary, consentedStudents,
  rosterFor, subjectById
} from '../../data/selectors';
import type { AttendanceStatus } from '../../domain/types';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, ProgressBar, SearchInput,
  Stat, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

const labels: Record<AttendanceStatus, string> = { present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา' };
const order: AttendanceStatus[] = ['present', 'late', 'absent', 'leave'];
const dayLabels: Record<AttendanceStatus | 'unmarked', string> = {
  present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา', unmarked: 'ยังไม่เช็ก'
};

/** The status filter is the mark plus the absence of one — "ยังไม่เช็ก" is the answer people hunt for. */
type StatusFilter = 'all' | AttendanceStatus | 'unmarked';
const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unmarked', label: 'ยังไม่เช็ก' },
  { value: 'present', label: 'มาเรียน' },
  { value: 'late', label: 'สาย' },
  { value: 'absent', label: 'ขาด' },
  { value: 'leave', label: 'ลา' }
];

type AttendanceSession = {
  key: string; label: string; type: 'daily' | 'class' | 'homeroom';
  period: number | null; subjectId: string | null; timetableEntryId: string | null; time: string;
};

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

/**
 * Why a write was refused, always in words.
 *
 * A toast that omits the reason when the throw is not an Error leaves the reader with "บันทึกไม่สำเร็จ"
 * and nothing to act on or repeat to support, which is the one case where the reason mattered most.
 */
const failureText = (reason: unknown) => reason instanceof Error ? reason.message : 'ระบบไม่ได้แจ้งสาเหตุไว้ กรุณาลองใหม่อีกครั้ง';

function sessionLabel(session: AttendanceSession, subjectName?: string): string {
  if (session.type === 'homeroom') return 'โฮมรูม';
  if (session.type === 'daily') return 'สรุปทั้งวัน';
  return `${subjectName ?? 'ไม่ระบุวิชา'} · คาบ ${session.period ?? '-'}`;
}

export function AttendancePage() {
  const { membership } = useSession();
  return membership.role === 'parent' ? <ParentAttendanceSummary /> : <StaffAttendancePage />;
}

/**
 * Taking a register, on a phone at the classroom door.
 *
 * The order of the screen is the order of the act: pick the class and the period, see how far
 * through you are, then mark people. The roster is the largest thing on the page because it is the
 * only part anybody touches more than once.
 *
 * Two bulk writes exist, and both ask first. "มาเรียนทั้งหมด" writes a mark for every unmarked
 * student, and closing the period writes ขาด for whoever is left — each is dozens of records from
 * one tap, and undoing them means finding every student it touched.
 */
function StaffAttendancePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const classes = activeClasses(snapshot);

  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionKey, setSessionKey] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confirming, setConfirming] = useState<'present-all' | 'close' | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedClassId = classId || classes[0]?.id || '';
  const roster = useMemo(() => rosterFor(snapshot, selectedClassId), [snapshot, selectedClassId]);
  const canMark = membership.role === 'admin' || membership.role === 'teacher';

  const sessions = useMemo<AttendanceSession[]>(() => {
    const classroom = classes.find((item) => item.id === selectedClassId);
    const entries = snapshot.timetable
      .filter((item) => item.classId === selectedClassId
        && item.academicTermId === classroom?.academicTermId
        && item.dayOfWeek === isoWeekday(date)
        && item.status === 'active')
      .sort((a, b) => a.period - b.period);
    const classSessions = entries.map((entry) => ({
      key: entry.id, label: '', type: 'class' as const, period: entry.period,
      subjectId: entry.subjectId, timetableEntryId: entry.id, time: `${entry.startTime}–${entry.endTime}`
    }));
    return [
      { key: 'homeroom', label: 'โฮมรูม', type: 'homeroom', period: null, subjectId: null, timetableEntryId: null, time: '' },
      ...classSessions,
      // A day with no timetable still has to be recordable, or the mark waits until somebody builds
      // the schedule — by which time nobody remembers who was there.
      ...(classSessions.length === 0
        ? [{ key: 'daily', label: 'สรุปทั้งวัน', type: 'daily' as const, period: null, subjectId: null, timetableEntryId: null, time: '' }]
        : [])
    ];
  }, [classes, date, selectedClassId, snapshot.timetable]);

  const selectedSession = sessions.find((session) => session.key === sessionKey) ?? sessions[0];
  const sessionName = selectedSession
    ? selectedSession.label || sessionLabel(selectedSession, subjectById(snapshot, selectedSession.subjectId)?.name)
    : '';
  const summary = selectedSession
    ? attendanceSummary(snapshot, { classId: selectedClassId, date, sessionKey: selectedSession.key })
    : attendanceSummary(snapshot, { classId: selectedClassId, date });

  const statusOf = (studentId: string): AttendanceStatus | null => selectedSession
    ? snapshot.attendance.find((item) => item.classId === selectedClassId
      && item.studentId === studentId
      && item.attendanceDate === date
      && (item.sessionKey ?? 'daily') === selectedSession.key)?.status ?? null
    : null;

  const unmarked = roster.filter((student) => statusOf(student.id) === null);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster.filter((student) => {
      const status = statusOf(student.id);
      if (statusFilter === 'unmarked' ? status !== null : statusFilter !== 'all' && status !== statusFilter) return false;
      if (!needle) return true;
      return `${student.displayName} ${student.studentCode}`.toLowerCase().includes(needle);
    });
    // `statusOf` closes over the snapshot and the selected session, both of which are already here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, query, statusFilter, snapshot.attendance, selectedSession?.key, date, selectedClassId]);

  const sessionFields = selectedSession
    ? {
      sessionKey: selectedSession.key, sessionType: selectedSession.type, period: selectedSession.period,
      subjectId: selectedSession.subjectId, timetableEntryId: selectedSession.timetableEntryId
    }
    : null;

  async function mark(studentId: string, status: AttendanceStatus) {
    if (!sessionFields) return;
    try {
      await repository.setAttendance({ classId: selectedClassId, studentId, attendanceDate: date, status, ...sessionFields });
    } catch (reason) {
      toast('บันทึกไม่สำเร็จ', { tone: 'error', message: failureText(reason) });
    }
  }

  /** Both bulk writes are the same act with a different mark, so they are the same function. */
  async function markRemaining(status: AttendanceStatus) {
    if (!sessionFields) return;
    const ids = unmarked.map((student) => student.id);
    if (ids.length === 0) { toast('เช็กชื่อครบทุกคนแล้ว', { tone: 'info' }); return; }
    setBusy(true);
    try {
      await repository.setAttendanceForStudents(selectedClassId, date, status, ids, sessionFields);
      toast(`บันทึก "${labels[status]}" ${ids.length} คน`, { tone: 'success', message: `${sessionName} · ${date}` });
    } catch (reason) {
      toast('บันทึกไม่สำเร็จ', { tone: 'error', message: failureText(reason) });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="บันทึกการเข้าเรียนรายคาบ"
        title="เช็กชื่อ"
        description={selectedSession
          ? `${sessionName} · ${date}`
          : 'เลือกห้องเรียนเพื่อเริ่มเช็กชื่อ'}
        action={canMark && roster.length > 0 ? (
          <>
            <Button
              variant="secondary" icon={<Icon name="check" size={16} />}
              disabled={busy || unmarked.length === 0}
              onClick={() => setConfirming('present-all')}
            >
              มาเรียนทั้งหมด
            </Button>
            <Button
              variant="primary" icon={<Icon name="success" size={16} />}
              disabled={busy}
              onClick={() => setConfirming('close')}
            >
              ปิดคาบนี้
            </Button>
          </>
        ) : undefined}
      />

      <Toolbar>
        <label>
          ห้องเรียน
          <select
            value={selectedClassId}
            onChange={(event) => { setClassId(event.target.value); setSessionKey(''); }}
          >
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSessionKey(''); }} />
        </label>
        <label className="attendance-session-field">
          วิชา / คาบ
          <select value={selectedSession?.key ?? ''} onChange={(event) => setSessionKey(event.target.value)}>
            {sessions.map((session) => (
              <option key={session.key} value={session.key}>
                {session.label || sessionLabel(session, subjectById(snapshot, session.subjectId)?.name)}
                {session.time ? ` · ${session.time}` : ''}
              </option>
            ))}
          </select>
        </label>
      </Toolbar>

      {sessions.length === 1 && sessions[0]?.key === 'daily' && (
        <div className="info-banner">
          ยังไม่มีตารางสอนของวันนี้ ระบบจึงเปิด “สรุปทั้งวัน” ให้บันทึกชั่วคราว · เพิ่มตารางสอนเพื่อแยกเช็กเป็นรายวิชา
        </div>
      )}

      {/* The counts are the reason for the screen, so they sit above the roster rather than being
          something to scroll to. Each one carries a word as well as a colour. */}
      <div className="ui-stat-grid">
        <Stat label="มาเรียน" value={summary.present} hint="คาบนี้" tone="success" icon={<Icon name="check" size={18} />} />
        <Stat label="สาย" value={summary.late} hint="คาบนี้" tone="warning" icon={<Icon name="info" size={18} />} />
        <Stat label="ขาด" value={summary.absent} hint="คาบนี้" tone={summary.absent > 0 ? 'danger' : 'neutral'} icon={<Icon name="warning" size={18} />} />
        <Stat label="ลา" value={summary.leave} hint="คาบนี้" tone="info" icon={<Icon name="calendar" size={18} />} />
        <Stat
          label="ยังไม่เช็ก" value={unmarked.length}
          hint={`จากนักเรียน ${roster.length} คน`}
          tone={unmarked.length > 0 ? 'brand' : 'neutral'}
          icon={<Icon name="students" size={18} />}
          {...(unmarked.length === 0 && roster.length > 0 ? { status: "ครบแล้ว" } : {})}
        />
      </div>

      <Card>
        <CardHeader
          title={`รายชื่อนักเรียน ${roster.length} คน`}
          description={sessionName ? `กำลังเช็ก: ${sessionName}` : 'เลือกคาบเรียนก่อนเริ่มเช็ก'}
          action={<Badge tone={unmarked.length === 0 && roster.length > 0 ? 'success' : 'neutral'}>
            เช็กแล้ว {roster.length - unmarked.length}/{roster.length}
          </Badge>}
        />
        <ProgressBar
          value={roster.length - unmarked.length} max={roster.length || 1}
          tone={unmarked.length === 0 ? 'success' : 'brand'}
          label={`ความคืบหน้าการเช็กชื่อ ${roster.length - unmarked.length} จาก ${roster.length} คน`}
        />

        {/* Finding one student in forty is the other thing this screen is for: a name half-remembered,
            or "who have I not marked yet". Both are a filter rather than a scroll. */}
        <div className="attendance-filters">
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือเลขประจำตัว" />
          <div className="attendance-filter-chips" role="group" aria-label="กรองตามสถานะ">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`attendance-filter-chip ${statusFilter === filter.value ? 'selected' : ''}`}
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {roster.length === 0 ? (
          <EmptyState
            icon={<Icon name="students" size={28} />}
            title="ยังไม่มีนักเรียนในห้องนี้"
            description="เพิ่มนักเรียนหรือย้ายเข้าห้องก่อนเช็กชื่อ"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Icon name="search" size={28} />}
            title="ไม่พบนักเรียนที่ตรงกับตัวกรอง"
            description="ลองล้างคำค้นหรือเลือกสถานะอื่น"
            action={<Button variant="secondary" onClick={() => { setQuery(''); setStatusFilter('all'); }}>ล้างตัวกรอง</Button>}
          />
        ) : (
          <div className="attendance-list">
            {visible.map((student) => {
              const status = statusOf(student.id);
              return (
                <article key={student.id}>
                  <ProfileAvatar
                    displayName={student.displayName} avatarId={student.avatarId}
                    avatarPhotoId={student.avatarPhotoId} avatarIndex={student.avatarIndex}
                    avatarConfig={student.avatarConfig} size={56}
                    animation={status === 'present' ? 'wave' : 'idle'}
                  />
                  <div className="student-name">
                    <strong>{student.displayName}</strong>
                    <span>{student.studentCode}</span>
                  </div>
                  <div className="segmented" role="group" aria-label={`สถานะของ ${student.displayName}`}>
                    {order.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={status === value ? `active ${value}` : ''}
                        // The mark is state, not a menu: a reader hears which one is set rather than
                        // having to infer it from a colour they may not be able to separate.
                        aria-pressed={status === value}
                        disabled={!canMark}
                        onClick={() => void mark(student.id, value)}
                      >
                        {labels[value]}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {confirming === 'present-all' && (
        <ConfirmDialog
          tone="brand"
          title={`บันทึก "มาเรียน" ให้ ${unmarked.length} คนที่ยังไม่เช็ก?`}
          description={`${sessionName} · ${date} · นักเรียนที่เช็กไปแล้วจะไม่ถูกเปลี่ยน`}
          confirmLabel="บันทึกมาเรียนทั้งหมด"
          onCancel={() => setConfirming(null)}
          onConfirm={() => void markRemaining('present')}
        />
      )}
      {confirming === 'close' && (
        <ConfirmDialog
          tone={unmarked.length > 0 ? 'danger' : 'brand'}
          title={unmarked.length > 0 ? `ปิดคาบโดยบันทึก "ขาด" ให้ ${unmarked.length} คน?` : 'คาบนี้เช็กครบแล้ว'}
          description={unmarked.length > 0
            ? `${sessionName} · ${date} · นักเรียนที่ยังไม่ถูกเช็กจะถูกบันทึกเป็น "ขาด" แก้ไขภายหลังได้จากรายชื่อ`
            : `${sessionName} · ${date} · ไม่มีนักเรียนที่ค้างอยู่`}
          confirmLabel={unmarked.length > 0 ? 'ปิดคาบและบันทึกขาด' : 'เข้าใจแล้ว'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => unmarked.length > 0 ? void markRemaining('absent') : setConfirming(null)}
        />
      )}
    </>
  );
}

/**
 * A guardian's view of one child's day: every period the school recorded, and no control to change
 * any of it. The class selector a teacher gets is deliberately absent — this list comes from the
 * consented children and from nothing else.
 */
function ParentAttendanceSummary() {
  const snapshot = useSchoolSnapshot();
  const children = consentedStudents(snapshot);
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const child = children.find((item) => item.id === (studentId || children[0]?.id));
  const todayRows = useMemo(
    () => snapshot.attendance.filter((item) => item.studentId === child?.id && item.attendanceDate === date),
    [child?.id, date, snapshot.attendance]
  );
  const overall = useMemo(() => child ? attendanceDailySummary(snapshot, { studentId: child.id }) : null, [child, snapshot]);
  const classes = useMemo(() => new Map(activeClasses(snapshot).map((item) => [item.id, item.name])), [snapshot]);
  const subjectName = (subjectId: string | null | undefined) => subjectById(snapshot, subjectId ?? null)?.name;

  return (
    <>
      <PageHeader
        eyebrow="มุมมองผู้ปกครอง · ดูอย่างเดียว"
        title="การเข้าเรียนของลูก"
        description="ดูภาพรวมตลอดวันของเฉพาะนักเรียนที่เชื่อมกับบัญชีนี้"
      />

      <Toolbar>
        <label>
          นักเรียน
          <select value={child?.id ?? ''} onChange={(event) => setStudentId(event.target.value)}>
            {children.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </Toolbar>

      {!child ? (
        <Card>
          <EmptyState
            icon={<Icon name="children" size={28} />}
            title="ยังไม่มีนักเรียนที่เชื่อมไว้"
            description="เมื่อแอดมินเชื่อมบัญชีแล้ว ภาพรวมการเข้าเรียนจะแสดงที่นี่"
          />
        </Card>
      ) : (
        <>
          <Card className="attendance-parent-hero">
            <div className="attendance-parent-profile">
              <ProfileAvatar
                displayName={child.displayName} avatarId={child.avatarId} avatarPhotoId={child.avatarPhotoId}
                avatarIndex={child.avatarIndex} avatarConfig={child.avatarConfig} size={72} animation="idle"
              />
              <div>
                <span className="ui-eyebrow">ข้อมูลของลูก</span>
                <h2>{child.displayName}</h2>
                <p>{child.studentCode}</p>
              </div>
            </div>
            <div className="attendance-day-summary">
              <strong>{dayLabels[attendanceDayStatus(todayRows)]}</strong>
              <span>{date} · บันทึกแล้ว {todayRows.length} คาบ</span>
            </div>
          </Card>

          <div className="ui-stat-grid">
            <Stat label="มาเรียน" value={todayRows.filter((row) => row.status === 'present').length} hint="คาบวันนี้" tone="success" />
            <Stat label="สาย" value={todayRows.filter((row) => row.status === 'late').length} hint="คาบวันนี้" tone="warning" />
            <Stat label="ขาด" value={todayRows.filter((row) => row.status === 'absent').length} hint="คาบวันนี้" tone="danger" />
            <Stat label="อัตรามาเรียน" value={`${overall?.presentRate ?? 0}%`} hint={`จาก ${overall?.totalDays ?? 0} วันที่บันทึก`} tone="info" />
          </div>

          <Card>
            <CardHeader
              title="รายละเอียดของวันนี้"
              description="สรุปตามคาบที่ครูบันทึกไว้ ผู้ปกครองไม่สามารถแก้ไขข้อมูลได้"
              action={<Badge tone="neutral">{todayRows.length} คาบ</Badge>}
            />
            {todayRows.length === 0 ? (
              <EmptyState
                icon={<Icon name="calendar" size={28} />}
                title="ยังไม่มีข้อมูลของวันนี้"
                description="ครูจะบันทึกแยกตามวิชาและคาบเรียนโดยอัตโนมัติ"
              />
            ) : (
              <div className="attendance-readonly-list">
                {[...todayRows].sort((a, b) => (a.period ?? 99) - (b.period ?? 99)).map((row) => (
                  <article key={row.id}>
                    <div>
                      <strong>
                        {row.sessionType === 'homeroom'
                          ? 'โฮมรูม'
                          : subjectName(row.subjectId) ?? (row.sessionKey === 'daily' ? 'สรุปทั้งวัน' : 'ไม่ระบุวิชา')}
                      </strong>
                      <span>{classes.get(row.classId) ?? 'ห้องเรียน'}{row.period ? ` · คาบ ${row.period}` : ''}</span>
                    </div>
                    <span className={`attendance-status ${row.status}`}>{labels[row.status]}</span>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
