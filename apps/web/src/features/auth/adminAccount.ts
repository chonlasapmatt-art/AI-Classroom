import { requireSupabase } from '../../services/supabase';

export type ManagedAccountRole = 'teacher' | 'student' | 'parent';

export async function provisionManagedAccount(input: {
  schoolId: string; role: ManagedAccountRole; recordId: string; studentId?: string;
  displayName: string; password: string; relationship?: string; phone?: string;
}): Promise<{ profileId: string; parentId?: string | null; linkId?: string | null }> {
  const { data, error } = await requireSupabase().functions.invoke('admin-account', {
    body: { action: 'provision', ...input }
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function' ? await context.json().catch(() => null) as Record<string, unknown> | null : null;
    const code = typeof parsed?.code === 'string' ? parsed.code : '';
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', FORBIDDEN: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น',
      NOT_FOUND: 'ไม่พบข้อมูลที่เลือก', TARGET_ALREADY_LINKED: 'บัญชีนี้ถูกเชื่อมไว้แล้ว',
      ROLE_CONFLICT: 'บัญชีนี้ถูกใช้กับผู้ใช้งานคนละประเภท', VALIDATION_ERROR: 'กรุณากรอกข้อมูลให้ครบถ้วน'
    };
    throw new Error(messages[code] ?? 'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  const result = data as { profileId?: string; parentId?: string | null; linkId?: string | null } | null;
  if (!result?.profileId) throw new Error('สร้างบัญชีไม่สำเร็จ');
  return {
    profileId: result.profileId,
    ...(result.parentId !== undefined ? { parentId: result.parentId } : {}),
    ...(result.linkId !== undefined ? { linkId: result.linkId } : {})
  };
}

export async function setManagedAccountPassword(input: {
  schoolId: string; role: ManagedAccountRole; profileId: string; password: string;
}): Promise<void> {
  const { error } = await requireSupabase().functions.invoke('admin-account', {
    body: { action: 'set-password', ...input }
  });
  if (error) throw new Error('เปลี่ยนรหัสผ่านไม่สำเร็จ');
}
