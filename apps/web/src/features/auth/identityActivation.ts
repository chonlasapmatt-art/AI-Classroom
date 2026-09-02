import { requireSupabase } from '../../services/supabase';

export type ActivatableRole = 'teacher' | 'student' | 'parent';

export interface ActivatedLogin {
  role: ActivatableRole;
  recordId: string;
  displayName: string;
  /** What the person types in the second field. Teachers sign in with a code; guardians do not. */
  signInCode: string | null;
  hasAccount: boolean;
  needsPassword: boolean;
}

/**
 * Makes one roster row able to sign in, and reports what to type.
 *
 * "I added them and they cannot get in" has several possible causes — the row inactive, a teacher
 * still unverified, a login identity or membership left suspended — and none of them are visible
 * from the screen. Rather than ask an administrator to diagnose that, this sets every condition the
 * sign-in checks, in one transaction, and hands back the name and code that now work.
 */
export async function activateMemberLogin(input: {
  schoolId: string; role: ActivatableRole; recordId: string;
}): Promise<ActivatedLogin> {
  const { data, error } = await requireSupabase().rpc('activate_member_login', {
    p_school_id: input.schoolId, p_role: input.role, p_record_id: input.recordId
  });
  if (error) {
    const message = String(error.message ?? '');
    if (message.includes('FORBIDDEN')) throw new Error('เฉพาะผู้ดูแลโรงเรียนเท่านั้นที่ยืนยันไอดีได้');
    if (message.includes('NOT_FOUND')) throw new Error('ไม่พบรายชื่อนี้ในโรงเรียน');
    if (message.includes('PARENT_NAME_EXISTS')) throw new Error('มีผู้ปกครองชื่อนี้ใช้งานอยู่แล้ว กรุณาแก้ชื่อให้ต่างกันก่อน');
    throw new Error('ยืนยันไอดีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    role: input.role,
    recordId: String(row.recordId ?? input.recordId),
    displayName: String(row.displayName ?? ''),
    signInCode: typeof row.signInCode === 'string' ? row.signInCode : null,
    hasAccount: row.hasAccount === true,
    needsPassword: row.needsPassword === true
  };
}

/** One sentence telling the administrator what the person can now do, and what is still missing. */
export function describeActivatedLogin(result: ActivatedLogin): string {
  if (result.role === 'teacher' || result.role === 'student') {
    const label = result.role === 'teacher' ? 'รหัสครู' : 'เลขประจำตัว';
    const code = result.signInCode ? ` กับ${label} ${result.signInCode}` : '';
    return `ยืนยันไอดีของ ${result.displayName} แล้ว · เข้าสู่ระบบด้วยชื่อ ${result.displayName}${code} ได้ทันที`;
  }
  if (result.needsPassword) {
    return `ยืนยันไอดีของ ${result.displayName} แล้ว · เหลือตั้งรหัสผ่านอีกขั้นเดียวจึงจะเข้าใช้งานได้`;
  }
  return `ยืนยันไอดีของ ${result.displayName} แล้ว · เข้าสู่ระบบด้วยชื่อ ${result.displayName} กับรหัสผ่านเดิมได้ทันที`;
}
