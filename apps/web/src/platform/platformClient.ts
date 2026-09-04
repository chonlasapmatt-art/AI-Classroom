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

export interface ProductKeyRow {
  keyId: string; hint: string; status: 'issued' | 'consumed' | 'replaced';
  issuedAt: string; consumedAt: string | null;
  actorProfileId: string; actorName: string | null;
  schoolId: string | null; schoolName: string | null; schoolCode: string | null;
  /** False for keys drawn before keys were sealed. Those can never be read back by anybody. */
  recoverable: boolean;
  lastRevealedAt: string | null; revealCount: number;
}

export interface SchoolAccountRow {
  profileId: string; displayName: string; role: 'admin' | 'teacher' | 'parent';
  membershipStatus: string; accountStatus: string; isPlatformAdmin: boolean;
}

/**
 * Whether messages are actually leaving the building.
 *
 * Queue depth and sender liveness travel together on purpose. An empty queue proves nothing if the
 * sender died an hour ago, and a busy sender proves nothing if the oldest message has been waiting
 * since this morning.
 */
export interface NotificationDispatchHealth {
  pending: number; deadLettered: number;
  oldestPendingAt: string | null; oldestPendingSeconds: number | null;
  lastRunAt: string | null; lastRunSecondsAgo: number | null; lastRunError: string | null;
  sentLastHour: number; failedLastHour: number; scheduled: boolean;
}

export interface PlatformMfaStatus {
  enrolled: boolean;
  sessionAal: string;
  operators: {
    profileId: string; displayName: string | null; enrolled: boolean;
    lastReauthAt: string | null; lastReauthAal: string | null;
  }[];
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
  NOT_FOUND: 'ไม่พบรายการที่ต้องการ',
  KEY_NOT_RECOVERABLE: 'คีย์นี้ออกก่อนระบบจะเก็บสำเนาที่เปิดอ่านได้ จึงกู้คืนไม่ได้',
  PRODUCT_KEY_UNREADABLE: 'เปิดคีย์ไม่ได้ เพราะ PRODUCT_KEY_SECRET ถูกเปลี่ยนหลังออกคีย์นี้',
  TARGET_IS_PLATFORM_ADMIN: 'รีเซ็ตรหัสผ่านของผู้ดูแลแพลตฟอร์มด้วยกันไม่ได้',
  PASSWORD_RESET_FAILED: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่',
  SERVER_CONFIGURATION_ERROR: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า PRODUCT_KEY_SECRET',
  MFA_REQUIRED: 'บัญชีนี้เปิดตัวยืนยันสองชั้นไว้ กรุณากรอกรหัส 6 หลักจากแอปก่อน',
  OPERATOR_ACCOUNT_FAILED: 'สร้างบัญชีผู้ดูแลแพลตฟอร์มไม่สำเร็จ กรุณาลองใหม่',
  OPERATOR_HAS_SCHOOL_MEMBERSHIP:
    'บัญชีนี้เป็นผู้ดูแลของโรงเรียนอยู่แล้ว จึงยกให้เป็นผู้ดูแลแพลตฟอร์มไม่ได้ · ผู้ดูแลแพลตฟอร์มต้องเป็นบัญชีที่ไม่สังกัดโรงเรียนใด',
  PLATFORM_ALREADY_BOOTSTRAPPED:
    'ระบบนี้มีผู้ดูแลแพลตฟอร์มอยู่แล้ว · ทางลัดสำหรับตั้งผู้ดูแลคนแรกถูกปิดไปตั้งแต่มีคนแรก'
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
export const notificationDispatchHealth = () =>
  rpc<NotificationDispatchHealth>('notification_dispatch_health');
export const platformProductKeys = (limit = 200) =>
  rpc<ProductKeyRow[]>('platform_product_keys', { p_limit: limit });
export const platformSchoolAccounts = (schoolId: string) =>
  rpc<SchoolAccountRow[]>('platform_school_accounts', { p_school_id: schoolId });
export const platformMfaStatus = () => rpc<PlatformMfaStatus>('platform_mfa_status');

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

/** Reads the server-owned re-authentication window so code-authenticated operators are not asked
 * for a second credential immediately after they have already entered the platform access code. */
export async function hasFreshPlatformReauthentication(): Promise<boolean> {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return false;
  return await rpc<boolean>('platform_reauth_fresh', { p_actor: authData.user.id, p_minutes: 15 });
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
  /*
   * This used to say "sign in with a name and password, then confirm the code" — a door the console
   * no longer renders. So the one message somebody sees on a deployment with no operator yet sent
   * them looking for a form that is not there. It now says what is actually true: the code is
   * right, and there is nobody for it to sign in as.
   */
  PLATFORM_NO_OPERATOR: 'รหัสถูกต้อง แต่ยังไม่มีผู้ดูแลแพลตฟอร์มในระบบให้เข้าใช้งาน · ต้องเพิ่มผู้ดูแลคนแรกลงในตาราง platform_admins ที่เซิร์ฟเวอร์ก่อน',
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

export interface PlatformOperator {
  profileId: string;
  displayName: string;
  status: string;
  mfaEnrolledAt: string | null;
  grantedAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  /** How many schools this operator still administers. Should be zero; older operators may not be. */
  schoolMemberships: number;
}

export async function listPlatformOperators(): Promise<PlatformOperator[]> {
  const data = await gateway({ action: 'list-operators' });
  const rows = Array.isArray(data.operators) ? data.operators : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      profileId: String(item.profile_id ?? ''),
      displayName: String(item.display_name ?? ''),
      status: String(item.status ?? 'active'),
      mfaEnrolledAt: item.mfa_enrolled_at ? String(item.mfa_enrolled_at) : null,
      grantedAt: String(item.granted_at ?? ''),
      revokedAt: item.revoked_at ? String(item.revoked_at) : null,
      lastSeenAt: item.last_seen_at ? String(item.last_seen_at) : null,
      schoolMemberships: Number(item.school_memberships ?? 0)
    };
  });
}

/**
 * A new operator on an account that belongs to no school.
 *
 * The other route — granting platform authority to an account that already exists — still works and
 * is still recorded, but it makes an operator out of somebody who administers a school, which is the
 * distinction `platform_admins` is for. This one starts from an account with no school at all, and
 * the database refuses if the profile turns out to hold a membership anyway.
 */
export async function provisionPlatformOperator(input: {
  displayName: string; password: string; notes?: string;
}): Promise<{ profileId: string }> {
  const data = await gateway({ action: 'provision-operator', ...input });
  return { profileId: String(data.profileId ?? '') };
}

const bootstrapMessages: Record<string, string> = {
  PLATFORM_ACCESS_DENIED: 'รหัสสิทธิ์ไม่ถูกต้อง',
  PLATFORM_ACCESS_LOCKED: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที',
  PLATFORM_ALREADY_BOOTSTRAPPED: messages.PLATFORM_ALREADY_BOOTSTRAPPED!,
  OPERATOR_ACCOUNT_FAILED: messages.OPERATOR_ACCOUNT_FAILED!,
  OPERATOR_HAS_SCHOOL_MEMBERSHIP: messages.OPERATOR_HAS_SCHOOL_MEMBERSHIP!,
  VALIDATION_ERROR: 'ชื่อผู้ดูแลอย่างน้อย 2 ตัวอักษร และรหัสผ่านอย่างน้อย 12 ตัวอักษร',
  SERVER_CONFIGURATION_ERROR: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งรหัสแพลตฟอร์ม กรุณาตั้ง PLATFORM_ADMIN_CODE_HASH ก่อน'
};

/**
 * The first operator of a deployment that has none.
 *
 * Reachable without a session, because on a deployment with no operator there is no session to be
 * had — that was the deadlock. It mints none either: whoever runs this then signs in through the
 * ordinary door. The server closes this path the moment an operator exists.
 */
export async function bootstrapPlatformOperator(input: {
  accessCode: string; displayName: string; password: string;
}): Promise<{ profileId: string }> {
  const { data, error } = await requireSupabase().functions.invoke('platform-bootstrap', { body: input });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as Record<string, unknown> | null
      : null;
    const code = typeof parsed?.code === 'string' ? parsed.code : 'PLATFORM_ACCESS_DENIED';
    throw new PlatformError(code, bootstrapMessages[code] ?? 'ตั้งผู้ดูแลคนแรกไม่สำเร็จ');
  }
  return { profileId: String((data as Record<string, unknown> | null)?.profileId ?? '') };
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

export interface RevealedProductKey {
  productKey: string; hint: string; status: string; schoolId: string | null;
}

/**
 * Opens one customer's product key.
 *
 * The plaintext arrives once, in this response, and is deliberately not cached anywhere: an operator
 * who needs it again asks again, and the ask is recorded again. The reason is mandatory because a
 * key read without one is indistinguishable afterwards from a key taken.
 */
export async function revealProductKey(input: { keyId: string; reason: string }): Promise<RevealedProductKey> {
  return await gateway({ action: 'reveal-product-key', ...input }) as unknown as RevealedProductKey;
}

export interface MemberPasswordReset {
  password: string; displayName: string; role: string; schoolId: string | null;
}

/**
 * Issues a new password for one school account.
 *
 * Not a reveal, and there is no reveal to offer instead: GoTrue stores a bcrypt hash, so the
 * password somebody forgot is gone for everybody including the operator. What can be done is set a
 * new one and read it back to them, which is what this does.
 */
export async function resetMemberPassword(
  input: { profileId: string; schoolId?: string | null; reason: string }
): Promise<MemberPasswordReset> {
  return await gateway({ action: 'reset-member-password', ...input }) as unknown as MemberPasswordReset;
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
