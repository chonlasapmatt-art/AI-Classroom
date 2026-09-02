-- A teacher could not award a single mark outside a form an administrator filled in.
--
-- `guard_teacher_academic_scope` guards every academic write a teacher makes, and it declares its
-- locals as `school_id`, `class_id`, `subject_id`, `student_id` — the names of the columns it then
-- compares them against. In the enrolment check the comparison reads
-- `where e.school_id = school_id`, and Postgres cannot tell whether the right-hand side is the local
-- or the table's own column, so the whole statement is refused with
-- `42702: column reference "school_id" is ambiguous`.
--
-- An administrator never sees it: the function returns before that line for anybody with the admin
-- role. A teacher hits it on every `score_events` write, which is how a finished Quiz Challenge round
-- could not become marks — `award_quiz_bonus` inserts a score event, the trigger refuses it, and the
-- screen says the round could not be awarded.
--
-- The locals are prefixed. Nothing else changes.

begin;

create or replace function public.guard_teacher_academic_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  row_json jsonb;
  v_school_id uuid;
  v_class_id uuid;
  v_subject_id uuid;
  v_parent_id uuid;
  v_student_id uuid;
begin
  row_json := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id := (row_json->>'school_id')::uuid;
  if public.has_school_role(v_school_id,'admin') then return case when tg_op='DELETE' then old else new end; end if;
  if not public.has_school_role(v_school_id,'teacher') then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  if tg_table_name in ('assignments','activities','tests') then
    v_class_id := (row_json->>'class_id')::uuid; v_subject_id := (row_json->>'subject_id')::uuid;
    if not public.teacher_can_manage_subject_content(v_school_id,v_class_id,v_subject_id) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'activity_scores' then
    select a.class_id,a.subject_id into v_class_id,v_subject_id from public.activities a where a.id=(row_json->>'activity_id')::uuid;
    if not public.teacher_can_edit_subject_score(v_school_id,v_class_id,v_subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'test_scores' then
    select t.class_id,t.subject_id into v_class_id,v_subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_edit_subject_score(v_school_id,v_class_id,v_subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'submissions' then
    v_parent_id := (row_json->>'assignment_id')::uuid; v_student_id := (row_json->>'student_id')::uuid;
    if not public.student_owns_student_record(v_student_id) then
      select a.class_id,a.subject_id into v_class_id,v_subject_id from public.assignments a where a.id=v_parent_id;
      if not public.teacher_can_manage_subject_content(v_school_id,v_class_id,v_subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
    end if;
  elsif tg_table_name = 'score_events' then
    v_class_id := (row_json->>'class_id')::uuid; v_subject_id := (row_json->>'subject_id')::uuid; v_student_id := (row_json->>'student_id')::uuid;
    if v_class_id is null or not public.teacher_can_edit_subject_score(v_school_id,v_class_id,v_subject_id)
       or not exists(select 1 from public.student_class_enrollments e
         where e.school_id=v_school_id and e.class_id=v_class_id and e.student_id=v_student_id
           and e.status='active' and e.deleted_at is null) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'exam_questions' then
    select t.class_id,t.subject_id into v_class_id,v_subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_manage_subject_content(v_school_id,v_class_id,v_subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

comment on function public.guard_teacher_academic_scope() is
  'Subject-owner check for every academic write a teacher makes. Locals are prefixed; the columns are not.';

commit;
