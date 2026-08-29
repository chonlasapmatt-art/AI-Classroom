import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { db } from '../../src/db/database';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

/** The fixture repository emits synchronously, so one subscribe/unsubscribe pair reads the state. */
function currentSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let captured: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((snapshot) => { captured = snapshot; });
  unsubscribe();
  if (!captured) throw new Error('repository did not publish a snapshot');
  return captured;
}

describe('fixture repository', () => {
  let repository: FixtureSchoolRepository;

  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('publishes a snapshot immediately on subscribe', async () => {
    const snapshot = currentSnapshot(repository);
    expect(snapshot.ready).toBe(true);
    expect(snapshot.students.length).toBeGreaterThan(0);
  });

  it('notifies subscribers when a record changes', async () => {
    const seen: number[] = [];
    const unsubscribe = repository.subscribe((snapshot) => seen.push(snapshot.students.length));
    await repository.saveStudent({ id: 'new-student', studentCode: '2569999', displayName: 'ทดสอบ ระบบ', avatarIndex: 3 });
    unsubscribe();
    expect(seen.length).toBe(2);
    expect(seen[1]).toBe(seen[0]! + 1);
  });

  it('records attendance for the selected day only', async () => {
    const before = currentSnapshot(repository);
    const student = before.students[0]!;
    await repository.setAttendance({ classId: repository.primaryClassId, studentId: student.id, attendanceDate: '2026-08-25', status: 'late' });
    const after = currentSnapshot(repository);
    const rows = after.attendance.filter((item) => item.studentId === student.id && item.attendanceDate === '2026-08-25');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('late');
  });

  it('publishing a test stamps every score and flips the test status', async () => {
    const before = currentSnapshot(repository);
    const draft = before.tests.find((item) => item.status === 'draft')!;
    await repository.publishTestScores(draft.id);
    const after = currentSnapshot(repository);
    expect(after.tests.find((item) => item.id === draft.id)?.status).toBe('published');
    expect(after.testScores.filter((item) => item.testId === draft.id).every((item) => item.publishedAt)).toBe(true);
  });

  it('transferring a student closes the previous enrollment', async () => {
    const before = currentSnapshot(repository);
    const student = before.students[0]!;
    const target = before.classes.find((item) => item.id !== repository.primaryClassId)!;
    await repository.transferStudent(student.id, target.id, before.terms[0]!.id);
    const after = currentSnapshot(repository);
    const active = after.enrollments.filter((item) => item.studentId === student.id && item.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]!.classId).toBe(target.id);
    expect(after.enrollments.some((item) => item.studentId === student.id && item.status === 'transferred')).toBe(true);
  });

  it('never writes to the local database or the sync queue', async () => {
    await repository.saveStudent({ id: 'preview-only', studentCode: '2569888', displayName: 'ไม่ควรถูกบันทึก', avatarIndex: 1 });
    await repository.setAttendance({ classId: repository.primaryClassId, studentId: 'preview-only', attendanceDate: '2026-08-25', status: 'present' });
    expect(await db.students.count()).toBe(0);
    expect(await db.attendance.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('keeps consent state explicit', async () => {
    const before = currentSnapshot(repository);
    const link = before.parentLinks.find((item) => item.status === 'invited')!;
    await repository.setParentConsent(link.id, true, '2026-05-01');
    const after = currentSnapshot(repository);
    const updated = after.parentLinks.find((item) => item.id === link.id)!;
    expect(updated.status).toBe('linked');
    expect(updated.consentVersion).toBe('2026-05-01');
    await repository.revokeParentLink(link.id);
    const revoked = (currentSnapshot(repository)).parentLinks.find((item) => item.id === link.id)!;
    expect(revoked.status).toBe('revoked');
    expect(revoked.lineUserId).toBeNull();
  });
});
