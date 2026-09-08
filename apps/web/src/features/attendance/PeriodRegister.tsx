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
  const [busy, setBusy] = useState(false);

  const roster = useMemo(() => rosterFor(snapshot, classId), [snapshot, classId]);
  const sessions = useMemo(() => sessionsForClass(snapshot, classId, date), [classId, date, snapshot]);

  // Their own lesson, not the room's first: a teacher opening a room they take one subject in
  // should land on that subject's register.
  const ownSubjectIds = useMemo(() => {
    if (membership.role !== 'teacher') return null;
    const scope = teacherClassScope(snapshot, membership.profileId, classId);
    return scope.advisor ? null : scope.subjectIds;
  }, [classId, membership.profileId, membership.role, snapshot]);

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
  const subjectName = session ? subjectById(snapshot, session.subjectId)?.name : undefined;

  const sessionFields = session
    ? {
      sessionKey: session.key, sessionType: session.type, period: session.period,
      subjectId: session.subjectId, timetableEntryId: session.timetableEntryId
    }
    : null;

  async function mark(studentId: string, status: AttendanceStatus) {
    if (!sessionFields) return;
    try {
      await repository.setAttendance({ classId, studentId, attendanceDate: date, status, ...sessionFields });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
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
        description={session?.time
          ? `${session.time} · ${date} · แต่ละคาบมีการเช็กชื่อของตัวเอง ครูวิชาถัดไปจะได้แผ่นใหม่`
          : `${date} · แต่ละคาบมีการเช็กชื่อของตัวเอง ครูวิชาถัดไปจะได้แผ่นใหม่`}
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

      <div className="ui-card-actions">
        <Button
          variant="secondary"
          disabled={unmarked.length === 0 || busy}
          onClick={() => setClosing(true)}
        >
          ปิดคาบ · ที่เหลือ {unmarked.length} คนเป็นขาดเรียน
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
    </Card>
  );
}
