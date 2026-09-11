import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { assignedTeacherForSubject } from '../../src/data/teacherResponsibilities';

const now = '2026-09-01T00:00:00.000Z';
const row = (id: string) => ({ id, schoolId: 'school', version: 1, createdAt: now, updatedAt: now, deletedAt: null });

type Link = SchoolSnapshot['classTeachers'][number];
const link = (id: string, classId: string, teacherId: string, subjectId: string | null, role: 'primary' | 'assistant' = 'primary'): Link =>
  ({ ...row(id), classId, teacherId, role, subjectId, activeUntil: null });

function school(links: Link[]): SchoolSnapshot {
  return { ...emptySnapshot, ready: true, classTeachers: links };
}

/*
 * Who a timetable slot should name, given who already takes the subject.
 *
 * The answer exists on the class screen before anybody opens the timetable, and the builder used to
 * ask for it again from a list of every member of staff — forty times a week, with nothing on screen
 * saying which of those names has any connection to the subject just chosen. A wrong name is not
 * cosmetic: the register a teacher is offered comes from the timetable entry, so it hands the lesson
 * to somebody who cannot mark it.
 */
describe('the teacher a subject is already assigned to', () => {
  it('names the person who owns the subject in this room', () => {
    const snapshot = school([link('l1', 'room-a', 'teacher-1', 'maths')]);
    expect(assignedTeacherForSubject(snapshot, 'room-a', 'maths')).toBe('teacher-1');
  });

  it('prefers this room\'s answer to another room\'s', () => {
    // A subject taught in six rooms usually has six different people taking it, and only this room's
    // answer is about this lesson.
    const snapshot = school([
      link('l1', 'room-a', 'teacher-1', 'maths'),
      link('l2', 'room-b', 'teacher-2', 'maths')
    ]);
    expect(assignedTeacherForSubject(snapshot, 'room-b', 'maths')).toBe('teacher-2');
  });

  it('falls back to the school-wide assignment when this room has none', () => {
    const snapshot = school([link('l1', 'room-a', 'teacher-1', 'maths')]);
    expect(assignedTeacherForSubject(snapshot, 'room-c', 'maths')).toBe('teacher-1');
  });

  it('prefers the owner of a subject to somebody co-teaching it', () => {
    const snapshot = school([
      link('l1', 'room-a', 'teacher-2', 'maths', 'assistant'),
      link('l2', 'room-a', 'teacher-1', 'maths', 'primary')
    ]);
    expect(assignedTeacherForSubject(snapshot, 'room-a', 'maths')).toBe('teacher-1');
  });

  it('answers nothing when two people own the subject in the same room', () => {
    // A name filled in confidently and wrongly is worse than a field somebody has to answer.
    const snapshot = school([
      link('l1', 'room-a', 'teacher-1', 'maths'),
      link('l2', 'room-a', 'teacher-2', 'maths')
    ]);
    expect(assignedTeacherForSubject(snapshot, 'room-a', 'maths')).toBeNull();
  });

  it('ignores an advisor, who is on the room rather than on the subject', () => {
    const snapshot = school([link('l1', 'room-a', 'teacher-9', null)]);
    expect(assignedTeacherForSubject(snapshot, 'room-a', 'maths')).toBeNull();
  });

  it('ignores a link that has been removed', () => {
    const removed = { ...link('l1', 'room-a', 'teacher-1', 'maths'), deletedAt: now };
    expect(assignedTeacherForSubject(school([removed]), 'room-a', 'maths')).toBeNull();
  });

  it('has nothing to say about a slot with no subject', () => {
    const snapshot = school([link('l1', 'room-a', 'teacher-1', 'maths')]);
    expect(assignedTeacherForSubject(snapshot, 'room-a', null)).toBeNull();
    expect(assignedTeacherForSubject(snapshot, 'room-a', '')).toBeNull();
  });
});
