export type Category = 'assignment' | 'activity' | 'test';
export interface ScoreItem { category: Category; score: number | null; maxScore: number; published: boolean; excused?: boolean; late?: boolean; }
export interface ScorePolicy { weights: Record<Category, number>; latePenaltyPercent: number; missingItem: 'zero' | 'exclude'; decimals: number; }
export const defaultScorePolicy: ScorePolicy = { weights: { assignment: 60, activity: 30, test: 10 }, latePenaltyPercent: 10, missingItem: 'zero', decimals: 2 };

export function clampScore(value: number): number { return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0; }
export function round(value: number, decimals = 2): number { const factor = 10 ** decimals; return Math.round((value + Number.EPSILON) * factor) / factor; }
export function formatScore(value: number): string { return Number.isFinite(value) ? round(clampScore(value)).toFixed(2) : '0.00'; }
/**
 * The grades a Thai school actually gives.
 *
 * Eight of them, as numbers, because that is what appears on a Thai report card and what a parent
 * reads at the end of a term: 4 at eighty per cent and a whole grade for every ten below it, with a
 * half grade at each midpoint for the mark that has nearly reached the next one. The letters this
 * used to return — A, B, C, D, F — are an American scale that nobody in the building uses, and a
 * child shown a "B" has to be told what it means before it means anything.
 *
 * `0` is the fail. It is a grade rather than the absence of one, which is why it is in the union.
 */
export type ThaiGrade = '4' | '3.5' | '3' | '2.5' | '2' | '1.5' | '1' | '0';

/** The mark below which a subject is not passed. */
export const FAILING_GRADE: ThaiGrade = '0';

export function isFailingGrade(grade: string): boolean { return grade === FAILING_GRADE; }

/**
 * The grade a percentage earns.
 *
 * The thresholds are the national ones and they are stated here rather than derived, because a
 * formula that happens to produce 1, 1.5, 2 … is a formula somebody will later "simplify" into one
 * that does not. Raw marks are untouched by any of this: a score is still 0–100, and this is only
 * how the school reads it.
 */
export function gradeFor(score: number): ThaiGrade {
  const value = clampScore(score);
  if (value >= 80) return '4';
  if (value >= 75) return '3.5';
  if (value >= 70) return '3';
  if (value >= 65) return '2.5';
  if (value >= 60) return '2';
  if (value >= 55) return '1.5';
  if (value >= 50) return '1';
  return '0';
}

export function calculateTotal(items: ScoreItem[], classAvailableCategories: Set<Category>, policy = defaultScorePolicy): number {
  const activeCategories = (Object.keys(policy.weights) as Category[]).filter((category) => classAvailableCategories.has(category));
  const activeWeight = activeCategories.reduce((sum, category) => sum + policy.weights[category], 0);
  if (activeWeight <= 0) return 0;
  let total = 0;
  for (const category of activeCategories) {
    const eligible = items.filter((item) => item.category === category && item.published && !item.excused && item.maxScore > 0);
    const denominator = eligible.reduce((sum, item) => sum + item.maxScore, 0);
    const numerator = eligible.reduce((sum, item) => {
      if (item.score === null && policy.missingItem === 'exclude') return sum;
      const raw = item.score ?? 0;
      const penalized = item.late ? raw * (1 - policy.latePenaltyPercent / 100) : raw;
      return sum + Math.min(item.maxScore, Math.max(0, penalized));
    }, 0);
    const percent = denominator > 0 ? (numerator / denominator) * 100 : 0;
    total += percent * (policy.weights[category] / activeWeight);
  }
  return round(clampScore(total), policy.decimals);
}
