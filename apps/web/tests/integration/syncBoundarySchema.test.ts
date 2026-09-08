import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The academic workflow's records reach every device through the same trusted boundary as
// everything else. These assertions hold the boundary to what the client relies on: the entity
// list, the natural-key re-keying, and the rule that a student's own turn-in never carries a mark.

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');
const migration = read('supabase/migrations/202609080003_every_record_reaches_every_device.sql');
const boundary = migration.slice(migration.indexOf('function public.apply_sync_mutation'), migration.indexOf('function public.sync_change_visible'));
const visible = migration.slice(migration.indexOf('function public.sync_change_visible'), migration.indexOf('function public.submit_quiz_answer'));

const newEntities = ['rubric', 'rubric_score', 'submission_version', 'deadline_extension', 'notification_preference', 'classroom_notification', 'academic_audit'];

describe('the trusted mutation boundary', () => {
  it('accepts every entity the client queues, and only those', () => {
    const accepted = boundary.match(/if p_entity_type not in \(([^)]+)\)/)?.[1] ?? '';
    const list = accepted.split(',').map((item) => item.trim().replace(/'/g, ''));
    expect(list).toHaveLength(20);
    for (const entity of newEntities) expect(list).toContain(entity);
  });

  it('finds a record by its natural key and answers with the id it wrote', () => {
    expect(boundary).toMatch(/when 'achievement' then select id into existing_id from public\.student_achievements where school_id=p_school_id and dedupe_key=p_payload->>'dedupeKey' and id<>p_entity_id/);
    expect(boundary).toMatch(/when 'classroom_notification' then select id into existing_id from public\.classroom_notifications where school_id=p_school_id and dedupe_key=/);
    expect(boundary).toMatch(/when 'rubric_score' then select id into existing_id from public\.rubric_scores[^;]*criterion_id=p_payload->>'criterionId'/);
    expect(boundary).toMatch(/when 'submission' then select id into existing_id from public\.submissions[^;]*deleted_at is null and id<>p_entity_id/);
    expect(boundary).toContain("if existing_id is not null then target_id:=existing_id; end if;");
    expect(boundary).toContain("'entityId',target_id,'status','accepted'");
    // A conflict on a re-keyed record names the row the conflict screen can actually resolve.
    expect(boundary).toMatch(/insert into public\.sync_conflicts\([^)]*\) values\(p_school_id,p_device_id,p_entity_type,target_id/);
  });

  it('lets only staff write the roster, and a student only their own avatar', () => {
    expect(boundary).toContain("if p_entity_type='student' and not (staff or (p_operation='upsert' and public.student_owns_student_record(target_id))) then raise exception 'FORBIDDEN'");
    expect(boundary).toContain("if p_entity_type='enrollment' and not (is_admin or public.teacher_has_class_access(");
    const start = boundary.indexOf("when 'student' then\n        if staff then");
    const studentPath = boundary.slice(start, boundary.indexOf("when 'enrollment' then\n", start));
    const selfWrite = studentPath.slice(studentPath.indexOf('else'));
    expect(selfWrite).toContain('update public.students set avatar_index=');
    expect(selfWrite).not.toMatch(/display_name|student_code|status=/);
  });

  it('refuses an enrollment into a room of another term or for a student of another school', () => {
    expect(boundary).toContain("raise exception 'VALIDATION_ERROR: unknown student'");
    expect(boundary).toContain("c.academic_term_id=public.sync_uuid(p_payload->>'academicTermId')) then raise exception 'VALIDATION_ERROR: class is not in that term'");
  });

  it("never takes a mark from a student's own device, and decides lateness on the server clock", () => {
    const start = boundary.indexOf("when 'submission' then\n        submitted:=");
    const submission = boundary.slice(start, boundary.indexOf("when 'activity' then", start));
    const studentPath = submission.slice(submission.indexOf('else'));
    // score is null, teacher_note is empty, and no grading column is named in the student's write.
    expect(studentPath).toMatch(/values\(target_id,p_school_id,assignment_scope,student_scope,submitted,coalesce\(head_status,'not_started'\),null,late,''/);
    expect(studentPath).not.toMatch(/score=excluded|final_grade|graded_by|percentage/);
    expect(studentPath).toContain('deadline:=public.submission_deadline(assignment_scope,student_scope);');
    expect(studentPath).toContain('submitted:=least(submitted,server_now);');
    expect(studentPath).toContain("if head_status not in ('not_started','in_progress','submitted','late','resubmitted') then head_status:=null; end if;");
  });

  it('stores every workflow column the client sends for work and submissions', () => {
    for (const column of ['work_type', 'instructions', 'start_at', 'rubric_id', 'reminder_offsets', 'published_at', 'cancelled_at']) {
      expect(boundary).toMatch(new RegExp(`insert into public\\.assignments\\([^)]*${column}`));
    }
    for (const column of ['student_note', 'opened_at', 'acknowledged_at', 'revision_note', 'percentage', 'calculated_grade', 'final_grade', 'grade_override_reason', 'graded_by', 'graded_at']) {
      expect(boundary).toMatch(new RegExp(`insert into public\\.submissions\\([^)]*${column}`));
    }
    // Text the server was never told stays null, so a pull never writes an empty string over it.
    expect(migration).toContain('alter table public.assignments add column if not exists instructions text;');
    expect(migration).toContain('alter table public.submissions add column if not exists student_note text;');
    expect(boundary).toContain('instructions=coalesce(excluded.instructions,public.assignments.instructions)');
    expect(boundary).toContain('student_note=coalesce(excluded.student_note,public.submissions.student_note)');
  });

  it('keeps the audit trail append-only and written by the signed-in person', () => {
    expect(boundary).toContain("when 'academic_audit' then raise exception 'VALIDATION_ERROR: the audit trail is append-only';");
    expect(boundary).toMatch(/insert into public\.audit_log\(id,school_id,actor_profile_id,action,[^)]*\)\s+values\(target_id,p_school_id,actor,p_payload->>'action'/);
    expect(boundary).toContain('on conflict(id) do nothing;');
    expect(boundary).toContain("if p_entity_type in ('assignment','activity','test','rubric','academic_audit') and not staff then raise exception 'FORBIDDEN'");
  });

  it('answers a delete of a row the server never had as done, without journaling it', () => {
    expect(boundary).toContain('if current_version is null then current_version:=0; journal:=false; end if;');
    expect(boundary).toMatch(/if journal then\s+insert into public\.sync_changes/);
  });

  it("gives the student's notice a table with row level security and a dedupe identity", () => {
    expect(migration).toMatch(/create table if not exists public\.classroom_notifications\s*\(/);
    expect(migration).toContain('unique (school_id, dedupe_key)');
    expect(migration).toContain('alter table public.classroom_notifications enable row level security');
    expect(migration).toContain('grant select on public.classroom_notifications to authenticated');
    expect(migration).toMatch(/classroom_notifications_scoped_read[\s\S]{0,200}public\.can_read_student\(student_id\)/);
    // A student may deliver and read a notice, never rewrite its words.
    const start = boundary.indexOf("when 'classroom_notification' then\n        if coalesce");
    const notice = boundary.slice(start, boundary.indexOf("when 'academic_audit' then\n", start));
    const studentPath = notice.slice(notice.indexOf('else'));
    expect(studentPath).not.toMatch(/title=excluded|body=excluded/);
  });

  it('makes every new record visible only to the people already allowed to read it', () => {
    for (const entity of newEntities) expect(visible).toContain(`p_entity_type = '${entity}'`);
    expect(visible).toMatch(/'rubric' then\s+return exists\([^;]*has_school_role\(r\.school_id, 'teacher'\)/);
    expect(visible).toMatch(/'notification_preference' then\s+return exists\([^;]*n\.profile_id = \(select auth\.uid\(\)\)/);
    expect(visible).toMatch(/'academic_audit' then\s+return public\.has_school_role\(p_school_id, 'admin'\)/);
  });
});

describe('marking by set rather than by sequence', () => {
  const matcher = migration.slice(migration.indexOf('function public.answer_matches'), migration.indexOf('revoke all on function public.sync_uuid'));

  it('ignores the order choices were tapped in and never rewards an empty answer', () => {
    expect(matcher).toContain('array_agg(distinct g.choice order by g.choice)');
    expect(matcher).toContain('when jsonb_array_length(p_given) = 0 or jsonb_array_length(p_key) = 0 then false');
  });

  it('accepts a short answer that matches any accepted answer once case and spacing are ignored', () => {
    expect(matcher).toMatch(/when p_question_type = 'short_answer' then exists \(/);
    expect(matcher).toContain("lower(regexp_replace(btrim(g.answer), '\\s+', ' ', 'g'))");
  });

  it('is what both the quiz and the exam use', () => {
    const quiz = migration.slice(migration.indexOf('function public.submit_quiz_answer'));
    expect(quiz.slice(0, quiz.indexOf('end $$'))).toContain('correct := public.answer_matches(question.question_type, coalesce(p_selected, \'[]\'::jsonb), question.answer_key);');
    expect(quiz.slice(0, quiz.indexOf('end $$'))).not.toContain('score_events');
    const exam = migration.slice(migration.indexOf('function public.submit_exam_attempt'));
    expect(exam.slice(0, exam.indexOf('end $$'))).toContain('if public.answer_matches(question.question_type, given, question.answer_key) then');
    expect(exam).toContain("submitted_reason = case when expired then 'timeout'");
  });
});
