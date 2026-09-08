/**
 * Points earned turn into a level, so a number nobody can picture becomes a step somebody can.
 *
 * Fifty points a level is a round number chosen for the arithmetic being visible, not for balance:
 * a student can look at "80 คะแนน" and see for themselves that they are most of the way through
 * level two. It is a display rule and nothing else — no score is stored, spent or changed here, and
 * the points it reads are the ones the score engine already keeps.
 */
export const POINTS_PER_LEVEL = 50;

export interface AvatarLevel {
  level: number;
  /** Points earned inside the current level, which is what the bar fills to. */
  into: number;
  needed: number;
}

export function levelFromPoints(points: number): AvatarLevel {
  const safe = Math.max(0, Math.round(points));
  return {
    level: Math.floor(safe / POINTS_PER_LEVEL) + 1,
    into: safe % POINTS_PER_LEVEL,
    needed: POINTS_PER_LEVEL
  };
}
