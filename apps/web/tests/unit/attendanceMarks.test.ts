import { describe, expect, it } from 'vitest';
import type { Attendance, AttendanceStatus } from '../../src/domain/types';
import {
  attendanceMarkLabels, attendanceMarkOrder, attendanceMarkShortLabels, isLeave
} from '../../src/features/attendance/attendanceMarks';
import { attendanceDayStatus } from '../../src/data/selectors';

const row = (status: AttendanceStatus): Attendance => ({
  id: `row-${status}`, schoolId: 'school-1', version: 1,
  createdAt: '', updatedAt: '', deletedAt: null,
  classId: 'class-1', studentId: 'student-1', attendanceDate: '2026-09-09',
  status, note: ''
});

describe('the two kinds of leave', () => {
  it('offers ลาป่วย and ลากิจ as separate marks, and no longer offers the old one', () => {
    expect(attendanceMarkOrder).toEqual(['present', 'late', 'absent', 'leave_sick', 'leave_personal']);
    expect(attendanceMarkOrder).not.toContain('leave');
  });

  it('names every mark, including the retired one, so old rows stay readable', () => {
    expect(attendanceMarkLabels.leave_sick).toBe('ลาป่วย');
    expect(attendanceMarkLabels.leave_personal).toBe('ลากิจ');
    expect(attendanceMarkLabels.leave).toBe('ลา (ไม่ระบุ)');
  });

  it('keeps a short word for every mark, for a register button on a phone', () => {
    for (const mark of attendanceMarkOrder) {
      expect(attendanceMarkShortLabels[mark].length).toBeGreaterThan(0);
      expect(attendanceMarkShortLabels[mark].length).toBeLessThanOrEqual(6);
    }
  });

  it('counts all three as leave', () => {
    expect(isLeave('leave_sick')).toBe(true);
    expect(isLeave('leave_personal')).toBe(true);
    expect(isLeave('leave')).toBe(true);
    expect(isLeave('absent')).toBe(false);
  });
});

describe('a day made of several periods', () => {
  it('still reads as absent when any period was an absence', () => {
    expect(attendanceDayStatus([row('present'), row('absent'), row('leave_sick')])).toBe('absent');
  });

  it('carries which kind of leave the day held', () => {
    // The old collapse answered a flat "leave"; a guardian reading the day should see which.
    expect(attendanceDayStatus([row('present'), row('leave_sick')])).toBe('leave_sick');
    expect(attendanceDayStatus([row('present'), row('leave_personal')])).toBe('leave_personal');
  });

  it('reads a day of nothing but presence as present', () => {
    expect(attendanceDayStatus([row('present'), row('present')])).toBe('present');
  });
});
