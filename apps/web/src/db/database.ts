import Dexie, { type EntityTable } from 'dexie';
import type { AcademicTerm, AcademicAuditEntry, Announcement, Attachment, Activity, ActivityScore, Assignment, Attendance, ClassTeacher, ClassroomNotification, Classroom, DeviceMetadata, Enrollment, LocalSessionMetadata, ParentLink, DeadlineExtension, NotificationPreference, Rubric, RubricScore, Setting, Student, StudentAchievement, Subject, Submission, SubmissionVersion,
  ImportRun, ScoreEvent, SyncQueueItem, SyncState, Teacher, TestRecord, TestScore, TimetableEntry } from '../domain/types';

export const LOCAL_SCHEMA_VERSION = 10;

/**
 * Attachment row as stored locally: metadata plus the file bytes when this device has them.
 * A row pulled from another device starts with no blob until it is downloaded on demand.
 */
export interface AttachmentRecord extends Attachment { blob: Blob | null }

export class SmartClassroomDatabase extends Dexie {
  academicTerms!: EntityTable<AcademicTerm, 'id'>;
  classes!: EntityTable<Classroom, 'id'>;
  teachers!: EntityTable<Teacher, 'id'>;
  classTeachers!: EntityTable<ClassTeacher, 'id'>;
  parentLinks!: EntityTable<ParentLink, 'id'>;
  subjects!: EntityTable<Subject, 'id'>;
  notifications!: EntityTable<ClassroomNotification, 'id'>;
  attachments!: EntityTable<AttachmentRecord, 'id'>;
  rubrics!: EntityTable<Rubric, 'id'>;
  rubricScores!: EntityTable<RubricScore, 'id'>;
  submissionVersions!: EntityTable<SubmissionVersion, 'id'>;
  deadlineExtensions!: EntityTable<DeadlineExtension, 'id'>;
  announcements!: EntityTable<Announcement, 'id'>;
  notificationPreferences!: EntityTable<NotificationPreference, 'id'>;
  academicAudit!: EntityTable<AcademicAuditEntry, 'id'>;
  timetable!: EntityTable<TimetableEntry, 'id'>;
  achievements!: EntityTable<StudentAchievement, 'id'>;
  importRuns!: EntityTable<ImportRun, 'id'>;
  scoreEvents!: EntityTable<ScoreEvent, 'id'>;
  students!: EntityTable<Student, 'id'>;
  enrollments!: EntityTable<Enrollment, 'id'>;
  assignments!: EntityTable<Assignment, 'id'>;
  submissions!: EntityTable<Submission, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  activityScores!: EntityTable<ActivityScore, 'id'>;
  tests!: EntityTable<TestRecord, 'id'>;
  testScores!: EntityTable<TestScore, 'id'>;
  attendance!: EntityTable<Attendance, 'id'>;
  settings!: EntityTable<Setting, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'queueId'>;
  syncState!: EntityTable<SyncState, 'key'>;
  localSessions!: EntityTable<LocalSessionMetadata, 'profileId'>;
  devices!: EntityTable<DeviceMetadata, 'deviceId'>;

  constructor() {
    super('ai-smart-classroom');
    this.version(1).stores({
      academicTerms: 'id, schoolId, status, [schoolId+academicYear+term]',
      classes: 'id, schoolId, academicTermId, status',
      students: 'id, schoolId, studentCode, profileId, status, deletedAt',
      enrollments: 'id, schoolId, studentId, classId, academicTermId, status, [classId+status]',
      assignments: 'id, schoolId, classId, status, dueAt, deletedAt',
      submissions: 'id, schoolId, assignmentId, studentId, [assignmentId+studentId], status',
      activities: 'id, schoolId, classId, status, activityDate',
      activityScores: 'id, schoolId, activityId, studentId, [activityId+studentId]',
      tests: 'id, schoolId, classId, status, testDate',
      testScores: 'id, schoolId, testId, studentId, [testId+studentId]',
      attendance: 'id, schoolId, classId, studentId, attendanceDate, [classId+attendanceDate], [classId+studentId+attendanceDate]',
      settings: 'id, schoolId, scopeType, scopeId, key, [schoolId+scopeType+key]',
      syncQueue: 'queueId, schoolId, entityType, entityId, status, nextRetryAt, createdAt',
      syncState: 'key, schoolId, deviceId',
      localSessions: 'profileId, schoolId, role, trustedUntil',
      devices: 'deviceId, schoolId, status'
    });
    // v2 adds read/write projections for the entities managed by trusted server RPCs
    // (teachers, class assignment, parent links). Sync-push entity types are unchanged.
    this.version(2).stores({
      teachers: 'id, schoolId, teacherCode, profileId, status, deletedAt',
      classTeachers: 'id, schoolId, classId, teacherId, [classId+teacherId]',
      parentLinks: 'id, schoolId, studentId, status, lineUserId, deletedAt'
    });
    // v3 adds subjects (learning areas a school can extend) and in-app classroom notifications.
    this.version(3).stores({
      subjects: 'id, schoolId, code, status, sortOrder, deletedAt',
      notifications: 'id, schoolId, studentId, classId, assignmentId, kind, readAt, createdAt'
    });
    // v4 stores attachment bytes locally; blobs never enter the sync queue.
    this.version(4).stores({
      attachments: 'id, schoolId, ownerType, ownerId, [ownerType+ownerId], createdAt, deletedAt'
    });
    // v5 carries the academic workflow: rubrics, submission history, personal deadlines,
    // announcements, delivery preferences and the local mirror of the academic audit trail.
    this.version(5).stores({
      rubrics: 'id, schoolId, subjectId, status, deletedAt',
      rubricScores: 'id, schoolId, assignmentId, studentId, criterionId, [assignmentId+studentId], deletedAt',
      submissionVersions: 'id, schoolId, assignmentId, studentId, [assignmentId+studentId], versionNumber, submittedAt',
      deadlineExtensions: 'id, schoolId, assignmentId, studentId, [assignmentId+studentId], dueAt',
      announcements: 'id, schoolId, classId, createdAt, deletedAt',
      notificationPreferences: 'id, schoolId, profileId',
      academicAudit: 'id, schoolId, action, assignmentId, studentId, occurredAt'
    }).upgrade(async (transaction) => {
      // Classes gain a capacity; existing rows keep working with the default preset.
      await transaction.table('classes').toCollection().modify((row: { capacity?: number }) => {
        row.capacity ??= 40;
      });
      await transaction.table('assignments').toCollection().modify((row: Record<string, unknown>) => {
        row.workType ??= 'assignment';
        row.reminderOffsets ??= [0, 1440, 180];
        row.publishedAt ??= row.status === 'published' ? row.updatedAt : null;
        row.startAt ??= null;
        row.rubricId ??= null;
        row.cancelledAt ??= null;
      });
      await transaction.table('submissions').toCollection().modify((row: Record<string, unknown>) => {
        row.version ??= 1;
        row.openedAt ??= null;
        row.acknowledgedAt ??= null;
        row.revisionNote ??= '';
        row.percentage ??= null;
        row.calculatedGrade ??= null;
        row.finalGrade ??= null;
        row.gradeOverrideReason ??= '';
        row.gradedBy ??= null;
        row.gradedAt ??= null;
      });
      await transaction.table('notifications').toCollection().modify((row: Record<string, unknown>) => {
        row.dedupeKey ??= String(row.id);
        row.state ??= row.readAt ? 'read' : 'delivered';
        row.scheduledAt ??= row.createdAt;
        row.sentAt ??= row.createdAt;
      });
    });
    // v6 adds the queue index used by school-scoped pending/blocked diagnostics.
    // Dexie upgrades indexes in place and preserves every unsynced queue record.
    this.version(6).stores({
      syncQueue: 'queueId, schoolId, entityType, entityId, status, [schoolId+status], nextRetryAt, createdAt'
    });
    // v7 adds the weekly timetable and the positive achievement record, and mirrors the server's
    // teacher verification lifecycle locally so the UI can show where a teacher stands offline.
    this.version(7).stores({
      timetable: 'id, schoolId, classId, teacherId, academicTermId, dayOfWeek, [classId+dayOfWeek], [academicTermId+classId], status, deletedAt',
      achievements: 'id, schoolId, studentId, achievementKey, dedupeKey, awardedAt, deletedAt'
    }).upgrade(async (transaction) => {
      // Existing local teachers were created before verification existed. Treating them as verified
      // matches the server migration, which grandfathers the same rows instead of locking them out.
      await transaction.table('teachers').toCollection().modify((row: { verificationStatus?: string }) => {
        row.verificationStatus ??= 'verified_teacher';
      });
    });
    // v8 indexes the two lookups the timetable and the award pass do on every write: one class's
    // week within a term, and one badge's dedupe key. Dexie adds indexes in place; no row moves.
    this.version(8).stores({
      timetable: 'id, schoolId, classId, teacherId, academicTermId, dayOfWeek, [classId+dayOfWeek], [academicTermId+classId], [schoolId+academicTermId], status, deletedAt',
      achievements: 'id, schoolId, studentId, achievementKey, dedupeKey, [schoolId+dedupeKey], awardedAt, deletedAt'
    });
    // v9 records what each roster import did. It stays on the device that ran it: the students it
    // created travel through the ordinary sync queue, and this is only the receipt for them.
    this.version(9).stores({
      importRuns: 'id, schoolId, startedAt, target'
    });
    // v10 stores individual and bonus score awards. One award is one row, so this table is
    // append-mostly and doubles as the history a teacher inspects.
    this.version(LOCAL_SCHEMA_VERSION).stores({
      scoreEvents: 'id, schoolId, studentId, classId, subjectId, category, occurredAt, [schoolId+studentId], [schoolId+classId], deletedAt'
    });
  }
}

export const db = new SmartClassroomDatabase();
