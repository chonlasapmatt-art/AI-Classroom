import type {
  AcademicAuditEntry, AcademicTerm, AchievementKey, Activity, ActivityScore, Announcement, Assignment, Attachment,
  AttachmentOwner, Attendance, AttendanceStatus, AvatarConfig, ClassTeacher, Classroom, ClassroomNotification,
  ClassroomNotificationKind, DeadlineExtension, Enrollment, ImportRun, NotificationPreference, ParentLink, Rubric,
  RubricCriterion, RubricScore, ScoreCategory, ScoreEvent, Setting, Student, StudentAchievement, Subject, Submission, SubmissionStatus,
  SubmissionVersion, Teacher, TestRecord, TestScore, TimetableEntry, WorkType
} from '../domain/types';

/** What a screen reports after an import run; the repository stamps the identity and the clock. */
export interface ImportRunInput {
  target: ImportRun['target'];
  actorProfileId: string;
  fileName: string;
  fileKind: string;
  startedAt: string;
  rowsDetected: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  notes?: string;
}

/**
 * The single data-access boundary used by every screen.
 *
 * Screens never touch Dexie (or any other storage) directly. One implementation talks to the
 * real local-first database plus the trusted mutation boundary, the other serves development
 * fixtures. The implementation is chosen once, at the application root.
 */
export type RepositoryKind = 'dexie' | 'fixture';

export interface SchoolSnapshot {
  ready: boolean;
  terms: AcademicTerm[];
  classes: Classroom[];
  subjects: Subject[];
  teachers: Teacher[];
  classTeachers: ClassTeacher[];
  students: Student[];
  enrollments: Enrollment[];
  assignments: Assignment[];
  submissions: Submission[];
  activities: Activity[];
  activityScores: ActivityScore[];
  tests: TestRecord[];
  testScores: TestScore[];
  attendance: Attendance[];
  parentLinks: ParentLink[];
  attachments: Attachment[];
  notifications: ClassroomNotification[];
  rubrics: Rubric[];
  rubricScores: RubricScore[];
  submissionVersions: SubmissionVersion[];
  deadlineExtensions: DeadlineExtension[];
  announcements: Announcement[];
  notificationPreferences: NotificationPreference[];
  academicAudit: AcademicAuditEntry[];
  timetable: TimetableEntry[];
  achievements: StudentAchievement[];
  scoreEvents: ScoreEvent[];
  settings: Setting[];
  pendingSync: number;
  blockedSync: number;
}

export const emptySnapshot: SchoolSnapshot = {
  ready: false, terms: [], classes: [], subjects: [], teachers: [], classTeachers: [], students: [], enrollments: [],
  assignments: [], submissions: [], activities: [], activityScores: [], tests: [], testScores: [],
  attendance: [], parentLinks: [], attachments: [], notifications: [], rubrics: [], rubricScores: [],
  submissionVersions: [], deadlineExtensions: [], announcements: [], notificationPreferences: [], academicAudit: [],
  timetable: [], achievements: [], scoreEvents: [],
  settings: [], pendingSync: 0, blockedSync: 0
};

export interface StudentInput {
  id?: string; studentCode: string; displayName: string; avatarIndex: number;
  avatarConfig?: AvatarConfig | null; status?: Student['status'];
}
export interface ClassInput { id?: string; name: string; gradeLevel: string; academicTermId: string; capacity?: number }
export interface AcademicTermInput {
  id?: string; academicYear: string; term: string; startsOn: string; endsOn: string; status: AcademicTerm['status'];
}
export interface SubjectInput {
  id?: string; code: string; name: string; nameEn?: string; colorIndex: number; iconKey: string; sortOrder?: number;
}
export interface TeacherInput { id?: string; teacherCode: string; displayName: string; email: string; subject: string }

export interface TimetableInput {
  id?: string; classId: string; subjectId: string | null; teacherId: string | null; academicTermId: string;
  dayOfWeek: number; period: number; startTime: string; endTime: string; room?: string;
}

export interface AchievementInput {
  studentId: string; achievementKey: AchievementKey; note?: string; awardedBy: string | null;
  /** Stable identity; generated from student + badge when omitted so re-awarding is a no-op. */
  dedupeKey?: string;
}

/** One student's move into the next academic year, or out of the school. */
export interface PromotionMove { studentId: string; toClassId: string | null }

export interface PromotionInput {
  fromTermId: string;
  toTermId: string;
  moves: PromotionMove[];
  actorProfileId: string;
}

export interface PromotionResult { promoted: number; graduated: number; skipped: number }
export interface AttendanceInput { classId: string; studentId: string; attendanceDate: string; status: AttendanceStatus; note?: string }
export interface AssignmentInput {
  id?: string;
  classId: string;
  subjectId: string | null;
  workType?: WorkType;
  title: string;
  description: string;
  instructions?: string;
  startAt?: string | null;
  dueAt: string | null;
  maxScore: number;
  rubricId?: string | null;
  reminderOffsets?: number[];
  status: Assignment['status'];
}

export interface RubricInput { id?: string; title: string; subjectId: string | null; criteria: RubricCriterion[] }
export interface RubricEntryInput { criterionId: string; score: number | null; comment?: string }
export interface AnnouncementInput { id?: string; classId: string; subjectId: string | null; title: string; body: string; studentIds?: string[] }
export interface NotificationPreferenceInput {
  profileId: string; assignmentReminder: boolean; projectReminder: boolean; gradeNotification: boolean;
  quietHoursStart?: string | null; quietHoursEnd?: string | null;
}
export interface ScoreSubmissionInput {
  assignmentId: string;
  studentId: string;
  score?: number | null;
  rubricEntries?: RubricEntryInput[];
  teacherNote?: string;
  gradedBy: string;
}
export interface SubmissionInput {
  id?: string; assignmentId: string; studentId: string; status: SubmissionStatus; score: number | null;
  isLate: boolean; teacherNote: string; studentNote?: string;
}
export interface ActivityInput { id?: string; classId: string; subjectId: string | null; title: string; activityDate: string; maxScore: number; status: Activity['status'] }
export interface TestInput { id?: string; classId: string; subjectId: string | null; title: string; testDate: string; maxScore: number; status: TestRecord['status'] }
export interface ScoreInput { studentId: string; score: number | null; note?: string }

/**
 * One award of points. Points may be negative — a correction is an award of the opposite sign — but
 * the repository refuses anything that is not a real number, because one NaN poisons every total.
 */
export interface ScoreEventInput {
  studentId: string;
  classId?: string | null;
  subjectId?: string | null;
  category: ScoreCategory;
  points: number;
  reason?: string;
  sourceType?: ScoreEvent['sourceType'];
  sourceId?: string | null;
  awardedBy: string | null;
}

/** The largest single award the product allows, in either direction. */
export const MAX_SCORE_EVENT_POINTS = 1000;
export interface ParentLinkInput {
  id?: string; studentId: string; parentName: string; relationship: string; contact: string;
  status?: ParentLink['status'];
}
export interface ParentAccountInput {
  id?: string; studentId: string; displayName: string; relationship: string; phone?: string;
}

export interface AttachmentInput {
  ownerType: AttachmentOwner;
  ownerId: string;
  file: File;
  uploadedBy: string;
  /** When set, every listed student is told a new file is waiting for them. */
  notify?: { classId: string; studentIds: string[]; assignmentId: string | null; title: string };
}

/** How widely a stored file is available. */
export type AttachmentReach = 'local' | 'shared';

/** Attachments live in the local database, so keep single files reasonable. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Profile photos are shown small everywhere, so they stay well under the attachment limit. */
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export interface NotificationInput {
  studentIds: string[]; classId: string; assignmentId: string | null;
  kind: ClassroomNotificationKind; title: string; body: string;
  /** Stable identity; generated when omitted so a retry never duplicates the notice. */
  dedupeKey?: string;
}

/**
 * Synthetic records for a development or staging school.
 *
 * The seed writes through the same real path every screen uses — validation, local transaction,
 * sync queue — so what is exercised is the real application, not a fixture. Every id it creates is
 * recorded, which is what lets `clearDevelopmentData` remove exactly the seeded rows and nothing a
 * person entered by hand. Production starts clean because nothing calls this on its own.
 */
export interface DevelopmentSeedInput {
  academicTermId: string;
  classCount: number;
  studentsPerClass: number;
  teacherCount: number;
  /** Also create parent invitations, attendance history, work and scores. */
  includeActivity: boolean;
}

export interface DevelopmentSeedResult { classes: number; students: number; teachers: number; parents: number; assignments: number; attendance: number }
export interface DevelopmentClearResult { removed: number }

/** Key of the settings row that records what the seeder created. */
export const DEVELOPMENT_SEED_SETTING_KEY = 'development_seed';

export interface SchoolRepository {
  readonly kind: RepositoryKind;
  readonly schoolId: string;
  /** True when class/teacher/subject records can be created from this client. */
  readonly canManageStructure: boolean;
  subscribe(listener: (snapshot: SchoolSnapshot) => void): () => void;

  saveStudent(input: StudentInput): Promise<void>;
  saveStudentAvatar(studentId: string, config: AvatarConfig): Promise<void>;
  /**
   * Self-service avatar choice. The caller passes the profile it is acting as, and the repository
   * refuses to touch anybody else's record — the UI is not the thing enforcing this.
   */
  saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void>;
  /** Uploads a photo of your own and uses it as your profile picture. */
  saveOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent', file: File): Promise<void>;
  /** Goes back to the drawn avatar and deletes the stored photo. */
  clearOwnAvatarPhoto(actorProfileId: string, role: 'teacher' | 'student' | 'parent'): Promise<void>;
  removeStudent(studentId: string): Promise<void>;

  /**
   * Records what one roster import did. The students it created are ordinary writes that already
   * went through saveStudent; this is only the receipt, so it never leaves the device that ran it.
   */
  /**
   * Awards points to one student. Every award is a new row: correcting a score adds an opposite or
   * replacement event rather than rewriting one, so the trail stays complete.
   */
  awardScoreEvent(input: ScoreEventInput): Promise<void>;

  recordImportRun(input: ImportRunInput): Promise<void>;
  listImportRuns(limit?: number): Promise<ImportRun[]>;

  setAttendance(input: AttendanceInput): Promise<void>;
  setAttendanceForStudents(classId: string, attendanceDate: string, status: AttendanceStatus, studentIds: string[]): Promise<void>;

  /**
   * Opens or edits an academic year/term. Making one active closes the previous active term, so
   * "the current term" always means exactly one thing to every screen.
   */
  saveAcademicTerm(input: AcademicTermInput): Promise<void>;
  saveClass(input: ClassInput): Promise<void>;
  archiveClass(classId: string): Promise<void>;
  /** Brings an archived class back into use. */
  restoreClass(classId: string): Promise<void>;
  /** Soft-deletes a class. Refused while students are still enrolled. */
  deleteClass(classId: string): Promise<void>;
  saveSubject(input: SubjectInput): Promise<void>;
  archiveSubject(subjectId: string): Promise<void>;
  saveTeacher(input: TeacherInput): Promise<void>;
  /**
   * Moves a teacher to `verified_teacher`. The server decides whether the caller may do this —
   * an admin always may, a verified peer only when the school switched that policy on — so a
   * rejection here is authoritative and must not be worked around in the UI.
   */
  verifyTeacher(teacherId: string, reason: string): Promise<void>;
  assignTeacher(classId: string, teacherId: string, role: ClassTeacher['role']): Promise<void>;
  unassignTeacher(classTeacherId: string): Promise<void>;

  enrollStudent(studentId: string, classId: string, academicTermId: string): Promise<void>;
  transferStudent(studentId: string, toClassId: string, academicTermId: string): Promise<void>;
  /**
   * Moves a whole cohort into the next academic year. Previous enrollments are closed as
   * `promoted` or `graduated`; nothing that already happened is rewritten.
   */
  promoteStudents(input: PromotionInput): Promise<PromotionResult>;

  saveTimetableEntry(input: TimetableInput): Promise<void>;
  removeTimetableEntry(entryId: string): Promise<void>;

  awardAchievement(input: AchievementInput): Promise<void>;

  saveAssignment(input: AssignmentInput): Promise<void>;
  setAssignmentStatus(assignmentId: string, status: Assignment['status']): Promise<void>;
  /** Publishes work, hands every student a submission row, and schedules the reminder plan. */
  publishAssignment(assignmentId: string, studentIds: string[]): Promise<void>;
  /** Cancels published work: students are told once and every pending reminder is dropped. */
  cancelAssignment(assignmentId: string, reason: string, actorProfileId: string): Promise<void>;
  /** Student marks the work as seen, then as acknowledged. */
  markWorkOpened(assignmentId: string, studentId: string): Promise<void>;
  acknowledgeWork(assignmentId: string, studentId: string): Promise<void>;
  requestRevision(assignmentId: string, studentId: string, note: string, actorProfileId: string): Promise<void>;
  grantExtension(assignmentId: string, studentId: string, dueAt: string, reason: string, actorProfileId: string): Promise<void>;
  scoreSubmission(input: ScoreSubmissionInput): Promise<void>;
  overrideGrade(assignmentId: string, studentId: string, finalGrade: string | null, reason: string, actorProfileId: string): Promise<void>;
  saveRubric(input: RubricInput): Promise<void>;
  archiveRubric(rubricId: string): Promise<void>;
  saveAnnouncement(input: AnnouncementInput): Promise<void>;
  saveNotificationPreference(input: NotificationPreferenceInput): Promise<void>;
  markAllNotificationsRead(studentId: string): Promise<void>;
  /** Moves reminders whose time has come into the student's notification centre. */
  deliverDueReminders(now?: Date): Promise<number>;
  saveSubmission(input: SubmissionInput): Promise<void>;
  /** Student turn-in. */
  submitWork(assignmentId: string, studentId: string, studentNote: string, isLate: boolean): Promise<void>;
  /** Teacher grade and hand back. */
  returnWork(assignmentId: string, studentId: string, score: number | null, teacherNote: string): Promise<void>;

  saveActivity(input: ActivityInput): Promise<void>;
  saveActivityScores(activityId: string, scores: ScoreInput[]): Promise<void>;
  saveTest(input: TestInput): Promise<void>;
  saveTestScores(testId: string, scores: ScoreInput[]): Promise<void>;
  publishTestScores(testId: string): Promise<void>;

  addAttachment(input: AttachmentInput): Promise<void>;
  removeAttachment(attachmentId: string): Promise<void>;
  openAttachment(attachmentId: string): Promise<Blob | null>;
  /** Pulls the file list another device shared for this owner into the local projection. */
  refreshAttachments(ownerType: AttachmentOwner, ownerId: string): Promise<void>;

  notifyStudents(input: NotificationInput): Promise<void>;
  markNotificationRead(notificationId: string): Promise<void>;

  saveParentLink(input: ParentLinkInput): Promise<void>;
  /**
   * A guardian the school enters itself, with the student they are guardian for. Returns the parent
   * record id so an account invitation can be addressed to it — activating a login links an Auth
   * user to this record instead of creating a second guardian.
   */
  saveParentAccount(input: ParentAccountInput): Promise<{ parentId: string }>;
  setParentConsent(parentLinkId: string, granted: boolean, policyVersion: string): Promise<void>;
  revokeParentLink(parentLinkId: string): Promise<void>;

  saveSetting(key: string, valueJson: Record<string, unknown>): Promise<void>;

  /** Development/staging only. Writes synthetic records through the normal path. */
  seedDevelopmentData(input: DevelopmentSeedInput): Promise<DevelopmentSeedResult>;
  /** Removes exactly what the seeder created, leaving hand-entered records untouched. */
  clearDevelopmentData(): Promise<DevelopmentClearResult>;
}

export function nowIso(): string { return new Date().toISOString(); }
export function newId(): string { return crypto.randomUUID(); }
