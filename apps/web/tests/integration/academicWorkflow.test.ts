import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import { rosterFor } from '../../src/data/selectors';
import { acknowledgementSummary, notificationEntries, unreadCount } from '../../src/academic/views';
import { effectiveDueAt } from '../../src/academic/workStatus';

function snapshotOf(repository: FixtureSchoolRepository): SchoolSnapshot {
  let captured: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((snapshot) => { captured = snapshot; });
  unsubscribe();
  if (!captured) throw new Error('repository did not publish a snapshot');
  return captured;
}

const hourFromNow = () => new Date(Date.now() + 3_600_000).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function createPublishedWork(repository: FixtureSchoolRepository, overrides: Partial<{
  id: string; title: string; dueAt: string; maxScore: number; rubricId: string | null; workType: 'assignment' | 'homework' | 'project' | 'activity';
}> = {}) {
  const snapshot = snapshotOf(repository);
  const roster = rosterFor(snapshot, repository.primaryClassId);
  const id = overrides.id ?? `work-${Math.random().toString(36).slice(2, 8)}`;
  await repository.saveAssignment({
    id,
    classId: repository.primaryClassId,
    subjectId: snapshot.subjects[0]!.id,
    workType: overrides.workType ?? 'assignment',
    title: overrides.title ?? 'งานทดสอบ',
    description: '',
    instructions: 'ทำในสมุดแล้วส่งในระบบ',
    dueAt: overrides.dueAt ?? daysFromNow(3),
    maxScore: overrides.maxScore ?? 20,
    rubricId: overrides.rubricId ?? null,
    reminderOffsets: [0, 1440, 180],
    status: 'draft'
  });
  await repository.publishAssignment(id, roster.map((student) => student.id));
  return { id, roster };
}

describe('publishing and reminders', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('a draft notifies nobody until it is published', async () => {
    const before = snapshotOf(repository);
    await repository.saveAssignment({
      id: 'draft-1', classId: repository.primaryClassId, subjectId: null, workType: 'homework',
      title: 'ฉบับร่าง', description: '', dueAt: daysFromNow(2), maxScore: 10, status: 'draft'
    });
    const after = snapshotOf(repository);
    expect(after.assignments.find((item) => item.id === 'draft-1')?.status).toBe('draft');
    expect(after.notifications.filter((item) => item.assignmentId === 'draft-1')).toHaveLength(0);
    expect(after.notifications.length).toBe(before.notifications.length);
  });

  it('publishing schedules reminders once and never duplicates them', async () => {
    const { id, roster } = await createPublishedWork(repository);
    const first = snapshotOf(repository);
    const scheduled = first.notifications.filter((item) => item.assignmentId === id && item.state === 'scheduled');
    expect(scheduled.length).toBe(roster.length * 2);
    expect(new Set(scheduled.map((item) => item.dedupeKey)).size).toBe(scheduled.length);

    // Publishing again (a retry, or another device replaying the action) must be idempotent.
    await repository.publishAssignment(id, roster.map((student) => student.id));
    const second = snapshotOf(repository);
    expect(second.notifications.filter((item) => item.assignmentId === id).length)
      .toBe(first.notifications.filter((item) => item.assignmentId === id).length);
    expect(second.submissions.filter((item) => item.assignmentId === id).length).toBe(roster.length);
  });

  it('moving the deadline tells the class and rebuilds the schedule', async () => {
    const { id } = await createPublishedWork(repository, { dueAt: daysFromNow(5) });
    await repository.saveAssignment({
      id, classId: repository.primaryClassId, subjectId: null, workType: 'assignment',
      title: 'งานทดสอบ', description: '', dueAt: daysFromNow(7), maxScore: 20, status: 'published'
    });
    const snapshot = snapshotOf(repository);
    expect(snapshot.notifications.some((item) => item.assignmentId === id && item.kind === 'deadline_changed')).toBe(true);
    expect(snapshot.academicAudit.some((item) => item.action === 'DEADLINE_CHANGED' && item.assignmentId === id)).toBe(true);
  });

  it('cancelling stops every pending reminder and tells the class once', async () => {
    const { id, roster } = await createPublishedWork(repository);
    await repository.cancelAssignment(id, 'เลื่อนไปทำในคาบเรียน', 'preview-teacher');
    const snapshot = snapshotOf(repository);
    expect(snapshot.assignments.find((item) => item.id === id)?.status).toBe('cancelled');
    expect(snapshot.notifications.filter((item) => item.assignmentId === id && item.state === 'scheduled')).toHaveLength(0);
    expect(snapshot.notifications.filter((item) => item.assignmentId === id && item.kind === 'work_cancelled')).toHaveLength(roster.length);
    expect(snapshot.academicAudit.some((item) => item.action === 'ASSIGNMENT_CANCELLED')).toBe(true);
  });

  it('a student who submits early stops receiving that work reminders', async () => {
    const { id, roster } = await createPublishedWork(repository);
    const student = roster[0]!;
    await repository.submitWork(id, student.id, 'ส่งก่อนกำหนด', false);
    const snapshot = snapshotOf(repository);
    expect(snapshot.notifications.filter((item) =>
      item.assignmentId === id && item.studentId === student.id && item.state === 'scheduled')).toHaveLength(0);
    expect(snapshot.notifications.some((item) =>
      item.assignmentId === id && item.studentId !== student.id && item.state === 'scheduled')).toBe(true);
  });

  it('delivers reminders only once their time has come', async () => {
    const { id } = await createPublishedWork(repository, { dueAt: hourFromNow() });
    const beforeDelivery = snapshotOf(repository).notifications.filter((item) => item.assignmentId === id && item.state === 'scheduled');
    expect(beforeDelivery.length).toBe(0); // one hour away: both offsets are already in the past

    const { id: later } = await createPublishedWork(repository, { dueAt: daysFromNow(2) });
    const delivered = await repository.deliverDueReminders(new Date(Date.now() + 3 * 86_400_000));
    expect(delivered).toBeGreaterThan(0);
    const snapshot = snapshotOf(repository);
    expect(snapshot.notifications.filter((item) => item.assignmentId === later && item.state === 'scheduled')).toHaveLength(0);
  });
});

describe('acknowledgement and submissions', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('records opening and acknowledging separately', async () => {
    const { id, roster } = await createPublishedWork(repository);
    const [first, second] = roster;

    await repository.markWorkOpened(id, first!.id);
    await repository.acknowledgeWork(id, second!.id);

    const snapshot = snapshotOf(repository);
    const summary = acknowledgementSummary(snapshot, id, roster);
    expect(summary.notified).toBe(roster.length);
    expect(summary.opened).toBe(2);
    expect(summary.acknowledged).toBe(1);
    expect(summary.unopened).toBe(roster.length - 2);

    const acknowledged = snapshot.submissions.find((item) => item.assignmentId === id && item.studentId === second!.id);
    expect(acknowledged?.acknowledgedAt).not.toBeNull();
    expect(snapshot.submissions.find((item) => item.assignmentId === id && item.studentId === first!.id)?.acknowledgedAt).toBeNull();
  });

  it('keeps every submitted version instead of overwriting', async () => {
    const { id, roster } = await createPublishedWork(repository);
    const student = roster[0]!;

    await repository.submitWork(id, student.id, 'ส่งครั้งแรก', false);
    await repository.requestRevision(id, student.id, 'แก้ส่วนสรุปและส่งใหม่', 'preview-teacher');
    await repository.submitWork(id, student.id, 'แก้ตามที่ครูบอกแล้ว', false);

    const snapshot = snapshotOf(repository);
    const versions = snapshot.submissionVersions
      .filter((item) => item.assignmentId === id && item.studentId === student.id)
      .sort((a, b) => a.versionNumber - b.versionNumber);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.studentNote).toBe('ส่งครั้งแรก');
    expect(versions[1]!.studentNote).toBe('แก้ตามที่ครูบอกแล้ว');

    const head = snapshot.submissions.find((item) => item.assignmentId === id && item.studentId === student.id)!;
    expect(head.version).toBe(2);
    expect(head.status).toBe('resubmitted');
    expect(snapshot.academicAudit.some((item) => item.action === 'REVISION_REQUESTED')).toBe(true);
  });

  it('marks a submission late against the student personal deadline', async () => {
    const { id, roster } = await createPublishedWork(repository, { dueAt: daysFromNow(2) });
    const [onTime, extended] = roster;

    // A deadline that has already passed for this one student only.
    await repository.grantExtension(id, extended!.id, new Date(Date.now() - 3_600_000).toISOString(), 'ลาป่วย', 'preview-teacher');

    await repository.submitWork(id, onTime!.id, '', false);
    await repository.submitWork(id, extended!.id, '', false);

    const snapshot = snapshotOf(repository);
    const work = snapshot.assignments.find((item) => item.id === id)!;
    expect(effectiveDueAt(work, extended!.id, snapshot.deadlineExtensions)).not.toBe(work.dueAt);
    expect(snapshot.submissions.find((item) => item.assignmentId === id && item.studentId === onTime!.id)?.isLate).toBe(false);
    expect(snapshot.submissions.find((item) => item.assignmentId === id && item.studentId === extended!.id)?.isLate).toBe(true);
    expect(snapshot.academicAudit.some((item) => item.action === 'STUDENT_EXTENSION_CREATED')).toBe(true);
  });
});

describe('scoring, rubric and grade override', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('scores with a simple mark and derives percentage and grade', async () => {
    const { id, roster } = await createPublishedWork(repository, { maxScore: 20 });
    const student = roster[0]!;
    await repository.submitWork(id, student.id, '', false);
    await repository.scoreSubmission({ assignmentId: id, studentId: student.id, score: 18, teacherNote: 'เนื้อหาดีมาก', gradedBy: 'preview-teacher' });

    const submission = snapshotOf(repository).submissions.find((item) => item.assignmentId === id && item.studentId === student.id)!;
    expect(submission.score).toBe(18);
    expect(submission.percentage).toBe(90);
    expect(submission.calculatedGrade).toBe('A');
    expect(submission.finalGrade).toBe('A');
    expect(submission.status).toBe('graded');
    expect(submission.gradedBy).toBe('preview-teacher');
  });

  it('scores through a rubric and adds the criteria up', async () => {
    const snapshot = snapshotOf(repository);
    const rubric = snapshot.rubrics[0]!;
    const { id, roster } = await createPublishedWork(repository, { rubricId: rubric.id, maxScore: 50 });
    const student = roster[0]!;

    await repository.scoreSubmission({
      assignmentId: id, studentId: student.id, gradedBy: 'preview-teacher',
      rubricEntries: [
        { criterionId: 'content', score: 22 },
        { criterionId: 'accuracy', score: 13 },
        { criterionId: 'presentation', score: 9 }
      ]
    });

    const after = snapshotOf(repository);
    const submission = after.submissions.find((item) => item.assignmentId === id && item.studentId === student.id)!;
    expect(submission.score).toBe(44);
    expect(after.rubricScores.filter((item) => item.assignmentId === id && item.studentId === student.id)).toHaveLength(3);
  });

  it('an override keeps the calculated grade and demands a reason', async () => {
    const { id, roster } = await createPublishedWork(repository, { maxScore: 20 });
    const student = roster[0]!;
    await repository.scoreSubmission({ assignmentId: id, studentId: student.id, score: 17, gradedBy: 'preview-teacher' });

    await expect(repository.overrideGrade(id, student.id, 'A', '   ', 'preview-teacher'))
      .rejects.toThrow('ต้องระบุเหตุผลในการปรับเกรด');

    await repository.overrideGrade(id, student.id, 'A', 'ส่งผลงานเพิ่มเติมและผ่านเกณฑ์', 'preview-teacher');
    const submission = snapshotOf(repository).submissions.find((item) => item.assignmentId === id && item.studentId === student.id)!;
    expect(submission.calculatedGrade).toBe('B');
    expect(submission.finalGrade).toBe('A');
    expect(submission.gradeOverrideReason).toContain('ผ่านเกณฑ์');

    const audit = snapshotOf(repository).academicAudit.filter((item) => item.action === 'GRADE_OVERRIDE');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.newValue).toBe('A');

    await repository.overrideGrade(id, student.id, null, '', 'preview-teacher');
    const cleared = snapshotOf(repository).submissions.find((item) => item.assignmentId === id && item.studentId === student.id)!;
    expect(cleared.finalGrade).toBe('B');
    expect(snapshotOf(repository).academicAudit.some((item) => item.action === 'GRADE_OVERRIDE_REMOVED')).toBe(true);
  });

  it('refuses a score outside the allowed range', async () => {
    const { id, roster } = await createPublishedWork(repository, { maxScore: 20 });
    await expect(repository.scoreSubmission({ assignmentId: id, studentId: roster[0]!.id, score: 25, gradedBy: 'preview-teacher' }))
      .rejects.toThrow('คะแนนต้องไม่เกิน 20');
    await expect(repository.scoreSubmission({ assignmentId: id, studentId: roster[0]!.id, score: -2, gradedBy: 'preview-teacher' }))
      .rejects.toThrow('คะแนนต้องไม่ติดลบ');
  });
});

describe('avatars, announcements and preferences', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('lets a student, a teacher and a parent set their own avatar', async () => {
    await repository.saveOwnAvatar('preview-student', 'student', 'avatar_042');
    await repository.saveOwnAvatar('preview-teacher', 'teacher', 'avatar_007');
    const snapshot = snapshotOf(repository);
    expect(snapshot.students.find((item) => item.profileId === 'preview-student')?.avatarId).toBe('avatar_042');
    expect(snapshot.teachers.find((item) => item.profileId === 'preview-teacher')?.avatarId).toBe('avatar_007');

    const parentLine = snapshot.parentLinks.find((item) => item.lineUserId)!;
    await repository.saveOwnAvatar(parentLine.lineUserId!, 'parent', 'avatar_055');
    expect(snapshotOf(repository).parentLinks.find((item) => item.id === parentLine.id)?.avatarId).toBe('avatar_055');
    await repository.saveOwnAvatar('preview-parent', 'parent', 'avatar_088');
    expect(snapshotOf(repository).parentLinks.find((item) => item.profileId === 'preview-parent')?.avatarId).toBe('avatar_088');
  });

  it('refuses to touch somebody else and rejects an unknown avatar', async () => {
    await expect(repository.saveOwnAvatar('someone-else', 'student', 'avatar_001'))
      .rejects.toThrow('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
    await expect(repository.saveOwnAvatar('preview-student', 'student', 'avatar_999'))
      .rejects.toThrow('ไม่พบ avatar ที่เลือก');
  });

  it('sends an announcement to the whole class', async () => {
    const snapshot = snapshotOf(repository);
    const roster = rosterFor(snapshot, repository.primaryClassId);
    await repository.saveAnnouncement({
      classId: repository.primaryClassId, subjectId: null,
      title: 'เตรียมอุปกรณ์', body: 'พรุ่งนี้ให้นำอุปกรณ์วาดรูปมาด้วย'
    });
    const after = snapshotOf(repository);
    expect(after.announcements.some((item) => item.title === 'เตรียมอุปกรณ์')).toBe(true);
    expect(after.notifications.filter((item) => item.kind === 'announcement')).toHaveLength(roster.length);
  });

  it('stores notification preferences per person', async () => {
    await repository.saveNotificationPreference({
      profileId: 'preview-student', assignmentReminder: false, projectReminder: true,
      gradeNotification: true, quietHoursStart: '22:00', quietHoursEnd: '07:00'
    });
    const preference = snapshotOf(repository).notificationPreferences.find((item) => item.profileId === 'preview-student')!;
    expect(preference.assignmentReminder).toBe(false);
    expect(preference.quietHoursStart).toBe('22:00');
  });

  it('marks notifications read one by one and all at once', async () => {
    const { id, roster } = await createPublishedWork(repository);
    const student = roster[0]!;
    const before = snapshotOf(repository);
    const unreadBefore = unreadCount(before, student.id);
    expect(unreadBefore).toBeGreaterThan(0);

    const entry = notificationEntries(before, student.id).find((item) => item.notification.assignmentId === id)!;
    await repository.markNotificationRead(entry.notification.id);
    expect(unreadCount(snapshotOf(repository), student.id)).toBe(unreadBefore - 1);

    await repository.markAllNotificationsRead(student.id);
    expect(unreadCount(snapshotOf(repository), student.id)).toBe(0);
    // Another student's notifications are untouched.
    expect(unreadCount(snapshotOf(repository), roster[1]!.id)).toBeGreaterThan(0);
  });
});

describe('class capacity', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('stores a preset capacity and a custom one', async () => {
    const snapshot = snapshotOf(repository);
    const term = snapshot.terms[0]!;
    await repository.saveClass({ id: 'cap-1', name: 'ป.4/1', gradeLevel: 'ป.4', academicTermId: term.id, capacity: 50 });
    await repository.saveClass({ id: 'cap-2', name: 'ป.4/2', gradeLevel: 'ป.4', academicTermId: term.id, capacity: 45 });
    const after = snapshotOf(repository);
    expect(after.classes.find((item) => item.id === 'cap-1')?.capacity).toBe(50);
    expect(after.classes.find((item) => item.id === 'cap-2')?.capacity).toBe(45);
  });

  it('keeps a sensible default and preserves capacity when a class is renamed', async () => {
    const snapshot = snapshotOf(repository);
    const term = snapshot.terms[0]!;
    await repository.saveClass({ id: 'cap-3', name: 'ป.4/3', gradeLevel: 'ป.4', academicTermId: term.id });
    expect(snapshotOf(repository).classes.find((item) => item.id === 'cap-3')?.capacity).toBe(40);

    const primary = snapshot.classes.find((item) => item.id === repository.primaryClassId)!;
    await repository.saveClass({
      id: primary.id, name: 'ป.5/1 (ห้องรวม)', gradeLevel: primary.gradeLevel, academicTermId: primary.academicTermId
    });
    expect(snapshotOf(repository).classes.find((item) => item.id === primary.id)?.capacity).toBe(primary.capacity);
  });
});
