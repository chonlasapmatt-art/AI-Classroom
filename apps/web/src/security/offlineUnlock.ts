const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function createPinVerifier(pin: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<{ salt: string; verifier: string }> {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 6 หลัก');
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, material, 256);
  return { salt: toBase64(salt), verifier: toBase64(new Uint8Array(bits)) };
}

export async function verifyPin(pin: string, saltBase64: string, expected: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(saltBase64), (char) => char.charCodeAt(0));
  const result = await createPinVerifier(pin, salt);
  if (result.verifier.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < result.verifier.length; index += 1) difference |= result.verifier.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export function isOfflineGraceValid(trustedUntil: string | null, now = Date.now()): boolean {
  return trustedUntil !== null && Date.parse(trustedUntil) > now;
}
