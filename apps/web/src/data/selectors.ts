import type { Attendance, AttendanceStatus, Classroom, ClassroomNotification, ClassTeacher, ScoreEvent, Setting, Student, Subject } from '../domain/types';
import { buildGradebook, categoryWeightsFrom, scorePolicyFrom, type GradebookRow, type ScorePolicy } from '../academic/gradebook';
import { gradePointFor, gradeSchemeFrom } from '../academic/gradeScheme';
import type { SchoolSnapshot } from './schoolRepository';

/** Derived views over a snapshot. Pure functions so every screen and test agrees on the numbers. */

export { scorePolicyFrom };

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

/** An assignment that has not been ended. The server applies the same rule to every room read. */
export function isActiveClassTeacher(link: ClassTeacher, at: Date = new Date()): boolean {
  return !link.activeUntil || new Date(link.activeUntil) > at;
}

/**
 * Who looks after a room, homeroom teacher first. The screens that name a room's staff all need the
 * same order and the same rule about ended assignments.
 */
export function classTeacherLinks(snapshot: SchoolSnapshot, classId: string): ClassTeacher[] {
  return snapshot.classTeachers
    .filter((link) => link.classId === classId && isActiveClassTeacher(link))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1));
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

export function attendanceSummary(snapshot: SchoolSnapshot, filter: { classId?: string; studentId?: string; date?: string; sessionKey?: string } = {}): AttendanceSummary {
  const rows = snapshot.attendance.filter((item) =>
    (!filter.classId || item.classId === filter.classId) &&
    (!filter.studentId || item.studentId === filter.studentId) &&
    (!filter.date || item.attendanceDate === filter.date) &&
    (!filter.sessionKey || (item.sessionKey ?? 'daily') === filter.sessionKey));
  const count = (status: AttendanceStatus) => rows.filter((item) => item.status === status).length;
  const present = count('present');
  const late = count('late');
  const total = rows.length;
  return {
    present, late, absent: count('absent'), leave: count('leave'), total,
    presentRate: total === 0 ? 0 : Math.round(((present + late) / total) * 1000) / 10
  };
}

export type AttendanceDayStatus = AttendanceStatus | 'unmarked';

/** Collapse all lesson sheets for one student and date into one parent-safe day status. */
export function attendanceDayStatus(rows: Attendance[]): AttendanceDayStatus {
  if (rows.length === 0) return 'unmarked';
  if (rows.some((row) => row.status === 'absent')) return 'absent';
  if (rows.some((row) => row.status === 'leave')) return 'leave';
  if (rows.some((row) => row.status === 'late')) return 'late';
  return 'present';
}

export interface AttendanceDailySummary extends AttendanceSummary { unmarked: number; totalDays: number; checkedSessions: number }

/** A student's whole attendance history, counted by day rather than by lesson row. */
export function attendanceDailySummary(snapshot: SchoolSnapshot, filter: { classId?: string; studentId?: string } = {}): AttendanceDailySummary {
  const rows = snapshot.attendance.filter((item) =>
    (!filter.classId || item.classId === filter.classId) &&
    (!filter.studentId || item.studentId === filter.studentId));
  const byDay = new Map<string, Attendance[]>();
  for (const row of rows) byDay.set(row.attendanceDate, [...(byDay.get(row.attendanceDate) ?? []), row]);
  const statuses = [...byDay.values()].map(attendanceDayStatus);
  const count = (status: AttendanceDayStatus) => statuses.filter((value) => value === status).length;
  const totalDays = statuses.length;
  const present = count('present');
  const late = count('late');
  return {
    present, late, absent: count('absent'), leave: count('leave'), total: totalDays,
    totalDays, unmarked: count('unmarked'), checkedSessions: rows.length,
    presentRate: totalDays === 0 ? 0 : Math.round(((present + late) / totalDays) * 1000) / 10
  };
}

export interface StudentStanding {
  student: Student;
  /** The gradebook percentage; 0 until anything has been counted. */
  total: number;
  /** The scheme grade, or null while nothing has been counted. */
  grade: string | null;
  rank: number;
  previousRank: number;
  rankChange: number;
  presentRate: number;
  missingWork: number;
}

/** The gradebook for one room, built the same way on every screen that shows a total. */
export function classGradebook(snapshot: SchoolSnapshot, classId: string, students: Student[], options: { subjectId?: string | null; exclude?: Set<string>; policy?: ScorePolicy } = {}): GradebookRow[] {
  const exclude = options.exclude ?? new Set<string>();
  return buildGradebook({
    students,
    works: snapshot.assignments.filter((work) => work.classId === classId && !exclude.has(work.id)),
    submissions: snapshot.submissions,
    tests: snapshot.tests.filter((test) => test.classId === classId && !exclude.has(test.id)),
    testScores: snapshot.testScores,
    activities: snapshot.activities.filter((activity) => activity.classId === classId && !exclude.has(activity.id)),
    activityScores: snapshot.activityScores,
    weights: categoryWeightsFrom(snapshot.settings),
    scheme: gradeSchemeFrom(snapshot.settings),
    policy: options.policy ?? scorePolicyFrom(snapshot.settings),
    subjectId: options.subjectId ?? null
  });
}

/** The most recently changed counted item in a room: what the rank-change arrow compares against. */
function newestItemId(snapshot: SchoolSnapshot, classId: string): string | null {
  const items = [
    ...snapshot.assignments.filter((work) => work.classId === classId && work.status !== 'draft' && work.status !== 'cancelled'),
    ...snapshot.tests.filter((test) => test.classId === classId),
    ...snapshot.activities.filter((activity) => activity.classId === classId && activity.status === 'published')
  ];
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;
}

export function standingsFor(snapshot: SchoolSnapshot, classId: string, policy = scorePolicyFrom(snapshot.settings)): StudentStanding[] {
  const roster = rosterFor(snapshot, classId);
  const rows = classGradebook(snapshot, classId, roster, { policy });
  // "Previous" standing = the same book without the newest counted item, which is what the
  // rank-change indicator compares against.
  const newest = newestItemId(snapshot, classId);
  const previousRows = classGradebook(snapshot, classId, roster, { policy, exclude: new Set(newest ? [newest] : []) });
  const scored = rows.map((row) => {
    const student = row.student;
    const missingWork = snapshot.assignments
      .filter((assignment) => assignment.classId === classId && assignment.status !== 'draft' && assignment.status !== 'cancelled')
      .filter((assignment) => {
        const submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id);
        return !submission || ['not_started', 'in_progress', 'assigned', 'draft', 'overdue'].includes(submission.status);
      }).length;
    const previous = previousRows.find((item) => item.student.id === student.id);
    return {
      student, total: row.percentage ?? 0, grade: row.grade, previousTotal: previous?.percentage ?? 0, missingWork,
      presentRate: attendanceDailySummary(snapshot, { studentId: student.id }).presentRate
    };
  });

  const byTotal = [...scored].sort((a, b) => b.total - a.total || a.student.studentCode.localeCompare(b.student.studentCode));
  const byPrevious = [...scored].sort((a, b) => b.previousTotal - a.previousTotal || a.student.studentCode.localeCompare(b.student.studentCode));
  const previousRankOf = new Map(byPrevious.map((entry, index) => [entry.student.id, index + 1]));

  return byTotal.map((entry, index) => {
    const rank = index + 1;
    const previousRank = previousRankOf.get(entry.student.id) ?? rank;
    return {
      student: entry.student, total: entry.total, grade: entry.grade, rank, previousRank,
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

export interface SubjectResult { subject: Subject; total: number; grade: string | null; itemCount: number }

/** Per-subject totals for one student — the row a gradebook or a report card shows. */
export function subjectResultsFor(snapshot: SchoolSnapshot, studentId: string, classId: string, policy = scorePolicyFrom(snapshot.settings)): SubjectResult[] {
  const student = snapshot.students.find((item) => item.id === studentId);
  if (!student) return [];
  return activeSubjects(snapshot).map((subject) => {
    const [row] = classGradebook(snapshot, classId, [student], { subjectId: subject.id, policy });
    return { subject, total: row?.percentage ?? 0, grade: row?.grade ?? null, itemCount: row?.itemCount ?? 0 };
  }).filter((result) => result.itemCount > 0 && result.grade !== null);
}

/** Grade point on the standard Thai 4.0 scale — the same table the gradebook uses. */
export function gradePoint(total: number): number {
  return gradePointFor(total);
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

/**
 * Awards for one student, newest first.
 *
 * Scores are stored as events, so this list is both what the board shows and the history a teacher
 * inspects — there is no separate audit table to fall out of step with the numbers.
 */
export function scoreEventsFor(snapshot: SchoolSnapshot, studentId: string, subjectId: string | null = null): ScoreEvent[] {
  return snapshot.scoreEvents
    .filter((event) => event.studentId === studentId && !event.deletedAt)
    .filter((event) => (subjectId ? event.subjectId === subjectId : true))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

/** Everything a student has been awarded outside marked work, which is what the board adds on top. */
export function bonusTotalFor(snapshot: SchoolSnapshot, studentId: string, subjectId: string | null = null): number {
  const total = scoreEventsFor(snapshot, studentId, subjectId).reduce((sum, event) => sum + event.points, 0);
  return Math.round(total * 100) / 100;
}

/** The last few awards in a class, for the running strip along the top of the board. */
export function recentScoreEvents(snapshot: SchoolSnapshot, classId: string, limit = 8): ScoreEvent[] {
  const roster = new Set(rosterFor(snapshot, classId).map((student) => student.id));
  return snapshot.scoreEvents
    .filter((event) => !event.deletedAt && (event.classId === classId || roster.has(event.studentId)))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);
}
