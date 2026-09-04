// The production entrance to the operations console.
//
// Until this existed there was none. The gate rendered the development door — which signs a person
// in as an operator without asking who they are, and works only because a small deployment has
// exactly one — or a notice telling you to enable it. Neither authenticates anybody, and a console
// that watches every school on the platform had no way for a real operator to prove they were one.
//
// These are source assertions because the properties live in SQL and in an Edge Function. The probe
// in scripts/probes/ exercises the same door against a real project, which is the half these cannot.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/202609040003_operators_sign_in_with_their_own_name.sql');
const door = read('supabase/functions/platform-sign-in/index.ts');
const client = read('apps/web/src/platform/platformClient.ts');
const gate = read('apps/web/src/platform/PlatformApp.tsx');

describe('who the door will let in', () => {
  it('resolves a name only to operators who still hold authority', () => {
    // A correct password for a revoked operator must fail like any other. The entrance is not the
    // place where somebody discovers their authority was withdrawn.
    const query = migration.slice(migration.indexOf('return query'));
    expect(query).toContain("a.status = 'active'");
    expect(query).toContain('a.revoked_at is null');
    expect(query).toContain('join auth.users u on u.id = a.profile_id');
  });

  it('bounds how many accounts one typed name can put a password against', () => {
    // The caller tries the password against every row returned. A name shared by half the operators
    // must not become a way to test one password against all of them in a single request.
    expect(migration).toContain('limit 5');
  });

  it('keeps two active operators from answering to one name', () => {
    expect(migration).toContain('create unique index if not exists platform_admins_active_display_name_key');
    // Partial, so a revoked operator keeps their name and their history.
    expect(migration).toContain("where status = 'active' and revoked_at is null");
  });

  it('is reachable only by the service role', () => {
    expect(migration).toContain('revoke all on function public.resolve_platform_operator_login(text) from public,anon,authenticated');
    expect(migration).toContain('grant execute on function public.resolve_platform_operator_login(text) to service_role');
  });
});

describe('how the door answers', () => {
  it('tries every candidate rather than stopping at the first success', () => {
    // Two operators who chose the same password would otherwise sign whoever the database returned
    // first into the console, and the audit trail would name the wrong person for what followed.
    const loop = door.slice(door.indexOf('for (const candidate of candidates)'));
    expect(loop).toContain('continue;');
    expect(door).toContain('verified.length !== 1');
  });

  it('gives one answer to "no such name" and to "more than one"', () => {
    // A door that distinguishes them tells an attacker which names exist.
    expect(door).toContain('GENERIC_FAILURE');
    expect(door).toContain("const GENERIC_FAILURE = 'PLATFORM_ACCESS_DENIED'");
    expect(client).toContain('ชื่อผู้ดูแลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('counts failures per machine and locks out', () => {
    expect(door).toContain('admin_access_attempts');
    expect(door).toContain('PLATFORM_ACCESS_LOCKED');
    expect(door).toContain('fingerprint_hash');
  });

  it('records the sign-in against the operator it signed in', () => {
    expect(door).toContain("p_action: 'PLATFORM_SIGN_IN'");
    expect(door).toContain('last_seen_at');
  });

  it('records no re-authentication, unlike the code door', () => {
    // The access code is itself the factor for the development door, so that one records a
    // re-authentication. A password is not: an operator with a second factor should still be asked
    // for it before anything guarded.
    expect(door).not.toContain('record_platform_reauth');
    expect(read('supabase/functions/platform-dev-access/index.ts')).toContain('record_platform_reauth');
  });

  it('leaves the second factor where it changes something', () => {
    // The door runs no challenge of its own: it hands back whatever GoTrue returned, which for an
    // operator with a factor enrolled is aal1. `platform_reauth_fresh` already refuses a guarded
    // action from such an operator until they have completed it, so the factor is demanded at the
    // point where it protects something rather than at the entrance.
    const operations = read('supabase/migrations/202609030003_platform_operator_mfa.sql');
    expect(operations).toContain("coalesce(a.last_reauth_aal,'aal1') = 'aal2'");
    expect(door).not.toContain('auth.mfa');
    expect(door).not.toContain('challenge');
  });
});

describe('the gate offers both doors and says which is which', () => {
  it('renders the production entrance whether or not the code door is enabled', () => {
    const branch = gate.slice(gate.indexOf('if (!auth.session)'));
    expect(branch).toContain('<OperatorPasswordSignIn />');
    // The code door is conditional; the production one is not. Before this the page had only the
    // conditional one, and a deployment that had not enabled it showed a notice instead of a door.
    expect(branch).toContain('{isDevSignInAvailable && <DevSignIn />}');
  });

  it('asks for a name and a password, never an email address', () => {
    // Every account in this product carries a generated address nobody is ever shown, so a screen
    // asking for one would be asking for something that does not exist.
    const form = gate.slice(gate.indexOf('function OperatorPasswordSignIn'), gate.indexOf('function DevSignIn'));
    expect(form).toContain("autoComplete=\"username\"");
    expect(form).toContain("autoComplete=\"current-password\"");
    expect(form).not.toContain('type="email"');
  });

  it('verifies no password in the browser', () => {
    // The invariant the whole product is built on: verification happens in the trusted gateway,
    // where the rate limiting and the namesake handling live.
    expect(gate).not.toContain('signInWithPassword');
    expect(client).not.toContain('auth.signInWithPassword');
    expect(door).toContain('anon.auth.signInWithPassword');
  });
});
