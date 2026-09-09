import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { avatarOutfits, canWearOutfit, outfitPrice } from '../../src/features/avatars/avatarOutfits';
import {
  attendancePointsFor, pointsBalanceFor, spentPointsFor, teacherPointsFor, unlockedOutfitsFor
} from '../../src/features/rewards/studentPoints';
import type { AttendanceStatus } from '../../src/domain/types';

const now = '2026-09-01T00:00:00.000Z';
const row = (id: string) => ({ id, schoolId: 'school', version: 1, createdAt: now, updatedAt: now, deletedAt: null });

function school(marks: AttendanceStatus[], bonus: number[], config?: Record<string, unknown>): SchoolSnapshot {
  return {
    ...emptySnapshot,
    ready: true,
    students: [{
      ...row('kid'), profileId: 'p-kid', studentCode: '001', displayName: 'เด็กคนหนึ่ง',
      avatarIndex: 0, avatarId: null, avatarPhotoId: null,
      avatarConfig: (config ?? null) as SchoolSnapshot['students'][number]['avatarConfig'],
      status: 'active'
    }],
    attendance: marks.map((status, index) => ({
      ...row(`a-${index}`), classId: 'room', studentId: 'kid', attendanceDate: '2026-09-01',
      status, note: '', sessionKey: `s-${index}`, sessionType: 'class' as const,
      period: 1, subjectId: null, timetableEntryId: null
    })),
    scoreEvents: bonus.map((points, index) => ({
      ...row(`e-${index}`), studentId: 'kid', classId: null, subjectId: null,
      category: 'participation' as const, points, reason: 'จิตพิสัย',
      sourceType: 'manual' as const, sourceId: null, awardedBy: null, occurredAt: now
    }))
  };
}

/*
 * What a child earns, and what they may wear.
 *
 * Earning is derived rather than recorded: a register is edited -- a child marked absent turns out to
 * have been at the dentist -- and a stored award would need an offsetting entry chasing it. Computed
 * from the marks, the total simply becomes correct the moment the mark does. Spending is the only
 * part written down, because it is the only part that cannot be recomputed from anything.
 */
describe('the points a child collects', () => {
  it('pays for turning up, and pays something for turning up late', () => {
    // A child who is late has come. Paying nothing for arriving at 08:40 teaches them to stay away.
    expect(attendancePointsFor(school(['present', 'present', 'late'], []), 'kid')).toBe(5);
  });

  it('neither pays nor charges for being ill', () => {
    // Illness is not a failure of conduct and a scheme that docked points for it would read as one.
    const ill = school(['leave_sick', 'leave_personal', 'leave', 'absent'], []);
    expect(attendancePointsFor(ill, 'kid')).toBe(0);
    expect(pointsBalanceFor(ill, 'kid').balance).toBe(0);
  });

  it('adds what a teacher gave, in whole points only', () => {
    // A mark of 7.5 out of 10 is a mark; letting fractions of it become spending money would make
    // the shop a second gradebook.
    expect(teacherPointsFor(school([], [3, 4.6]), 'kid')).toBe(7);
    // And a teacher who takes points away cannot push the balance below nothing.
    expect(teacherPointsFor(school([], [-40]), 'kid')).toBe(0);
  });

  it('subtracts what has already been spent, and never goes below nothing', () => {
    const spent = school(['present', 'present'], [], { spentPoints: 20, unlockedOutfits: ['blazer'] });
    expect(spentPointsFor(spent, 'kid')).toBe(20);
    expect(pointsBalanceFor(spent, 'kid')).toMatchObject({ earned: 4, spent: 20, balance: 0 });
    expect([...unlockedOutfitsFor(spent, 'kid')]).toEqual(['blazer']);
  });

  it('reads a record that has never been dressed without falling over', () => {
    const plain = school(['present'], []);
    expect(spentPointsFor(plain, 'kid')).toBe(0);
    expect(unlockedOutfitsFor(plain, 'kid').size).toBe(0);
  });
});

describe('what a child may wear', () => {
  it('leaves half the wardrobe free, so nobody starts with nothing', () => {
    const free = avatarOutfits.filter((outfit) => !outfit.price);
    expect(free.length).toBeGreaterThanOrEqual(4);
    for (const outfit of free) expect(canWearOutfit(outfit.id, new Set()), outfit.id).toBe(true);
  });

  it('requires a priced outfit to have been bought, not merely afforded', () => {
    // Having enough points is not the same as having spent them, or a child would own the whole
    // wardrobe on the day they could afford one of it.
    expect(canWearOutfit('labcoat', new Set())).toBe(false);
    expect(canWearOutfit('labcoat', new Set(['labcoat']))).toBe(true);
  });

  it('keeps the app price list and the server price list saying the same thing', () => {
    // The price cannot be a parameter -- a device asking to buy a lab coat for nothing must be
    // refused by something that is not the device -- so the server holds its own list, and the two
    // have to agree or a child is charged one number and shown another.
    const sql = readFileSync(
      join(resolve(process.cwd(), '../..'), 'supabase/migrations/202609090010_a_student_spends_what_they_earned.sql'),
      'utf8'
    );
    for (const outfit of avatarOutfits) {
      const price = outfitPrice(outfit.id);
      if (price === 0) {
        expect(sql, outfit.id).not.toContain(`when '${outfit.id}' then`);
      } else {
        expect(sql, outfit.id).toContain(`when '${outfit.id}' then ${price}`);
      }
    }
  });

  it('earns points on the server by the same rule the app shows', () => {
    const sql = readFileSync(
      join(resolve(process.cwd(), '../..'), 'supabase/migrations/202609090010_a_student_spends_what_they_earned.sql'),
      'utf8'
    );
    expect(sql).toContain("when 'present' then 2 when 'late' then 1 else 0 end");
  });
});
