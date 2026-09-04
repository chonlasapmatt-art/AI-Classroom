import { describe, expect, it } from 'vitest';
import {
  formatCountdown, pickNextIndex, pickNextStudent, splitIntoTeams, teamName
} from '../../src/features/classroom/classroomGames';

/** A generator that walks a fixed list, so "random" is exactly what the test says it is. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('picking a student in front of the class', () => {
  it('never calls the same student twice before the class has had a turn', () => {
    const roster = ['a', 'b', 'c'];
    let picked: string[] = [];
    const seen: string[] = [];
    // Always drawing the first of whatever remains is the worst case for repetition; the pool is
    // what prevents it, not the randomness.
    for (let round = 0; round < 3; round += 1) {
      const result = pickNextStudent(roster, picked, () => 0);
      picked = result.picked;
      seen.push(result.studentId ?? '');
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('opens a new round once everybody has been called', () => {
    const result = pickNextStudent(['a', 'b'], ['a', 'b'], () => 0);
    expect(result.roundRestarted).toBe(true);
    expect(result.picked).toEqual([result.studentId]);
  });

  it('drops a student who left the room and admits one who arrived', () => {
    const result = pickNextStudent(['a', 'c'], ['a', 'b'], () => 0);
    expect(result.studentId).toBe('c');
    expect(result.picked).toEqual(['a', 'c']);
    expect(result.roundRestarted).toBe(false);
  });

  it('has nothing to pick from an empty room', () => {
    expect(pickNextStudent([], [], () => 0).studentId).toBeNull();
  });

  it('ignores a duplicated roster entry rather than picking it twice', () => {
    const first = pickNextStudent(['a', 'a', 'b'], [], () => 0);
    const second = pickNextStudent(['a', 'a', 'b'], first.picked, () => 0);
    expect([first.studentId, second.studentId].sort()).toEqual(['a', 'b']);
  });
});

describe('splitting the room into teams', () => {
  it('keeps team sizes within one of each other', () => {
    const teams = splitIntoTeams(['a', 'b', 'c', 'd', 'e'], 2, sequence([0]));
    const sizes = teams.map((team) => team.length).sort();
    expect(teams).toHaveLength(2);
    expect(sizes[sizes.length - 1]! - sizes[0]!).toBeLessThanOrEqual(1);
  });

  it('places every student exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const flat = splitIntoTeams(ids, 3, sequence([0.1, 0.9, 0.4, 0.7, 0.2, 0.5, 0.3])).flat();
    expect(flat.sort()).toEqual([...ids].sort());
  });

  it('never asks for more teams than there are students', () => {
    expect(splitIntoTeams(['a', 'b'], 6, () => 0)).toHaveLength(2);
  });

  it('names the first teams by colour and falls back to a number', () => {
    expect(teamName(0)).toBe('ทีมแดง');
    expect(teamName(9)).toBe('ทีม 10');
  });
});

describe('asking a question and running a clock', () => {
  it('works through the bank before repeating a question', () => {
    let used: number[] = [];
    const seen: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      const next = pickNextIndex(3, used, () => 0);
      used = next.used;
      seen.push(next.index ?? -1);
    }
    expect(new Set(seen).size).toBe(3);
    expect(pickNextIndex(3, used, () => 0).used).toHaveLength(1);
  });

  it('has no question to ask from an empty bank', () => {
    expect(pickNextIndex(0, [], () => 0).index).toBeNull();
  });

  it('reads a countdown as minutes and seconds', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(300)).toBe('05:00');
  });
});
