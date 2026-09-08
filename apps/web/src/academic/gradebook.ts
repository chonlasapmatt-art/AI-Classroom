import type { Activity, ActivityScore, Assignment, Setting, Student, Submission, TestRecord, TestScore, WorkType } from '../domain/types';
import { gradeForPercentage, gradeSchemeFrom, percentageOf, type GradeScheme } from './gradeScheme';

/**
 * Gradebook maths: category weights, per-category averages and the weighted total.
 *
 * This is the one place a total is computed. The dashboard, the scores screen, the gradebook, the
 * leaderboard, the parent portal and every report read their numbers from here, so a student's
 * average means the same thing on all of them. Weights are school settings, validated to add up to
 * 100; the late-work and missing-work policy is a school setting too.
 */
export type GradeCategory = 'homework' | 'assignment' | 'activity' | 'project' | 'test';

export const gradeCategories: GradeCategory[] = ['homework', 'assignment', 'activity', 'project', 'test'];

export const categoryLabels: Record<GradeCategory, string> = {
  homework: 'การบ้าน', assignment: 'งานที่มอบหมาย', activity: 'กิจกรรม', project: 'โครงงาน', test: 'สอบ'
};

export type CategoryWeights = Record<GradeCategory, number>;

export const defaultCategoryWeights: CategoryWeights = {
  homework: 20, assignment: 20, activity: 10, project: 20, test: 30
};

export function categoryWeightsFrom(settings: Setting[]): CategoryWeights {
  const stored = settings.find((item) => item.key === 'gradebook_weights')?.valueJson as Partial<CategoryWeights> | undefined;
  if (!stored) return defaultCategoryWeights;
  const weights = { ...defaultCategoryWeights };
  for (const category of gradeCategories) {
    const value = Number(stored[category]);
    if (Number.isFinite(value) && value >= 0) weights[category] = value;
  }
  return weights;
}

export function totalWeight(weights: CategoryWeights): number {
  return gradeCategories.reduce((sum, category) => sum + weights[category], 0);
}

export function weightsAreValid(weights: CategoryWeights): boolean {
  return Math.round(totalWeight(weights)) === 100;
}

/**
 * How late and missing work count.
 *
 * `latePenaltyPercent` is taken off the mark of a piece of work handed in late; `missingItem` says
 * whether unmarked work counts as zero or is left out of the average; `decimals` is how the total
 * is shown. The category weights used to sit beside these under a different name and with three
 * categories instead of five, so two screens could weigh the same marks differently. They live in
 * `gradebook_weights` only.
 */
export interface ScorePolicy { latePenaltyPercent: number; missingItem: 'zero' | 'exclude'; decimals: number }

export const defaultScorePolicy: ScorePolicy = { latePenaltyPercent: 10, missingItem: 'zero', decimals: 2 };

export function scorePolicyFrom(settings: Setting[]): ScorePolicy {
  const stored = settings.find((item) => item.key === 'score_policy')?.valueJson;
  if (!stored) return defaultScorePolicy;
  const penalty = Number(stored.latePenaltyPercent ?? defaultScorePolicy.latePenaltyPercent);
  const decimals = Number(stored.decimals ?? defaultScorePolicy.decimals);
  return {
    latePenaltyPercent: Number.isFinite(penalty) ? Math.min(100, Math.max(0, penalty)) : defaultScorePolicy.latePenaltyPercent,
    missingItem: stored.missingItem === 'exclude' ? 'exclude' : 'zero',
    decimals: Number.isFinite(decimals) ? Math.min(4, Math.max(0, Math.round(decimals))) : defaultScorePolicy.decimals
  };
}

/** Work types map onto gradebook categories; a test row comes from the tests table. */
export function categoryForWorkType(workType: WorkType): GradeCategory {
  return workType;
}

export interface CategoryResult { category: GradeCategory; earned: number; possible: number; percentage: number | null; weight: number }

export interface GradebookRow {
  student: Student;
  categories: CategoryResult[];
  percentage: number | null;
  grade: string | null;
  /** Pieces of work, activities and tests that counted towards the average. */
  itemCount: number;
}

export interface GradebookInput {
  students: Student[];
  works: Assignment[];
  submissions: Submission[];
  tests: TestRecord[];
  testScores: TestScore[];
  /** Published activities count in the activity category alongside activity-type work. */
  activities?: Activity[];
  activityScores?: ActivityScore[];
  weights?: CategoryWeights;
  scheme?: GradeScheme;
  policy?: ScorePolicy;
  /** Restricts the book to one subject when set. */
  subjectId?: string | null;
}

function emptyResult(category: GradeCategory, weight: number): CategoryResult {
  return { category, earned: 0, possible: 0, percentage: null, weight };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Builds one row per student. A category with no counted item is dropped from the average instead
 * of counting as zero, and its weight is redistributed across the categories that exist. A test
 * counts only once its scores are published; an unmarked piece of work counts as zero or is left
 * out, as the school's policy says; a late piece of work loses the policy's share of its mark.
 */
export function buildGradebook(input: GradebookInput): GradebookRow[] {
  const weights = input.weights ?? defaultCategoryWeights;
  const scheme = input.scheme ?? gradeSchemeFrom([]);
  const policy = input.policy ?? defaultScorePolicy;
  const inSubject = (subjectId: string | null) => !input.subjectId || subjectId === input.subjectId;
  const works = input.works.filter((work) =>
    work.status !== 'draft' && work.status !== 'cancelled' && !work.deletedAt && inSubject(work.subjectId));
  const tests = input.tests.filter((test) => !test.deletedAt && inSubject(test.subjectId));
  const activities = (input.activities ?? []).filter((activity) => activity.status === 'published' && !activity.deletedAt && inSubject(activity.subjectId));
  const activityScores = input.activityScores ?? [];

  return input.students.map((student) => {
    const results = new Map<GradeCategory, CategoryResult>(
      gradeCategories.map((category) => [category, emptyResult(category, weights[category])])
    );
    let itemCount = 0;

    const count = (category: GradeCategory, score: number | null | undefined, maxScore: number, late = false) => {
      if (!(maxScore > 0)) return;
      const bucket = results.get(category)!;
      if (score === null || score === undefined) {
        // Unmarked work still counts towards what was possible, so the average is honest — unless
        // the school chose to leave missing work out.
        if (policy.missingItem === 'exclude') return;
        bucket.possible += maxScore;
        itemCount += 1;
        return;
      }
      const penalised = late ? score * (1 - policy.latePenaltyPercent / 100) : score;
      bucket.earned += Math.min(maxScore, Math.max(0, penalised));
      bucket.possible += maxScore;
      itemCount += 1;
    };

    for (const work of works) {
      const submission = input.submissions.find((item) => item.assignmentId === work.id && item.studentId === student.id && !item.deletedAt);
      count(categoryForWorkType(work.workType), submission?.score, work.maxScore, submission?.isLate ?? false);
    }
    for (const activity of activities) {
      const score = activityScores.find((item) => item.activityId === activity.id && item.studentId === student.id && !item.deletedAt);
      count('activity', score?.score, activity.maxScore);
    }
    for (const test of tests) {
      const score = input.testScores.find((item) => item.testId === test.id && item.studentId === student.id && !item.deletedAt);
      if (!score?.publishedAt) continue;
      count('test', score.score ?? 0, test.maxScore);
    }

    const categories = [...results.values()].map((result) => ({
      ...result,
      percentage: result.possible > 0 ? Math.round((result.earned / result.possible) * 10000) / 100 : null
    }));

    const active = categories.filter((result) => result.percentage !== null && result.weight > 0);
    const activeWeight = active.reduce((sum, result) => sum + result.weight, 0);
    const percentage = activeWeight > 0
      ? roundTo(active.reduce((sum, result) => sum + result.percentage! * (result.weight / activeWeight), 0), policy.decimals)
      : null;

    return { student, categories, percentage, grade: gradeForPercentage(percentage, scheme), itemCount };
  });
}

/** Distribution used by the dashboards, expressed as whole percentages. */
export function gradeDistribution(rows: GradebookRow[], scheme: GradeScheme): Array<{ grade: string; count: number; share: number }> {
  const order = [...scheme.bands.map((band) => band.grade), scheme.belowGrade];
  const graded = rows.filter((row) => row.grade !== null);
  return order.map((grade) => {
    const count = graded.filter((row) => row.grade === grade).length;
    return { grade, count, share: graded.length === 0 ? 0 : Math.round((count / graded.length) * 100) };
  });
}

export { percentageOf };
