import { describe, expect, it } from 'vitest';
import {
  interpretMemberAccessResponse, isCompleteMemberLogin, isCompleteMemberRegistration,
  isValidRecoveryEmail, MEMBER_ACCESS_GENERIC_MESSAGE, MEMBER_PASSWORD_MINIMUM, normalizeMemberName
} from '../../src/features/auth/memberAccess';

describe('name and password access — shaping the request', () => {
  it('treats the same human name typed loosely as one name', () => {
    expect(normalizeMemberName('  สมชาย   ใจดี ')).toBe('สมชาย ใจดี');
    expect(normalizeMemberName('Somchai  Jaidee')).toBe('Somchai Jaidee');
  });

  it('opens the sign-in button only when both fields carry something', () => {
    expect(isCompleteMemberLogin('', 'password123')).toBe(false);
    expect(isCompleteMemberLogin('ก', 'password123')).toBe(false);
    expect(isCompleteMemberLogin('สมชาย ใจดี', '')).toBe(false);
    expect(isCompleteMemberLogin('สมชาย ใจดี', 'x')).toBe(true);
  });

  it('holds registration closed until the two passwords match and are long enough', () => {
    const base = { firstName: 'สมชาย', lastName: 'ใจดี', recoveryEmail: 'somchai@example.com' };
    expect(isCompleteMemberRegistration({ ...base, password: 'short', confirmPassword: 'short' })).toBe(false);
    expect(isCompleteMemberRegistration({ ...base, password: 'password123', confirmPassword: 'password124' })).toBe(false);
    expect(isCompleteMemberRegistration({ ...base, password: 'password123', confirmPassword: 'password123' })).toBe(true);
  });

  it('requires a school from a teacher and never from a parent', () => {
    const credentials = { password: 'password123', confirmPassword: 'password123', recoveryEmail: 'somchai@example.com' };
    expect(isCompleteMemberRegistration({ firstName: 'ก', lastName: 'ข', ...credentials, schoolId: '' })).toBe(false);
    expect(isCompleteMemberRegistration({ firstName: 'ก', lastName: 'ข', ...credentials, schoolId: 'school-1' })).toBe(true);
    expect(isCompleteMemberRegistration({ firstName: 'ก', lastName: 'ข', ...credentials })).toBe(true);
  });

  it('accepts a password at exactly the minimum length', () => {
    const password = 'x'.repeat(MEMBER_PASSWORD_MINIMUM);
    expect(isCompleteMemberRegistration({
      firstName: 'ก', lastName: 'ข', password, confirmPassword: password, recoveryEmail: 'guardian@example.com'
    })).toBe(true);
  });

  it('requires a valid recovery email when the registration flow supplies that field', () => {
    const credentials = { firstName: 'ก', lastName: 'ข', password: 'password123', confirmPassword: 'password123' };
    expect(isValidRecoveryEmail('guardian@example.com')).toBe(true);
    expect(isValidRecoveryEmail('not-an-email')).toBe(false);
    expect(isCompleteMemberRegistration({ ...credentials, recoveryEmail: '' })).toBe(false);
    expect(isCompleteMemberRegistration({ ...credentials, recoveryEmail: 'guardian@example.com' })).toBe(true);
  });
});

describe('name and password access — reading the answer', () => {
  const session = { accessToken: 'access', refreshToken: 'refresh' };
  const member = { profileId: 'p1', role: 'teacher' as const, displayName: 'สมชาย ใจดี' };

  it('adopts a session when the server returns one', () => {
    const result = interpretMemberAccessResponse({ session, member }, 200);
    expect(result).toEqual({ outcome: 'session', session, member });
  });

  it('says the same thing for every rejection, whichever half was wrong', () => {
    for (const payload of [{ code: 'MEMBER_ACCESS_DENIED' }, {}, null, { code: 'UNSUPPORTED_ACTION' }]) {
      const result = interpretMemberAccessResponse(payload, 401);
      expect(result).toEqual({ outcome: 'error', message: MEMBER_ACCESS_GENERIC_MESSAGE });
    }
  });

  it('never reports a name as unknown or a password as wrong', () => {
    const result = interpretMemberAccessResponse({ code: 'MEMBER_ACCESS_DENIED' }, 401);
    expect(result.outcome).toBe('error');
    if (result.outcome !== 'error') throw new Error('unreachable');
    expect(result.message).not.toMatch(/ไม่พบ|ไม่มีบัญชี|รหัสผ่านผิด/);
  });

  it('asks the person to choose when two namesakes accept the same password', () => {
    const result = interpretMemberAccessResponse({
      code: 'MEMBER_SELECTION_REQUIRED',
      accounts: [
        { profileId: 'a', schoolName: 'โรงเรียนหนึ่ง' },
        { profileId: 'b', schoolName: 'โรงเรียนสอง' }
      ]
    }, 409);
    expect(result.outcome).toBe('account-required');
    if (result.outcome !== 'account-required') throw new Error('unreachable');
    expect(result.accounts).toHaveLength(2);
  });

  it('tells a locked-out person how long to wait and nothing else', () => {
    const result = interpretMemberAccessResponse({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: 15 }, 429);
    expect(result.outcome).toBe('error');
    if (result.outcome !== 'error') throw new Error('unreachable');
    expect(result.locked).toBe(true);
    expect(result.message).toContain('15');
  });

  it('refuses a malformed success that carries no session', () => {
    expect(interpretMemberAccessResponse({ member }, 200))
      .toEqual({ outcome: 'error', message: MEMBER_ACCESS_GENERIC_MESSAGE });
    expect(interpretMemberAccessResponse({ session }, 200))
      .toEqual({ outcome: 'error', message: MEMBER_ACCESS_GENERIC_MESSAGE });
  });
});
