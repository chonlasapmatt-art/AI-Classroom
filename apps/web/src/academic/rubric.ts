import type { Rubric, RubricCriterion, RubricScore } from '../domain/types';
import { ScoreValidationError, validateScore } from './gradeScheme';

/** Rubric maths. A rubric's maximum is the sum of its criteria, so the two can never drift apart. */
export function rubricMaxScore(rubric: Pick<Rubric, 'criteria'>): number {
  return rubric.criteria.reduce((total, criterion) => total + Math.max(0, criterion.maxScore), 0);
}

export interface CriterionEntry { criterionId: string; score: number | null; comment?: string }

/** Sums the entered criteria, validating each one against its own maximum. */
export function rubricTotal(rubric: Pick<Rubric, 'criteria'>, entries: CriterionEntry[]): number | null {
  let total = 0;
  let scored = false;
  for (const criterion of rubric.criteria) {
    const entry = entries.find((item) => item.criterionId === criterion.id);
    if (!entry || entry.score === null) continue;
    validateScore(entry.score, criterion.maxScore);
    total += entry.score;
    scored = true;
  }
  return scored ? Math.round(total * 100) / 100 : null;
}

export function rubricTotalFromScores(rubric: Pick<Rubric, 'criteria'>, scores: RubricScore[]): number | null {
  return rubricTotal(rubric, scores.map((item) => ({ criterionId: item.criterionId, score: item.score })));
}

/** Every criterion has to carry a label and a positive maximum, or the rubric cannot be used. */
export function validateRubric(criteria: RubricCriterion[]): RubricCriterion[] {
  if (criteria.length === 0) throw new ScoreValidationError('เกณฑ์การให้คะแนนต้องมีอย่างน้อย 1 ข้อ');
  const seen = new Set<string>();
  return criteria.map((criterion) => {
    const label = criterion.label.trim();
    if (!label) throw new ScoreValidationError('ทุกเกณฑ์ต้องมีชื่อ');
    if (!Number.isFinite(criterion.maxScore) || criterion.maxScore <= 0) {
      throw new ScoreValidationError(`เกณฑ์ "${label}" ต้องมีคะแนนเต็มมากกว่า 0`);
    }
    if (seen.has(criterion.id)) throw new ScoreValidationError('รหัสเกณฑ์ซ้ำกัน');
    seen.add(criterion.id);
    return { ...criterion, label, description: criterion.description.trim() };
  });
}

/** A work scored by rubric must have a maximum that matches the rubric total. */
export function rubricMatchesWork(rubric: Pick<Rubric, 'criteria'>, workMaxScore: number): boolean {
  return rubricMaxScore(rubric) === workMaxScore;
}
