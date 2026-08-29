export type Category = 'assignment' | 'activity' | 'test';
export interface ScoreItem { category: Category; score: number | null; maxScore: number; published: boolean; excused?: boolean; late?: boolean; }
export interface ScorePolicy { weights: Record<Category, number>; latePenaltyPercent: number; missingItem: 'zero' | 'exclude'; decimals: number; }
export const defaultScorePolicy: ScorePolicy = { weights: { assignment: 60, activity: 30, test: 10 }, latePenaltyPercent: 10, missingItem: 'zero', decimals: 2 };

export function clampScore(value: number): number { return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0; }
export function round(value: number, decimals = 2): number { const factor = 10 ** decimals; return Math.round((value + Number.EPSILON) * factor) / factor; }
export function formatScore(value: number): string { return Number.isFinite(value) ? round(clampScore(value)).toFixed(2) : '0.00'; }
export function gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' { const value = clampScore(score); return value >= 80 ? 'A' : value >= 70 ? 'B' : value >= 60 ? 'C' : value >= 50 ? 'D' : 'F'; }

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
