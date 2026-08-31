-- Repairs `award_quiz_bonus`, which could not run.
--
-- It declared a variable called `student_id` and then filtered a table that has a column of that
-- name, so `where p.student_id = student_id` is a comparison Postgres refuses to guess at: 42702,
-- every time, which meant a teacher could finish a round and never turn any of it into marks.
--
-- This is the third time this shape of mistake has appeared in this schema, so the fix is the one
-- that generalises: the variables are named for what they are rather than for the column they came
-- from, and every column reference carries its table.

begin;

create or replace function public.award_quiz_bonus(
  p_session_id uuid, p_awards jsonb, p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  session public.quiz_sessions%rowtype;
  award jsonb;
  target_student uuid;
  award_points numeric;
  written integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where public.quiz_sessions.id = p_session_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(session.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(
    select 1 from public.score_events e
    where e.source_type = 'quiz' and e.source_id = session.id and e.deleted_at is null
  ) then
    raise exception 'QUIZ_BONUS_ALREADY_AWARDED' using errcode='42501';
  end if;

  for award in select * from jsonb_array_elements(coalesce(p_awards, '[]'::jsonb)) loop
    target_student := (award->>'studentId')::uuid;
    award_points := coalesce((award->>'points')::numeric, 0);
    if target_student is null or award_points = 0 then continue; end if;
    if award_points < -10 or award_points > 10 then
      raise exception 'VALIDATION_ERROR: bonus out of range';
    end if;
    -- Only somebody who actually played. A student id sent by a client that guessed would otherwise
    -- receive marks for a round they were not in.
    if not exists(
      select 1 from public.quiz_participants p
      where p.session_id = session.id and p.student_id = target_student
    ) then continue; end if;

    insert into public.score_events(school_id, student_id, class_id, subject_id, category, points,
      reason, source_type, source_id, awarded_by)
      values(session.school_id, target_student, session.class_id, session.subject_id, 'quiz',
        award_points,
        left(coalesce(nullif(trim(p_reason), ''), 'คะแนนพิเศษจาก ' || session.title), 400),
        'quiz', session.id, actor);
    written := written + 1;
  end loop;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(session.school_id, actor, 'QUIZ_BONUS_AWARDED', 'quiz_session', session.id,
      jsonb_build_object('students', written, 'reason', trim(p_reason)));

  return jsonb_build_object('sessionId', session.id, 'awarded', written);
end $$;

commit;
