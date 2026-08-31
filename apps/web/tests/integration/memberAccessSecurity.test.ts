import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const migration = read('supabase/migrations/202608300016_simple_name_password_access.sql');
const gateway = read('supabase/functions/member-access/index.ts');
const memberClient = read('apps/web/src/features/auth/memberAccess.ts');
const loginPage = read('apps/web/src/features/auth/LoginPage.tsx');
const accountPages = read('apps/web/src/features/auth/AccountPages.tsx');
const authContext = read('apps/web/src/app/AuthContext.tsx');
const studentPages = read('apps/web/src/features/auth/StudentAccessPages.tsx');
const supabaseConfig = read('supabase/config.toml');
const recoveryTemplate = read('supabase/templates/recovery.html');
const confirmationTemplate = read('supabase/templates/confirmation.html');
const magicLinkTemplate = read('supabase/templates/magic_link.html');
const childPanel = read('apps/web/src/features/parents/ChildLinkPanel.tsx');
const appSource = read('apps/web/src/app/App.tsx');

describe('name and password access — server authority', () => {
  it('keeps every function that turns a name into an account away from the browser', () => {
    for (const signature of [
      'public.register_member_identity(uuid,text,text,text,text,uuid,text)',
      'public.resolve_member_login(text,text)',
      'public.record_member_login(uuid)',
      'public.search_children_for_parent(uuid,text)',
      'public.link_parent_child(uuid,uuid,text)',
      'public.request_member_password_reset(text,text)',
      'public.authorize_member_password_reset(uuid,uuid)'
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public,anon,authenticated`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
  });

  it('lets a signed-in person act only on their own children and their own school', () => {
    expect(migration).toContain('grant execute on function public.list_parent_children() to authenticated');
    expect(migration).toContain('grant execute on function public.set_parent_link_state(uuid,text) to authenticated');
    // The children list takes no parameters at all, so a session cannot ask about anybody else.
    expect(migration).toContain('create or replace function public.list_parent_children()');
    expect(migration).toMatch(/list_parent_children\(\)[\s\S]{0,600}actor uuid := auth\.uid\(\)/);
    expect(migration).toMatch(/list_parent_link_requests[\s\S]{0,400}can_operate_school\(p_school_id\)/);
  });

  it('runs every access function with a pinned search path', () => {
    const definers = migration.match(/security definer/g) ?? [];
    const pinned = migration.match(/set search_path=public,pg_temp/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned.length).toBeGreaterThanOrEqual(definers.length);
  });

  it('protects the attempt log and keeps the credential out of it', () => {
    expect(migration).toContain('alter table public.member_access_attempts enable row level security');
    expect(migration).toContain('revoke all on public.member_access_attempts from public,anon,authenticated');
    const table = migration.slice(
      migration.indexOf('create table if not exists public.member_access_attempts'),
      migration.indexOf('create index if not exists member_access_attempts_identity_idx')
    );
    expect(table).toMatch(/identity_hash text not null/);
    expect(table).toMatch(/client_hash text not null/);
    expect(table).not.toMatch(/display_name|password|first_name|last_name/);
  });

  it('never stores a password of its own and never compares one in SQL', () => {
    expect(migration).not.toMatch(/password_hash|crypt\(|pgcrypto|password text/);
    expect(memberClient).not.toMatch(/password_hash|bcrypt|sha256/i);
    expect(gateway).toContain('signInWithPassword');
    // Verification is GoTrue's, so nothing here may hash, compare or store the value itself.
    expect(gateway).not.toMatch(/createHash|bcrypt|password_hash/);
  });

  it('records who registered, when they last signed in and every account decision', () => {
    for (const column of ['registration_source', 'last_login_at', 'login_count']) {
      expect(migration).toContain(column);
    }
    for (const action of [
      'MEMBER_REGISTERED', 'MEMBER_LOGIN', 'MEMBER_TEACHER_REGISTERED',
      'PARENT_CHILD_LINK_REQUESTED', 'PARENT_CHILD_LINKED', 'PARENT_LINK_APPROVED',
      'PARENT_LINK_REVOKED', 'PASSWORD_RESET_REQUESTED', 'MEMBER_PASSWORD_RESET'
    ]) {
      expect(migration).toContain(action);
    }
  });

  it('treats names as anything but unique', () => {
    // Resolution returns candidates, never one row, and the login gateway verifies all of them.
    expect(migration).toContain('create or replace function public.resolve_member_login(p_role text, p_display_name text)');
    expect(migration).toMatch(/resolve_member_login[\s\S]{0,2000}limit 5/);
    expect(gateway).toContain('async function verifyCandidates');
    expect(gateway).toMatch(/for \(const candidate of candidates\)/);
    expect(gateway).toContain("code: 'MEMBER_SELECTION_REQUIRED'");
    expect(gateway).toMatch(/verified\.length > 1/);
  });
});

describe('name and password access — abuse resistance', () => {
  it('rate limits by identity and by client before it resolves anything', () => {
    expect(gateway).toContain('IDENTITY_FAILURE_LIMIT');
    expect(gateway).toContain('CLIENT_FAILURE_LIMIT');
    expect(gateway.indexOf('isLockedOut(counts.identity, counts.client)'))
      .toBeLessThan(gateway.indexOf("service.rpc('resolve_member_login'"));
  });

  it('answers every failure with one opaque code', () => {
    expect(gateway).toContain("const GENERIC_FAILURE = 'MEMBER_ACCESS_DENIED'");
    expect(gateway).toMatch(/failureReason: 'no_match'[\s\S]{0,160}code: GENERIC_FAILURE/);
    expect(gateway).not.toMatch(/NAME_NOT_FOUND|PASSWORD_INCORRECT|ACCOUNT_NOT_FOUND/);
  });

  it('does not tell a password reset request whether the name exists', () => {
    expect(gateway).toMatch(/action === 'reset-request'[\s\S]{0,900}json\(\{ recorded: true \}, 202/);
    expect(migration).toMatch(/request_member_password_reset[\s\S]{0,600}return jsonb_build_object\('recorded',false\)/);
  });

  it('logs the attempt without the typed name', () => {
    expect(gateway).toMatch(/identity_hash: input\.identityHash/);
    expect(gateway).not.toMatch(/insert\([\s\S]{0,200}display_name:/);
  });

  it('removes an account it could not finish registering rather than leaving it able to sign in', () => {
    expect(gateway).toMatch(/registerError[\s\S]{0,400}auth\.admin\.deleteUser/);
  });

  it('stores the teacher or parent recovery address in the existing GoTrue identity', () => {
    expect(gateway).toContain("const recoveryEmail = text(body, 'recoveryEmail', 320).toLowerCase()");
    expect(gateway).toContain("role === 'admin' ? `${role}.${crypto.randomUUID()}@${emailDomain}` : recoveryEmail");
    expect(gateway).toContain('p_auth_email: email');
    expect(gateway).toContain('has_recovery_email: role !== \'admin\'');
  });
});

describe('linking a child by name alone', () => {
  it('returns identity to a searching parent and never academic data', () => {
    const search = migration.slice(
      migration.indexOf('create or replace function public.search_children_for_parent'),
      migration.indexOf('-- Establishes the relationship behind the one-field screen')
    );
    expect(search).toContain('masked_code');
    expect(search).toContain('public.mask_student_code(s.student_code)');
    expect(search).not.toMatch(/submissions|scores|grade|attendance/i);
  });

  it('opens data only through a relationship the school owns', () => {
    const link = migration.slice(migration.indexOf('create or replace function public.link_parent_child'));
    // A name match alone produces a request; only a guardian the school already recorded links now.
    expect(link).toContain("next_status := case when existing_parent is not null then 'linked' else 'pending' end");
    expect(link).toContain('p.profile_id is null');
    expect(migration).toContain("if p_state not in ('approve','revoke','restore')");
    expect(migration).toMatch(/set_parent_link_state[\s\S]{0,1400}staff := public\.can_operate_school\(link\.school_id\)/);
    // A parent may close their own link and may never approve one.
    expect(migration).toContain("if not staff and not (parent_owner and p_state='revoke')");
  });

  it('asks a parent for the child name and nothing else', () => {
    expect(childPanel).toContain('ชื่อจริงของลูก');
    expect(childPanel).toContain('+ เพิ่มลูก');
    expect(childPanel).not.toMatch(/type="password"|type="email"/);
    expect(childPanel).not.toMatch(/<label>[\s\S]{0,80}(อีเมล|รหัสผ่าน|รหัสคำเชิญ|เลขประจำตัว)/);
  });

  it('keeps a pending link visible to the parent waiting on it, without opening the student record', () => {
    expect(migration).toContain('drop policy if exists parent_links_scoped_read on public.parent_student_links');
    expect(migration).toMatch(/parent_links_scoped_read[\s\S]{0,600}p\.profile_id=\(select auth\.uid\(\)\)/);
  });
});

describe('the screens a teacher and a parent see', () => {
  it('asks who you are, then only for a name and a password', () => {
    expect(loginPage).toContain('คุณคือใคร?');
    expect(loginPage).toContain('to="/student"');
    expect(loginPage).not.toMatch(/type="email"|autoComplete="one-time-code"/);
    expect(loginPage).not.toMatch(/<label>[\s\S]{0,60}(อีเมล|รหัสโรงเรียน|รหัสคำเชิญ)/);
  });

  it('signs up with a recovery email but keeps it out of normal login', () => {
    expect(accountPages).toContain('ชื่อจริง');
    expect(accountPages).toContain('นามสกุล');
    expect(accountPages).toContain('ยืนยันรหัสผ่าน');
    expect(accountPages).toContain('name="recoveryEmail" type="email"');
    expect(accountPages).toContain('ไม่ใช้เข้าสู่ระบบปกติ');
    expect(accountPages).toContain('registerParent');
    expect(accountPages).toContain('registerTeacher');
  });

  it('uses a six-digit OTP only for password recovery', () => {
    expect(authContext).not.toContain('signInWithOtp');
    expect(authContext).not.toContain('auth.signUp');
    // An email-and-password sign-in exists in the shared context for the operations console, whose
    // operators hold an ordinary account and have no name-directory entry to resolve. What must stay
    // true is that no screen a teacher, parent or student reaches ever calls it: their entrances go
    // through the trusted gateway, which is where the rate limiting and the namesake handling live.
    expect(authContext.match(/signInWithPassword/g) ?? []).toHaveLength(1);
    expect(authContext).toContain('const signInWithEmail');
    for (const screen of [loginPage, accountPages, studentPages]) {
      expect(screen).not.toContain('signInWithPassword');
      expect(screen).not.toContain('signInWithEmail');
    }
    expect(authContext).toContain("token, type: 'recovery'");
    expect(authContext).toContain('/^\\d{6}$/');
    expect(supabaseConfig).toContain('otp_length = 6');
    expect(supabaseConfig).toContain('[auth.email.template.recovery]');
    expect(recoveryTemplate).toContain('{{ .Token }}');
    expect(recoveryTemplate).toContain('OTP 6 หลัก');
    expect(confirmationTemplate).not.toContain('{{ .Token }}');
    expect(magicLinkTemplate).not.toContain('{{ .Token }}');
  });

  it('states one wrong-credentials message on screen', () => {
    expect(memberClient).toContain("MEMBER_ACCESS_GENERIC_MESSAGE = 'ชื่อหรือรหัสผ่านไม่ถูกต้อง'");
  });

  it('routes the parent to their own children screen', () => {
    expect(appSource).toContain('<Route path="my-children" element={<MyChildrenPage />} />');
  });

  it('carries no service role key or privileged client into the browser bundle', () => {
    for (const source of [memberClient, loginPage, accountPages, childPanel]) {
      expect(source).not.toMatch(/SERVICE_ROLE|service_role/);
    }
  });
});
