import { patch } from './patchlib.mjs';
patch('apps/web/tests/integration/markingEndToEnd.test.ts', [[
  `    await repository.overrideGrade({
      assignmentId: work.id, studentId: student.id, finalGrade: '4', reason: 'สอบแก้แล้ว', gradedBy: 'preview-teacher'
    });`,
  `    await repository.overrideGrade(work.id, student.id, '4', 'สอบแก้แล้ว', 'preview-teacher');`
]]);
console.log('override call matches its signature');
