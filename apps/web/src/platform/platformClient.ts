// Everything the operations console asks the server for.
//
// Each call is one security-definer function that decides for itself whether this account operates
// the platform. Nothing here is guarded by hiding a route or a button: the console runs as an
// ordinary signed-in session, and an account without platform authority calling the same function
// directly gets the same refusal the console would.
//
// The reads deliberately return counts, health and identifiers rather than school records. Running
// the service does not require reading what the service holds; an operator who genuinely needs to
// work inside a school starts a support session and uses the school's own screens, where the
// school's own policies apply and every action is stamped with the session that allowed it.

import { requireSupabase } from '../services/supabase';

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface SchoolHealth {
  schoolId: string;
  status: HealthStatus;
  reasons: string[];
  criticalErrors: number;
  highErrors: number;
  openConflicts: number;
  deviceCount: number;
  staleDevices: number;
  outdatedDevices: number;
  lastSuccessfulSyncAt: string | null;
  lastActivityAt: string | null;
}

export interface PlatformOverview {
  serverTime: string;
  schools: { total: number; active: number; suspended: number };
  people: { teachers: number; students: number; parents: number; platformAdmins: number };
  devices: { total: number; revoked: number; staleWeek: number };
  sync: { conflictsOpen: number; changesToday: number; lastChangeAt: string | null };
  errors: { critical: number; high: number; openTotal: number };
  notifications: { pending: number; failed: number };
  support: { activeSessions: number; sessionsToday: number };
  release: {
    version: string; minimumSupportedVersion: string; protocolVersion: number; releasedAt: string;
  } | null;
}

export interface OnlinePerson {
  profileId: string | null;
  displayName: string;
  role: 'teacher' | 'student' | 'parent' | 'admin' | 'platform_admin' | 'user';
  schoolName: string | null;
  deviceName: string;
  deviceType: string;
  lastSeenAt: string;
}

export interface SchoolSummary {
  schoolId: string; name: string; code: string; status: string; createdAt: string;
  teachers: number; students: number; health: SchoolHealth;
}

export interface SchoolDetail {
  schoolId: string; name: string; code: string; status: string; timezone: string; createdAt: string;
  health: SchoolHealth;
  counts: Record<string, number>;
  rooms: SchoolRoom[];
  teachers: SchoolTeacher[];
  devices: DeviceRow[];
  recentErrors: ErrorRow[];
  recentAudit: { action: string; entityType: string; occurredAt: string; supportSessionId: string | null }[];
  supportSessions: SupportSessionRow[];
}

export interface SchoolRoom {
  roomId: string; name: string; gradeLevel: string; status: string;
  academicYear: string; term: string; teacherCount: number; studentCount: number;
  assignmentCount: number; lastActivityAt: string | null;
  teachers: Array<{ teacherId: string; displayName: string; teacherCode: string; role: string; profileId: string | null }>;
}

export interface SchoolTeacher {
  teacherId: string; displayName: string; teacherCode: string; profileId: string | null;
  accountStatus: 'active' | 'not_provisioned' | 'linked_no_login_identity';
  lastLoginAt: string | null; roomCount: number;
  rooms: Array<{ roomId: string; name: string; gradeLevel: string; role: string }>;
}

export interface DeviceRow {
  deviceId: string; schoolId?: string; schoolName?: string | null; name: string; type: string;
  status?: string; lastSeenAt: string | null; lastSyncAt: string | null; clientVersion: string;
  protocolVersion: number | null; trusted: boolean; revokedAt: string | null; revokedReason?: string | null;
}

export interface ErrorRow {
  id: number; schoolId?: string | null; schoolName?: string | null; severity: 'critical' | 'high' | 'medium' | 'low';
  feature: string; code: string; message: string; clientVersion?: string; protocolVersion?: number | null;
  occurredAt: string; resolvedAt: string | null;
}

export interface NotificationQueueRow {
  id: string; schoolId: string; schoolName: string | null; eventType: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'dead_letter'; retryCount: number;
  nextRetryAt: string; createdAt: string; processedAt: string | null; lastError: string | null;
}

export interface SecurityEventRow {
  id: number; action: string; actorProfileId: string | null; actorName: string | null;
  schoolId: string | null; schoolName: string | null; targetProfileId: string | null;
  supportSessionId: string | null; reason: string; occurredAt: string;
}

export interface SupportSessionRow {
  sessionId: string; reason: string; startedAt: string; expiresAt: string;
  endedAt: string | null; actionsRecorded: number;
}

export interface ActiveSupportSession {
  active: true; sessionId: string; schoolId: string; schoolName: string; reason: string;
  startedAt: string; expiresAt: string; actionsRecorded: number; serverTime: string;
}

export interface FeatureFlagRow {
  key: string; schoolId: string | null; schoolName: string | null; enabled: boolean;
  description: string; updatedAt: string;
}

export interface ReleaseRow {
  id: string; channel: 'production' | 'staging' | 'beta'; version: string;
  minimumSupportedVersion: string; protocolVersion: number; releaseNotes: string;
  releasedAt: string; isCurrent: boolean;
}

export class PlatformError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PlatformError';
  }
}

const messages: Record<string, string> = {
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์ระดับแพลตฟอร์ม',
  PLATFORM_FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์ระดับแพลตฟอร์ม',
  REAUTHENTICATION_REQUIRED: 'ต้องยืนยันรหัสผ่านอีกครั้งก่อนทำรายการนี้',
  VALIDATION_ERROR: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง',
  SCHOOL_CODE_TAKEN: 'รหัสโรงเรียนนี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น',
  SCHOOL_NOT_FOUND: 'ไม่พบโรงเรียนที่เลือก หรือโรงเรียนถูกระงับแล้ว',
  ROLE_CONFLICT: 'บัญชีนี้ถูกผูกกับบทบาทอื่นอยู่แล้ว',
  ADMIN_ACCOUNT_FAILED: 'สร้างบัญชีแอดมินไม่สำเร็จ กรุณาลองใหม่',
  LAST_PLATFORM_ADMIN: 'เพิกถอนไม่ได้ เพราะจะไม่เหลือผู้ดูแลแพลตฟอร์มเลย',
  NOT_FOUND: 'ไม่พบรายการที่ต้องการ'
};

/** Turns a Postgres error into one the console can show, keeping the machine code for the caller. */
function toPlatformError(error: { message?: string } | null): PlatformError {
  const raw = String(error?.message ?? '');
  const known = Object.keys(messages).find((code) => raw.includes(code));
  const code = known ?? 'PLATFORM_ERROR';
  return new PlatformError(code, messages[code] ?? 'ดำเนินการไม่สำเร็จ');
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw toPlatformError(error);
  return data as T;
}

export const platformOverview = () => rpc<PlatformOverview>('platform_overview');
export const platformOnlinePeople = (limit = 12) =>
  rpc<OnlinePerson[]>('platform_online_people', { p_limit: limit });
export const platformSchools = () => rpc<SchoolSummary[]>('platform_schools');
export const platformSchoolDetail = (schoolId: string) =>
  rpc<SchoolDetail>('platform_school_detail', { p_school_id: schoolId });
export const platformSecurityLog = (limit = 100) =>
  rpc<SecurityEventRow[]>('platform_security_log', { p_limit: limit });
export const platformDevices = (schoolId: string | null = null, limit = 200) =>
  rpc<DeviceRow[]>('platform_devices', { p_school_id: schoolId, p_limit: limit });
export const platformFlagsAndReleases = () =>
  rpc<{ flags: FeatureFlagRow[]; releases: ReleaseRow[] }>('platform_flags_and_releases');
export const platformNotificationQueue = (status: NotificationQueueRow['status'] | null = null, limit = 200) =>
  rpc<NotificationQueueRow[]>('platform_notification_queue', { p_status: status, p_limit: limit });

export function platformErrors(input: {
  schoolId?: string | null; severity?: string | null; days?: number; limit?: number;
} = {}) {
  return rpc<ErrorRow[]>('platform_errors', {
    p_school_id: input.schoolId ?? null,
    p_severity: input.severity ?? null,
    // Postgres reads this as an interval; sending days keeps the console from formatting SQL.
    p_since: `${Math.max(1, Math.min(input.days ?? 7, 90))} days`,
    p_limit: input.limit ?? 100
  });
}

export const startSupportSession = (schoolId: string, reason: string, minutes: number) =>
  rpc<ActiveSupportSession>('start_support_session', {
    p_school_id: schoolId, p_reason: reason, p_minutes: minutes
  });
export const endSupportSession = (sessionId?: string) =>
  rpc<void>('end_support_session', { p_session_id: sessionId ?? null });
export const currentSupportSession = () =>
  rpc<ActiveSupportSession | { active: false }>('current_support_session');

export const setSchoolStatus = (schoolId: string, status: 'active' | 'suspended', reason: string) =>
  rpc<{ schoolId: string; status: string }>('set_school_status', {
    p_school_id: schoolId, p_status: status, p_reason: reason
  });
export const setProfileStatus = (profileId: string, status: 'active' | 'suspended', reason: string) =>
  rpc<{ profileId: string; status: string }>('set_profile_status', {
    p_profile_id: profileId, p_status: status, p_reason: reason
  });
export const revokeDevice = (deviceId: string, reason: string) =>
  rpc<{ deviceId: string }>('revoke_device', { p_device_id: deviceId, p_reason: reason });
export const forceSchoolLogout = (schoolId: string, reason: string) =>
  rpc<{ schoolId: string; accounts: number }>('force_school_logout', {
    p_school_id: schoolId, p_reason: reason
  });
export const resolveErrorEvent = (eventId: number, note = '') =>
  rpc<void>('resolve_error_event', { p_event_id: eventId, p_note: note });
export const setFeatureFlag = (key: string, schoolId: string | null, enabled: boolean, description = '') =>
  rpc<FeatureFlagRow>('set_feature_flag', {
    p_key: key, p_school_id: schoolId, p_enabled: enabled, p_description: description
  });
export const publishRelease = (input: {
  channel: 'production' | 'staging' | 'beta'; version: string; minimumVersion: string;
  protocolVersion: number; notes: string;
}) => rpc<{ releaseId: string }>('publish_release', {
  p_channel: input.channel, p_version: input.version, p_minimum_version: input.minimumVersion,
  p_protocol_version: input.protocolVersion, p_notes: input.notes
});

/** Whether this account operates the platform. The server answers; the console does not guess. */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await requireSupabase().rpc('is_platform_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

async function gateway(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireSupabase().functions.invoke('platform-access', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as Record<string, unknown> | null
      : null;
    const code = typeof parsed?.code === 'string' ? parsed.code : 'PLATFORM_ACCESS_DENIED';
    throw new PlatformError(code, messages[code] ?? 'ยืนยันสิทธิ์ไม่สำเร็จ');
  }
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * Proves the password again.
 *
 * The result is not something the console can grant itself: the gateway asks GoTrue to verify, and
 * the database records the moment. Every dangerous action checks that record, so a console that
 * pretended to have re-authenticated would still be refused.
 */
export async function reauthenticate(password: string): Promise<void> {
  await gateway({ action: 'reauthenticate', password });
}

export async function enrollPlatformAdmin(input: { accessCode: string; displayName: string }): Promise<void> {
  await gateway({ action: 'enroll', accessCode: input.accessCode, displayName: input.displayName });
}

/**
 * Whether this build offers the one-field development sign-in.
 *
 * Mirrors how Preview Mode gates itself: a development build has it, and a production build has it
 * only if somebody deliberately turned it on. The screen is the smaller half of the gate — the
 * endpoint refuses unless the server was opted in too — but a production bundle should not carry a
 * form for a door that is not there.
 */
export const isDevSignInAvailable: boolean =
  import.meta.env.DEV === true || import.meta.env.VITE_PLATFORM_DEV_SIGN_IN === 'true';

const devSignInMessages: Record<string, string> = {
  PLATFORM_DEV_SIGN_IN_DISABLED: 'เซิร์ฟเวอร์นี้ปิดการเข้าสู่ระบบแบบนักพัฒนาไว้',
  SERVER_CONFIGURATION_ERROR: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งรหัสแพลตฟอร์ม กรุณาตั้ง PLATFORM_ADMIN_CODE_HASH ก่อน',
  PLATFORM_DISPLAY_NAME_REQUIRED: 'การเข้าเครื่องนี้ครั้งแรกต้องกรอกชื่อผู้ดูแล',
  PLATFORM_NO_OPERATOR: 'ยังไม่มีผู้ดูแลแพลตฟอร์มในระบบ กรุณาเข้าด้วยชื่อกับรหัสผ่านแล้วยืนยันสิทธิ์ก่อน',
  PLATFORM_OPERATOR_AMBIGUOUS: 'มีผู้ดูแลแพลตฟอร์มมากกว่าหนึ่งคน ต้องระบุ PLATFORM_DEV_OPERATOR ที่เซิร์ฟเวอร์',
  PLATFORM_ACCESS_LOCKED: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที',
  PLATFORM_ACCESS_DENIED: 'รหัสสิทธิ์ไม่ถูกต้อง'
};

/**
 * Signs in with the platform code and saves the operator's chosen display name.
 *
 * Returns the session for the caller to adopt. The code is checked on the server against the same
 * hash enrolment uses, so this screen decides nothing — it is a shortcut past typing a name and a
 * password on a development machine, not a shortcut past authorisation.
 */
export async function devSignIn(accessCode: string, displayName?: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { data, error } = await requireSupabase().functions.invoke('platform-dev-access', {
    body: { accessCode, ...(displayName?.trim() ? { displayName: displayName.trim() } : {}) }
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as Record<string, unknown> | null
      : null;
    const code = typeof parsed?.code === 'string' ? parsed.code : 'PLATFORM_ACCESS_DENIED';
    throw new PlatformError(code, devSignInMessages[code] ?? 'เข้าสู่ระบบไม่สำเร็จ');
  }
  const session = (data as { session?: { accessToken?: string; refreshToken?: string } } | null)?.session;
  if (!session?.accessToken || !session.refreshToken) {
    throw new PlatformError('PLATFORM_ACCESS_DENIED', 'เข้าสู่ระบบไม่สำเร็จ');
  }
  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

export async function grantPlatformAdmin(input: { profileId: string; displayName?: string; notes?: string }) {
  await gateway({ action: 'grant', ...input });
}

export async function revokePlatformAdminAccount(input: { profileId: string; reason: string }) {
  await gateway({ action: 'revoke', ...input });
}

export interface ProvisionSchoolAdminInput {
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  academicYear?: string;
  term?: string;
  displayName: string;
  password: string;
  recordId: string;
}

export interface ProvisionSchoolAdminResult {
  profileId: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  displayName: string;
  createdSchool: boolean;
}

export async function provisionSchoolAdmin(input: ProvisionSchoolAdminInput): Promise<ProvisionSchoolAdminResult> {
  return await gateway({ action: 'provision-school-admin', ...input }) as unknown as ProvisionSchoolAdminResult;
}

/** Minutes and seconds left on a support session, for a banner that has to be believed. */
export function remainingTime(expiresAt: string, now = Date.now()): { expired: boolean; label: string } {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return { expired: true, label: 'หมดเวลาแล้ว' };
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return { expired: false, label: `${minutes}:${String(seconds).padStart(2, '0')}` };
}

export function healthTone(status: HealthStatus): 'success' | 'warning' | 'danger' {
  if (status === 'critical') return 'danger';
  if (status === 'warning') return 'warning';
  return 'success';
}

export function healthLabel(status: HealthStatus): string {
  if (status === 'critical') return 'วิกฤต';
  if (status === 'warning') return 'ต้องเฝ้าระวัง';
  return 'ปกติ';
}
