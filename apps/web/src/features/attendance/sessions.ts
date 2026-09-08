import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { AttendanceSessionType } from '../../domain/types';

/**
 * A register belongs to a period, not to a day.
 *
 * A school that teaches six subjects a day takes six registers, and the one the teacher in front of
 * the room needs is the period they are teaching right now. That period is already described in the
 * timetable — day, time, subject, teacher — so the register reads it rather than asking the teacher
 * to say again what the timetable already knows. Move a lesson on the timetable and its register
 * moves with it; nothing has to be re-entered, because the register was never the record of when
 * the lesson was.
 */
export interface AttendanceSession {
  /** The timetable entry's id, so a period's marks stay with the period even if it is rescheduled. */
  key: string;
  label: string;
  type: AttendanceSessionType;
  period: number | null;
  subjectId: string | null;
  timetableEntryId: string | null;
  time: string;
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export function sessionLabel(session: AttendanceSession, subjectName?: string): string {
  if (session.type === 'homeroom') return 'โฮมรูม';
  if (session.type === 'daily') return 'สรุปทั้งวัน';
  return `${subjectName ?? 'ไม่ระบุวิชา'} · คาบ ${session.period ?? '-'}`;
}

/**
 * Every register a room takes on one day: homeroom, then one per timetabled lesson.
 *
 * A day with no timetable still gets a register — "สรุปทั้งวัน" — because a school that has not
 * built its schedule yet still has children in front of it, and a mark that waits for the schedule
 * is a mark nobody remembers by the time it can be written.
 */
export function sessionsForClass(snapshot: SchoolSnapshot, classId: string, date: string): AttendanceSession[] {
  const classroom = snapshot.classes.find((item) => item.id === classId);
  const entries = snapshot.timetable
    .filter((item) => item.classId === classId
      && item.academicTermId === classroom?.academicTermId
      && item.dayOfWeek === isoWeekday(date)
      && item.status === 'active')
    .sort((a, b) => a.period - b.period);
  const classSessions: AttendanceSession[] = entries.map((entry) => ({
    key: entry.id, label: '', type: 'class', period: entry.period,
    subjectId: entry.subjectId, timetableEntryId: entry.id, time: `${entry.startTime}–${entry.endTime}`
  }));
  return [
    { key: 'homeroom', label: 'โฮมรูม', type: 'homeroom', period: null, subjectId: null, timetableEntryId: null, time: '' },
    ...classSessions,
    ...(classSessions.length === 0
      ? [{ key: 'daily', label: 'สรุปทั้งวัน', type: 'daily' as const, period: null, subjectId: null, timetableEntryId: null, time: '' }]
      : [])
  ];
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The period a teacher is standing in.
 *
 * Preference order is the order of how sure we are: the lesson happening at this minute, then the
 * next lesson of theirs today, then their first lesson of the day, and only then the room's first
 * period at all. A teacher who teaches this room twice today opens the one that is now, and a
 * teacher who arrives early opens the one about to start rather than this morning's.
 *
 * `ownSubjectIds` is what makes it their period rather than the room's: two teachers open the same
 * room at the same time and each gets their own lesson's register, which is the whole point — the
 * science teacher's register is not the computing teacher's, and neither is already ticked.
 */
export function currentSessionFor(
  sessions: AttendanceSession[],
  options: { now?: Date; ownSubjectIds?: Set<string> | null } = {}
): AttendanceSession | null {
  const lessons = sessions.filter((session) => session.type === 'class');
  if (lessons.length === 0) return sessions[0] ?? null;

  const own = options.ownSubjectIds ?? null;
  const mine = own === null
    ? lessons
    : lessons.filter((session) => session.subjectId !== null && own.has(session.subjectId));
  const candidates = mine.length > 0 ? mine : lessons;

  const now = options.now ?? new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const running = candidates.find((session) => {
    const [start, end] = session.time.split('–');
    const from = minutesOf(start ?? '');
    const until = minutesOf(end ?? '');
    return from !== null && until !== null && minutes >= from && minutes < until;
  });
  if (running) return running;

  const upcoming = candidates.find((session) => {
    const from = minutesOf(session.time.split('–')[0] ?? '');
    return from !== null && from >= minutes;
  });
  return upcoming ?? candidates[candidates.length - 1] ?? null;
}
