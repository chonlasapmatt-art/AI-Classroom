// What the home screen has to say, worked out from the snapshot it already holds.
//
// Split from the components that render it for the mundane reason the operations console gives:
// a module exporting both components and plain functions loses fast refresh, and a dashboard is
// exactly the kind of screen that gets edited while it is open.
//
// Nothing here fetches, decides authority, or writes. An alert is a sentence about rows that were
// already on screen.

import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { SyncStatus } from '../../sync/useBackgroundSync';
import type { AcademicAuditEntry, Announcement, Role } from '../../domain/types';
import type { IconName } from '../../ui/Icon';

export interface DashboardAlert {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  to?: string;
  actionLabel?: string;
}

/**
 * What needs a person, ordered by how badly.
 *
 * Two rules keep this from becoming noise. It only ever reports something a person can act on — a
 * count with nowhere to go is a worry, not an alert. And an empty result renders nothing at all
 * rather than a green "all clear" card: a card that is almost always reassuring is a card people
 * stop reading, and then it is useless on the day it is not.
 */
export function dashboardAlerts(
  snapshot: SchoolSnapshot,
  sync: SyncStatus | null,
  input: { overdue: number; role: Role }
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  /*
   * `/operations` is an administrator's screen. Offering the link to a teacher, a student or a
   * guardian would send them to a route the menu does not give them — which is a dead end dressed
   * up as an action, and worse than saying nothing.
   *
   * An alert therefore either carries both a destination and a label or carries neither. A dangling
   * action is the one shape this must never take.
   */
  const canOpenOperations = input.role === 'admin';

  // A blocked change is the worst case here: the server refused it, this device still holds it, and
  // nobody finds out unless they look. It outranks anything merely late.
  if (snapshot.blockedSync > 0) {
    alerts.push({
      id: 'blocked',
      tone: 'danger',
      title: `มีการแก้ไข ${snapshot.blockedSync} รายการที่เซิร์ฟเวอร์ไม่รับ`,
      detail: canOpenOperations
        ? 'ข้อมูลนี้มีการแก้ไขจากอีกเครื่อง กรุณาตรวจสอบและเลือกว่าจะเก็บฉบับใด'
        : 'ข้อมูลนี้มีการแก้ไขจากอีกเครื่อง กรุณาแจ้งผู้ดูแลระบบของโรงเรียนให้ตรวจสอบ',
      ...(canOpenOperations ? { to: '/operations', actionLabel: 'ไปตรวจสอบ' } : {})
    });
  }

  if (snapshot.pendingSync > 0) {
    alerts.push({
      id: 'pending',
      tone: 'info',
      title: `บันทึกไว้ในเครื่องแล้ว ${snapshot.pendingSync} รายการ`,
      detail: 'รอซิงก์เมื่อออนไลน์ · ข้อมูลไม่หายแม้ปิดแอป',
      ...(sync && canOpenOperations ? { to: '/operations', actionLabel: 'ดูสถานะซิงก์' } : {})
    });
  }

  if (input.overdue > 0 && input.role !== 'parent') {
    alerts.push({
      id: 'overdue',
      tone: 'warning',
      title: input.role === 'student'
        ? `มีงานเลยกำหนดส่ง ${input.overdue} ชิ้น`
        : `มีงานเลยกำหนดแล้ว ${input.overdue} ชิ้นที่ยังมีนักเรียนไม่ส่ง`,
      detail: input.role === 'student' ? 'รีบส่งให้ครูตรวจ' : 'ตรวจว่ามีใครต้องได้รับการติดตามเป็นพิเศษ',
      to: '/assignments',
      actionLabel: 'เปิดรายการงาน'
    });
  }

  return alerts;
}

export interface QuickAction { to: string; label: string; icon: IconName; hint: string }

/**
 * The two or three things this role came here to do.
 *
 * Deliberately short. A grid of every feature is a second navigation menu, and the value of this row
 * is that it is not one — it answers "ต้องทำอะไรต่อ", which has few answers or it is not an answer.
 */
export function quickActionsFor(role: Role, canCreateWork: boolean): QuickAction[] {
  if (role === 'student') return [
    { to: '/assignments', label: 'ส่งงาน', icon: 'assignments', hint: 'ดูงานที่ต้องส่งและแนบไฟล์' },
    { to: '/scores', label: 'ดูคะแนน', icon: 'scores', hint: 'คะแนนที่ครูเผยแพร่แล้ว' },
    { to: '/timetable', label: 'ตารางเรียน', icon: 'timetable', hint: 'คาบเรียนวันนี้' }
  ];
  if (role === 'parent') return [
    { to: '/my-children', label: 'ดูลูก', icon: 'children', hint: 'การมาเรียน งานค้าง และผลการเรียน' },
    { to: '/announcements', label: 'ประกาศ', icon: 'announcements', hint: 'ข่าวสารจากโรงเรียน' },
    { to: '/timetable', label: 'ตารางเรียน', icon: 'timetable', hint: 'คาบเรียนของลูก' }
  ];
  const staff: QuickAction[] = [
    { to: '/attendance', label: 'เช็กชื่อ', icon: 'attendance', hint: 'บันทึกการเข้าเรียนวันนี้' },
    { to: '/scores', label: 'บันทึกคะแนน', icon: 'scores', hint: 'ให้คะแนนงานและแบบทดสอบ' },
    { to: '/announcements', label: 'แจ้งข่าว', icon: 'announcements', hint: 'ส่งประกาศถึงห้องเรียน' }
  ];
  // Creating work is a subject owner's act and the server enforces that. Offering the button to a
  // teacher who will be refused is a promise the product cannot keep.
  if (canCreateWork) staff.unshift({ to: '/assignments', label: 'สร้างงาน', icon: 'assignments', hint: 'มอบหมายงานให้ห้องเรียน' });
  return staff.slice(0, 4);
}

/** The newest few announcements this reader is actually addressed by. */
export function recentAnnouncements(
  snapshot: SchoolSnapshot, classIds: string[], studentId: string | null, limit = 4
): Announcement[] {
  const wanted = new Set(classIds.filter(Boolean));
  return snapshot.announcements
    .filter((item) => item.deletedAt === null && (wanted.size === 0 || wanted.has(item.classId)))
    // An announcement addressed to named students is not for everybody in the class.
    .filter((item) => item.studentIds.length === 0 || (studentId !== null && item.studentIds.includes(studentId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * What has happened recently, from the academic audit trail.
 *
 * The audit exists for accountability; this reads the same rows for a different reason. A teacher
 * back after two days wants "what changed while I was away", and the alternative was opening five
 * screens to work it out.
 */
export function recentActivity(snapshot: SchoolSnapshot, limit = 6): AcademicAuditEntry[] {
  return [...snapshot.academicAudit]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}

export const auditLabels: Record<AcademicAuditEntry['action'], string> = {
  SCORE_CREATED: 'บันทึกคะแนน',
  SCORE_CHANGED: 'แก้ไขคะแนน',
  GRADE_OVERRIDE: 'ปรับเกรดด้วยตนเอง',
  GRADE_OVERRIDE_REMOVED: 'ยกเลิกการปรับเกรด',
  DEADLINE_CHANGED: 'เลื่อนกำหนดส่ง',
  STUDENT_EXTENSION_CREATED: 'ขยายเวลาให้นักเรียน',
  ASSIGNMENT_PUBLISHED: 'เผยแพร่งาน',
  ASSIGNMENT_CANCELLED: 'ยกเลิกงาน',
  REVISION_REQUESTED: 'ขอให้แก้ไขงาน'
};

export const auditTone: Record<AcademicAuditEntry['action'], 'success' | 'warning' | 'info' | 'neutral'> = {
  SCORE_CREATED: 'success', SCORE_CHANGED: 'warning', GRADE_OVERRIDE: 'warning',
  GRADE_OVERRIDE_REMOVED: 'neutral', DEADLINE_CHANGED: 'warning',
  STUDENT_EXTENSION_CREATED: 'info', ASSIGNMENT_PUBLISHED: 'success',
  ASSIGNMENT_CANCELLED: 'neutral', REVISION_REQUESTED: 'info'
};

/**
 * When this device last agreed with the server, in words rather than a timestamp.
 *
 * "3 นาทีที่แล้ว" answers the question; "2026-09-03T11:42:07Z" makes the reader do arithmetic to
 * find out whether they should worry.
 */
export function lastSyncedLabel(lastSyncedAt: string | null, now = Date.now()): string {
  if (lastSyncedAt === null) return 'ยังไม่เคยซิงก์บนเครื่องนี้';
  const minutes = Math.floor((now - Date.parse(lastSyncedAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return 'เมื่อครู่นี้';
  if (minutes < 1) return 'เมื่อครู่นี้';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}
