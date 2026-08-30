// Client half of name + password access for teachers and parents.
//
// Everything here is shaping and phrasing. Authority lives in the `member-access` Edge Function:
// this module never decides that an account exists, only how to ask and how to say no. Every
// rejection collapses into the same sentence, so the screen cannot be used to work out whether the
// name or the password was the wrong half.

import { requireSupabase } from '../../services/supabase';

export const MEMBER_ACCESS_GENERIC_MESSAGE = 'ชื่อหรือรหัสผ่านไม่ถูกต้อง';
export const MEMBER_PASSWORD_MINIMUM = 8;

export function isValidRecoveryEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type MemberRole = 'teacher' | 'parent';

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

export function isCompleteMemberRegistration(input: {
  firstName: string; lastName: string; password: string; confirmPassword: string;
  schoolId?: string; recoveryEmail?: string;
}): boolean {
  return normalizeMemberName(input.firstName).length >= 1
    && normalizeMemberName(input.lastName).length >= 1
    && input.password.length >= MEMBER_PASSWORD_MINIMUM
    && input.password === input.confirmPassword
    && (input.recoveryEmail === undefined || isValidRecoveryEmail(input.recoveryEmail))
    && (input.schoolId === undefined || input.schoolId.trim().length > 0);
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
    return { outcome: 'error', message: `กรุณากรอกชื่อ นามสกุล อีเมลกู้คืน และรหัสผ่านอย่างน้อย ${MEMBER_PASSWORD_MINIMUM} ตัวอักษร` };
  }
  if (code === 'SCHOOL_NOT_AVAILABLE') {
    return { outcome: 'error', message: 'ไม่พบโรงเรียนที่เลือก กรุณาเลือกใหม่อีกครั้ง' };
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

export async function registerTeacher(input: {
  firstName: string; lastName: string; schoolId: string; password: string; recoveryEmail: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'register-teacher',
    firstName: normalizeMemberName(input.firstName), lastName: normalizeMemberName(input.lastName),
    schoolId: input.schoolId, password: input.password, recoveryEmail: input.recoveryEmail.trim().toLowerCase()
  });
}

export async function registerParent(input: {
  firstName: string; lastName: string; password: string; recoveryEmail: string;
}): Promise<MemberAccessResult> {
  return accessCall({
    action: 'register-parent',
    firstName: normalizeMemberName(input.firstName), lastName: normalizeMemberName(input.lastName),
    password: input.password, recoveryEmail: input.recoveryEmail.trim().toLowerCase()
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
export async function searchChildren(childName: string): Promise<ChildCandidate[]> {
  if (normalizeMemberName(childName).length < 2) return [];
  try {
    const { data } = await call({ action: 'children-search', childName: normalizeMemberName(childName) });
    const rows = (data as { children?: ChildCandidate[] } | null)?.children ?? [];
    return rows;
  } catch {
    return [];
  }
}

export async function linkChild(studentId: string, relationship?: string): Promise<ChildLinkResult | null> {
  try {
    const { data, status } = await call({
      action: 'children-link', studentId, ...(relationship ? { relationship } : {})
    });
    if (status >= 400 || !data) return null;
    return data as ChildLinkResult;
  } catch {
    return null;
  }
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
