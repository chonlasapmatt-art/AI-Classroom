import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db/database';

/*
 * A room of seven has to read as seven on every screen.
 *
 * Students and enrollments travel through the mutation journal, and `sync_pull` hands a device only
 * the changes it was already allowed to read at the moment it asked — then the cursor moves past
 * the rest for good. A child's row is invisible to their future classmates until the enrollment
 * that puts them in a shared room exists, so a child created a minute before being enrolled was
 * skipped by every device that polled inside that minute. Those devices went on to receive the
 * enrollment alone, so the room held an enrollment for a child the device had never heard of: seven
 * testers in one room, six on one screen and five on another, with no later pull able to repair it.
 */

const schoolId = '11111111-1111-4111-8111-111111111111';
const cloud: Record<string, Record<string, unknown>[]> = {};

const client = {
  from: (table: string) => ({
    select: () => ({
      eq: async () => ({ data: cloud[table] ?? [], error: null })
    })
  })
};

vi.mock('../../src/services/supabase', () => ({
  isCloudConfigured: true,
  supabase: null,
  requireSupabase: () => client
}));

const { pullStructure } = await import('../../src/sync/engine');

const cloudStudent = (id: string, displayName: string) => ({
  id, school_id: schoolId, profile_id: null, student_code: id, display_name: displayName,
  avatar_index: 0, avatar_config: null, status: 'active', version: 1,
  created_at: '2026-09-10 04:00:00.000000+00', updated_at: '2026-09-10 04:00:00.000000+00', deleted_at: null
});

const cloudEnrollment = (id: string, studentId: string) => ({
  id, school_id: schoolId, student_id: studentId, class_id: 'class-1', academic_term_id: 'term-1',
  status: 'active', enrolled_at: '2026-09-10 04:00:00.000000+00', left_at: null, version: 1,
  created_at: '2026-09-10 04:00:00.000000+00', updated_at: '2026-09-10 04:00:00.000000+00', deleted_at: null
});

const localStudent = (id: string, displayName: string) => ({
  id, schoolId, profileId: null, studentCode: id, displayName, avatarIndex: 0, avatarConfig: null,
  avatarId: null, avatarPhotoId: null, status: 'active' as const, version: 1,
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', deletedAt: null
});

const localEnrollment = (id: string, studentId: string) => ({
  id, schoolId, studentId, classId: 'class-1', academicTermId: 'term-1', status: 'active' as const,
  enrolledAt: '2020-01-01T00:00:00.000Z', leftAt: null, version: 1,
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', deletedAt: null
});

const queueRow = (entityType: 'student' | 'enrollment', entityId: string) => ({
  queueId: `queue-${entityId}`, schoolId, entityType, entityId, operation: 'upsert' as const,
  payload: {}, baseVersion: 1, idempotencyKey: `key-${entityId}`, requestHash: 'hash',
  attemptCount: 0, nextRetryAt: '2026-09-10T04:00:00.000Z', lastError: null,
  status: 'pending' as const, createdAt: '2026-09-10T04:00:00.000Z'
});

describe('the roster a device holds', () => {
  beforeEach(async () => {
    for (const key of Object.keys(cloud)) delete cloud[key];
    await Promise.all([
      db.students.clear(), db.enrollments.clear(), db.syncQueue.clear(),
      db.academicTerms.clear(), db.classes.clear(), db.subjects.clear(),
      db.teachers.clear(), db.classTeachers.clear(), db.parentLinks.clear()
    ]);
  });

  it('gains the classmate whose creation the journal cursor had already passed', async () => {
    // The device received the enrollment and never the child it points at.
    await db.enrollments.put(localEnrollment('enrollment-b', 'student-b') as never);
    cloud.students = [cloudStudent('student-a', 'เอ นักเรียน'), cloudStudent('student-b', 'บี นักเรียน')];
    cloud.student_class_enrollments = [cloudEnrollment('enrollment-a', 'student-a'), cloudEnrollment('enrollment-b', 'student-b')];

    await pullStructure(schoolId);

    const roster = await db.students.toArray();
    expect(roster.map((student) => student.id).sort()).toEqual(['student-a', 'student-b']);
    expect((await db.students.get('student-b'))?.displayName).toBe('บี นักเรียน');
  });

  it('stops listing a child the reader may no longer see', async () => {
    // Leaving the room ends the read, so the row stops coming back. A mirror that only ever wrote
    // rows left the departed child on the roster of every other device for the life of the browser.
    await db.students.put(localStudent('student-c', 'ซี นักเรียน') as never);
    await db.enrollments.put(localEnrollment('enrollment-c', 'student-c') as never);

    await pullStructure(schoolId);

    expect(await db.students.get('student-c')).toBeUndefined();
    expect(await db.enrollments.get('enrollment-c')).toBeUndefined();
  });

  it('keeps a child this device has not delivered yet', async () => {
    // A student added while offline exists nowhere but here. The server's silence about them says
    // "not delivered", never "deleted".
    await db.students.put(localStudent('student-new', 'ใหม่ นักเรียน') as never);
    await db.syncQueue.add(queueRow('student', 'student-new') as never);

    await pullStructure(schoolId);

    expect((await db.students.get('student-new'))?.displayName).toBe('ใหม่ นักเรียน');
  });

  it('does not overwrite an edit that is still waiting in the queue', async () => {
    await db.students.put(localStudent('student-d', 'ชื่อที่แก้ไว้') as never);
    await db.syncQueue.add(queueRow('student', 'student-d') as never);
    cloud.students = [cloudStudent('student-d', 'ชื่อเดิมบนเซิร์ฟเวอร์')];

    await pullStructure(schoolId);

    expect((await db.students.get('student-d'))?.displayName).toBe('ชื่อที่แก้ไว้');
  });
});
