import type { SchoolSnapshot } from '../../data/schoolRepository';

/**
 * The star a teacher hands out for joining in, and what it is worth.
 *
 * ── Why a star rather than "give some points" ──
 * The board already lets a teacher type a number of XP, and a number is a decision: two or five, and
 * why not four, and did the last class get the same. A star is one thing worth one amount, so the
 * teacher's decision is only *who*, which is the decision they actually want to make while standing
 * in front of a room.
 *
 * ── What it is worth ──
 * Twice what a piece of work is. A submission marked and a register mark are both worth two, and a
 * child who stands up and joins in should move faster than one who hands work in quietly — that is
 * the whole intent of the thing. Four is that, stated once, and it feeds the same ledger every other
 * award goes through, so it counts towards the level that unlocks avatar pieces without a second
 * scheme to keep in step.
 *
 * ── Why there is a ceiling ──
 * Twenty each. Without one, a generous teacher and a careful one hand out levels at different rates
 * and the level stops meaning anything across a school. Twenty stars is eighty XP — most of two
 * levels — which is a real reward and not a way round the rest of the scheme.
 */
export const STAR_XP = 4;

/** What one of those is double: a marked submission, or a register mark. */
export const BASELINE_XP = 2;

export const STAR_CAP = 20;

/**
 * The mark that makes a star a star.
 *
 * Stars are score events like any other — that is what makes them count towards a level, and what
 * makes them show up in the history a parent can read. They still have to be *countable* against
 * the ceiling, and counting by points or by wording would break the first time somebody awarded
 * four XP by hand or rephrased the reason. `sourceId` cannot hold a marker either: it is a uuid
 * column pointing at whatever produced the award. So the kind of award is what says it, which is
 * what a category is for.
 */
export const STAR_CATEGORY = 'star' as const;

export const STAR_REASON = 'ดาวกิจกรรมหน้าชั้นเรียน';

/** How many stars this child already holds. */
export function starsFor(snapshot: SchoolSnapshot, studentId: string): number {
  return snapshot.scoreEvents.filter((event) => (
    event.studentId === studentId
    && !event.deletedAt
    && event.category === STAR_CATEGORY
  )).length;
}

/** How many more they may be given. Never negative, whatever is already in the ledger. */
export function starsRemainingFor(snapshot: SchoolSnapshot, studentId: string): number {
  return Math.max(0, STAR_CAP - starsFor(snapshot, studentId));
}

export function canGiveStar(snapshot: SchoolSnapshot, studentId: string): boolean {
  return starsRemainingFor(snapshot, studentId) > 0;
}

/** Every star given in this room today, newest first — the undo list, and the day's record. */
export function starsGivenToday(snapshot: SchoolSnapshot, classId: string, today: string) {
  return snapshot.scoreEvents
    .filter((event) => (
      event.category === STAR_CATEGORY
      && !event.deletedAt
      && event.classId === classId
      && event.occurredAt.slice(0, 10) === today
    ))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
