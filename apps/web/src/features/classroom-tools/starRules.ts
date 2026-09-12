import type { ScoreEvent } from '../../domain/types';

/**
 * The two rules a star has to obey, in the one place both repositories read them from.
 *
 * They are also written into the database as a trigger, because a ceiling enforced only by the app
 * is a ceiling a crafted request walks through. These exist so the app refuses first and says why in
 * Thai, rather than letting the round trip come back with a Postgres error nobody in a classroom can
 * act on — and so the offline repository, which has no server to ask, behaves the same way.
 *
 * Kept apart from `classroomStars.ts` so the data layer can import them without pulling a feature's
 * snapshot helpers in with them.
 */
export const STAR_CATEGORY = 'star';
export const STAR_POINTS = 4;
export const STAR_CAP = 20;

export function starCountOf(events: readonly ScoreEvent[], studentId: string): number {
  return events.filter((event) => (
    event.studentId === studentId && event.category === STAR_CATEGORY && !event.deletedAt
  )).length;
}

/**
 * Refuses a star that is the wrong size or one too many, and says which in Thai.
 *
 * Returns null when the award is fine, so a caller reads as `const refusal = refuseStar(...)`.
 * Anything that is not a star passes straight through: this knows about stars and nothing else.
 */
export function refuseStar(
  events: readonly ScoreEvent[], category: string, points: number, studentId: string
): string | null {
  if (category !== STAR_CATEGORY) return null;
  if (points !== STAR_POINTS) return `ดาวหนึ่งดวงมีค่า ${STAR_POINTS} XP เสมอ`;
  if (starCountOf(events, studentId) >= STAR_CAP) return `นักเรียนคนนี้มีครบ ${STAR_CAP} ดาวแล้ว`;
  return null;
}
