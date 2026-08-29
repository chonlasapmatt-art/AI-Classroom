import {
  changedNotifiableFields, deadlineChangeDedupeKey, planReminders, publishDedupeKey, staleReminderIds
} from '../academic/reminderEngine';
import { resolveGrade, validateScore, type GradeScheme } from '../academic/gradeScheme';
import { rubricTotal } from '../academic/rubric';
import type {
  AcademicAuditAction, AcademicAuditEntry, Assignment, ClassroomNotification, DeadlineExtension,
  NotificationPreference, Rubric, RubricScore, Student, Submission, SubmissionVersion, SyncRecord
} from '../domain/types';
import type { RubricEntryInput } from './schoolRepository';

/**
 * The academic workflow expressed as pure record builders.
 *
 * Both repository implementations share this file: Dexie persists the returned records through the
 * mutation queue, the fixture repository keeps them in memory. Keeping the rules here is what stops
 * the two implementations from slowly disagreeing about what publishing, reminding or grading means.
 */
export interface RecordFactory { (id?: string): SyncRecord }

export interface PublishContext {
  work: Assignment;
  studentIds: string[];
  existingSubmissions: Submission[];
  existingNotifications: ClassroomNotification[];
  extensions: DeadlineExtension[];
  preferences: NotificationPreference[];
  students: Student[];
  now?: Date;
}

export interface PublishPlan {
  work: Assignment;
  submissions: Submission[];
  notifications: ClassroomNotification[];
  removeNotificationIds: string[];
}

function dueByStudent(work: Assignment, studentIds: string[], extensions: DeadlineExtension[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const studentId of studentIds) {
    const personal = extensions.find((item) => item.assignmentId === work.id && item.studentId === studentId && !item.deletedAt);
    map[studentId] = personal?.dueAt ?? work.dueAt;
  }
  return map;
}

function profileMap(students: Student[]): Record<string, string | null> {
  return Object.fromEntries(students.map((student) => [student.id, student.profileId]));
}

function notification(
  base: SyncRecord,
  fields: Pick<ClassroomNotification, 'studentId' | 'classId' | 'assignmentId' | 'kind' | 'title' | 'body' | 'dedupeKey' | 'state' | 'scheduledAt' | 'sentAt'>
): ClassroomNotification {
  return { ...base, ...fields, readAt: null };
}

/** Publishing: one submission row and one "new work" notice per student, plus the reminder plan. */
export function planPublish(context: PublishContext, createRecord: RecordFactory): PublishPlan {
  const { work, studentIds, existingSubmissions, existingNotifications, extensions, preferences, students } = context;
  const now = context.now ?? new Date();
  const timestamp = now.toISOString();
  const publishedWork: Assignment = { ...work, status: 'published', publishedAt: work.publishedAt ?? timestamp, updatedAt: timestamp };

  const submissions: Submission[] = [];
  for (const studentId of studentIds) {
    if (existingSubmissions.some((item) => item.assignmentId === work.id && item.studentId === studentId)) continue;
    submissions.push({
      ...createRecord(),
      assignmentId: work.id, studentId, submittedAt: null, status: 'not_started', score: null, isLate: false,
      teacherNote: '', studentNote: '', version: 0, openedAt: null, acknowledgedAt: null, revisionNote: '',
      percentage: null, calculatedGrade: null, finalGrade: null, gradeOverrideReason: '', gradedBy: null, gradedAt: null
    });
  }

  const seen = new Set(existingNotifications.map((item) => item.dedupeKey));
  const notifications: ClassroomNotification[] = [];

  if (work.reminderOffsets.includes(0)) {
    for (const studentId of studentIds) {
      const dedupeKey = publishDedupeKey(work.id, studentId);
      if (seen.has(dedupeKey)) continue;
      notifications.push(notification(createRecord(), {
        studentId, classId: work.classId, assignmentId: work.id, kind: 'assignment_published',
        title: `งานใหม่: ${work.title}`,
        body: work.dueAt ? `กำหนดส่ง ${new Date(work.dueAt).toLocaleString('th-TH')}` : 'ไม่กำหนดวันส่ง',
        dedupeKey, state: 'delivered', scheduledAt: timestamp, sentAt: timestamp
      }));
      seen.add(dedupeKey);
    }
  }

  const plan = planReminders({
    work: publishedWork,
    studentIds,
    dueByStudent: dueByStudent(publishedWork, studentIds, extensions),
    submissions: existingSubmissions,
    preferences,
    profileIdByStudent: profileMap(students),
    now
  });

  for (const reminder of plan) {
    if (seen.has(reminder.dedupeKey)) continue;
    notifications.push(notification(createRecord(), {
      studentId: reminder.studentId, classId: work.classId, assignmentId: work.id, kind: 'submission_reminder',
      title: reminder.title, body: reminder.body, dedupeKey: reminder.dedupeKey,
      state: 'scheduled', scheduledAt: reminder.scheduledAt, sentAt: null
    }));
    seen.add(reminder.dedupeKey);
  }

  return {
    work: publishedWork,
    submissions,
    notifications,
    removeNotificationIds: staleReminderIds(existingNotifications, work.id, plan)
  };
}

export interface UpdatePlan {
  notifications: ClassroomNotification[];
  removeNotificationIds: string[];
}

/**
 * A published change: tell the students what moved, then rebuild the future reminder schedule so a
 * new deadline never keeps firing the old timings.
 */
export function planWorkUpdate(before: Assignment, after: Assignment, context: PublishContext, createRecord: RecordFactory): UpdatePlan {
  const now = context.now ?? new Date();
  const timestamp = now.toISOString();
  if (after.status !== 'published') return { notifications: [], removeNotificationIds: [] };

  const changed = changedNotifiableFields(before, after);
  const notifications: ClassroomNotification[] = [];
  const seen = new Set(context.existingNotifications.map((item) => item.dedupeKey));

  if (changed.length > 0) {
    const movedDeadline = changed.includes('dueAt');
    for (const studentId of context.studentIds) {
      const dedupeKey = movedDeadline
        ? deadlineChangeDedupeKey(after.id, studentId, after.dueAt ?? 'none')
        : `updated:${after.id}:${studentId}:${after.updatedAt}`;
      if (seen.has(dedupeKey)) continue;
      notifications.push(notification(createRecord(), {
        studentId, classId: after.classId, assignmentId: after.id, kind: 'deadline_changed',
        title: movedDeadline ? `กำหนดส่งเปลี่ยน: ${after.title}` : `รายละเอียดงานเปลี่ยน: ${after.title}`,
        body: movedDeadline
          ? `เดิม ${before.dueAt ? new Date(before.dueAt).toLocaleString('th-TH') : 'ไม่กำหนด'} · ใหม่ ${after.dueAt ? new Date(after.dueAt).toLocaleString('th-TH') : 'ไม่กำหนด'}`
          : `ครูปรับ ${changed.join(', ')}`,
        dedupeKey, state: 'delivered', scheduledAt: timestamp, sentAt: timestamp
      }));
      seen.add(dedupeKey);
    }
  }

  const plan = planReminders({
    work: after,
    studentIds: context.studentIds,
    dueByStudent: dueByStudent(after, context.studentIds, context.extensions),
    submissions: context.existingSubmissions,
    preferences: context.preferences,
    profileIdByStudent: profileMap(context.students),
    now
  });

  for (const reminder of plan) {
    if (seen.has(reminder.dedupeKey)) continue;
    notifications.push(notification(createRecord(), {
      studentId: reminder.studentId, classId: after.classId, assignmentId: after.id, kind: 'submission_reminder',
      title: reminder.title, body: reminder.body, dedupeKey: reminder.dedupeKey,
      state: 'scheduled', scheduledAt: reminder.scheduledAt, sentAt: null
    }));
    seen.add(reminder.dedupeKey);
  }

  return { notifications, removeNotificationIds: staleReminderIds(context.existingNotifications, after.id, plan) };
}

/** Cancelling drops every pending reminder and tells the class once. */
export function planCancellation(work: Assignment, context: PublishContext, reason: string, createRecord: RecordFactory): UpdatePlan {
  const now = context.now ?? new Date();
  const timestamp = now.toISOString();
  const seen = new Set(context.existingNotifications.map((item) => item.dedupeKey));
  const notifications: ClassroomNotification[] = [];

  for (const studentId of context.studentIds) {
    const dedupeKey = `cancelled:${work.id}:${studentId}`;
    if (seen.has(dedupeKey)) continue;
    notifications.push(notification(createRecord(), {
      studentId, classId: work.classId, assignmentId: work.id, kind: 'work_cancelled',
      title: `ยกเลิกงาน: ${work.title}`, body: reason || 'ครูยกเลิกงานนี้แล้ว',
      dedupeKey, state: 'delivered', scheduledAt: timestamp, sentAt: timestamp
    }));
    seen.add(dedupeKey);
  }

  const removeNotificationIds = context.existingNotifications
    .filter((item) => item.assignmentId === work.id && item.state === 'scheduled')
    .map((item) => item.id);

  return { notifications, removeNotificationIds };
}

/** A student turning work in: a new version row plus the updated submission head. */
export function planSubmission(
  work: Assignment,
  submission: Submission | undefined,
  studentId: string,
  studentNote: string,
  effectiveDue: string | null,
  createRecord: RecordFactory,
  now = new Date()
): { submission: Submission; version: SubmissionVersion; cancelledReminderKeys: string[] } {
  const timestamp = now.toISOString();
  const isLate = Boolean(effectiveDue && Date.parse(effectiveDue) < now.getTime());
  const versionNumber = (submission?.version ?? 0) + 1;
  const wasRevision = submission?.status === 'revision_requested';

  const head: Submission = {
    ...(submission ?? createRecord()),
    assignmentId: work.id,
    studentId,
    submittedAt: timestamp,
    status: wasRevision ? 'resubmitted' : isLate ? 'late' : 'submitted',
    score: submission?.score ?? null,
    isLate,
    teacherNote: submission?.teacherNote ?? '',
    studentNote,
    version: versionNumber,
    openedAt: submission?.openedAt ?? timestamp,
    acknowledgedAt: submission?.acknowledgedAt ?? null,
    revisionNote: submission?.revisionNote ?? '',
    percentage: submission?.percentage ?? null,
    calculatedGrade: submission?.calculatedGrade ?? null,
    finalGrade: submission?.finalGrade ?? null,
    gradeOverrideReason: submission?.gradeOverrideReason ?? '',
    gradedBy: submission?.gradedBy ?? null,
    gradedAt: submission?.gradedAt ?? null,
    updatedAt: timestamp
  };

  const version: SubmissionVersion = {
    ...createRecord(),
    assignmentId: work.id,
    studentId,
    versionNumber,
    submittedAt: timestamp,
    isLate,
    studentNote,
    attachmentOwnerId: `${work.id}:${studentId}`
  };

  return { submission: head, version, cancelledReminderKeys: [] };
}

export interface ScoreOutcome {
  submission: Submission;
  rubricScores: RubricScore[];
  audit: Array<{ action: AcademicAuditAction; oldValue: string; newValue: string; reason: string }>;
}

/** Marking, by simple score or by rubric. Both paths end in the same stored grade fields. */
export function planScoring(
  work: Assignment,
  submission: Submission | undefined,
  studentId: string,
  options: {
    score?: number | null;
    rubric?: Rubric | null;
    rubricEntries?: RubricEntryInput[];
    teacherNote?: string;
    gradedBy: string;
    scheme: GradeScheme;
    existingRubricScores?: RubricScore[];
  },
  createRecord: RecordFactory,
  now = new Date()
): ScoreOutcome {
  const timestamp = now.toISOString();
  const rubricEntries = options.rubricEntries ?? [];
  const rawScore = options.rubric
    ? rubricTotal(options.rubric, rubricEntries)
    : validateScore(options.score ?? null, work.maxScore);
  const score = validateScore(rawScore, work.maxScore);

  const previous = submission?.score ?? null;
  const grade = resolveGrade(score, work.maxScore, {
    ...(submission?.gradeOverrideReason && submission.finalGrade ? { override: submission.finalGrade } : {}),
    scheme: options.scheme
  });

  const head: Submission = {
    ...(submission ?? createRecord()),
    assignmentId: work.id,
    studentId,
    submittedAt: submission?.submittedAt ?? null,
    status: 'graded',
    score,
    isLate: submission?.isLate ?? false,
    teacherNote: options.teacherNote ?? submission?.teacherNote ?? '',
    studentNote: submission?.studentNote ?? '',
    version: submission?.version ?? 0,
    openedAt: submission?.openedAt ?? null,
    acknowledgedAt: submission?.acknowledgedAt ?? null,
    revisionNote: submission?.revisionNote ?? '',
    percentage: grade.percentage,
    calculatedGrade: grade.calculatedGrade,
    finalGrade: grade.finalGrade,
    gradeOverrideReason: submission?.gradeOverrideReason ?? '',
    gradedBy: options.gradedBy,
    gradedAt: timestamp,
    updatedAt: timestamp
  };

  const rubricScores: RubricScore[] = options.rubric
    ? rubricEntries.map((entry) => {
      const existing = options.existingRubricScores?.find((item) =>
        item.assignmentId === work.id && item.studentId === studentId && item.criterionId === entry.criterionId);
      return {
        ...(existing ?? createRecord()),
        assignmentId: work.id, studentId, criterionId: entry.criterionId,
        score: entry.score, comment: entry.comment ?? existing?.comment ?? '', updatedAt: timestamp
      };
    })
    : [];

  return {
    submission: head,
    rubricScores,
    audit: [{
      action: previous === null ? 'SCORE_CREATED' : 'SCORE_CHANGED',
      oldValue: previous === null ? '' : String(previous),
      newValue: score === null ? '' : String(score),
      reason: ''
    }]
  };
}

export function auditEntry(
  base: SyncRecord,
  fields: Omit<AcademicAuditEntry, keyof SyncRecord>
): AcademicAuditEntry {
  return { ...base, ...fields };
}
