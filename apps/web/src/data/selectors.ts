import type { AttendanceStatus, Classroom, ClassroomNotification, Setting, Student, Subject } from '../domain/types';
import { calculateTotal, defaultScorePolicy, gradeFor, type Category, type ScoreItem, type ScorePolicy } from '../features/scores/scoreEngine';
import type { SchoolSnapshot } from './schoolRepository';

/** Derived views over a snapshot. Pure functions so every screen and test agrees on the numbers. */

export function scorePolicyFrom(settings: Setting[]): ScorePolicy {
  const stored = settings.find((item) => item.key === 'score_policy')?.valueJson;
  if (!stored) return defaultScorePolicy;
  const weights = stored.weights as Partial<Record<Category, number>> | undefined;
  return {
    weights: {
      assignment: Number(weights?.assignment ?? defaultScorePolicy.weights.assignment),
      activity: Number(weights?.activity ?? defaultScorePolicy.weights.activity),
      test: Number(weights?.test ?? defaultScorePolicy.weights.test)
    },
    latePenaltyPercent: Number(stored.latePenaltyPercent ?? defaultScorePolicy.latePenaltyPercent),
    missingItem: stored.missingItem === 'exclude' ? 'exclude' : 'zero',
    decimals: Number(stored.decimals ?? defaultScorePolicy.decimals)
  };
}

export function privacyPolicyFrom(settings: Setting[]): { policyVersion: string; showLeaderboardToStudents: boolean; shareScoresWithParents: boolean } {
  const stored = settings.find((item) => item.key === 'privacy_policy')?.valueJson ?? {};
  return {
    policyVersion: String(stored.policyVersion ?? '2026-05-01'),
    showLeaderboardToStudents: stored.showLeaderboardToStudents !== false,
    shareScoresWithParents: stored.shareScoresWithParents !== false
  };
}

export function activeClasses(snapshot: SchoolSnapshot): Classroom[] {
  return snapshot.classes.filter((item) => item.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export function rosterFor(snapshot: SchoolSnapshot, classId: string): Student[] {
  const ids = new Set(snapshot.enrollments.filter((item) => item.classId === classId && item.status === 'active').map((item) => item.studentId));
  return snapshot.students.filter((item) => ids.has(item.id)).sort((a, b) => a.studentCode.localeCompare(b.studentCode));
}

export function classIdOfStudent(snapshot: SchoolSnapshot, studentId: string): string | null {
  return snapshot.enrollments.find((item) => item.studentId === studentId && item.status === 'active')?.classId ?? null;
}

/** Students a parent may see: linked and with consent recorded. */
export function consentedStudents(snapshot: SchoolSnapshot): Student[] {
  const linkedIds = new Set(snapshot.parentLinks
    .filter((item) => item.status === 'linked' && item.consentGrantedAt)
    .map((item) => item.studentId));
  return snapshot.students.filter((item) => linkedIds.has(item.id));
}

export interface AttendanceSummary { present: number; late: number; absent: number; leave: number; total: number; presentRate: number }

export function attendanceSummary(snapshot: SchoolSnapshot, filter: { classId?: string; studentId?: string; date?: string } = {}): AttendanceSummary {
  const rows = snapshot.attendance.filter((item) =>
    (!filter.classId || item.classId === filter.classId) &&
    (!filter.studentId || item.studentId === filter.studentId) &&
    (!filter.date || item.attendanceDate === filter.date));
  const count = (status: AttendanceStatus) => rows.filter((item) => item.status === status).length;
  const present = count('present');
  const late = count('late');
  const total = rows.length;
  return {
    present, late, absent: count('absent'), leave: count('leave'), total,
    presentRate: total === 0 ? 0 : Math.round(((present + late) / total) * 1000) / 10
  };
}

export function scoreItemsFor(snapshot: SchoolSnapshot, studentId: string, classId: string): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (const assignment of snapshot.assignments.filter((item) => item.classId === classId && item.status !== 'draft')) {
    const submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
    items.push({
      category: 'assignment', score: submission?.score ?? null, maxScore: assignment.maxScore,
      published: true, late: submission?.isLate ?? false
    });
  }
  for (const activity of snapshot.activities.filter((item) => item.classId === classId && item.status === 'published')) {
    const score = snapshot.activityScores.find((item) => item.activityId === activity.id && item.studentId === studentId);
    items.push({ category: 'activity', score: score?.score ?? null, maxScore: activity.maxScore, published: true });
  }
  for (const test of snapshot.tests.filter((item) => item.classId === classId)) {
    const score = snapshot.testScores.find((item) => item.testId === test.id && item.studentId === studentId);
    items.push({
      category: 'test', score: score?.score ?? null, maxScore: test.maxScore,
      published: Boolean(score?.publishedAt)
    });
  }
  return items;
}

export interface StudentStanding {
  student: Student;
  total: number;
  grade: ReturnType<typeof gradeFor>;
  rank: number;
  previousRank: number;
  rankChange: number;
  presentRate: number;
  missingWork: number;
}

function availableCategories(items: ScoreItem[]): Set<Category> {
  return new Set(items.filter((item) => item.published && item.maxScore > 0).map((item) => item.category));
}

export function standingsFor(snapshot: SchoolSnapshot, classId: string, policy = scorePolicyFrom(snapshot.settings)): StudentStanding[] {
  const roster = rosterFor(snapshot, classId);
  const scored = roster.map((student) => {
    const items = scoreItemsFor(snapshot, student.id, classId);
    const total = calculateTotal(items, availableCategories(items), policy);
    // "Previous" standing = the same calculation without the newest published category item,
    // which is what the rank-change indicator compares against.
    const withoutLatest = items.slice(0, Math.max(0, items.length - 1));
    const previousTotal = calculateTotal(withoutLatest, availableCategories(withoutLatest), policy);
    const missingWork = snapshot.assignments
      .filter((assignment) => assignment.classId === classId && assignment.status !== 'draft')
      .filter((assignment) => {
        const submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id);
        return !submission || ['not_started', 'in_progress', 'assigned', 'draft', 'overdue'].includes(submission.status);
      }).length;
    return { student, total, previousTotal, missingWork, presentRate: attendanceSummary(snapshot, { studentId: student.id }).presentRate };
  });

  const byTotal = [...scored].sort((a, b) => b.total - a.total || a.student.studentCode.localeCompare(b.student.studentCode));
  const byPrevious = [...scored].sort((a, b) => b.previousTotal - a.previousTotal || a.student.studentCode.localeCompare(b.student.studentCode));
  const previousRankOf = new Map(byPrevious.map((entry, index) => [entry.student.id, index + 1]));

  return byTotal.map((entry, index) => {
    const rank = index + 1;
    const previousRank = previousRankOf.get(entry.student.id) ?? rank;
    return {
      student: entry.student, total: entry.total, grade: gradeFor(entry.total), rank, previousRank,
      rankChange: previousRank - rank, presentRate: entry.presentRate, missingWork: entry.missingWork
    };
  });
}

export function assignmentState(assignment: { status: string; dueAt: string | null }, now = new Date()): 'draft' | 'closed' | 'due-soon' | 'overdue' | 'published' {
  if (assignment.status === 'draft') return 'draft';
  if (assignment.status === 'closed' || assignment.status === 'archived') return 'closed';
  if (!assignment.dueAt) return 'published';
  const due = new Date(assignment.dueAt).getTime();
  const hours = (due - now.getTime()) / 3_600_000;
  if (hours < 0) return 'overdue';
  if (hours <= 48) return 'due-soon';
  return 'published';
}

/** Subjects a school offers, ordered the way the school arranged them. */
export function activeSubjects(snapshot: SchoolSnapshot): Subject[] {
  return snapshot.subjects
    .filter((item) => item.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export function subjectById(snapshot: SchoolSnapshot, subjectId: string | null): Subject | null {
  if (!subjectId) return null;
  return snapshot.subjects.find((item) => item.id === subjectId) ?? null;
}

/** Score items limited to one subject, so a gradebook column means one learning area. */
export function scoreItemsForSubject(snapshot: SchoolSnapshot, studentId: string, classId: string, subjectId: string): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (const assignment of snapshot.assignments.filter((item) => item.classId === classId && item.subjectId === subjectId && item.status !== 'draft')) {
    const submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
    items.push({
      category: 'assignment', score: submission?.score ?? null, maxScore: assignment.maxScore,
      published: true, late: submission?.isLate ?? false
    });
  }
  for (const activity of snapshot.activities.filter((item) => item.classId === classId && item.subjectId === subjectId && item.status === 'published')) {
    const score = snapshot.activityScores.find((item) => item.activityId === activity.id && item.studentId === studentId);
    items.push({ category: 'activity', score: score?.score ?? null, maxScore: activity.maxScore, published: true });
  }
  for (const test of snapshot.tests.filter((item) => item.classId === classId && item.subjectId === subjectId)) {
    const score = snapshot.testScores.find((item) => item.testId === test.id && item.studentId === studentId);
    items.push({ category: 'test', score: score?.score ?? null, maxScore: test.maxScore, published: Boolean(score?.publishedAt) });
  }
  return items;
}

export interface SubjectResult { subject: Subject; total: number; grade: ReturnType<typeof gradeFor>; itemCount: number }

/** Per-subject totals for one student — the row a gradebook or a report card shows. */
export function subjectResultsFor(snapshot: SchoolSnapshot, studentId: string, classId: string, policy = scorePolicyFrom(snapshot.settings)): SubjectResult[] {
  return activeSubjects(snapshot).map((subject) => {
    const items = scoreItemsForSubject(snapshot, studentId, classId, subject.id);
    const graded = items.filter((item) => item.published && item.maxScore > 0);
    const total = calculateTotal(items, new Set(graded.map((item) => item.category)), policy);
    return { subject, total, grade: gradeFor(total), itemCount: graded.length };
  }).filter((result) => result.itemCount > 0);
}

/** Grade point on the standard Thai 4.0 scale. */
export function gradePoint(total: number): number {
  if (total >= 80) return 4;
  if (total >= 75) return 3.5;
  if (total >= 70) return 3;
  if (total >= 65) return 2.5;
  if (total >= 60) return 2;
  if (total >= 55) return 1.5;
  if (total >= 50) return 1;
  return 0;
}

export function gradePointAverage(results: SubjectResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((value, result) => value + gradePoint(result.total), 0);
  return Math.round((sum / results.length) * 100) / 100;
}

export function unreadNotifications(snapshot: SchoolSnapshot, studentId: string): ClassroomNotification[] {
  return snapshot.notifications
    .filter((item) => item.studentId === studentId && !item.readAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Students who have not turned in a published assignment yet. */
export function missingSubmitters(snapshot: SchoolSnapshot, assignmentId: string, roster: Student[]): Student[] {
  return roster.filter((student) => {
    const submission = snapshot.submissions.find((item) => item.assignmentId === assignmentId && item.studentId === student.id);
    return !submission || ['not_started', 'in_progress', 'assigned', 'draft', 'overdue'].includes(submission.status);
  });
}
