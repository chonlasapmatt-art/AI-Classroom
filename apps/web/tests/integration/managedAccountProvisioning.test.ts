import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const migrationsDir = join(repositoryRoot, 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir).sort();
const sql = migrationFiles.map((file) => readFileSync(join(migrationsDir, file), 'utf8')).join('\n');
const fix = readFileSync(join(migrationsDir, '202609020009_managed_account_provision_fix.sql'), 'utf8');
const gateway = readFileSync(join(repositoryRoot, 'supabase/functions/admin-account/index.ts'), 'utf8');
const client = readFileSync(join(repositoryRoot, 'apps/web/src/features/auth/adminAccount.ts'), 'utf8');

/**
 * One function creates every login a school administrator hands out — teacher, student, and parent
 * linked to a child — and it had never once succeeded. The insert that grants the membership passed
 * a `text` parameter into an enum column, which Postgres refuses, and the gateway reported every
 * refusal as the same sentence, so the failure had no visible cause to follow.
 */
describe('administrator-created logins', () => {
  it('names the enum when the role comes from a variable', () => {
    expect(fix).toContain('values(p_school_id,p_profile_id,p_role::public.membership_role,\'active\')');
  });

  it('never inserts a bare variable into the membership role column again', () => {
    // `school_memberships.role` is `public.membership_role`. A literal resolves against the column
    // on its own; a `text` variable does not, and the error only ever appears at runtime — which is
    // why this went unnoticed. Migrations are immutable, so `202609010044` still carries the broken
    // statement it was superseded for; everything from the fix onward has to be clean.
    const current = migrationFiles.filter((file) => file >= '202609020009');
    expect(current.length).toBeGreaterThan(0);
    const statements = current
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')
      .match(/insert into public\.school_memberships\([^)]*role[^)]*\)\s*values\([^)]*\)/g) ?? [];
    for (const statement of statements) {
      const role = statement.slice(statement.indexOf('values(')).split(',')[2] ?? '';
      const named = role.includes("'") || role.includes('::public.membership_role') || role.includes('excluded.');
      expect(named, `role passed without a literal or a cast: ${statement.slice(0, 120)}`).toBe(true);
    }
  });

  it('leaves the superseded definition visible in history rather than edited away', () => {
    // The evidence for what went wrong stays in the repository. `create or replace` in a later
    // migration is what changes the database.
    expect(sql).toContain('values(p_school_id,p_profile_id,p_role,\'active\')');
    expect(migrationFiles.filter((file) => sql.includes(file))).not.toContain('202609010044_admin_managed_accounts.sql');
  });

  it('lets a student hold a login identity', () => {
    // Students sign in by name and student number now. The constraint predates that.
    expect(fix).toContain("check (role in ('teacher','parent','admin','student'))");
  });

  it('carries an unrecognised database refusal back to the administrator', () => {
    expect(gateway).toContain('const reason = code === GENERIC_FAILURE ? message.slice(0, 300) : undefined;');
    expect(gateway).toContain("message.includes('VALIDATION_ERROR') ? 'VALIDATION_ERROR'");
    expect(client).toContain("typeof parsed?.reason === 'string'");
  });
});
