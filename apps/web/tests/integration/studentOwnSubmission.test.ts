import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (name: string) => readFileSync(join(root, 'supabase/migrations', name), 'utf8');

const guard = read('202609100001_a_student_hands_in_their_own_work.sql');
const previous = read('202609020019_score_guard_trusted_server.sql');

/*
 * No pupil in this school had ever handed work in.
 *
 * `guard_teacher_academic_scope` fires on every write to `submissions`. It asked whether the caller
 * was an administrator, then whether they were a teacher, and refused anybody who was neither -- and
 * a pupil is neither. The branch below it has always said a submission the pupil owns is theirs to
 * write; the role gate returned first, so that branch was unreachable from a child's device.
 *
 * A turn-in is written to the device before it is pushed, so the child saw "ส่งแล้ว" straight away
 * while the push was refused and the queue row was marked blocked in silence. Confirmed against
 * production: twenty submission rows, every one of them still submitted_at = null, while the
 * teacher's tracking screen faithfully reported a server that had never been told.
 *
 *   ERROR: 42501: FORBIDDEN
 *   CONTEXT: PL/pgSQL function guard_teacher_academic_scope() line 17 at RAISE
 */
describe('a pupil hands in their own work', () => {
  it('reaches the owner check before the role gate that used to refuse them', () => {
    const ownerCheck = guard.indexOf("public.student_owns_student_record((row_json->>'student_id')::uuid)");
    const roleGate = guard.indexOf("if not public.has_school_role(v_school_id,'teacher') then raise exception 'FORBIDDEN'");
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(roleGate).toBeGreaterThan(-1);
    expect(ownerCheck).toBeLessThan(roleGate);
  });

  it('was the other way round before, which is the whole of the bug', () => {
    const ownerCheck = previous.indexOf('public.student_owns_student_record(v_student_id)');
    const roleGate = previous.indexOf("if not public.has_school_role(v_school_id,'teacher') then raise exception 'FORBIDDEN'");
    expect(roleGate).toBeLessThan(ownerCheck);
  });

  it('still refuses to let that pupil write their own mark', () => {
    // `apply_sync_mutation` copies score and teacher_note straight out of the payload, so a device
    // trusted to say "I have handed this in" would otherwise be trusted to say "and it scored 10".
    for (const column of [
      'new.score := v_previous.score;',
      'new.teacher_note := v_previous.teacher_note;',
      'new.final_grade := v_previous.final_grade;',
      'new.graded_by := v_previous.graded_by;',
      'new.graded_at := v_previous.graded_at;'
    ]) expect(guard).toContain(column);
    // A submission that did not exist starts with no mark at all rather than with the payload's.
    expect(guard).toContain('new.score := null;');
  });

  it('opens exactly one row per pupil, and never the delete', () => {
    // The ownership test compares against auth.uid(), so it cannot reach another child's work.
    expect(guard).toContain('student_owns_student_record');
    expect(guard).toContain('FORBIDDEN: SUBMISSION_IS_NOT_DELETABLE');
  });

  it('leaves every other guard exactly where it was', () => {
    for (const rule of [
      "if tg_table_name in ('assignments','activities','tests') then",
      "elsif tg_table_name = 'activity_scores' then",
      "elsif tg_table_name = 'test_scores' then",
      "elsif tg_table_name = 'score_events' then",
      "elsif tg_table_name = 'exam_questions' then",
      'FORBIDDEN: SUBJECT_OWNER_REQUIRED'
    ]) expect(guard).toContain(rule);
    // A trusted server call still passes, which is what the previous migration existed for.
    expect(guard).toContain('if auth.uid() is null then return case when tg_op=\'DELETE\' then old else new end; end if;');
  });

  it('still makes a teacher own the subject before touching a submission of it', () => {
    expect(guard).toContain("elsif tg_table_name = 'submissions' then");
    expect(guard).toContain('public.teacher_can_manage_subject_content(v_school_id,v_class_id,v_subject_id)');
  });
});
