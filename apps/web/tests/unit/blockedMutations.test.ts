import { describe, expect, it } from 'vitest';
import { describeBlockedReason } from '../../src/features/operations/blockedMutations';

describe('what a refused change says', () => {
  it('names the constraint a repeated import trips, not the constraint', () => {
    const { reason, fix, detail } = describeBlockedReason(
      'MUTATION_ERROR: duplicate key value violates unique constraint "students_school_id_student_code_key"'
    );
    expect(reason).toBe('เลขประจำตัวนักเรียนนี้มีอยู่แล้วในโรงเรียน');
    expect(fix).toContain('นำเข้าไฟล์เดิมซ้ำ');
    // The server's own words stay available: they are what an administrator would be asked for.
    expect(detail).toContain('students_school_id_student_code_key');
  });

  it('prefers the specific constraint over the general duplicate', () => {
    const enrolment = describeBlockedReason('duplicate key value violates unique constraint "one_active_enrollment_per_term"');
    expect(enrolment.reason).toBe('นักเรียนคนนี้อยู่ในห้องเรียนของภาคเรียนนี้แล้ว');
  });

  it('sends a version clash to the screen that resolves it', () => {
    expect(describeBlockedReason('SYNC_CONFLICT: Critical record version changed').fix).toContain('ข้อมูลขัดแย้ง');
  });

  it('separates a subject-owner refusal from a plain one', () => {
    expect(describeBlockedReason('FORBIDDEN: SUBJECT_OWNER_REQUIRED').reason)
      .toBe('เฉพาะครูเจ้าของรายวิชานี้เท่านั้นที่บันทึกได้');
    expect(describeBlockedReason('FORBIDDEN').reason).toBe('บัญชีนี้ไม่มีสิทธิ์บันทึกรายการนี้');
  });

  it('invents nothing for a message it does not know', () => {
    const unknown = describeBlockedReason('42P01: relation "public.nothing" does not exist');
    expect(unknown.reason).toBe('เซิร์ฟเวอร์ไม่รับรายการนี้');
    expect(unknown.detail).toContain('relation "public.nothing" does not exist');
  });

  it('says so when the server said nothing at all', () => {
    expect(describeBlockedReason(null).detail).toBe('ไม่มีรายละเอียดจากเซิร์ฟเวอร์');
  });
});
