import type { Assignment, DeadlineExtension, Submission } from '../domain/types';

/**
 * One place that decides "where does this piece of work stand right now".
 *
 * Every screen — calendar, notification centre, dashboards, gradebook — reads the state from here,
 * so a badge in one corner of the app can never disagree with a badge in another.
 */
export type WorkState =
  | 'draft' | 'cancelled' | 'upcoming' | 'soon' | 'urgent' | 'overdue'
  | 'submitted' | 'late' | 'revision_requested' | 'graded' | 'closed';

export const URGENT_WINDOW_MS = 3 * 60 * 60 * 1000;
export const SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The deadline that applies to one student: their personal extension, else the class deadline. */
export function effectiveDueAt(work: Pick<Assignment, 'id' | 'dueAt'>, studentId: string, extensions: DeadlineExtension[]): string | null {
  const personal = extensions.find((item) => item.assignmentId === work.id && item.studentId === studentId && !item.deletedAt);
  return personal?.dueAt ?? work.dueAt;
}

export function hasSubmitted(submission: Submission | undefined): boolean {
  return Boolean(submission && ['submitted', 'late', 'resubmitted', 'graded', 'returned'].includes(submission.status));
}

export interface WorkStateInput {
  work: Pick<Assignment, 'id' | 'status' | 'dueAt'>;
  submission?: Submission | undefined;
  dueAt?: string | null;
  now?: Date;
}

export function workStateFor({ work, submission, dueAt, now = new Date() }: WorkStateInput): WorkState {
  if (work.status === 'draft') return 'draft';
  if (work.status === 'cancelled') return 'cancelled';

  if (submission?.status === 'graded' || submission?.status === 'returned') return 'graded';
  if (submission?.status === 'revision_requested') return 'revision_requested';
  if (hasSubmitted(submission)) return submission?.isLate ? 'late' : 'submitted';

  const deadline = dueAt ?? work.dueAt;
  if (!deadline) return work.status === 'closed' ? 'closed' : 'upcoming';

  const remaining = Date.parse(deadline) - now.getTime();
  if (Number.isNaN(remaining)) return 'upcoming';
  if (remaining < 0) return 'overdue';
  if (remaining <= URGENT_WINDOW_MS) return 'urgent';
  if (remaining <= SOON_WINDOW_MS) return 'soon';
  return 'upcoming';
}

export const workStateLabels: Record<WorkState, string> = {
  draft: 'ฉบับร่าง',
  cancelled: 'ยกเลิกแล้ว',
  upcoming: 'ยังไม่เริ่ม',
  soon: 'ใกล้ถึงกำหนด',
  urgent: 'ใกล้ถึงกำหนดมาก',
  overdue: 'เลยกำหนด',
  submitted: 'ส่งแล้ว',
  late: 'ส่งช้า',
  revision_requested: 'ขอแก้ไข',
  graded: 'ตรวจแล้ว',
  closed: 'ปิดรับแล้ว'
};

/** Muted badge tone for each state; the design system maps these to colours. */
export const workStateTone: Record<WorkState, 'neutral' | 'info' | 'warning' | 'danger' | 'success'> = {
  draft: 'neutral',
  cancelled: 'neutral',
  upcoming: 'info',
  soon: 'warning',
  urgent: 'warning',
  overdue: 'danger',
  submitted: 'success',
  late: 'warning',
  revision_requested: 'warning',
  graded: 'success',
  closed: 'neutral'
};

/** Human countdown such as "เหลือ 4 ชั่วโมง" used by the notification centre and calendars. */
export function timeRemainingLabel(dueAt: string | null, now = new Date()): string {
  if (!dueAt) return 'ไม่กำหนดวันส่ง';
  const remaining = Date.parse(dueAt) - now.getTime();
  if (Number.isNaN(remaining)) return 'ไม่กำหนดวันส่ง';
  if (remaining < 0) {
    const overdueHours = Math.floor(-remaining / 3_600_000);
    if (overdueHours < 24) return `เลยกำหนด ${Math.max(1, overdueHours)} ชั่วโมง`;
    return `เลยกำหนด ${Math.floor(overdueHours / 24)} วัน`;
  }
  const hours = Math.floor(remaining / 3_600_000);
  if (hours < 1) return `เหลือ ${Math.max(1, Math.floor(remaining / 60_000))} นาที`;
  if (hours < 24) return `เหลือ ${hours} ชั่วโมง`;
  return `เหลือ ${Math.floor(hours / 24)} วัน`;
}
