import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function snapshotOf(repository: FixtureSchoolRepository): SchoolSnapshot {
  let snapshot: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((next) => { snapshot = next; });
  unsubscribe();
  if (!snapshot) throw new Error('fixture snapshot unavailable');
  return snapshot;
}

describe('Google Drive turn-in flow', () => {
  let repository: FixtureSchoolRepository;

  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('stores a Drive link on the submission head and keeps the late calculation', async () => {
    const before = snapshotOf(repository);
    const assignment = before.assignments.find((item) => item.status === 'published' && item.dueAt)!;
    const student = before.students[0]!;

    await repository.submitWork(assignment.id, student.id, 'ส่งจาก Google Drive', false, ' https://drive.google.com/file/d/demo/view ');

    const submission = snapshotOf(repository).submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id)!;
    expect(submission.driveUrl).toBe('https://drive.google.com/file/d/demo/view');
    expect(['submitted', 'late', 'resubmitted']).toContain(submission.status);
    expect(submission.submittedAt).toBeTruthy();
  });

  it('rejects an unsafe external link before it can enter the submission record', async () => {
    const before = snapshotOf(repository);
    const assignment = before.assignments.find((item) => item.status === 'published')!;
    const student = before.students[0]!;

    await expect(repository.submitWork(assignment.id, student.id, '', false, 'https://example.com/file')).rejects.toThrow('Google Drive');
    expect(snapshotOf(repository).submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id)?.driveUrl).not.toBe('https://example.com/file');
  });
});
