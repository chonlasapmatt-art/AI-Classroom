import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const migration = read('supabase/migrations/202608300015_student_passwordless_access.sql');
const codeMatching = read('supabase/migrations/202608300017_student_code_matching.sql');
const accessFunction = read('supabase/functions/student-access/index.ts');
const studentPages = read('apps/web/src/features/auth/StudentAccessPages.tsx');
const studentClient = read('apps/web/src/features/auth/studentAccess.ts');
const loginPage = read('apps/web/src/features/auth/LoginPage.tsx');
const registerPage = read('apps/web/src/features/auth/AccountPages.tsx');
const appSource = read('apps/web/src/app/App.tsx');

describe('passwordless student access — server authority', () => {
  it('keeps every student lookup out of reach of anon and authenticated callers', () => {
    for (const signature of [
      'public.resolve_student_access(text,text,uuid)',
      'public.bind_student_access(uuid,uuid,text)',
      'public.register_student_access(text,text,text,uuid)',
      'public.search_public_schools(text)',
      'public.find_student_auth_user(text)'
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public,anon,authenticated`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
  });

  it('runs every access function with a pinned search path', () => {
    const definers = migration.match(/security definer/g) ?? [];
    const pinned = migration.match(/set search_path=public,pg_temp/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned.length).toBeGreaterThanOrEqual(definers.length);
  });

  it('binds a session to a resolved student id rather than to a name', () => {
    expect(migration).toContain('function public.bind_student_access(\n  p_student_id uuid,');
    expect(accessFunction).toContain("service.rpc('bind_student_access'");
  });

  it('protects the attempt log and stores hashes instead of the credential', () => {
    expect(migration).toContain('alter table public.student_access_attempts enable row level security');
    expect(migration).toContain('revoke all on public.student_access_attempts from public,anon,authenticated');
    const table = migration.slice(
      migration.indexOf('create table if not exists public.student_access_attempts'),
      migration.indexOf('create index if not exists student_access_attempts_identity_idx')
    );
    expect(table).toMatch(/identity_hash text not null/);
    expect(table).toMatch(/client_hash text not null/);
    // The columns a responder would read during an incident must not reconstruct the credential.
    expect(table).not.toMatch(/display_name|student_code|first_name|last_name/);
  });

  it('records who entered the system and when they first did', () => {
    for (const column of ['creation_source', 'first_student_access_at', 'last_student_access_at', 'student_access_enabled']) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
    expect(migration).toContain("check (creation_source in ('teacher','admin','self_registration','import','system'))");
    expect(migration).toContain('STUDENT_FIRST_ACCESS');
    expect(migration).toContain('STUDENT_SELF_REGISTERED');
    expect(migration).toContain('STUDENT_SELF_LINKED');
  });

  it('links an existing teacher-created record instead of creating a second student', () => {
    expect(migration).toContain('function public.register_student_access');
    expect(migration).toMatch(/select \* into target from public\.students[\s\S]{0,240}for update;/);
    expect(migration).toContain("raise exception 'TARGET_ALREADY_LINKED'");
    expect(migration).toContain("raise exception 'SELF_REGISTRATION_DISABLED'");
  });

  it('lets a school switch self-registration off without touching code', () => {
    expect(migration).toContain('add column if not exists allow_student_self_registration boolean not null default true');
  });

  it('gives a teacher a way to close student access again', () => {
    expect(migration).toContain('function public.set_student_access');
    expect(migration).toContain('public.can_operate_school(target.school_id)');
    expect(migration).toContain('STUDENT_ACCESS_REVOKED');
    expect(migration).toContain('grant execute on function public.set_student_access(uuid,boolean) to authenticated');
  });
});

describe('passwordless student access — abuse resistance', () => {
  it('rate limits by identity and by client before it resolves anything', () => {
    expect(accessFunction).toContain('IDENTITY_FAILURE_LIMIT');
    expect(accessFunction).toContain('CLIENT_FAILURE_LIMIT');
    expect(accessFunction).toMatch(/const counts = await failureCounts\(identityHash\);[\s\S]{0,200}isLockedOut/);
    expect(accessFunction.indexOf('isLockedOut(counts.identity, counts.client)'))
      .toBeLessThan(accessFunction.indexOf("service.rpc('resolve_student_access'"));
  });

  it('answers every failure with one opaque code', () => {
    expect(accessFunction).toContain("const GENERIC_FAILURE = 'STUDENT_ACCESS_DENIED'");
    expect(accessFunction).toMatch(/failureReason: 'no_match'[\s\S]{0,120}code: GENERIC_FAILURE/);
    expect(accessFunction).not.toMatch(/NAME_NOT_FOUND|SCHOOL_NOT_FOUND|STUDENT_CODE_NOT_FOUND/);
  });

  it('refuses to guess when one name and number match two schools', () => {
    expect(accessFunction).toContain("code: 'SCHOOL_SELECTION_REQUIRED'");
    expect(accessFunction).toMatch(/candidates\.length > 1/);
  });

  it('never mints a session for a record whose access was revoked', () => {
    expect(accessFunction).toContain('filter((item) => item.access_enabled)');
    expect(migration).toContain('STUDENT_ACCESS_REVOKED');
  });

  it('logs the attempt without the raw name or student number', () => {
    expect(accessFunction).toMatch(/identity_hash: input\.identityHash/);
    expect(accessFunction).not.toMatch(/insert\([\s\S]{0,200}display_name:/);
  });
});

describe('passwordless student access — the screen a student sees', () => {
  it('asks for a name and a student number and nothing else', () => {
    expect(studentPages).toContain('เลขประจำตัวนักเรียน');
    expect(studentPages).toContain('เข้าใช้งาน');
    expect(studentPages).not.toMatch(/type="password"|type="email"|autoComplete="one-time-code"/);
    // The words may appear in the reassurance that none of this is needed, but never as a field.
    expect(studentPages).not.toMatch(/<label>[\s\S]{0,60}(อีเมล|รหัสผ่าน|OTP)/);
    expect(studentPages).toMatch(/ไม่ต้องใช้อีเมลและรหัสผ่าน/);
  });

  it('uses one generic failure message on screen', () => {
    expect(studentClient).toContain('ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อและเลขประจำตัวนักเรียน');
  });

  it('uses the shared login and removes self-registration', () => {
    expect(appSource).toContain('<Route path="/student" element={<Navigate to="/login" replace />} />');
    expect(appSource).not.toContain('/student/first-time');
    expect(loginPage).toContain('ชื่อนักเรียน');
    expect(loginPage).toContain('รหัสผ่าน');
    expect(loginPage).not.toContain('สมัครใช้งาน');
    expect(accessFunction).toContain("if (action === 'register')");
    expect(accessFunction).toContain("code: 'SELF_REGISTRATION_DISABLED'");
    expect(registerPage).not.toContain('registerParent');
    expect(registerPage).not.toContain('/student/first-time');
  });

  it('carries no service role key or privileged client into the browser bundle', () => {
    for (const source of [studentPages, studentClient, loginPage, registerPage]) {
      expect(source).not.toMatch(/SERVICE_ROLE|service_role/);
    }
  });
});

describe('a student number matches the way it is read', () => {
  it('normalizes both sides of the comparison, not just what the child typed', () => {
    // The client strips spaces and hyphens before it calls. Comparing that against the stored value
    // byte for byte locked out every school whose numbers carry a separator — "ป.6/1-15" typed
    // exactly as printed could never match the "ป.6/1-15" the teacher entered.
    expect(codeMatching).toContain('create or replace function public.normalize_student_code(p_code text)');
    expect(codeMatching).toContain("regexp_replace(coalesce(p_code,''),'[\\s-]','','g')");
    expect(codeMatching).toMatch(/resolve_student_access[\s\S]{0,1200}public\.normalize_student_code\(s\.student_code\) = wanted_code/);
    expect(codeMatching).toMatch(/register_student_access[\s\S]{0,2000}public\.normalize_student_code\(student_code\) = match_code/);
  });

  it('keeps the school formatting it stored and only relaxes the comparison', () => {
    expect(codeMatching).toContain("clean_code text := upper(trim(coalesce(p_student_code,'')));");
    expect(codeMatching).toContain('values(new_id,target_school.id,clean_code');
  });

  it('keeps the lookups service_role only after replacing them', () => {
    for (const signature of [
      'public.resolve_student_access(text,text,uuid)',
      'public.register_student_access(text,text,text,uuid)'
    ]) {
      expect(codeMatching).toContain(`revoke all on function ${signature} from public,anon,authenticated`);
      expect(codeMatching).toContain(`grant execute on function ${signature} to service_role`);
    }
  });
});

describe('teacher onboarding activates immediately', () => {
  it('creates a verified, active teacher instead of a pending one', () => {
    expect(migration).toContain('function public.request_teacher_account');
    const body = migration.slice(migration.indexOf('function public.request_teacher_account'));
    expect(body).toContain("'verified_teacher','active'");
    expect(body).toContain("values(target_school.id,p_actor,'teacher','active')");
    expect(body).toContain("account_state='active'");
    expect(body).not.toContain("'verification_pending'");
  });
});
