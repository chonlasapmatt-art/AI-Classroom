import { beforeEach, describe, expect, it } from 'vitest';
import { createEncryptedBackup, decryptBackup, encodeBackupBlob, inspectBackup, restoreBackup } from '../../src/features/backup/backup';
import { db } from '../../src/db/database';

const schoolId = '33333333-3333-4333-8333-333333333333';
const otherSchool = '44444444-4444-4444-8444-444444444444';
const password = 'a-long-enough-passphrase';

function record(id: string, updatedAt: string, school = schoolId) {
  return { id, schoolId: school, version: 1, createdAt: '2026-08-01T00:00:00.000Z', updatedAt, deletedAt: null };
}

async function seedSchool(): Promise<void> {
  await db.students.bulkPut([
    { ...record('student-1', '2026-08-10T00:00:00.000Z'), profileId: null, studentCode: '001', displayName: 'ก', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' },
    { ...record('student-2', '2026-08-10T00:00:00.000Z'), profileId: null, studentCode: '002', displayName: 'ข', avatarIndex: 1, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' }
  ]);
  await db.teachers.put({ ...record('teacher-1', '2026-08-10T00:00:00.000Z'), profileId: null, avatarId: null, avatarPhotoId: null, teacherCode: 'T1', displayName: 'ครู ก', email: 't@example.invalid', subject: 'คณิตศาสตร์', verificationStatus: 'verified_teacher', status: 'active' });
  await db.subjects.put({ ...record('subject-1', '2026-08-10T00:00:00.000Z'), code: 'MA', name: 'คณิตศาสตร์', nameEn: 'Math', colorIndex: 1, iconKey: 'math', sortOrder: 0, status: 'active' });
  await db.timetable.put({ ...record('slot-1', '2026-08-10T00:00:00.000Z'), classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', academicTermId: 'term-1', dayOfWeek: 1, period: 1, startTime: '08:30', endTime: '09:20', room: '101', status: 'active' });
  await db.achievements.put({ ...record('badge-1', '2026-08-10T00:00:00.000Z'), studentId: 'student-1', achievementKey: 'reader', dedupeKey: 'student-1:reader', note: '', awardedBy: null, awardedAt: '2026-08-10T00:00:00.000Z' });
}

describe('encrypted backup and restore', () => {
  beforeEach(async () => {
    await Promise.all([
      db.students.clear(), db.teachers.clear(), db.subjects.clear(),
      db.timetable.clear(), db.achievements.clear(), db.attachments.clear(), db.syncQueue.clear()
    ]);
    await seedSchool();
  });

  it('carries every school table, not only the academic core', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    const contents = await decryptBackup(envelope, password, schoolId);
    expect(contents.students).toHaveLength(2);
    expect(contents.teachers).toHaveLength(1);
    expect(contents.subjects).toHaveLength(1);
    expect(contents.timetable).toHaveLength(1);
    expect(contents.achievements).toHaveLength(1);
  });

  it('encodes an offline attachment as backup data', async () => {
    const encoded = await encodeBackupBlob(new Blob(['ข้อมูลออฟไลน์'], { type: 'text/plain' }));
    expect(encoded).toBeTruthy();
  });

  it('describes a file before anything is written back', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    const summary = await inspectBackup(envelope, password, schoolId);
    expect(summary.totalRows).toBe(6);
    expect(summary.counts.find((entry) => entry.table === 'students')?.rows).toBe(2);
    expect(summary.schoolId).toBe(schoolId);
  });

  it('refuses a file from another school and a wrong password', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    await expect(decryptBackup(envelope, password, otherSchool)).rejects.toThrow('ไฟล์สำรองข้อมูลเป็นของโรงเรียนอื่น');
    await expect(decryptBackup(envelope, 'wrong-password-here', schoolId)).rejects.toThrow();
  });

  it('keeps newer local work when merging', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    const student = await db.students.get('student-1');
    await db.students.put({ ...student!, displayName: 'แก้ไขหลังสำรอง', updatedAt: '2026-08-20T00:00:00.000Z' });
    await db.students.delete('student-2');

    const result = await restoreBackup(envelope, password, schoolId, 'merge');

    expect((await db.students.get('student-1'))?.displayName).toBe('แก้ไขหลังสำรอง');
    expect((await db.students.get('student-2'))?.displayName).toBe('ข');
    expect(result.written).toBeGreaterThan(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('replaces the school entirely when asked to', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    await db.students.put({ ...record('student-9', '2026-08-25T00:00:00.000Z'), profileId: null, studentCode: '009', displayName: 'เพิ่มภายหลัง', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' });

    await restoreBackup(envelope, password, schoolId, 'replace');

    expect(await db.students.get('student-9')).toBeUndefined();
    expect(await db.students.count()).toBe(2);
  });

  it('clears a table the backup has nothing for, which is the whole point of replacing', async () => {
    // The snapshot is taken while these tables are empty; rows arrive afterwards. Replace exists to
    // get back to the snapshot, so leaving them behind would return the opposite of what was asked —
    // and a surviving sync queue would keep replaying against the server after a supposed reset.
    await db.announcements.clear();
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    await db.announcements.put({ ...record('note-1', '2026-08-25T00:00:00.000Z'), classId: 'class-1', subjectId: null, title: 'ประกาศ', body: '', studentIds: [], createdBy: 'teacher-1' });
    await db.syncQueue.put({
      queueId: 'queue-1', schoolId, entityType: 'student', entityId: 'student-1', operation: 'upsert',
      payload: {}, baseVersion: 1, idempotencyKey: 'key-1', requestHash: 'hash-1', status: 'pending',
      attemptCount: 0, nextRetryAt: '2026-08-25T00:00:00.000Z', lastError: null,
      createdAt: '2026-08-25T00:00:00.000Z'
    });

    await restoreBackup(envelope, password, schoolId, 'replace');

    expect(await db.announcements.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('never writes rows belonging to a different school', async () => {
    const envelope = await createEncryptedBackup(schoolId, 'device-1', password);
    const contents = await decryptBackup(envelope, password, schoolId);
    expect(contents.students!.every((row) => row.schoolId === schoolId)).toBe(true);
    await restoreBackup(envelope, password, schoolId, 'merge');
    expect(await db.students.where('schoolId').equals(otherSchool).count()).toBe(0);
  });
});
