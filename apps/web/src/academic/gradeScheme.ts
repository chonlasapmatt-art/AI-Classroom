import type { Setting } from '../domain/types';

/**
 * The single source of truth for turning a score into a grade.
 *
 * Thresholds live in school settings, never inside a component, so a school can change its scheme
 * without a code change and every screen keeps agreeing on the result.
 */
export interface GradeBand { grade: string; minPercentage: number; label: string }

export interface GradeScheme { bands: GradeBand[]; belowLabel: string; belowGrade: string }

export const defaultGradeScheme: GradeScheme = {
  bands: [
    { grade: 'A+', minPercentage: 95, label: 'ดีเยี่ยม' },
    { grade: 'A', minPercentage: 90, label: 'ดีมาก' },
    { grade: 'B', minPercentage: 80, label: 'ดี' },
    { grade: 'C', minPercentage: 70, label: 'พอใช้' }
  ],
  belowGrade: 'ต่ำกว่าเกณฑ์',
  belowLabel: 'ต่ำกว่าเกณฑ์'
};

export function gradeSchemeFrom(settings: Setting[]): GradeScheme {
  const stored = settings.find((item) => item.key === 'grade_scheme')?.valueJson;
  const bands = stored?.bands;
  if (!Array.isArray(bands) || bands.length === 0) return defaultGradeScheme;
  const parsed = bands
    .map((band) => band as Partial<GradeBand>)
    .filter((band): band is GradeBand => typeof band.grade === 'string' && typeof band.minPercentage === 'number')
    .map((band) => ({ grade: band.grade, minPercentage: band.minPercentage, label: band.label ?? band.grade }))
    .sort((a, b) => b.minPercentage - a.minPercentage);
  if (parsed.length === 0) return defaultGradeScheme;
  return {
    bands: parsed,
    belowGrade: String(stored?.belowGrade ?? defaultGradeScheme.belowGrade),
    belowLabel: String(stored?.belowLabel ?? defaultGradeScheme.belowLabel)
  };
}

/** Percentage of a score against its maximum, clamped and rounded to two decimals. */
export function percentageOf(score: number | null, maxScore: number): number | null {
  if (score === null || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return null;
  const clamped = Math.min(Math.max(score, 0), maxScore);
  return Math.round((clamped / maxScore) * 10000) / 100;
}

export function gradeForPercentage(percentage: number | null, scheme = defaultGradeScheme): string | null {
  if (percentage === null || !Number.isFinite(percentage)) return null;
  const band = scheme.bands.find((item) => percentage >= item.minPercentage);
  return band?.grade ?? scheme.belowGrade;
}

export interface GradeResult {
  score: number | null;
  percentage: number | null;
  calculatedGrade: string | null;
  finalGrade: string | null;
  overridden: boolean;
}

/**
 * Works out the grade to store. An override never erases the calculated grade — both are kept so
 * the history stays readable and an override can be lifted later.
 */
export function resolveGrade(
  score: number | null,
  maxScore: number,
  options: { override?: string | null; scheme?: GradeScheme } = {}
): GradeResult {
  const scheme = options.scheme ?? defaultGradeScheme;
  const percentage = percentageOf(score, maxScore);
  const calculatedGrade = gradeForPercentage(percentage, scheme);
  const override = options.override?.trim() ? options.override.trim() : null;
  return {
    score,
    percentage,
    calculatedGrade,
    finalGrade: override ?? calculatedGrade,
    overridden: Boolean(override)
  };
}

export class ScoreValidationError extends Error {}

/** Rejects anything that is not a real mark inside the allowed range. */
export function validateScore(value: number | null, maxScore: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new ScoreValidationError('คะแนนต้องเป็นตัวเลข');
  if (value < 0) throw new ScoreValidationError('คะแนนต้องไม่ติดลบ');
  if (value > maxScore) throw new ScoreValidationError(`คะแนนต้องไม่เกิน ${maxScore}`);
  return Math.round(value * 100) / 100;
}

/** Grade points on the Thai 4.00 scale, derived from the same percentage. */
export function gradePointFor(percentage: number | null): number {
  if (percentage === null) return 0;
  if (percentage >= 80) return 4;
  if (percentage >= 75) return 3.5;
  if (percentage >= 70) return 3;
  if (percentage >= 65) return 2.5;
  if (percentage >= 60) return 2;
  if (percentage >= 55) return 1.5;
  if (percentage >= 50) return 1;
  return 0;
}
