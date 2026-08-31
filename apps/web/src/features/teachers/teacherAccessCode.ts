// Client half of the teacher access code.
//
// Nothing here decides anything. The code is generated, sealed and checked by the `teacher-code`
// Edge Function, and this module only asks and shapes the answer for a screen. In particular it
// never holds a code in browser storage: an administrator who wants to see theirs asks the server,
// which records that they did.

import { requireSupabase } from '../../services/supabase';

export interface TeacherAccessCode {
  codeId: string;
  /** The code itself. Present only on the response to issuing or revealing it. */
  code: string | null;
  hint: string;
  label: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string | null;
  expired: boolean;
  exhausted: boolean;
  /** Sealed under a key this deployment no longer holds. Rotating is the only way back. */
  unreadable: boolean;
}

export interface TeacherAccessCodeRecord {
  codeId: string;
  hint: string;
  label: string;
  status: 'active' | 'revoked';
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface TeacherAccessCodeUse {
  codeId: string;
  displayName: string;
  teacherId: string | null;
  usedAt: string;
}

export interface TeacherAccessCodeHistory {
  codes: TeacherAccessCodeRecord[];
  uses: TeacherAccessCodeUse[];
}

export class TeacherCodeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'TeacherCodeError';
  }
}

const messages: Record<string, string> = {
  TEACHER_CODE_FORBIDDEN: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้นที่จัดการรหัสสำหรับครูได้',
  TEACHER_CODE_LOCKED: 'ดำเนินการหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
  TEACHER_CODE_INVALID_LIMIT: 'จำนวนครั้งที่ใช้ได้ต้องอยู่ระหว่าง 1 ถึง 10000',
  TEACHER_CODE_INVALID_FORMAT: 'รหัสที่ตั้งเองต้องยาว 4 ถึง 24 ตัวอักษรหรือตัวเลข',
  TEACHER_CODE_TAKEN: 'รหัสนี้ถูกใช้อยู่แล้ว กรุณาตั้งรหัสอื่น',
  TEACHER_CODE_DENIED: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
};

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireSupabase().functions.invoke('teacher-code', { body });
  if (error) {
    // A non-2xx answer carries its reason in the body, which the SDK hides behind `context`.
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as Record<string, unknown> | null
      : null;
    const code = typeof parsed?.code === 'string' ? parsed.code : 'TEACHER_CODE_DENIED';
    throw new TeacherCodeError(code, messages[code] ?? messages.TEACHER_CODE_DENIED!);
  }
  return (data ?? {}) as Record<string, unknown>;
}

function toCode(row: Record<string, unknown>): TeacherAccessCode {
  return {
    codeId: String(row.codeId ?? ''),
    code: typeof row.code === 'string' ? row.code : null,
    hint: String(row.hint ?? ''),
    label: String(row.label ?? ''),
    expiresAt: (row.expiresAt as string | null) ?? null,
    maxUses: row.maxUses === null || row.maxUses === undefined ? null : Number(row.maxUses),
    useCount: Number(row.useCount ?? 0),
    createdAt: (row.createdAt as string | null) ?? null,
    expired: row.expired === true,
    exhausted: row.exhausted === true,
    unreadable: row.unreadable === true
  };
}

/**
 * Issues the school's code, replacing any earlier one.
 *
 * This is the only moment the plain code is in the browser as a matter of course, which is why the
 * screen shows it immediately and offers to copy it: an administrator who closes the dialog can ask
 * for it again, but only by asking the server.
 */
export async function issueTeacherAccessCode(input: {
  schoolId: string; label?: string; expiresAt?: string | null; maxUses?: number | null;
  /** A code the school chose. Leave it out to have the server draw one. */
  code?: string;
}): Promise<TeacherAccessCode> {
  const data = await call({
    action: 'issue', schoolId: input.schoolId, label: input.label ?? '',
    expiresAt: input.expiresAt ?? null, maxUses: input.maxUses ?? null,
    ...(input.code && input.code.trim() ? { code: input.code.trim() } : {})
  });
  return toCode({ ...data, useCount: 0, expired: false, exhausted: false });
}

/** The school's live code, or null when it has never issued one. */
export async function revealTeacherAccessCode(schoolId: string): Promise<TeacherAccessCode | null> {
  const data = await call({ action: 'reveal', schoolId });
  if (data.exists !== true) return null;
  return toCode(data);
}

export async function revokeTeacherAccessCode(input: {
  schoolId: string; codeId: string; reason: string;
}): Promise<void> {
  await call({ action: 'revoke', schoolId: input.schoolId, codeId: input.codeId, reason: input.reason });
}

export async function teacherAccessCodeHistory(schoolId: string): Promise<TeacherAccessCodeHistory> {
  const data = await call({ action: 'history', schoolId });
  return {
    codes: (Array.isArray(data.codes) ? data.codes : []) as TeacherAccessCodeRecord[],
    uses: (Array.isArray(data.uses) ? data.uses : []) as TeacherAccessCodeUse[]
  };
}

/** What a code is still good for, in one sentence, for a screen that has just fetched it. */
export function describeTeacherAccessCode(code: TeacherAccessCode | null): string {
  if (!code) return 'โรงเรียนนี้ยังไม่มีรหัสสำหรับครู';
  if (code.expired) return 'รหัสนี้หมดอายุแล้ว ครูใหม่ใช้สมัครไม่ได้ กรุณาสร้างรหัสใหม่';
  if (code.exhausted) return 'รหัสนี้ถูกใช้ครบจำนวนที่กำหนดแล้ว กรุณาสร้างรหัสใหม่';
  const limit = code.maxUses === null ? 'ไม่จำกัดจำนวนครู' : `ใช้ได้อีก ${code.maxUses - code.useCount} ครั้ง`;
  const expiry = code.expiresAt
    ? `หมดอายุ ${new Date(code.expiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'ไม่มีวันหมดอายุ';
  return `ใช้งานได้ · ${limit} · ${expiry} · ใช้ไปแล้ว ${code.useCount} ครั้ง`;
}
