import type { Assignment, ClassroomNotification, NotificationPreference, Submission, WorkType } from '../domain/types';

/**
 * Reminder scheduling.
 *
 * A reminder is a notification with a `scheduledAt` in the future and a stable `dedupeKey`, so a
 * retry, a resync from another device or a deadline recalculation can all run again without ever
 * producing a second copy. Nothing here touches storage: it computes the plan, the repository
 * writes it.
 */
export interface ReminderPreset { offsetMinutes: number; label: string }

/** 0 means "when the work is published"; the rest are minutes before the deadline. */
export const reminderPresets: ReminderPreset[] = [
  { offsetMinutes: 0, label: 'ตอนประกาศงาน' },
  { offsetMinutes: 7 * 24 * 60, label: 'ก่อนกำหนด 7 วัน' },
  { offsetMinutes: 3 * 24 * 60, label: 'ก่อนกำหนด 3 วัน' },
  { offsetMinutes: 24 * 60, label: 'ก่อนกำหนด 1 วัน' },
  { offsetMinutes: 180, label: 'ก่อนกำหนด 3 ชั่วโมง' },
  { offsetMinutes: 60, label: 'ก่อนกำหนด 1 ชั่วโมง' }
];

export function reminderLabel(offsetMinutes: number): string {
  return reminderPresets.find((preset) => preset.offsetMinutes === offsetMinutes)?.label
    ?? `ก่อนกำหนด ${offsetMinutes} นาที`;
}

/** Sensible defaults per work type; a teacher can change them on the form. */
export function defaultReminderOffsets(workType: WorkType): number[] {
  if (workType === 'project') return [0, 3 * 24 * 60, 24 * 60, 180];
  if (workType === 'activity') return [0, 24 * 60];
  return [0, 24 * 60, 180];
}

export interface PlannedReminder {
  studentId: string;
  offsetMinutes: number;
  scheduledAt: string;
  dedupeKey: string;
  title: string;
  body: string;
}

export interface ReminderPlanInput {
  work: Pick<Assignment, 'id' | 'title' | 'workType' | 'status' | 'dueAt' | 'reminderOffsets'>;
  studentIds: string[];
  /** Personal deadlines keyed by student id; falls back to the class deadline. */
  dueByStudent?: Record<string, string | null>;
  submissions?: Submission[];
  preferences?: NotificationPreference[];
  profileIdByStudent?: Record<string, string | null>;
  now?: Date;
}

/** Identity of one reminder. Same work + student + offset always maps to the same key. */
export function reminderDedupeKey(workId: string, studentId: string, offsetMinutes: number): string {
  return `reminder:${workId}:${studentId}:${offsetMinutes}`;
}

export function publishDedupeKey(workId: string, studentId: string): string {
  return `published:${workId}:${studentId}`;
}

export function deadlineChangeDedupeKey(workId: string, studentId: string, dueAt: string): string {
  return `deadline:${workId}:${studentId}:${dueAt}`;
}

function reminderAllowed(workType: WorkType, preference: NotificationPreference | undefined): boolean {
  if (!preference) return true;
  if (workType === 'project') return preference.projectReminder;
  return preference.assignmentReminder;
}

/** Moves a reminder out of the student's quiet hours to the moment the quiet window ends. */
export function applyQuietHours(scheduledAt: string, preference: NotificationPreference | undefined): string {
  if (!preference?.quietHoursStart || !preference.quietHoursEnd) return scheduledAt;
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return scheduledAt;

  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(preference.quietHoursStart);
  const end = toMinutes(preference.quietHoursEnd);
  if (start === null || end === null) return scheduledAt;

  const inQuietWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inQuietWindow) return scheduledAt;

  const wake = new Date(date);
  wake.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (wake.getTime() <= date.getTime()) wake.setDate(wake.getDate() + 1);
  return wake.toISOString();
}

function toMinutes(value: string): number | null {
  const [hours, mins] = value.split(':').map(Number);
  if (hours === undefined || mins === undefined || Number.isNaN(hours) || Number.isNaN(mins)) return null;
  return hours * 60 + mins;
}

/**
 * Builds the reminders that still need to exist for a piece of work.
 *
 * Skips: unpublished or cancelled work, students who already turned it in, offsets that are already
 * in the past, and reminder kinds a student has switched off.
 */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const { work, studentIds, dueByStudent = {}, submissions = [], preferences = [], profileIdByStudent = {}, now = new Date() } = input;
  if (work.status !== 'published') return [];

  const plan: PlannedReminder[] = [];
  for (const studentId of studentIds) {
    const submission = submissions.find((item) => item.assignmentId === work.id && item.studentId === studentId);
    if (submission && ['submitted', 'late', 'resubmitted', 'graded', 'returned'].includes(submission.status)) continue;

    const profileId = profileIdByStudent[studentId] ?? null;
    const preference = profileId ? preferences.find((item) => item.profileId === profileId) : undefined;
    if (!reminderAllowed(work.workType, preference)) continue;

    const dueAt = dueByStudent[studentId] ?? work.dueAt;
    for (const offsetMinutes of work.reminderOffsets) {
      if (offsetMinutes === 0) continue; // the publish notice covers this moment
      if (!dueAt) continue;
      const due = Date.parse(dueAt);
      if (Number.isNaN(due)) continue;
      const fireAt = new Date(due - offsetMinutes * 60_000);
      if (fireAt.getTime() <= now.getTime()) continue;

      plan.push({
        studentId,
        offsetMinutes,
        scheduledAt: applyQuietHours(fireAt.toISOString(), preference),
        dedupeKey: reminderDedupeKey(work.id, studentId, offsetMinutes),
        title: `เตือนส่งงาน: ${work.title}`,
        body: `${reminderLabel(offsetMinutes)} · กำหนดส่ง ${new Date(due).toLocaleString('th-TH')}`
      });
    }
  }
  return plan;
}

/** Which stored notifications should be dropped when a plan is recalculated. */
export function staleReminderIds(existing: ClassroomNotification[], workId: string, plan: PlannedReminder[]): string[] {
  const wanted = new Set(plan.map((item) => item.dedupeKey));
  return existing
    .filter((item) => item.assignmentId === workId && item.kind === 'submission_reminder')
    .filter((item) => item.state === 'scheduled' && !wanted.has(item.dedupeKey))
    .map((item) => item.id);
}

/** Reminders that are due now and can be delivered to the in-app centre. */
export function dueReminders(notifications: ClassroomNotification[], now = new Date()): ClassroomNotification[] {
  return notifications.filter((item) =>
    item.state === 'scheduled' && Date.parse(item.scheduledAt) <= now.getTime());
}

/** Fields on a published piece of work whose change must be announced to students. */
export const notifiableWorkFields = ['title', 'dueAt', 'instructions', 'subjectId'] as const;
export type NotifiableWorkField = (typeof notifiableWorkFields)[number];

export function changedNotifiableFields(before: Assignment, after: Assignment): NotifiableWorkField[] {
  return notifiableWorkFields.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
}
