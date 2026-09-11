import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { rosterFor, subjectById } from '../../data/selectors';
import { teacherClassScope } from '../../data/teacherResponsibilities';
import type { AttendanceStatus } from '../../domain/types';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, ProgressBar } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { useToast } from '../../ui/toastContext';
import { currentSessionFor, sessionLabel, sessionsForClass } from './sessions';
import { attendanceMarkLabels, attendanceMarkOrder, attendanceMarkShortLabels } from './attendanceMarks';

/*
 * Five marks, not four.
 *
 * "ลา" was one button covering both ลาป่วย and ลากิจ, and teachers were writing which one into the
 * note by hand — a distinction the school reports on, kept somewhere no report could count. The two
 * sit next to each other at the end of the row because they are the one decision a teacher makes
 * between them, and each still carries its own word: the colours tell them apart at a glance down a
 * class of forty, but nothing here depends on seeing the colour.
 */
const marks: { value: AttendanceStatus; label: string }[] = attendanceMarkOrder.map((value) => ({
  value, label: attendanceMarkShortLabels[value]
}));

const markLabels = attendanceMarkLabels;

/**
 * The register for the period being taught, where the lesson is.
 *
 * Taking a register used to be a separate screen a teacher had to remember to visit, pick the room
 * on, pick the period on, and only then mark. All four of those are already known the moment the
 * teacher opens the room they are teaching: the timetable says which lesson is now and whose it is.
 * So the register comes to the lesson instead.
 *
 * Two teachers, two registers. The sheet is keyed to the timetable entry, so the computing lesson
 * and the science lesson in the same room on the same day are separate sheets — the second teacher
 * opens a clean one rather than inheriting the first one's ticks. Rearranging periods on the
 * timetable moves the register with them, because the timetable entry is the identity.
 */
export function PeriodRegister({ classId }: { classId: string }) {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [chosenKey, setChosenKey] = useState('');
  const [closing, setClosing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);

  const roster = useMemo(() => rosterFor(snapshot, classId), [snapshot, classId]);

  /*
   * What this reader is in the room for.
   *
   * An administrator is neutral and gets everything. A teacher gets their own lessons, and the
   * morning only if they look after the room -- homeroom is the room itself rather than any lesson
   * in it, so it belongs to the advisor or their assistant. A teacher who takes one subject there
   * has a period of their own to mark and no business marking the morning.
   */
  const scope = useMemo(
    () => (membership.role === 'teacher' ? teacherClassScope(snapshot, membership.profileId, classId) : null),
    [classId, membership.profileId, membership.role, snapshot]
  );
  const canTakeHomeroom = scope === null || scope.advisor;
  const ownSubjectIds = scope === null || scope.advisor ? null : scope.subjectIds;

  const sessions = useMemo(
    () => sessionsForClass(snapshot, classId, date, { canTakeHomeroom }),
    [canTakeHomeroom, classId, date, snapshot]
  );

  const suggested = useMemo(() => currentSessionFor(sessions, { ownSubjectIds }), [ownSubjectIds, sessions]);
  const session = sessions.find((item) => item.key === chosenKey) ?? suggested;

  const statusOf = (studentId: string): AttendanceStatus | null => session
    ? snapshot.attendance.find((item) => item.classId === classId
      && item.studentId === studentId
      && item.attendanceDate === date
      && (item.sessionKey ?? 'daily') === session.key)?.status ?? null
    : null;

  const marked = roster.filter((student) => statusOf(student.id) !== null).length;
  const unmarked = roster.filter((student) => statusOf(student.id) === null);

  /*
   * When the register was taken, which is not the same as when the lesson was.
   *
   * A period runs 09:30–10:20 whatever happens; the register is the moment somebody stood in front
   * of the room and marked it. Schools are asked for that time -- a register taken at the end of a
   * lesson says something different from one taken at the start -- and it was being written into
   * the row and shown nowhere. It is the first mark of this sheet, because that is when the taking
   * began.
   */
  const takenAt = useMemo(() => {
    if (!session) return null;
    const stamps = snapshot.attendance
      .filter((item) => item.classId === classId && item.attendanceDate === date
        && (item.sessionKey ?? 'daily') === session.key)
      .map((item) => Date.parse(item.createdAt))
      .filter((value) => Number.isFinite(value));
    if (stamps.length === 0) return null;
    return new Date(Math.min(...stamps)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }, [classId, date, session, snapshot.attendance]);
  const subjectName = session ? subjectById(snapshot, session.subjectId)?.name : undefined;

  const sessionFields = session
    ? {
      sessionKey: session.key, sessionType: session.type, period: session.period,
      subjectId: session.subjectId, timetableEntryId: session.timetableEntryId
    }
    : null;

  /**
   * A mark goes on, and the same press takes it off again.
   *
   * The commonest mistake at a register is a press on the row above the one you meant, and until now
   * there was no way back from it: a mark could be changed to a different mark, never returned to
   * "not checked yet". So a mis-tap left somebody marked present who was never asked, and the sheet
   * read as finished when it was not.
   *
   * Pressing the mark that is already set is the gesture, because it is the one press that currently
   * does nothing at all — the button is already `aria-pressed`, and a toggle is what a pressed button
   * is expected to do.
   */
  async function mark(studentId: string, status: AttendanceStatus) {
    if (!sessionFields) return;
    try {
      if (statusOf(studentId) === status) {
        await repository.clearAttendance(classId, date, [studentId], sessionFields.sessionKey);
        return;
      }
      await repository.setAttendance({ classId, studentId, attendanceDate: date, status, ...sessionFields });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  /**
   * Everybody present, in one press.
   *
   * The ordinary answer for a class of forty is "all of them", and it was forty presses to say so.
   * This writes the marks nobody has touched yet and leaves the ones already set alone, so a
   * teacher who has ticked the three absences can finish the sheet without undoing them.
   */
  async function markAllPresent() {
    if (!sessionFields || unmarked.length === 0) return;
    setBusy(true);
    try {
      await repository.setAttendanceForStudents(classId, date, 'present', unmarked.map((student) => student.id), sessionFields);
      toast(`บันทึกมาเรียน ${unmarked.length} คนแล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The whole sheet back to blank, for the register that was taken on the wrong one.
   *
   * A teacher who marks forty children against yesterday's period, or against the lesson before
   * theirs, has forty presses of undoing to do one at a time. It asks first, because unlike a single
   * toggle this throws away work that was correct as well as work that was not.
   */
  async function clearAll() {
    if (!sessionFields || marked === 0) return;
    setBusy(true);
    try {
      await repository.clearAttendance(classId, date, roster.map((student) => student.id), sessionFields.sessionKey);
      toast(`ล้างการเช็กชื่อ ${marked} คนแล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ล้างไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
      setClearing(false);
    }
  }

  /** Closing the period is one tap that writes a mark for everybody left, so it asks first. */
  async function closePeriod() {
    if (!sessionFields || unmarked.length === 0) return;
    setBusy(true);
    try {
      await repository.setAttendanceForStudents(classId, date, 'absent', unmarked.map((student) => student.id), sessionFields);
      toast(`ปิดคาบแล้ว · บันทึกขาดเรียน ${unmarked.length} คน`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ปิดคาบไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
      setClosing(false);
    }
  }

  if (roster.length === 0) {
    return (
      <Card className="period-register">
        <CardHeader title="เช็กชื่อคาบนี้" description="เปิดห้องแล้วเช็กชื่อได้จากตรงนี้" />
        <EmptyState
          icon={<Icon name="attendance" size={28} />}
          title="ยังไม่มีนักเรียนในห้องนี้"
          description="เมื่อมีนักเรียนในห้อง รายชื่อสำหรับเช็กชื่อจะขึ้นที่นี่"
        />
      </Card>
    );
  }

  return (
    <Card className="period-register">
      <CardHeader
        title={session ? `เช็กชื่อ · ${sessionLabel(session, subjectName)}` : 'เช็กชื่อคาบนี้'}
        description={[
          session?.time, date,
          takenAt ? `เช็กชื่อเมื่อ ${takenAt} น.` : null,
          'แต่ละคาบมีการเช็กชื่อของตัวเอง ครูวิชาถัดไปจะได้แผ่นใหม่'
        ].filter(Boolean).join(' · ')}
        action={<Badge tone={marked === roster.length ? 'success' : 'warning'}>{marked}/{roster.length} คน</Badge>}
      />

      {sessions.length > 1 && (
        <Field label="คาบเรียน" hint="ปกติระบบเลือกคาบที่กำลังสอนให้อัตโนมัติจากตารางสอน">
          <select value={session?.key ?? ''} onChange={(event) => setChosenKey(event.target.value)}>
            {sessions.map((item) => (
              <option key={item.key} value={item.key}>
                {(item.label || sessionLabel(item, subjectById(snapshot, item.subjectId)?.name))}
                {item.time ? ` · ${item.time}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      <ProgressBar
        value={marked}
        max={roster.length}
        tone={marked === roster.length ? 'success' : 'brand'}
        label={`เช็กแล้ว ${marked} จาก ${roster.length} คน`}
      />

      <ul className="period-register-list">
        {roster.map((student) => {
          const status = statusOf(student.id);
          return (
            <li key={student.id} data-status={status ?? 'none'}>
              <ProfileAvatar
                displayName={student.displayName}
                avatarId={student.avatarId}
                avatarPhotoId={student.avatarPhotoId}
                avatarIndex={student.avatarIndex}
                avatarConfig={student.avatarConfig}
                size={40}
              />
              <span className="period-register-person">
                <strong>{student.displayName}</strong>
                <small>{status ? markLabels[status] : 'ยังไม่เช็ก'}</small>
              </span>
              <span className="period-register-marks" role="group" aria-label={`สถานะของ ${student.displayName}`}>
                {marks.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="period-mark"
                    data-mark={item.value}
                    aria-pressed={status === item.value}
                    onClick={() => void mark(student.id, item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      {/* The common answer first, and the closing one after it: most registers are "everybody is
          here", and the one that writes absences is the one worth pausing over. */}
      <div className="ui-card-actions">
        <Button
          variant="primary"
          icon={<Icon name="check" size={16} />}
          loading={busy}
          disabled={unmarked.length === 0}
          onClick={() => void markAllPresent()}
        >
          {unmarked.length === roster.length
            ? 'มาเรียนทั้งห้อง'
            : `มาเรียนอีก ${unmarked.length} คนที่เหลือ`}
        </Button>
        <Button
          variant="secondary"
          disabled={unmarked.length === 0 || busy}
          onClick={() => setClosing(true)}
        >
          ปิดคาบ · ที่เหลือ {unmarked.length} คนเป็นขาดเรียน
        </Button>
        {/* Last, and quiet: undoing a whole sheet is a rare thing to want and an easy thing to hit
            by accident, so it sits away from the two buttons a teacher presses every lesson. */}
        <Button
          variant="ghost"
          icon={<Icon name="close" size={16} />}
          disabled={marked === 0 || busy}
          onClick={() => setClearing(true)}
        >
          ล้างทั้งห้อง
        </Button>
      </div>

      {closing && (
        <ConfirmDialog
          title="ปิดคาบนี้?"
          description={`นักเรียนที่ยังไม่ถูกเช็ก ${unmarked.length} คนจะถูกบันทึกเป็นขาดเรียนของคาบนี้ · แก้ไขรายคนได้ภายหลัง`}
          confirmLabel="ปิดคาบ"
          onCancel={() => setClosing(false)}
          onConfirm={() => void closePeriod()}
        />
      )}

      {clearing && (
        <ConfirmDialog
          title="ล้างการเช็กชื่อคาบนี้?"
          description={`การเช็กชื่อของคาบนี้ ${marked} คนจะถูกลบทั้งหมด และแผ่นนี้จะกลับไปเป็นยังไม่เช็ก · คาบอื่นและวันอื่นไม่กระทบ`}
          confirmLabel="ล้างทั้งห้อง"
          tone="danger"
          onCancel={() => setClearing(false)}
          onConfirm={() => void clearAll()}
        />
      )}
    </Card>
  );
}
