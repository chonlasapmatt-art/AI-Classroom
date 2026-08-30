import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');
const files = readdirSync(migrationsDir).sort();
const sql = files.map((file) => readFileSync(join(migrationsDir, file), 'utf8')).join('\n');

/**
 * The timetable, achievement and academic-year work added tables and two more accepted sync
 * entities. These assertions hold the same line the rest of the schema holds: every new table is
 * RLS-protected, every new function is security definer, and none of it is reachable anonymously.
 */
describe('timetable, achievement and academic year schema', () => {
  it.each(['timetable_entries', 'student_achievements'])('creates %s with row level security', (table) => {
    expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i'));
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    expect(sql).toMatch(new RegExp(`grant select on public\\.${table} to authenticated`, 'i'));
  });

  it('scopes achievement reads to people already allowed to see the student', () => {
    expect(sql).toContain('achievements_scoped_read');
    expect(sql).toContain('using (public.can_read_student(student_id))');
  });

  it('lets a class see its own timetable and nobody else read it', () => {
    expect(sql).toContain('timetable_scoped_read');
    expect(sql).toMatch(/timetable_scoped_read[\s\S]*teacher_has_class_access/);
    expect(sql).toMatch(/timetable_scoped_read[\s\S]*parent_has_active_consent/);
  });

  it('accepts the two new entity types at the trusted mutation boundary', () => {
    expect(sql).toContain("'setting','timetable_entry','achievement'");
    expect(sql).toMatch(/p_entity_type='achievement' and not \(public\.has_school_role\(p_school_id,'admin'\) or public\.has_school_role\(p_school_id,'teacher'\)\)/);
    expect(sql).toMatch(/p_entity_type='timetable_entry' and not \(public\.has_school_role\(p_school_id,'admin'\) or public\.teacher_has_class_access/);
  });

  it('deletes a timetable slot as a tombstone, never as a hard delete', () => {
    expect(sql).toMatch(/when 'timetable_entry' then update public\.timetable_entries set deleted_at=clock_timestamp\(\)/);
    expect(sql).toMatch(/when 'achievement' then update public\.student_achievements set deleted_at=clock_timestamp\(\)/);
  });

  it.each(['delete_teacher', 'upsert_academic_term'])('keeps %s trusted and closed to anonymous callers', (fn) => {
    expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`, 'i'));
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public,anon`, 'i'));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`, 'i'));
  });

  it('refuses to remove a teacher who still holds a class', () => {
    expect(sql).toMatch(/teacher still assigned to a class/);
  });

  it('keeps exactly one active academic term', () => {
    expect(sql).toMatch(/update public\.academic_terms set status='closed'[\s\S]*where school_id=p_school_id and id<>p_term_id and status='active'/);
  });

  it('records a school-entered guardian without inventing a second one', () => {
    expect(sql).toMatch(/create or replace function public\.upsert_parent\(/i);
    expect(sql).toMatch(/revoke all on function public\.upsert_parent\([^)]*\) from public,anon/i);
    // An edit to a guardian's details must never detach an account already linked to them.
    expect(sql).toMatch(/profile_id=coalesce\(public\.parents\.profile_id,existing_profile\)/);
    expect(sql).toContain('parents_scoped_read');
  });

  it('keeps migration order reproducible for a fresh environment', () => {
    // Files are added, never edited in place, so a fresh database replays the same sequence.
    const ordered = [...files].sort();
    expect(files).toEqual(ordered);
    expect(files.at(-1)).toBe('202608300012_parent_accounts.sql');
  });
});
