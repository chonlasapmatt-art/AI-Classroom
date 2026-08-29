export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave';
export type SyncEntityType = 'student' | 'enrollment' | 'assignment' | 'submission' | 'activity' | 'activity_score' | 'test' | 'test_score' | 'attendance' | 'setting';
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
export interface Classroom extends SyncRecord { academicTermId: string; name: string; gradeLevel: string; status: 'active' | 'archived'; }
export interface Student extends SyncRecord {
  profileId: string | null;
  studentCode: string;
  displayName: string;
  avatarIndex: number;
  avatarConfig: AvatarConfig | null;
  status: 'active' | 'inactive';
}
export interface Enrollment extends SyncRecord { studentId: string; classId: string; academicTermId: string; status: 'active' | 'transferred' | 'left'; enrolledAt: string; leftAt: string | null; }
export interface Assignment extends SyncRecord { classId: string; title: string; description: string; assignedAt: string; dueAt: string | null; maxScore: number; status: 'draft' | 'published' | 'closed' | 'archived'; }
export interface Submission extends SyncRecord { assignmentId: string; studentId: string; submittedAt: string | null; status: 'draft' | 'submitted' | 'graded' | 'returned'; score: number | null; isLate: boolean; teacherNote: string; }
export interface Activity extends SyncRecord { classId: string; title: string; activityDate: string; maxScore: number; status: 'draft' | 'published' | 'closed'; }
export interface ActivityScore extends SyncRecord { activityId: string; studentId: string; score: number | null; note: string; }
export interface TestRecord extends SyncRecord { classId: string; title: string; testDate: string; maxScore: number; status: 'draft' | 'published' | 'closed'; }
export interface TestScore extends SyncRecord { testId: string; studentId: string; score: number | null; publishedAt: string | null; }
export interface Attendance extends SyncRecord { classId: string; studentId: string; attendanceDate: string; status: AttendanceStatus; note: string; }
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
