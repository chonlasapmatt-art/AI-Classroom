// Client half of first-run activation: drawing the product key, and spending it on a school.
//
// Nothing is decided here. The key is generated, hashed and checked by the `admin-access` Edge
// Function; this module asks, and turns the server's answer into something a Thai-speaking customer
// can act on. The key is never written to browser storage — it is shown once, copied by the person
// who bought the product, and typed back on the next step. That retype is the point: a customer who
// did not save the key finds out while a new one is still one click away.

import { requireSupabase } from '../../services/supabase';

export class SchoolSetupError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SchoolSetupError';
  }
}

const messages: Record<string, string> = {
  SCHOOL_CODE_EXISTS: 'รหัสโรงเรียนนี้ถูกใช้แล้ว กรุณาใช้รหัสโรงเรียนใหม่ หรือกลับไปเข้าสู่ระบบของโรงเรียนเดิม',
  TEMPORARILY_LOCKED: 'ลองรหัสเปิดใช้งานหลายครั้งเกินไป กรุณารอประมาณ 30 นาทีแล้วลองใหม่',
  ACCESS_DENIED: 'รหัสเปิดใช้งานไม่ถูกต้อง กรุณาตรวจตัวพิมพ์เล็ก–ใหญ่และเว้นวรรคท้ายรหัส',
  SERVER_CONFIGURATION_ERROR: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ารหัสเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  ALREADY_HAS_MEMBERSHIP: 'บัญชีนี้ตั้งค่าโรงเรียนไว้แล้ว ให้กลับไปเข้าสู่ระบบแทนการสร้างโรงเรียนใหม่',
  ADMIN_ROLE_REQUIRED: 'บัญชีนี้ไม่ใช่ผู้ดูแลของโรงเรียนใด จึงสร้างโรงเรียนใหม่ไม่ได้ กรุณาใช้บัญชีผู้ดูแล',
  AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง',
  VALIDATION_ERROR: 'ข้อมูลโรงเรียนไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจชื่อ รหัสโรงเรียน ปีการศึกษา และภาคเรียน',
  PRODUCT_KEY_FAILED: 'สร้างคีย์ผลิตภัณฑ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  PRODUCT_KEY_UNREADABLE: 'เปิดคีย์เดิมของบัญชีนี้ไม่ได้ เพราะคีย์ลับของเซิร์ฟเวอร์ถูกเปลี่ยน กรุณาติดต่อผู้ดูแลระบบ',
  ACTION_NOT_SUPPORTED: 'เซิร์ฟเวอร์รุ่นนี้ยังไม่รองรับขั้นตอนนี้ กรุณาอัปเดตเซิร์ฟเวอร์แล้วลองใหม่',
  IDENTITY_NOT_FOUND: 'บัญชีนี้ยังไม่มีข้อมูลผู้ใช้ในระบบ กรุณาสมัครบัญชีผู้ดูแลใหม่แล้วลองอีกครั้ง',
  SETUP_REJECTED: 'ตั้งค่าโรงเรียนไม่สำเร็จ กรุณาตรวจข้อมูลและรหัสเปิดใช้งาน'
};

/** Error codes the gateway is known to answer with, used to read one out of a bare SDK message. */
const knownCodes = Object.keys(messages);

/**
 * Invokes `admin-access` and turns any refusal into a `SchoolSetupError` carrying its reason.
 *
 * A non-2xx answer keeps its reason in the response body, which the Supabase SDK hides behind
 * `context`. When even that is unreadable the raw message is searched for a known code, because a
 * customer told "ตั้งค่าไม่สำเร็จ" and nothing else has no idea whether to retype the key or rename
 * their school.
 */
async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireSupabase().functions.invoke('admin-access', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const parsed = context && typeof context.json === 'function'
      ? await context.json().catch(() => null) as { code?: string; reason?: string } | null
      : null;
    const rawMessage = String((error as { message?: string }).message ?? '');
    const code = parsed?.code ?? knownCodes.find((known) => rawMessage.includes(known)) ?? 'SETUP_REJECTED';
    // A refusal the gateway could not name carries the database's own words. They are not pretty and
    // they are the difference between a customer re-checking a key that was never the problem and
    // one who can say what actually failed.
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';
    const message = messages[code] ?? messages.SETUP_REJECTED!;
    throw new SchoolSetupError(code, reason ? `${message} (${reason})` : message);
  }
  return (data ?? {}) as Record<string, unknown>;
}

export interface ProductKey {
  /** Grouped for reading and copying, e.g. `SC-AB3D9-...`. */
  productKey: string;
  /** Safe to keep on screen afterwards: identifies the key without being usable. */
  hint: string;
  /** True when this was already the account's key rather than a key drawn just now. */
  existing: boolean;
}

/**
 * Returns this account's one product key, drawing it the first time and only the first time.
 *
 * Asking twice is not drawing twice. The key is sealed when it is drawn, so a customer who reloaded
 * the wizard gets the same twenty characters back rather than a replacement — which is what stops
 * somebody ending up with two keys in their notes and no idea which one opens their server.
 */
export async function issueProductKey(): Promise<ProductKey> {
  const data = await call({ action: 'issue-product-key' });
  const productKey = String(data.productKey ?? '');
  if (!productKey) throw new SchoolSetupError('PRODUCT_KEY_FAILED', messages.PRODUCT_KEY_FAILED!);
  return { productKey, hint: String(data.hint ?? ''), existing: data.existing === true };
}

export interface SchoolActivation {
  displayName: string;
  schoolName: string;
  schoolCode: string;
  academicYear: string;
  term: string;
  accessCode: string;
}

/** Spends the key and creates the school. Returns the new school's id. */
export async function activateSchool(input: SchoolActivation): Promise<string> {
  const data = await call({
    action: 'activate',
    accessCode: input.accessCode.trim(),
    displayName: input.displayName.trim(),
    schoolName: input.schoolName.trim(),
    schoolCode: input.schoolCode.trim().toUpperCase(),
    academicYear: input.academicYear.trim(),
    term: input.term.trim()
  });
  const schoolId = String(data.schoolId ?? '');
  if (!schoolId) throw new SchoolSetupError('SETUP_REJECTED', 'ตั้งค่าโรงเรียนไม่สมบูรณ์');
  return schoolId;
}

/** The school name and code are what the customer cannot change easily later, so both are checked. */
export function isCompleteSchoolIdentity(input: { displayName: string; schoolName: string; schoolCode: string }): boolean {
  return input.displayName.trim().length >= 2
    && input.schoolName.trim().length >= 2
    && /^[A-Za-z0-9-]{3,20}$/.test(input.schoolCode.trim());
}
