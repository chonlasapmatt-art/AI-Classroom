import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Every account in this product is written into `member_login_identities`, and the column that says
 * where it came from carries a check constraint. A function that writes a source the constraint does
 * not list fails at the last moment, rolls the whole provision back, and reaches the person as a
 * generic "could not create the account" — which is exactly how creating a school administrator from
 * the platform console failed for as long as that function existed.
 *
 * These tests read the migrations rather than a database: the mismatch is visible in the SQL, and
 * catching it here costs nothing and needs no project to connect to.
 */

// Anchored to this file rather than the working directory, so the suite finds the migrations
// whether it is run from the workspace or from the repository root.
const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase', 'migrations'
);

function migrations(): { name: string; sql: string }[] {
  return readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDirectory, name), 'utf8') }));
}

/** The set the newest constraint in the migration history allows. */
function allowedSources(): Set<string> {
  let allowed = new Set<string>();
  for (const { sql } of migrations()) {
    const pattern = /check\s*\(\s*registration_source\s+in\s*\(([^)]*)\)/gi;
    for (const match of sql.matchAll(pattern)) {
      allowed = new Set([...match[1]!.matchAll(/'([^']*)'/g)].map((value) => value[1]!));
    }
  }
  return allowed;
}

/** Splits an argument list on the commas that are not inside brackets or quotes. */
function splitArguments(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      current += character;
      if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") { quoted = true; current += character; continue; }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Every literal any migration writes into registration_source, with the file that writes it. */
function writtenSources(): { migration: string; value: string }[] {
  const found: { migration: string; value: string }[] = [];
  for (const { name, sql } of migrations()) {
    const pattern = /insert\s+into\s+public\.member_login_identities\s*\(([^)]*)\)\s*values\s*\(/gi;
    for (const match of sql.matchAll(pattern)) {
      const columns = splitArguments(match[1]!).map((column) => column.trim().toLowerCase());
      const columnIndex = columns.indexOf('registration_source');
      if (columnIndex < 0) continue;

      // Walk from the opening bracket of `values(` to its match, then read the argument that lines
      // up with the column.
      const start = match.index! + match[0]!.length;
      let depth = 1;
      let quoted = false;
      let end = start;
      while (end < sql.length && depth > 0) {
        const character = sql[end]!;
        if (quoted) { if (character === "'") quoted = false; }
        else if (character === "'") quoted = true;
        else if (character === '(') depth += 1;
        else if (character === ')') depth -= 1;
        if (depth > 0) end += 1;
      }
      const value = splitArguments(sql.slice(start, end))[columnIndex];
      const literal = value ? /^'([^']*)'$/.exec(value.trim()) : null;
      if (literal) found.push({ migration: name, value: literal[1]! });
    }
  }
  return found;
}

describe('member login identity sources', () => {
  it('allows every source a migration actually writes', () => {
    const allowed = allowedSources();
    expect(allowed.size).toBeGreaterThan(0);
    const rejected = writtenSources().filter((row) => !allowed.has(row.value));
    expect(rejected).toEqual([]);
  });

  it('knows the platform console as a source of its own', () => {
    // Provisioning a school administrator from the console records where the account came from, and
    // 'admin' would have claimed a school administrator made it.
    expect(allowedSources().has('platform')).toBe(true);
    expect(writtenSources().some((row) => row.value === 'platform')).toBe(true);
  });
});
