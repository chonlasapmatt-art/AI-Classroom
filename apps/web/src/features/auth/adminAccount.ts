import { requireSupabase } from '../../services/supabase';

export type ManagedAccountRole = 'teacher' | 'student' | 'parent';

/**
 * A long-open admin tab can hold an expired access token while Supabase still has a refresh token.
 * Refresh once on a gateway 401 so an otherwise valid admin does not lose a form submission.
 */
async function invokeAdminAccount(body: Record<string, unknown>) {
  const client = requireSupabase();
  let result = await client.functions.invoke('admin-account', { body });
  const context = (result.error as { context?: Response } | null)?.context;
  if (result.error && context?.status === 401) {
    const { error: refreshError } = await client.auth.refreshSession();
    if (!refreshError) result = await client.functions.invoke('admin-account', { body });
  }
  return result;
}

/** The reason a refusal carries, in words an administrator can act on. */
const messages: Record<string, string> = {
  AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  FORBIDDEN: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น',
  NOT_FOUND: 'ไม่พบบัญชีนี้ในโรงเรียน อาจถูกลบหรือยังไม่ได้สร้างบัญชีเข้าใช้งาน',
  TARGET_ALREADY_LINKED: 'บัญชีนี้ถูกเชื่อมไว้แล้ว',
  ROLE_CONFLICT: 'บัญชีนี้ถูกใช้กับผู้ใช้งานคนละประเภท',
  PARENT_NAME_EXISTS: 'มีผู้ปกครองชื่อนี้อยู่แล้วในโรงเรียน กรุณาแก้ไขรายชื่อเดิม หรือใช้ชื่อที่ต่างกัน',
  VALIDATION_ERROR: 'กรุณากรอกข้อมูลให้ครบถ้วน รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'
};

/**
 * Reads the reason out of a refusal.
 *
 * A non-2xx answer keeps its reason in the response body, which the SDK hides behind `context`. An
 * administrator told only "ไม่สำเร็จ" cannot tell a lapsed session from a deleted account, and both
 * happen — so the code is dug out and named.
 */
async function refusalMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response }).context;
  const parsed = context && typeof context.json === 'function'
    ? await context.json().catch(() => null) as Record<string, unknown> | null
    : null;
  const code = typeof parsed?.code === 'string' ? parsed.code : '';
  const known = messages[code];
  if (known) return known;
  // The gateway attaches the database's own words to a refusal it has no name for. Showing them is
  // not pretty, and it is the difference between "ไม่สำเร็จ" forever and somebody being able to say
  // what actually happened. The administrator seeing this is acting on their own school's records.
  const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';
  return reason ? `${fallback} (${reason})` : fallback;
}

export async function provisionManagedAccount(input: {
  schoolId: string; role: ManagedAccountRole; recordId: string; studentId?: string;
  displayName: string; password: string; relationship?: string; phone?: string;
}): Promise<{ profileId: string; parentId?: string | null; linkId?: string | null }> {
  const { data, error } = await invokeAdminAccount({ action: 'provision', ...input });
  if (error) throw new Error(await refusalMessage(error, 'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
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
  const { error } = await invokeAdminAccount({ action: 'set-password', ...input });
  if (error) throw new Error(await refusalMessage(error, 'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
}
