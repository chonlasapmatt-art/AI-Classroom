// Product activation key cryptography, shared by the screen that draws a key and the console that
// reads one back.
//
// A product key has the same two jobs a teacher access code has, and the same tension between them.
// It must be checkable, because activation matches a typed key against what was issued; and it must
// be readable again, because the customer who paid for the server will lose their copy and the only
// person who can answer them is the operator who sold it.
//
// So the row carries both forms: `sha256` of the normalised key, which is what activation compares,
// and the key sealed with AES-GCM under `PRODUCT_KEY_SECRET`, which only these functions hold. A
// database dump yields neither a usable key nor a way to derive one; opening a seal is a deliberate
// support action that the console records.
//
// The alternative -- a digest and nothing else, which is what shipped first -- meant a customer who
// closed the tab before copying their key had to be given a different one. That is how a customer
// ends up with two keys in their notes and no idea which activates their server.

const KEY_PREFIX = 'SC-';
// No O/0, I/1 or U/V: the key is read off a screen and typed back on the very next page, so a
// character somebody can misread is a support call waiting to happen.
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTWXYZ23456789';
const KEY_GROUPS = 4;
const KEY_GROUP_LENGTH = 5;
const KEY_LENGTH = KEY_GROUPS * KEY_GROUP_LENGTH;
const MINIMUM_SECRET_LENGTH = 32;

/**
 * Which environment variable holds the sealing key.
 *
 * One name, resolved in one place, for the reason the teacher code module says at length: two halves
 * of the same feature each reading their own variable agree right up until a deployment sets one of
 * them, and then every key in the system stops working at once.
 */
export function resolveProductKeySecret(read: (name: string) => string | undefined): string | null {
  const value = read('PRODUCT_KEY_SECRET');
  return value && value.length >= MINIMUM_SECRET_LENGTH ? value : null;
}

/**
 * What a typed product key means, with the presentation removed.
 *
 * The key is shown grouped and retyped from a clipboard, a chat message or a photograph of a screen,
 * so the dashes, the spaces and the case are decoration. The `SC-` is decoration too, and forgetting
 * that broke every activation once: the key is drawn and hashed as the twenty characters and only
 * shown with the prefix. Dropping the prefix is unambiguous rather than a guess, because a bare key
 * is twenty characters and a prefixed one is twenty-two -- so a key whose own first two characters
 * happen to be `SC` still reads correctly.
 */
export function normalizeProductKey(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.length === KEY_LENGTH + 2 && cleaned.startsWith('SC') ? cleaned.slice(2) : cleaned;
}

/** Groups a key for reading aloud and copying. Purely presentational; never hashed in this form. */
export function formatProductKey(normalized: string): string {
  return `${KEY_PREFIX}${(normalizeProductKey(normalized).match(/.{1,5}/g) ?? []).join('-')}`;
}

/** Enough to confirm which key somebody is holding, and not enough to use it. */
export function productKeyHint(normalized: string): string {
  return `${KEY_PREFIX}****-****-${normalizeProductKey(normalized).slice(-KEY_GROUP_LENGTH)}`;
}

/** A fresh key, drawn from the platform's cryptographic generator with no modulo bias. */
export function generateProductKey(): string {
  const characters: string[] = [];
  // 256 is not a multiple of the alphabet, so bytes above the last whole multiple are redrawn
  // rather than folded -- folding them would make the low characters fractionally more likely.
  const ceiling = Math.floor(256 / KEY_ALPHABET.length) * KEY_ALPHABET.length;
  while (characters.length < KEY_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
    for (const byte of bytes) {
      if (byte >= ceiling) continue;
      characters.push(KEY_ALPHABET[byte % KEY_ALPHABET.length]!);
      if (characters.length === KEY_LENGTH) break;
    }
  }
  return characters.join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function importSealingKey(secret: string): Promise<CryptoKey> {
  // AES-GCM needs exactly 256 bits, and the configured secret is a passphrase of arbitrary length.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Seals a key so only a function holding `PRODUCT_KEY_SECRET` can read it back. */
export async function sealProductKey(normalized: string, secret: string): Promise<string> {
  const key = await importSealingKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(normalizeProductKey(normalized))
  );
  const combined = new Uint8Array(iv.length + sealed.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(sealed), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Opens a sealed key. Returns null rather than throwing when the key or the payload is wrong. */
export async function openProductKey(cipher: string, secret: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(cipher), (character) => character.charCodeAt(0));
    if (combined.length <= 12) return null;
    const key = await importSealingKey(secret);
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12)
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
