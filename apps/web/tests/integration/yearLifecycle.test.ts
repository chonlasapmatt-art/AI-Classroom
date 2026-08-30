import { beforeEach, describe, expect, it } from 'vitest';
import { DexieSchoolRepository } from '../../src/data/dexieSchoolRepository';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { db } from '../../src/db/database';

const schoolId = '22222222-2222-4222-8222-222222222222';
const fromTerm = 'term-2568';
const toTerm = 'term-2569';

async function seedTerms(): Promise<void> {
  const base = { schoolId, version: 1, createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', deletedAt: null };
  await db.academicTerms.bulkPut([
    { ...base, id: fromTerm, academicYear: '2568', term: '1', startsOn: '2025-05-16', endsOn: '2026-03-31', status: 'active' },
    { ...base, id: toTerm, academicYear: '2569', term: '1', startsOn: '2026-05-16', endsOn: '2027-03-31', status: 'draft' }
  ]);
  await db.classes.bulkPut([
    { ...base, id: 'class-old', academicTermId: fromTerm, name: 'ป.5/1', gradeLevel: 'ป.5', capacity: 30, status: 'active' },
    { ...base, id: 'class-new', academicTermId: toTerm, name: 'ป.6/1', gradeLevel: 'ป.6', capacity: 30, status: 'active' }
  ]);
}

describe('academic year lifecycle (local-first path)', () => {
  const repository = new DexieSchoolRepository(schoolId);

  beforeEach(async () => {
    await Promise.all([
      db.academicTerms.clear(), db.classes.clear(), db.enrollments.clear(),
      db.timetable.clear(), db.achievements.clear(), db.syncQueue.clear()
    ]);
    await seedTerms();
  });

  it('closes the old enrolment and opens a new one without rewriting history', async () => {
    await repository.enrollStudent('student-1', 'class-old', fromTerm);
    await db.syncQueue.clear();

    const result = await repository.promoteStudents({
      fromTermId: fromTerm, toTermId: toTerm, actorProfileId: 'teacher-1',
      moves: [{ studentId: 'student-1', toClassId: 'class-new' }]
    });

    expect(result).toEqual({ promoted: 1, graduated: 0, skipped: 0 });
    const rows = await db.enrollments.toArray();
    expect(rows).toHaveLength(2);
    const closed = rows.find((row) => row.academicTermId === fromTerm);
    const opened = rows.find((row) => row.academicTermId === toTerm);
    expect(closed?.status).toBe('promoted');
    expect(closed?.classId).toBe('class-old');
    expect(closed?.leftAt).not.toBeNull();
    expect(opened?.status).toBe('active');
    expect(opened?.classId).toBe('class-new');
    // Both sides of the move travel through the trusted mutation boundary.
    const queued = await db.syncQueue.toArray();
    expect(queued.filter((item) => item.entityType === 'enrollment')).toHaveLength(2);
  });

  it('graduates a student when no destination class is given', async () => {
    await repository.enrollStudent('student-2', 'class-old', fromTerm);
    const result = await repository.promoteStudents({
      fromTermId: fromTerm, toTermId: toTerm, actorProfileId: 'teacher-1',
      moves: [{ studentId: 'student-2', toClassId: null }]
    });
    expect(result).toEqual({ promoted: 0, graduated: 1, skipped: 0 });
    const rows = await db.enrollments.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('graduated');
  });

  it('skips a student who has no active enrolment in the source term', async () => {
    const result = await repository.promoteStudents({
      fromTermId: fromTerm, toTermId: toTerm, actorProfileId: 'teacher-1',
      moves: [{ studentId: 'ghost', toClassId: 'class-new' }]
    });
    expect(result).toEqual({ promoted: 0, graduated: 0, skipped: 1 });
    expect(await db.enrollments.count()).toBe(0);
  });

  it('refuses a destination class that belongs to another term', async () => {
    await repository.enrollStudent('student-3', 'class-old', fromTerm);
    await expect(repository.promoteStudents({
      fromTermId: fromTerm, toTermId: toTerm, actorProfileId: 'teacher-1',
      moves: [{ studentId: 'student-3', toClassId: 'class-old' }]
    })).rejects.toThrow();
  });

  it('keeps one class in one place per period', async () => {
    const slot = {
      classId: 'class-old', subjectId: null, teacherId: 'teacher-1', academicTermId: fromTerm,
      dayOfWeek: 1, period: 2, startTime: '09:30', endTime: '10:20'
    };
    await repository.saveTimetableEntry(slot);
    await expect(repository.saveTimetableEntry(slot)).rejects.toThrow('ห้องนี้มีคาบเรียนในช่วงเวลานี้แล้ว');
  });

  it('keeps one teacher in one place per period', async () => {
    await repository.saveTimetableEntry({
      classId: 'class-old', subjectId: null, teacherId: 'teacher-1', academicTermId: fromTerm,
      dayOfWeek: 2, period: 1, startTime: '08:30', endTime: '09:20'
    });
    await expect(repository.saveTimetableEntry({
      classId: 'class-new', subjectId: null, teacherId: 'teacher-1', academicTermId: fromTerm,
      dayOfWeek: 2, period: 1, startTime: '08:30', endTime: '09:20'
    })).rejects.toThrow('ครูคนนี้ถูกจัดสอนคาบนี้ในห้องอื่นแล้ว');
  });

  it('queues a timetable removal as a tombstone rather than dropping the row', async () => {
    await repository.saveTimetableEntry({
      id: 'slot-1', classId: 'class-old', subjectId: null, teacherId: null, academicTermId: fromTerm,
      dayOfWeek: 3, period: 1, startTime: '08:30', endTime: '09:20'
    });
    await repository.removeTimetableEntry('slot-1');
    expect((await db.timetable.get('slot-1'))?.deletedAt).not.toBeNull();
    expect((await db.syncQueue.toArray()).some((item) => item.entityType === 'timetable_entry' && item.operation === 'delete')).toBe(true);
  });

  it('awards a badge once, however often the pass runs', async () => {
    await repository.awardAchievement({ studentId: 'student-4', achievementKey: 'reader', awardedBy: 'teacher-1' });
    await repository.awardAchievement({ studentId: 'student-4', achievementKey: 'reader', awardedBy: 'teacher-1' });
    const rows = await db.achievements.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dedupeKey).toBe('student-4:reader');
  });
});

describe('academic year lifecycle (preview fixtures)', () => {
  it('activates one term at a time and never two', async () => {
    const repository = new FixtureSchoolRepository();
    await repository.saveAcademicTerm({
      academicYear: '2570', term: '1', startsOn: '2027-05-16', endsOn: '2028-03-31', status: 'active'
    });
    const snapshot = await new Promise<Parameters<Parameters<typeof repository.subscribe>[0]>[0]>((resolve) => {
      const unsubscribe = repository.subscribe((value) => { resolve(value); unsubscribe(); });
    });
    expect(snapshot.terms.filter((term) => term.status === 'active')).toHaveLength(1);
    expect(snapshot.terms.find((term) => term.status === 'active')?.academicYear).toBe('2570');
  });

  it('verifies a teacher only with a stated reason', async () => {
    const repository = new FixtureSchoolRepository();
    await expect(repository.verifyTeacher('fixture-teacher-3', 'ok')).rejects.toThrow();
    await repository.verifyTeacher('fixture-teacher-3', 'ตรวจสอบเอกสารแล้ว');
    const snapshot = await new Promise<Parameters<Parameters<typeof repository.subscribe>[0]>[0]>((resolve) => {
      const unsubscribe = repository.subscribe((value) => { resolve(value); unsubscribe(); });
    });
    expect(snapshot.teachers.find((row) => row.id === 'fixture-teacher-3')?.verificationStatus).toBe('verified_teacher');
  });

  it('never seeds development data into the preview fixtures', async () => {
    const repository = new FixtureSchoolRepository();
    await expect(repository.seedDevelopmentData({
      academicTermId: 'fixture-term-1', classCount: 1, studentsPerClass: 1, teacherCount: 1, includeActivity: false
    })).rejects.toThrow();
  });
});
