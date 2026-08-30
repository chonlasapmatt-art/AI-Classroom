import { describe, expect, it } from 'vitest';
import {
  interpretStudentAccessResponse, isCompleteStudentLogin, isCompleteStudentRegistration,
  normalizeStudentCode, normalizeStudentName, STUDENT_ACCESS_GENERIC_MESSAGE
} from '../../src/features/auth/studentAccess';

describe('student access normalisation', () => {
  it('collapses whitespace so a name typed loosely still matches the record', () => {
    expect(normalizeStudentName('  สมชาย   ใจดี ')).toBe('สมชาย ใจดี');
    expect(normalizeStudentName('สมชาย ใจดี')).toBe('สมชาย ใจดี');
  });

  it('strips separators and folds case in the student number', () => {
    expect(normalizeStudentCode(' a-128 5 ')).toBe('A1285');
    expect(normalizeStudentCode('1285')).toBe('1285');
  });

  it('requires both fields before the button is usable', () => {
    expect(isCompleteStudentLogin('สมชาย ใจดี', '1285')).toBe(true);
    expect(isCompleteStudentLogin('ส', '1285')).toBe(false);
    expect(isCompleteStudentLogin('สมชาย ใจดี', '   ')).toBe(false);
  });

  it('requires first name, last name, student number and a chosen school to register', () => {
    const complete = { firstName: 'สมชาย', lastName: 'ใจดี', studentCode: '1285', schoolId: 'school-1' };
    expect(isCompleteStudentRegistration(complete)).toBe(true);
    expect(isCompleteStudentRegistration({ ...complete, schoolId: '' })).toBe(false);
    expect(isCompleteStudentRegistration({ ...complete, lastName: '  ' })).toBe(false);
  });
});

describe('student access response handling', () => {
  it('adopts a session when the server returns one', () => {
    const result = interpretStudentAccessResponse({
      session: { accessToken: 'access', refreshToken: 'refresh' },
      student: { studentId: 's1', schoolId: 'sc1', schoolName: 'โรงเรียนทดสอบ', displayName: 'สมชาย ใจดี' }
    }, 200);
    expect(result.outcome).toBe('session');
    if (result.outcome === 'session') expect(result.session.accessToken).toBe('access');
  });

  it('asks for a school only when the pair matched more than one', () => {
    const result = interpretStudentAccessResponse({
      code: 'SCHOOL_SELECTION_REQUIRED',
      schools: [{ schoolId: 'a', name: 'โรงเรียน ก' }, { schoolId: 'b', name: 'โรงเรียน ข' }]
    }, 409);
    expect(result.outcome).toBe('school-required');
    if (result.outcome === 'school-required') expect(result.schools).toHaveLength(2);
  });

  it('reports a lockout distinctly so the student knows to wait rather than retype', () => {
    const result = interpretStudentAccessResponse({ code: 'STUDENT_ACCESS_LOCKED', retryAfterMinutes: 15 }, 429);
    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') { expect(result.locked).toBe(true); expect(result.message).toContain('15'); }
  });

  it('gives the same message for a wrong name, a wrong number and an unknown school', () => {
    const wrongName = interpretStudentAccessResponse({ code: 'STUDENT_ACCESS_DENIED' }, 401);
    const wrongNumber = interpretStudentAccessResponse({ code: 'STUDENT_ACCESS_DENIED' }, 401);
    const noSuchSchool = interpretStudentAccessResponse(null, 401);
    for (const result of [wrongName, wrongNumber, noSuchSchool]) {
      expect(result.outcome).toBe('error');
      if (result.outcome === 'error') expect(result.message).toBe(STUDENT_ACCESS_GENERIC_MESSAGE);
    }
  });

  it('never treats a body without tokens as a successful sign-in', () => {
    const result = interpretStudentAccessResponse({ student: { studentId: 's1' } }, 200);
    expect(result.outcome).toBe('error');
  });
});
