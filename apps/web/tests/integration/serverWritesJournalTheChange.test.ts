import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (name: string) => readFileSync(join(repositoryRoot, 'supabase/migrations', name), 'utf8');

const journalHelper = read('202609090005_a_server_side_write_tells_the_devices.sql');
const roomJoin = read('202609090006_a_teacher_can_add_a_student_by_name_and_number.sql');
const engine = readFileSync(join(repositoryRoot, 'apps/web/src/sync/engine.ts'), 'utf8');

/**
 * A device only learns what changed from `sync_changes`. For a long time only `apply_sync_mutation`
 * wrote to it, so a row changed by any other server path — an account binding, a class invitation,
 * a transfer — was invisible to every device until its cache was cleared.
 *
 * The failure had one very specific face: an administrator creates a student, puts them in a class,
 * and the child signs in on that same browser to an empty app, because the device's copy of the
 * student still said `profile_id = null` and the local scope found no record the signed-in profile
 * owned. These tests keep each of those paths announcing its own writes.
 */
describe('a server-side write announces itself', () => {
  it('offers one helper that every path can call', () => {
    expect(journalHelper).toContain('create or replace function public.journal_sync_change(');
    expect(journalHelper).toMatch(/journal_sync_change\([\s\S]{0,400}security definer/);
    expect(journalHelper).toContain('insert into public.sync_changes(school_id, entity_type, entity_id, operation, version)');
    // Devices call it only through the definer functions that own the write; it is not an RPC.
    expect(journalHelper).toMatch(/revoke all on function public\.journal_sync_change\([^)]*\) from authenticated/);
  });

  it('journals the student row on every path that binds or releases an account', () => {
    for (const fn of ['bind_student_access', 'claim_student_account', 'set_student_access', 'register_student_access']) {
      const body = journalHelper.slice(journalHelper.indexOf(`create or replace function public.${fn}(`));
      const end = body.indexOf('create or replace function', 1);
      const scoped = end === -1 ? body : body.slice(0, end);
      expect(scoped, fn).toContain("journal_sync_change(");
      expect(scoped, fn).toContain("'student'");
    }
  });

  it('journals the student row when an administrator provisions the account', () => {
    const body = roomJoin.slice(roomJoin.indexOf('create or replace function public.provision_managed_account('));
    const scoped = body.slice(0, body.indexOf('create or replace function', 1));
    expect(scoped).toContain("public.journal_sync_change(p_school_id,'student',target_student.id,'upsert',new_version)");
  });

  it('journals both the roster row and the student when a room takes someone in', () => {
    const body = roomJoin.slice(roomJoin.indexOf('create or replace function public.invite_student_to_class('));
    const scoped = body.slice(0, body.indexOf('create or replace function', 1));
    expect(scoped).toContain("public.journal_sync_change(p_school_id,'enrollment',enrollment_id,'upsert',1)");
    expect(scoped).toContain("public.journal_sync_change(p_school_id,'student',p_student_id,'upsert',null)");
  });

  it('journals the closed and the opened enrolment on a transfer', () => {
    const body = roomJoin.slice(roomJoin.indexOf('create or replace function public.transfer_student('));
    const scoped = body.slice(0, body.indexOf('create or replace function', 1));
    expect(scoped).toContain("public.journal_sync_change(school,'enrollment',old_record.id,'upsert',closed_version)");
    expect(scoped).toContain("public.journal_sync_change(school,'enrollment',new_id,'upsert',1)");
  });

  it('backfills the rows the missing journal entries left stale', () => {
    // Devices already holding a stale student heal on their next pull instead of a reinstall.
    expect(roomJoin).toMatch(/insert into public\.sync_changes[\s\S]{0,200}from public\.students s\s+where s\.version >/);
    expect(roomJoin).toMatch(/insert into public\.sync_changes[\s\S]{0,220}from public\.student_class_enrollments e\s+where e\.version >/);
  });

  it('still pulls by revision, which is what makes the journal the only channel', () => {
    expect(engine).toContain("rpc('sync_pull'");
    expect(engine).toContain('lastPullRevision');
  });
});

describe('finding a child to put in a room', () => {
  it('matches the number on the slip as well as the name', () => {
    const body = roomJoin.slice(roomJoin.indexOf('create or replace function public.search_school_students('));
    expect(body).toContain('public.normalize_student_code(s.student_code)');
    expect(body).toContain('position(needle in lower(s.display_name))>0');
    // An exact number is the least ambiguous thing a teacher can type, so it sorts first.
    expect(body).toContain('order by (public.normalize_student_code(s.student_code)=code_needle) desc');
  });

  it('still lets only an administrator or the room’s own teacher search', () => {
    const body = roomJoin.slice(roomJoin.indexOf('create or replace function public.search_school_students('));
    expect(body).toContain("public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(p_class_id)");
  });
});
