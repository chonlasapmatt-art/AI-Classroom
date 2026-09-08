import type { AttendanceStatus } from '../../domain/types';

/**
 * The marks a register can carry, named once.
 *
 * "ลา" used to be one mark doing two jobs a Thai school keeps apart — ลาป่วย is illness, ลากิจ is
 * everything a family asks for — and teachers were writing the difference into the note by hand,
 * which meant no report could count it. They are separate marks now.
 *
 * `leave` is still here and still readable: rows already carrying it are historically true, and
 * rewriting them would invent a reason the school never recorded. It reads as "ลา (ไม่ระบุ)" and is
 * not offered as a choice, so the ambiguity ages out of the data instead of being back-filled.
 */
export const attendanceMarkLabels: Record<AttendanceStatus, string> = {
  present: 'มาเรียน',
  late: 'มาสาย',
  absent: 'ขาดเรียน',
  leave_sick: 'ลาป่วย',
  leave_personal: 'ลากิจ',
  leave: 'ลา (ไม่ระบุ)'
};

/** The same marks at the width a register button has on a phone. */
export const attendanceMarkShortLabels: Record<AttendanceStatus, string> = {
  present: 'มา',
  late: 'สาย',
  absent: 'ขาด',
  leave_sick: 'ป่วย',
  leave_personal: 'ลากิจ',
  leave: 'ลา'
};

/**
 * The marks a teacher may choose, in the order a register is called.
 *
 * Present first because it is most of a class; the two kinds of leave last and adjacent, because
 * they are the pair a teacher decides between rather than four separate decisions.
 */
export const attendanceMarkOrder: AttendanceStatus[] = ['present', 'late', 'absent', 'leave_sick', 'leave_personal'];

/**
 * Colour is never the only carrier — every mark shows its word — but the two kinds of leave still
 * need to be told apart at a glance down a column of forty rows, so they take neighbouring hues
 * rather than the same one.
 */
export const attendanceMarkTone: Record<AttendanceStatus, 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave_sick: 'info',
  leave_personal: 'brand',
  leave: 'info'
};

/** Whether a mark is a leave of any kind, including the ones recorded before the split. */
export function isLeave(status: AttendanceStatus): boolean {
  return status === 'leave' || status === 'leave_sick' || status === 'leave_personal';
}
