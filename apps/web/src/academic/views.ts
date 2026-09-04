import type { SchoolSnapshot } from '../data/schoolRepository';
import type { Assignment, ClassroomNotification, Student, Submission } from '../domain/types';
import { rosterFor } from '../data/selectors';
import { effectiveDueAt, hasSubmitted, workStateFor, type WorkState } from './workStatus';

/**
 * Read models the screens share: calendar entries, notification groups and the acknowledgement
 * summary. Keeping them here means the teacher view and the student view of the same work are
 * derived from one calculation.
 */
export interface CalendarItem {
  work: Assignment;
  dueAt: string | null;
  state: WorkState;
  submission: Submission | undefined;
}

export function calendarItemsFor(
  snapshot: SchoolSnapshot,
  options: { classIds: string[]; studentId?: string | null; subjectId?: string | null; includeDrafts?: boolean; now?: Date }
): CalendarItem[] {
  const now = options.now ?? new Date();
  return snapshot.assignments
    .filter((work) => options.classIds.includes(work.classId))
    .filter((work) => (!options.subjectId || work.subjectId === options.subjectId))
    .filter((work) => (options.includeDrafts ? true : work.status !== 'draft'))
    .map((work) => {
      const submission = options.studentId
        ? snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === options.studentId)
        : undefined;
      const dueAt = options.studentId
        ? effectiveDueAt(work, options.studentId, snapshot.deadlineExtensions)
        : work.dueAt;
      return { work, dueAt, state: workStateFor({ work, submission, dueAt, now }), submission };
    })
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
}

/** Groups the items of one month by day so a month grid can render without extra work. */
export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    if (!item.dueAt) continue;
    const day = item.dueAt.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), item]);
  }
  return map;
}

/**
 * Everything a class has a date for, in one list.
 *
 * The calendar showed assignments and nothing else, so an exam — which has a date, a class and a
 * subject, and is the single most important thing on a term's calendar — appeared nowhere. A
 * teacher checking the load on a Friday before setting homework was reading half the picture.
 *
 * `kind` is what the reader is looking at rather than what table it came from: four kinds of work
 * and an exam. The calendar colours by this, because "which subject" is already carried by the icon
 * and "is it a test" is the distinction somebody scans a month for.
 *
 * There is no holiday here because the product does not record holidays. Drawing an invented one
 * would be a calendar telling a school something it never said.
 */
export type CalendarKind = 'homework' | 'assignment' | 'project' | 'activity' | 'exam';

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  title: string;
  /** ISO instant for work, ISO date for an exam. Null only for work with no deadline. */
  at: string | null;
  subjectId: string | null;
  /** Present for work; an exam has a date rather than a state a student can be in. */
  state: WorkState | null;
  work: Assignment | null;
}

export function calendarEntriesFor(
  snapshot: SchoolSnapshot,
  options: { classIds: string[]; studentId?: string | null; subjectId?: string | null; includeDrafts?: boolean; now?: Date }
): CalendarEntry[] {
  const work: CalendarEntry[] = calendarItemsFor(snapshot, options).map((item) => ({
    id: item.work.id,
    kind: item.work.workType as CalendarKind,
    title: item.work.title,
    at: item.dueAt,
    subjectId: item.work.subjectId,
    state: item.state,
    work: item.work
  }));

  const exams: CalendarEntry[] = snapshot.tests
    .filter((test) => !test.deletedAt && options.classIds.includes(test.classId))
    .filter((test) => !options.subjectId || test.subjectId === options.subjectId)
    // A draft exam is a teacher's plan. Showing one to a student announces a test that may never
    // happen, on a date that is still being moved.
    .filter((test) => options.includeDrafts ? true : test.status !== 'draft')
    .map((test) => ({
      id: test.id,
      kind: 'exam' as const,
      title: test.title,
      at: test.testDate,
      subjectId: test.subjectId,
      state: null,
      work: null
    }));

  return [...work, ...exams].sort((left, right) => (left.at ?? '9999').localeCompare(right.at ?? '9999'));
}

/** The same grouping as `groupByDay`, for the merged list. */
export function groupEntriesByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (!entry.at) continue;
    const day = entry.at.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  return map;
}

export type NotificationBucket = 'today' | 'due-soon' | 'upcoming' | 'overdue' | 'done';

export const notificationBucketLabels: Record<NotificationBucket, string> = {
  today: 'วันนี้', 'due-soon': 'ใกล้ถึงกำหนด', upcoming: 'กำลังจะมาถึง', overdue: 'เลยกำหนด', done: 'เสร็จแล้ว'
};

export interface NotificationEntry {
  notification: ClassroomNotification;
  work: Assignment | null;
  dueAt: string | null;
  state: WorkState | null;
  bucket: NotificationBucket;
}

/** Sorts a student's delivered notices into the sections the notification centre shows. */
export function notificationEntries(snapshot: SchoolSnapshot, studentId: string, now = new Date()): NotificationEntry[] {
  const today = now.toISOString().slice(0, 10);
  return snapshot.notifications
    .filter((item) => item.studentId === studentId && item.state !== 'scheduled')
    .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
    .map((notification) => {
      const work = snapshot.assignments.find((item) => item.id === notification.assignmentId) ?? null;
      const submission = work
        ? snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === studentId)
        : undefined;
      const dueAt = work ? effectiveDueAt(work, studentId, snapshot.deadlineExtensions) : null;
      const state = work ? workStateFor({ work, submission, dueAt, now }) : null;

      let bucket: NotificationBucket = 'upcoming';
      if (state === 'graded' || state === 'submitted' || state === 'late') bucket = 'done';
      else if (state === 'overdue') bucket = 'overdue';
      else if (state === 'urgent' || state === 'soon') bucket = 'due-soon';
      else if ((notification.sentAt ?? notification.createdAt).slice(0, 10) === today) bucket = 'today';

      return { notification, work, dueAt, state, bucket };
    });
}

export function unreadCount(snapshot: SchoolSnapshot, studentId: string): number {
  return snapshot.notifications.filter((item) =>
    item.studentId === studentId && item.state !== 'scheduled' && !item.readAt).length;
}

export interface AcknowledgementSummary { notified: number; opened: number; acknowledged: number; unopened: number }

/** What a teacher sees after publishing: who has opened the work and who has confirmed it. */
export function acknowledgementSummary(snapshot: SchoolSnapshot, workId: string, roster: Student[]): AcknowledgementSummary {
  const submissions = snapshot.submissions.filter((item) => item.assignmentId === workId);
  const opened = submissions.filter((item) => item.openedAt).length;
  const acknowledged = submissions.filter((item) => item.acknowledgedAt).length;
  return { notified: roster.length, opened, acknowledged, unopened: Math.max(0, roster.length - opened) };
}

/** Submission rows for the teacher's roster view, in roster order. */
export interface RosterRow {
  student: Student;
  submission: Submission | undefined;
  dueAt: string | null;
  state: WorkState;
  versions: number;
  extended: boolean;
}

export function rosterRowsFor(snapshot: SchoolSnapshot, work: Assignment, roster: Student[], now = new Date()): RosterRow[] {
  return roster.map((student) => {
    const submission = snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === student.id);
    const dueAt = effectiveDueAt(work, student.id, snapshot.deadlineExtensions);
    return {
      student,
      submission,
      dueAt,
      state: workStateFor({ work, submission, dueAt, now }),
      versions: snapshot.submissionVersions.filter((item) => item.assignmentId === work.id && item.studentId === student.id).length,
      extended: dueAt !== work.dueAt
    };
  });
}

export type StudentTrackingBucket = 'attention' | 'waiting' | 'complete' | 'empty';

/** A calm, neutral summary for a teacher who needs to decide whom to follow up with next. */
export interface StudentTrackingRow {
  student: Student;
  totalWork: number;
  submitted: number;
  late: number;
  overdue: number;
  revisionRequested: number;
  waiting: number;
  completionRate: number;
  latestActivityAt: string | null;
  nextDueAt: string | null;
  bucket: StudentTrackingBucket;
}

export function studentTrackingFor(snapshot: SchoolSnapshot, classId: string, now = new Date(), subjectId?: string | null): StudentTrackingRow[] {
  const roster = rosterFor(snapshot, classId);
  const works = snapshot.assignments.filter((work) =>
    work.classId === classId && (!subjectId || work.subjectId === subjectId) && (work.status === 'published' || work.status === 'closed'));

  return roster.map((student) => {
    const entries = works.map((work) => {
      const submission = snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === student.id);
      const dueAt = effectiveDueAt(work, student.id, snapshot.deadlineExtensions);
      const state = workStateFor({ work, submission, dueAt, now });
      return { submission, dueAt, state };
    });
    const submitted = entries.filter((entry) => hasSubmitted(entry.submission)).length;
    const late = entries.filter((entry) => entry.state === 'late').length;
    const overdue = entries.filter((entry) => entry.state === 'overdue').length;
    const revisionRequested = entries.filter((entry) => entry.state === 'revision_requested').length;
    const waiting = entries.filter((entry) => !hasSubmitted(entry.submission) || entry.state === 'revision_requested').length;
    const outstandingDueDates = entries
      .filter((entry) => !hasSubmitted(entry.submission) || entry.state === 'revision_requested')
      .map((entry) => entry.dueAt)
      .filter((dueAt): dueAt is string => Boolean(dueAt))
      .sort();
    const activities = entries.map((entry) => entry.submission?.submittedAt ?? entry.submission?.acknowledgedAt ?? entry.submission?.openedAt ?? null)
      .filter((value): value is string => Boolean(value)).sort();
    const totalWork = works.length;
    const bucket: StudentTrackingBucket = totalWork === 0 ? 'empty'
      : late > 0 || overdue > 0 || revisionRequested > 0 ? 'attention'
        : waiting > 0 ? 'waiting' : 'complete';
    return {
      student, totalWork, submitted, late, overdue, revisionRequested, waiting,
      completionRate: totalWork === 0 ? 0 : Math.round((submitted / totalWork) * 100),
      latestActivityAt: activities.at(-1) ?? null,
      nextDueAt: outstandingDueDates[0] ?? null,
      bucket
    };
  });
}
