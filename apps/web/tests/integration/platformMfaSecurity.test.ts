// A second factor on the account that can suspend any school.
//
// The property worth asserting is not "MFA exists" — it is *where the check lives*. The obvious
// implementation reads `auth.jwt()->>'aal'` inside the freshness check, and it silently passes for
// every Edge Function call, because the gateway calls that function as `service_role` and the
// service role's token has no operator's assurance level in it. So the level is recorded when it is
// known and read back afterwards, and these tests pin that arrangement in place.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/202609030003_platform_operator_mfa.sql');
const gateway = read('supabase/functions/platform-access/index.ts');
const config = read('supabase/config.toml');
const mfaClient = read('apps/web/src/platform/platformMfa.ts');
const reauthGate = read('apps/web/src/platform/ReauthGate.tsx');

describe('the operator second factor', () => {
  it('is enabled on the auth server rather than invented in the application', () => {
    expect(config).toContain('[auth.mfa.totp]');
    expect(config).toContain('enroll_enabled = true');
    expect(config).toContain('verify_enabled = true');
    // Enrolment, the challenge and the upgrade to aal2 are all GoTrue's. A factor this application
    // verified itself would be worth exactly what the browser asserting it is worth.
    expect(mfaClient).toContain('auth.mfa.enroll');
    expect(mfaClient).toContain('auth.mfa.challengeAndVerify');
    expect(mfaClient).toContain('auth.mfa.getAuthenticatorAssuranceLevel');
  });

  it('records the assurance level at the moment it can be seen', () => {
    expect(migration).toContain('last_reauth_aal');
    expect(migration).toContain('create or replace function public.record_platform_reauth(p_actor uuid, p_aal text)');
    expect(gateway).toContain('assuranceLevel(authorization)');
    expect(gateway).toContain('p_aal: aal');
  });

  it('does not read the current session inside the freshness check', () => {
    // Half the callers are the gateway holding `p_actor` with no operator session at all, so a
    // check on `auth.jwt()` here would pass for every one of them.
    const start = migration.indexOf('function public.platform_reauth_fresh');
    const freshness = migration.slice(start, migration.indexOf('revoke all', start));
    expect(freshness).not.toContain("auth.jwt()->>'aal'");
    expect(freshness).toContain("coalesce(a.last_reauth_aal,'aal1') = 'aal2'");
  });

  it('holds an enrolled operator to the second factor and does not lock out one who has none', () => {
    // Forcing it on an operator with no factor is not possible: they would have to reach the screen
    // that enrols one, and that screen is inside the console they can no longer use.
    expect(migration).toContain('not public.platform_operator_has_mfa(p_actor)');
    expect(gateway).toContain("hasMfa === true && aal !== 'aal2'");
    expect(gateway).toContain('MFA_REQUIRED');
  });

  it('reads enrolment from the auth server rather than from a flag somebody sets', () => {
    expect(migration).toContain('from auth.mfa_factors');
    expect(migration).toContain("status = 'verified'");
    // A column the console could write would be a second factor anybody with the console can switch
    // off, which is not a second factor.
    expect(migration).not.toMatch(/add column if not exists mfa_(enabled|required)/);
  });

  it('asks for the code before the password rather than after a refusal', () => {
    expect(reauthGate).toContain('needsChallenge');
    const confirm = reauthGate.slice(reauthGate.indexOf('async function confirm'));
    expect(confirm.indexOf('challenge(factorId')).toBeLessThan(confirm.indexOf('reauthenticate(password)'));
  });

  it('shows every operator, because one account without a factor leaves the whole roster exposed', () => {
    expect(migration).toContain('function public.platform_mfa_status');
    expect(migration).toContain("'operators'");
    expect(migration).toContain('is_platform_admin(actor)');
  });
});
