import type {
  AcademicAuditAction, AcademicAuditEntry, AcademicTerm, Activity, ActivityScore, Announcement, Assignment, Attachment,
  AttachmentOwner, Attendance, AttendanceStatus, AvatarConfig, ClassTeacher, Classroom, ClassroomNotification,
  DeadlineExtension, Enrollment, ImportRun, NotificationPreference, ParentLink, Rubric, Setting, Student, StudentAchievement,
  Subject, Submission, SyncRecord, Teacher, TestRecord, TestScore, TimetableEntry
} from '../domain/types';
import { auditEntry, planCancellation, planPublish, planScoring, planSubmission, planWorkUpdate } from './academicOps';
import { defaultReminderOffsets, dueReminders } from '../academic/reminderEngine';
import { gradeSchemeFrom, resolveGrade } from '../academic/gradeScheme';
import { validateRubric } from '../academic/rubric';
import { effectiveDueAt } from '../academic/workStatus';
import { isValidAvatarId } from '../features/avatars/avatarCatalog';
import { attachmentKindFor } from './attachmentKind';
import { buildFixtureData, FIXTURE_SCHOOL_ID, type FixtureData } from './fixtures/schoolFixture';
import {
  MAX_ATTACHMENT_BYTES, MAX_PROFILE_PHOTO_BYTES, newId, nowIso,
  type AcademicTermInput, type AchievementInput, type ActivityInput, type AttachmentInput, type AssignmentInput, type AttendanceInput, type ImportRunInput,
  type ClassInput, type DevelopmentClearResult, type DevelopmentSeedInput, type DevelopmentSeedResult, type NotificationInput,
  type AnnouncementInput, type NotificationPreferenceInput, type ParentAccountInput, type ParentLinkInput, type PromotionInput,
  type PromotionResult, type RubricInput, type SchoolRepository, type SchoolSnapshot, type ScoreInput,
  type ScoreSubmissionInput, type StudentInput, type SubjectInput, type SubmissionInput, type TeacherInput,
  type TestInput, type TimetableInput
} from './schoolRepository';

/**
 * Development-only implementation backed by in-memory fixtures. It never touches Dexie, Supabase or
 * the sync queue, so preview edits cannot leak into a real school. State lives for the lifetime of
 * the tab and resets on reload.
 */
export class FixtureSchoolRepository implements SchoolRepository {
  readonly kind = 'fixture' as const;
  readonly canManageStructure = true;
  readonly schoolId = FIXTURE_SCHOOL_ID;

  private data: FixtureData;
  private listeners = new Set<(snapshot: SchoolSnapshot) => void>();
  private blobs = new Map<string, Blob>();
  private importRuns: ImportRun[] = [];

  constructor(data: FixtureData = buildFixtureData()) {
    this.data = data;
  }

  get primaryClassId(): string { return this.data.primaryClassId; }
  get memberships() { return this.data.memberships; }

  private snapshot(): SchoolSnapshot {
    const data = this.data;
    return structuredClone({
      ready: data.ready, terms: data.terms, classes: data.classes, subjects: data.subjects, teachers: data.teachers,
      classTeachers: data.classTeachers, students: data.students, enrollments: data.enrollments,
      assignments: data.assignments, submissions: data.submissions, activities: data.activities,
      activityScores: data.activityScores, tests: data.tests, testScores: data.testScores,
      attendance: data.attendance, parentLinks: data.parentLinks, attachments: data.attachments,
      notifications: data.notifications, rubrics: data.rubrics, rubricScores: data.rubricScores,
      submissionVersions: data.submissionVersions, deadlineExtensions: data.deadlineExtensions,
      announcements: data.announcements, notificationPreferences: data.notificationPreferences,
      academicAudit: data.academicAudit, timetable: data.timetable, achievements: data.achievements,
      settings: data.settings, pendingSync: data.pendingSync, blockedSync: data.blockedSync
    });
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  subscribe(listener: (snapshot: SchoolSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  private base(id?: string): SyncRecord {
    const timestamp = nowIso();
    return { id: id ?? newId(), schoolId: this.schoolId, version: 1, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
  }

  private upsert<T extends { id: string }>(collection: T[], next: T): T[] {
    const index = collection.findIndex((item) => item.id === next.id);
    if (index < 0) return [...collection, next];
    const copy = [...collection];
    copy[index] = next;
    return copy;
  }

  async saveStudent(input: StudentInput): Promise<void> {
    const existing = this.data.students.find((item) => item.id === input.id);
    const next: Student = {
      ...(existing ?? this.base(input.id)),
      profileId: existing?.profileId ?? null,
      studentCode: input.studentCode, displayName: input.displayName, avatarIndex: input.avatarIndex,
      avatarConfig: input.avatarConfig ?? existing?.avatarConfig ?? null,
      avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      status: input.status ?? existing?.status ?? 'active',
      updatedAt: nowIso()
    };
    this.data.students = this.upsert(this.data.students, next);
    this.emit();
  }

  async saveStudentAvatar(studentId: string, config: AvatarConfig): Promise<void> {
    const existing = this.data.students.find((item) => item.id === studentId);
    if (!existing) return;
    this.data.students = this.upsert(this.data.students, { ...existing, avatarConfig: config, updatedAt: nowIso() });
    this.emit();
  }

  async removeStudent(studentId: string): Promise<void> {
    this.data.students = this.data.students.filter((item) => item.id !== studentId);
    this.data.enrollments = this.data.enrollments.filter((item) => item.studentId !== studentId);
    this.emit();
  }

  async recordImportRun(input: ImportRunInput): Promise<void> {
    this.importRuns.unshift({
      id: crypto.randomUUID(), schoolId: this.schoolId, target: input.target,
      actorProfileId: input.actorProfileId, fileName: input.fileName, fileKind: input.fileKind,
      startedAt: input.startedAt, finishedAt: new Date().toISOString(), rowsDetected: input.rowsDetected,
      created: input.created, updated: input.updated, skipped: input.skipped, failed: input.failed,
      notes: input.notes ?? ''
    });
  }

  async listImportRuns(limit = 20): Promise<ImportRun[]> {
    return this.importRuns.slice(0, limit);
  }

  async setAttendance(input: AttendanceInput): Promise<void> {
    const existing = this.data.attendance.find((item) =>
      item.classId === input.classId && item.studentId === input.studentId && item.attendanceDate === input.attendanceDate);
    const next: Attendance = {
      ...(existing ?? this.base()),
      classId: input.classId, studentId: input.studentId, attendanceDate: input.attendanceDate,
      status: input.status, note: input.note ?? existing?.note ?? '', updatedAt: nowIso()
    };
    this.data.attendance = this.upsert(this.data.attendance, next);
    this.emit();
  }

  async setAttendanceForStudents(classId: string, attendanceDate: string, status: AttendanceStatus, studentIds: string[]): Promise<void> {
    for (const studentId of studentIds) {
      const existing = this.data.attendance.find((item) =>
        item.classId === classId && item.studentId === studentId && item.attendanceDate === attendanceDate);
      const next: Attendance = {
        ...(existing ?? this.base()),
        classId, studentId, attendanceDate, status, note: existing?.note ?? '', updatedAt: nowIso()
      };
      this.data.attendance = this.upsert(this.data.attendance, next);
    }
    this.emit();
  }

  async saveClass(input: ClassInput): Promise<void> {
    const existing = this.data.classes.find((item) => item.id === input.id);
    const next: Classroom = {
      ...(existing ?? this.base(input.id)),
      academicTermId: input.academicTermId, name: input.name, gradeLevel: input.gradeLevel,
      capacity: input.capacity ?? existing?.capacity ?? 40,
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    this.data.classes = this.upsert(this.data.classes, next);
    this.emit();
  }

  async archiveClass(classId: string): Promise<void> {
    const existing = this.data.classes.find((item) => item.id === classId);
    if (!existing) return;
    this.data.classes = this.upsert(this.data.classes, { ...existing, status: 'archived', updatedAt: nowIso() });
    this.emit();
  }

  async restoreClass(classId: string): Promise<void> {
    const existing = this.data.classes.find((item) => item.id === classId);
    if (!existing) return;
    this.data.classes = this.upsert(this.data.classes, { ...existing, status: 'active', deletedAt: null, updatedAt: nowIso() });
    this.emit();
  }

  async deleteClass(classId: string): Promise<void> {
    const enrolled = this.data.enrollments.filter((item) => item.classId === classId && item.status === 'active').length;
    if (enrolled > 0) throw new Error(`ยังมีนักเรียน ${enrolled} คนอยู่ในห้องนี้ ย้ายห้องก่อนจึงจะลบได้`);
    this.data.classes = this.data.classes.filter((item) => item.id !== classId);
    this.data.classTeachers = this.data.classTeachers.filter((item) => item.classId !== classId);
    this.emit();
  }

  async saveSubject(input: SubjectInput): Promise<void> {
    const existing = this.data.subjects.find((item) => item.id === input.id);
    const next: Subject = {
      ...(existing ?? this.base(input.id)),
      code: input.code, name: input.name, nameEn: input.nameEn ?? existing?.nameEn ?? '',
      colorIndex: input.colorIndex, iconKey: input.iconKey,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? this.data.subjects.length,
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    this.data.subjects = this.upsert(this.data.subjects, next);
    this.emit();
  }

  async archiveSubject(subjectId: string): Promise<void> {
    const existing = this.data.subjects.find((item) => item.id === subjectId);
    if (!existing) return;
    this.data.subjects = this.upsert(this.data.subjects, { ...existing, status: 'archived', updatedAt: nowIso() });
    this.emit();
  }

  async saveAcademicTerm(input: AcademicTermInput): Promise<void> {
    if (input.endsOn < input.startsOn) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มภาคเรียน');
    const existing = this.data.terms.find((item) => item.id === input.id);
    const next: AcademicTerm = {
      ...(existing ?? this.base(input.id)),
      academicYear: input.academicYear.trim(), term: input.term.trim(),
      startsOn: input.startsOn, endsOn: input.endsOn, status: input.status, updatedAt: nowIso()
    };
    if (input.status === 'active') {
      this.data.terms = this.data.terms.map((term) => term.id === next.id || term.status !== 'active'
        ? term : { ...term, status: 'closed', updatedAt: nowIso() });
    }
    this.data.terms = this.upsert(this.data.terms, next);
    this.emit();
  }

  async saveTeacher(input: TeacherInput): Promise<void> {
    const existing = this.data.teachers.find((item) => item.id === input.id);
    const next: Teacher = {
      ...(existing ?? this.base(input.id)),
      profileId: existing?.profileId ?? null, avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      teacherCode: input.teacherCode, displayName: input.displayName,
      email: input.email, subject: input.subject,
      verificationStatus: existing?.verificationStatus ?? 'verified_teacher',
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    this.data.teachers = this.upsert(this.data.teachers, next);
    this.emit();
  }

  async verifyTeacher(teacherId: string, reason: string): Promise<void> {
    if (reason.trim().length < 4) throw new Error('ต้องระบุเหตุผลอย่างน้อย 4 ตัวอักษร');
    const existing = this.data.teachers.find((item) => item.id === teacherId);
    if (!existing) throw new Error('ไม่พบครูคนนี้');
    this.data.teachers = this.upsert(this.data.teachers, {
      ...existing, verificationStatus: 'verified_teacher', status: 'active', updatedAt: nowIso()
    });
    this.emit();
  }

  async assignTeacher(classId: string, teacherId: string, role: ClassTeacher['role']): Promise<void> {
    const existing = this.data.classTeachers.find((item) => item.classId === classId && item.teacherId === teacherId);
    const next: ClassTeacher = { ...(existing ?? this.base()), classId, teacherId, role, updatedAt: nowIso() };
    this.data.classTeachers = this.upsert(this.data.classTeachers, next);
    this.emit();
  }

  async unassignTeacher(classTeacherId: string): Promise<void> {
    this.data.classTeachers = this.data.classTeachers.filter((item) => item.id !== classTeacherId);
    this.emit();
  }

  async enrollStudent(studentId: string, classId: string, academicTermId: string): Promise<void> {
    const existing = this.data.enrollments.find((item) => item.studentId === studentId && item.classId === classId);
    const next: Enrollment = {
      ...(existing ?? this.base()),
      studentId, classId, academicTermId, status: 'active',
      enrolledAt: existing?.enrolledAt ?? nowIso(), leftAt: null, updatedAt: nowIso()
    };
    this.data.enrollments = this.upsert(this.data.enrollments, next);
    this.emit();
  }

  async transferStudent(studentId: string, toClassId: string, academicTermId: string): Promise<void> {
    const current = this.data.enrollments.find((item) => item.studentId === studentId && item.status === 'active');
    if (current && current.classId !== toClassId) {
      this.data.enrollments = this.upsert(this.data.enrollments, { ...current, status: 'transferred', leftAt: nowIso(), updatedAt: nowIso() });
    }
    await this.enrollStudent(studentId, toClassId, academicTermId);
  }

  async saveAssignment(input: AssignmentInput): Promise<void> {
    const existing = this.data.assignments.find((item) => item.id === input.id);
    const next: Assignment = {
      ...(existing ?? this.base(input.id)),
      classId: input.classId, subjectId: input.subjectId,
      workType: input.workType ?? existing?.workType ?? 'assignment',
      title: input.title, description: input.description,
      instructions: input.instructions ?? existing?.instructions ?? '',
      assignedAt: existing?.assignedAt ?? nowIso(),
      startAt: input.startAt ?? existing?.startAt ?? null,
      dueAt: input.dueAt, maxScore: input.maxScore,
      rubricId: input.rubricId ?? existing?.rubricId ?? null,
      reminderOffsets: input.reminderOffsets ?? existing?.reminderOffsets ?? defaultReminderOffsets(input.workType ?? 'assignment'),
      status: input.status,
      publishedAt: existing?.publishedAt ?? null,
      cancelledAt: existing?.cancelledAt ?? null,
      updatedAt: nowIso()
    };
    this.data.assignments = this.upsert(this.data.assignments, next);
    if (existing && existing.status === 'published') {
      // A published change has to reach the students and rebuild the reminder schedule.
      const update = planWorkUpdate(existing, next, this.publishContext(next), (id) => this.base(id));
      this.data.notifications = [
        ...this.data.notifications.filter((item) => !update.removeNotificationIds.includes(item.id)),
        ...update.notifications
      ];
      if (existing.dueAt !== next.dueAt) {
        this.recordAudit('DEADLINE_CHANGED', {
          assignmentId: next.id, oldValue: existing.dueAt ?? '', newValue: next.dueAt ?? '', reason: ''
        });
      }
    }
    this.emit();
  }

  async setAssignmentStatus(assignmentId: string, status: Assignment['status']): Promise<void> {
    const existing = this.data.assignments.find((item) => item.id === assignmentId);
    if (!existing) return;
    this.data.assignments = this.upsert(this.data.assignments, { ...existing, status, updatedAt: nowIso() });
    this.emit();
  }

  private rosterFor(classId: string): string[] {
    return this.data.enrollments
      .filter((item) => item.classId === classId && item.status === 'active')
      .map((item) => item.studentId);
  }

  private publishContext(work: Assignment, studentIds?: string[]) {
    return {
      work,
      studentIds: studentIds ?? this.rosterFor(work.classId),
      existingSubmissions: this.data.submissions,
      existingNotifications: this.data.notifications,
      extensions: this.data.deadlineExtensions,
      preferences: this.data.notificationPreferences,
      students: this.data.students
    };
  }

  private recordAudit(action: AcademicAuditAction, fields: {
    assignmentId?: string | null; studentId?: string | null; oldValue?: string; newValue?: string; reason?: string;
    actorProfileId?: string;
  }): void {
    const entry: AcademicAuditEntry = auditEntry(this.base(), {
      action,
      actorProfileId: fields.actorProfileId ?? 'preview',
      assignmentId: fields.assignmentId ?? null,
      studentId: fields.studentId ?? null,
      oldValue: fields.oldValue ?? '',
      newValue: fields.newValue ?? '',
      reason: fields.reason ?? '',
      occurredAt: nowIso()
    });
    this.data.academicAudit = [...this.data.academicAudit, entry];
  }

  async publishAssignment(assignmentId: string, studentIds: string[]): Promise<void> {
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (!work) return;
    const plan = planPublish(this.publishContext(work, studentIds), (id) => this.base(id));
    this.data.assignments = this.upsert(this.data.assignments, plan.work);
    this.data.submissions = [...this.data.submissions, ...plan.submissions];
    this.data.notifications = [
      ...this.data.notifications.filter((item) => !plan.removeNotificationIds.includes(item.id)),
      ...plan.notifications
    ];
    this.recordAudit('ASSIGNMENT_PUBLISHED', { assignmentId, newValue: plan.work.title });
    this.emit();
  }

  async cancelAssignment(assignmentId: string, reason: string, actorProfileId: string): Promise<void> {
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (!work) return;
    const cancelled: Assignment = { ...work, status: 'cancelled', cancelledAt: nowIso(), updatedAt: nowIso() };
    const plan = planCancellation(cancelled, this.publishContext(cancelled), reason, (id) => this.base(id));
    this.data.assignments = this.upsert(this.data.assignments, cancelled);
    this.data.notifications = [
      ...this.data.notifications.filter((item) => !plan.removeNotificationIds.includes(item.id)),
      ...plan.notifications
    ];
    this.recordAudit('ASSIGNMENT_CANCELLED', { assignmentId, reason, actorProfileId });
    this.emit();
  }

  private submissionHead(assignmentId: string, studentId: string): Submission | undefined {
    return this.data.submissions.find((item) => item.assignmentId === assignmentId && item.studentId === studentId);
  }

  private ensureSubmission(assignmentId: string, studentId: string): Submission {
    const existing = this.submissionHead(assignmentId, studentId);
    if (existing) return existing;
    const created: Submission = {
      ...this.base(), assignmentId, studentId, submittedAt: null, status: 'not_started', score: null, isLate: false,
      teacherNote: '', studentNote: '', version: 0, openedAt: null, acknowledgedAt: null, revisionNote: '',
      percentage: null, calculatedGrade: null, finalGrade: null, gradeOverrideReason: '', gradedBy: null, gradedAt: null
    };
    this.data.submissions = [...this.data.submissions, created];
    return created;
  }

  async markWorkOpened(assignmentId: string, studentId: string): Promise<void> {
    const submission = this.ensureSubmission(assignmentId, studentId);
    if (submission.openedAt) return;
    this.data.submissions = this.upsert(this.data.submissions, { ...submission, openedAt: nowIso(), updatedAt: nowIso() });
    this.emit();
  }

  async acknowledgeWork(assignmentId: string, studentId: string): Promise<void> {
    const submission = this.ensureSubmission(assignmentId, studentId);
    if (submission.acknowledgedAt) return;
    const timestamp = nowIso();
    this.data.submissions = this.upsert(this.data.submissions, {
      ...submission,
      openedAt: submission.openedAt ?? timestamp,
      acknowledgedAt: timestamp,
      status: submission.status === 'not_started' ? 'in_progress' : submission.status,
      updatedAt: timestamp
    });
    this.emit();
  }

  async requestRevision(assignmentId: string, studentId: string, note: string, actorProfileId: string): Promise<void> {
    const submission = this.submissionHead(assignmentId, studentId);
    if (!submission) return;
    const timestamp = nowIso();
    this.data.submissions = this.upsert(this.data.submissions, {
      ...submission, status: 'revision_requested', revisionNote: note, teacherNote: note, updatedAt: timestamp
    });
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (work) {
      await this.notifyStudents({
        studentIds: [studentId], classId: work.classId, assignmentId, kind: 'revision_requested',
        title: 'ขอแก้ไขงาน: ' + work.title, body: note || 'ครูขอให้แก้ไขและส่งใหม่'
      });
    }
    this.recordAudit('REVISION_REQUESTED', { assignmentId, studentId, reason: note, actorProfileId });
    this.emit();
  }

  async grantExtension(assignmentId: string, studentId: string, dueAt: string, reason: string, actorProfileId: string): Promise<void> {
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (!work) return;
    const existing = this.data.deadlineExtensions.find((item) => item.assignmentId === assignmentId && item.studentId === studentId);
    const extension: DeadlineExtension = {
      ...(existing ?? this.base()),
      assignmentId, studentId, dueAt, reason, grantedBy: actorProfileId, updatedAt: nowIso()
    };
    this.data.deadlineExtensions = this.upsert(this.data.deadlineExtensions, extension);

    // The personal deadline replaces the class one for this student's future reminders only.
    const update = planWorkUpdate(work, work, this.publishContext(work, [studentId]), (id) => this.base(id));
    this.data.notifications = [
      ...this.data.notifications.filter((item) => !update.removeNotificationIds.includes(item.id)),
      ...update.notifications
    ];
    this.recordAudit('STUDENT_EXTENSION_CREATED', {
      assignmentId, studentId, oldValue: work.dueAt ?? '', newValue: dueAt, reason, actorProfileId
    });
    this.emit();
  }

  async scoreSubmission(input: ScoreSubmissionInput): Promise<void> {
    const work = this.data.assignments.find((item) => item.id === input.assignmentId);
    if (!work) return;
    const rubric = work.rubricId ? this.data.rubrics.find((item) => item.id === work.rubricId) ?? null : null;
    const outcome = planScoring(work, this.submissionHead(input.assignmentId, input.studentId), input.studentId, {
      ...(input.score === undefined ? {} : { score: input.score }),
      rubric,
      ...(input.rubricEntries ? { rubricEntries: input.rubricEntries } : {}),
      ...(input.teacherNote === undefined ? {} : { teacherNote: input.teacherNote }),
      gradedBy: input.gradedBy,
      scheme: gradeSchemeFrom(this.data.settings),
      existingRubricScores: this.data.rubricScores
    }, (id) => this.base(id));

    this.data.submissions = this.upsert(this.data.submissions, outcome.submission);
    for (const score of outcome.rubricScores) this.data.rubricScores = this.upsert(this.data.rubricScores, score);
    for (const entry of outcome.audit) {
      this.recordAudit(entry.action, {
        assignmentId: input.assignmentId, studentId: input.studentId,
        oldValue: entry.oldValue, newValue: entry.newValue, actorProfileId: input.gradedBy
      });
    }
    await this.notifyStudents({
      studentIds: [input.studentId], classId: work.classId, assignmentId: work.id, kind: 'grade_posted',
      title: 'ตรวจงานแล้ว: ' + work.title,
      body: 'ได้ ' + (outcome.submission.score ?? 0) + '/' + work.maxScore + ' · เกรด ' + (outcome.submission.finalGrade ?? '-')
    });
  }

  async overrideGrade(assignmentId: string, studentId: string, finalGrade: string | null, reason: string, actorProfileId: string): Promise<void> {
    const submission = this.submissionHead(assignmentId, studentId);
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (!submission || !work) return;
    if (finalGrade && !reason.trim()) throw new Error('ต้องระบุเหตุผลในการปรับเกรด');

    const grade = resolveGrade(submission.score, work.maxScore, {
      ...(finalGrade ? { override: finalGrade } : {}),
      scheme: gradeSchemeFrom(this.data.settings)
    });
    this.data.submissions = this.upsert(this.data.submissions, {
      ...submission,
      percentage: grade.percentage,
      calculatedGrade: grade.calculatedGrade,
      finalGrade: grade.finalGrade,
      gradeOverrideReason: finalGrade ? reason : '',
      updatedAt: nowIso()
    });
    this.recordAudit(finalGrade ? 'GRADE_OVERRIDE' : 'GRADE_OVERRIDE_REMOVED', {
      assignmentId, studentId, oldValue: submission.finalGrade ?? '', newValue: grade.finalGrade ?? '',
      reason, actorProfileId
    });
    this.emit();
  }

  async saveRubric(input: RubricInput): Promise<void> {
    const existing = this.data.rubrics.find((item) => item.id === input.id);
    const next: Rubric = {
      ...(existing ?? this.base(input.id)),
      title: input.title.trim(), subjectId: input.subjectId,
      criteria: validateRubric(input.criteria), status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    this.data.rubrics = this.upsert(this.data.rubrics, next);
    this.emit();
  }

  async archiveRubric(rubricId: string): Promise<void> {
    const existing = this.data.rubrics.find((item) => item.id === rubricId);
    if (!existing) return;
    this.data.rubrics = this.upsert(this.data.rubrics, { ...existing, status: 'archived', updatedAt: nowIso() });
    this.emit();
  }

  async saveAnnouncement(input: AnnouncementInput): Promise<void> {
    const existing = this.data.announcements.find((item) => item.id === input.id);
    const next: Announcement = {
      ...(existing ?? this.base(input.id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title.trim(), body: input.body.trim(),
      studentIds: input.studentIds ?? [], createdBy: existing?.createdBy ?? 'preview', updatedAt: nowIso()
    };
    this.data.announcements = this.upsert(this.data.announcements, next);
    const audience = next.studentIds.length > 0 ? next.studentIds : this.rosterFor(next.classId);
    await this.notifyStudents({
      studentIds: audience, classId: next.classId, assignmentId: null, kind: 'announcement',
      title: 'ประกาศ: ' + next.title, body: next.body
    });
  }

  async saveNotificationPreference(input: NotificationPreferenceInput): Promise<void> {
    const existing = this.data.notificationPreferences.find((item) => item.profileId === input.profileId);
    const next: NotificationPreference = {
      ...(existing ?? this.base()),
      profileId: input.profileId,
      assignmentReminder: input.assignmentReminder,
      projectReminder: input.projectReminder,
      gradeNotification: input.gradeNotification,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
      updatedAt: nowIso()
    };
    this.data.notificationPreferences = this.upsert(this.data.notificationPreferences, next);
    this.emit();
  }

  async markAllNotificationsRead(studentId: string): Promise<void> {
    const timestamp = nowIso();
    this.data.notifications = this.data.notifications.map((item) =>
      item.studentId === studentId && !item.readAt && item.state !== 'scheduled'
        ? { ...item, readAt: timestamp, state: 'read' as const, updatedAt: timestamp }
        : item);
    this.emit();
  }

  async deliverDueReminders(now = new Date()): Promise<number> {
    const due = dueReminders(this.data.notifications, now);
    if (due.length === 0) return 0;
    const ids = new Set(due.map((item) => item.id));
    const timestamp = now.toISOString();
    this.data.notifications = this.data.notifications.map((item) =>
      ids.has(item.id) ? { ...item, state: 'delivered' as const, sentAt: timestamp, updatedAt: timestamp } : item);
    this.emit();
    return due.length;
  }

  /**
   * Profile photos are ordinary attachments owned by a profile, so they travel through the same
   * storage path, size limit and deletion rules as any other file the app keeps.
   */
  async saveOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent', file: File): Promise<void> {
    if (!file.type.startsWith('image/')) throw new Error('รองรับเฉพาะไฟล์รูปภาพ');
    if (file.size > MAX_PROFILE_PHOTO_BYTES) throw new Error('รูปโปรไฟล์ต้องไม่เกิน 5 MB');
    const owner = this.ownProfileRecord(actorProfileId, role);
    await this.addAttachment({ ownerType: 'profile', ownerId: owner.id, file, uploadedBy: actorProfileId });
    const uploaded = this.data.attachments.filter((item) => item.ownerType === 'profile' && item.ownerId === owner.id);
    const photo = uploaded[uploaded.length - 1]!;
    // Only the newest photo is kept, so an old one never lingers in storage.
    for (const stale of uploaded.slice(0, -1)) await this.removeAttachment(stale.id);
    this.applyOwnAvatar(owner, role, { avatarPhotoId: photo.id });
  }

  async clearOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent'): Promise<void> {
    const owner = this.ownProfileRecord(actorProfileId, role);
    for (const photo of this.data.attachments.filter((item) => item.ownerType === 'profile' && item.ownerId === owner.id)) {
      await this.removeAttachment(photo.id);
    }
    this.applyOwnAvatar(owner, role, { avatarPhotoId: null });
  }

  /** Finds the record the signed-in person owns, or refuses. */
  private ownProfileRecord(actorProfileId: string, role: 'teacher' | 'student' | 'parent'): { id: string } {
    const owner = role === 'student'
      ? this.data.students.find((item) => item.profileId === actorProfileId)
      : role === 'teacher'
        ? this.data.teachers.find((item) => item.profileId === actorProfileId)
        : this.data.parentLinks.find((item) => item.lineUserId === actorProfileId || item.id === actorProfileId);
    if (!owner) throw new Error('แก้ไขโปรไฟล์ได้เฉพาะบัญชีของตัวเองเท่านั้น');
    return owner;
  }

  private applyOwnAvatar(owner: { id: string }, role: 'teacher' | 'student' | 'parent', patch: { avatarId?: string; avatarPhotoId?: string | null }): void {
    const timestamp = nowIso();
    if (role === 'student') {
      const record = this.data.students.find((item) => item.id === owner.id)!;
      this.data.students = this.upsert(this.data.students, { ...record, ...patch, updatedAt: timestamp });
    } else if (role === 'teacher') {
      const record = this.data.teachers.find((item) => item.id === owner.id)!;
      this.data.teachers = this.upsert(this.data.teachers, { ...record, ...patch, updatedAt: timestamp });
    } else {
      const record = this.data.parentLinks.find((item) => item.id === owner.id)!;
      this.data.parentLinks = this.upsert(this.data.parentLinks, { ...record, ...patch, updatedAt: timestamp });
    }
    this.emit();
  }

  async saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void> {
    if (!isValidAvatarId(avatarId)) throw new Error('ไม่พบ avatar ที่เลือก');
    const timestamp = nowIso();
    if (role === 'student') {
      const student = this.data.students.find((item) => item.profileId === actorProfileId);
      if (!student) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
      this.data.students = this.upsert(this.data.students, { ...student, avatarId, updatedAt: timestamp });
    } else if (role === 'teacher') {
      const teacher = this.data.teachers.find((item) => item.profileId === actorProfileId);
      if (!teacher) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
      this.data.teachers = this.upsert(this.data.teachers, { ...teacher, avatarId, updatedAt: timestamp });
    } else {
      const link = this.data.parentLinks.find((item) => item.lineUserId === actorProfileId || item.id === actorProfileId);
      if (!link) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
      this.data.parentLinks = this.upsert(this.data.parentLinks, { ...link, avatarId, updatedAt: timestamp });
    }
    this.emit();
  }

  async saveSubmission(input: SubmissionInput): Promise<void> {
    const existing = this.data.submissions.find((item) =>
      item.assignmentId === input.assignmentId && item.studentId === input.studentId);
    const next: Submission = {
      ...(existing ?? this.base(input.id)),
      assignmentId: input.assignmentId, studentId: input.studentId,
      submittedAt: existing?.submittedAt ?? (['submitted', 'graded', 'returned'].includes(input.status) ? nowIso() : null),
      status: input.status, score: input.score, isLate: input.isLate,
      teacherNote: input.teacherNote, studentNote: input.studentNote ?? existing?.studentNote ?? '',
      version: existing?.version ?? 0,
      openedAt: existing?.openedAt ?? null,
      acknowledgedAt: existing?.acknowledgedAt ?? null,
      revisionNote: existing?.revisionNote ?? '',
      percentage: existing?.percentage ?? null,
      calculatedGrade: existing?.calculatedGrade ?? null,
      finalGrade: existing?.finalGrade ?? null,
      gradeOverrideReason: existing?.gradeOverrideReason ?? '',
      gradedBy: existing?.gradedBy ?? null,
      gradedAt: existing?.gradedAt ?? null,
      updatedAt: nowIso()
    };
    this.data.submissions = this.upsert(this.data.submissions, next);
    this.emit();
  }

  async submitWork(assignmentId: string, studentId: string, studentNote: string, isLate: boolean): Promise<void> {
    const work = this.data.assignments.find((item) => item.id === assignmentId);
    if (!work) return;
    void isLate; // lateness comes from the student's effective deadline, not from the caller
    const due = effectiveDueAt(work, studentId, this.data.deadlineExtensions);
    const plan = planSubmission(work, this.submissionHead(assignmentId, studentId), studentId, studentNote, due, (id) => this.base(id));
    this.data.submissions = this.upsert(this.data.submissions, plan.submission);
    this.data.submissionVersions = [...this.data.submissionVersions, plan.version];
    // A student who has handed the work in no longer needs the remaining reminders.
    this.data.notifications = this.data.notifications.filter((item) =>
      !(item.assignmentId === assignmentId && item.studentId === studentId && item.state === 'scheduled'));
    this.emit();
  }

  async returnWork(assignmentId: string, studentId: string, score: number | null, teacherNote: string): Promise<void> {
    const existing = this.data.submissions.find((item) => item.assignmentId === assignmentId && item.studentId === studentId);
    const assignment = this.data.assignments.find((item) => item.id === assignmentId);
    const next: Submission = {
      ...(existing ?? this.base()),
      assignmentId, studentId, submittedAt: existing?.submittedAt ?? nowIso(), status: 'returned',
      score, isLate: existing?.isLate ?? false, teacherNote,
      studentNote: existing?.studentNote ?? '',
      version: existing?.version ?? 0,
      openedAt: existing?.openedAt ?? null,
      acknowledgedAt: existing?.acknowledgedAt ?? null,
      revisionNote: existing?.revisionNote ?? '',
      percentage: existing?.percentage ?? null,
      calculatedGrade: existing?.calculatedGrade ?? null,
      finalGrade: existing?.finalGrade ?? null,
      gradeOverrideReason: existing?.gradeOverrideReason ?? '',
      gradedBy: existing?.gradedBy ?? null,
      gradedAt: existing?.gradedAt ?? null,
      updatedAt: nowIso()
    };
    this.data.submissions = this.upsert(this.data.submissions, next);
    if (assignment) {
      await this.notifyStudents({
        studentIds: [studentId], classId: assignment.classId, assignmentId, kind: 'work_returned',
        title: `ตรวจงานแล้ว: ${assignment.title}`,
        body: score === null ? 'ครูส่งงานคืนพร้อมความเห็น' : `ได้ ${score} จาก ${assignment.maxScore} คะแนน`
      });
      return;
    }
    this.emit();
  }

  async saveActivity(input: ActivityInput): Promise<void> {
    const existing = this.data.activities.find((item) => item.id === input.id);
    const next: Activity = {
      ...(existing ?? this.base(input.id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title, activityDate: input.activityDate,
      maxScore: input.maxScore, status: input.status, updatedAt: nowIso()
    };
    this.data.activities = this.upsert(this.data.activities, next);
    this.emit();
  }

  async saveActivityScores(activityId: string, scores: ScoreInput[]): Promise<void> {
    for (const entry of scores) {
      const existing = this.data.activityScores.find((item) => item.activityId === activityId && item.studentId === entry.studentId);
      const next: ActivityScore = {
        ...(existing ?? this.base()),
        activityId, studentId: entry.studentId, score: entry.score,
        note: entry.note ?? existing?.note ?? '', updatedAt: nowIso()
      };
      this.data.activityScores = this.upsert(this.data.activityScores, next);
    }
    this.emit();
  }

  async saveTest(input: TestInput): Promise<void> {
    const existing = this.data.tests.find((item) => item.id === input.id);
    const next: TestRecord = {
      ...(existing ?? this.base(input.id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title, testDate: input.testDate,
      maxScore: input.maxScore, status: input.status, updatedAt: nowIso()
    };
    this.data.tests = this.upsert(this.data.tests, next);
    this.emit();
  }

  async saveTestScores(testId: string, scores: ScoreInput[]): Promise<void> {
    for (const entry of scores) {
      const existing = this.data.testScores.find((item) => item.testId === testId && item.studentId === entry.studentId);
      const next: TestScore = {
        ...(existing ?? this.base()),
        testId, studentId: entry.studentId, score: entry.score,
        publishedAt: existing?.publishedAt ?? null, updatedAt: nowIso()
      };
      this.data.testScores = this.upsert(this.data.testScores, next);
    }
    this.emit();
  }

  async publishTestScores(testId: string): Promise<void> {
    const publishedAt = nowIso();
    this.data.testScores = this.data.testScores.map((item) =>
      item.testId === testId ? { ...item, publishedAt, updatedAt: publishedAt } : item);
    const test = this.data.tests.find((item) => item.id === testId);
    if (test) this.data.tests = this.upsert(this.data.tests, { ...test, status: 'published', updatedAt: publishedAt });
    this.emit();
  }

  async addAttachment(input: AttachmentInput): Promise<void> {
    if (input.file.size > MAX_ATTACHMENT_BYTES) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
    const meta: Attachment = {
      ...this.base(),
      ownerType: input.ownerType, ownerId: input.ownerId, uploadedBy: input.uploadedBy,
      fileName: input.file.name, mimeType: input.file.type, byteSize: input.file.size,
      kind: attachmentKindFor(input.file.name, input.file.type),
      // Preview shares files inside the tab only; nothing is uploaded anywhere.
      storagePath: `preview/${input.ownerType}/${input.ownerId}/${input.file.name}`
    };
    this.data.attachments = [...this.data.attachments, meta];
    this.blobs.set(meta.id, input.file);
    if (input.notify && input.notify.studentIds.length > 0) {
      await this.notifyStudents({
        studentIds: input.notify.studentIds, classId: input.notify.classId, assignmentId: input.notify.assignmentId,
        kind: 'assignment_published', title: input.notify.title, body: `ไฟล์ใหม่: ${input.file.name}`
      });
      return;
    }
    this.emit();
  }

  async refreshAttachments(_ownerType: AttachmentOwner, _ownerId: string): Promise<void> {
    // Fixture data is already complete in memory; nothing to pull.
    void _ownerType;
    void _ownerId;
  }

  async removeAttachment(attachmentId: string): Promise<void> {
    this.data.attachments = this.data.attachments.filter((item) => item.id !== attachmentId);
    this.blobs.delete(attachmentId);
    this.emit();
  }

  async openAttachment(attachmentId: string): Promise<Blob | null> {
    return this.blobs.get(attachmentId) ?? null;
  }

  async notifyStudents(input: NotificationInput): Promise<void> {
    const timestamp = nowIso();
    const rows: ClassroomNotification[] = input.studentIds.map((studentId) => ({
      ...this.base(),
      studentId, classId: input.classId, assignmentId: input.assignmentId,
      kind: input.kind, title: input.title, body: input.body,
      dedupeKey: input.dedupeKey ?? `${input.kind}:${input.assignmentId ?? 'none'}:${studentId}:${timestamp}`,
      state: 'delivered', scheduledAt: timestamp, sentAt: timestamp, readAt: null
    }));
    // Repeating the same notice (retry, resync, recalculated plan) must not create a second copy.
    const seen = new Set(this.data.notifications.map((item) => item.dedupeKey));
    this.data.notifications = [...this.data.notifications, ...rows.filter((row) => !seen.has(row.dedupeKey))];
    this.emit();
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    const existing = this.data.notifications.find((item) => item.id === notificationId);
    if (!existing) return;
    this.data.notifications = this.upsert(this.data.notifications, { ...existing, readAt: nowIso(), updatedAt: nowIso() });
    this.emit();
  }

  async saveParentLink(input: ParentLinkInput): Promise<void> {
    const existing = this.data.parentLinks.find((item) => item.id === input.id);
    const next: ParentLink = {
      ...(existing ?? this.base(input.id)),
      studentId: input.studentId, avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      parentName: input.parentName, relationship: input.relationship,
      contact: input.contact, lineUserId: existing?.lineUserId ?? null,
      status: input.status ?? existing?.status ?? 'invited',
      invitationCode: existing?.invitationCode ?? `PV-${Math.floor(100000 + Math.random() * 899999)}`,
      consentVersion: existing?.consentVersion ?? null, consentGrantedAt: existing?.consentGrantedAt ?? null,
      updatedAt: nowIso()
    };
    this.data.parentLinks = this.upsert(this.data.parentLinks, next);
    this.emit();
  }

  async saveParentAccount(input: ParentAccountInput): Promise<{ parentId: string }> {
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new Error('กรุณาระบุชื่อผู้ปกครองอย่างน้อย 2 ตัวอักษร');
    const existing = this.data.parentLinks.find((item) => item.id === input.id);
    const next: ParentLink = {
      ...(existing ?? this.base(input.id)),
      studentId: input.studentId, avatarId: existing?.avatarId ?? null, avatarPhotoId: existing?.avatarPhotoId ?? null,
      parentName: displayName, relationship: input.relationship, contact: input.phone ?? existing?.contact ?? '',
      lineUserId: existing?.lineUserId ?? null, status: existing?.status ?? 'invited',
      invitationCode: existing?.invitationCode ?? null,
      consentVersion: existing?.consentVersion ?? null, consentGrantedAt: existing?.consentGrantedAt ?? null,
      updatedAt: nowIso()
    };
    this.data.parentLinks = this.upsert(this.data.parentLinks, next);
    this.emit();
    return { parentId: next.id };
  }

  async setParentConsent(parentLinkId: string, granted: boolean, policyVersion: string): Promise<void> {
    const existing = this.data.parentLinks.find((item) => item.id === parentLinkId);
    if (!existing) return;
    this.data.parentLinks = this.upsert(this.data.parentLinks, {
      ...existing,
      consentVersion: granted ? policyVersion : null,
      consentGrantedAt: granted ? nowIso() : null,
      status: granted ? 'linked' : existing.status,
      updatedAt: nowIso()
    });
    this.emit();
  }

  async revokeParentLink(parentLinkId: string): Promise<void> {
    const existing = this.data.parentLinks.find((item) => item.id === parentLinkId);
    if (!existing) return;
    this.data.parentLinks = this.upsert(this.data.parentLinks, { ...existing, status: 'revoked', lineUserId: null, updatedAt: nowIso() });
    this.emit();
  }

  async saveSetting(key: string, valueJson: Record<string, unknown>): Promise<void> {
    const existing = this.data.settings.find((item) => item.key === key && item.scopeType === 'school');
    const next: Setting = {
      ...(existing ?? this.base()),
      scopeType: 'school', scopeId: null, key, valueJson, updatedAt: nowIso()
    };
    this.data.settings = this.upsert(this.data.settings, next);
    this.emit();
  }

  async promoteStudents(input: PromotionInput): Promise<PromotionResult> {
    if (input.fromTermId === input.toTermId) throw new Error('ปีการศึกษาต้นทางและปลายทางต้องต่างกัน');
    const result: PromotionResult = { promoted: 0, graduated: 0, skipped: 0 };
    for (const move of input.moves) {
      if (move.toClassId && !this.data.classes.some((row) => row.id === move.toClassId && row.academicTermId === input.toTermId)) {
        throw new Error('ห้องปลายทางไม่ได้อยู่ในปีการศึกษาที่เลือก');
      }
      const current = this.data.enrollments.find((row) =>
        row.studentId === move.studentId && row.academicTermId === input.fromTermId && row.status === 'active' && !row.deletedAt);
      if (!current) { result.skipped += 1; continue; }
      this.data.enrollments = this.upsert(this.data.enrollments, {
        ...current, status: move.toClassId ? 'promoted' : 'graduated', leftAt: nowIso(), updatedAt: nowIso()
      });
      if (!move.toClassId) { result.graduated += 1; continue; }
      this.data.enrollments = this.upsert(this.data.enrollments, {
        ...this.base(), studentId: move.studentId, classId: move.toClassId, academicTermId: input.toTermId,
        status: 'active', enrolledAt: nowIso(), leftAt: null
      } satisfies Enrollment);
      result.promoted += 1;
    }
    this.emit();
    return result;
  }

  async saveTimetableEntry(input: TimetableInput): Promise<void> {
    if (input.dayOfWeek < 1 || input.dayOfWeek > 7) throw new Error('วันในสัปดาห์ต้องอยู่ระหว่าง 1 ถึง 7');
    if (input.period < 1) throw new Error('คาบเรียนต้องเริ่มที่ 1');
    if (input.endTime <= input.startTime) throw new Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    const existing = this.data.timetable.find((item) => item.id === input.id);
    const clashes = this.data.timetable.filter((row) =>
      row.id !== existing?.id && !row.deletedAt && row.status === 'active' &&
      row.academicTermId === input.academicTermId && row.dayOfWeek === input.dayOfWeek && row.period === input.period);
    if (clashes.some((row) => row.classId === input.classId)) throw new Error('ห้องนี้มีคาบเรียนในช่วงเวลานี้แล้ว');
    if (input.teacherId && clashes.some((row) => row.teacherId === input.teacherId)) {
      throw new Error('ครูคนนี้ถูกจัดสอนคาบนี้ในห้องอื่นแล้ว');
    }
    const next: TimetableEntry = {
      ...(existing ?? this.base(input.id)),
      classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId,
      academicTermId: input.academicTermId, dayOfWeek: input.dayOfWeek, period: input.period,
      startTime: input.startTime, endTime: input.endTime, room: input.room ?? '',
      status: 'active', updatedAt: nowIso()
    };
    this.data.timetable = this.upsert(this.data.timetable, next);
    this.emit();
  }

  async removeTimetableEntry(entryId: string): Promise<void> {
    this.data.timetable = this.data.timetable.filter((item) => item.id !== entryId);
    this.emit();
  }

  async awardAchievement(input: AchievementInput): Promise<void> {
    const dedupeKey = input.dedupeKey ?? `${input.studentId}:${input.achievementKey}`;
    if (this.data.achievements.some((item) => item.dedupeKey === dedupeKey && !item.deletedAt)) return;
    const next: StudentAchievement = {
      ...this.base(),
      studentId: input.studentId, achievementKey: input.achievementKey, dedupeKey,
      note: input.note ?? '', awardedBy: input.awardedBy, awardedAt: nowIso()
    };
    this.data.achievements = this.upsert(this.data.achievements, next);
    this.emit();
  }

  // Preview already runs on fixtures, so seeding into it would only duplicate what is on screen.
  // Refusing here keeps the seeder's promise — that it writes through the real path — honest.
  async seedDevelopmentData(input: DevelopmentSeedInput): Promise<DevelopmentSeedResult> {
    void input;
    throw new Error('โหมด Preview ใช้ข้อมูลตัวอย่างอยู่แล้ว จึงไม่สร้างข้อมูลซ้ำ');
  }

  async clearDevelopmentData(): Promise<DevelopmentClearResult> {
    throw new Error('โหมด Preview ไม่มีข้อมูลที่ถูกสร้างโดย seeder ให้ลบ');
  }
}

let sharedFixtureRepository: FixtureSchoolRepository | null = null;

/** One shared instance per tab so preview edits survive navigation. */
export function getFixtureRepository(): FixtureSchoolRepository {
  sharedFixtureRepository ??= new FixtureSchoolRepository();
  return sharedFixtureRepository;
}

export function resetFixtureRepository(): void {
  sharedFixtureRepository = null;
}
