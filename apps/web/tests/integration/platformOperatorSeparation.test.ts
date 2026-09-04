// A platform operator is not a school's administrator, and a platform with none can be given one.
//
// `platform_admins` always kept authority separate from membership — that invariant was already
// written down and enforced. What was missing was the other half: the only path into that table
// granted authority to whichever account was already signed in, and the only accounts that can sign
// in belong to a school. So every operator was also somebody's school administrator, in exactly the
// records meant to tell those two apart.
//
// The same gap left a fresh deployment unreachable. Enrolment needs a session; the console's door
// signs you in as an operator who already exists; nothing could make the first one. A platform with
// no operator could not be given one from inside the platform.
//
// These are source assertions because the properties live in SQL and in an Edge Function, where a
// browser test cannot reach them. The probe in scripts/probes/ exercises the same rules against a
// real project, which is the half these cannot do.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/202609040002_an_operator_is_not_a_school_account.sql');
const bootstrapFn = read('supabase/functions/platform-bootstrap/index.ts');
const gatewayFn = read('supabase/functions/platform-access/index.ts');
const client = read('apps/web/src/platform/platformClient.ts');
const operatorsPage = read('apps/web/src/platform/PlatformOperators.tsx');

describe('an operator account belongs to no school', () => {
  it('is refused by the database, not merely by the caller', () => {
    // A check that lives only in an Edge Function is a check somebody can route around by calling
    // the RPC another way. This one raises inside the function that does the writing.
    expect(migration).toContain('OPERATOR_HAS_SCHOOL_MEMBERSHIP');
    const guard = migration.slice(migration.indexOf('membership_count'));
    expect(guard).toContain('from public.school_memberships where profile_id=p_profile_id');
    expect(guard).toContain("raise exception 'OPERATOR_HAS_SCHOOL_MEMBERSHIP'");
  });

  it('asks for no school role at all rather than borrowing one', () => {
    // `requested_role` admits only the three school roles. An operator asked for none of them, and
    // null says that; picking one would put an operator in the roster of a role they do not hold.
    expect(migration).toContain('requested_role, account_state)');
    expect(migration).toMatch(/values\(p_profile_id, clean_name, null, 'active'\)/);
  });

  it('creates the auth account with no membership metadata', () => {
    for (const source of [bootstrapFn, gatewayFn.slice(gatewayFn.indexOf("action === 'provision-operator'"))]) {
      expect(source).toContain("access_model: 'platform_operator'");
      // A school id or a member role in app_metadata is what makes an account a school's.
      const block = source.slice(source.indexOf('app_metadata'), source.indexOf('app_metadata') + 200);
      expect(block).not.toContain('school_id');
      expect(block).not.toContain('member_role');
    }
  });

  it('writes no login identity, so the account cannot sign into the school application', () => {
    // `member_login_identities` is what turns a typed name into an account for the school app.
    // An operator has no row there, so there is nothing for a name to resolve to.
    expect(migration).not.toContain('member_login_identities');
    expect(bootstrapFn).not.toContain('member_login_identities');
  });
});

describe('the first operator of a platform that has none', () => {
  it('is the only case that runs without an operator behind it', () => {
    const body = migration.slice(migration.indexOf('existing_count'));
    expect(body).toContain('if existing_count > 0 then');
    // Once one exists this is an ordinary platform action, with the same freshness requirement as
    // every other one — the open window is not left open.
    expect(body).toContain('public.is_platform_admin(p_actor)');
    expect(body).toContain('public.platform_reauth_fresh(p_actor,15)');
  });

  it('is guarded by the same code, the same comparison and the same rate limit as every door', () => {
    expect(bootstrapFn).toContain('PLATFORM_ADMIN_CODE_HASH');
    expect(bootstrapFn).toContain('constantTimeEqual');
    expect(bootstrapFn).toContain('admin_access_attempts');
    expect(bootstrapFn).toContain('PLATFORM_ACCESS_LOCKED');
    // The code is compared before the request is acted on, so a wrong one cannot learn whether the
    // platform has an operator yet.
    expect(bootstrapFn.indexOf('constantTimeEqual(supplied, expected)'))
      .toBeLessThan(bootstrapFn.indexOf('PLATFORM_ALREADY_BOOTSTRAPPED'));
  });

  it('shuts as soon as it succeeds', () => {
    expect(bootstrapFn).toContain('PLATFORM_ALREADY_BOOTSTRAPPED');
    expect(bootstrapFn).toContain(".eq('status', 'active').is('revoked_at', null)");
  });

  it('mints no session, so one fewer endpoint can hand one out', () => {
    expect(bootstrapFn).not.toContain('generateLink');
    expect(bootstrapFn).not.toContain('accessToken');
    // The console sends the operator back to the ordinary door instead.
    expect(bootstrapFn).toContain("signInWith: 'platform-access-code'");
  });

  it('does not leave a half-made account behind when the grant is refused', () => {
    // Otherwise the address is taken and the next attempt fails on the operator's own first try.
    const failure = bootstrapFn.slice(bootstrapFn.indexOf('if (error) {'));
    expect(failure).toContain('deleteUser(profileId)');
  });

  it('asks for a longer password than a school account does', () => {
    // Twelve rather than eight: this one sees every school on the platform.
    expect(bootstrapFn).toContain('password.length < 12');
    expect(client).toContain('รหัสผ่านอย่างน้อย 12 ตัวอักษร');
  });
});

describe('the console can say who its operators are', () => {
  it('reads them through a function that checks the caller, not from the table', () => {
    // `platform_admins` is revoked from `authenticated` like every table holding authority.
    expect(migration).toContain('create or replace function public.list_platform_operators');
    expect(migration).toContain('revoke all on function public.list_platform_operators(uuid) from public,anon,authenticated');
    expect(migration).toContain('public.is_platform_admin(p_actor)');
  });

  it('says which operators still administer a school', () => {
    // The separation is finished by making the exceptions visible, not by assuming there are none.
    expect(migration).toContain('school_memberships');
    expect(operatorsPage).toContain('schoolMemberships');
    expect(operatorsPage).toContain('ยังปนกันอยู่');
  });

  it('never offers to revoke the last one', () => {
    expect(operatorsPage).toContain('active.length > 1');
    // And the database refuses regardless of what the screen offers.
    const operations = read('supabase/migrations/202608310022_platform_operations.sql');
    expect(operations).toContain("raise exception 'LAST_PLATFORM_ADMIN'");
  });
});
