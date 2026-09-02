import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCompleteSchoolIdentity } from '../../src/features/auth/schoolActivation';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const keyMigration = read('supabase/migrations/202609020004_product_activation_keys.sql');
const claimMigration = read('supabase/migrations/202609020005_teacher_code_claim_active_row.sql');
const lookupMigration = read('supabase/migrations/202609020006_find_auth_user_by_email.sql');
const adminAccess = read('supabase/functions/admin-access/index.ts');
const memberAccess = read('supabase/functions/member-access/index.ts');
const setupPage = read('apps/web/src/features/auth/AdminSchoolSetupPage.tsx');
const activationClient = read('apps/web/src/features/auth/schoolActivation.ts');

function edgeFunctionSources(): string[] {
  const directory = join(repositoryRoot, 'supabase/functions');
  const walk = (path: string): string[] => readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
  return walk(directory).filter((file) => file.endsWith('.ts'));
}

/**
 * The product key is what a paying customer holds instead of a code the owner typed into every
 * server's environment. These assertions hold the two properties that make it safe to hand out: the
 * server keeps only a digest, and the key is spent exactly once, after the school it paid for
 * exists.
 */
describe('product activation keys', () => {
  it('keeps the key table closed to every browser session', () => {
    expect(keyMigration).toContain('create table if not exists public.product_activation_keys');
    expect(keyMigration).toContain('alter table public.product_activation_keys enable row level security');
    expect(keyMigration).toMatch(/revoke all on public\.product_activation_keys from public, anon, authenticated/);
  });

  it('stores a digest and never the key', () => {
    expect(keyMigration).toMatch(/key_hash text not null check \(key_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
    expect(keyMigration).not.toMatch(/key_plain|key_text|key_value/);
  });

  it('leaves one live key per account and one per digest', () => {
    expect(keyMigration).toMatch(/create unique index if not exists product_activation_key_live_actor[\s\S]*where status = 'issued'/);
    expect(keyMigration).toMatch(/create unique index if not exists product_activation_key_live_hash[\s\S]*where status = 'issued'/);
  });

  it.each(['issue_product_activation_key', 'verify_product_activation_key', 'consume_product_activation_key'])(
    'keeps %s callable only by the trusted gateway', (fn) => {
      expect(keyMigration).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
      expect(keyMigration).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public,anon,authenticated`));
      expect(keyMigration).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  );

  it('refuses to draw a key for an account that already administers a school', () => {
    expect(keyMigration).toMatch(/school_memberships where profile_id=p_actor[\s\S]*ALREADY_HAS_MEMBERSHIP/);
  });

  it('draws the key on the server and returns the plaintext exactly once', () => {
    expect(adminAccess).toContain("action === 'issue-product-key'");
    expect(adminAccess).toContain('crypto.getRandomValues');
    expect(adminAccess).toContain('p_key_hash: await sha256(normalizeProductKey(key))');
    // The response is the only place the key exists; nothing stores or logs it.
    expect(adminAccess).toContain('productKey: formatProductKey(key)');
    expect(adminAccess).not.toMatch(/console\.(log|info|warn|error)/);
  });

  it('hashes what it shows, prefix and all', () => {
    // The key is drawn as twenty characters, shown as `SC-` plus those characters in groups, and
    // typed back in the shown form. Hashing the drawn form while normalising only the punctuation
    // out of the typed form left an `SC` on one side of the comparison and not the other, so every
    // key copied with the button on the previous screen was refused.
    expect(adminAccess).toContain('p_key_hash: await sha256(normalizeProductKey(key))');
    expect(adminAccess).toContain("cleaned.length === length + 2 && cleaned.startsWith('SC') ? cleaned.slice(2) : cleaned");
    expect(adminAccess).toContain('p_key_hash: await sha256(normalizeProductKey(accessCode))');
  });

  it('spends the key only after the school exists', () => {
    const consumeAt = adminAccess.indexOf('consume_product_activation_key');
    const bootstrapAt = adminAccess.indexOf('bootstrap_school_owner');
    expect(bootstrapAt).toBeGreaterThan(-1);
    expect(consumeAt).toBeGreaterThan(bootstrapAt);
  });

  it('still accepts the owner deployment code hashed into the environment', () => {
    expect(adminAccess).toContain("Deno.env.get('ADMIN_ACCESS_CODE_HASH')");
    expect(adminAccess).toContain('constantTimeEqual');
    expect(adminAccess).toContain('TEMPORARILY_LOCKED');
  });

  it('rate limits drawing a key as well as spending one', () => {
    expect(adminAccess).toMatch(/action === 'issue-product-key'[\s\S]*locked \|\| failureCount >= MAX_FAILURES/);
  });

  it('never lets the browser keep the key', () => {
    expect(activationClient).not.toMatch(/localStorage|sessionStorage/);
    expect(setupPage).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('first-run setup wizard', () => {
  it('asks for the administrator and the school before drawing anything', () => {
    expect(setupPage).toContain('STEP 01 · ADMIN &amp; SCHOOL');
    expect(setupPage).toContain('STEP 02 · PRODUCT KEY');
    expect(setupPage).toContain('STEP 03 · ACTIVATE SERVER');
  });

  it('will not move past the key until it has been copied', () => {
    expect(setupPage).toMatch(/step === 2 && !copied/);
    expect(setupPage).toContain('disabled={!copied || drawing}');
  });

  it('asks for the academic year and term on the activation step', () => {
    expect(setupPage).toContain('setAcademicYear');
    expect(setupPage).toContain('setTerm');
    expect(setupPage).toContain('รหัสเปิดใช้งานสินค้า');
  });

  it('accepts a school identity only when the code is in the school-code shape', () => {
    const valid = { displayName: 'ครูสมชาย', schoolName: 'โรงเรียนบ้านไทเกอร์', schoolCode: 'TIGER-01' };
    expect(isCompleteSchoolIdentity(valid)).toBe(true);
    expect(isCompleteSchoolIdentity({ ...valid, schoolCode: 'T' })).toBe(false);
    expect(isCompleteSchoolIdentity({ ...valid, schoolCode: 'TIGER 01' })).toBe(false);
    expect(isCompleteSchoolIdentity({ ...valid, displayName: 'ก' })).toBe(false);
    expect(isCompleteSchoolIdentity({ ...valid, schoolName: ' ' })).toBe(false);
  });
});

describe('teacher access code claiming', () => {
  it('claims the active row rather than whichever row shares the digest', () => {
    expect(claimMigration).toMatch(/where school_id=p_school_id and code_hash=lower\(p_code_hash\) and status='active'/);
    expect(claimMigration).toContain('for update');
  });

  it('hands a claimed use back on every path that discards the account', () => {
    // Auth create, identity registration and the sign-in that follows all release the claim; a
    // school with a limited code must not lose a use to a failure it never saw.
    expect(memberAccess.match(/await releaseClaim\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(memberAccess).toMatch(/signInError[\s\S]{0,400}await releaseClaim\(\);/);
  });
});

describe('retrying a half-finished provision', () => {
  it('resolves an existing auth user through a trusted function only', () => {
    expect(lookupMigration).toContain('create or replace function public.find_auth_user_by_email(p_email text)');
    expect(lookupMigration).toMatch(/revoke all on function public\.find_auth_user_by_email\(text\) from public,anon,authenticated/);
    expect(lookupMigration).toMatch(/grant execute on function public\.find_auth_user_by_email\(text\) to service_role/);
  });

  it('no longer calls a Supabase admin method that does not exist', () => {
    // `getUserByEmail` is not part of supabase-js v2. Every call threw, was swallowed by the
    // surrounding catch, and turned a retryable provision into a permanent failure.
    for (const file of edgeFunctionSources()) {
      expect(readFileSync(file, 'utf8')).not.toContain('getUserByEmail');
    }
  });
});
