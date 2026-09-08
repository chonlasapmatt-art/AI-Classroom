import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import type { StudentAchievement } from '../../src/domain/types';
import { avatarOutfits, defaultOutfit, outfitById, outfitIds } from '../../src/features/avatars/avatarOutfits';
import { resolveAvatar } from '../../src/features/avatars/avatarThemes';
import { ThemedAvatar } from '../../src/features/avatars/ThemedAvatar';
import { levelFromPoints } from '../../src/features/avatars/avatarLevels';
import { honourTally, honoursFor, tierFor } from '../../src/features/achievements/honours';
import { AdminEntry } from '../../src/features/dashboard/AdminEntry';

/*
 * Clothes, medals and the administrator's door.
 *
 * The three things that must hold: an avatar saved before outfits existed still has clothes on, one
 * student's medals are one student's medals, and the door onto the administrator's screens is not
 * drawn for anybody who cannot open it.
 */

function award(id: string, studentId: string, key: StudentAchievement['achievementKey'], awardedAt: string, deletedAt: string | null = null): StudentAchievement {
  return {
    id, studentId, achievementKey: key, dedupeKey: `${studentId}:${key}`, note: '', awardedBy: 'teacher-1',
    awardedAt, createdAt: awardedAt, updatedAt: awardedAt, deletedAt
  } as StudentAchievement;
}

const snapshot = {
  achievements: [
    award('a1', 'student-1', 'helper', '2026-01-02T00:00:00.000Z'),
    award('a2', 'student-1', 'reader', '2026-03-04T00:00:00.000Z'),
    award('a3', 'student-2', 'steady_attendance', '2026-02-02T00:00:00.000Z'),
    award('a4', 'student-1', 'thinker', '2026-04-04T00:00:00.000Z', '2026-05-05T00:00:00.000Z')
  ]
} as unknown as SchoolSnapshot;

describe('what an avatar wears', () => {
  it('gives every outfit its own id so inserting one never re-dresses a saved avatar', () => {
    expect(new Set(outfitIds).size).toBe(avatarOutfits.length);
  });

  it('dresses an avatar that was saved before outfits existed', () => {
    expect(outfitById(undefined)).toBe(defaultOutfit);
    expect(outfitById(null)).toBe(defaultOutfit);
    expect(outfitById('')).toBe(defaultOutfit);
    expect(resolveAvatar(7).outfit).toBe(defaultOutfit);
  });

  it('falls back to the default rather than nothing when a saved id is gone', () => {
    expect(outfitById('a-shirt-that-was-removed')).toBe(defaultOutfit);
  });

  it('keeps the chosen outfit through the identity the drawing reads', () => {
    for (const outfit of avatarOutfits) {
      const identity = resolveAvatar(3, { archetype: 1, palette: 2, skinTone: 3, hair: 1, accessory: 0, badge: 0, outfit: outfit.id });
      expect(identity.outfit).toBe(outfit);
    }
  });

  it('draws every outfit without losing the rest of the avatar', () => {
    for (const outfit of avatarOutfits) {
      const { container, unmount } = render(
        <ThemedAvatar avatarIndex={2} config={{ archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, outfit: outfit.id }} size={64} />
      );
      const svg = container.querySelector('svg')!;
      expect(svg.querySelector('title')?.textContent).toContain(outfit.name);
      expect(svg.querySelectorAll('path, circle, rect, ellipse').length).toBeGreaterThan(3);
      unmount();
    }
  });
});

describe('medals belong to one student', () => {
  it('hands back only that student, newest first', () => {
    const mine = honoursFor(snapshot, 'student-1');
    expect(mine.map((honour) => honour.id)).toEqual(['a2', 'a1']);
    expect(mine.every((honour) => honour.studentId === 'student-1')).toBe(true);
  });

  it('never mixes two students into one pile', () => {
    const theirs = honoursFor(snapshot, 'student-2');
    expect(theirs.map((honour) => honour.id)).toEqual(['a3']);
    expect(theirs.some((honour) => honour.studentId === 'student-1')).toBe(false);
  });

  it('gives a student with nothing an empty list rather than everybody elses', () => {
    expect(honoursFor(snapshot, 'student-nobody')).toEqual([]);
    expect(honoursFor(snapshot, '')).toEqual([]);
  });

  it('carries the fields a medal is described by', () => {
    const [newest] = honoursFor(snapshot, 'student-1');
    expect(newest).toMatchObject({ id: 'a2', key: 'reader', studentId: 'student-1', tier: 'silver' });
    expect(newest!.name.length).toBeGreaterThan(0);
    expect(newest!.description.length).toBeGreaterThan(0);
    expect(newest!.icon.length).toBeGreaterThan(0);
    expect(newest!.awardedAt).toBe('2026-03-04T00:00:00.000Z');
  });

  it('counts the tiers it holds', () => {
    expect(honourTally(honoursFor(snapshot, 'student-1'))).toEqual({ bronze: 0, silver: 1, gold: 1 });
    expect(honourTally([])).toEqual({ bronze: 0, silver: 0, gold: 0 });
    expect(tierFor('score_improver')).toBe('gold');
  });
});

describe('points read as a level', () => {
  it('starts everybody at level one', () => {
    expect(levelFromPoints(0)).toEqual({ level: 1, into: 0, needed: 50 });
  });

  it('climbs a level every fifty points', () => {
    expect(levelFromPoints(49).level).toBe(1);
    expect(levelFromPoints(50)).toEqual({ level: 2, into: 0, needed: 50 });
    expect(levelFromPoints(80)).toEqual({ level: 2, into: 30, needed: 50 });
  });

  it('refuses to go below level one on a negative or fractional total', () => {
    expect(levelFromPoints(-20).level).toBe(1);
    expect(levelFromPoints(12.4).into).toBe(12);
  });
});

describe('the administrator door on the home screen', () => {
  const doorFor = (role: 'admin' | 'teacher' | 'student' | 'parent') => {
    const { container, unmount } = render(<MemoryRouter><AdminEntry role={role} /></MemoryRouter>);
    const found = container.querySelector('.admin-entry');
    unmount();
    return found;
  };

  it('is drawn for an administrator, pointing at the screens that already exist', () => {
    render(<MemoryRouter><AdminEntry role="admin" /></MemoryRouter>);
    expect(screen.getByText('ศูนย์ผู้ดูแลระบบ')).toBeTruthy();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.admin-entry-door'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      ['/operations', '/teachers', '/announcements', '/import', '/promotion', '/settings']
    );
  });

  it('is drawn for nobody else', () => {
    expect(doorFor('teacher')).toBeNull();
    expect(doorFor('student')).toBeNull();
    expect(doorFor('parent')).toBeNull();
  });
});

describe('changing your own clothes', () => {
  it('writes the outfit onto the student who asked, keeping the rest of their look', async () => {
    const repository = new FixtureSchoolRepository();
    repository.setVisibility({ role: 'student', profileId: 'preview-student' });
    let snapshot!: SchoolSnapshot;
    const stop = repository.subscribe((next) => { snapshot = next; });

    const before = snapshot.students.find((row) => row.profileId === 'preview-student')!;
    await repository.saveOwnOutfit('preview-student', 'labcoat');
    const after = snapshot.students.find((row) => row.id === before.id)!;

    expect(after.avatarConfig?.outfit).toBe('labcoat');
    expect(after.avatarId).toBe(before.avatarId);
    expect(after.avatarIndex).toBe(before.avatarIndex);
    stop();
  });

  it('refuses an outfit that is not in the catalogue, and a record that is not the callers', async () => {
    const repository = new FixtureSchoolRepository();
    repository.setVisibility({ role: 'student', profileId: 'preview-student' });
    await expect(repository.saveOwnOutfit('preview-student', 'invisibility-cloak')).rejects.toThrow();
    await expect(repository.saveOwnOutfit('somebody-else', 'labcoat')).rejects.toThrow();
  });
});
