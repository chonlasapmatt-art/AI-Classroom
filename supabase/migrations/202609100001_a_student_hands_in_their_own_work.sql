-- A student could not hand in their own work.
--
-- `guard_teacher_academic_scope` fires on every write to `submissions`. It asks whether the caller
-- is an administrator, then whether they are a teacher, and refuses anybody who is neither. A
-- student is neither. The branch further down already says a submission the student owns is theirs
-- to write -- `student_owns_student_record(student_id)` -- but the role gate above returns first, so
-- that branch has never once been reached from a pupil's device.
--
-- The effect was invisible from inside the app. A turn-in is written to the device first, so the
-- child sees "ส่งแล้ว" immediately; the push that follows is refused, the queue row is marked
-- blocked, and nothing on any screen says so. On production every one of the twenty submission rows
-- still reads submitted_at = null: no work handed in by any pupil has ever reached the server, and
-- the teacher's tracking screen has been telling the truth about a server that never heard about it.
--
-- The owner check moves above the role gate, where it can be reached. Two things it must not let
-- through come with it:
--
--   * a mark. The upsert in `apply_sync_mutation` copies `score` and `teacher_note` straight out of
--     the payload, so a pupil's device that is allowed to write the row is a pupil's device that
--     could award itself a grade. On a student-owned write those columns are pinned to what the
--     server already holds -- along with the rest of the grading block, which is the teacher's.
--   * somebody else's work. `student_owns_student_record` compares against `auth.uid()`, so this
--     opens exactly one row per pupil and no more.

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
  v_previous public.submissions%rowtype;
begin
  -- No session: the trusted server, which authorised this write before making it. A browser always
  -- has one, so this cannot be reached by anybody the policies would have stopped.
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;

  row_json := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id := (row_json->>'school_id')::uuid;

  /*
   * Work a pupil hands in is theirs, and this is the only place that can say so before the role
   * gate below refuses them. Everything a teacher decides about that work -- the mark, the note,
   * the grade, who graded it and when -- is copied back from the stored row, so a device that is
   * trusted to say "I have handed this in" is not thereby trusted to say "and it scored 10".
   */
  if tg_table_name = 'submissions'
     and public.student_owns_student_record((row_json->>'student_id')::uuid) then
    if tg_op = 'DELETE' then
      -- A pupil withdraws a submission by rewriting its status, never by removing the row: the row
      -- is the teacher's record that the work was set for this child.
      raise exception 'FORBIDDEN: SUBMISSION_IS_NOT_DELETABLE' using errcode='42501';
    end if;
    select * into v_previous from public.submissions where id = new.id;
    if found then
      new.score := v_previous.score;
      new.teacher_note := v_previous.teacher_note;
      new.percentage := v_previous.percentage;
      new.calculated_grade := v_previous.calculated_grade;
      new.final_grade := v_previous.final_grade;
      new.grade_override_reason := v_previous.grade_override_reason;
      new.graded_by := v_previous.graded_by;
      new.graded_at := v_previous.graded_at;
      new.revision_note := v_previous.revision_note;
    else
      new.score := null;
      new.teacher_note := '';
      new.percentage := null;
      new.calculated_grade := null;
      new.final_grade := null;
      new.grade_override_reason := '';
      new.graded_by := null;
      new.graded_at := null;
    end if;
    return new;
  end if;

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
    select a.class_id,a.subject_id into v_class_id,v_subject_id from public.assignments a where a.id=v_parent_id;
    if not public.teacher_can_manage_subject_content(v_school_id,v_class_id,v_subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
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
  'Academic writes: a pupil owns their own submission (never its mark); a teacher owns their own subject; a trusted server call passes.';

commit;
