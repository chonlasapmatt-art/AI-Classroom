import { describe, expect, it } from 'vitest';
import type { StudentAchievement } from '../../src/domain/types';
import { achievementNoticeKey, achievementNoticesFor } from '../../src/academic/achievementNotices';

const award = (over: Partial<StudentAchievement>): StudentAchievement => ({
  id: 'award-1', schoolId: 'school-1', version: 1,
  createdAt: '', updatedAt: '', deletedAt: null,
  studentId: 'student-1', achievementKey: 'helper', dedupeKey: 'student-1:helper',
  note: '', awardedBy: 'teacher-1', awardedAt: '2026-09-09T02:00:00.000Z',
  ...over
});

describe('telling a child about the medal they were given', () => {
  it('names the badge and its tier in the title', () => {
    const [notice] = achievementNoticesFor({
      awards: [award({})], studentId: 'student-1', classId: 'class-1', existing: []
    });
    expect(notice?.title).toBe('ได้รับเหรียญทอง: ผู้ช่วยเหลือเพื่อน');
    expect(notice?.dedupeKey).toBe(achievementNoticeKey('award-1'));
  });

  it("prefers the teacher's own words over the catalogue sentence", () => {
    const [notice] = achievementNoticesFor({
      awards: [award({ note: 'ช่วยเพื่อนทั้งคาบ' })], studentId: 'student-1', classId: 'class-1', existing: []
    });
    expect(notice?.body).toBe('ช่วยเพื่อนทั้งคาบ');
  });

  it('says it once, however many times the device asks', () => {
    const first = achievementNoticesFor({
      awards: [award({})], studentId: 'student-1', classId: 'class-1', existing: []
    });
    const second = achievementNoticesFor({
      awards: [award({})],
      studentId: 'student-1',
      classId: 'class-1',
      existing: first.map((notice) => ({ dedupeKey: notice.dedupeKey }))
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("never writes a notice about somebody else's medal", () => {
    const notices = achievementNoticesFor({
      awards: [award({ id: 'award-2', studentId: 'student-2' })],
      studentId: 'student-1', classId: 'class-1', existing: []
    });
    expect(notices).toEqual([]);
  });

  it('ignores an award that has been taken back', () => {
    const notices = achievementNoticesFor({
      awards: [award({ deletedAt: '2026-09-09T03:00:00.000Z' })],
      studentId: 'student-1', classId: 'class-1', existing: []
    });
    expect(notices).toEqual([]);
  });
});
