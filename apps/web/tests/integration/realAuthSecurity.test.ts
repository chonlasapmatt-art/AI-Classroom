import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const migration = readFileSync(join(repositoryRoot, 'supabase/migrations/202608300009_real_accounts_and_owner_security.sql'), 'utf8');
const adminFunction = readFileSync(join(repositoryRoot, 'supabase/functions/admin-access/index.ts'), 'utf8');
const invitationMigration = readFileSync(join(repositoryRoot, 'supabase/migrations/202608300010_member_invitations.sql'), 'utf8');
const invitationFunction = readFileSync(join(repositoryRoot, 'supabase/functions/member-invitation/index.ts'), 'utf8');
const appSource = readFileSync(join(repositoryRoot, 'apps/web/src/app/App.tsx'), 'utf8');
const publicAuthSource = [
  'apps/web/src/features/auth/LoginPage.tsx',
  'apps/web/src/features/auth/AccountPages.tsx'
].map((file) => readFileSync(join(repositoryRoot, file), 'utf8')).join('\n');

function sourceFiles(directory: string): string[] {
  const ignored = new Set(['node_modules', 'work', 'outputs', 'dist', 'coverage', '.git']);
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('real account and private owner security upgrade', () => {
  it('offers only the three public roles and does not reveal privileged access in public auth UI', () => {
    expect(publicAuthSource).toContain("teacher: 'ครู'");
    expect(publicAuthSource).toContain("student: 'นักเรียน'");
    expect(publicAuthSource).toContain("parent: 'ผู้ปกครอง'");
    // What must stay out of these screens is a way in: an administrator role to pick, a platform
    // role named as an option, or the private owner entry. Naming the person who issues a teacher
    // code is not that — a teacher who is not told where the code comes from cannot register at all —
    // so the school-administrator wording is allowed and the entry points are checked directly.
    expect(publicAuthSource).not.toMatch(/Admin|ผู้ดูแลระบบ|Special code/i);
    expect(publicAuthSource).not.toMatch(/'admin'|"admin"|super_admin|register-owner/);
  });

  it('requires a school-issued code on the public teacher registration screen', () => {
    // Teacher authority comes from the school, so the public screen must ask for the code and the
    // client must send it. The server refuses without one regardless; this keeps the screen honest.
    expect(publicAuthSource).toContain('รหัสสำหรับครู');
    expect(publicAuthSource).toContain('accessCode');
    expect(publicAuthSource).toMatch(/registerTeacher\(\{[^}]*accessCode/);
  });

  it('keeps the private owner route unlinked', () => {
    expect(appSource.match(/owner\/access/g)).toHaveLength(1);
    expect(publicAuthSource).not.toContain('owner/access');
  });

  it('removes the legacy authenticated bootstrap and grants the replacement only to service_role', () => {
    expect(migration).toContain('OWNER_AUTHORIZATION_REQUIRED');
    expect(migration).toMatch(/revoke all on function public\.bootstrap_school\(text,text,text,text\) from public,anon,authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.bootstrap_school_owner\(uuid,text,text,text,text\) to service_role/i);
    expect(migration).toContain('alter table public.admin_access_attempts enable row level security');
  });

  it('enforces teacher verification before teacher authorization', () => {
    expect(migration).toContain("verification_status='verified_teacher'");
    expect(migration).toContain('public.is_verified_teacher');
    expect(migration).toContain('public.can_operate_school');
    expect(migration).toContain("'teacher_verified'");
    expect(migration).toContain("'student_transfer'");
  });

  it('links invited accounts to existing records without allowing a public privileged role', () => {
    expect(invitationMigration).toContain("check (intended_role <> 'admin')");
    expect(invitationMigration).toContain("verification_status='verification_pending'");
    expect(invitationMigration).toContain('profile_id is null');
    expect(invitationMigration).toContain('member_invitation_redeemed');
    expect(invitationFunction).toContain("Deno.env.get('MEMBER_INVITATION_HMAC_SECRET')");
    expect(invitationFunction).toContain("action === 'redeem'");
  });

  it('validates the owner secret only in the Edge Function and never stores the raw code', () => {
    expect(adminFunction).toContain("Deno.env.get('ADMIN_ACCESS_CODE_HASH')");
    expect(adminFunction).toContain('constantTimeEqual');
    expect(adminFunction).toContain('TEMPORARILY_LOCKED');
    expect(adminFunction).not.toMatch(/accessCode\s*[:,]\s*["']\d+["']/);
    const repositoryText = sourceFiles(repositoryRoot)
      .filter((file) => /\.(ts|tsx|sql|toml|json|md|example|yml|yaml)$/.test(file))
      .map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(repositoryText).not.toContain(['08', '12'].join(''));
  });
});
