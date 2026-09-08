import { beforeEach, describe, expect, it } from 'vitest';
import { DexieSchoolRepository } from '../../src/data/dexieSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import { db } from '../../src/db/database';
import type { SyncQueueItem } from '../../src/domain/types';

// Every record the academic workflow writes has to leave the device. Before this, a rubric, an
// extension, a rubric mark, a submission version, a delivery preference, a student's notice and an
// audit entry were written to the local database and nowhere else.

const schoolId = '33333333-3333-4333-8333-333333333333';
const classId = 'class-1';
const termId = 'term-1';
const teacherProfile = 'profile-teacher';
const studentIds = ['student-1', 'student-2'];
const stamp = '2026-06-01T00:00:00.000Z';
const base = { schoolId, version: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };

async function seed(): Promise<void> {
  await db.academicTerms.put({ ...base, id: termId, academicYear: '2569', term: '1', startsOn: '2026-05-16', endsOn: '2027-03-31', status: 'active' });
  await db.classes.put({ ...base, id: classId, academicTermId: termId, name: 'ป.4/1', gradeLevel: 'ป.4', capacity: 40, status: 'active' });
  await db.students.bulkPut(studentIds.map((id, index) => ({
    ...base, id, profileId: `profile-${id}`, studentCode: `S${index + 1}`, displayName: `นักเรียน ${index + 1}`,
    avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' as const
  })));
  await db.enrollments.bulkPut(studentIds.map((studentId) => ({
    ...base, id: `enrollment-${studentId}`, studentId, classId, academicTermId: termId, status: 'active' as const, enrolledAt: stamp, leftAt: null
  })));
}

async function queued(entityType: string): Promise<SyncQueueItem[]> {
  return (await db.syncQueue.where({ schoolId, status: 'pending' }).toArray())
    .filter((item) => item.entityType === entityType)
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
}

function snapshotOf(repository: DexieSchoolRepository): Promise<SchoolSnapshot> {
  return new Promise((resolveSnapshot) => {
    const unsubscribe = repository.subscribe((snapshot) => {
      if (!snapshot.ready) return;
      unsubscribe();
      resolveSnapshot(snapshot);
    });
  });
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function publishedWork(repository: DexieSchoolRepository, id: string, extra: { rubricId?: string | null } = {}): Promise<void> {
  await repository.saveAssignment({
    id, classId, subjectId: null, workType: 'assignment', title: 'งานทดสอบ', description: '', instructions: 'ทำในสมุด',
    dueAt: daysFromNow(3), maxScore: 20, rubricId: extra.rubricId ?? null, reminderOffsets: [0, 1440, 180], status: 'draft'
  });
  await repository.publishAssignment(id, studentIds);
}

describe('the academic workflow travels the sync queue', () => {
  const teacher = new DexieSchoolRepository(schoolId, { role: 'admin', profileId: teacherProfile });

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seed();
  });

  it('queues a rubric, and archiving it is another upsert of the same row', async () => {
    await teacher.saveRubric({ id: 'rubric-1', title: 'เกณฑ์เรียงความ', subjectId: null, criteria: [{ id: 'c1', label: 'เนื้อหา', maxScore: 10, description: '' }] });
    const [created] = await queued('rubric');
    expect(created?.entityId).toBe('rubric-1');
    expect(created?.operation).toBe('upsert');

    await teacher.archiveRubric('rubric-1');
    const rows = await queued('rubric');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.operation === 'upsert')).toBe(true);
    expect((await db.rubrics.get('rubric-1'))?.status).toBe('archived');
  });

  it('queues a personal deadline together with its audit entry', async () => {
    await publishedWork(teacher, 'work-1');
    await teacher.grantExtension('work-1', 'student-1', daysFromNow(6), 'ป่วย', teacherProfile);

    const [extension] = await queued('deadline_extension');
    expect(extension?.payload).toMatchObject({ assignmentId: 'work-1', studentId: 'student-1', reason: 'ป่วย' });
    const audit = await queued('academic_audit');
    expect(audit.some((item) => item.payload.action === 'STUDENT_EXTENSION_CREATED')).toBe(true);
    expect(audit.some((item) => item.payload.action === 'ASSIGNMENT_PUBLISHED')).toBe(true);
  });

  it('queues every rubric mark next to the submission it marks', async () => {
    await teacher.saveRubric({ id: 'rubric-2', title: 'โครงงาน', subjectId: null, criteria: [
      { id: 'c1', label: 'เนื้อหา', maxScore: 10, description: '' }, { id: 'c2', label: 'การนำเสนอ', maxScore: 10, description: '' }
    ] });
    await publishedWork(teacher, 'work-2', { rubricId: 'rubric-2' });
    await teacher.scoreSubmission({ assignmentId: 'work-2', studentId: 'student-1', gradedBy: teacherProfile, rubricEntries: [
      { criterionId: 'c1', score: 8 }, { criterionId: 'c2', score: 7 }
    ] });

    const marks = await queued('rubric_score');
    expect(marks.map((item) => item.payload.criterionId).sort()).toEqual(['c1', 'c2']);
    expect(marks.every((item) => item.payload.deletedAt === null)).toBe(true);
    const head = await db.submissions.where({ assignmentId: 'work-2', studentId: 'student-1' }).first();
    expect(head?.score).toBe(15);
    expect((await queued('classroom_notification')).some((item) => item.payload.kind === 'grade_posted')).toBe(true);
  });

  it('numbers turn-ins from the version rows, not from the sync version of the head', async () => {
    await publishedWork(teacher, 'work-3');
    const student = new DexieSchoolRepository(schoolId, { role: 'student', profileId: 'profile-student-1' });
    // The head arrives from the server with a sync version that has nothing to do with turn-ins.
    const head = await db.submissions.where({ assignmentId: 'work-3', studentId: 'student-1' }).first();
    await db.submissions.put({ ...head!, version: 7 });

    await student.submitWork('work-3', 'student-1', 'ส่งครั้งแรก', false);
    await teacher.requestRevision('work-3', 'student-1', 'แก้บทสรุป', teacherProfile);
    await student.submitWork('work-3', 'student-1', 'แก้แล้ว', false);

    const versions = await queued('submission_version');
    expect(versions.map((item) => item.payload.versionNumber)).toEqual([1, 2]);
    const after = await db.submissions.where({ assignmentId: 'work-3', studentId: 'student-1' }).first();
    expect(after?.status).toBe('resubmitted');
    expect(after?.version).toBe(7);
    const snapshot = await snapshotOf(teacher);
    expect(snapshot.submissionVersions.filter((item) => item.assignmentId === 'work-3' && item.studentId === 'student-1')).toHaveLength(2);
  });

  it("drops a student's remaining reminders as tombstones and brings one back under its own id when needed", async () => {
    await publishedWork(teacher, 'work-4');
    const scheduledBefore = (await db.notifications.where({ schoolId }).toArray())
      .filter((row) => row.assignmentId === 'work-4' && row.studentId === 'student-1' && row.state === 'scheduled');
    expect(scheduledBefore.length).toBeGreaterThan(0);

    const student = new DexieSchoolRepository(schoolId, { role: 'student', profileId: 'profile-student-1' });
    await student.submitWork('work-4', 'student-1', '', false);
    const tombstones = await db.notifications.bulkGet(scheduledBefore.map((row) => row.id));
    expect(tombstones.every((row) => row?.deletedAt)).toBe(true);
    const deletes = (await queued('classroom_notification')).filter((item) => item.operation === 'delete');
    expect(deletes.map((item) => item.entityId).sort()).toEqual(scheduledBefore.map((row) => row.id).sort());

    // Asked to revise, the student needs the reminders again: the same identities, the same rows.
    await teacher.requestRevision('work-4', 'student-1', 'เพิ่มแหล่งอ้างอิง', teacherProfile);
    const work = (await db.assignments.get('work-4'))!;
    await teacher.saveAssignment({
      id: work.id, classId, subjectId: null, workType: 'assignment', title: work.title, description: '', instructions: work.instructions,
      dueAt: daysFromNow(5), maxScore: 20, reminderOffsets: [0, 1440, 180], status: 'published'
    });
    const revived = await db.notifications.bulkGet(scheduledBefore.map((row) => row.id));
    expect(revived.every((row) => row && !row.deletedAt && row.state === 'scheduled')).toBe(true);
    const all = (await db.notifications.where({ schoolId }).toArray()).filter((row) => row.assignmentId === 'work-4' && row.studentId === 'student-1' && row.kind === 'submission_reminder');
    expect(new Set(all.map((row) => row.dedupeKey)).size).toBe(all.length);
  });

  it('delivers due reminders only for the signed-in student and queues the delivery', async () => {
    await publishedWork(teacher, 'work-5');
    expect(await teacher.deliverDueReminders(new Date(Date.now() + 10 * 86_400_000))).toBe(0);

    const student = new DexieSchoolRepository(schoolId, { role: 'student', profileId: 'profile-student-2' });
    const delivered = await student.deliverDueReminders(new Date(Date.now() + 10 * 86_400_000));
    expect(delivered).toBeGreaterThan(0);
    const rows = (await db.notifications.where({ schoolId }).toArray()).filter((row) => row.assignmentId === 'work-5');
    expect(rows.filter((row) => row.studentId === 'student-2').every((row) => row.state === 'delivered')).toBe(true);
    expect(rows.some((row) => row.studentId === 'student-1' && row.state === 'scheduled')).toBe(true);
    const queuedDeliveries = (await queued('classroom_notification'))
      .filter((item) => item.payload.studentId === 'student-2' && item.payload.kind === 'submission_reminder' && item.payload.state === 'delivered');
    expect(queuedDeliveries.length).toBe(delivered);
  });

  it('queues reading a notice and a delivery preference as changes of their own', async () => {
    await publishedWork(teacher, 'work-6');
    const student = new DexieSchoolRepository(schoolId, { role: 'student', profileId: 'profile-student-1' });
    const notice = (await db.notifications.where({ schoolId }).toArray()).find((row) => row.assignmentId === 'work-6' && row.studentId === 'student-1' && row.kind === 'assignment_published')!;
    await db.syncQueue.clear();

    await student.markNotificationRead(notice.id);
    const [read] = await queued('classroom_notification');
    expect(read?.entityId).toBe(notice.id);
    expect(read?.payload.state).toBe('read');
    expect(read?.payload.readAt).toBeTruthy();
    // Reading it twice is one change.
    await student.markNotificationRead(notice.id);
    expect(await queued('classroom_notification')).toHaveLength(1);

    await student.saveNotificationPreference({ profileId: 'profile-student-1', assignmentReminder: true, projectReminder: false, gradeNotification: true, quietHoursStart: '21:00', quietHoursEnd: '06:00' });
    const [preference] = await queued('notification_preference');
    expect(preference?.payload).toMatchObject({ profileId: 'profile-student-1', projectReminder: false, quietHoursStart: '21:00' });
  });

  it('publishes the work and every submission row in one local transaction', async () => {
    await teacher.saveAssignment({ id: 'work-7', classId, subjectId: null, workType: 'homework', title: 'การบ้าน', description: '', dueAt: daysFromNow(2), maxScore: 10, status: 'draft' });
    await db.syncQueue.clear();
    await teacher.publishAssignment('work-7', studentIds);
    const items = (await db.syncQueue.where({ schoolId, status: 'pending' }).toArray()).sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
    expect(items[0]?.entityType).toBe('assignment');
    expect(items.filter((item) => item.entityType === 'submission')).toHaveLength(studentIds.length);
    // The work is queued before the rows that refer to it.
    const workAt = items.findIndex((item) => item.entityType === 'assignment');
    const firstSubmissionAt = items.findIndex((item) => item.entityType === 'submission');
    expect(workAt).toBeLessThan(firstSubmissionAt);
  });
});

describe('placing students', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seed();
    await db.teachers.put({ ...base, id: 'teacher-1', profileId: teacherProfile, avatarId: null, avatarPhotoId: null, teacherCode: 'T1', displayName: 'ครูหนึ่ง', email: '', subject: '', verificationStatus: 'verified_teacher', status: 'active' });
    await db.classes.put({ ...base, id: 'class-2', academicTermId: termId, name: 'ป.4/2', gradeLevel: 'ป.4', capacity: 40, status: 'active' });
  });

  it('lets a teacher enrol only into a room they hold, and takes the term from the room', async () => {
    const teacher = new DexieSchoolRepository(schoolId, { role: 'teacher', profileId: teacherProfile });
    await expect(teacher.enrollStudent('student-1', 'class-2', 'term-wrong')).rejects.toThrow('เฉพาะห้องที่ตนเองรับผิดชอบ');
    expect(await db.syncQueue.count()).toBe(0);

    await db.classTeachers.put({ ...base, id: 'link-1', classId: 'class-2', teacherId: 'teacher-1', role: 'primary' });
    await teacher.enrollStudent('student-1', 'class-2', 'term-wrong');
    const [item] = await queued('enrollment');
    expect(item?.payload.academicTermId).toBe(termId);
  });

  it('promotes a cohort all at once and skips a student already placed in the new year', async () => {
    const admin = new DexieSchoolRepository(schoolId, { role: 'admin', profileId: 'profile-admin' });
    await db.academicTerms.put({ ...base, id: 'term-2', academicYear: '2570', term: '1', startsOn: '2027-05-16', endsOn: '2028-03-31', status: 'draft' });
    await db.classes.put({ ...base, id: 'class-next', academicTermId: 'term-2', name: 'ป.5/1', gradeLevel: 'ป.5', capacity: 40, status: 'active' });
    await db.enrollments.put({ ...base, id: 'enrollment-early', studentId: 'student-2', classId: 'class-next', academicTermId: 'term-2', status: 'active', enrolledAt: stamp, leftAt: null });

    await expect(admin.promoteStudents({ fromTermId: termId, toTermId: 'term-2', actorProfileId: 'profile-admin', moves: [
      { studentId: 'student-1', toClassId: 'class-next' }, { studentId: 'student-2', toClassId: 'class-missing' }
    ] })).rejects.toThrow('ห้องปลายทาง');
    // Nothing was written for the first student either: the whole cohort moves or none of it does.
    expect(await db.syncQueue.count()).toBe(0);

    const result = await admin.promoteStudents({ fromTermId: termId, toTermId: 'term-2', actorProfileId: 'profile-admin', moves: [
      { studentId: 'student-1', toClassId: 'class-next' }, { studentId: 'student-2', toClassId: 'class-next' }
    ] });
    expect(result).toEqual({ promoted: 1, graduated: 0, skipped: 1 });
    expect(await queued('enrollment')).toHaveLength(2);
  });
});
