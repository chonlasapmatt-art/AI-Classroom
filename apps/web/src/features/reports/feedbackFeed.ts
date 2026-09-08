import type { SchoolSnapshot } from '../../data/schoolRepository';
import { teacherClassScope, teacherClassIds } from '../../data/teacherResponsibilities';
import type { Role } from '../../domain/types';

/**
 * What the children did, told to the teacher who needs to know.
 *
 * Everything here already happened somewhere else in the product: a piece of work was turned in, a
 * register was marked, a child was recorded as away. What did not exist was one place where a
 * teacher could see the last hour of it — so they went looking through three screens to answer
 * "did they hand it in?" and "who is missing today?".
 *
 * This is a reading, not a store. Nothing is written when an item appears and nothing is lost when
 * one is deleted: deleting hides it on that device, and the whole feed expires on its own after a
 * few hours, because a message about "this period" is worth nothing tomorrow and a school running
 * for a year should not be carrying a year of them.
 */
export type FeedbackKind = 'submission' | 'attendance' | 'request';

export interface FeedbackItem {
  /** Stable across rebuilds of the feed, so a deletion on this device keeps the item away. */
  id: string;
  kind: FeedbackKind;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  subjectName: string | null;
  title: string;
  body: string;
  /** When the thing being reported happened. */
  at: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

/** How long a message is worth reading. Past this the feed drops it without being asked. */
export const FEEDBACK_WINDOW_MS = 3 * 60 * 60 * 1000;

const attendanceWords: Record<string, { label: string; tone: FeedbackItem['tone'] }> = {
  absent: { label: 'ขาดเรียน', tone: 'danger' },
  late: { label: 'มาสาย', tone: 'warning' },
  leave: { label: 'ลา', tone: 'info' }
};

function withinWindow(value: string | null, now: number, windowMs: number): boolean {
  if (!value) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && now - at <= windowMs && at - now < 60_000;
}

export interface FeedbackScope {
  role: Role;
  profileId: string;
  /** Hidden on this device: an item the reader has already dealt with. */
  dismissed?: Set<string>;
  now?: Date;
  windowMs?: number;
}

/**
 * The feed for one reader.
 *
 * A teacher sees their own rooms, and inside a room the subjects they teach — an advisor sees the
 * whole room, because that is what an advisor is for. An administrator sees the school. Nobody else
 * gets a feed at all: this is a staff room noticeboard, and it names children.
 */
export function feedbackFeed(snapshot: SchoolSnapshot, scope: FeedbackScope): FeedbackItem[] {
  if (scope.role !== 'teacher' && scope.role !== 'admin') return [];
  const now = (scope.now ?? new Date()).getTime();
  const windowMs = scope.windowMs ?? FEEDBACK_WINDOW_MS;
  const dismissed = scope.dismissed ?? new Set<string>();

  const ownClassIds = scope.role === 'teacher' ? teacherClassIds(snapshot, scope.profileId) : null;
  const classesById = new Map(snapshot.classes.map((item) => [item.id, item]));
  const studentsById = new Map(snapshot.students.map((item) => [item.id, item]));
  const subjectsById = new Map(snapshot.subjects.map((item) => [item.id, item]));

  const readsSubject = (classId: string, subjectId: string | null): boolean => {
    if (scope.role === 'admin') return true;
    if (!ownClassIds?.has(classId)) return false;
    const inside = teacherClassScope(snapshot, scope.profileId, classId);
    if (inside.advisor) return true;
    return subjectId !== null && inside.subjectIds.has(subjectId);
  };

  const items: FeedbackItem[] = [];

  for (const submission of snapshot.submissions) {
    if (!withinWindow(submission.submittedAt, now, windowMs)) continue;
    const work = snapshot.assignments.find((item) => item.id === submission.assignmentId);
    if (!work || !readsSubject(work.classId, work.subjectId)) continue;
    const student = studentsById.get(submission.studentId);
    if (!student) continue;
    const late = submission.isLate;
    items.push({
      id: `submission:${submission.id}`,
      kind: 'submission',
      studentId: student.id,
      studentName: student.displayName,
      classId: work.classId,
      className: classesById.get(work.classId)?.name ?? '',
      subjectName: work.subjectId ? subjectsById.get(work.subjectId)?.name ?? null : null,
      title: `${student.displayName} ส่งงานแล้ว`,
      body: late ? `${work.title} · ส่งช้ากว่ากำหนด` : work.title,
      at: submission.submittedAt!,
      tone: late ? 'warning' : 'success'
    });
  }

  for (const record of snapshot.attendance) {
    const words = attendanceWords[record.status];
    if (!words) continue;
    const at = record.updatedAt || record.createdAt;
    if (!withinWindow(at, now, windowMs)) continue;
    if (!readsSubject(record.classId, record.subjectId ?? null)) continue;
    const student = studentsById.get(record.studentId);
    if (!student) continue;
    items.push({
      id: `attendance:${record.id}`,
      kind: 'attendance',
      studentId: student.id,
      studentName: student.displayName,
      classId: record.classId,
      className: classesById.get(record.classId)?.name ?? '',
      subjectName: record.subjectId ? subjectsById.get(record.subjectId)?.name ?? null : null,
      title: `${student.displayName} · ${words.label}`,
      body: record.note?.trim() || `บันทึกจากการเช็กชื่อวันที่ ${record.attendanceDate}`,
      at,
      tone: words.tone
    });
  }

  return items
    .filter((item) => !dismissed.has(item.id))
    .sort((left, right) => right.at.localeCompare(left.at));
}

/**
 * Deletions worth keeping.
 *
 * An item that has aged out of the feed can never come back, so remembering that somebody deleted
 * it is remembering nothing. Pruning on every write keeps the device's store the size of the feed
 * rather than the size of the school year.
 */
export function pruneDismissed(dismissed: Iterable<[string, string]>, now = Date.now(), windowMs = FEEDBACK_WINDOW_MS): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [id, at] of dismissed) {
    const stamp = Date.parse(at);
    if (Number.isFinite(stamp) && now - stamp <= windowMs) kept[id] = at;
  }
  return kept;
}

/**
 * A guardian's question, in the same box as everything else the day produced.
 *
 * Requests do not age out with the rest of the feed. An unanswered question is not stale news the
 * way "handed in twenty minutes ago" is; it is a thing somebody is waiting for, so it stays until
 * a member of staff marks it handled. Handled ones fall back into the ordinary three-hour window.
 */
export function requestsAsFeedback(input: {
  requests: { id: string; subjectId: string; studentId: string | null; raisedByName: string; body: string; status: 'open' | 'handled'; createdAt: string }[];
  subjectName: (subjectId: string) => string | null;
  studentName: (studentId: string) => string | null;
  dismissed?: Set<string>;
  now?: Date;
  windowMs?: number;
}): FeedbackItem[] {
  const now = (input.now ?? new Date()).getTime();
  const windowMs = input.windowMs ?? FEEDBACK_WINDOW_MS;
  const dismissed = input.dismissed ?? new Set<string>();
  return input.requests
    .filter((request) => request.status === 'open' || withinWindow(request.createdAt, now, windowMs))
    .map((request) => ({
      id: `request:${request.id}`,
      kind: 'request' as const,
      studentId: request.studentId ?? '',
      studentName: request.studentId ? input.studentName(request.studentId) ?? '' : '',
      classId: '',
      className: '',
      subjectName: input.subjectName(request.subjectId),
      title: `คำร้องจาก ${request.raisedByName || 'ผู้ปกครอง'}`,
      body: request.body,
      at: request.createdAt,
      tone: request.status === 'open' ? 'warning' as const : 'info' as const
    }))
    .filter((item) => !dismissed.has(item.id));
}
