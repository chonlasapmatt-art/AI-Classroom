// The operator's two recovery powers, and the limits that keep them from being something else.
//
// Reading a customer's product key and resetting a school administrator's password are both real
// authority over somebody else's account. Neither is guarded by hiding a button: both go through a
// security-definer function that checks platform authority, a fresh password and a written reason
// for itself, and both write a permanent record before anything changes.
//
// These assertions are static, over the SQL and the Edge Functions, because a grant and a revoke
// cannot be exercised by rendering a screen.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/202609030002_one_product_key_and_operator_recovery.sql');
const scheduleMigration = read('supabase/migrations/202609030001_notification_dispatch_schedule.sql');
const platformGateway = read('supabase/functions/platform-access/index.ts');
const adminGateway = read('supabase/functions/admin-access/index.ts');
const productKeyModule = read('supabase/functions/_shared/productKey.ts');
const dispatcher = read('supabase/functions/notification-dispatch/index.ts');
const setupScreen = read('apps/web/src/features/auth/AdminSchoolSetupPage.tsx');

describe('one product key per customer', () => {
  it('returns the key it already issued instead of drawing another', () => {
    // The whole point: asking twice must not produce two keys, because the customer has written the
    // first one down and a server that quietly swaps it is a server they cannot activate.
    expect(migration).toContain("where actor_profile_id=p_actor and status='issued' for update");
    expect(migration).toContain("'existing', true");
    expect(adminGateway).toContain('record.existing && record.keyCipher');
    expect(adminGateway).toContain('openProductKey');
  });

  it('replaces only a key that nobody could ever recover', () => {
    // Keys drawn before sealing have a digest and nothing else. Refusing to move would strand that
    // customer forever, so those and only those are redrawn.
    expect(migration).toContain('if found and live.key_cipher is not null then');
    expect(migration).toContain("update public.product_activation_keys set status='replaced'");
  });

  it('offers the customer no way to draw a second one', () => {
    expect(setupScreen).not.toContain('สุ่มคีย์ใหม่');
    expect(setupScreen).toContain('คัดลอกคีย์');
  });

  it('refuses to issue a key it could not later recover', () => {
    expect(adminGateway).toContain('resolveProductKeySecret');
    expect(adminGateway).toContain("if (!secret) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers)");
    expect(migration).toContain("raise exception 'VALIDATION_ERROR: cipher required'");
  });

  it('seals the key rather than storing it, and never reuses another feature\'s secret', () => {
    expect(productKeyModule).toContain('AES-GCM');
    expect(productKeyModule).toContain("read('PRODUCT_KEY_SECRET')");
    // The teacher-code drift bug in reverse: one purpose, one variable, resolved in one place.
    expect(productKeyModule).not.toContain('MEMBER_ACCESS_HMAC_SECRET');
    expect(productKeyModule).not.toContain('TEACHER_CODE_SECRET');
  });
});

describe('what the platform operator may see', () => {
  it('lists keys to operators without handing the browser a sealed key', () => {
    expect(migration).toContain('create or replace function public.platform_product_keys');
    expect(migration).toContain('is_platform_admin(auth.uid())');
    // The list carries hints and provenance. The cipher is not among the columns it builds.
    const listing = migration.slice(
      migration.indexOf('function public.platform_product_keys'),
      migration.indexOf('function public.reveal_product_activation_key')
    );
    expect(listing).toContain("'hint', k.key_hint");
    expect(listing).not.toContain("'keyCipher'");
  });

  it('makes revealing one require authority, a fresh password and a reason', () => {
    expect(migration).toContain('is_platform_admin(p_actor)');
    expect(migration).toContain('platform_reauth_fresh(p_actor,15)');
    expect(migration).toContain("raise exception 'VALIDATION_ERROR: reason required'");
    expect(migration).toContain("'PRODUCT_KEY_REVEALED'");
    expect(migration).toContain('reveal_count=reveal_count+1');
  });

  it('keeps the reveal path out of reach of any browser session', () => {
    expect(migration).toMatch(
      /revoke all on function public\.reveal_product_activation_key\(uuid,uuid,text\) from public,anon,authenticated/
    );
    expect(migration).toMatch(
      /grant execute on function public\.reveal_product_activation_key\(uuid,uuid,text\) to service_role/
    );
  });
});

describe('password recovery the school cannot do for itself', () => {
  it('issues a new password and never claims to read the old one', () => {
    expect(platformGateway).toContain("action === 'reset-member-password'");
    expect(platformGateway).toContain('auth.admin.updateUserById');
    // Nothing anywhere returns an existing password, because GoTrue holds a bcrypt hash.
    expect(migration).toContain('Never returns a password');
    expect(migration).not.toContain('encrypted_password');
  });

  it('refuses one operator resetting another operator', () => {
    expect(migration).toContain("raise exception 'TARGET_IS_PLATFORM_ADMIN'");
    expect(platformGateway).toContain('TARGET_IS_PLATFORM_ADMIN');
  });

  it('records the reset before the password changes', () => {
    const reset = migration.slice(migration.indexOf('function public.authorize_member_password_reset'));
    const recordAt = reset.indexOf("'MEMBER_PASSWORD_RESET'");
    const returnAt = reset.indexOf('return jsonb_build_object');
    expect(recordAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(returnAt);
    // And the gateway only touches GoTrue after the database has authorised and written it down.
    const gateway = platformGateway.slice(platformGateway.indexOf("action === 'reset-member-password'"));
    expect(gateway.indexOf('authorize_member_password_reset')).toBeLessThan(gateway.indexOf('updateUserById'));
  });

  it('demands authority, freshness and a reason, and is service-role-only', () => {
    expect(migration).toContain('authorize_member_password_reset');
    expect(migration).toMatch(
      /revoke all on function public\.authorize_member_password_reset\(uuid,uuid,uuid,text\) from public,anon,authenticated/
    );
    expect(migration).toMatch(
      /grant execute on function public\.authorize_member_password_reset\(uuid,uuid,uuid,text\) to service_role/
    );
  });

  it('lists school accounts without exposing anything about a child', () => {
    const listing = migration.slice(
      migration.indexOf('function public.platform_school_accounts'),
      migration.indexOf('function public.authorize_member_password_reset')
    );
    expect(listing).toContain("m.role in ('admin','teacher','parent')");
    expect(listing).not.toContain('students');
    expect(listing).not.toContain('score');
  });
});

describe('the dispatcher is watched rather than assumed', () => {
  it('records every invocation, including one that sent nothing', () => {
    expect(dispatcher).toContain('record_notification_dispatch_run');
    // A claim failure is the case most worth seeing, so it is recorded before the error returns.
    const failure = dispatcher.slice(dispatcher.indexOf('QUEUE_CLAIM_FAILED'));
    expect(failure).toContain('recordRun');
    expect(scheduleMigration).toContain('create table if not exists public.notification_dispatch_runs');
  });

  it('reports queue depth and sender liveness together', () => {
    expect(scheduleMigration).toContain('function public.notification_dispatch_health');
    expect(scheduleMigration).toContain("'lastRunSecondsAgo'");
    expect(scheduleMigration).toContain("'oldestPendingSeconds'");
    expect(scheduleMigration).toContain('is_platform_admin(auth.uid())');
  });

  it('keeps the run log and the scheduler out of reach of a browser', () => {
    expect(scheduleMigration).toMatch(
      /revoke all on public\.notification_dispatch_runs from public, anon, authenticated/
    );
    expect(scheduleMigration).toMatch(
      /revoke all on function public\.schedule_notification_dispatch\(text,text,text,integer\) from public,anon,authenticated/
    );
  });

  it('keeps the scheduler secret out of this public repository', () => {
    // The URL and the secret are passed in by an operator and kept in the vault; a migration that
    // carried them would publish them, which is a mistake this project has made once already.
    expect(scheduleMigration).toContain('vault.create_secret');
    expect(scheduleMigration).toContain('decrypted_secrets');
    expect(scheduleMigration).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
  });
});
