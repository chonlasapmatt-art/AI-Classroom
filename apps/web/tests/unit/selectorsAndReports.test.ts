import { describe, expect, it } from 'vitest';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import {
  assignmentState, attendanceSummary, classIdOfStudent, privacyPolicyFrom, rosterFor, scorePolicyFrom, standingsFor
} from '../../src/data/selectors';
import { buildReport, toCsv } from '../../src/features/reports/reportBuilders';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

const fixture = buildFixtureData();
const snapshot: SchoolSnapshot = fixture;
const classId = fixture.primaryClassId;

describe('snapshot selectors', () => {
  it('reads the score policy from settings', () => {
    const policy = scorePolicyFrom(snapshot.settings);
    expect(policy.weights.assignment + policy.weights.activity + policy.weights.test).toBe(100);
    expect(policy.latePenaltyPercent).toBe(10);
  });

  it('falls back to the default policy when the setting is missing', () => {
    expect(scorePolicyFrom([]).weights.assignment).toBe(60);
    expect(privacyPolicyFrom([]).showLeaderboardToStudents).toBe(true);
  });

  it('lists only actively enrolled students in a roster', () => {
    const roster = rosterFor(snapshot, classId);
    expect(roster.length).toBeGreaterThan(0);
    for (const student of roster) expect(classIdOfStudent(snapshot, student.id)).toBe(classId);
  });

  it('summarises attendance with a present rate that counts late as attended', () => {
    const summary = attendanceSummary(snapshot, { classId });
    expect(summary.total).toBe(summary.present + summary.late + summary.absent + summary.leave);
    expect(summary.presentRate).toBeCloseTo(Math.round(((summary.present + summary.late) / summary.total) * 1000) / 10, 5);
  });

  it('ranks standings from high to low with unique consecutive ranks', () => {
    const standings = standingsFor(snapshot, classId);
    expect(standings.length).toBe(rosterFor(snapshot, classId).length);
    expect(standings.map((entry) => entry.rank)).toEqual(standings.map((_, index) => index + 1));
    for (let index = 1; index < standings.length; index += 1) {
      expect(standings[index - 1]!.total).toBeGreaterThanOrEqual(standings[index]!.total);
    }
  });

  it('never lets an unpublished test leak into the total', () => {
    const draftTest = snapshot.tests.find((item) => item.status === 'draft')!;
    const withoutDraft: SchoolSnapshot = {
      ...snapshot,
      tests: snapshot.tests.filter((item) => item.id !== draftTest.id),
      testScores: snapshot.testScores.filter((item) => item.testId !== draftTest.id)
    };
    expect(standingsFor(withoutDraft, classId).map((entry) => entry.total))
      .toEqual(standingsFor(snapshot, classId).map((entry) => entry.total));
  });

  it('classifies assignment lifecycle states', () => {
    const now = new Date('2026-08-24T05:00:00Z');
    expect(assignmentState({ status: 'draft', dueAt: null }, now)).toBe('draft');
    expect(assignmentState({ status: 'closed', dueAt: null }, now)).toBe('closed');
    expect(assignmentState({ status: 'published', dueAt: '2026-08-23T09:00:00Z' }, now)).toBe('overdue');
    expect(assignmentState({ status: 'published', dueAt: '2026-08-25T09:00:00Z' }, now)).toBe('due-soon');
    expect(assignmentState({ status: 'published', dueAt: '2026-09-10T09:00:00Z' }, now)).toBe('published');
  });
});

describe('reports', () => {
  it('builds every report with matching column and row widths', () => {
    for (const id of ['student', 'class', 'attendance', 'score', 'grade', 'missing', 'at-risk'] as const) {
      const report = buildReport(id, snapshot, classId);
      expect(report.title.length).toBeGreaterThan(0);
      for (const row of report.rows) expect(row.length).toBe(report.columns.length);
    }
  });

  it('accounts for every student in the grade distribution', () => {
    const report = buildReport('grade', snapshot, classId);
    const total = report.rows.reduce((sum, row) => sum + Number(row[1]), 0);
    expect(total).toBe(rosterFor(snapshot, classId).length);
  });

  it('exports CSV with a BOM, CRLF rows and escaped separators', () => {
    const csv = toCsv({ id: 'student', title: 'x', columns: ['a', 'b'], rows: [['พลอย, ใจดี', 1]] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"พลอย, ใจดี"');
    expect(csv.split('\r\n')[0]).toContain('a,b');
  });
});
