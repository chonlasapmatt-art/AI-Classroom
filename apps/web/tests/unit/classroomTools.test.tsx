import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classroomTools, toolCategoryDescriptions, toolCategoryLabels, toolCategoryOrder
} from '../../src/features/classroom-tools/toolsRegistry';
import {
  BASELINE_XP, STAR_CAP, STAR_CATEGORY, STAR_XP, starsFor, starsRemainingFor
} from '../../src/features/classroom-tools/classroomStars';
import { refuseStar, starCountOf } from '../../src/features/classroom-tools/starRules';
import { scopeSchoolSnapshot } from '../../src/data/visibility';
import { emptySnapshot } from '../../src/data/schoolRepository';
import type { ScoreEvent, SyncRecord } from '../../src/domain/types';

/*
 * The activity hub: the registry a future game plugs into, and the star that pays for it.
 *
 * The registry is data, so what is worth testing about it is the promises it makes to the screen —
 * every activity is in a section the hub draws, every route-shaped one names a route, and nothing
 * that is not built yet is pressable. The star is the opposite: almost no UI, and two rules that
 * matter more than the screen does, because they decide how fast a child levels up.
 */

function scoreEvent(over: Partial<ScoreEvent>): ScoreEvent {
  const base: SyncRecord = {
    id: over.id ?? `event-${Math.random().toString(36).slice(2)}`,
    schoolId: 'school-1', createdAt: '2026-09-13T01:00:00.000Z', updatedAt: '2026-09-13T01:00:00.000Z',
    serverUpdatedAt: '2026-09-13T01:00:00.000Z', deletedAt: null, version: 1
  } as SyncRecord;
  return {
    ...base,
    studentId: 'student-1', classId: 'class-1', subjectId: 'subject-1',
    category: STAR_CATEGORY, points: STAR_XP, reason: 'ดาว', sourceType: 'board', sourceId: null,
    awardedBy: 'teacher-1', occurredAt: '2026-09-13T01:00:00.000Z',
    ...over
  } as ScoreEvent;
}

describe('the activity registry', () => {
  it('puts every activity in a section the hub draws', () => {
    for (const tool of classroomTools) {
      expect(toolCategoryOrder, tool.id).toContain(tool.category);
      expect(toolCategoryLabels[tool.category]?.length, tool.category).toBeGreaterThan(0);
      expect(toolCategoryDescriptions[tool.category]?.length, tool.category).toBeGreaterThan(0);
    }
  });

  it('names an address for everything that leaves for one', () => {
    // A route-shaped card with no route is a tile that does nothing when pressed, which reads as the
    // hub being broken rather than as a missing line of data.
    for (const tool of classroomTools.filter((item) => item.actionType === 'route')) {
      expect(tool.route, tool.id).toBeTruthy();
      expect(tool.route?.startsWith('/'), tool.id).toBe(true);
    }
  });

  it('gives every activity its own identity', () => {
    const ids = classroomTools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tool of classroomTools) {
      expect(tool.title.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.description.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.bgColor, tool.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(tool.iconBgColor, tool.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps what is not built yet visible and unpressable', () => {
    /*
     * The hub shows what is coming rather than hiding it, and the card carries `isReady: false` so
     * the grid can refuse the press. A future game arriving is a row here and a branch in the hub —
     * the point of the registry — and until the second half lands the first must not open anything.
     */
    const planned = classroomTools.filter((tool) => !tool.isReady);
    expect(planned.length).toBeGreaterThan(0);
    for (const tool of planned) expect(tool.badge, tool.id).toBeTruthy();
  });

  it('is drawn with icons the icon set actually has', () => {
    const iconSource = ['apps/web/src/ui/Icon.tsx', 'src/ui/Icon.tsx']
      .map((candidate) => resolve(candidate))
      .find((candidate) => existsSync(candidate))!;
    const icons = readFileSync(iconSource, 'utf8');
    for (const tool of classroomTools) {
      // Keys are quoted in the map when the name has a dash in it, bare when it does not.
      const named = icons.includes(`  ${tool.iconName}:`) || icons.includes(`  '${tool.iconName}':`);
      expect(named, tool.iconName).toBe(true);
    }
  });
});

describe('what a star is worth', () => {
  it('is double what a piece of work is', () => {
    // The rule the whole feature exists for, stated once so a change to it is a change to this line.
    expect(STAR_XP).toBe(BASELINE_XP * 2);
  });

  it('counts only stars towards the ceiling', () => {
    const events = [
      scoreEvent({ id: 'a' }),
      scoreEvent({ id: 'b' }),
      // A participation award of the same size is not a star and must not eat into the allowance.
      scoreEvent({ id: 'c', category: 'participation' }),
      scoreEvent({ id: 'd', studentId: 'student-2' })
    ];
    expect(starCountOf(events, 'student-1')).toBe(2);
  });

  it('gives a withdrawn star back', () => {
    const events = [scoreEvent({ id: 'a' }), scoreEvent({ id: 'b', deletedAt: '2026-09-13T02:00:00.000Z' })];
    expect(starCountOf(events, 'student-1')).toBe(1);
  });

  it('refuses the twenty-first, and says so in Thai', () => {
    const full = Array.from({ length: STAR_CAP }, (_, index) => scoreEvent({ id: `s${index}` }));
    expect(refuseStar(full, STAR_CATEGORY, STAR_XP, 'student-1')).toContain(`${STAR_CAP}`);
    // Another child in the same room is unaffected: the ceiling is per child, not per class.
    expect(refuseStar(full, STAR_CATEGORY, STAR_XP, 'student-2')).toBeNull();
  });

  it('refuses a star that is the wrong size', () => {
    // A star worth seven in one class and four in another is not a star, so the value is part of
    // the definition rather than a default the caller may change.
    expect(refuseStar([], STAR_CATEGORY, 7, 'student-1')).toBeTruthy();
    expect(refuseStar([], STAR_CATEGORY, STAR_XP, 'student-1')).toBeNull();
  });

  it('leaves every other kind of award alone', () => {
    const full = Array.from({ length: STAR_CAP }, (_, index) => scoreEvent({ id: `s${index}` }));
    expect(refuseStar(full, 'participation', 2, 'student-1')).toBeNull();
    expect(refuseStar(full, 'bonus', 50, 'student-1')).toBeNull();
  });

  it('reads the ceiling off a snapshot the same way', () => {
    const snapshot = { ...emptySnapshot, scoreEvents: [scoreEvent({ id: 'a' }), scoreEvent({ id: 'b' })] };
    expect(starsFor(snapshot, 'student-1')).toBe(2);
    expect(starsRemainingFor(snapshot, 'student-1')).toBe(STAR_CAP - 2);
  });
});

describe('the star the teacher just gave', () => {
  it('is visible to the teacher who gave it', () => {
    /*
     * A teacher's snapshot used to filter score events down to students who *are* that teacher,
     * which is nobody — so the count beside every child read zero however many stars were handed
     * out, and the ceiling those counts feed could never be reached. The roster of the rooms they
     * teach is the same boundary the register uses.
     */
    const snapshot = {
      ...emptySnapshot,
      teachers: [{ ...scoreEvent({}), id: 'teacher-row', profileId: 'teacher-profile', status: 'active' }] as never,
      classTeachers: [{ id: 'link', schoolId: 'school-1', classId: 'class-1', teacherId: 'teacher-row', role: 'primary', activeUntil: null }] as never,
      classes: [{ id: 'class-1', schoolId: 'school-1', academicTermId: 'term-1', name: 'ป.5/1', gradeLevel: 'ป.5', capacity: 30, status: 'active' }] as never,
      students: [{ id: 'student-1', schoolId: 'school-1', profileId: 'child', studentCode: '001', displayName: 'เด็ก', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' }] as never,
      enrollments: [{ id: 'enrol-1', schoolId: 'school-1', studentId: 'student-1', classId: 'class-1', status: 'active' }] as never,
      scoreEvents: [scoreEvent({ id: 'a' })]
    };
    const scoped = scopeSchoolSnapshot(snapshot as never, { role: 'teacher', profileId: 'teacher-profile' });
    expect(scoped.scoreEvents).toHaveLength(1);
  });
});

describe('the database says the same', () => {
  it('caps stars on the table rather than in one writer', () => {
    /*
     * Enforced by a trigger, not inside `apply_sync_mutation`: a ceiling that lives in one write
     * path is a ceiling that holds until somebody adds another. The migration is read rather than
     * the function, because what matters is that the rule is attached to the table.
     */
    const migrations = ['supabase/migrations', '../../supabase/migrations']
      .map((candidate) => resolve(candidate))
      .find((candidate) => existsSync(candidate))!;
    const sql = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrations, name), 'utf8'))
      .find((body) => body.includes('enforce_star_award'))!;
    expect(sql, 'a migration defines the star rules').toBeTruthy();
    expect(sql).toContain('before insert or update on public.score_events');
    expect(sql).toContain(`held >= ${STAR_CAP}`);
    expect(sql).toContain(`new.points <> ${STAR_XP}`);
    expect(sql).toContain("'star'");
  });
});
