import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { standardSubjects } from '../../src/data/subjectCatalog';
import {
  activeSubjects, gradePoint, gradePointAverage, missingSubmitters, rosterFor, subjectResultsFor, unreadNotifications
} from '../../src/data/selectors';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function currentSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let captured: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((snapshot) => { captured = snapshot; });
  unsubscribe();
  if (!captured) throw new Error('repository did not publish a snapshot');
  return captured;
}

describe('subjects', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('seeds the eight standard learning areas', () => {
    const snapshot = currentSnapshot(repository);
    expect(snapshot.subjects).toHaveLength(8);
    expect(snapshot.subjects.map((item) => item.code).sort()).toEqual(standardSubjects.map((item) => item.code).sort());
  });

  it('lets a school add its own subject and archive it later', async () => {
    await repository.saveSubject({ id: 'subject-robotics', code: 'RB', name: 'วิทยาการหุ่นยนต์', colorIndex: 2, iconKey: 'code' });
    let snapshot = currentSnapshot(repository);
    expect(activeSubjects(snapshot).some((item) => item.code === 'RB')).toBe(true);

    await repository.archiveSubject('subject-robotics');
    snapshot = currentSnapshot(repository);
    expect(activeSubjects(snapshot).some((item) => item.code === 'RB')).toBe(false);
    expect(snapshot.subjects.find((item) => item.id === 'subject-robotics')?.status).toBe('archived');
  });

  it('reports grades per subject and a GPA on the 4.00 scale', () => {
    const snapshot = currentSnapshot(repository);
    const student = rosterFor(snapshot, repository.primaryClassId)[0]!;
    const results = subjectResultsFor(snapshot, student.id, repository.primaryClassId);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(result.itemCount).toBeGreaterThan(0);
    const gpa = gradePointAverage(results);
    expect(gpa).toBeGreaterThanOrEqual(0);
    expect(gpa).toBeLessThanOrEqual(4);
    expect(gradePoint(85)).toBe(4);
    expect(gradePoint(49)).toBe(0);
  });
});

describe('assign, remind, turn in, return', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('publishing hands every student a submission row and a notification', async () => {
    const before = currentSnapshot(repository);
    const draft = before.assignments.find((item) => item.status === 'draft')!;
    const roster = rosterFor(before, repository.primaryClassId);

    await repository.publishAssignment(draft.id, roster.map((student) => student.id));
    const after = currentSnapshot(repository);

    expect(after.assignments.find((item) => item.id === draft.id)?.status).toBe('published');
    expect(after.submissions.filter((item) => item.assignmentId === draft.id)).toHaveLength(roster.length);
    const notices = after.notifications.filter((item) => item.assignmentId === draft.id && item.kind === 'assignment_published');
    expect(notices).toHaveLength(roster.length);
  });

  it('reminds only the students who have not turned in', async () => {
    const before = currentSnapshot(repository);
    const draft = before.assignments.find((item) => item.status === 'draft')!;
    const roster = rosterFor(before, repository.primaryClassId);
    await repository.publishAssignment(draft.id, roster.map((student) => student.id));

    const first = roster[0]!;
    await repository.submitWork(draft.id, first.id, 'ส่งแล้วครับ', false);

    const snapshot = currentSnapshot(repository);
    const pending = missingSubmitters(snapshot, draft.id, roster);
    expect(pending).toHaveLength(roster.length - 1);
    expect(pending.some((student) => student.id === first.id)).toBe(false);

    await repository.notifyStudents({
      studentIds: pending.map((student) => student.id), classId: repository.primaryClassId,
      assignmentId: draft.id, kind: 'submission_reminder', title: 'เตือนส่งงาน', body: 'กรุณาส่งงาน'
    });
    const reminded = currentSnapshot(repository).notifications.filter((item) => item.kind === 'submission_reminder' && item.assignmentId === draft.id);
    expect(reminded).toHaveLength(pending.length);
  });

  it('marks a late turn-in and notifies the student when work is returned', async () => {
    const before = currentSnapshot(repository);
    // A work whose deadline has already passed: lateness is derived from the deadline, never passed in.
    const assignment = before.assignments.find((item) => item.dueAt && Date.parse(item.dueAt) < Date.now())!;
    const student = rosterFor(before, repository.primaryClassId)[1]!;

    await repository.submitWork(assignment.id, student.id, 'ส่งช้าครับ', false);
    let snapshot = currentSnapshot(repository);
    let submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id)!;
    expect(submission.status).toBe('late');
    expect(submission.isLate).toBe(true);
    expect(submission.submittedAt).not.toBeNull();

    await repository.returnWork(assignment.id, student.id, 25, 'ทำได้ดี');
    snapshot = currentSnapshot(repository);
    submission = snapshot.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === student.id)!;
    expect(submission.status).toBe('returned');
    expect(submission.score).toBe(25);
    expect(unreadNotifications(snapshot, student.id).some((item) => item.kind === 'work_returned')).toBe(true);
  });

  it('marks a notification as read', async () => {
    const before = currentSnapshot(repository);
    const notification = before.notifications.find((item) => !item.readAt)!;
    await repository.markNotificationRead(notification.id);
    const after = currentSnapshot(repository);
    expect(after.notifications.find((item) => item.id === notification.id)?.readAt).not.toBeNull();
  });
});

describe('attachments', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('stores, reads back and deletes a file for one owner', async () => {
    const file = new File(['หัวข้อ,คะแนน\nงานที่ 1,10'], 'worksheet.csv', { type: 'text/csv' });
    await repository.addAttachment({ ownerType: 'assignment', ownerId: 'fixture-assignment-2', file, uploadedBy: 'preview-teacher' });

    const snapshot = currentSnapshot(repository);
    const stored = snapshot.attachments.find((item) => item.fileName === 'worksheet.csv')!;
    expect(stored.kind).toBe('csv');
    expect(stored.ownerId).toBe('fixture-assignment-2');
    expect(await repository.openAttachment(stored.id)).toBeInstanceOf(Blob);

    await repository.removeAttachment(stored.id);
    expect(currentSnapshot(repository).attachments.some((item) => item.id === stored.id)).toBe(false);
    expect(await repository.openAttachment(stored.id)).toBeNull();
  });

  it('refuses a file over the size limit', async () => {
    const big = new File([new Uint8Array(16 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    await expect(repository.addAttachment({ ownerType: 'submission', ownerId: 'x', file: big, uploadedBy: 'preview-student' }))
      .rejects.toThrow('ไฟล์ใหญ่เกิน 15 MB');
  });
});
