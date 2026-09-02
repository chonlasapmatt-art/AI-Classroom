import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAccessCode, normalizeTeacherCode } from '../../src/features/auth/memberAccess';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const migration = read('supabase/migrations/202609020007_teacher_code_matching.sql');
const sharedCode = read('supabase/functions/_shared/teacherCode.ts');
const memberAccessFunction = read('supabase/functions/member-access/index.ts');
const loginPage = read('apps/web/src/features/auth/LoginPage.tsx');

/**
 * A teacher signs in with the name and the code their administrator saved. Those codes are written
 * the way a Thai school writes them, so the only thing the comparison may ignore is the separators.
 */
describe('teacher code matching', () => {
  it('keeps a Thai code instead of deleting it', () => {
    expect(normalizeTeacherCode('ครู-01')).toBe('ครู01');
    expect(normalizeTeacherCode('ค.02')).toBe('ค.02');
    // The old rule reduced these to something the roster could never match — an empty string in the
    // second case, which also disabled the sign-in button before the request was ever made.
    expect(normalizeAccessCode('ครู-01')).toBe('01');
    expect(normalizeAccessCode('ครู')).toBe('');
  });

  it('ignores only spaces and dashes, and ignores case', () => {
    expect(normalizeTeacherCode(' t-01 ')).toBe('T01');
    expect(normalizeTeacherCode('T 01')).toBe('T01');
    expect(normalizeTeacherCode('t01')).toBe('T01');
    expect(normalizeTeacherCode('T.01')).toBe('T.01');
  });

  it('leaves the school registration code rule alone', () => {
    // That code's HMAC is stored under the latin-only rule; changing it would invalidate every code
    // any school has ever issued.
    expect(normalizeAccessCode('sc 482917')).toBe('SC482917');
    expect(normalizeAccessCode('SC-482917')).toBe('SC482917');
  });

  it('normalises both sides of the comparison in the database', () => {
    expect(migration).toContain('create or replace function public.normalize_teacher_code(p_code text)');
    expect(migration).toMatch(/regexp_replace\(coalesce\(p_code,''\),'\[\\s-\]','','g'\)/);
    expect(migration).toContain('wanted_code text := public.normalize_teacher_code(p_teacher_code);');
    expect(migration).toContain('public.normalize_teacher_code(t.teacher_code)=wanted_code');
  });

  it('keeps the resolver reachable only by the trusted gateway', () => {
    expect(migration).toMatch(/revoke all on function public\.resolve_teacher_access\(text,text,uuid\) from public,anon,authenticated/);
    expect(migration).toMatch(/grant execute on function public\.resolve_teacher_access\(text,text,uuid\) to service_role/);
  });

  it('backs the sign-in with an index shaped like the query', () => {
    const scale = read('supabase/migrations/202609020008_identity_lookup_scale.sql');
    // The name is stored normalised, the way students have stored theirs since 202608300015, so the
    // comparison is not a function call the planner has to run over every row.
    expect(scale).toMatch(/alter table public\.teachers[\s\S]*add column if not exists normalized_name text[\s\S]*generated always as/);
    expect(scale).toMatch(/create index if not exists teachers_name_code_lookup_idx[\s\S]*normalized_name, public\.normalize_teacher_code\(teacher_code\)/);
    expect(scale).toContain('and t.normalized_name=wanted_name');
    // The replaced index led with school_id, which a teacher typing a name and a code cannot supply.
    expect(scale).toContain('drop index if exists public.teachers_matchable_code_idx;');
  });

  it('counts machine-level attempts on an index that has a leading column to use', () => {
    const scale = read('supabase/migrations/202609020008_identity_lookup_scale.sql');
    expect(scale).toMatch(/create index if not exists admin_access_fingerprint_idx[\s\S]*fingerprint_hash, attempted_at desc/);
  });

  it('sends the same form from the gateway and from the sign-in screen', () => {
    expect(sharedCode).toContain('export function normalizeTeacherCode(value: string): string');
    expect(memberAccessFunction).toContain("const teacherCode = normalizeTeacherCode(text(body, 'teacherCode', 100));");
    expect(loginPage).toContain('normalizeTeacherCode(password).length >= 1');
    expect(loginPage).not.toContain('normalizeAccessCode(password)');
  });
});
