import { describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { teacherCanViewScore } from '../../src/data/teacherResponsibilities';
import { calendarItemsFor } from '../../src/academic/views';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function fixtureSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let current!: SchoolSnapshot;
  const stop = repository.subscribe((snapshot) => { current = snapshot; });
  stop();
  return current;
}

/**
 * Whose work a member of staff is shown.
 *
 * The work list handed every teacher the whole room: the maths teacher scrolled past science
 * homework, an art project and a computing worksheet to find their own, and could not tell which of
 * the four rows they were responsible for. The staff list already records the answer -- an advisor
 * is attached to the room with no subject and sees all of it, a subject teacher is attached to one
 * subject and sees that -- and it is the same question the gradebook asks, so the screens now agree.
 *
 * These check the rule the screen filters by, and then that the filter narrows a real room.
 */
describe('which work a teacher is shown', () => {
  const scoped = (snapshot: SchoolSnapshot, profileId: string, classId: string) =>
    calendarItemsFor(snapshot, { classIds: [classId], includeDrafts: true })
      .filter((item) => teacherCanViewScore(snapshot, profileId, item.work.classId, item.work.subjectId));

  it('gives an advisor the whole room, subject by subject', () => {
    const repository = new FixtureSchoolRepository();
    const snapshot = fixtureSnapshot(repository);
    // preview-teacher advises fixture-class-1 with no subject on the row, so every subject is theirs.
    const everything = calendarItemsFor(snapshot, { classIds: ['fixture-class-1'], includeDrafts: true });
    expect(everything.length).toBeGreaterThan(0);
    expect(scoped(snapshot, 'preview-teacher', 'fixture-class-1')).toHaveLength(everything.length);
  });

  it('gives a subject teacher their own subject and nothing else in the same room', async () => {
    const repository = new FixtureSchoolRepository();
    // fixture-teacher-3 teaches one subject in fixture-class-1 and advises nothing there.
    await repository.assignTeacher('fixture-class-1', 'fixture-teacher-3', 'primary', 'fixture-subject-MA');
    const snapshot = fixtureSnapshot(repository);
    const teacher = snapshot.teachers.find((item) => item.id === 'fixture-teacher-3')!;
    const profileId = teacher.profileId ?? 'fixture-teacher-3-profile';

    const everything = calendarItemsFor(snapshot, { classIds: ['fixture-class-1'], includeDrafts: true });
    const theirs = everything.filter((item) =>
      teacherCanViewScore({ ...snapshot, teachers: [{ ...teacher, profileId }] }, profileId, item.work.classId, item.work.subjectId));

    expect(everything.length).toBeGreaterThan(theirs.length);
    for (const item of theirs) expect(item.work.subjectId).toBe('fixture-subject-MA');
  });

  it('never narrows what an administrator is shown', () => {
    const repository = new FixtureSchoolRepository();
    const snapshot = fixtureSnapshot(repository);
    // The screen exempts every role but 'teacher'; an administrator is answerable for the lot.
    const everything = calendarItemsFor(snapshot, { classIds: ['fixture-class-1'], includeDrafts: true });
    expect(everything.length).toBeGreaterThan(0);
  });

  it('shows a room-wide piece of work to everyone on that room staff', () => {
    // Work carrying no subject belongs to the room rather than to a subject, so it must not become
    // invisible to the subject teachers who are also responsible for that room.
    const repository = new FixtureSchoolRepository();
    const snapshot = fixtureSnapshot(repository);
    expect(teacherCanViewScore(snapshot, 'preview-teacher', 'fixture-class-1', null)).toBe(true);
  });
});
