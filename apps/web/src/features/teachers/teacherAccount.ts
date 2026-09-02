import { requireSupabase } from '../../services/supabase';

export interface TeacherAccountCredentials {
  teacherId: string;
  profileId: string;
  displayName: string;
  teacherCode: string;
  initialPassword: string;
}

/**
 * Preview-only credentials keep the admin flow testable without creating an Auth user.
 * They are intentionally deterministic so a refresh of the same demo row is easy to recognise.
 */
export function previewTeacherAccountCredentials(input: {
  teacherId: string;
  displayName: string;
  teacherCode: string;
}): TeacherAccountCredentials {
  const safeCode = input.teacherCode.replace(/[^a-zA-Z0-9ก-๙]/g, '').slice(0, 16) || 'Teacher';
  return {
    teacherId: input.teacherId,
    profileId: `preview-profile-${input.teacherId}`,
    displayName: input.displayName,
    teacherCode: input.teacherCode,
    initialPassword: `Preview-${safeCode}-2026!`
  };
}

const messages: Record<string, string> = {
  AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  FORBIDDEN: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้นที่สร้างบัญชีครูได้',
  NOT_FOUND: 'ไม่พบข้อมูลครูคนนี้',
  TEACHER_NOT_VERIFIED: 'ยังเตรียมบัญชีไม่ได้ เพราะครูยังไม่ได้รับการยืนยันสถานะ กรุณายืนยันสถานะครูก่อน',
  ACCOUNT_EMAIL_EXISTS: 'บัญชีครูนี้ถูกสร้างไว้แล้ว กรุณาใช้รหัสเดิมหรือรีเซ็ตรหัสผ่าน',
  TARGET_ALREADY_LINKED: 'ครูคนนี้มีบัญชีเข้าใช้งานอยู่แล้ว',
  TEACHER_ACCOUNT_FAILED: 'ระบบยังสร้างบัญชีครูไม่ได้ กรุณาซิงก์ข้อมูลแล้วลองใหม่อีกครั้ง'
};

export class TeacherAccountError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'TeacherAccountError';
  }
}

export async function provisionTeacherAccount(input: {
  schoolId: string; teacherId: string;
}): Promise<TeacherAccountCredentials> {
  const { data, error } = await requireSupabase().functions.invoke('teacher-account', {
    body: { action: 'provision', ...input }
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as Record<string, unknown> | null
      : null;
    const rawMessage = String((error as { message?: string }).message ?? '');
    const code = typeof parsed?.code === 'string'
      ? parsed.code
      : Object.keys(messages).find((knownCode) => rawMessage.includes(knownCode)) ?? 'TEACHER_ACCOUNT_FAILED';
    throw new TeacherAccountError(code, messages[code] ?? 'สร้างบัญชีครูไม่สำเร็จ');
  }
  const result = data as Partial<TeacherAccountCredentials> | null;
  if (!result?.teacherId || !result.profileId || !result.displayName || !result.teacherCode || !result.initialPassword) {
    throw new TeacherAccountError('TEACHER_ACCOUNT_FAILED', 'สร้างบัญชีครูไม่สำเร็จ');
  }
  return result as TeacherAccountCredentials;
}
