// The product asks its own questions.
//
// Four screens used the browser's built-in boxes — window.confirm on the year-end promotion, on a
// restore that wipes the school's local database, on archiving a bank question, and on submitting an
// unfinished exam paper; window.prompt for the two passwords that seal and open a backup.
//
// They are the wrong tool for every one of those, and for reasons that are not cosmetic:
//
//   - The page cannot lay the text out. Consequences arrived as one run-on line with "\n" in it.
//   - The page cannot say which button is the safe one, so "delete everything" and "cancel" look
//     identical and the default is the browser's choice, not ours.
//   - They cannot be styled, so they ignore the school's theme and dark mode entirely.
//   - window.prompt shows the password as it is typed, cannot be confirmed against a second field,
//     and could not enforce the twelve characters its own message asked for.
//   - Several browsers suppress them outright — inside an installed PWA, in a background tab, after
//     a page has shown too many. A confirmation that silently never appears reads to the caller as
//     "the user said no", which on the promotion screen means the year-end run quietly does nothing.
//
// This test walks the source rather than rendering, because the point is that no screen anywhere
// reaches for them, not that one particular screen does not.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolved from this file rather than from the working directory, which differs between `npm test`
// and a single-file run and silently made the sweep scan an empty tree.
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
  });
}

/** Explicit, so a comment about why they are gone cannot trip it. */
const explicitCall = /window\.(confirm|prompt|alert)\s*\(/;
/** Bare, which is the same global unless the file declared one of its own. */
const bareCall = /(?:^|[^.\w])(confirm|prompt|alert)\s*\(/;
const declaresOwn = (text: string, name: string) =>
  new RegExp(`(?:function|const|let)\\s+${name}\\b`).test(text);

describe('no screen asks the browser to ask for it', () => {
  const offenders = sourceFiles(sourceRoot)
    .map((file) => ({ file: relative(sourceRoot, file), text: readFileSync(file, 'utf8') }))
    .flatMap(({ file, text }) => text.split(/\r?\n/)
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter((row) => {
        if (explicitCall.test(row.text)) return true;
        const bare = bareCall.exec(row.text);
        // A local helper of one's own named confirm() is fine; ReauthGate has one. It is the global
        // that is banned, so the name is only an offence when the file declares nothing by it.
        return bare?.[1] !== undefined && !declaresOwn(text, bare[1]);
      }));

  it('uses ConfirmDialog rather than window.confirm', () => {
    expect(offenders.map((row) => `${row.file}:${row.line} ${row.text}`)).toEqual([]);
  });

  it('collects passwords in a field, never in window.prompt', () => {
    // Named separately because the failure is different in kind: a prompt shows the password on
    // screen and hands back a string nothing validated.
    const operations = readFileSync(join(sourceRoot, 'features/operations/OperationsPage.tsx'), 'utf8');
    expect(operations).toContain('<PasswordInput');
    expect(operations).toContain('MIN_BACKUP_PASSWORD');
  });
});
