import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The separation being protected here is the whole point of the platform role: a school
// administrator runs one school and reaches no other, and a platform operator runs the service and
// reads no school's records without leaving a trail. Both halves are enforced in SQL, so both halves
// are checked against the SQL.

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const authority = read('supabase/migrations/202608310021_platform_authority_and_support_mode.sql');
const operations = read('supabase/migrations/202608310022_platform_operations.sql');
const gateway = read('supabase/functions/platform-access/index.ts');
const client = read('apps/web/src/platform/platformClient.ts');
const consoleApp = read('apps/web/src/platform/PlatformApp.tsx');
const appShell = read('apps/web/src/layouts/AppShell.tsx');
const authContext = read('apps/web/src/app/AuthContext.tsx');
const viteConfig = read('apps/web/vite.config.ts');
const customerEntry = read('apps/web/index.html');

describe('platform authority', () => {
  it('is not a school membership', () => {
    expect(authority).toContain('create table if not exists public.platform_admins');
    // The role would be indistinguishable from a school administrator's if it were stored as one.
    expect(authority).not.toMatch(/alter type public\.membership_role/);
    expect(authority).not.toMatch(/insert into public\.school_memberships[\s\S]{0,200}platform/i);
  });

  it('keeps the operator table out of every browser session', () => {
    expect(authority).toContain('alter table public.platform_admins enable row level security');
    expect(authority).toContain('revoke all on public.platform_admins from public, anon, authenticated');
    expect(authority).toContain('revoke all on public.support_sessions from public, anon, authenticated');
    expect(authority).toContain('revoke all on public.platform_security_events from public, anon, authenticated');
    expect(authority).toContain('revoke all on public.platform_error_events from public, anon, authenticated');
  });

  it('cannot be granted by a signed-in session', () => {
    for (const signature of ['grant_platform_admin(uuid,uuid,text,text)', 'revoke_platform_admin(uuid,uuid,text)']) {
      expect(operations).toContain(`revoke all on function public.${signature} from public,anon,authenticated`);
      expect(operations).toContain(`grant execute on function public.${signature} to service_role`);
    }
  });

  it('never leaves the platform without an operator', () => {
    expect(operations).toContain('LAST_PLATFORM_ADMIN');
    expect(operations).toMatch(/if remaining = 0 then raise exception 'LAST_PLATFORM_ADMIN'/);
  });

  it('checks authority inside each read rather than relying on the grant', () => {
    const reads = ['platform_overview', 'platform_schools', 'platform_school_detail', 'platform_errors',
      'platform_devices', 'platform_security_log', 'platform_flags_and_releases'];
    for (const name of reads) {
      const body = operations.slice(operations.indexOf(`function public.${name}`));
      expect(body.slice(0, 900)).toContain('is_platform_admin');
    }
  });

  it('does not disable row level security anywhere', () => {
    for (const file of [authority, operations]) {
      expect(file).not.toMatch(/disable row level security/);
      expect(file).not.toMatch(/bypassrls/i);
    }
  });
});

describe('support mode', () => {
  it('requires a reason and ends on a clock rather than on memory', () => {
    expect(authority).toContain("reason text not null check (char_length(trim(reason)) >= 8)");
    expect(authority).toContain('expires_at timestamptz not null');
    expect(operations).toMatch(/minutes := least\(greatest\(coalesce\(p_minutes,60\), 5\), 240\)/);
    // Authority is read from the expiry every time it is asked, so it stops without anybody acting.
    expect(authority).toMatch(/s\.ended_at is null and s\.expires_at > now\(\)/);
  });

  it('grants administrator authority and nothing else', () => {
    const hasRole = authority.slice(authority.indexOf('function public.has_school_role'));
    expect(hasRole).toContain("target_role = 'admin'");
    expect(hasRole).toContain('active_support_session');
    // A support session must not make somebody a teacher, a student or a parent of the school.
    expect(hasRole).not.toMatch(/target_role = 'teacher'\s+and public\.active_support_session/);
  });

  it('lets one operator hold one school at a time', () => {
    expect(operations).toMatch(
      /update public\.support_sessions set ended_at=clock_timestamp\(\), ended_reason='operator'\s+where platform_admin_id=actor and ended_at is null/
    );
  });

  it('stamps the session onto audit records with a trigger the caller cannot skip', () => {
    expect(authority).toContain('alter table public.audit_log add column if not exists support_session_id');
    expect(authority).toContain('create trigger audit_log_stamp_support before insert on public.audit_log');
    expect(authority).toContain('function public.stamp_support_session');
  });

  it('ends every session the moment platform authority is withdrawn', () => {
    expect(operations).toMatch(
      /update public\.support_sessions set ended_at=clock_timestamp\(\), ended_reason='revoked'\s+where platform_admin_id=p_profile_id and ended_at is null/
    );
  });

  it('is announced on screen in both applications', () => {
    expect(appShell).toContain('SUPER ADMIN SUPPORT MODE');
    expect(appShell).toContain("membership.membershipId.startsWith('support:')");
    expect(read('apps/web/src/platform/PlatformSchools.tsx')).toContain('SUPER ADMIN SUPPORT MODE');
  });

  it('renders the school screens from the session rather than from an invented membership row', () => {
    expect(authContext).toContain('current_support_session');
    expect(authContext).toContain('membershipId: `support:${String(support.sessionId)}`');
    // Nothing writes a membership: the row would outlive the session and read as a real one.
    expect(authContext).not.toMatch(/insert.*school_memberships/i);
  });
});

describe('dangerous actions', () => {
  it('require a reason long enough to be a reason', () => {
    for (const name of ['set_school_status', 'set_profile_status', 'force_school_logout']) {
      const body = operations.slice(operations.indexOf(`function public.${name}`));
      expect(body.slice(0, 1200)).toMatch(/char_length\(trim\(coalesce\(p_reason,''\)\)\) < 8/);
    }
  });

  it('require a password proved recently, checked in the database', () => {
    for (const name of ['set_school_status', 'set_profile_status', 'publish_release']) {
      const body = operations.slice(operations.indexOf(`function public.${name}`));
      expect(body.slice(0, 1200)).toContain('platform_reauth_fresh');
    }
    // The console cannot grant itself the freshness: only the gateway may write it.
    expect(operations).toContain('revoke all on function public.record_platform_reauth(uuid) from public,anon,authenticated');
    expect(operations).toContain('grant execute on function public.record_platform_reauth(uuid) to service_role');
  });

  it('suspend rather than delete', () => {
    expect(operations).not.toMatch(/delete from public\.(schools|students|teachers|user_profiles)/);
    expect(operations).toMatch(/update public\.schools set status=p_status/);
  });

  it('records a platform event for every one of them', () => {
    for (const action of ['SCHOOL_SUSPENDED', 'SCHOOL_RESTORED', 'ACCOUNT_SUSPENDED', 'DEVICE_REVOKED',
      'RELEASE_PUBLISHED', 'FEATURE_FLAG_SET', 'SUPPORT_SESSION_STARTED', 'SUPPORT_SESSION_ENDED']) {
      expect(operations).toContain(action);
    }
  });

  it('states what a forced logout can and cannot do rather than overpromising', () => {
    expect(operations).toContain('force_logout_after');
    expect(authContext).toContain('session_revoked_at');
    expect(read('apps/web/src/platform/PlatformSchools.tsx')).toContain('โทเคนที่ออกไปแล้วยังใช้ได้จนหมดอายุ');
  });
});

describe('enrolment gateway', () => {
  it('needs a code held in the server environment, not an email address', () => {
    expect(gateway).toContain("Deno.env.get('PLATFORM_ADMIN_CODE_HASH')");
    expect(gateway).toContain('constantTimeEqual');
    expect(gateway).not.toMatch(/@[a-z0-9.-]+\.(com|co\.th|org)/i);
  });

  it('rate limits and answers every failure the same way', () => {
    expect(gateway).toContain('PLATFORM_ACCESS_LOCKED');
    expect(gateway).toContain("const GENERIC_FAILURE = 'PLATFORM_ACCESS_DENIED'");
    expect(gateway).toContain('admin_access_attempts');
  });

  it('leaves password verification to GoTrue', () => {
    expect(gateway).toContain('signInWithPassword');
    expect(gateway).not.toMatch(/bcrypt|password_hash|createHash\(/);
  });
});

describe('the development sign-in', () => {
  const devGateway = read('supabase/functions/platform-dev-access/index.ts');
  const config = read('supabase/config.toml');

  it('is its own deployable, so a production project can simply not have it', () => {
    // It is the only endpoint that mints a session without a password. Sharing a function with the
    // endpoints production depends on would mean production had to switch it off rather than
    // never deploy it.
    expect(gateway).not.toContain('dev-sign-in');
    expect(gateway).not.toContain('PLATFORM_DEV_SIGN_IN');
    expect(gateway).toContain("json({ code: 'AUTH_REQUIRED' }, 401, headers)");
    expect(config).toContain('[functions.platform-dev-access]');
  });

  it('refuses before reading the request unless the server opted in', () => {
    const optIn = devGateway.indexOf("Deno.env.get('PLATFORM_DEV_SIGN_IN') !== 'true'");
    expect(optIn).toBeGreaterThan(-1);
    expect(optIn).toBeLessThan(devGateway.indexOf('request.json()'));
  });

  it('still requires the platform code, compared in constant time', () => {
    expect(devGateway).toContain("Deno.env.get('PLATFORM_ADMIN_CODE_HASH')");
    expect(devGateway).toContain('constantTimeEqual');
    expect(devGateway).toContain('PLATFORM_ACCESS_LOCKED');
  });

  it('saves the operator display name without using it as authority', () => {
    expect(devGateway).toContain('body.displayName');
    expect(devGateway).toContain("from('user_profiles')");
    expect(devGateway).toContain('const displayName = suppliedDisplayName ||');
    expect(devGateway).toContain('display_name: suppliedDisplayName');
    expect(consoleApp).toContain('ชื่อผู้ดูแล');
    expect(consoleApp).toContain('devSignIn(accessCode, needsDisplayName ? displayName : undefined)');
    expect(consoleApp).toContain('PLATFORM_OPERATOR_DEVICE_KEY');
    // Production now has a separate existing-admin password form. The development shortcut still
    // uses a one-time platform code and never persists a password.
    expect(consoleApp).toContain('autoComplete="current-password"');
    expect(consoleApp).toContain("memberLogin({ role: 'admin'");
    expect(consoleApp).toContain('autoComplete="one-time-code"');
  });

  it('signs in as an operator who already exists and creates nobody', () => {
    // It may write to the attempt ledger — that is how it rate limits itself — but it may not
    // create an account or hand out authority.
    expect(devGateway).not.toMatch(/grant_platform_admin|admin\.createUser/);
    expect(devGateway).not.toMatch(/from\('platform_admins'\)\s*\.insert/);
    expect(devGateway).toContain("from('platform_admins')");
    expect(devGateway).toContain(".select('profile_id')");
    // Choosing between several operators would record the session as somebody else.
    expect(devGateway).toContain('PLATFORM_OPERATOR_AMBIGUOUS');
    expect(devGateway).toContain('PLATFORM_NO_OPERATOR');
  });

  it('records every use in the platform security log', () => {
    expect(devGateway).toContain('PLATFORM_DEV_SIGN_IN');
    expect(devGateway).toContain('record_platform_event');
  });

  it('is offered by the console only in a development build', () => {
    expect(client).toContain('export const isDevSignInAvailable');
    expect(client).toContain('import.meta.env.DEV === true');
    expect(consoleApp).toContain('{isDevSignInAvailable && <DevSignIn />}');
  });
});

describe('the changelog', () => {
  const changelog = read('apps/web/src/platform/ChangelogPage.tsx');

  it('reads the releases the platform already records rather than a second history', () => {
    expect(changelog).toContain('platformFlagsAndReleases');
    expect(changelog).toContain('platformSecurityLog');
    expect(changelog).not.toMatch(/from\('changelog|platform_changelog/);
  });

  it('shows the build the page is actually running', () => {
    // A report that will not reproduce is usually a browser holding an older bundle.
    expect(changelog).toContain('__APP_VERSION__');
    expect(changelog).toContain('__BUILD_TIME__');
  });

  it('publishes through the guarded path, not around it', () => {
    expect(changelog).toContain('publishRelease');
    expect(changelog).toContain('DangerousActionDialog');
  });
});

describe('the console is not part of the customer product', () => {
  it('is a separate page with its own entry', () => {
    expect(viteConfig).toContain("platform: entry('./platform/index.html')");
    expect(viteConfig).toContain('INCLUDE_PLATFORM_CONSOLE');
    expect(customerEntry).not.toContain('platform');
  });

  it('is never served from the offline cache', () => {
    expect(viteConfig).toContain('navigateFallbackDenylist');
    // Both the console's page and its bundle: precaching either would put an operations tool on a
    // school's device and let it answer from yesterday's copy during an incident.
    expect(viteConfig).toContain("'platform/**'");
    expect(viteConfig).toContain("'assets/platform-*.js'");
  });

  it('routes by hash so a deep link never falls back to the customer app', () => {
    // A static host asked for /platform/schools serves the single-page fallback, which is the
    // customer application. A hash never reaches the host, so every console route resolves here.
    const entry = read('apps/web/src/platform/main.tsx');
    expect(entry).toContain('HashRouter');
    expect(entry).not.toContain('BrowserRouter');
    expect(entry).not.toContain('basename');
  });

  it('offers no preview or fixture mode of its own', () => {
    expect(consoleApp).not.toContain('previewMode');
    expect(consoleApp).toContain('isCloudConfigured');
  });

  it('decides nothing about authority in the browser', () => {
    expect(client).toContain("requireSupabase().rpc('is_platform_admin')");
    expect(client).not.toMatch(/role === 'super_admin'|isSuperAdmin =|localStorage/);
  });
});
