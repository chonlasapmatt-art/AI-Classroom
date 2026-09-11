import { describe, expect, it } from 'vitest';
import { calculateTotal, clampScore, formatScore, gradeFor, isFailingGrade } from '../../src/features/scores/scoreEngine';

/*
 * Grades are numbers, because a Thai report card says numbers.
 *
 * This used to return A, B, C, D, F — an American scale nobody in the building uses, and one that
 * disagreed with the grade points the same app was already awarding from the same percentage. Every
 * boundary of the national scale is checked, including both sides of each one: a threshold that is
 * off by a tenth is a child who is told they got a 2 when they got a 2.5.
 */
describe('score engine', () => {
  it.each([
    [100, '4'], [80, '4'], [79.99, '3.5'], [75, '3.5'], [74.99, '3'], [70, '3'],
    [69.99, '2.5'], [65, '2.5'], [64.99, '2'], [60, '2'], [59.99, '1.5'], [55, '1.5'],
    [54.99, '1'], [50, '1'], [49.99, '0'], [0, '0']
  ] as const)('grades %s as %s', (score, grade) => expect(gradeFor(score)).toBe(grade));

  it('calls only the fail a fail', () => {
    expect(isFailingGrade(gradeFor(49.99))).toBe(true);
    expect(isFailingGrade(gradeFor(50))).toBe(false);
  });
  it('normalizes weights when the whole class has no test category', () => {
    const result = calculateTotal([{ category:'assignment',score:80,maxScore:100,published:true },{ category:'activity',score:90,maxScore:100,published:true }],new Set(['assignment','activity']));
    expect(result).toBe(83.33);
  });
  it('applies missing item as zero without student-specific reweighting', () => {
    const result = calculateTotal([{ category:'assignment',score:80,maxScore:100,published:true },{ category:'assignment',score:null,maxScore:100,published:true }],new Set(['assignment']));
    expect(result).toBe(40);
  });
  it('handles invalid values deterministically', () => { expect(clampScore(Number.NaN)).toBe(0); expect(clampScore(120)).toBe(100); expect(formatScore(Number.POSITIVE_INFINITY)).toBe('0.00'); });
});
