import { describe, expect, it } from 'vitest';
import { previewTeacherAccountCredentials } from '../../src/features/teachers/teacherAccount';

describe('teacher account provisioning', () => {
  it('creates deterministic credentials for Preview without calling Auth', () => {
    const input = { teacherId: 'teacher-1', displayName: 'ครูตัวอย่าง', teacherCode: 'SC-003' };
    expect(previewTeacherAccountCredentials(input)).toEqual({
      teacherId: 'teacher-1',
      profileId: 'preview-profile-teacher-1',
      displayName: 'ครูตัวอย่าง',
      teacherCode: 'SC-003',
      initialPassword: 'Preview-SC003-2026!'
    });
    expect(previewTeacherAccountCredentials(input)).toEqual(previewTeacherAccountCredentials(input));
  });

  it('uses a safe fallback when a teacher code has no latin or Thai characters', () => {
    expect(previewTeacherAccountCredentials({ teacherId: 'teacher-2', displayName: 'Demo', teacherCode: '---' }).initialPassword)
      .toBe('Preview-Teacher-2026!');
  });
});
