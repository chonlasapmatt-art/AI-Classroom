import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (name: string) => readFileSync(join(root, 'supabase/migrations', name), 'utf8');

const roomRule = read('202609090007_a_teacher_writes_into_their_own_rooms.sql');
const markRule = read('202609090008_a_mark_belongs_to_the_subject_teacher.sql');

/*
 * The two rules the screens have always followed, now written where they can be enforced.
 *
 * `apply_sync_mutation` is the only door a device writes through, and two of its guards were looser
 * than the app they serve: work could be created in any room in the school by any teacher in it,
 * and a mark could be written by anybody on the room's staff list rather than by the teacher of
 * that subject. Both were reachable only by a client that does not use the screens -- which is the
 * case a server-side check exists for.
 *
 * Verified against production by impersonating a real advisor: under the old rule they could write
 * any mark in their room; under the new one a subject they do not own comes back false, while a
 * mark carrying no subject still comes back true.
 */
describe('what the server lets a teacher write', () => {
  it('ties work to a room the teacher was given', () => {
    expect(roomRule).toContain("if p_entity_type in ('assignment','activity','test') and not (");
    expect(roomRule).toContain('public.teacher_has_class_access(coalesce(class_scope,(p_payload->>\'classId\')::uuid))');
    // The old rule asked only whether the caller taught anywhere in the school.
    expect(roomRule).not.toContain("if p_entity_type in ('assignment','activity','test') and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher'))");
  });

  it('ties a mark to the teacher who owns that subject in that room', () => {
    expect(markRule).toContain('create or replace function public.teacher_owns_class_subject(');
    expect(markRule).toContain('create or replace function public.can_write_subject_mark(');
    expect(markRule).toContain("ct.role_in_class = 'primary'");
    expect(markRule).toContain('FORBIDDEN: SUBJECT_OWNER_REQUIRED');
    // The subject comes from the parent, whether the mark is new or an edit.
    expect(markRule).toContain("coalesce((p_payload->>'activityId')::uuid,");
    expect(markRule).toContain("coalesce((p_payload->>'testId')::uuid,");
  });

  it('keeps the child-in-the-room check as the outer arm, and leaves a subjectless mark with the room', () => {
    // Being the subject's owner somewhere else is not a licence to mark a child who is not in the
    // room; and a mark whose parent carries no subject has no owner to require, so it must not
    // become unwritable by anyone.
    expect(markRule).toContain('select public.staff_can_award_student(p_school_id, p_student_id, p_class_id)');
    expect(markRule).toContain('or p_subject_id is null');
  });

  it('keeps the helpers off the device, since only the definer function calls them', () => {
    expect(markRule).toContain('revoke all on function public.teacher_owns_class_subject(uuid, uuid) from public, anon, authenticated;');
    expect(markRule).toContain('revoke all on function public.can_write_subject_mark(uuid, uuid, uuid, uuid) from public, anon, authenticated;');
  });
});
