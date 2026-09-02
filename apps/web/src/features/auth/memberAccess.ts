// Client half of the simple managed-member access flows.
//
// Teachers use the name + code created by an administrator. Parents use name + password.
// Everything here is shaping and phrasing. Authority lives in the `member-access` Edge Function:
// this module never decides that an account exists, only how to ask and how to say no. Every
// rejection collapses into the same sentence, so the screen cannot be used to work out whether the
// name or the password was the wrong half.

import { requireSupabase } from '../../services/supabase';

export const MEMBER_ACCESS_GENERIC_MESSAGE = 'ชื่อหรือรหัสผ่านไม่ถูกต้อง';
export const MEMBER_REGISTRATION_FAILED_MESSAGE = 'สร้างบัญชีผู้ปกครองไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง';
export const MEMBER_PASSWORD_MINIMUM = 8;

export function isValidRecoveryEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type MemberRole = 'teacher' | 'student' | 'parent' | 'admin';

export interface MemberSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface MemberProfile {
  profileId: string;
  role: MemberRole;
  displayName: string;
  schoolId?: string | null;
  schoolName?: string | null;
}

export interface MemberAccountChoice {
  profileId: string;
  schoolName: string;
}

export type MemberAccessResult =
  | { outcome: 'session'; session: MemberSessionTokens; member: MemberProfile }
  | { outcome: 'account-required'; accounts: MemberAccountChoice[] }
  | { outcome: 'error'; message: string; locked?: boolean };

export interface ChildCandidate {
  studentId: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  className: string;
  maskedCode: string;
  avatarIndex: number;
  alreadyLinked: boolean;
}

export interface ChildLinkResult {
  linkId: string;
  studentId: string;
  status: 'linked' | 'pending' | string;
  schoolName: string;
  displayName: string;
}

/** Collapses runs of whitespace so "  สมชาย   ใจดี " and "สมชาย ใจดี" are the same lookup. */
export function normalizeMemberName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isCompleteMemberLogin(displayName: string, password: string): boolean {
  return normalizeMemberName(displayName).length >= 2 && password.length >= 1;
}

/**
 * Reduces a school's registration access code to what it means, exactly as the server does.
 *
 * The code is copied out of a chat message or read off a whiteboard, so the dash, the case and the
 * spaces around it are noise; the digits are the code. Normalising on both sides means a teacher who
 * types `sc 482917` is not told their school's code is wrong.
 *
 * This one drops everything that is not a latin letter or a digit, and it has to: the server stores
 * an HMAC of this exact form, so the rule cannot change without invalidating every code ever issued.
 * It is not the rule for the personal code a teacher signs in with — see `normalizeTeacherCode`.
 */
export function normalizeAccessCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Reduces the personal code an administrator saved for one teacher.
 *
 * Only spaces and dashes go, because a Thai school writes these codes in Thai — `ครู-01`, `ค.02` —
 * and `normalizeAccessCode` deletes every one of those characters. A teacher whose code was `ครู-01`
 * was sending `01` to a server holding `ครู01`, so the pair never matched and the sign-in button was
 * disabled outright for a code written entirely in Thai. The database applies this same rule to the
 * stored code, so the school keeps whatever formatting it chose and only the comparison ignores the
 * separators. Student numbers have worked this way since `202608300017_student_code_matching`.
 */
export function normalizeTeacherCode(value: string): string {
  return value.replace(/[\s-]/g, '').trim().toUpperCase();
}

export function isCompleteMemberRegistration(input: {
  firstName: string; lastName: string; password: string; confirmPassword: string;
  schoolId?: string; recoveryEmail?: string; accessCode?: string;
}): boolean {
  return normalizeMemberName(input.firstName).length >= 1
    && normalizeMemberName(input.lastName).length >= 1
    && input.password.length >= MEMBER_PASSWORD_MINIMUM
    && input.password === input.confirmPassword
    && (input.recoveryEmail === undefined || isValidRecoveryEmail(input.recoveryEmail))
    && (input.schoolId === undefined || input.schoolId.trim().length > 0)
    && (input.accessCode === undefined || normalizeAccessCode(input.accessCode).length >= 4);
}

/**
 * Turns a server response into something a screen can render. Only the two cases a person can act
 * on — choose between namesakes, or wait out a lockout — get their own message; everything else is
 * the single generic failure.
 */
export function interpretMemberAccessResponse(payload: unknown, status: number): MemberAccessResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';

  if (code === 'MEMBER_SELECTION_REQUIRED') {
    const accounts = Array.isArray(body.accounts) ? body.accounts as MemberAccountChoice[] : [];
    return { outcome: 'account-required', accounts };
  }
  if (code === 'MEMBER_ACCESS_LOCKED') {
    const minutes = typeof body.retryAfterMinutes === 'number' ? body.retryAfterMinutes : 15;
    return { outcome: 'error', locked: true, message: `พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารออีก ${minutes} นาที` };
  }
  if (code === 'MEMBER_REGISTRATION_INVALID') {
    return { outcome: 'error', message: `กรุณากรอกชื่อ นามสกุล โรงเรียน อีเมลกู้คืน และรหัสผ่านอย่างน้อย ${MEMBER_PASSWORD_MINIMUM} ตัวอักษร` };
  }
  if (code === 'SCHOOL_NOT_AVAILABLE') {
    return { outcome: 'error', message: 'ไม่พบโรงเรียนที่เลือก กรุณาเลือกใหม่อีกครั้ง' };
  }
  if (code === 'TEACHER_CODE_REQUIRED') {
    return { outcome: 'error', message: 'กรุณากรอกรหัสสำหรับครูที่ได้รับจากผู้ดูแลโรงเรียน' };
  }
  if (code === 'TEACHER_ADMIN_ONLY') {
    return { outcome: 'error', message: 'บัญชีครูต้องให้ผู้ดูแลโรงเรียนสร้างให้ ครูไม่ต้องสมัครเอง' };
  }
  // Wrong, revoked, expired and used-up codes arrive here as one answer, because the server does not
  // say which. The message names the person who can fix any of them.
  if (code === 'TEACHER_CODE_INVALID') {
    return { outcome: 'error', message: 'รหัสสำหรับครูใช้ไม่ได้กับโรงเรียนนี้ อาจหมดอายุหรือถูกยกเลิกแล้ว กรุณาขอรหัสใหม่จากผู้ดูแลโรงเรียน' };
  }
  if (code === 'MEMBER_EMAIL_EXISTS') {
    return { outcome: 'error', message: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณากลับไปเข้าสู่ระบบด้วยชื่อและรหัสผ่านเดิม หรือใช้เมนูลืมรหัสผ่าน' };
  }
  if (code === 'MEMBER_REGISTRATION_FAILED') {
    return { outcome: 'error', message: MEMBER_REGISTRATION_FAILED_MESSAGE };
  }

  const session = body.session as { accessToken?: string; refreshToken?: string } | undefined;
  const member = body.member as MemberProfile | undefined;
  if (status < 400 && session?.accessToken && session.refreshToken && member) {
    return {
      outcome: 'session',
      session: { accessToken: session.accessToken, refreshToken: session.refreshToken },
      member
    };
  }

  return { outcome: 'error', message: MEMBER_ACCESS_GENERIC_MESSAGE };
}

async function call(body: Record<string, unknown>): Promise<{ data: unknown; status: number }> {
  const { data, error } = await requireSupabase().functions.invoke('member-access', { body });
  if (error) {
    // The SDK hides the body of a non-2xx response behind `context`, and both the namesake picker
    // and the lockout notice live in that body, so read it back before falling through.
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const parsed = await context.json().catch(() => null);
      return { data: parsed, status: context.status ?? 400 };
    }
    return { data: null, status: 400 };
  }
  return { data, status: 200 };
}

async function accessCall(body: Record<string, unknown>): Promise<MemberAccessResult> {
  try {
    const { data, status } = await call(body);
    return interpretMemberAccessResponse(data, status);
  } catch {
    return { outcome: 'error', message: MEMBER_ACCESS_GENERIC_MESSAGE };
  }
}

export async function memberLogin(input: {
  role: MemberRole; displayName: string; password: string; profileId?: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'login', role: input.role,
    displayName: normalizeMemberName(input.displayName), password: input.password,
    ...(input.profileId ? { profileId: input.profileId } : {})
  });
}

/** A managed teacher signs in with the exact name + code saved by the school administrator. */
export async function teacherLogin(input: {
  displayName: string; teacherCode: string; teacherId?: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'teacher-login',
    displayName: normalizeMemberName(input.displayName),
    teacherCode: normalizeTeacherCode(input.teacherCode),
    ...(input.teacherId ? { teacherId: input.teacherId } : {})
  });
}

/**
 * First registration for a teacher. The school's own access code is what authorises it — this call
 * carries the code, and the server, not this screen, decides whether it is a real one.
 */
export async function registerTeacher(input: {
  firstName: string; lastName: string; schoolId: string; password: string; recoveryEmail: string;
  accessCode: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'register-teacher',
    firstName: normalizeMemberName(input.firstName), lastName: normalizeMemberName(input.lastName),
    schoolId: input.schoolId, password: input.password, recoveryEmail: input.recoveryEmail.trim().toLowerCase(),
    accessCode: normalizeAccessCode(input.accessCode)
  });
}

export async function registerParent(input: {
  firstName: string; lastName: string; password: string; recoveryEmail: string; schoolId: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'register-parent',
    firstName: normalizeMemberName(input.firstName), lastName: normalizeMemberName(input.lastName),
    password: input.password, recoveryEmail: input.recoveryEmail.trim().toLowerCase(), schoolId: input.schoolId
  });
}

/**
 * The account that creates the first school. It carries no rights of its own — the owner code on the
 * private entry is what grants them — and it signs in afterwards from the ordinary screen.
 */
export async function registerOwner(input: {
  firstName: string; lastName: string; password: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'register-owner',
    firstName: normalizeMemberName(input.firstName), lastName: normalizeMemberName(input.lastName),
    password: input.password
  });
}

/** A parent types one thing — their child's real name — and gets back cards, never data. */
export async function searchChildren(schoolId: string, childName: string): Promise<ChildCandidate[]> {
  if (normalizeMemberName(childName).length < 2) return [];
  try {
    const { data } = await call({ action: 'children-search', schoolId, childName: normalizeMemberName(childName) });
    const rows = (data as { children?: ChildCandidate[] } | null)?.children ?? [];
    return rows;
  } catch {
    return [];
  }
}

/** What a refused link means, in words a parent can act on rather than "ไม่สำเร็จ". */
const childLinkMessages: Record<string, string> = {
  AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  MEMBER_ACCESS_DENIED: 'บัญชีผู้ปกครองนี้ยังใช้เชื่อมบัญชีไม่ได้ กรุณาติดต่อโรงเรียน',
  CHILD_NOT_AVAILABLE: 'นักเรียนคนนี้ไม่พร้อมให้เชื่อมแล้ว กรุณาตรวจสอบกับคุณครู',
  MEMBER_ACCESS_LOCKED: 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
};

/**
 * Links the signed-in parent to one child, and says why when it will not.
 *
 * This used to answer `null` for every refusal — an expired session, an account the school has not
 * finished setting up and a child who has left all produced the same "เชื่อมบัญชีไม่สำเร็จ", which is
 * not something a parent can do anything about.
 */
export async function linkChild(studentId: string, relationship?: string): Promise<ChildLinkResult> {
  const { data, status } = await call({
    action: 'children-link', studentId, ...(relationship ? { relationship } : {})
  });
  if (status >= 400 || !data) {
    const code = String((data as { code?: unknown } | null)?.code ?? '');
    throw new Error(childLinkMessages[code] ?? 'เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่');
  }
  return data as ChildLinkResult;
}

export async function requestMemberPasswordReset(input: { role: MemberRole; displayName: string }): Promise<void> {
  try {
    await call({ action: 'reset-request', role: input.role, displayName: normalizeMemberName(input.displayName) });
  } catch {
    // The screen says the same thing whether or not this reached the server, because the answer
    // must not depend on whether that name has an account.
  }
}

export async function completeMemberPasswordReset(input: {
  requestId: string; newPassword: string;
}): Promise<boolean> {
  try {
    const { data, status } = await call({
      action: 'reset-complete', requestId: input.requestId, newPassword: input.newPassword
    });
    return status < 400 && (data as { completed?: boolean } | null)?.completed === true;
  } catch {
    return false;
  }
}
