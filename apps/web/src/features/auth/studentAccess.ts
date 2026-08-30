// Client half of the passwordless student flow.
//
// Everything here is presentation and shaping. Authority lives in the `student-access` Edge
// Function: this module never decides that a student exists, only how to ask and how to phrase the
// answer. Failures are deliberately collapsed into one message so the screen cannot be used to work
// out whether a name, a student number or a school is the part that was wrong.

import { requireSupabase } from '../../services/supabase';

export const STUDENT_ACCESS_GENERIC_MESSAGE =
  'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อและเลขประจำตัวนักเรียน';

export interface StudentSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface StudentAccessProfile {
  studentId: string;
  schoolId: string;
  schoolName: string;
  displayName: string;
  firstAccess?: boolean;
}

export interface SchoolChoice {
  schoolId: string;
  name: string;
}

export type StudentAccessResult =
  | { outcome: 'session'; session: StudentSessionTokens; student: StudentAccessProfile; created?: boolean }
  | { outcome: 'school-required'; schools: SchoolChoice[] }
  | { outcome: 'error'; message: string; locked?: boolean };

/** Collapses runs of whitespace so "  สมชาย   ใจดี " and "สมชาย ใจดี" are the same lookup. */
export function normalizeStudentName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeStudentCode(value: string): string {
  return value.replace(/[\s-]/g, '').trim().toUpperCase();
}

export function isCompleteStudentLogin(displayName: string, studentCode: string): boolean {
  return normalizeStudentName(displayName).length >= 2 && normalizeStudentCode(studentCode).length >= 1;
}

export function isCompleteStudentRegistration(input: {
  firstName: string; lastName: string; studentCode: string; schoolId: string;
}): boolean {
  return normalizeStudentName(input.firstName).length >= 1
    && normalizeStudentName(input.lastName).length >= 1
    && normalizeStudentCode(input.studentCode).length >= 1
    && input.schoolId.trim().length > 0;
}

/**
 * Turns a server response into something a screen can render. Only the two cases a student can act
 * on — pick a school, or a lockout they must wait out — get their own message; everything else is
 * the one generic failure.
 */
export function interpretStudentAccessResponse(payload: unknown, status: number): StudentAccessResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';

  if (code === 'SCHOOL_SELECTION_REQUIRED') {
    const schools = Array.isArray(body.schools) ? body.schools as SchoolChoice[] : [];
    return { outcome: 'school-required', schools };
  }
  if (code === 'STUDENT_ACCESS_LOCKED') {
    const minutes = typeof body.retryAfterMinutes === 'number' ? body.retryAfterMinutes : 15;
    return { outcome: 'error', locked: true, message: `พยายามเข้าใช้งานหลายครั้งเกินไป กรุณารออีก ${minutes} นาที` };
  }
  if (code === 'STUDENT_ACCESS_REVOKED') {
    return { outcome: 'error', message: 'บัญชีนักเรียนนี้ถูกปิดการเข้าใช้งาน กรุณาติดต่อคุณครู' };
  }
  if (code === 'STUDENT_ALREADY_ACTIVE') {
    return { outcome: 'error', message: 'นักเรียนคนนี้เปิดใช้งานแล้ว กรุณาเลือก "เข้าใช้งาน" แทน' };
  }
  if (code === 'SELF_REGISTRATION_DISABLED') {
    return { outcome: 'error', message: 'โรงเรียนนี้ให้คุณครูเป็นผู้เพิ่มนักเรียน กรุณาติดต่อคุณครู' };
  }

  const session = body.session as { accessToken?: string; refreshToken?: string } | undefined;
  const student = body.student as StudentAccessProfile | undefined;
  if (status < 400 && session?.accessToken && session.refreshToken && student) {
    return {
      outcome: 'session',
      session: { accessToken: session.accessToken, refreshToken: session.refreshToken },
      student,
      created: body.created === true
    };
  }

  return { outcome: 'error', message: STUDENT_ACCESS_GENERIC_MESSAGE };
}

async function invoke(body: Record<string, unknown>): Promise<StudentAccessResult> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('student-access', { body });
    if (error) {
      // The SDK hides the body of a non-2xx response behind `context`, and the school picker and
      // the lockout notice both live in that body, so read it back before falling through.
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        const parsed = await context.json().catch(() => null);
        return interpretStudentAccessResponse(parsed, context.status ?? 400);
      }
      return interpretStudentAccessResponse(null, 400);
    }
    return interpretStudentAccessResponse(data, 200);
  } catch {
    return { outcome: 'error', message: STUDENT_ACCESS_GENERIC_MESSAGE };
  }
}

export async function studentLogin(input: {
  displayName: string; studentCode: string; schoolId?: string;
}): Promise<StudentAccessResult> {
  return invoke({
    action: 'login',
    displayName: normalizeStudentName(input.displayName),
    studentCode: normalizeStudentCode(input.studentCode),
    ...(input.schoolId ? { schoolId: input.schoolId } : {})
  });
}

export async function studentRegister(input: {
  firstName: string; lastName: string; studentCode: string; schoolId: string;
}): Promise<StudentAccessResult> {
  return invoke({
    action: 'register',
    firstName: normalizeStudentName(input.firstName),
    lastName: normalizeStudentName(input.lastName),
    studentCode: normalizeStudentCode(input.studentCode),
    schoolId: input.schoolId
  });
}

export async function searchSchools(query: string): Promise<SchoolChoice[]> {
  if (query.trim().length < 2) return [];
  try {
    const { data, error } = await requireSupabase().functions.invoke('student-access', {
      body: { action: 'schools', query: query.trim() }
    });
    if (error) return [];
    const rows = (data as { schools?: { school_id: string; name: string }[] } | null)?.schools ?? [];
    return rows.map((row) => ({ schoolId: row.school_id, name: row.name }));
  } catch {
    return [];
  }
}
