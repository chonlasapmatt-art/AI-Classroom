export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave';
export type AttendanceSessionType = 'daily' | 'class' | 'homeroom';
export type SyncEntityType = 'student' | 'enrollment' | 'assignment' | 'submission' | 'activity' | 'activity_score' | 'test' | 'test_score' | 'attendance' | 'setting' | 'timetable_entry' | 'achievement' | 'score_event';
export type SyncOperation = 'upsert' | 'delete';

export interface SyncRecord {
  id: string;
  schoolId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface School extends SyncRecord { name: string; code: string; timezone: string; status: 'active' | 'suspended'; }
export interface AcademicTerm extends SyncRecord { academicYear: string; term: string; startsOn: string; endsOn: string; status: 'draft' | 'active' | 'closed'; }
export interface Classroom extends SyncRecord { academicTermId: string; name: string; gradeLevel: string; capacity: number; status: 'active' | 'archived'; }
export interface Student extends SyncRecord {
  profileId: string | null;
  studentCode: string;
  displayName: string;
  avatarIndex: number;
  avatarConfig: AvatarConfig | null;
  /** Catalogue id (avatar_001..avatar_100) a student picked for themselves. */
  avatarId: string | null;
  /** Attachment id of an uploaded photo, which takes precedence over the catalogue avatar. */
  avatarPhotoId: string | null;
  status: 'active' | 'inactive';
}
/**
 * An enrollment is closed, never overwritten. `transferred` covers a move inside a term, `promoted`
 * a move into the next academic year and `graduated` the end of the student's time at the school —
 * so attendance, grades and submissions stay attached to the class they were earned in.
 */
export type EnrollmentStatus = 'active' | 'transferred' | 'left' | 'promoted' | 'graduated';
export interface Enrollment extends SyncRecord { studentId: string; classId: string; academicTermId: string; status: EnrollmentStatus; enrolledAt: string; leftAt: string | null; }
/** Any piece of academic work a teacher hands out. One record type, four presentations. */
export type WorkType = 'assignment' | 'homework' | 'project' | 'activity';
export type WorkStatus = 'draft' | 'published' | 'closed' | 'archived' | 'cancelled';

export interface Assignment extends SyncRecord {
  classId: string;
  subjectId: string | null;
  workType: WorkType;
  title: string;
  description: string;
  instructions: string;
  assignedAt: string;
  startAt: string | null;
  dueAt: string | null;
  maxScore: number;
  rubricId: string | null;
  /** Minutes before the deadline at which a reminder fires; 0 means "when published". */
  reminderOffsets: number[];
  status: WorkStatus;
  publishedAt: string | null;
  cancelledAt: string | null;
}
export interface Submission extends SyncRecord {
  assignmentId: string;
  studentId: string;
  /** The Google Drive/Docs link shared by the student for this turn-in. */
  driveUrl?: string | null;
  submittedAt: string | null;
  status: SubmissionStatus;
  score: number | null;
  isLate: boolean;
  teacherNote: string;
  studentNote: string;
  /** Latest version number; every turn-in is also kept in submissionVersions. */
  version: number;
  openedAt: string | null;
  acknowledgedAt: string | null;
  revisionNote: string;
  percentage: number | null;
  calculatedGrade: string | null;
  finalGrade: string | null;
  gradeOverrideReason: string;
  gradedBy: string | null;
  gradedAt: string | null;
}
export interface Activity extends SyncRecord { classId: string; subjectId: string | null; title: string; activityDate: string; maxScore: number; status: 'draft' | 'published' | 'closed'; }
export interface ActivityScore extends SyncRecord { activityId: string; studentId: string; score: number | null; note: string; }
export interface TestRecord extends SyncRecord { classId: string; subjectId: string | null; title: string; testDate: string; maxScore: number; status: 'draft' | 'published' | 'closed'; }
export interface TestScore extends SyncRecord { testId: string; studentId: string; score: number | null; publishedAt: string | null; }
export interface Attendance extends SyncRecord {
  classId: string;
  studentId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string;
  /** Stable identity for one attendance sheet. Older daily rows omit this and mean "daily". */
  sessionKey?: string;
  sessionType?: AttendanceSessionType;
  period?: number | null;
  subjectId?: string | null;
  timetableEntryId?: string | null;
}
export interface Setting extends SyncRecord { scopeType: string; scopeId: string | null; key: string; valueJson: Record<string, unknown>; }

export interface AvatarConfig { archetype: number; palette: number; skinTone: number; hair: number; accessory: number; badge: number; }
export type AvatarAnimation = 'idle' | 'blink' | 'wave' | 'study' | 'celebrate' | 'thinking';

export interface SyncQueueItem {
  queueId: string;
  schoolId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseVersion: number;
  idempotencyKey: string;
  requestHash: string;
  attemptCount: number;
  nextRetryAt: string;
  lastError: string | null;
  status: 'pending' | 'processing' | 'blocked';
  createdAt: string;
}

export interface SyncState { key: string; deviceId: string; schoolId: string; lastPullRevision: number; lastSuccessfulSyncAt: string | null; localSchemaVersion: number; syncProtocolVersion: number; }
export interface LocalSessionMetadata { profileId: string; schoolId: string; displayName: string; role: Role; pinSalt: string | null; pinVerifier: string | null; trustedUntil: string | null; lastOnlineValidationAt: string; }
export interface DeviceMetadata { deviceId: string; schoolId: string; deviceName: string; deviceType: 'board' | 'desktop' | 'tablet' | 'mobile'; status: 'active' | 'revoked'; }

export interface MembershipContext { membershipId: string; schoolId: string; schoolName: string; profileId: string; displayName: string; role: Role; status: 'active' | 'suspended'; }

/**
 * Where a teacher stands in the verification lifecycle. Choosing "teacher" during public
 * registration only produces a request; protected school data stays out of reach until a trusted
 * server call (an admin, or a verified peer when school policy allows it) moves the record to
 * `verified_teacher`. The database is the authority — this field mirrors it for the UI.
 */
export type TeacherVerificationStatus = 'teacher_requested' | 'verification_pending' | 'verified_teacher' | 'revoked';

export interface Teacher extends SyncRecord {
  profileId: string | null;
  avatarId: string | null;
  avatarPhotoId: string | null;
  teacherCode: string;
  displayName: string;
  email: string;
  subject: string;
  verificationStatus: TeacherVerificationStatus;
  status: 'active' | 'inactive';
}

export interface ClassTeacher extends SyncRecord {
  classId: string;
  teacherId: string;
  role: 'primary' | 'assistant';
  /** Optional subject responsibility; null means the teacher advises the class generally. */
  subjectId?: string | null;
}

export type ParentLinkStatus = 'invited' | 'linked' | 'revoked';

export interface ParentLink extends SyncRecord {
  studentId: string;
  /** Auth profile that owns this guardian identity. LINE identity is separate and optional. */
  profileId: string | null;
  avatarId: string | null;
  avatarPhotoId: string | null;
  parentName: string;
  relationship: string;
  contact: string;
  lineUserId: string | null;
  status: ParentLinkStatus;
  invitationCode: string | null;
  consentVersion: string | null;
  consentGrantedAt: string | null;
}

export type SubmissionStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'late' | 'graded'
  | 'revision_requested' | 'resubmitted' | 'overdue'
  /** Legacy states kept so older local rows stay readable. */
  | 'assigned' | 'draft' | 'returned';

/** A subject (learning area). Schools start from the eight standard areas and add their own. */
export interface Subject extends SyncRecord {
  code: string;
  name: string;
  nameEn: string;
  colorIndex: number;
  iconKey: string;
  sortOrder: number;
  status: 'active' | 'archived';
}

export type ClassroomNotificationKind =
  | 'assignment_published' | 'submission_reminder' | 'work_returned'
  | 'deadline_changed' | 'work_cancelled' | 'revision_requested' | 'announcement' | 'grade_posted';

/** Delivery lifecycle, kept separate from creation so other channels can be added later. */
export type NotificationState = 'queued' | 'scheduled' | 'sent' | 'delivered' | 'failed' | 'read';

/** In-app notice for one student. Local-first, mirrored to the server notification outbox. */
export interface ClassroomNotification extends SyncRecord {
  studentId: string;
  classId: string;
  assignmentId: string | null;
  kind: ClassroomNotificationKind;
  title: string;
  body: string;
  /** Stable identity so a retry, a resync or a recalculation never duplicates a notice. */
  dedupeKey: string;
  state: NotificationState;
  scheduledAt: string;
  sentAt: string | null;
  readAt: string | null;
}

export type AttachmentOwner = 'assignment' | 'submission' | 'subject' | 'profile';
export type AttachmentKind = 'pdf' | 'spreadsheet' | 'csv' | 'document' | 'presentation' | 'archive' | 'image' | 'video' | 'audio' | 'other';

/**
 * A file attached to teaching material or to a student's turned-in work.
 *
 * Bytes never travel through the sync protocol (it carries records, not blobs). Instead the file is
 * kept locally and, when the school is connected, mirrored to Supabase Storage so the other devices
 * in the class can download it. `storagePath` is the shared copy; a null value means the file only
 * exists on the device that added it.
 */
export interface Attachment extends SyncRecord {
  ownerType: AttachmentOwner;
  ownerId: string;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  kind: AttachmentKind;
  byteSize: number;
  storagePath: string | null;
}

/** A reusable marking scheme. Criteria are stored inline so one record describes the whole rubric. */
export interface RubricCriterion { id: string; label: string; maxScore: number; description: string }

export interface Rubric extends SyncRecord {
  title: string;
  subjectId: string | null;
  criteria: RubricCriterion[];
  status: 'active' | 'archived';
}

/** One criterion's mark for one student on one piece of work. */
export interface RubricScore extends SyncRecord {
  assignmentId: string;
  studentId: string;
  criterionId: string;
  score: number | null;
  comment: string;
}

/** Every turn-in is kept; a resubmission adds a version instead of overwriting the last one. */
export interface SubmissionVersion extends SyncRecord {
  assignmentId: string;
  studentId: string;
  versionNumber: number;
  submittedAt: string;
  isLate: boolean;
  studentNote: string;
  /** Attachment owner id for the files sent with this version. */
  attachmentOwnerId: string;
}

/** A personal deadline for one student. The class deadline is untouched. */
export interface DeadlineExtension extends SyncRecord {
  assignmentId: string;
  studentId: string;
  dueAt: string;
  reason: string;
  grantedBy: string;
}

export interface Announcement extends SyncRecord {
  classId: string;
  subjectId: string | null;
  title: string;
  body: string;
  /** Empty means the whole class. */
  studentIds: string[];
  createdBy: string;
}

/** Per-person delivery preferences for non-critical reminders. */
export interface NotificationPreference extends SyncRecord {
  profileId: string;
  assignmentReminder: boolean;
  projectReminder: boolean;
  gradeNotification: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export type AcademicAuditAction =
  | 'SCORE_CREATED' | 'SCORE_CHANGED' | 'GRADE_OVERRIDE' | 'GRADE_OVERRIDE_REMOVED'
  | 'DEADLINE_CHANGED' | 'STUDENT_EXTENSION_CREATED' | 'ASSIGNMENT_PUBLISHED'
  | 'ASSIGNMENT_CANCELLED' | 'REVISION_REQUESTED';

/** One recurring lesson slot. A week is described by the set of slots, not by a generated grid. */
export interface TimetableEntry extends SyncRecord {
  classId: string;
  subjectId: string | null;
  teacherId: string | null;
  academicTermId: string;
  /** 1 = Monday … 7 = Sunday, matching ISO-8601 so date maths needs no lookup table. */
  dayOfWeek: number;
  period: number;
  /** Local wall-clock times in the school timezone, "HH:MM". */
  startTime: string;
  endTime: string;
  room: string;
  status: 'active' | 'archived';
}

/** Positive recognition only. A badge is earned, never taken away for poor performance. */
export type AchievementKey =
  | 'on_time_submitter' | 'steady_attendance' | 'score_improver' | 'reader'
  | 'thinker' | 'experimenter' | 'creator' | 'helper';

/** One badge earned by one student. Awarding is idempotent through `dedupeKey`. */
export interface StudentAchievement extends SyncRecord {
  studentId: string;
  achievementKey: AchievementKey;
  /** Stable identity so re-running the award pass never duplicates a badge. */
  dedupeKey: string;
  note: string;
  awardedBy: string | null;
  awardedAt: string;
}

/** Local mirror of the academic audit trail so the history is readable offline too. */
export interface AcademicAuditEntry extends SyncRecord {
  action: AcademicAuditAction;
  actorProfileId: string;
  assignmentId: string | null;
  studentId: string | null;
  oldValue: string;
  newValue: string;
  reason: string;
  occurredAt: string;
}

/**
 * The receipt for one roster import.
 *
 * It stays on the device that ran the import: the students it created travel through the ordinary
 * sync queue like any other write, and this row only records what that run did — who ran it, from
 * what file, and how many rows ended up created, updated or held back.
 */
export interface ImportRun {
  id: string;
  schoolId: string;
  target: 'student' | 'teacher' | 'parent';
  actorProfileId: string;
  fileName: string;
  fileKind: string;
  startedAt: string;
  finishedAt: string;
  rowsDetected: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  notes: string;
}

export type ScoreCategory =
  | 'bonus' | 'participation' | 'assignment' | 'activity' | 'project' | 'test' | 'exam' | 'manual' | 'other';

/**
 * One award of points to one student.
 *
 * Scores are kept as events rather than as a running total so that every point can be explained
 * afterwards: who gave it, for what, in which subject, and when. A correction is another event, so
 * the list of events for a student is the complete history and nothing is ever overwritten.
 */
export interface ScoreEvent extends SyncRecord {
  studentId: string;
  classId: string | null;
  subjectId: string | null;
  category: ScoreCategory;
  points: number;
  reason: string;
  /** Where the award came from — the board, a piece of work, a correction typed on the scores page. */
  sourceType: 'manual' | 'board' | 'assignment' | 'activity' | 'test' | 'exam' | 'import' | 'system';
  sourceId: string | null;
  awardedBy: string | null;
  occurredAt: string;
}
