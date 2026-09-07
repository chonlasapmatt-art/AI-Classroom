import { describe, expect, it } from 'vitest';
import type { Setting } from '../../src/domain/types';
import { schoolBroadcastFrom, SCHOOL_BROADCAST_KEY } from '../../src/features/notifications/schoolBroadcast';

const base = {
  id: 'setting-1', schoolId: 'school-1', version: 1,
  createdAt: '', updatedAt: '', deletedAt: null,
  scopeType: 'school', scopeId: null
};

const setting = (valueJson: Record<string, unknown>): Setting => ({
  ...base, key: SCHOOL_BROADCAST_KEY, valueJson
});

describe('the notice the whole school is shown', () => {
  it('reads back what the administrator raised', () => {
    const broadcast = schoolBroadcastFrom([setting({
      title: 'ระบบเช็กชื่อขัดข้อง', body: 'ให้บันทึกในกระดาษไปก่อน',
      tone: 'danger', raisedAt: '2026-09-07T04:00:00.000Z', raisedBy: 'ครูสมชาย'
    })]);
    expect(broadcast?.title).toBe('ระบบเช็กชื่อขัดข้อง');
    expect(broadcast?.tone).toBe('danger');
    expect(broadcast?.raisedBy).toBe('ครูสมชาย');
  });

  it('says there is nothing to show when no notice has ever been raised', () => {
    expect(schoolBroadcastFrom([])).toBeNull();
  });

  it('treats an emptied title as taken down rather than as a blank notice', () => {
    // Clearing keeps the row, because it records who raised the last notice and when it came down.
    // A dialog with an empty heading is not what "cleared" should look like to anybody.
    const cleared = setting({ title: '   ', body: '', tone: 'info', raisedAt: 'x', raisedBy: 'ครูสมชาย' });
    expect(schoolBroadcastFrom([cleared])).toBeNull();
  });

  it('falls back to the calmest tone rather than trusting an unknown one', () => {
    const broadcast = schoolBroadcastFrom([setting({ title: 'ประกาศ', tone: 'catastrophe' })]);
    expect(broadcast?.tone).toBe('info');
    expect(broadcast?.body).toBe('');
  });

  it('ignores settings that are not this notice', () => {
    const other: Setting = { ...base, key: 'grade_scheme', valueJson: { title: 'ไม่ใช่ประกาศ' } };
    expect(schoolBroadcastFrom([other])).toBeNull();
  });
});
