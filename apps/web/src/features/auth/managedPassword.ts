// No O/0, I/l/1: an administrator reads this out to a teacher, writes it on a slip for a parent, or
// dictates it to a child. A character somebody can misread is a second support call.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const LENGTH = 12;

/**
 * A password nobody has to invent.
 *
 * Administrators reset these under pressure — a teacher locked out at the start of a lesson, a
 * parent on the phone — and a password invented in that moment is `12345678` more often than not.
 */
export function generateManagedPassword(): string {
  const characters: string[] = [];
  // Bytes at or above the last whole multiple of the alphabet are redrawn rather than folded, so no
  // character is fractionally more likely than another.
  const ceiling = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (characters.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH))) {
      if (byte >= ceiling) continue;
      characters.push(ALPHABET[byte % ALPHABET.length]!);
      if (characters.length === LENGTH) break;
    }
  }
  return characters.join('');
}
