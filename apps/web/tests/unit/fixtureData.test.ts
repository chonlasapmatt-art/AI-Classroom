import { describe, expect, it } from 'vitest';
import { buildFixtureData, FIXTURE_ACADEMIC_YEAR, FIXTURE_TERM, recentSchoolDays } from '../../src/data/fixtures/schoolFixture';

describe('development fixtures', () => {
  const data = buildFixtureData();

  it('describes academic year 2569 term 1', () => {
    expect(data.terms[0]?.academicYear).toBe(FIXTURE_ACADEMIC_YEAR);
    expect(data.terms[0]?.term).toBe(FIXTURE_TERM);
    expect(data.terms[0]?.status).toBe('active');
  });

  it('ships at least three teachers and three classes', () => {
    expect(data.teachers.length).toBeGreaterThanOrEqual(3);
    expect(data.classes.length).toBeGreaterThanOrEqual(3);
  });

  it('fills the primary class with 20-30 students', () => {
    const roster = data.enrollments.filter((item) => item.classId === data.primaryClassId);
    expect(roster.length).toBeGreaterThanOrEqual(20);
    expect(roster.length).toBeLessThanOrEqual(30);
  });

  it('covers every attendance status', () => {
    const statuses = new Set(data.attendance.map((item) => item.status));
    for (const status of ['present', 'late', 'absent', 'leave']) expect(statuses.has(status as never)).toBe(true);
  });

  it('is deterministic across builds', () => {
    const again = buildFixtureData();
    expect(again.attendance.map((item) => item.status)).toEqual(data.attendance.map((item) => item.status));
    expect(again.testScores.map((item) => item.score)).toEqual(data.testScores.map((item) => item.score));
  });

  it('never lands a school day on a weekend', () => {
    for (const day of recentSchoolDays(10)) {
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(weekday).toBeGreaterThan(0);
      expect(weekday).toBeLessThan(6);
    }
  });

  it('offers one membership per role for the preview role switcher', () => {
    expect(data.memberships.map((item) => item.role).sort()).toEqual(['admin', 'parent', 'student', 'teacher']);
  });

  it('keeps unpublished test scores unpublished', () => {
    const draftTest = data.tests.find((item) => item.status === 'draft');
    expect(draftTest).toBeDefined();
    const scores = data.testScores.filter((item) => item.testId === draftTest!.id);
    expect(scores.every((item) => item.publishedAt === null)).toBe(true);
  });
});
