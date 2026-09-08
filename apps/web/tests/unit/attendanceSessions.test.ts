import { describe, expect, it } from 'vitest';
import { currentSessionFor, type AttendanceSession } from '../../src/features/attendance/sessions';

const lesson = (over: Partial<AttendanceSession>): AttendanceSession => ({
  key: 'entry-1', label: '', type: 'class', period: 1,
  subjectId: 'subject-computing', timetableEntryId: 'entry-1', time: '08:30–09:20',
  ...over
});

const homeroom: AttendanceSession = {
  key: 'homeroom', label: 'โฮมรูม', type: 'homeroom', period: null,
  subjectId: null, timetableEntryId: null, time: ''
};

const at = (hour: number, minute = 0) => new Date(2026, 8, 9, hour, minute);

describe('which register a teacher is standing in', () => {
  const timetable = [
    homeroom,
    lesson({ key: 'a', period: 1, subjectId: 'computing', time: '08:30–09:20' }),
    lesson({ key: 'b', period: 2, subjectId: 'science', time: '09:30–10:20' }),
    lesson({ key: 'c', period: 3, subjectId: 'computing', time: '10:30–11:20' })
  ];

  it('opens the lesson happening at this minute', () => {
    expect(currentSessionFor(timetable, { now: at(9, 45) })?.key).toBe('b');
  });

  it('gives two teachers of the same room their own period', () => {
    // The science teacher and the computing teacher open the same room at the same time and each
    // gets their own lesson — which is what keeps one of them from inheriting the other's ticks.
    const science = currentSessionFor(timetable, { now: at(9, 45), ownSubjectIds: new Set(['science']) });
    const computing = currentSessionFor(timetable, { now: at(9, 45), ownSubjectIds: new Set(['computing']) });
    expect(science?.key).toBe('b');
    expect(computing?.key).toBe('c');
  });

  it('offers the next lesson to a teacher who arrives early', () => {
    expect(currentSessionFor(timetable, { now: at(7, 50) })?.key).toBe('a');
  });

  it('falls back to the last lesson of the day once they are all over', () => {
    expect(currentSessionFor(timetable, { now: at(16, 0) })?.key).toBe('c');
  });

  it('falls back to the room itself when the day has no timetable', () => {
    expect(currentSessionFor([homeroom], { now: at(9, 0) })?.key).toBe('homeroom');
  });

  it('still answers for a teacher whose subject is not on the timetable today', () => {
    const chosen = currentSessionFor(timetable, { now: at(9, 45), ownSubjectIds: new Set(['art']) });
    expect(chosen?.key).toBe('b');
  });
});
