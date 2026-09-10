import fs from 'node:fs';

/** Reads a CRLF file as LF, applies replacements, writes it back in the line ending it had. */
export function patch(path, edits) {
  const raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(`anchor missing in ${path}: ${from.slice(0, 70)}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text);
}
