import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { traits } from '../../src/features/avatars/avatarTraits';

/*
 * The prices exist twice, so they are checked against each other.
 *
 * The app knows what a pair of dragon wings costs because it draws them. The server has to know too,
 * because the request to wear them comes from the child's own browser and "the client said it was
 * free" is not a permission check. Two copies of a number is a number that will disagree with itself,
 * and the disagreement would be silent in the direction that matters: a trait priced in the app and
 * free in SQL is a trait anybody can wear without earning it.
 *
 * ── Which migration is read ──
 * Whichever one defines the function last. Migrations are immutable here, so a change to the
 * wardrobe's prices is a new file replacing the function rather than an edit to the old one; a test
 * pinned to the file that happened to introduce it would pass against a definition the database
 * stopped using several releases ago — which is the failure this test exists to catch, with the
 * check itself as the thing that is wrong.
 *
 * The two functions are read separately because they move separately: the price list is replaced
 * whenever the wardrobe grows, and the guard that validates a saved config is not.
 */
const migrationsDirectory = ['supabase/migrations', '../../supabase/migrations']
  .map((candidate) => resolve(candidate))
  .find((candidate) => existsSync(candidate))!;

function latestDefining(fragment: string): string {
  const path = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join(migrationsDirectory, name))
    .filter((candidate) => readFileSync(candidate, 'utf8').includes(fragment))
    .pop();
  expect(path, `nothing defines ${fragment}`).toBeTruthy();
  return readFileSync(path!, 'utf8');
}

const sql = latestDefining('function public.avatar_trait_price');
/** The guard that validates a saved configuration — a different function in a different file. */
const guardSql = latestDefining('function public.set_own_avatar_config');

/** `when 'top:magerobe' then 80` and `when 'wizardhat' then 80`, read straight out of the file. */
function casesBetween(startMarker: string, endMarker: string): Map<string, number> {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start);
  expect(start, startMarker).toBeGreaterThan(-1);
  const block = sql.slice(start, end);
  const found = new Map<string, number>();
  for (const match of block.matchAll(/when '([^']+)' then (\d+)/g)) {
    found.set(match[1]!, Number(match[2]));
  }
  return found;
}

const basePrices = casesBetween('base_price as (', 'worn_price as (');
const wornPrices = casesBetween('worn_price as (', 'select (select * from base_price)');

/** The same rule the SQL applies: a composed id is its base plus what is worn over it. */
function sqlPriceOf(id: string): number {
  const [base, worn] = id.includes('__') ? id.split('__') : [id, undefined];
  const underscore = base!.indexOf('_');
  const keyed = `${base!.slice(0, underscore)}:${base!.slice(underscore + 1)}`;
  return (basePrices.get(keyed) ?? 0) + (worn ? wornPrices.get(worn) ?? 0 : 0);
}

describe('what a trait costs', () => {
  it('is the same number in the app and on the server', () => {
    for (const trait of traits) {
      expect(sqlPriceOf(trait.id), trait.id).toBe(trait.price ?? 0);
    }
  });

  it('prices nothing the app gives away', () => {
    // The direction that matters: something free in SQL and priced in the app can be worn by
    // anybody who asks for it.
    const free = traits.filter((trait) => !trait.price);
    for (const trait of free) expect(sqlPriceOf(trait.id), trait.id).toBe(0);
  });

  it('names no price the app has never heard of', () => {
    // A leftover entry here is a trait somebody removed from the tables, and the migration would go
    // on charging for it.
    const ids = new Set(traits.map((trait) => trait.id));
    for (const keyed of basePrices.keys()) {
      const [prefix, rest] = keyed.split(':');
      const id = `${prefix}_${rest}`;
      const used = ids.has(id) || [...ids].some((known) => known.startsWith(`${id}__`));
      expect(used, keyed).toBe(true);
    }
    for (const worn of wornPrices.keys()) {
      expect([...ids].some((known) => known.endsWith(`__${worn}`)), worn).toBe(true);
    }
  });

  it('refuses a trait id that is not shaped like one', () => {
    /*
     * The pattern the live guard checks against, kept here so a change to either is noticed.
     *
     * It allows the `__` half now — a composed id is a haircut and a hat, and the first version of
     * this pattern predated composition and would have refused every one of them. Reading the newest
     * migration rather than the first is what surfaced that this assertion had gone stale: it was
     * passing against a definition the database had replaced two releases earlier.
     */
    expect(guardSql).toContain("entry.value !~ '^[a-z][a-z0-9_]{0,47}(__[a-z][a-z0-9_]{0,47})?$'");
    expect(guardSql).toContain("'^(skin|hair|primary|secondary|accent|magic)$'");
  });

  it('builds the stored object rather than merging what arrived', () => {
    // `unlockedOutfits` and `spentPoints` are the purse. A merge would let a crafted request grant
    // itself a wardrobe.
    expect(guardSql).toContain('clean := jsonb_strip_nulls(jsonb_build_object(');
    expect(guardSql).not.toMatch(/avatar_config \|\| p_config/);
  });
});
