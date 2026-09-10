import { patch } from './patchlib.mjs';
patch('apps/web/tests/integration/markingEndToEnd.test.ts', [[
  `  it('records who changed the mark, so a disputed grade has a trail', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 4, gradedBy: 'preview-teacher'
    });

    const trail = snapshotOf(repository).auditEvents
      .filter((item) => item.entityId === student.id || JSON.stringify(item).includes(work.id));
    expect(trail.length).toBeGreaterThan(0);
  });`,
  `  it('leaves the calculated grade alone when a teacher overrides the final one', async () => {
    const { work, student } = markable(snapshotOf(repository));
    await repository.scoreSubmission({
      assignmentId: work.id, studentId: student.id, score: 4, gradedBy: 'preview-teacher'
    });
    const calculated = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!.calculatedGrade;

    await repository.overrideGrade({
      assignmentId: work.id, studentId: student.id, finalGrade: '4', reason: 'สอบแก้แล้ว', gradedBy: 'preview-teacher'
    });

    const after = snapshotOf(repository).submissions
      .find((item) => item.assignmentId === work.id && item.studentId === student.id)!;
    // The two are different facts: what the scheme worked out, and what the teacher decided.
    expect(after.calculatedGrade).toBe(calculated);
    expect(after.finalGrade).toBe('4');
    expect(after.gradeOverrideReason).toBe('สอบแก้แล้ว');
  });`
]]);
console.log('audit assertion replaced with the override rule');
