import { beforeEach, describe, expect, it } from 'vitest';
import { DexieSchoolRepository } from '../../src/data/dexieSchoolRepository';
import { db } from '../../src/db/database';

const schoolId = '11111111-1111-4111-8111-111111111111';

describe('dexie repository', () => {
  const repository = new DexieSchoolRepository(schoolId);

  beforeEach(async () => {
    await Promise.all([db.students.clear(), db.attendance.clear(), db.enrollments.clear(), db.syncQueue.clear(), db.teachers.clear()]);
  });

  it('queues student writes for the trusted mutation boundary', async () => {
    await repository.saveStudent({ id: 'student-1', studentCode: '2569001', displayName: 'ทดสอบ นักเรียน', avatarIndex: 5 });
    expect(await db.students.count()).toBe(1);
    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.entityType).toBe('student');
    expect(queued[0]!.operation).toBe('upsert');
    expect(queued[0]!.requestHash.length).toBeGreaterThanOrEqual(32);
  });

  it('soft deletes instead of dropping rows', async () => {
    await repository.saveStudent({ id: 'student-2', studentCode: '2569002', displayName: 'ทดสอบ ลบ', avatarIndex: 1 });
    await repository.removeStudent('student-2');
    const record = await db.students.get('student-2');
    expect(record?.deletedAt).not.toBeNull();
    const queued = await db.syncQueue.toArray();
    expect(queued.some((item) => item.operation === 'delete')).toBe(true);
  });

  it('keeps one attendance row per student per day', async () => {
    await repository.setAttendance({ classId: 'class-1', studentId: 'student-3', attendanceDate: '2026-08-24', status: 'present' });
    await repository.setAttendance({ classId: 'class-1', studentId: 'student-3', attendanceDate: '2026-08-24', status: 'late' });
    const rows = await db.attendance.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('late');
  });

  it('marks a whole class present in one call', async () => {
    await repository.setAttendanceForStudents('class-1', '2026-08-24', 'present', ['a', 'b', 'c']);
    expect(await db.attendance.count()).toBe(3);
  });

  it('only reads records that belong to the session school', async () => {
    await repository.saveStudent({ id: 'student-4', studentCode: '2569004', displayName: 'ในโรงเรียน', avatarIndex: 2 });
    await db.students.put({
      id: 'foreign', schoolId: 'other-school', profileId: null, studentCode: 'x', displayName: 'โรงเรียนอื่น',
      avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active', version: 1,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null
    });
    const snapshot = await new Promise<{ students: { id: string }[] }>((resolve) => {
      const unsubscribe = repository.subscribe((value) => { resolve(value); unsubscribe(); });
    });
    expect(snapshot.students.map((item) => item.id)).toEqual(['student-4']);
  });
});
