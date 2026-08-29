import type { Assignment, Student, Submission, Subject } from '../domain/types';

/**
 * Advisory checks a teacher sees before publishing, plus the follow-up list on their dashboard.
 * Both are decision support: nothing here blocks a teacher or labels a student.
 */
export const WORKLOAD_WARNING_THRESHOLD = 3;

export interface WorkloadWarning {
  dueDate: string;
  count: number;
  subjects: string[];
  titles: string[];
}

function sameDay(isoA: string | null, isoB: string | null): boolean {
  if (!isoA || !isoB) return false;
  return isoA.slice(0, 10) === isoB.slice(0, 10);
}

/**
 * Counts the other published work already due for this class on the same day. Returns null when the
 * day is comfortable, so the caller can simply publish.
 */
export function workloadWarningFor(
  candidate: Pick<Assignment, 'id' | 'classId' | 'dueAt' | 'title' | 'subjectId'>,
  works: Assignment[],
  subjects: Subject[]
): WorkloadWarning | null {
  if (!candidate.dueAt) return null;
  const sameDayWorks = works.filter((work) =>
    work.id !== candidate.id &&
    work.classId === candidate.classId &&
    work.status === 'published' &&
    sameDay(work.dueAt, candidate.dueAt));

  const count = sameDayWorks.length + 1;
  if (count < WORKLOAD_WARNING_THRESHOLD) return null;

  const named = [...sameDayWorks, candidate as Assignment];
  const subjectNames = named
    .map((work) => subjects.find((subject) => subject.id === work.subjectId)?.name ?? 'ไม่ระบุวิชา');

  return {
    dueDate: candidate.dueAt.slice(0, 10),
    count,
    subjects: [...new Set(subjectNames)],
    titles: named.map((work) => work.title)
  };
}

export interface FollowUpInsight {
  student: Student;
  missingWork: number;
  lateSubmissions: number;
  unopenedWork: number;
  averagePercentage: number | null;
  averageChange: number | null;
}

/**
 * Students worth a teacher's attention, ranked by how much is piling up. Wording stays neutral:
 * this is a "should follow up" list, never a judgement about the student.
 */
export function followUpInsights(
  students: Student[],
  works: Assignment[],
  submissions: Submission[],
  limit = 5
): FollowUpInsight[] {
  const published = works.filter((work) => work.status === 'published' || work.status === 'closed');

  const insights = students.map((student) => {
    const own = submissions.filter((item) => item.studentId === student.id);
    const missingWork = published.filter((work) => {
      const submission = own.find((item) => item.assignmentId === work.id);
      return !submission || ['not_started', 'in_progress', 'assigned', 'draft', 'overdue'].includes(submission.status);
    }).length;
    const lateSubmissions = own.filter((item) => item.isLate).length;
    const unopenedWork = published.filter((work) => {
      const submission = own.find((item) => item.assignmentId === work.id);
      return !submission?.openedAt;
    }).length;

    const scored = own.filter((item) => item.percentage !== null);
    const average = scored.length > 0
      ? Math.round((scored.reduce((sum, item) => sum + (item.percentage ?? 0), 0) / scored.length) * 100) / 100
      : null;

    // Compare the most recent half of the marks with the earlier half to spot a downward trend.
    const ordered = [...scored].sort((a, b) => (a.gradedAt ?? a.updatedAt).localeCompare(b.gradedAt ?? b.updatedAt));
    const midpoint = Math.floor(ordered.length / 2);
    const earlier = ordered.slice(0, midpoint);
    const recent = ordered.slice(midpoint);
    const averageOf = (items: Submission[]) => items.length === 0
      ? null
      : items.reduce((sum, item) => sum + (item.percentage ?? 0), 0) / items.length;
    const earlierAverage = averageOf(earlier);
    const recentAverage = averageOf(recent);
    const averageChange = earlierAverage !== null && recentAverage !== null
      ? Math.round((recentAverage - earlierAverage) * 10) / 10
      : null;

    return { student, missingWork, lateSubmissions, unopenedWork, averagePercentage: average, averageChange };
  });

  return insights
    .filter((insight) => insight.missingWork > 0 || insight.lateSubmissions > 1 || (insight.averageChange ?? 0) < -5)
    .sort((a, b) => (b.missingWork + b.lateSubmissions) - (a.missingWork + a.lateSubmissions))
    .slice(0, limit);
}
