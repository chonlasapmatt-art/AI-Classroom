/**
 * The rules behind the live-classroom tools: who gets picked next, and how a room splits into teams.
 *
 * They live apart from the screen because they are the part that can be wrong in a way nobody
 * notices. A picker that can return the same student twice in a row looks fine on a Tuesday and is
 * the reason a class stops believing the board is fair; a team split that deals badly leaves five
 * against three. Both are decided here, with the randomness passed in so a test can pin it.
 */

/** Points a teacher can hand out from the board without typing a number. */
export const xpPresets = [1, 2, 5, 10] as const;

/** Teams a room can be split into. More than six turns a class into pairs, which is a different tool. */
export const teamCountOptions = [2, 3, 4, 5, 6] as const;

export interface PickResult {
  /** Who to put on the board, or null when there is nobody to pick from. */
  studentId: string | null;
  /** Everybody picked so far in the current round, the new pick included. */
  picked: string[];
  /** True when the previous round had used everybody up and this pick opened a new one. */
  roundRestarted: boolean;
}

/**
 * Picks the next student, never repeating anybody until the whole class has had a turn.
 *
 * Drawing with replacement is what a naive `Math.random()` on the roster does, and in a class of
 * thirty it will call the same student twice within a few draws often enough that the room notices.
 * Picking from those who have not been picked yet is the property that makes the tool usable in
 * front of students: everybody gets a turn before anybody gets a second one.
 */
export function pickNextStudent(
  rosterIds: string[], picked: string[], random: () => number = Math.random
): PickResult {
  const roster = rosterIds.filter((id, index) => rosterIds.indexOf(id) === index);
  if (roster.length === 0) return { studentId: null, picked: [], roundRestarted: false };

  // A student who left the room mid-round should not hold a place in it, and one who arrived should
  // be eligible; the carried-over list is filtered against the roster as it is now.
  const carried = picked.filter((id) => roster.includes(id));
  const remaining = roster.filter((id) => !carried.includes(id));
  const roundRestarted = remaining.length === 0;
  const pool = roundRestarted ? roster : remaining;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
  if (!chosen) return { studentId: null, picked: carried, roundRestarted: false };
  return { studentId: chosen, picked: roundRestarted ? [chosen] : [...carried, chosen], roundRestarted };
}

/**
 * Splits the room into balanced teams.
 *
 * Shuffled first, then dealt one at a time, so team sizes differ by at most one and the order the
 * roster happens to be in — usually alphabetical, which puts the same people together every week —
 * decides nothing.
 */
export function splitIntoTeams(ids: string[], teamCount: number, random: () => number = Math.random): string[][] {
  const size = Math.max(1, Math.min(Math.floor(teamCount), Math.max(1, ids.length)));
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = shuffled[index]!;
    shuffled[index] = shuffled[swap]!;
    shuffled[swap] = held;
  }
  const teams: string[][] = Array.from({ length: size }, () => []);
  shuffled.forEach((id, index) => { teams[index % size]!.push(id); });
  return teams;
}

const teamNames = ['ทีมแดง', 'ทีมน้ำเงิน', 'ทีมเขียว', 'ทีมเหลือง', 'ทีมม่วง', 'ทีมส้ม'];

export function teamName(index: number): string {
  return teamNames[index] ?? `ทีม ${index + 1}`;
}

/** Picks a question nobody has seen yet this session, starting over once the pool is exhausted. */
export function pickNextIndex(total: number, used: number[], random: () => number = Math.random): { index: number | null; used: number[] } {
  if (total <= 0) return { index: null, used: [] };
  const carried = used.filter((value) => value >= 0 && value < total);
  const remaining = Array.from({ length: total }, (_, index) => index).filter((index) => !carried.includes(index));
  const pool = remaining.length > 0 ? remaining : Array.from({ length: total }, (_, index) => index);
  const index = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? 0;
  return { index, used: remaining.length > 0 ? [...carried, index] : [index] };
}

/** `mm:ss`, which is how a countdown on a board has to read from the back of the room. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
