import type { Attendance, AttendanceStatus, Classroom, ClassroomNotification, ClassTeacher, ScoreEvent, Setting, Student, Subject, Teacher } from '../domain/types';
import { byName, compareClassNames, compareLabels, compareNames } from './collation';
import { isLeave } from '../features/attendance/attendanceMarks';
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

/**
 * Every open room, in the order a school reads them: ป.1/1, ป.1/2, ป.1/3, ป.2/1 … ม.6/4.
 *
 * `localeCompare(name, 'th')` on its own put ป.10/1 between ป.1/2 and ป.2/1, because without
 * `numeric` the "1" of 10 is compared against the "2" and the comparison stops there. Every room
 * picker in the product reads this list, so one comparator fixes all of them at once.
 */
export function activeClasses(snapshot: SchoolSnapshot): Classroom[] {
  return snapshot.classes.filter((item) => item.status === 'active')
    .sort((left, right) => compareClassNames(left.name, right.name));
}

/** Every teacher on the staff list, by name, with the title in front of it discounted. */
export function activeTeachers(snapshot: SchoolSnapshot): Teacher[] {
  return [...snapshot.teachers].sort((left, right) => compareNames(left.displayName, right.displayName));
}

/** Every child in the school, by name. A roster keeps its own order — see `rosterFor`. */
export function studentsByName(students: readonly Student[]): Student[] {
  return byName(students, (student) => student.displayName);
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

/**
 * A room's children, by student number — which is the order a Thai register is called in.
 *
 * Numerically, which is the fix: the numbers are stored as text, so a plain comparison put 10 before
 * 2 and a register of forty read 1, 10, 11 … 19, 2, 20. The number is what the teacher calls out, so
 * it stays the sort key; the name is the tie-break for the schools that leave the number blank.
 */
export function rosterFor(snapshot: SchoolSnapshot, classId: string): Student[] {
  const ids = new Set(snapshot.enrollments.filter((item) => item.classId === classId && item.status === 'active').map((item) => item.studentId));
  return snapshot.students.filter((item) => ids.has(item.id))
    .sort((left, right) => compareLabels(left.studentCode, right.studentCode)
      || compareNames(left.displayName, right.displayName));
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

export interface AttendanceSummary {
  present: number; late: number; absent: number;
  /** Every kind of leave, including rows written before the two kinds were told apart. */
  leave: number;
  leaveSick: number; leavePersonal: number;
  total: number; presentRate: number;
}

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
    present, late, absent: count('absent'),
    leave: rows.filter((item) => isLeave(item.status)).length,
    leaveSick: count('leave_sick'), leavePersonal: count('leave_personal'), total,
    presentRate: total === 0 ? 0 : Math.round(((present + late) / total) * 1000) / 10
  };
}

export type AttendanceDayStatus = AttendanceStatus | 'unmarked';

/** Collapse all lesson sheets for one student and date into one parent-safe day status. */
export function attendanceDayStatus(rows: Attendance[]): AttendanceDayStatus {
  if (rows.length === 0) return 'unmarked';
  if (rows.some((row) => row.status === 'absent')) return 'absent';
  // A day holding any kind of leave reads as leave; which kind is on the period, where it was set.
  const leaveRow = rows.find((row) => isLeave(row.status));
  if (leaveRow) return leaveRow.status;
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
    present, late, absent: count('absent'),
    leave: statuses.filter((value) => value !== 'unmarked' && isLeave(value)).length,
    leaveSick: count('leave_sick'), leavePersonal: count('leave_personal'), total: totalDays,
    totalDays, unmarked: count('unmarked'), checkedSessions: rows.length,
    presentRate: totalDays === 0 ? 0 : Math.round(((present + late) / totalDays) * 1000) / 10
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
    return { student, total, previousTotal, missingWork, presentRate: attendanceDailySummary(snapshot, { studentId: student.id }).presentRate };
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

/**
 * The subjects a room is actually assessed in.
 *
 * Not the school's subject list. A child's gradebook offered every subject the school teaches, so
 * the picker on their own marks held a dozen rows that could only ever answer "no marks" — a
 * fourteen-year-old choosing a subject they have never sat and concluding the app had lost their
 * work. What belongs there is what they study and are marked in, which is what has an assessment
 * item in their room.
 *
 * Drafts and cancelled work are excluded, and an unpublished test is not: a subject whose only item
 * is a paper nobody has sat yet is still a subject on the timetable, and the gradebook says so with
 * an empty total rather than by omitting it.
 */
export function subjectsAssessedIn(snapshot: SchoolSnapshot, classId: string): Subject[] {
  if (!classId) return [];
  const ids = new Set<string>();
  for (const item of snapshot.assignments) {
    if (item.classId === classId && item.subjectId && item.status !== 'draft' && item.status !== 'cancelled') {
      ids.add(item.subjectId);
    }
  }
  for (const item of snapshot.activities) {
    if (item.classId === classId && item.subjectId && item.status === 'published') ids.add(item.subjectId);
  }
  for (const item of snapshot.tests) {
    if (item.classId === classId && item.subjectId && item.status !== 'draft') ids.add(item.subjectId);
  }
  return activeSubjects(snapshot).filter((subject) => ids.has(subject.id));
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

/* ────────────────────────────────────────────────────────────────────────────
 * How a room is getting on with one subject
 * ──────────────────────────────────────────────────────────────────────────── */

/** How one piece of work arrived. 'missing' is the absence of a hand-in, not a late one. */
export type HandInTiming = 'early' | 'onTime' | 'late' | 'missing';

export interface HandInRow {
  assignmentId: string;
  title: string;
  dueAt: string | null;
  submittedAt: string | null;
  timing: HandInTiming;
  score: number | null;
  maxScore: number;
}

export interface StudentHandIns {
  student: Student;
  rows: HandInRow[];
  early: number;
  onTime: number;
  late: number;
  missing: number;
  /** Marked out of the marks available, as a percentage, or null while nothing is marked yet. */
  percentage: number | null;
}

/** A day. Anything handed in more than this before the deadline is somebody who was ahead of it. */
const EARLY_MS = 24 * 60 * 60 * 1000;

/**
 * When a hand-in arrived, relative to when it was due.
 *
 * `isLate` is the record the server stamped and is believed over any arithmetic done here — a
 * deadline can move after the fact, and the flag is what the child was told. Early and on time are
 * the split the flag does not make: a room where half the work lands in the last hour is a room a
 * form teacher wants to know about, and "not late" hides that completely.
 */
export function handInTiming(
  submission: { submittedAt: string | null; isLate: boolean } | undefined,
  dueAt: string | null
): HandInTiming {
  if (!submission?.submittedAt) return 'missing';
  if (submission.isLate) return 'late';
  if (!dueAt) return 'onTime';
  const due = Date.parse(dueAt);
  const sent = Date.parse(submission.submittedAt);
  if (Number.isNaN(due) || Number.isNaN(sent)) return 'onTime';
  return due - sent >= EARLY_MS ? 'early' : 'onTime';
}

/**
 * One row per child: every piece of work in a subject, when it arrived, and what it scored.
 *
 * This is what a form teacher opens a room book for. The marks alone answer "how is this child
 * doing"; they do not answer "why", and the commonest why in a Thai classroom is a child who is
 * handing everything in a week late. Counting the four outcomes beside the average puts the two
 * questions on the same row.
 */
export function subjectHandInsFor(
  snapshot: SchoolSnapshot, classId: string, subjectId: string
): StudentHandIns[] {
  const works = snapshot.assignments
    .filter((item) => item.classId === classId && item.subjectId === subjectId
      && item.status !== 'draft' && item.status !== 'cancelled')
    .sort((a, b) => (a.dueAt ?? a.assignedAt).localeCompare(b.dueAt ?? b.assignedAt));

  return rosterFor(snapshot, classId).map((student) => {
    const rows: HandInRow[] = works.map((work) => {
      const submission = snapshot.submissions.find((item) =>
        item.assignmentId === work.id && item.studentId === student.id && !item.deletedAt);
      return {
        assignmentId: work.id,
        title: work.title,
        dueAt: work.dueAt,
        submittedAt: submission?.submittedAt ?? null,
        timing: handInTiming(submission, work.dueAt),
        score: submission?.score ?? null,
        maxScore: work.maxScore
      };
    });

    const marked = rows.filter((row) => row.score !== null && row.maxScore > 0);
    const earned = marked.reduce((sum, row) => sum + (row.score ?? 0), 0);
    const available = marked.reduce((sum, row) => sum + row.maxScore, 0);
    const count = (timing: HandInTiming) => rows.filter((row) => row.timing === timing).length;

    return {
      student,
      rows,
      early: count('early'),
      onTime: count('onTime'),
      late: count('late'),
      missing: count('missing'),
      percentage: available > 0 ? Math.round((earned / available) * 1000) / 10 : null
    };
  });
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
