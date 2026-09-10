import { patch } from './patchlib.mjs';
const file = 'apps/web/tests/integration/submissionWithdrawal.test.ts';

const old = `  it('does nothing to work that was never handed in', async () => {
    const work = published(snapshotOf(repository));
    const student = snapshotOf(repository).students[0]!;
    await repository.markWorkOpened(work.id, student.id);
    const before = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id);

    await repository.withdrawWork(work.id, student.id);

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id);
    expect(after?.status).toBe(before?.status);
    expect(after?.submittedAt ?? null).toBeNull();
  });`;

const neu = `  it('does nothing to work that was never handed in', async () => {
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
  });`;

patch(file, [[old, neu]]);
console.log('fixed');
