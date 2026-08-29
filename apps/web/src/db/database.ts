import Dexie, { type EntityTable } from 'dexie';
import type { AcademicTerm, Activity, ActivityScore, Assignment, Attendance, Classroom, DeviceMetadata, Enrollment, LocalSessionMetadata, Setting, Student, Submission, SyncQueueItem, SyncState, TestRecord, TestScore } from '../domain/types';

export const LOCAL_SCHEMA_VERSION = 1;

export class SmartClassroomDatabase extends Dexie {
  academicTerms!: EntityTable<AcademicTerm, 'id'>;
  classes!: EntityTable<Classroom, 'id'>;
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
    this.version(LOCAL_SCHEMA_VERSION).stores({
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
  }
}

export const db = new SmartClassroomDatabase();
