import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { currentSessionFor, sessionsForClass } from '../../src/features/attendance/sessions';

const now = '2026-09-01T00:00:00.000Z';
const row = (id: string) => ({ id, schoolId: 'school', version: 1, createdAt: now, updatedAt: now, deletedAt: null });

/** A Monday with two lessons in one room. */
function school(): SchoolSnapshot {
  return {
    ...emptySnapshot,
    ready: true,
    classes: [{ ...row('room'), academicTermId: 'term', name: 'ป.5/1', gradeLevel: 'ป.5', capacity: 30, status: 'active' }],
    timetable: [
      {
        ...row('tt-1'), classId: 'room', academicTermId: 'term', dayOfWeek: 1, period: 1,
        startTime: '08:30', endTime: '09:20', subjectId: 'maths', teacherId: 't1', room: '', status: 'active'
      },
      {
        ...row('tt-2'), classId: 'room', academicTermId: 'term', dayOfWeek: 1, period: 2,
        startTime: '09:30', endTime: '10:20', subjectId: 'science', teacherId: 't2', room: '', status: 'active'
      }
    ]
  };
}

// 2026-09-07 is a Monday.
const MONDAY = '2026-09-07';

/*
 * Which register a teacher is offered, and which they are not.
 *
 * The register reads the timetable rather than asking: it knows the day, the period, the subject and
 * the clock already. What it must not do is offer a sheet that is not this person's — the morning
 * belongs to whoever looks after the room, and a subject teacher has their own period to mark.
 */
describe('the registers a room offers on one day', () => {
  const snapshot = school();

  it('lists the morning and then every timetabled lesson', () => {
    const sessions = sessionsForClass(snapshot, 'room', MONDAY);
    expect(sessions.map((session) => session.type)).toEqual(['homeroom', 'class', 'class']);
    expect(sessions[1]?.subjectId).toBe('maths');
    expect(sessions[1]?.time).toBe('08:30–09:20');
  });

  it('keeps the morning for the person who looks after the room', () => {
    // Homeroom is the room itself rather than any lesson in it. A teacher who takes one subject
    // there has a period of their own to mark and no business marking the morning.
    const subjectTeacher = sessionsForClass(snapshot, 'room', MONDAY, { canTakeHomeroom: false });
    expect(subjectTeacher.map((session) => session.type)).toEqual(['class', 'class']);
    expect(subjectTeacher.some((session) => session.key === 'homeroom')).toBe(false);
  });

  it('still gives a room with no timetable something to mark', () => {
    // A school that has not built its schedule yet still has children in front of it, and this holds
    // even when the morning is closed to the reader — otherwise there is nothing to write on at all.
    const sunday = '2026-09-06';
    const advisor = sessionsForClass(snapshot, 'room', sunday);
    const subjectTeacher = sessionsForClass(snapshot, 'room', sunday, { canTakeHomeroom: false });
    expect(advisor.map((session) => session.key)).toEqual(['homeroom', 'daily']);
    expect(subjectTeacher.map((session) => session.key)).toEqual(['daily']);
  });

  it('opens on the lesson being taught, and on this teacher’s lesson when two share the room', () => {
    const sessions = sessionsForClass(snapshot, 'room', MONDAY, { canTakeHomeroom: false });
    const at = (hour: number, minute: number) => new Date(2026, 8, 7, hour, minute);
    // The clock decides first.
    expect(currentSessionFor(sessions, { now: at(9, 45) })?.subjectId).toBe('science');
    // And whose subject it is decides between two lessons at the same hour.
    expect(currentSessionFor(sessions, { now: at(9, 45), ownSubjectIds: new Set(['maths']) })?.subjectId).toBe('maths');
  });
});
