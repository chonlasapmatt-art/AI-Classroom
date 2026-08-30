import { liveQuery } from 'dexie';
import { db, type AttachmentRecord } from '../db/database';
import { attachmentKindFor } from './attachmentKind';
import { commitLocalMutation, softDeleteLocal } from '../db/localMutation';
import { isCloudConfigured, requireSupabase, supabase } from '../services/supabase';
import type {
  AcademicAuditAction, AcademicAuditEntry, AcademicTerm, Activity, ActivityScore, Announcement, Assignment, Attachment,
  AttachmentOwner, Attendance, AvatarConfig, ClassTeacher, Classroom, ClassroomNotification, DeadlineExtension,
  Enrollment, NotificationPreference, ParentLink, Rubric, Setting, Student, StudentAchievement, Subject, Submission,
  SyncRecord, Teacher, TestRecord, TestScore, TimetableEntry
} from '../domain/types';
import { auditEntry, planCancellation, planPublish, planScoring, planSubmission, planWorkUpdate } from './academicOps';
import { defaultReminderOffsets, dueReminders } from '../academic/reminderEngine';
import { gradeSchemeFrom, resolveGrade } from '../academic/gradeScheme';
import { validateRubric } from '../academic/rubric';
import { effectiveDueAt } from '../academic/workStatus';
import { isValidAvatarId } from '../features/avatars/avatarCatalog';
import {
  DEVELOPMENT_SEED_SETTING_KEY, emptySnapshot, MAX_ATTACHMENT_BYTES, MAX_PROFILE_PHOTO_BYTES, newId, nowIso,
  type AcademicTermInput, type AchievementInput, type ActivityInput, type AttachmentInput, type AssignmentInput, type AttendanceInput,
  type ClassInput, type DevelopmentClearResult, type DevelopmentSeedInput, type DevelopmentSeedResult,
  type NotificationInput, type AnnouncementInput, type NotificationPreferenceInput, type ParentAccountInput, type ParentLinkInput,
  type PromotionInput, type PromotionResult, type RubricInput, type SchoolRepository, type SchoolSnapshot,
  type ScoreInput, type ScoreSubmissionInput, type StudentInput, type SubjectInput, type SubmissionInput,
  type TeacherInput, type TestInput, type TimetableInput
} from './schoolRepository';

/** Shared bucket every classroom file lives in. */
export const CLASSROOM_FILES_BUCKET = 'classroom-files';

interface ClassFileRow {
  id: string; owner_type: string; owner_id: string; uploaded_by: string | null; file_name: string;
  mime_type: string; byte_size: number; kind: string; storage_path: string; created_at: string; updated_at: string;
}

function base(schoolId: string, id?: string): SyncRecord {
  const timestamp = nowIso();
  return { id: id ?? newId(), schoolId, version: 0, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
}

function stripBlob(row: AttachmentRecord): Attachment {
  const { blob, ...meta } = row;
  void blob;
  return meta;
}

function alive<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deletedAt);
}

/** What the development seeder created, so clearing removes exactly that and nothing else. */
interface SeedLedger {
  classes: string[]; students: string[]; teachers: string[];
  assignments: string[]; parentLinks: string[]; seededAt: string;
}

const SEED_SUBJECTS = ['คณิตศาสตร์', 'ภาษาไทย', 'วิทยาศาสตร์และเทคโนโลยี', 'ภาษาต่างประเทศ'];
const SEED_FIRST_NAMES = ['ปกรณ์', 'ชนากานต์', 'ธีรภัทร', 'พิมพ์ชนก', 'ณัฐวุฒิ', 'กันติชา', 'อรรถพล', 'ศิรินทิพย์'];
const SEED_LAST_NAMES = ['ทดสอบ', 'ตัวอย่าง', 'สาธิต', 'จำลอง', 'ทวีสุข', 'ศรีสมบัติ'];

/** Picks from a fixed sample list, wrapping around so any number of seeded rows stays labelled. */
function cycle(list: readonly string[], index: number): string { return list[index % list.length] ?? ''; }

/**
 * Local-first implementation. Reads come from the authorized Dexie projection, and writes go through
 * commitLocalMutation (queued for the trusted server mutation boundary) for every entity the sync
 * protocol accepts. Structural records (classes, subjects, teachers, parent links) are owned by the
 * server and are changed through security-definer RPCs, then mirrored into the local projection.
 * In-app notifications are a local delivery surface; the server keeps its own notification outbox.
 */
export class DexieSchoolRepository implements SchoolRepository {
  readonly kind = 'dexie' as const;
  readonly canManageStructure = isCloudConfigured;

  constructor(readonly schoolId: string) {}

  private async read(): Promise<SchoolSnapshot> {
    const schoolId = this.schoolId;
    const inSchool = { schoolId };
    const [terms, classes, subjects, teachers, classTeachers, students, enrollments, assignments, submissions,
      activities, activityScores, tests, testScores, attendance, parentLinks, attachments, notifications,
      rubrics, rubricScores, submissionVersions, deadlineExtensions, announcements, notificationPreferences,
      academicAudit, timetable, achievements, settings, pendingSync, blockedSync] = await Promise.all([
      db.academicTerms.where(inSchool).toArray(),
      db.classes.where(inSchool).toArray(),
      db.subjects.where(inSchool).toArray(),
      db.teachers.where(inSchool).toArray(),
      db.classTeachers.where(inSchool).toArray(),
      db.students.where(inSchool).toArray(),
      db.enrollments.where(inSchool).toArray(),
      db.assignments.where(inSchool).toArray(),
      db.submissions.where(inSchool).toArray(),
      db.activities.where(inSchool).toArray(),
      db.activityScores.where(inSchool).toArray(),
      db.tests.where(inSchool).toArray(),
      db.testScores.where(inSchool).toArray(),
      db.attendance.where(inSchool).toArray(),
      db.parentLinks.where(inSchool).toArray(),
      db.attachments.where(inSchool).toArray(),
      db.notifications.where(inSchool).toArray(),
      db.rubrics.where(inSchool).toArray(),
      db.rubricScores.where(inSchool).toArray(),
      db.submissionVersions.where(inSchool).toArray(),
      db.deadlineExtensions.where(inSchool).toArray(),
      db.announcements.where(inSchool).toArray(),
      db.notificationPreferences.where(inSchool).toArray(),
      db.academicAudit.where(inSchool).toArray(),
      db.timetable.where(inSchool).toArray(),
      db.achievements.where(inSchool).toArray(),
      db.settings.where(inSchool).toArray(),
      db.syncQueue.where({ schoolId, status: 'pending' }).count(),
      db.syncQueue.where({ schoolId, status: 'blocked' }).count()
    ]);
    return {
      ...emptySnapshot, ready: true,
      terms: alive(terms), classes: alive(classes), subjects: alive(subjects), teachers: alive(teachers),
      classTeachers: alive(classTeachers), students: alive(students), enrollments: alive(enrollments),
      assignments: alive(assignments), submissions: alive(submissions), activities: alive(activities),
      activityScores: alive(activityScores), tests: alive(tests), testScores: alive(testScores),
      attendance: alive(attendance), parentLinks: alive(parentLinks),
      attachments: alive(attachments).map((row) => stripBlob(row)),
      notifications: alive(notifications),
      rubrics: alive(rubrics), rubricScores: alive(rubricScores), submissionVersions,
      deadlineExtensions: alive(deadlineExtensions), announcements: alive(announcements),
      notificationPreferences, academicAudit,
      timetable: alive(timetable), achievements: alive(achievements),
      settings: alive(settings), pendingSync, blockedSync
    };
  }

  subscribe(listener: (snapshot: SchoolSnapshot) => void): () => void {
    const subscription = liveQuery(() => this.read()).subscribe({ next: listener });
    return () => subscription.unsubscribe();
  }

  private async rpc(name: string, params: Record<string, unknown>): Promise<void> {
    const { error } = await requireSupabase().rpc(name, params);
    if (error) throw new Error(error.message);
  }

  async saveStudent(input: StudentInput): Promise<void> {
    const existing = input.id ? await db.students.get(input.id) : undefined;
    const record: Student = {
      ...(existing ?? base(this.schoolId, input.id)),
      profileId: existing?.profileId ?? null,
      studentCode: input.studentCode,
      displayName: input.displayName,
      avatarIndex: input.avatarIndex,
      avatarConfig: input.avatarConfig ?? existing?.avatarConfig ?? null,
      avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      status: input.status ?? existing?.status ?? 'active',
      updatedAt: nowIso()
    };
    await commitLocalMutation('student', record);
  }

  async saveStudentAvatar(studentId: string, config: AvatarConfig): Promise<void> {
    const existing = await db.students.get(studentId);
    if (!existing) throw new Error('ไม่พบนักเรียนในเครื่อง');
    await commitLocalMutation('student', { ...existing, avatarConfig: config, updatedAt: nowIso() });
  }

  async removeStudent(studentId: string): Promise<void> {
    const record = await db.students.get(studentId);
    if (!record) throw new Error('ไม่พบนักเรียนในเครื่อง');
    await softDeleteLocal('student', record);
  }

  async setAttendance(input: AttendanceInput): Promise<void> {
    const existing = await db.attendance
      .where({ classId: input.classId, studentId: input.studentId, attendanceDate: input.attendanceDate })
      .first();
    const record: Attendance = {
      ...(existing ?? base(this.schoolId)),
      classId: input.classId, studentId: input.studentId, attendanceDate: input.attendanceDate,
      status: input.status, note: input.note ?? existing?.note ?? '', updatedAt: nowIso()
    };
    await commitLocalMutation('attendance', record);
  }

  async setAttendanceForStudents(classId: string, attendanceDate: string, status: AttendanceInput['status'], studentIds: string[]): Promise<void> {
    for (const studentId of studentIds) {
      await this.setAttendance({ classId, studentId, attendanceDate, status });
    }
  }

  async saveAcademicTerm(input: AcademicTermInput): Promise<void> {
    const id = input.id ?? newId();
    if (input.endsOn < input.startsOn) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มภาคเรียน');
    await this.rpc('upsert_academic_term', {
      p_school_id: this.schoolId, p_term_id: id, p_academic_year: input.academicYear.trim(),
      p_term: input.term.trim(), p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_status: input.status
    });
    const existing = await db.academicTerms.get(id);
    const record: AcademicTerm = {
      ...(existing ?? base(this.schoolId, id)),
      academicYear: input.academicYear.trim(), term: input.term.trim(),
      startsOn: input.startsOn, endsOn: input.endsOn, status: input.status, updatedAt: nowIso()
    };
    await db.academicTerms.put(record);
    if (input.status === 'active') {
      // Mirror what the server just did, so the local projection cannot show two active terms.
      const others = await db.academicTerms.where({ schoolId: this.schoolId }).toArray();
      for (const term of others) {
        if (term.id === id || term.status !== 'active') continue;
        await db.academicTerms.put({ ...term, status: 'closed', updatedAt: nowIso() });
      }
    }
  }

  async saveClass(input: ClassInput): Promise<void> {
    const id = input.id ?? newId();
    await this.rpc('upsert_class', {
      p_school_id: this.schoolId, p_class_id: id, p_academic_term_id: input.academicTermId,
      p_name: input.name, p_grade_level: input.gradeLevel
    });
    if (input.capacity !== undefined) {
      await this.rpc('set_class_capacity', {
        p_school_id: this.schoolId, p_class_id: id, p_capacity: input.capacity
      });
    }
    const existing = await db.classes.get(id);
    const record: Classroom = {
      ...(existing ?? base(this.schoolId, id)),
      academicTermId: input.academicTermId, name: input.name, gradeLevel: input.gradeLevel,
      capacity: input.capacity ?? existing?.capacity ?? 40,
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    await db.classes.put(record);
  }

  async archiveClass(classId: string): Promise<void> {
    await this.rpc('archive_class', { p_school_id: this.schoolId, p_class_id: classId });
    const existing = await db.classes.get(classId);
    if (existing) await db.classes.put({ ...existing, status: 'archived', updatedAt: nowIso() });
  }

  async restoreClass(classId: string): Promise<void> {
    await this.rpc('restore_class', { p_school_id: this.schoolId, p_class_id: classId });
    const existing = await db.classes.get(classId);
    if (existing) await db.classes.put({ ...existing, status: 'active', deletedAt: null, updatedAt: nowIso() });
  }

  async deleteClass(classId: string): Promise<void> {
    const enrolled = await db.enrollments.where({ classId, status: 'active' }).count();
    if (enrolled > 0) throw new Error(`ยังมีนักเรียน ${enrolled} คนอยู่ในห้องนี้ ย้ายห้องก่อนจึงจะลบได้`);
    await this.rpc('delete_class', { p_school_id: this.schoolId, p_class_id: classId });
    const existing = await db.classes.get(classId);
    if (existing) await db.classes.put({ ...existing, deletedAt: nowIso(), updatedAt: nowIso() });
  }

  async saveSubject(input: SubjectInput): Promise<void> {
    const id = input.id ?? newId();
    const existing = await db.subjects.get(id);
    const sortOrder = input.sortOrder ?? existing?.sortOrder ?? (await db.subjects.where({ schoolId: this.schoolId }).count());
    await this.rpc('upsert_subject', {
      p_school_id: this.schoolId, p_subject_id: id, p_code: input.code, p_name: input.name,
      p_name_en: input.nameEn ?? '', p_color_index: input.colorIndex, p_icon_key: input.iconKey, p_sort_order: sortOrder
    });
    const record: Subject = {
      ...(existing ?? base(this.schoolId, id)),
      code: input.code, name: input.name, nameEn: input.nameEn ?? existing?.nameEn ?? '',
      colorIndex: input.colorIndex, iconKey: input.iconKey, sortOrder,
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    await db.subjects.put(record);
  }

  async archiveSubject(subjectId: string): Promise<void> {
    await this.rpc('archive_subject', { p_school_id: this.schoolId, p_subject_id: subjectId });
    const existing = await db.subjects.get(subjectId);
    if (existing) await db.subjects.put({ ...existing, status: 'archived', updatedAt: nowIso() });
  }

  async saveTeacher(input: TeacherInput): Promise<void> {
    const id = input.id ?? newId();
    await this.rpc('upsert_teacher', {
      p_school_id: this.schoolId, p_teacher_id: id, p_teacher_code: input.teacherCode,
      p_display_name: input.displayName, p_email: input.email, p_subject: input.subject
    });
    const existing = await db.teachers.get(id);
    const record: Teacher = {
      ...(existing ?? base(this.schoolId, id)),
      profileId: existing?.profileId ?? null, avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      teacherCode: input.teacherCode, displayName: input.displayName,
      email: input.email, subject: input.subject,
      // A teacher the school typed in itself is already known to the school. The server applies the
      // same rule in upsert_teacher, so the local projection must not claim something stricter.
      verificationStatus: existing?.verificationStatus ?? 'verified_teacher',
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    await db.teachers.put(record);
  }

  async verifyTeacher(teacherId: string, reason: string): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length < 4) throw new Error('ต้องระบุเหตุผลอย่างน้อย 4 ตัวอักษร');
    // The server decides whether this caller may verify. Only after it accepts does the local
    // projection move, so a refused attempt leaves nothing behind that looks approved.
    await this.rpc('verify_teacher', { p_school_id: this.schoolId, p_teacher_id: teacherId, p_reason: trimmed });
    const existing = await db.teachers.get(teacherId);
    if (existing) {
      await db.teachers.put({ ...existing, verificationStatus: 'verified_teacher', status: 'active', updatedAt: nowIso() });
    }
  }

  async assignTeacher(classId: string, teacherId: string, role: ClassTeacher['role']): Promise<void> {
    const id = newId();
    await this.rpc('assign_class_teacher', {
      p_school_id: this.schoolId, p_class_teacher_id: id, p_class_id: classId, p_teacher_id: teacherId, p_role: role
    });
    await db.classTeachers.put({ ...base(this.schoolId, id), classId, teacherId, role });
  }

  async unassignTeacher(classTeacherId: string): Promise<void> {
    await this.rpc('unassign_class_teacher', { p_school_id: this.schoolId, p_class_teacher_id: classTeacherId });
    await db.classTeachers.delete(classTeacherId);
  }

  async enrollStudent(studentId: string, classId: string, academicTermId: string): Promise<void> {
    const existing = await db.enrollments.where({ studentId, classId }).first();
    const record: Enrollment = {
      ...(existing ?? base(this.schoolId)),
      studentId, classId, academicTermId, status: 'active',
      enrolledAt: existing?.enrolledAt ?? nowIso(), leftAt: null, updatedAt: nowIso()
    };
    await commitLocalMutation('enrollment', record);
  }

  async transferStudent(studentId: string, toClassId: string, academicTermId: string): Promise<void> {
    const current = await db.enrollments.where({ studentId, status: 'active' }).first();
    if (current && current.classId !== toClassId) {
      await commitLocalMutation('enrollment', { ...current, status: 'transferred', leftAt: nowIso(), updatedAt: nowIso() });
    }
    await this.enrollStudent(studentId, toClassId, academicTermId);
  }

  async promoteStudents(input: PromotionInput): Promise<PromotionResult> {
    if (input.fromTermId === input.toTermId) throw new Error('ปีการศึกษาต้นทางและปลายทางต้องต่างกัน');
    const targetClasses = await db.classes.where({ schoolId: this.schoolId, academicTermId: input.toTermId }).toArray();
    const targetIds = new Set(alive(targetClasses).map((row) => row.id));
    const result: PromotionResult = { promoted: 0, graduated: 0, skipped: 0 };
    for (const move of input.moves) {
      if (move.toClassId && !targetIds.has(move.toClassId)) throw new Error('ห้องปลายทางไม่ได้อยู่ในปีการศึกษาที่เลือก');
      const current = await db.enrollments
        .where({ schoolId: this.schoolId, studentId: move.studentId, academicTermId: input.fromTermId })
        .filter((row) => row.status === 'active' && !row.deletedAt)
        .first();
      if (!current) { result.skipped += 1; continue; }
      // History is closed, never rewritten: the old row keeps its class and term and only records
      // how the student left it.
      await commitLocalMutation('enrollment', {
        ...current, status: move.toClassId ? 'promoted' : 'graduated', leftAt: nowIso(), updatedAt: nowIso()
      });
      if (!move.toClassId) { result.graduated += 1; continue; }
      await commitLocalMutation('enrollment', {
        ...base(this.schoolId), studentId: move.studentId, classId: move.toClassId,
        academicTermId: input.toTermId, status: 'active', enrolledAt: nowIso(), leftAt: null
      } satisfies Enrollment);
      result.promoted += 1;
    }
    return result;
  }

  async saveTimetableEntry(input: TimetableInput): Promise<void> {
    if (input.dayOfWeek < 1 || input.dayOfWeek > 7) throw new Error('วันในสัปดาห์ต้องอยู่ระหว่าง 1 ถึง 7');
    if (input.period < 1) throw new Error('คาบเรียนต้องเริ่มที่ 1');
    if (input.endTime <= input.startTime) throw new Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    const existing = input.id ? await db.timetable.get(input.id) : undefined;
    const slots = alive(await db.timetable.where({ schoolId: this.schoolId, academicTermId: input.academicTermId }).toArray())
      .filter((row) => row.status === 'active' && row.id !== existing?.id && row.dayOfWeek === input.dayOfWeek);
    if (slots.some((row) => row.classId === input.classId && row.period === input.period)) {
      throw new Error('ห้องนี้มีคาบเรียนในช่วงเวลานี้แล้ว');
    }
    if (input.teacherId && slots.some((row) => row.teacherId === input.teacherId && row.period === input.period)) {
      throw new Error('ครูคนนี้ถูกจัดสอนคาบนี้ในห้องอื่นแล้ว');
    }
    const record: TimetableEntry = {
      ...(existing ?? base(this.schoolId, input.id)),
      classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId,
      academicTermId: input.academicTermId, dayOfWeek: input.dayOfWeek, period: input.period,
      startTime: input.startTime, endTime: input.endTime, room: input.room ?? '',
      status: 'active', updatedAt: nowIso()
    };
    await commitLocalMutation('timetable_entry', record);
  }

  async removeTimetableEntry(entryId: string): Promise<void> {
    const existing = await db.timetable.get(entryId);
    if (!existing) return;
    await softDeleteLocal('timetable_entry', existing);
  }

  async awardAchievement(input: AchievementInput): Promise<void> {
    const dedupeKey = input.dedupeKey ?? `${input.studentId}:${input.achievementKey}`;
    const already = await db.achievements.where({ schoolId: this.schoolId, dedupeKey }).first();
    // Re-awarding is a no-op rather than an error: an award pass can run as often as it likes.
    if (already && !already.deletedAt) return;
    const record: StudentAchievement = {
      ...(already ?? base(this.schoolId)),
      studentId: input.studentId, achievementKey: input.achievementKey, dedupeKey,
      note: input.note ?? '', awardedBy: input.awardedBy, awardedAt: nowIso(),
      deletedAt: null, updatedAt: nowIso()
    };
    await commitLocalMutation('achievement', record);
  }

  async saveAssignment(input: AssignmentInput): Promise<void> {
    const existing = input.id ? await db.assignments.get(input.id) : undefined;
    const record: Assignment = {
      ...(existing ?? base(this.schoolId, input.id)),
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
    await commitLocalMutation('assignment', record);
    if (existing && existing.status === 'published') {
      const context = await this.publishContext(record);
      const update = planWorkUpdate(existing, record, context, (id) => base(this.schoolId, id));
      await this.applyNotificationPlan(update.notifications, update.removeNotificationIds);
      if (existing.dueAt !== record.dueAt) {
        await this.recordAudit('DEADLINE_CHANGED', {
          assignmentId: record.id, oldValue: existing.dueAt ?? '', newValue: record.dueAt ?? ''
        });
      }
    }
  }

  async setAssignmentStatus(assignmentId: string, status: Assignment['status']): Promise<void> {
    const existing = await db.assignments.get(assignmentId);
    if (!existing) throw new Error('ไม่พบงานที่ต้องการแก้ไข');
    await commitLocalMutation('assignment', { ...existing, status, updatedAt: nowIso() });
  }

  private async rosterFor(classId: string): Promise<string[]> {
    const rows = await db.enrollments.where({ classId, status: 'active' }).toArray();
    return rows.filter((row) => !row.deletedAt).map((row) => row.studentId);
  }

  private async publishContext(work: Assignment, studentIds?: string[]) {
    const [submissions, notifications, extensions, preferences, students] = await Promise.all([
      db.submissions.where({ assignmentId: work.id }).toArray(),
      db.notifications.where({ schoolId: this.schoolId }).toArray(),
      db.deadlineExtensions.where({ assignmentId: work.id }).toArray(),
      db.notificationPreferences.where({ schoolId: this.schoolId }).toArray(),
      db.students.where({ schoolId: this.schoolId }).toArray()
    ]);
    return {
      work,
      studentIds: studentIds ?? await this.rosterFor(work.classId),
      existingSubmissions: submissions,
      existingNotifications: notifications,
      extensions,
      preferences,
      students
    };
  }

  private async applyNotificationPlan(created: ClassroomNotification[], removedIds: string[]): Promise<void> {
    if (removedIds.length > 0) await db.notifications.bulkDelete(removedIds);
    if (created.length > 0) await db.notifications.bulkPut(created);
  }

  private async recordAudit(action: AcademicAuditAction, fields: {
    assignmentId?: string | null; studentId?: string | null; oldValue?: string; newValue?: string; reason?: string;
    actorProfileId?: string;
  }): Promise<void> {
    const entry: AcademicAuditEntry = auditEntry(base(this.schoolId), {
      action,
      actorProfileId: fields.actorProfileId ?? '',
      assignmentId: fields.assignmentId ?? null,
      studentId: fields.studentId ?? null,
      oldValue: fields.oldValue ?? '',
      newValue: fields.newValue ?? '',
      reason: fields.reason ?? '',
      occurredAt: nowIso()
    });
    await db.academicAudit.put(entry);
  }

  async publishAssignment(assignmentId: string, studentIds: string[]): Promise<void> {
    const work = await db.assignments.get(assignmentId);
    if (!work) throw new Error('ไม่พบงานที่ต้องการเผยแพร่');
    const context = await this.publishContext(work, studentIds);
    const plan = planPublish(context, (id) => base(this.schoolId, id));
    await commitLocalMutation('assignment', plan.work);
    for (const submission of plan.submissions) await commitLocalMutation('submission', submission);
    await this.applyNotificationPlan(plan.notifications, plan.removeNotificationIds);
    await this.recordAudit('ASSIGNMENT_PUBLISHED', { assignmentId, newValue: plan.work.title });
  }

  async cancelAssignment(assignmentId: string, reason: string, actorProfileId: string): Promise<void> {
    const work = await db.assignments.get(assignmentId);
    if (!work) throw new Error('ไม่พบงานที่ต้องการยกเลิก');
    const cancelled: Assignment = { ...work, status: 'cancelled', cancelledAt: nowIso(), updatedAt: nowIso() };
    const context = await this.publishContext(cancelled);
    const plan = planCancellation(cancelled, context, reason, (id) => base(this.schoolId, id));
    await commitLocalMutation('assignment', cancelled);
    await this.applyNotificationPlan(plan.notifications, plan.removeNotificationIds);
    await this.recordAudit('ASSIGNMENT_CANCELLED', { assignmentId, reason, actorProfileId });
  }

  private async submissionHead(assignmentId: string, studentId: string): Promise<Submission | undefined> {
    return db.submissions.where({ assignmentId, studentId }).first();
  }

  private async ensureSubmission(assignmentId: string, studentId: string): Promise<Submission> {
    const existing = await this.submissionHead(assignmentId, studentId);
    if (existing) return existing;
    const created: Submission = {
      ...base(this.schoolId), assignmentId, studentId, submittedAt: null, status: 'not_started', score: null,
      isLate: false, teacherNote: '', studentNote: '', version: 0, openedAt: null, acknowledgedAt: null,
      revisionNote: '', percentage: null, calculatedGrade: null, finalGrade: null, gradeOverrideReason: '',
      gradedBy: null, gradedAt: null
    };
    await commitLocalMutation('submission', created);
    return created;
  }

  async markWorkOpened(assignmentId: string, studentId: string): Promise<void> {
    const submission = await this.ensureSubmission(assignmentId, studentId);
    if (submission.openedAt) return;
    await commitLocalMutation('submission', { ...submission, openedAt: nowIso(), updatedAt: nowIso() });
  }

  async acknowledgeWork(assignmentId: string, studentId: string): Promise<void> {
    const submission = await this.ensureSubmission(assignmentId, studentId);
    if (submission.acknowledgedAt) return;
    const timestamp = nowIso();
    await commitLocalMutation('submission', {
      ...submission,
      openedAt: submission.openedAt ?? timestamp,
      acknowledgedAt: timestamp,
      status: submission.status === 'not_started' ? 'in_progress' : submission.status,
      updatedAt: timestamp
    });
  }

  async requestRevision(assignmentId: string, studentId: string, note: string, actorProfileId: string): Promise<void> {
    const submission = await this.submissionHead(assignmentId, studentId);
    if (!submission) throw new Error('ยังไม่มีการส่งงานของนักเรียนคนนี้');
    await commitLocalMutation('submission', {
      ...submission, status: 'revision_requested', revisionNote: note, teacherNote: note, updatedAt: nowIso()
    });
    const work = await db.assignments.get(assignmentId);
    if (work) {
      await this.notifyStudents({
        studentIds: [studentId], classId: work.classId, assignmentId, kind: 'revision_requested',
        title: 'ขอแก้ไขงาน: ' + work.title, body: note || 'ครูขอให้แก้ไขและส่งใหม่'
      });
    }
    await this.recordAudit('REVISION_REQUESTED', { assignmentId, studentId, reason: note, actorProfileId });
  }

  async grantExtension(assignmentId: string, studentId: string, dueAt: string, reason: string, actorProfileId: string): Promise<void> {
    const work = await db.assignments.get(assignmentId);
    if (!work) throw new Error('ไม่พบงานที่ต้องการขยายเวลา');
    const existing = await db.deadlineExtensions.where({ assignmentId, studentId }).first();
    const extension: DeadlineExtension = {
      ...(existing ?? base(this.schoolId)),
      assignmentId, studentId, dueAt, reason, grantedBy: actorProfileId, updatedAt: nowIso()
    };
    await db.deadlineExtensions.put(extension);

    const context = await this.publishContext(work, [studentId]);
    const update = planWorkUpdate(work, work, context, (id) => base(this.schoolId, id));
    await this.applyNotificationPlan(update.notifications, update.removeNotificationIds);
    await this.recordAudit('STUDENT_EXTENSION_CREATED', {
      assignmentId, studentId, oldValue: work.dueAt ?? '', newValue: dueAt, reason, actorProfileId
    });
  }

  async scoreSubmission(input: ScoreSubmissionInput): Promise<void> {
    const work = await db.assignments.get(input.assignmentId);
    if (!work) throw new Error('ไม่พบงานที่ต้องการให้คะแนน');
    const rubric = work.rubricId ? (await db.rubrics.get(work.rubricId)) ?? null : null;
    const [submission, settings, existingRubricScores] = await Promise.all([
      this.submissionHead(input.assignmentId, input.studentId),
      db.settings.where({ schoolId: this.schoolId }).toArray(),
      db.rubricScores.where({ assignmentId: input.assignmentId, studentId: input.studentId }).toArray()
    ]);

    const outcome = planScoring(work, submission, input.studentId, {
      ...(input.score === undefined ? {} : { score: input.score }),
      rubric,
      ...(input.rubricEntries ? { rubricEntries: input.rubricEntries } : {}),
      ...(input.teacherNote === undefined ? {} : { teacherNote: input.teacherNote }),
      gradedBy: input.gradedBy,
      scheme: gradeSchemeFrom(settings),
      existingRubricScores
    }, (id) => base(this.schoolId, id));

    await commitLocalMutation('submission', outcome.submission);
    if (outcome.rubricScores.length > 0) await db.rubricScores.bulkPut(outcome.rubricScores);
    for (const entry of outcome.audit) {
      await this.recordAudit(entry.action, {
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
    const [submission, work, settings] = await Promise.all([
      this.submissionHead(assignmentId, studentId),
      db.assignments.get(assignmentId),
      db.settings.where({ schoolId: this.schoolId }).toArray()
    ]);
    if (!submission || !work) throw new Error('ไม่พบผลการตรวจงานนี้');
    if (finalGrade && !reason.trim()) throw new Error('ต้องระบุเหตุผลในการปรับเกรด');

    const grade = resolveGrade(submission.score, work.maxScore, {
      ...(finalGrade ? { override: finalGrade } : {}),
      scheme: gradeSchemeFrom(settings)
    });
    await commitLocalMutation('submission', {
      ...submission,
      percentage: grade.percentage,
      calculatedGrade: grade.calculatedGrade,
      finalGrade: grade.finalGrade,
      gradeOverrideReason: finalGrade ? reason : '',
      updatedAt: nowIso()
    });
    await this.recordAudit(finalGrade ? 'GRADE_OVERRIDE' : 'GRADE_OVERRIDE_REMOVED', {
      assignmentId, studentId, oldValue: submission.finalGrade ?? '', newValue: grade.finalGrade ?? '',
      reason, actorProfileId
    });
  }

  async saveRubric(input: RubricInput): Promise<void> {
    const id = input.id ?? newId();
    const existing = await db.rubrics.get(id);
    const record: Rubric = {
      ...(existing ?? base(this.schoolId, id)),
      title: input.title.trim(), subjectId: input.subjectId, criteria: validateRubric(input.criteria),
      status: existing?.status ?? 'active', updatedAt: nowIso()
    };
    await db.rubrics.put(record);
  }

  async archiveRubric(rubricId: string): Promise<void> {
    const existing = await db.rubrics.get(rubricId);
    if (existing) await db.rubrics.put({ ...existing, status: 'archived', updatedAt: nowIso() });
  }

  async saveAnnouncement(input: AnnouncementInput): Promise<void> {
    const id = input.id ?? newId();
    const existing = await db.announcements.get(id);
    const record: Announcement = {
      ...(existing ?? base(this.schoolId, id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title.trim(), body: input.body.trim(),
      studentIds: input.studentIds ?? [], createdBy: existing?.createdBy ?? '', updatedAt: nowIso()
    };
    await db.announcements.put(record);
    const audience = record.studentIds.length > 0 ? record.studentIds : await this.rosterFor(record.classId);
    await this.notifyStudents({
      studentIds: audience, classId: record.classId, assignmentId: null, kind: 'announcement',
      title: 'ประกาศ: ' + record.title, body: record.body
    });
  }

  async saveNotificationPreference(input: NotificationPreferenceInput): Promise<void> {
    const existing = await db.notificationPreferences.where({ schoolId: this.schoolId, profileId: input.profileId }).first();
    const record: NotificationPreference = {
      ...(existing ?? base(this.schoolId)),
      profileId: input.profileId,
      assignmentReminder: input.assignmentReminder,
      projectReminder: input.projectReminder,
      gradeNotification: input.gradeNotification,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
      updatedAt: nowIso()
    };
    await db.notificationPreferences.put(record);
  }

  async markAllNotificationsRead(studentId: string): Promise<void> {
    const rows = await db.notifications.where({ schoolId: this.schoolId, studentId }).toArray();
    const timestamp = nowIso();
    const updated = rows
      .filter((row) => !row.readAt && row.state !== 'scheduled')
      .map((row) => ({ ...row, readAt: timestamp, state: 'read' as const, updatedAt: timestamp }));
    if (updated.length > 0) await db.notifications.bulkPut(updated);
  }

  async deliverDueReminders(now = new Date()): Promise<number> {
    const rows = await db.notifications.where({ schoolId: this.schoolId }).toArray();
    const due = dueReminders(rows, now);
    if (due.length === 0) return 0;
    const timestamp = now.toISOString();
    await db.notifications.bulkPut(due.map((row) => ({
      ...row, state: 'delivered' as const, sentAt: timestamp, updatedAt: timestamp
    })));
    return due.length;
  }

  /**
   * Profile photos are ordinary attachments owned by a profile, so they travel through the same
   * storage path, size limit and deletion rules as any other file the app keeps.
   */
  async saveOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent', file: File): Promise<void> {
    if (!file.type.startsWith('image/')) throw new Error('รองรับเฉพาะไฟล์รูปภาพ');
    if (file.size > MAX_PROFILE_PHOTO_BYTES) throw new Error('รูปโปรไฟล์ต้องไม่เกิน 5 MB');
    const owner = await this.ownProfileRecord(actorProfileId, role);
    const before = await db.attachments.where({ ownerType: 'profile', ownerId: owner.id }).toArray();
    await this.addAttachment({ ownerType: 'profile', ownerId: owner.id, file, uploadedBy: actorProfileId });
    const after = await db.attachments.where({ ownerType: 'profile', ownerId: owner.id }).toArray();
    const photo = after.find((item) => !before.some((old) => old.id === item.id));
    if (!photo) throw new Error('บันทึกรูปโปรไฟล์ไม่สำเร็จ');
    // Only the newest photo is kept, so an old one never lingers in storage.
    for (const stale of before) await this.removeAttachment(stale.id);
    await this.applyOwnAvatar(owner.id, role, { avatarPhotoId: photo.id });
  }

  async clearOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent'): Promise<void> {
    const owner = await this.ownProfileRecord(actorProfileId, role);
    for (const photo of await db.attachments.where({ ownerType: 'profile', ownerId: owner.id }).toArray()) {
      await this.removeAttachment(photo.id);
    }
    await this.applyOwnAvatar(owner.id, role, { avatarPhotoId: null });
  }

  /** Finds the record the signed-in person owns, or refuses. */
  private async ownProfileRecord(actorProfileId: string, role: 'teacher' | 'student' | 'parent'): Promise<{ id: string }> {
    const owner = role === 'student'
      ? await db.students.where({ schoolId: this.schoolId, profileId: actorProfileId }).first()
      : role === 'teacher'
        ? await db.teachers.where({ schoolId: this.schoolId, profileId: actorProfileId }).first()
        : await db.parentLinks.where({ schoolId: this.schoolId, lineUserId: actorProfileId }).first();
    if (!owner) throw new Error('แก้ไขโปรไฟล์ได้เฉพาะบัญชีของตัวเองเท่านั้น');
    return owner;
  }

  private async applyOwnAvatar(ownerId: string, role: 'teacher' | 'student' | 'parent', patch: { avatarId?: string; avatarPhotoId?: string | null }): Promise<void> {
    const timestamp = nowIso();
    if (role === 'student') {
      const record = await db.students.get(ownerId);
      if (record) await commitLocalMutation('student', { ...record, ...patch, updatedAt: timestamp });
      return;
    }
    if (role === 'teacher') {
      const record = await db.teachers.get(ownerId);
      if (record) await db.teachers.put({ ...record, ...patch, updatedAt: timestamp });
      return;
    }
    const record = await db.parentLinks.get(ownerId);
    if (record) await db.parentLinks.put({ ...record, ...patch, updatedAt: timestamp });
  }

  async saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void> {
    if (!isValidAvatarId(avatarId)) throw new Error('ไม่พบ avatar ที่เลือก');
    const timestamp = nowIso();
    if (role === 'student') {
      const student = await db.students.where({ schoolId: this.schoolId, profileId: actorProfileId }).first();
      if (!student) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
      await commitLocalMutation('student', { ...student, avatarId, updatedAt: timestamp });
      return;
    }
    if (role === 'teacher') {
      const teacher = await db.teachers.where({ schoolId: this.schoolId, profileId: actorProfileId }).first();
      if (!teacher) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
      await db.teachers.put({ ...teacher, avatarId, updatedAt: timestamp });
      return;
    }
    const link = await db.parentLinks.where({ schoolId: this.schoolId, lineUserId: actorProfileId }).first();
    if (!link) throw new Error('แก้ไข avatar ได้เฉพาะบัญชีของตัวเองเท่านั้น');
    await db.parentLinks.put({ ...link, avatarId, updatedAt: timestamp });
  }

  async saveSubmission(input: SubmissionInput): Promise<void> {
    const existing = await db.submissions.where({ assignmentId: input.assignmentId, studentId: input.studentId }).first();
    const record: Submission = {
      ...(existing ?? base(this.schoolId, input.id)),
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
    await commitLocalMutation('submission', record);
  }

  async submitWork(assignmentId: string, studentId: string, studentNote: string, isLate: boolean): Promise<void> {
    const work = await db.assignments.get(assignmentId);
    if (!work) throw new Error('ไม่พบงานที่ต้องการส่ง');
    void isLate; // lateness is derived from the student's effective deadline
    const extensions = await db.deadlineExtensions.where({ assignmentId, studentId }).toArray();
    const due = effectiveDueAt(work, studentId, extensions);
    const submission = await this.submissionHead(assignmentId, studentId);
    const plan = planSubmission(work, submission, studentId, studentNote, due, (id) => base(this.schoolId, id));
    await commitLocalMutation('submission', plan.submission);
    await db.submissionVersions.put(plan.version);
    const pending = await db.notifications.where({ schoolId: this.schoolId, studentId, assignmentId }).toArray();
    const scheduled = pending.filter((row) => row.state === 'scheduled').map((row) => row.id);
    if (scheduled.length > 0) await db.notifications.bulkDelete(scheduled);
  }

  async returnWork(assignmentId: string, studentId: string, score: number | null, teacherNote: string): Promise<void> {
    const existing = await db.submissions.where({ assignmentId, studentId }).first();
    const assignment = await db.assignments.get(assignmentId);
    const record: Submission = {
      ...(existing ?? base(this.schoolId)),
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
    await commitLocalMutation('submission', record);
    if (assignment) {
      await this.notifyStudents({
        studentIds: [studentId], classId: assignment.classId, assignmentId, kind: 'work_returned',
        title: `ตรวจงานแล้ว: ${assignment.title}`,
        body: score === null ? 'ครูส่งงานคืนพร้อมความเห็น' : `ได้ ${score} จาก ${assignment.maxScore} คะแนน`
      });
    }
  }

  async saveActivity(input: ActivityInput): Promise<void> {
    const existing = input.id ? await db.activities.get(input.id) : undefined;
    const record: Activity = {
      ...(existing ?? base(this.schoolId, input.id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title, activityDate: input.activityDate,
      maxScore: input.maxScore, status: input.status, updatedAt: nowIso()
    };
    await commitLocalMutation('activity', record);
  }

  async saveActivityScores(activityId: string, scores: ScoreInput[]): Promise<void> {
    for (const entry of scores) {
      const existing = await db.activityScores.where({ activityId, studentId: entry.studentId }).first();
      const record: ActivityScore = {
        ...(existing ?? base(this.schoolId)),
        activityId, studentId: entry.studentId, score: entry.score,
        note: entry.note ?? existing?.note ?? '', updatedAt: nowIso()
      };
      await commitLocalMutation('activity_score', record);
    }
  }

  async saveTest(input: TestInput): Promise<void> {
    const existing = input.id ? await db.tests.get(input.id) : undefined;
    const record: TestRecord = {
      ...(existing ?? base(this.schoolId, input.id)),
      classId: input.classId, subjectId: input.subjectId, title: input.title, testDate: input.testDate,
      maxScore: input.maxScore, status: input.status, updatedAt: nowIso()
    };
    await commitLocalMutation('test', record);
  }

  async saveTestScores(testId: string, scores: ScoreInput[]): Promise<void> {
    for (const entry of scores) {
      const existing = await db.testScores.where({ testId, studentId: entry.studentId }).first();
      const record: TestScore = {
        ...(existing ?? base(this.schoolId)),
        testId, studentId: entry.studentId, score: entry.score,
        publishedAt: existing?.publishedAt ?? null, updatedAt: nowIso()
      };
      await commitLocalMutation('test_score', record);
    }
  }

  async publishTestScores(testId: string): Promise<void> {
    const test = await db.tests.get(testId);
    if (!test) throw new Error('ไม่พบรายการสอบ');
    const publishedAt = nowIso();
    const rows = await db.testScores.where({ testId }).toArray();
    for (const row of rows) {
      await commitLocalMutation('test_score', { ...row, publishedAt, updatedAt: publishedAt });
    }
    await commitLocalMutation('test', { ...test, status: 'published', updatedAt: publishedAt });
  }

  async addAttachment(input: AttachmentInput): Promise<void> {
    if (input.file.size > MAX_ATTACHMENT_BYTES) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
    const id = newId();
    const storagePath = await this.uploadToStorage(id, input);
    await db.attachments.put({
      ...base(this.schoolId, id),
      ownerType: input.ownerType, ownerId: input.ownerId, uploadedBy: input.uploadedBy,
      fileName: input.file.name, mimeType: input.file.type, byteSize: input.file.size,
      kind: attachmentKindFor(input.file.name, input.file.type),
      storagePath,
      blob: input.file
    });
    if (input.notify && input.notify.studentIds.length > 0) {
      await this.notifyStudents({
        studentIds: input.notify.studentIds, classId: input.notify.classId, assignmentId: input.notify.assignmentId,
        kind: 'assignment_published', title: input.notify.title, body: `ไฟล์ใหม่: ${input.file.name}`
      });
    }
  }

  /** Mirrors the file to shared storage so the rest of the class can download it. */
  private async uploadToStorage(id: string, input: AttachmentInput): Promise<string | null> {
    if (!isCloudConfigured || !supabase) return null;
    const safeName = input.file.name.replace(/[^w.-ก-๙]+/g, '_');
    const path = `${this.schoolId}/${input.ownerType}/${input.ownerId}/${id}-${safeName}`;
    const upload = await supabase.storage.from(CLASSROOM_FILES_BUCKET)
      .upload(path, input.file, { contentType: input.file.type || 'application/octet-stream', upsert: false });
    if (upload.error) throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${upload.error.message}`);
    const { error } = await supabase.rpc('record_class_file', {
      p_school_id: this.schoolId, p_file_id: id, p_owner_type: input.ownerType, p_owner_id: input.ownerId,
      p_file_name: input.file.name, p_mime_type: input.file.type, p_byte_size: input.file.size,
      p_kind: attachmentKindFor(input.file.name, input.file.type), p_storage_path: path
    });
    if (error) {
      await supabase.storage.from(CLASSROOM_FILES_BUCKET).remove([path]);
      throw new Error(error.message);
    }
    return path;
  }

  async removeAttachment(attachmentId: string): Promise<void> {
    const existing = await db.attachments.get(attachmentId);
    if (existing?.storagePath && supabase) {
      const { error } = await supabase.rpc('delete_class_file', { p_school_id: this.schoolId, p_file_id: attachmentId });
      if (error) throw new Error(error.message);
      await supabase.storage.from(CLASSROOM_FILES_BUCKET).remove([existing.storagePath]);
    }
    await db.attachments.delete(attachmentId);
  }

  async openAttachment(attachmentId: string): Promise<Blob | null> {
    const existing = await db.attachments.get(attachmentId);
    if (!existing) return null;
    if (existing.blob) return existing.blob;
    if (!existing.storagePath || !supabase) return null;
    const { data, error } = await supabase.storage.from(CLASSROOM_FILES_BUCKET).download(existing.storagePath);
    if (error || !data) throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ: ${error?.message ?? 'ไม่พบไฟล์'}`);
    await db.attachments.put({ ...existing, blob: data });
    return data;
  }

  async refreshAttachments(ownerType: AttachmentOwner, ownerId: string): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('class_files')
      .select('id, owner_type, owner_id, uploaded_by, file_name, mime_type, byte_size, kind, storage_path, created_at, updated_at')
      .eq('school_id', this.schoolId).eq('owner_type', ownerType).eq('owner_id', ownerId);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ClassFileRow[]) {
      const existing = await db.attachments.get(row.id);
      await db.attachments.put({
        ...(existing ?? base(this.schoolId, row.id)),
        ownerType: row.owner_type as AttachmentOwner, ownerId: row.owner_id, uploadedBy: row.uploaded_by ?? '',
        fileName: row.file_name, mimeType: row.mime_type, byteSize: row.byte_size,
        kind: row.kind as Attachment['kind'], storagePath: row.storage_path,
        createdAt: row.created_at, updatedAt: row.updated_at,
        blob: existing?.blob ?? null
      });
    }
  }

  async notifyStudents(input: NotificationInput): Promise<void> {
    const timestamp = nowIso();
    const rows: ClassroomNotification[] = input.studentIds.map((studentId) => ({
      ...base(this.schoolId),
      studentId, classId: input.classId, assignmentId: input.assignmentId,
      kind: input.kind, title: input.title, body: input.body,
      dedupeKey: input.dedupeKey ?? `${input.kind}:${input.assignmentId ?? 'none'}:${studentId}:${timestamp}`,
      state: 'delivered', scheduledAt: timestamp, sentAt: timestamp, readAt: null
    }));
    // A dedupe key that already exists means the notice was created by another device or retry.
    const existing = await db.notifications.where({ schoolId: this.schoolId }).toArray();
    const seen = new Set(existing.map((row) => row.dedupeKey));
    const fresh = rows.filter((row) => !seen.has(row.dedupeKey));
    if (fresh.length > 0) await db.notifications.bulkPut(fresh);
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    const existing = await db.notifications.get(notificationId);
    if (existing) await db.notifications.put({ ...existing, readAt: nowIso(), updatedAt: nowIso() });
  }

  async saveParentLink(input: ParentLinkInput): Promise<void> {
    // The server only mints and stores the hashed one-time code; the contact details stay in the
    // local projection until the parent redeems the code over LINE and the link row is created.
    const { data, error } = await requireSupabase().functions.invoke('parent-link', {
      body: { action: 'create', schoolId: this.schoolId, studentId: input.studentId }
    });
    if (error) throw new Error(error.message);
    const response = data as { invitationId?: string; code?: string } | null;
    const id = input.id ?? response?.invitationId ?? newId();
    const invitationCode = response?.code ?? null;
    const existing = await db.parentLinks.get(id);
    const record: ParentLink = {
      ...(existing ?? base(this.schoolId, id)),
      studentId: input.studentId, avatarId: existing?.avatarId ?? null,
      avatarPhotoId: existing?.avatarPhotoId ?? null,
      parentName: input.parentName, relationship: input.relationship,
      contact: input.contact, lineUserId: existing?.lineUserId ?? null,
      status: input.status ?? existing?.status ?? 'invited', invitationCode,
      consentVersion: existing?.consentVersion ?? null, consentGrantedAt: existing?.consentGrantedAt ?? null,
      updatedAt: nowIso()
    };
    await db.parentLinks.put(record);
  }

  async saveParentAccount(input: ParentAccountInput): Promise<{ parentId: string }> {
    const parentId = input.id ?? newId();
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new Error('กรุณาระบุชื่อผู้ปกครองอย่างน้อย 2 ตัวอักษร');
    await this.rpc('upsert_parent', {
      p_school_id: this.schoolId, p_parent_id: parentId, p_display_name: displayName,
      p_phone: input.phone ?? '', p_student_id: input.studentId, p_relationship: input.relationship
    });
    const existing = await db.parentLinks.get(parentId);
    await db.parentLinks.put({
      ...(existing ?? base(this.schoolId, parentId)),
      studentId: input.studentId, avatarId: existing?.avatarId ?? null, avatarPhotoId: existing?.avatarPhotoId ?? null,
      parentName: displayName, relationship: input.relationship, contact: input.phone ?? existing?.contact ?? '',
      lineUserId: existing?.lineUserId ?? null, status: existing?.status ?? 'invited',
      invitationCode: existing?.invitationCode ?? null,
      consentVersion: existing?.consentVersion ?? null, consentGrantedAt: existing?.consentGrantedAt ?? null,
      updatedAt: nowIso()
    });
    return { parentId };
  }

  async setParentConsent(parentLinkId: string, granted: boolean, policyVersion: string): Promise<void> {
    await this.rpc('set_parent_consent', {
      p_school_id: this.schoolId, p_parent_link_id: parentLinkId, p_granted: granted, p_policy_version: policyVersion
    });
    const existing = await db.parentLinks.get(parentLinkId);
    if (!existing) return;
    await db.parentLinks.put({
      ...existing,
      consentVersion: granted ? policyVersion : null,
      consentGrantedAt: granted ? nowIso() : null,
      status: granted ? 'linked' : existing.status,
      updatedAt: nowIso()
    });
  }

  async revokeParentLink(parentLinkId: string): Promise<void> {
    await this.rpc('revoke_parent_link', { p_school_id: this.schoolId, p_parent_link_id: parentLinkId });
    const existing = await db.parentLinks.get(parentLinkId);
    if (existing) await db.parentLinks.put({ ...existing, status: 'revoked', updatedAt: nowIso() });
  }

  async saveSetting(key: string, valueJson: Record<string, unknown>): Promise<void> {
    const existing = await db.settings.where({ schoolId: this.schoolId, scopeType: 'school', key }).first();
    const record: Setting = {
      ...(existing ?? base(this.schoolId)),
      scopeType: 'school', scopeId: null, key, valueJson, updatedAt: nowIso()
    };
    await commitLocalMutation('setting', record);
  }

  private async seedLedger(): Promise<SeedLedger> {
    const row = await db.settings.where({ schoolId: this.schoolId, scopeType: 'school', key: DEVELOPMENT_SEED_SETTING_KEY }).first();
    const value = row?.valueJson as Partial<SeedLedger> | undefined;
    return {
      classes: value?.classes ?? [], students: value?.students ?? [], teachers: value?.teachers ?? [],
      assignments: value?.assignments ?? [], parentLinks: value?.parentLinks ?? [], seededAt: value?.seededAt ?? ''
    };
  }

  async seedDevelopmentData(input: DevelopmentSeedInput): Promise<DevelopmentSeedResult> {
    if (!this.canManageStructure) throw new Error('ต้องเชื่อมต่อ Supabase ก่อนจึงจะสร้างข้อมูลตัวอย่างได้');
    if (input.classCount < 1 || input.studentsPerClass < 1) throw new Error('ต้องมีอย่างน้อย 1 ห้องและ 1 นักเรียนต่อห้อง');
    const term = await db.academicTerms.get(input.academicTermId);
    if (!term) throw new Error('ไม่พบปีการศึกษาที่เลือก');
    const ledger = await this.seedLedger();
    const stamp = Date.now().toString().slice(-6);
    const result: DevelopmentSeedResult = { classes: 0, students: 0, teachers: 0, parents: 0, assignments: 0, attendance: 0 };

    for (let index = 0; index < input.teacherCount; index += 1) {
      const id = newId();
      await this.saveTeacher({
        id, teacherCode: `DEV-T${stamp}-${index + 1}`, displayName: `ครูตัวอย่าง ${index + 1}`,
        email: `dev.teacher.${stamp}.${index + 1}@example.invalid`, subject: cycle(SEED_SUBJECTS, index)
      });
      ledger.teachers.push(id); result.teachers += 1;
    }

    for (let classIndex = 0; classIndex < input.classCount; classIndex += 1) {
      const classId = newId();
      await this.saveClass({
        id: classId, name: `ตัวอย่าง ${stamp}/${classIndex + 1}`, gradeLevel: `ป.${(classIndex % 6) + 1}`,
        academicTermId: input.academicTermId, capacity: Math.max(input.studentsPerClass, 30)
      });
      ledger.classes.push(classId); result.classes += 1;
      const primaryTeacher = ledger.teachers.length > 0 ? ledger.teachers[classIndex % ledger.teachers.length] : undefined;
      if (primaryTeacher) await this.assignTeacher(classId, primaryTeacher, 'primary');

      const roster: string[] = [];
      for (let studentIndex = 0; studentIndex < input.studentsPerClass; studentIndex += 1) {
        const studentId = newId();
        await this.saveStudent({
          id: studentId, studentCode: `DEV-S${stamp}-${classIndex + 1}${String(studentIndex + 1).padStart(2, '0')}`,
          displayName: `${cycle(SEED_FIRST_NAMES, studentIndex)} ${cycle(SEED_LAST_NAMES, classIndex)}`,
          avatarIndex: studentIndex % 12
        });
        await this.enrollStudent(studentId, classId, input.academicTermId);
        ledger.students.push(studentId); roster.push(studentId); result.students += 1;
      }

      if (!input.includeActivity) continue;

      const assignmentId = newId();
      const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.saveAssignment({
        id: assignmentId, classId, subjectId: null, workType: 'homework', title: 'ใบงานตัวอย่าง',
        description: 'ข้อมูลตัวอย่างสำหรับการทดสอบระบบ', dueAt, maxScore: 10, status: 'draft'
      });
      await this.publishAssignment(assignmentId, roster);
      ledger.assignments.push(assignmentId); result.assignments += 1;

      const today = new Date().toISOString().slice(0, 10);
      await this.setAttendanceForStudents(classId, today, 'present', roster);
      result.attendance += roster.length;

      const firstStudent = roster[0];
      if (firstStudent) {
        const parentLinkId = newId();
        await this.saveParentLink({
          id: parentLinkId, studentId: firstStudent, parentName: `ผู้ปกครองตัวอย่าง ${classIndex + 1}`,
          relationship: 'ผู้ปกครอง', contact: `08000${stamp}`
        });
        ledger.parentLinks.push(parentLinkId); result.parents += 1;
      }
    }

    await this.saveSetting(DEVELOPMENT_SEED_SETTING_KEY, { ...ledger, seededAt: nowIso() });
    return result;
  }

  async clearDevelopmentData(): Promise<DevelopmentClearResult> {
    const ledger = await this.seedLedger();
    const students = new Set(ledger.students);
    const classes = new Set(ledger.classes);
    let removed = 0;

    for (const row of await db.submissions.where({ schoolId: this.schoolId }).toArray()) {
      if (!ledger.assignments.includes(row.assignmentId) || row.deletedAt) continue;
      await softDeleteLocal('submission', row); removed += 1;
    }
    for (const row of await db.attendance.where({ schoolId: this.schoolId }).toArray()) {
      if (!classes.has(row.classId) || row.deletedAt) continue;
      await softDeleteLocal('attendance', row); removed += 1;
    }
    for (const assignmentId of ledger.assignments) {
      const row = await db.assignments.get(assignmentId);
      if (!row || row.deletedAt) continue;
      await softDeleteLocal('assignment', row); removed += 1;
    }
    for (const row of await db.enrollments.where({ schoolId: this.schoolId }).toArray()) {
      if (!students.has(row.studentId) || row.deletedAt) continue;
      await softDeleteLocal('enrollment', row); removed += 1;
    }
    for (const parentLinkId of ledger.parentLinks) {
      const row = await db.parentLinks.get(parentLinkId);
      if (!row || row.status === 'revoked') continue;
      await this.revokeParentLink(parentLinkId); removed += 1;
    }
    for (const studentId of ledger.students) {
      const row = await db.students.get(studentId);
      if (!row || row.deletedAt) continue;
      await this.removeStudent(studentId); removed += 1;
    }
    // Structural records are the server's to remove, so each one goes through its own RPC. Anything
    // the server refuses stays visible instead of being hidden locally.
    for (const classId of ledger.classes) {
      const row = await db.classes.get(classId);
      if (!row || row.deletedAt) continue;
      await this.deleteClass(classId); removed += 1;
    }
    for (const teacherId of ledger.teachers) {
      const row = await db.teachers.get(teacherId);
      if (!row || row.deletedAt) continue;
      await this.rpc('delete_teacher', { p_school_id: this.schoolId, p_teacher_id: teacherId });
      await db.teachers.put({ ...row, deletedAt: nowIso(), updatedAt: nowIso() });
      removed += 1;
    }

    await this.saveSetting(DEVELOPMENT_SEED_SETTING_KEY, { classes: [], students: [], teachers: [], assignments: [], parentLinks: [], seededAt: '' });
    return { removed };
  }
}

export function createDexieRepository(schoolId: string): SchoolRepository {
  return new DexieSchoolRepository(schoolId);
}
