// Teacher access code cryptography, shared by the screen that issues codes and the screen that
// redeems one.
//
// A teacher code has two jobs that pull in opposite directions. It has to be checkable — the
// registration gateway must be able to say yes or no to a typed code — and it has to be readable
// again, because an administrator who issued a code in May will need to send it to a new teacher in
// October and cannot be told it is gone.
//
// Hashing alone satisfies the first and fails the second. Storing the code in the clear satisfies
// the second and gives anybody with a copy of the database a working code for every school. So the
// row carries both forms: an HMAC that the redemption path matches against, and the code sealed with
// AES-GCM under a key held only in this function's environment. The database never holds the key,
// and the redemption path never needs the code back.

const CODE_PREFIX = 'SC-';
const CODE_DIGITS = 6;

/**
 * Reduces a typed code to what it means.
 *
 * People retype these from a chat message, a whiteboard or a printout, so the separator, the case
 * and the spaces around it are noise. `sc 482917`, `SC-482917` and `sc482917` are one code; the
 * digits are the code.
 */
export function normalizeAccessCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** The form a person sees and copies. */
export function formatAccessCode(value: string): string {
  const normalized = normalizeAccessCode(value);
  const digits = normalized.startsWith('SC') ? normalized.slice(2) : normalized;
  return `${CODE_PREFIX}${digits}`;
}

/** Enough of a code to tell two of them apart in a list, and not enough to use either. */
export function accessCodeHint(value: string): string {
  const formatted = formatAccessCode(value);
  const digits = formatted.slice(CODE_PREFIX.length);
  if (digits.length <= 2) return `${CODE_PREFIX}${'•'.repeat(digits.length)}`;
  return `${CODE_PREFIX}${'•'.repeat(digits.length - 2)}${digits.slice(-2)}`;
}

/** A fresh code. The digits come from the platform's cryptographic generator, not from Math.random. */
export function generateAccessCode(): string {
  const values = new Uint32Array(CODE_DIGITS);
  crypto.getRandomValues(values);
  const digits = [...values].map((value) => String(value % 10)).join('');
  return `${CODE_PREFIX}${digits}`;
}

async function importKey(secret: string, usage: 'hmac' | 'aes'): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret);
  if (usage === 'hmac') {
    return await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  // AES-GCM needs exactly 256 bits, and the configured secret is a passphrase of arbitrary length.
  const digest = await crypto.subtle.digest('SHA-256', material);
  return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

/**
 * The value stored for matching.
 *
 * The school id is part of what is signed, so the same six digits issued by two different schools
 * produce two unrelated hashes. A code cannot be carried from one school to another even if somebody
 * guesses the digits, and the unique index on active hashes stays meaningful across the platform.
 */
export async function hashAccessCode(schoolId: string, code: string, secret: string): Promise<string> {
  const key = await importKey(secret, 'hmac');
  const payload = new TextEncoder().encode(`teacher-code|${schoolId}|${normalizeAccessCode(code)}`);
  return toHex(await crypto.subtle.sign('HMAC', key, payload));
}

/** Seals a code so only this function, holding the key, can read it back. */
export async function sealAccessCode(code: string, secret: string): Promise<string> {
  const key = await importKey(secret, 'aes');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(formatAccessCode(code))
  );
  const combined = new Uint8Array(iv.length + sealed.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(sealed), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Opens a sealed code. Returns null rather than throwing when the key or the payload is wrong. */
export async function openAccessCode(cipher: string, secret: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(cipher), (character) => character.charCodeAt(0));
    if (combined.length <= 12) return null;
    const key = await importKey(secret, 'aes');
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12)
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
