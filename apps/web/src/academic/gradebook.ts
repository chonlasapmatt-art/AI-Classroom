import type { Assignment, Setting, Student, Submission, TestRecord, TestScore, WorkType } from '../domain/types';
import { gradeForPercentage, gradeSchemeFrom, percentageOf, type GradeScheme } from './gradeScheme';

/**
 * Gradebook maths: category weights, per-category averages and the weighted total.
 *
 * Weights are school settings, validated to add up to 100, so a term average always means the same
 * thing on the teacher screen, the student screen and the exported report.
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
}

export interface GradebookInput {
  students: Student[];
  works: Assignment[];
  submissions: Submission[];
  tests: TestRecord[];
  testScores: TestScore[];
  weights?: CategoryWeights;
  scheme?: GradeScheme;
  /** Restricts the book to one subject when set. */
  subjectId?: string | null;
}

function emptyResult(category: GradeCategory, weight: number): CategoryResult {
  return { category, earned: 0, possible: 0, percentage: null, weight };
}

/**
 * Builds one row per student. A category with no published work is dropped from the average
 * instead of counting as zero, and its weight is redistributed across the categories that exist.
 */
export function buildGradebook(input: GradebookInput): GradebookRow[] {
  const weights = input.weights ?? defaultCategoryWeights;
  const scheme = input.scheme ?? gradeSchemeFrom([]);
  const works = input.works.filter((work) =>
    work.status !== 'draft' && work.status !== 'cancelled' &&
    (!input.subjectId || work.subjectId === input.subjectId));
  const tests = input.tests.filter((test) => !input.subjectId || test.subjectId === input.subjectId);

  return input.students.map((student) => {
    const results = new Map<GradeCategory, CategoryResult>(
      gradeCategories.map((category) => [category, emptyResult(category, weights[category])])
    );

    for (const work of works) {
      const category = categoryForWorkType(work.workType);
      const bucket = results.get(category)!;
      const submission = input.submissions.find((item) => item.assignmentId === work.id && item.studentId === student.id);
      if (submission?.score === null || submission?.score === undefined) {
        // Unmarked work still counts towards what was possible, so the average is honest.
        bucket.possible += work.maxScore;
        continue;
      }
      bucket.earned += submission.score;
      bucket.possible += work.maxScore;
    }

    for (const test of tests) {
      const score = input.testScores.find((item) => item.testId === test.id && item.studentId === student.id);
      if (!score?.publishedAt) continue;
      const bucket = results.get('test')!;
      bucket.earned += score.score ?? 0;
      bucket.possible += test.maxScore;
    }

    const categories = [...results.values()].map((result) => ({
      ...result,
      percentage: result.possible > 0 ? Math.round((result.earned / result.possible) * 10000) / 100 : null
    }));

    const active = categories.filter((result) => result.percentage !== null && result.weight > 0);
    const activeWeight = active.reduce((sum, result) => sum + result.weight, 0);
    const percentage = activeWeight > 0
      ? Math.round(active.reduce((sum, result) => sum + result.percentage! * (result.weight / activeWeight), 0) * 100) / 100
      : null;

    return { student, categories, percentage, grade: gradeForPercentage(percentage, scheme) };
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
