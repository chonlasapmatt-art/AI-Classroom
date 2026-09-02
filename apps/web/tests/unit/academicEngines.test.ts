import { describe, expect, it } from 'vitest';
import {
  applyQuietHours, changedNotifiableFields, defaultReminderOffsets, dueReminders, planReminders,
  reminderDedupeKey, reminderPresets, staleReminderIds
} from '../../src/academic/reminderEngine';
import {
  defaultGradeScheme, gradePointFor, gradeForPercentage, gradeSchemeFrom, percentageOf, resolveGrade,
  ScoreValidationError, validateScore
} from '../../src/academic/gradeScheme';
import { rubricMaxScore, rubricMatchesWork, rubricTotal, validateRubric } from '../../src/academic/rubric';
import { buildGradebook, categoryWeightsFrom, defaultCategoryWeights, gradeDistribution, totalWeight, weightsAreValid } from '../../src/academic/gradebook';
import { followUpInsights, workloadWarningFor, WORKLOAD_WARNING_THRESHOLD } from '../../src/academic/workload';
import { effectiveDueAt, timeRemainingLabel, workStateFor } from '../../src/academic/workStatus';
import { studentTrackingFor } from '../../src/academic/views';
import { emptySnapshot } from '../../src/data/schoolRepository';
import type { Assignment, ClassroomNotification, DeadlineExtension, Student, Submission, Subject } from '../../src/domain/types';

const base = {
  id: 'w1', schoolId: 's1', version: 1, createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null
};

function work(overrides: Partial<Assignment> = {}): Assignment {
  return {
    ...base, classId: 'c1', subjectId: 'sub1', workType: 'assignment', title: 'ใบงาน',
    description: '', instructions: '', assignedAt: base.createdAt, startAt: null,
    dueAt: '2026-09-10T09:00:00.000Z', maxScore: 20, rubricId: null,
    reminderOffsets: [0, 1440, 180], status: 'published', publishedAt: base.createdAt, cancelledAt: null,
    ...overrides
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    ...base, id: 'sub-1', assignmentId: 'w1', studentId: 'st1', submittedAt: null, status: 'not_started',
    score: null, isLate: false, teacherNote: '', studentNote: '', version: 0, openedAt: null,
    acknowledgedAt: null, revisionNote: '', percentage: null, calculatedGrade: null, finalGrade: null,
    gradeOverrideReason: '', gradedBy: null, gradedAt: null, ...overrides
  };
}

describe('deadline states', () => {
  const now = new Date('2026-09-09T09:00:00.000Z');

  it('separates upcoming, soon, urgent and overdue', () => {
    expect(workStateFor({ work: work({ dueAt: '2026-09-20T09:00:00.000Z' }), now })).toBe('upcoming');
    expect(workStateFor({ work: work({ dueAt: '2026-09-09T20:00:00.000Z' }), now })).toBe('soon');
    expect(workStateFor({ work: work({ dueAt: '2026-09-09T10:30:00.000Z' }), now })).toBe('urgent');
    expect(workStateFor({ work: work({ dueAt: '2026-09-08T09:00:00.000Z' }), now })).toBe('overdue');
  });

  it('lets a submission take over the state', () => {
    expect(workStateFor({ work: work(), submission: submission({ status: 'submitted' }), now })).toBe('submitted');
    expect(workStateFor({ work: work(), submission: submission({ status: 'late', isLate: true }), now })).toBe('late');
    expect(workStateFor({ work: work(), submission: submission({ status: 'graded' }), now })).toBe('graded');
    expect(workStateFor({ work: work(), submission: submission({ status: 'revision_requested' }), now })).toBe('revision_requested');
  });

  it('never shows a draft or a cancelled work as due', () => {
    expect(workStateFor({ work: work({ status: 'draft' }), now })).toBe('draft');
    expect(workStateFor({ work: work({ status: 'cancelled' }), now })).toBe('cancelled');
  });

  it('uses a personal extension as the effective deadline', () => {
    const extension: DeadlineExtension = {
      ...base, id: 'ext1', assignmentId: 'w1', studentId: 'st1', dueAt: '2026-09-13T09:00:00.000Z',
      reason: 'ลาป่วย', grantedBy: 'teacher-1'
    };
    expect(effectiveDueAt(work(), 'st1', [extension])).toBe('2026-09-13T09:00:00.000Z');
    expect(effectiveDueAt(work(), 'st2', [extension])).toBe('2026-09-10T09:00:00.000Z');
  });

  it('describes the remaining time in words', () => {
    expect(timeRemainingLabel('2026-09-09T13:00:00.000Z', now)).toBe('เหลือ 4 ชั่วโมง');
    expect(timeRemainingLabel('2026-09-12T09:00:00.000Z', now)).toBe('เหลือ 3 วัน');
    expect(timeRemainingLabel('2026-09-08T09:00:00.000Z', now)).toContain('เลยกำหนด');
    expect(timeRemainingLabel(null)).toBe('ไม่กำหนดวันส่ง');
  });
});

describe('student work tracking', () => {
  it('summarises submitted, late and waiting work per student', () => {
    const students: Student[] = [
      { ...base, id: 'st1', profileId: null, studentCode: '001', displayName: 'สมชาย', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' },
      { ...base, id: 'st2', profileId: null, studentCode: '002', displayName: 'มาลี', avatarIndex: 1, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' }
    ];
    const snapshot = {
      ...emptySnapshot,
      classes: [{ ...base, id: 'c1', academicTermId: 'term-1', name: 'ป.4/1', gradeLevel: 'ป.4', capacity: 40, status: 'active' as const }],
      students,
      enrollments: students.map((student) => ({ ...base, id: `en-${student.id}`, studentId: student.id, classId: 'c1', academicTermId: 'term-1', status: 'active' as const, enrolledAt: base.createdAt, leftAt: null })),
      assignments: [work({ id: 'w1', dueAt: '2026-09-10T09:00:00.000Z' }), work({ id: 'w2', dueAt: '2026-09-20T09:00:00.000Z' })],
      submissions: [submission({ id: 's1', assignmentId: 'w1', studentId: 'st1', status: 'late', isLate: true, submittedAt: '2026-09-11T09:00:00.000Z' }), submission({ id: 's2', assignmentId: 'w2', studentId: 'st1', status: 'submitted', submittedAt: '2026-09-19T09:00:00.000Z' })]
    };
    const rows = studentTrackingFor(snapshot, 'c1', new Date('2026-09-12T09:00:00.000Z'));
    expect(rows[0]).toMatchObject({ submitted: 2, late: 1, waiting: 0, bucket: 'attention', completionRate: 100 });
    expect(rows[1]).toMatchObject({ submitted: 0, overdue: 1, waiting: 2, bucket: 'attention', completionRate: 0 });
  });
});

describe('reminder engine', () => {
  const now = new Date('2026-09-01T09:00:00.000Z');

  it('offers the presets a teacher can choose from', () => {
    expect(reminderPresets.map((preset) => preset.offsetMinutes)).toEqual([0, 10080, 4320, 1440, 180, 60]);
    expect(defaultReminderOffsets('project')).toEqual([0, 4320, 1440, 180]);
    expect(defaultReminderOffsets('homework')).toEqual([0, 1440, 180]);
  });

  it('schedules one reminder per student per offset', () => {
    const plan = planReminders({ work: work(), studentIds: ['st1', 'st2'], now });
    expect(plan).toHaveLength(4);
    expect(new Set(plan.map((item) => item.dedupeKey)).size).toBe(4);
    expect(plan[0]!.dedupeKey).toBe(reminderDedupeKey('w1', 'st1', 1440));
  });

  it('skips work that is not published and students who already handed in', () => {
    expect(planReminders({ work: work({ status: 'draft' }), studentIds: ['st1'], now })).toHaveLength(0);
    const plan = planReminders({
      work: work(), studentIds: ['st1'], submissions: [submission({ status: 'submitted' })], now
    });
    expect(plan).toHaveLength(0);
  });

  it('drops offsets that already passed', () => {
    const plan = planReminders({ work: work(), studentIds: ['st1'], now: new Date('2026-09-10T08:00:00.000Z') });
    expect(plan).toHaveLength(0);
  });

  it('honours a student who switched a reminder kind off', () => {
    const preference = {
      ...base, id: 'pref', profileId: 'p1', assignmentReminder: false, projectReminder: true,
      gradeNotification: true, quietHoursStart: null, quietHoursEnd: null
    };
    const plan = planReminders({
      work: work(), studentIds: ['st1'], preferences: [preference], profileIdByStudent: { st1: 'p1' }, now
    });
    expect(plan).toHaveLength(0);
  });

  it('moves a reminder out of quiet hours', () => {
    const preference = {
      ...base, id: 'pref', profileId: 'p1', assignmentReminder: true, projectReminder: true,
      gradeNotification: true, quietHoursStart: '21:00', quietHoursEnd: '06:00'
    };
    const inQuiet = new Date('2026-09-09T22:30:00');
    const moved = applyQuietHours(inQuiet.toISOString(), preference);
    expect(new Date(moved).getHours()).toBe(6);
    const awake = new Date('2026-09-09T10:00:00');
    expect(applyQuietHours(awake.toISOString(), preference)).toBe(awake.toISOString());
  });

  it('recalculates the plan when the deadline moves and drops the stale entries', () => {
    const scheduled: ClassroomNotification = {
      ...base, id: 'n1', studentId: 'st1', classId: 'c1', assignmentId: 'w1', kind: 'submission_reminder',
      title: '', body: '', dedupeKey: reminderDedupeKey('w1', 'st1', 1440), state: 'scheduled',
      scheduledAt: '2026-09-09T09:00:00.000Z', sentAt: null, readAt: null
    };
    const movedPlan = planReminders({ work: work({ dueAt: '2026-09-12T09:00:00.000Z' }), studentIds: ['st1'], now });
    expect(staleReminderIds([scheduled], 'w1', movedPlan)).toEqual([]);
    expect(staleReminderIds([scheduled], 'w1', [])).toEqual(['n1']);
  });

  it('only releases reminders whose time has come', () => {
    const rows: ClassroomNotification[] = [
      { ...base, id: 'a', studentId: 'st1', classId: 'c1', assignmentId: 'w1', kind: 'submission_reminder', title: '', body: '', dedupeKey: 'a', state: 'scheduled', scheduledAt: '2026-09-01T08:00:00.000Z', sentAt: null, readAt: null },
      { ...base, id: 'b', studentId: 'st1', classId: 'c1', assignmentId: 'w1', kind: 'submission_reminder', title: '', body: '', dedupeKey: 'b', state: 'scheduled', scheduledAt: '2026-09-05T08:00:00.000Z', sentAt: null, readAt: null }
    ];
    expect(dueReminders(rows, now).map((item) => item.id)).toEqual(['a']);
  });

  it('detects the changes students must be told about', () => {
    expect(changedNotifiableFields(work(), work({ dueAt: '2026-09-12T09:00:00.000Z' }))).toEqual(['dueAt']);
    expect(changedNotifiableFields(work(), work({ maxScore: 50 }))).toEqual([]);
  });
});

describe('grading', () => {
  it('turns a score into a percentage and a grade', () => {
    expect(percentageOf(18, 20)).toBe(90);
    expect(percentageOf(19, 20)).toBe(95);
    expect(gradeForPercentage(95)).toBe('A+');
    expect(gradeForPercentage(90)).toBe('A');
    expect(gradeForPercentage(85)).toBe('B');
    expect(gradeForPercentage(72)).toBe('C');
    expect(gradeForPercentage(69)).toBe('ต่ำกว่าเกณฑ์');
  });

  it('rejects impossible scores', () => {
    expect(() => validateScore(-1, 20)).toThrow(ScoreValidationError);
    expect(() => validateScore(21, 20)).toThrow(ScoreValidationError);
    expect(() => validateScore(Number.NaN, 20)).toThrow(ScoreValidationError);
    expect(() => validateScore(Number.POSITIVE_INFINITY, 20)).toThrow(ScoreValidationError);
    expect(validateScore(null, 20)).toBeNull();
    expect(validateScore(18.456, 20)).toBe(18.46);
  });

  it('keeps the calculated grade when a teacher overrides it', () => {
    const result = resolveGrade(17, 20, { override: 'A' });
    expect(result.percentage).toBe(85);
    expect(result.calculatedGrade).toBe('B');
    expect(result.finalGrade).toBe('A');
    expect(result.overridden).toBe(true);
  });

  it('reads a school-configured scheme and falls back safely', () => {
    const scheme = gradeSchemeFrom([{
      ...base, id: 'set', scopeType: 'school', scopeId: null, key: 'grade_scheme',
      valueJson: { bands: [{ grade: 'ผ่าน', minPercentage: 50 }], belowGrade: 'ไม่ผ่าน' }
    }]);
    expect(gradeForPercentage(60, scheme)).toBe('ผ่าน');
    expect(gradeForPercentage(40, scheme)).toBe('ไม่ผ่าน');
    expect(gradeSchemeFrom([]).bands).toEqual(defaultGradeScheme.bands);
  });

  it('maps percentages onto grade points', () => {
    expect(gradePointFor(85)).toBe(4);
    expect(gradePointFor(72)).toBe(3);
    expect(gradePointFor(40)).toBe(0);
  });
});

describe('rubrics', () => {
  const criteria = [
    { id: 'content', label: 'เนื้อหา', maxScore: 10, description: '' },
    { id: 'accuracy', label: 'ความถูกต้อง', maxScore: 5, description: '' },
    { id: 'presentation', label: 'การนำเสนอ', maxScore: 5, description: '' }
  ];

  it('adds the criteria up to the rubric maximum', () => {
    expect(rubricMaxScore({ criteria })).toBe(20);
    expect(rubricMatchesWork({ criteria }, 20)).toBe(true);
    expect(rubricMatchesWork({ criteria }, 25)).toBe(false);
  });

  it('totals the entered criteria and ignores blanks', () => {
    expect(rubricTotal({ criteria }, [
      { criterionId: 'content', score: 9 },
      { criterionId: 'accuracy', score: 4 },
      { criterionId: 'presentation', score: null }
    ])).toBe(13);
    expect(rubricTotal({ criteria }, [])).toBeNull();
  });

  it('refuses a criterion score above its own maximum', () => {
    expect(() => rubricTotal({ criteria }, [{ criterionId: 'accuracy', score: 6 }])).toThrow(ScoreValidationError);
  });

  it('validates the shape of a rubric', () => {
    expect(() => validateRubric([])).toThrow(ScoreValidationError);
    expect(() => validateRubric([{ id: 'a', label: ' ', maxScore: 5, description: '' }])).toThrow(ScoreValidationError);
    expect(() => validateRubric([{ id: 'a', label: 'ก', maxScore: 0, description: '' }])).toThrow(ScoreValidationError);
    expect(validateRubric(criteria)).toHaveLength(3);
  });
});

describe('gradebook', () => {
  const students: Student[] = [
    { ...base, id: 'st1', profileId: null, studentCode: '001', displayName: 'สมชาย', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' },
    { ...base, id: 'st2', profileId: null, studentCode: '002', displayName: 'มาลี', avatarIndex: 1, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' }
  ];
  const works: Assignment[] = [
    work({ id: 'hw', workType: 'homework', maxScore: 20 }),
    work({ id: 'pj', workType: 'project', maxScore: 30 })
  ];
  const submissions: Submission[] = [
    submission({ id: 's1', assignmentId: 'hw', studentId: 'st1', score: 18, status: 'graded' }),
    submission({ id: 's2', assignmentId: 'pj', studentId: 'st1', score: 25, status: 'graded' }),
    submission({ id: 's3', assignmentId: 'hw', studentId: 'st2', score: 20, status: 'graded' }),
    submission({ id: 's4', assignmentId: 'pj', studentId: 'st2', score: 29, status: 'graded' })
  ];

  it('weighs categories and derives the grade', () => {
    const rows = buildGradebook({ students, works, submissions, tests: [], testScores: [] });
    const somchai = rows.find((row) => row.student.id === 'st1')!;
    const malee = rows.find((row) => row.student.id === 'st2')!;
    expect(somchai.percentage).toBeGreaterThan(80);
    expect(malee.percentage).toBeGreaterThan(somchai.percentage!);
    expect(malee.grade).toBe('A+');
  });

  it('validates that the configured weights add up to 100', () => {
    expect(weightsAreValid(defaultCategoryWeights)).toBe(true);
    expect(totalWeight(defaultCategoryWeights)).toBe(100);
    const broken = { ...defaultCategoryWeights, test: 10 };
    expect(weightsAreValid(broken)).toBe(false);
    expect(categoryWeightsFrom([{
      ...base, id: 'w', scopeType: 'school', scopeId: null, key: 'gradebook_weights',
      valueJson: { homework: 50, assignment: 10, activity: 10, project: 10, test: 20 }
    }]).homework).toBe(50);
  });

  it('filters by subject and reports a distribution', () => {
    const rows = buildGradebook({ students, works, submissions, tests: [], testScores: [], subjectId: 'other' });
    expect(rows.every((row) => row.percentage === null)).toBe(true);
    const full = buildGradebook({ students, works, submissions, tests: [], testScores: [] });
    const distribution = gradeDistribution(full, defaultGradeScheme);
    expect(distribution.reduce((sum, entry) => sum + entry.count, 0)).toBe(2);
  });
});

describe('workload and follow-up', () => {
  const subjects: Subject[] = [
    { ...base, id: 'sub1', code: 'MA', name: 'คณิตศาสตร์', nameEn: '', colorIndex: 0, iconKey: 'math', sortOrder: 0, status: 'active' },
    { ...base, id: 'sub2', code: 'SC', name: 'วิทยาศาสตร์', nameEn: '', colorIndex: 1, iconKey: 'science', sortOrder: 1, status: 'active' }
  ];

  it('warns only once the same day is already busy', () => {
    const existing = [
      work({ id: 'a', dueAt: '2026-09-18T09:00:00.000Z' }),
      work({ id: 'b', dueAt: '2026-09-18T12:00:00.000Z', subjectId: 'sub2' })
    ];
    const warning = workloadWarningFor(
      { id: 'new', classId: 'c1', dueAt: '2026-09-18T16:00:00.000Z', title: 'งานใหม่', subjectId: 'sub1' },
      existing, subjects
    );
    expect(warning?.count).toBe(WORKLOAD_WARNING_THRESHOLD);
    expect(warning?.subjects).toContain('วิทยาศาสตร์');

    const quiet = workloadWarningFor(
      { id: 'new', classId: 'c1', dueAt: '2026-09-25T16:00:00.000Z', title: 'งานใหม่', subjectId: 'sub1' },
      existing, subjects
    );
    expect(quiet).toBeNull();
  });

  it('lists students to follow up without labelling them', () => {
    const students: Student[] = [
      { ...base, id: 'st1', profileId: null, studentCode: '001', displayName: 'สมชาย', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' },
      { ...base, id: 'st2', profileId: null, studentCode: '002', displayName: 'มาลี', avatarIndex: 1, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' }
    ];
    const works = [work({ id: 'w1' }), work({ id: 'w2' })];
    const submissions = [
      submission({ id: 's1', assignmentId: 'w1', studentId: 'st2', status: 'graded', score: 18, percentage: 90, openedAt: base.createdAt }),
      submission({ id: 's2', assignmentId: 'w2', studentId: 'st2', status: 'graded', score: 19, percentage: 95, openedAt: base.createdAt })
    ];
    const insights = followUpInsights(students, works, submissions);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.student.id).toBe('st1');
    expect(insights[0]!.missingWork).toBe(2);
    expect(insights[0]!.unopenedWork).toBe(2);
  });
});
