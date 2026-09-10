import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function snapshotOf(repository: FixtureSchoolRepository): SchoolSnapshot {
  let snapshot: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((next) => { snapshot = next; });
  unsubscribe();
  if (!snapshot) throw new Error('fixture snapshot unavailable');
  return snapshot;
}

/**
 * Taking a turn-in back.
 *
 * Handing in the wrong photograph was final: the child watched "ส่งแล้ว" sit over work they knew was
 * wrong, and the only remedy ran through the teacher. These are the four things a withdrawal has to
 * get right — it undoes the hand-in, it keeps the history, it refuses once a mark exists, and it
 * leaves a resubmission back where the teacher had put it.
 */
describe('a student takes their own work back', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  function published(snapshot: SchoolSnapshot) {
    return snapshot.assignments.find((item) => item.status === 'published')!;
  }

  it('clears the submitted time and the lateness so the work is waiting again', async () => {
    const work = published(snapshotOf(repository));
    const student = snapshotOf(repository).students[0]!;
    await repository.submitWork(work.id, student.id, 'ส่งผิดไฟล์', false, null);

    const handedIn = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    expect(handedIn.submittedAt).toBeTruthy();

    await repository.withdrawWork(work.id, student.id);

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    expect(after.submittedAt).toBeNull();
    expect(after.isLate).toBe(false);
    expect(['not_started', 'in_progress']).toContain(after.status);
  });

  it('keeps every version already recorded, because the first hand-in time is evidence', async () => {
    const work = published(snapshotOf(repository));
    const student = snapshotOf(repository).students[0]!;
    await repository.submitWork(work.id, student.id, 'ครั้งแรก', false, null);
    const versionsBefore = snapshotOf(repository).submissionVersions
      .filter((item) => item.assignmentId === work.id && item.studentId === student.id).length;
    expect(versionsBefore).toBeGreaterThan(0);

    await repository.withdrawWork(work.id, student.id);

    const versionsAfter = snapshotOf(repository).submissionVersions
      .filter((item) => item.assignmentId === work.id && item.studentId === student.id).length;
    expect(versionsAfter).toBe(versionsBefore);
  });

  it('refuses once the teacher has marked it, and says why', async () => {
    const work = published(snapshotOf(repository));
    const student = snapshotOf(repository).students[0]!;
    await repository.submitWork(work.id, student.id, '', false, null);
    await repository.returnWork(work.id, student.id, 8, 'ดีมาก');

    await expect(repository.withdrawWork(work.id, student.id)).rejects.toThrow('ครูตรวจงานนี้แล้ว');

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    expect(after.score).toBe(8);
    expect(after.submittedAt).toBeTruthy();
  });

  it('lets the same work be handed in again after it has been taken back', async () => {
    const work = published(snapshotOf(repository));
    const student = snapshotOf(repository).students[0]!;
    await repository.submitWork(work.id, student.id, 'ไฟล์ผิด', false, null);
    await repository.withdrawWork(work.id, student.id);
    await repository.submitWork(work.id, student.id, 'ไฟล์ถูก', false, null);

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    expect(after.submittedAt).toBeTruthy();
    expect(after.studentNote).toBe('ไฟล์ถูก');
    expect(['submitted', 'late', 'resubmitted']).toContain(after.status);
  });

  it('does nothing to work that was never handed in', async () => {
    const snapshot = snapshotOf(repository);
    const work = published(snapshot);
    // Somebody in the room who has not turned this in. The fixture school has children at every
    // stage of every assignment, so the one being tested has to be chosen rather than assumed.
    const student = snapshot.students.find((candidate) => !snapshot.submissions.some((item) =>
      item.assignmentId === work.id && item.studentId === candidate.id && item.submittedAt))!;
    expect(student).toBeTruthy();
    await repository.markWorkOpened(work.id, student.id);
    const before = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id);

    await repository.withdrawWork(work.id, student.id);

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id);
    expect(after?.status).toBe(before?.status);
    expect(after?.submittedAt ?? null).toBeNull();
  });
});
