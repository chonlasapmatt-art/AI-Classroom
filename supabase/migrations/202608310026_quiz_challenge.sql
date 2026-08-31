import { describe, expect, it } from 'vitest';
import {
  BONUS_BANDS, secondsRemaining, selectQuestions, suggestedBonus
} from '../../src/features/quiz/quizChallenge';

const pool = [
  { id: 'e1', difficulty: 'easy' as const }, { id: 'e2', difficulty: 'easy' as const },
  { id: 'e3', difficulty: 'easy' as const }, { id: 'm1', difficulty: 'medium' as const },
  { id: 'm2', difficulty: 'medium' as const }, { id: 'm3', difficulty: 'medium' as const },
  { id: 'h1', difficulty: 'hard' as const }, { id: 'h2', difficulty: 'hard' as const }
];

// A generator that always returns the same value makes the shuffle deterministic without making the
// function under test aware it is being tested.
const fixedRandom = () => 0;

describe('choosing the questions for a round', () => {
  it('takes them in order when the teacher picked them', () => {
    expect(selectQuestions(pool, 3, 'manual').map((item) => item.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns the asked-for count at random', () => {
    const picked = selectQuestions(pool, 5, 'random', fixedRandom);
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((item) => item.id)).size).toBe(5);
  });

  it('never asks the same question twice', () => {
    const picked = selectQuestions(pool, 8, 'random', fixedRandom);
    expect(new Set(picked.map((item) => item.id)).size).toBe(picked.length);
  });

  it('spreads a balanced round across the difficulties', () => {
    const picked = selectQuestions(pool, 6, 'balanced', fixedRandom);
    expect(picked).toHaveLength(6);
    const counts = {
      easy: picked.filter((item) => item.difficulty === 'easy').length,
      medium: picked.filter((item) => item.difficulty === 'medium').length,
      hard: picked.filter((item) => item.difficulty === 'hard').length
    };
    expect(counts.easy).toBeGreaterThan(0);
    expect(counts.medium).toBeGreaterThan(0);
    expect(counts.hard).toBeGreaterThan(0);
  });

  it('makes up a thin difficulty from elsewhere rather than shortening the round', () => {
    // Only two hard questions exist, so a balanced round of eight has to borrow.
    const picked = selectQuestions(pool, 8, 'balanced', fixedRandom);
    expect(picked).toHaveLength(8);
    expect(new Set(picked.map((item) => item.id)).size).toBe(8);
  });

  it('gives what it has when the bank is smaller than the round', () => {
    expect(selectQuestions(pool, 20, 'random', fixedRandom)).toHaveLength(pool.length);
  });
});

describe('the countdown', () => {
  const serverTime = '2026-08-31T10:00:00.000Z';
  const deadline = '2026-08-31T10:00:20.000Z';

  it('measures against the server clock, not the device', () => {
    // A tablet three minutes fast must still show twenty seconds.
    const deviceNow = Date.parse(serverTime) + 180_000;
    expect(secondsRemaining(deadline, serverTime, deviceNow, deviceNow)).toBe(20);
  });

  it('counts down as real time passes', () => {
    const later = Date.parse(serverTime) + 5_000;
    expect(secondsRemaining(deadline, serverTime, Date.parse(serverTime), later)).toBe(15);
  });

  it('never goes below zero', () => {
    const long = Date.parse(serverTime) + 60_000;
    expect(secondsRemaining(deadline, serverTime, Date.parse(serverTime), long)).toBe(0);
  });

  it('says nothing when the round is not timed', () => {
    expect(secondsRemaining(null, serverTime)).toBeNull();
  });
});

describe('the suggested bonus', () => {
  it('rewards how much of the material a student had, in bands', () => {
    expect(suggestedBonus(1)).toBe(3);
    expect(suggestedBonus(0.8)).toBe(3);
    expect(suggestedBonus(0.7)).toBe(2);
    expect(suggestedBonus(0.5)).toBe(1);
    expect(suggestedBonus(0.2)).toBe(0);
  });

  it('never suggests a bonus for answering nothing', () => {
    expect(suggestedBonus(0)).toBe(0);
  });

  it('stays small, because a quiz is not an exam', () => {
    for (const band of BONUS_BANDS) expect(band.points).toBeLessThanOrEqual(3);
  });
});
