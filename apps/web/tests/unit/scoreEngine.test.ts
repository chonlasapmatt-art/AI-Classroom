import { describe, expect, it } from 'vitest';
import { calculateTotal, clampScore, formatScore, gradeFor } from '../../src/features/scores/scoreEngine';

describe('score engine', () => {
  it.each([[80,'A'],[70,'B'],[60,'C'],[50,'D'],[49.99,'F']] as const)('grades %s as %s', (score, grade) => expect(gradeFor(score)).toBe(grade));
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
