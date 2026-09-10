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
 * A mark, from the box a teacher types it into to the row a child reads it from.
 *
 * The screen shows a percentage and a grade the moment a number is typed, and both are calculated
 * from the school's own scheme rather than stored by the screen -- so the thing that has to be
 * checked is that what the teacher saw is what was written, and that it is still there afterwards.
 */
describe('a mark written by a teacher', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  function markable(snapshot: SchoolSnapshot) {
    const work = snapshot.assignments.find((item) => item.status === 'published' && item.maxScore > 0)!;
    const student = snapshot.students[0]!;
    return { work, student };
  }

  it('is stored on the submission with the percentage and the grade the scheme produces', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: work.maxScore, gradedBy: 'preview-teacher'
    });

    const marked = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    expect(marked.score).toBe(work.maxScore);
    expect(marked.percentage).toBe(100);
    expect(marked.calculatedGrade).toBeTruthy();
    expect(marked.gradedBy).toBe('preview-teacher');
    expect(marked.gradedAt).toBeTruthy();
  });

  it('survives being read back, so what the teacher saved is what the next screen shows', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 7, gradedBy: 'preview-teacher'
    });
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 9, gradedBy: 'preview-teacher'
    });

    const rows = snapshotOf(repository).submissions
      .filter((item) => item.assignmentId === work.id && item.studentId === student.id);
    // One row per child per piece of work, whatever the mark was changed to.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.score).toBe(9);
  });

  it('clears a mark back to nothing rather than to zero', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 5, gradedBy: 'preview-teacher'
    });
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: null, gradedBy: 'preview-teacher'
    });

    const marked = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    // A blank box means "not marked yet", and a nought is a mark. Confusing them fails a child.
    expect(marked.score).toBeNull();
  });

  it('tells the child their work has been marked', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 6, gradedBy: 'preview-teacher'
    });

    const notices = snapshotOf(repository).notifications
      .filter((item) => item.studentId === student.id && item.assignmentId === work.id);
    expect(notices.some((item) => item.kind === 'grade_posted')).toBe(true);
  });

  it('leaves the calculated grade alone when a teacher overrides the final one', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 4, gradedBy: 'preview-teacher'
    });
    const calculated = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!.calculatedGrade;

    await repository.overrideGrade(work.id, student.id, '4', 'สอบแก้แล้ว', 'preview-teacher');

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    // The two are different facts: what the scheme worked out, and what the teacher decided.
    expect(after.calculatedGrade).toBe(calculated);
    expect(after.finalGrade).toBe('4');
    expect(after.gradeOverrideReason).toBe('สอบแก้แล้ว');
  });
});
