import { useMemo, useState } from 'react';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, rosterFor, subjectById } from '../../data/selectors';
import type { Attendance, AttendanceStatus } from '../../domain/types';
import { Badge, Button, Card, CardHeader, EmptyState, SearchInput, Stat, Toolbar } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { attendanceMarkLabels, attendanceMarkOrder } from './attendanceMarks';

/**
 * The register, all of it, for somebody who is answerable for all of it.
 *
 * The marking screen above is built for the act: one room, one period, forty children, and the
 * fastest possible path through them. An administrator is asked a different question — was the
 * school registered today, why does this child's week look like that, which rooms never closed
 * their periods — and answering it from the marking screen meant picking each room in turn against
 * each period in turn and holding the total in your head. So this is the same records read the
 * other way round: every room and every period at once, filtered rather than navigated.
 *
 * ── It edits, because a summary you cannot correct sends you somewhere else to correct it ──
 * A mark here writes exactly what the marking screen writes, session fields included, so a
 * correction made while reading the summary lands on the same sheet the teacher was using. The
 * server decides whether it is allowed: an administrator may write any room in their school, a
 * teacher only the rooms they hold, and a refusal comes back as its reason rather than as silence.
 */

const labels = attendanceMarkLabels;
const order = attendanceMarkOrder;

/** How far back the summary looks. A day for "was today registered", a term for a pattern. */
const ranges = [
  { value: 1, label: 'วันนี้' },
  { value: 7, label: '7 วัน' },
  { value: 30, label: '30 วัน' },
  { value: 90, label: '90 วัน' }
] as const;

interface Props {
  /** An administrator may correct any room; anybody else reads, and the server holds the line. */
  canEditEveryRoom: boolean;
}

export function AttendanceHistoryPanel({ canEditEveryRoom }: Props) {
  const snapshot = useSchoolSnapshot();
  const repository = useRepository();
  const { toast } = useToast();

  const [rangeDays, setRangeDays] = useState<number>(1);
  const [until, setUntil] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const classes = useMemo(() => activeClasses(snapshot), [snapshot]);
  const classNames = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes]);
  const students = useMemo(
    () => new Map(snapshot.students.map((student) => [student.id, student])),
    [snapshot.students]
  );

  const from = useMemo(() => {
    const end = new Date(`${until}T00:00:00.000Z`);
    if (Number.isNaN(end.getTime())) return until;
    end.setUTCDate(end.getUTCDate() - (rangeDays - 1));
    return end.toISOString().slice(0, 10);
  }, [rangeDays, until]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.attendance
      .filter((row) => row.attendanceDate >= from && row.attendanceDate <= until)
      .filter((row) => !classId || row.classId === classId)
      .filter((row) => !period || String(row.period ?? '') === period)
      .filter((row) => !status || row.status === status)
      .filter((row) => {
        if (!needle) return true;
        const student = students.get(row.studentId);
        const room = classNames.get(row.classId) ?? '';
        return `${student?.displayName ?? ''} ${student?.studentCode ?? ''} ${room}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate)
        || (classNames.get(a.classId) ?? '').localeCompare(classNames.get(b.classId) ?? '')
        || (a.period ?? 99) - (b.period ?? 99)
        || (students.get(a.studentId)?.studentCode ?? '').localeCompare(students.get(b.studentId)?.studentCode ?? ''));
  }, [classId, classNames, from, period, query, snapshot.attendance, status, students, until]);

  /*
   * The periods that exist in the records rather than the ones a timetable says should.
   *
   * A filter built from the timetable offers periods nobody registered and hides the ones somebody
   * registered outside it, and the second of those is the case an administrator is looking for.
   */
  const periods = useMemo(() => {
    const seen = new Set<number>();
    for (const row of snapshot.attendance) if (typeof row.period === 'number') seen.add(row.period);
    return [...seen].sort((a, b) => a - b);
  }, [snapshot.attendance]);

  const counts = useMemo(() => ({
    present: rows.filter((row) => row.status === 'present').length,
    late: rows.filter((row) => row.status === 'late').length,
    absent: rows.filter((row) => row.status === 'absent').length,
    leave: rows.filter((row) => row.status === 'leave_sick' || row.status === 'leave_personal').length
  }), [rows]);

  /*
   * How much of the school was actually registered.
   *
   * "มาเรียน 80%" of the sheets that exist says nothing about the room whose teacher never opened
   * one. The denominator is every child of every room in scope across the days that have any record
   * at all, so a room nobody registered reads as a gap in coverage rather than vanishing from the
   * measure entirely.
   */
  const expected = useMemo(() => {
    const days = new Set(rows.map((row) => row.attendanceDate));
    const inScope = classId ? classes.filter((item) => item.id === classId) : classes;
    const heads = inScope.reduce((total, item) => total + rosterFor(snapshot, item.id).length, 0);
    return heads * Math.max(days.size, 1);
  }, [classId, classes, rows, snapshot]);

  const presentRate = rows.length === 0 ? 0 : Math.round(((counts.present + counts.late) / rows.length) * 100);
  const coverage = expected === 0 ? 0 : Math.min(100, Math.round((rows.length / expected) * 100));

  async function correct(row: Attendance, next: AttendanceStatus) {
    setBusyId(row.id);
    try {
      await repository.setAttendance({
        classId: row.classId, studentId: row.studentId, attendanceDate: row.attendanceDate, status: next,
        note: row.note,
        ...(row.sessionKey ? { sessionKey: row.sessionKey } : {}),
        ...(row.sessionType ? { sessionType: row.sessionType } : {}),
        ...(row.period === undefined ? {} : { period: row.period }),
        ...(row.subjectId === undefined ? {} : { subjectId: row.subjectId }),
        ...(row.timetableEntryId === undefined ? {} : { timetableEntryId: row.timetableEntryId })
      });
    } catch (reason) {
      toast('แก้ไขไม่สำเร็จ', {
        tone: 'error',
        message: reason instanceof Error ? reason.message : 'ระบบไม่ได้แจ้งสาเหตุไว้'
      });
    } finally {
      setBusyId(null);
    }
  }

  const sheetName = (row: Attendance) => row.sessionType === 'homeroom'
    ? 'โฮมรูม'
    : subjectById(snapshot, row.subjectId ?? null)?.name
    ?? ((row.sessionKey ?? 'daily') === 'daily' ? 'สรุปทั้งวัน' : 'ไม่ระบุวิชา');

  return (
    <Card>
      <CardHeader
        title="ประวัติการเช็คชื่อ"
        description="รายละเอียดรวมทุกห้องและทุกคาบ · แก้ไขได้จากหน้านี้"
        action={<Badge tone="neutral">{rows.length} รายการ</Badge>}
      />

      <Toolbar>
        <label>
          ช่วงเวลา
          <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
            {ranges.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          ถึงวันที่
          <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
        </label>
        <label>
          ห้อง
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">ทุกห้อง</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          คาบ
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="">ทุกคาบ</option>
            {periods.map((value) => <option key={value} value={String(value)}>คาบ {value}</option>)}
          </select>
        </label>
        <label>
          สถานะ
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">ทุกสถานะ</option>
            {order.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
          </select>
        </label>
      </Toolbar>

      <div className="ui-stat-grid">
        <Stat label="มาเรียน" value={counts.present} hint={`สาย ${counts.late}`} tone="success" />
        <Stat label="ขาด" value={counts.absent} hint={`ลา ${counts.leave}`} tone={counts.absent > 0 ? 'danger' : 'neutral'} />
        <Stat label="อัตรามาเรียน" value={`${presentRate}%`} hint="จากรายการที่บันทึกไว้" tone="info" />
        <Stat
          label="บันทึกครบ" value={`${coverage}%`}
          hint={`${rows.length} จากที่ควรมี ${expected}`}
          tone={coverage >= 95 ? 'success' : coverage >= 60 ? 'warning' : 'danger'}
        />
      </div>

      <div className="attendance-filters">
        <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อ เลขประจำตัว หรือห้อง" />
        {(classId || period || status || query) && (
          <Button
            variant="secondary"
            onClick={() => { setClassId(''); setPeriod(''); setStatus(''); setQuery(''); }}
          >
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={28} />}
          title="ไม่มีการเช็คชื่อในช่วงนี้"
          description="เปลี่ยนช่วงเวลา หรือเลือกห้องอื่นเพื่อดูรายการที่บันทึกไว้"
        />
      ) : (
        <div className="attendance-history-list">
          {rows.map((row) => {
            const student = students.get(row.studentId);
            return (
              <article key={row.id}>
                <div className="attendance-history-when">
                  <strong>{row.attendanceDate}</strong>
                  <span>{classNames.get(row.classId) ?? 'ห้องเรียน'}{row.period ? ` · คาบ ${row.period}` : ''}</span>
                  <span>{sheetName(row)}</span>
                </div>
                <div className="student-name">
                  <strong>{student?.displayName ?? 'นักเรียน'}</strong>
                  <span>{student?.studentCode ?? ''}</span>
                </div>
                {canEditEveryRoom ? (
                  <div className="segmented" role="group" aria-label={`แก้สถานะของ ${student?.displayName ?? 'นักเรียน'}`}>
                    {order.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={row.status === value ? `active ${value}` : ''}
                        aria-pressed={row.status === value}
                        disabled={busyId === row.id}
                        onClick={() => void correct(row, value)}
                      >
                        {labels[value]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={`attendance-status ${row.status}`}>{labels[row.status]}</span>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
