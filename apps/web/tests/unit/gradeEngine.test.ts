import { describe, expect, it } from 'vitest';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { classGradebook, rosterFor, standingsFor, subjectResultsFor } from '../../src/data/selectors';
import { buildGradebook, scorePolicyFrom } from '../../src/academic/gradebook';
import { gradeSchemeFrom } from '../../src/academic/gradeScheme';
import type { Activity, ActivityScore, Assignment, Setting, Student, Submission } from '../../src/domain/types';

// One engine. The scores page, the gradebook, the leaderboard, the dashboard, the parent portal and
// the reports used to compute a student's total two different ways, with two sets of weights and
// two sets of letters. These tests hold them to the same number.

const fixture = buildFixtureData();
const snapshot: SchoolSnapshot = fixture;
const classId = fixture.primaryClassId;

const stamp = '2026-06-01T00:00:00.000Z';
const base = { schoolId: 'school', version: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };
const student: Student = { ...base, id: 'st1', profileId: null, studentCode: '001', displayName: 'สมชาย', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' };
const work = (patch: Partial<Assignment> & { id: string }): Assignment => ({
  ...base, classId: 'class-1', subjectId: 'subject-1', workType: 'assignment', title: patch.id, description: '', instructions: '',
  assignedAt: stamp, startAt: null, dueAt: null, maxScore: 10, rubricId: null, reminderOffsets: [0], status: 'published',
  publishedAt: stamp, cancelledAt: null, ...patch
});
const submission = (patch: Partial<Submission> & { id: string; assignmentId: string }): Submission => ({
  ...base, studentId: 'st1', submittedAt: stamp, status: 'graded', score: null, isLate: false, teacherNote: '', studentNote: '',
  openedAt: null, acknowledgedAt: null, revisionNote: '', percentage: null, calculatedGrade: null, finalGrade: null,
  gradeOverrideReason: '', gradedBy: null, gradedAt: null, ...patch
});
const policySetting = (valueJson: Record<string, unknown>): Setting => ({ ...base, id: 'policy', scopeType: 'school', scopeId: null, key: 'score_policy', valueJson });

describe('every screen reads the same total', () => {
  it('gives the scores page the gradebook percentage and the scheme grade', () => {
    const rows = classGradebook(snapshot, classId, rosterFor(snapshot, classId));
    const scheme = gradeSchemeFrom(snapshot.settings);
    for (const standing of standingsFor(snapshot, classId)) {
      const row = rows.find((item) => item.student.id === standing.student.id)!;
      expect(standing.total).toBe(row.percentage ?? 0);
      expect(standing.grade).toBe(row.grade);
      if (standing.grade !== null) expect([...scheme.bands.map((band) => band.grade), scheme.belowGrade]).toContain(standing.grade);
    }
  });

  it('gives a subject result the same grade the subject gradebook shows', () => {
    const [first] = rosterFor(snapshot, classId);
    for (const result of subjectResultsFor(snapshot, first!.id, classId)) {
      const [row] = classGradebook(snapshot, classId, [first!], { subjectId: result.subject.id });
      expect(result.total).toBe(row!.percentage);
      expect(result.grade).toBe(row!.grade);
    }
  });
});

describe('the school policy inside the total', () => {
  it('takes the late penalty off a late piece of work', () => {
    const rows = buildGradebook({
      students: [student], works: [work({ id: 'w1' })], submissions: [submission({ id: 's1', assignmentId: 'w1', score: 10, isLate: true })],
      tests: [], testScores: [], policy: scorePolicyFrom([policySetting({ latePenaltyPercent: 25 })])
    });
    expect(rows[0]!.percentage).toBe(75);
  });

  it('counts unmarked work as zero, or leaves it out, as the policy says', () => {
    const works = [work({ id: 'w1' }), work({ id: 'w2' })];
    const submissions = [submission({ id: 's1', assignmentId: 'w1', score: 8 })];
    const zero = buildGradebook({ students: [student], works, submissions, tests: [], testScores: [], policy: scorePolicyFrom([policySetting({ missingItem: 'zero' })]) });
    expect(zero[0]!.percentage).toBe(40);
    const exclude = buildGradebook({ students: [student], works, submissions, tests: [], testScores: [], policy: scorePolicyFrom([policySetting({ missingItem: 'exclude' })]) });
    expect(exclude[0]!.percentage).toBe(80);
    expect(exclude[0]!.itemCount).toBe(1);
  });

  it('counts published activities in the activity category', () => {
    const activity: Activity = { ...base, id: 'a1', classId: 'class-1', subjectId: 'subject-1', title: 'กิจกรรม', activityDate: '2026-06-01', maxScore: 10, status: 'published' };
    const draft: Activity = { ...activity, id: 'a2', status: 'draft' };
    const score: ActivityScore = { ...base, id: 'as1', activityId: 'a1', studentId: 'st1', score: 5, note: '' };
    const rows = buildGradebook({ students: [student], works: [], submissions: [], tests: [], testScores: [], activities: [activity, draft], activityScores: [score] });
    const bucket = rows[0]!.categories.find((item) => item.category === 'activity')!;
    expect(bucket.percentage).toBe(50);
    expect(rows[0]!.percentage).toBe(50);
  });

  it('reads only the late and missing policy from the setting, never a second set of weights', () => {
    const policy = scorePolicyFrom([policySetting({ weights: { assignment: 100, activity: 0, test: 0 }, latePenaltyPercent: 150, decimals: 9 })]);
    expect(policy).toEqual({ latePenaltyPercent: 100, missingItem: 'zero', decimals: 4 });
    expect('weights' in policy).toBe(false);
  });

  it('shows nothing rather than a zero for a student nothing has been counted for', () => {
    const rows = buildGradebook({ students: [student], works: [], submissions: [], tests: [], testScores: [] });
    expect(rows[0]!.percentage).toBeNull();
    expect(rows[0]!.grade).toBeNull();
    const standing = standingsFor({ ...emptySnapshot, students: [student], enrollments: [{ ...base, id: 'e1', studentId: 'st1', classId: 'class-1', academicTermId: 'term-1', status: 'active', enrolledAt: stamp, leftAt: null }] }, 'class-1');
    expect(standing[0]!.grade).toBeNull();
    expect(standing[0]!.total).toBe(0);
  });
});
