#!/usr/bin/env node
/**
 * Keeps the numbers in the documentation honest.
 *
 * AGENTS.md tells whoever picks this repo up how big it is — how many migrations, how many Edge
 * Functions, how many tests — and those numbers were written once and then quietly rotted: it said
 * 73 migrations and 815 tests while the tree held 85 migrations and 103 test files. A wrong number
 * is worse than no number, because it is read as current and reasoned from: somebody sees "the last
 * migration is 202609040003" and writes theirs on top of a file twelve migrations old.
 *
 * So the counts are checked rather than remembered. This counts what is on disk, finds the sentences
 * in the docs that claim those counts, and fails when they differ — printing the real figure, so the
 * fix is a copy-paste rather than an investigation.
 *
 * A pattern that matches nothing fails too. That is the failure mode this class of check normally
 * dies of: somebody rewords the sentence, the regex quietly stops matching, and the guard reports
 * success forever while guarding nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const migrationFiles = () => readdirSync(join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();

/** Every function directory except `_shared`, which holds helpers rather than an endpoint. */
function countEdgeFunctions() {
  const dir = join(root, 'supabase/functions');
  return readdirSync(dir)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .length;
}

/**
 * Test *files*, not test cases.
 *
 * The case count is what vitest prints, and the only honest way to get it is to run vitest — far too
 * slow to sit in a pre-commit hook. A file count is exact, instant and static, so that is what the
 * docs state and what this guards. The precise case count belongs in the dated validation report,
 * where a number going stale is the point rather than the problem.
 */
function countTestFiles() {
  let found = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (/\.test\.(ts|tsx)$/.test(entry.name)) found += 1;
    }
  };
  walk(join(root, 'apps/web/tests'));
  return found;
}

const files = migrationFiles();
const actual = {
  migrations: files.length,
  functions: countEdgeFunctions(),
  tests: countTestFiles(),
  latest: (files[files.length - 1] ?? '').split('_')[0] ?? ''
};

/**
 * What each document claims, by the shape it uses to claim it.
 *
 * `[file, pattern, count]` — the pattern's first group holds the number, and an optional second
 * group holds the newest migration's timestamp, which rots the same way and misleads worse.
 */
const checks = [
  ['AGENTS.md', /run all (\d+) test files/, 'tests'],
  ['AGENTS.md', /vitest, (\d+) test files/, 'tests'],
  ['AGENTS.md', /There are (\d+); the last is `(\d{12})`/, 'migrations'],
  ['AGENTS.md', /migrations\/\s+(\d+) immutable migrations/, 'migrations'],
  ['AGENTS.md', /functions\/\s+(\d+) Edge Functions/, 'functions'],
  /*
   * Only the newest pass of the report.
   *
   * It is a dated log, and the older passes keep their own figures on purpose — "treat a count in a
   * report as evidence of when it was written" is the report's own rule. Rewriting history to
   * satisfy a linter would destroy what the report is for, so these are anchored to the table rows
   * and `exec` stops at the first match, which is the pass at the top.
   */
  ['docs/FINAL_SYSTEM_VALIDATION_REPORT.md', /\| Migrations \| (\d+) \(last: `(\d{12})`\) \|/, 'migrations'],
  ['docs/FINAL_SYSTEM_VALIDATION_REPORT.md', /\| Edge Functions \| (\d+) \|/, 'functions'],
  ['docs/FINAL_SYSTEM_VALIDATION_REPORT.md', /\| Test files \| (\d+) \|/, 'tests']
];

const problems = [];
for (const [file, pattern, key] of checks) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    problems.push(`${file}: not found`);
    continue;
  }

  const match = pattern.exec(text);
  if (!match) {
    problems.push(`${file}: nothing matched ${pattern} — the sentence changed, so this check now guards nothing`);
    continue;
  }
  const claimed = Number(match[1]);
  if (claimed !== actual[key]) {
    problems.push(`${file}: claims ${claimed} ${key}, the tree has ${actual[key]}`);
  }
  if (match[2] && match[2] !== actual.latest) {
    problems.push(`${file}: names ${match[2]} as the newest migration, the tree ends at ${actual.latest}`);
  }
}

if (problems.length > 0) {
  console.error('Documentation counts are out of date:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\nOn disk today: ${actual.migrations} migrations (newest ${actual.latest}), `
    + `${actual.functions} Edge Functions, ${actual.tests} test files.`);
  process.exit(1);
}

console.log(`Documentation counts match the tree: ${actual.migrations} migrations `
  + `(newest ${actual.latest}), ${actual.functions} Edge Functions, ${actual.tests} test files.`);
