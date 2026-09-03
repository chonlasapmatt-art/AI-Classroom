// The operator's second factor, as the console talks to it.
//
// Nothing here is a factor of this application's own invention. Enrolment, the challenge and the
// upgrade to `aal2` are all GoTrue's, which is what makes the assurance level a claim inside the
// token rather than a flag some screen sets — and therefore something the database can be told about
// and trust. A home-made "we checked a code" boolean would be exactly as strong as the browser
// asserting it.
//
// The console's job is only to walk an operator through it and to notice when a session has not
// cleared the factor it should have.

import { requireSupabase } from '../services/supabase';

export interface MfaFactor {
  id: string;
  friendlyName: string;
  status: 'verified' | 'unverified';
}

export interface MfaEnrolment {
  factorId: string;
  /** A `data:` URI the operator scans. GoTrue draws it; nothing is fetched from anywhere. */
  qrCode: string;
  /** The same secret in text, for an authenticator app that will not use a camera. */
  secret: string;
}

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaError';
  }
}

const messages: Record<string, string> = {
  invalid_code: 'รหัส 6 หลักไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาดูรหัสล่าสุดในแอปแล้วลองใหม่',
  too_many_requests: 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
  mfa_verification_failed: 'ยืนยันรหัสไม่สำเร็จ กรุณาตรวจว่านาฬิกาของเครื่องตรงเวลา'
};

function fail(error: unknown, fallback: string): MfaError {
  const detail = (error ?? {}) as { message?: string | undefined; code?: string | undefined };
  const key = String(detail.code ?? '');
  const raw = String(detail.message ?? '');
  const known = messages[key] ?? Object.entries(messages).find(([code]) => raw.includes(code))?.[1];
  return new MfaError(known ?? fallback);
}

/** The factors on this account. An empty list means the operator has not enrolled one yet. */
export async function listFactors(): Promise<MfaFactor[]> {
  const { data, error } = await requireSupabase().auth.mfa.listFactors();
  if (error) throw fail(error, 'อ่านรายการตัวยืนยันไม่สำเร็จ');
  return (data?.all ?? []).map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? 'Authenticator',
    status: factor.status === 'verified' ? 'verified' : 'unverified'
  }));
}

/**
 * Starts enrolment and returns what the operator has to scan.
 *
 * The factor exists in an unverified state from this moment. It grants nothing until a code proves
 * the operator actually holds it, which is what `verifyEnrolment` does — an unverified factor left
 * behind by an abandoned attempt is inert and can be removed.
 */
export async function beginEnrolment(friendlyName: string): Promise<MfaEnrolment> {
  const { data, error } = await requireSupabase().auth.mfa.enroll({
    factorType: 'totp', friendlyName
  });
  if (error || !data) throw fail(error, 'เริ่มตั้งค่าตัวยืนยันไม่สำเร็จ');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Proves the operator holds the factor, which both verifies it and raises the session to aal2. */
export async function verifyEnrolment(factorId: string, code: string): Promise<void> {
  const { error } = await requireSupabase().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw fail(error, 'ยืนยันรหัสไม่สำเร็จ');
}

/** Clears the factor. Same call as enrolment verification, used on an already-verified factor. */
export async function challenge(factorId: string, code: string): Promise<void> {
  const { error } = await requireSupabase().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw fail(error, 'ยืนยันรหัสไม่สำเร็จ');
}

export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await requireSupabase().auth.mfa.unenroll({ factorId });
  if (error) throw fail(error, 'ลบตัวยืนยันไม่สำเร็จ');
}

/**
 * What the session has cleared, and what it would need to clear.
 *
 * `nextLevel` above `currentLevel` is GoTrue saying this account has a verified factor that this
 * session has not answered — which is the exact condition the console has to notice before a
 * dangerous action is attempted and refused.
 */
export async function assuranceLevels(): Promise<{ current: string; next: string; needsChallenge: boolean }> {
  const { data, error } = await requireSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { current: 'aal1', next: 'aal1', needsChallenge: false };
  const current = data.currentLevel ?? 'aal1';
  const next = data.nextLevel ?? current;
  return { current, next, needsChallenge: next === 'aal2' && current !== 'aal2' };
}
