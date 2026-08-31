import { describe, expect, it } from 'vitest';
import {
  interpretMemberAccessResponse, isCompleteMemberRegistration, normalizeAccessCode
} from '../../src/features/auth/memberAccess';
import { describeTeacherAccessCode, type TeacherAccessCode } from '../../src/features/teachers/teacherAccessCode';

function code(overrides: Partial<TeacherAccessCode> = {}): TeacherAccessCode {
  return {
    codeId: 'code-1', code: 'SC-482917', hint: 'SC-••••17', label: '', expiresAt: null,
    maxUses: null, useCount: 0, createdAt: '2026-08-31T00:00:00.000Z', expired: false,
    exhausted: false, unreadable: false, ...overrides
  };
}

describe('teacher access code', () => {
  describe('normalising what a person typed', () => {
    it('treats the separator, the case and the spacing as noise', () => {
      expect(normalizeAccessCode('SC-482917')).toBe('SC482917');
      expect(normalizeAccessCode('sc 482917')).toBe('SC482917');
      expect(normalizeAccessCode('  sc482917  ')).toBe('SC482917');
      expect(normalizeAccessCode('SC–482917')).toBe('SC482917');
    });

    it('keeps two different codes different', () => {
      expect(normalizeAccessCode('SC-482917')).not.toBe(normalizeAccessCode('SC-482918'));
    });

    it('reduces a code of only punctuation to nothing, so it cannot pass as one', () => {
      expect(normalizeAccessCode('---')).toBe('');
    });
  });

  describe('the registration form', () => {
    const base = {
      firstName: 'สมชาย', lastName: 'ใจดี', password: 'password123',
      confirmPassword: 'password123', recoveryEmail: 'somchai@example.com', schoolId: 'school-1'
    };

    it('is incomplete for a teacher until a code is typed', () => {
      expect(isCompleteMemberRegistration({ ...base, accessCode: '' })).toBe(false);
      expect(isCompleteMemberRegistration({ ...base, accessCode: 'SC-482917' })).toBe(true);
    });

    it('rejects a code that normalises away to nothing', () => {
      expect(isCompleteMemberRegistration({ ...base, accessCode: '- - -' })).toBe(false);
    });

    // A parent has no school and no code, and asking them for one would be asking for something
    // that does not exist.
    it('does not ask a parent for a code', () => {
      expect(isCompleteMemberRegistration({
        firstName: base.firstName, lastName: base.lastName, password: base.password,
        confirmPassword: base.confirmPassword, recoveryEmail: base.recoveryEmail
      })).toBe(true);
    });
  });

  describe('what the screen says when the server refuses', () => {
    it('names the code when none was sent', () => {
      const result = interpretMemberAccessResponse({ code: 'TEACHER_CODE_REQUIRED' }, 400);
      expect(result.outcome).toBe('error');
      expect(result.outcome === 'error' && result.message).toContain('รหัสสำหรับครู');
    });

    it('gives one answer for wrong, revoked, expired and used-up codes', () => {
      const result = interpretMemberAccessResponse({ code: 'TEACHER_CODE_INVALID' }, 403);
      expect(result.outcome).toBe('error');
      // The message must not let a person work out which of those it was.
      expect(result.outcome === 'error' && result.message).toContain('ผู้ดูแลโรงเรียน');
    });
  });

  describe('describing a code to its administrator', () => {
    it('says a school has none rather than showing an empty box', () => {
      expect(describeTeacherAccessCode(null)).toContain('ยังไม่มีรหัส');
    });

    it('leads with the reason a code no longer works', () => {
      expect(describeTeacherAccessCode(code({ expired: true }))).toContain('หมดอายุ');
      expect(describeTeacherAccessCode(code({ exhausted: true, maxUses: 5, useCount: 5 }))).toContain('ใช้ครบ');
    });

    it('counts the uses that remain on a limited code', () => {
      expect(describeTeacherAccessCode(code({ maxUses: 12, useCount: 4 }))).toContain('ใช้ได้อีก 8 ครั้ง');
    });

    it('says a code is unlimited rather than leaving the limit blank', () => {
      const described = describeTeacherAccessCode(code({ maxUses: null, useCount: 3 }));
      expect(described).toContain('ไม่จำกัดจำนวนครู');
      expect(described).toContain('ใช้ไปแล้ว 3 ครั้ง');
    });
  });
});

// The shared cryptography module is Deno-flavoured, so its pure formatting helpers are exercised
// here through a small transcription rather than by importing the Edge Function source.
describe('how a code is displayed', () => {
  const CODE_PREFIX = 'SC-';
  const normalize = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const format = (value: string) => {
    const normalized = normalize(value);
    return /^SC\d+$/.test(normalized) ? `${CODE_PREFIX}${normalized.slice(2)}` : normalized;
  };
  const hint = (value: string) => {
    const formatted = format(value);
    const prefix = formatted.startsWith(CODE_PREFIX) ? CODE_PREFIX : '';
    const body = formatted.slice(prefix.length);
    if (body.length <= 2) return `${prefix}${'•'.repeat(body.length)}`;
    return `${prefix}${'•'.repeat(body.length - 2)}${body.slice(-2)}`;
  };

  it('writes a generated code with its prefix', () => {
    expect(format('SC482917')).toBe('SC-482917');
    expect(format('sc-482917')).toBe('SC-482917');
  });

  it('leaves a school-chosen code as the school wrote it', () => {
    // Dressing TIGER2569 up as SC-TIGER2569 would print something nobody typed.
    expect(format('TIGER2569')).toBe('TIGER2569');
    expect(format('tiger-2569')).toBe('TIGER2569');
  });

  it('treats SC-001 as the generated shape, because that is what it looks like', () => {
    expect(format('SC-001')).toBe('SC-001');
  });

  it('masks all but the last two characters, whatever shape the code has', () => {
    expect(hint('SC-482917')).toBe('SC-••••17');
    expect(hint('TIGER2569')).toBe('•••••••69');
  });
});
