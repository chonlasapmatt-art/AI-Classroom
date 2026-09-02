-- A round with no subject could be played and never scored.
--
-- The screen offered "ทุกรายวิชา" and passed no subject, so the round's score events carried none
-- either — and a score event with no subject has no owner, which is exactly what
-- `guard_teacher_academic_scope` requires before a teacher may write one. The teacher ran the round,
-- the children answered, and awarding the points was refused with `SUBJECT_OWNER_REQUIRED`. There was
-- no way to fix it afterwards: the round's subject is fixed when it is created.
--
-- A round now belongs to a subject. That is the same rule the question bank, the marks and every
-- other academic record already follow — a mark exists in a subject or it is not a mark a gradebook
-- can hold — and it is the one that makes the points landing at the end possible.

begin;

create or replace function public.create_quiz_session(
  p_school_id uuid, p_class_id uuid, p_subject_id uuid, p_title text,
  p_question_ids uuid[], p_timer_seconds integer, p_scoring_mode text, p_leaderboard_visible boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  session_id uuid;
  question public.question_bank%rowtype;
  question_id uuid;
  position integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.classes c where c.id=p_class_id and c.school_id=p_school_id) then
    raise exception 'NOT_FOUND: class';
  end if;
  -- The subject is what makes the points awardable at the end, so it is asked for at the start.
  if p_subject_id is null then raise exception 'QUIZ_SUBJECT_REQUIRED'; end if;
  if not exists(select 1 from public.subjects s
    where s.id=p_subject_id and s.school_id=p_school_id and s.status='active') then
    raise exception 'NOT_FOUND: subject';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then raise exception 'VALIDATION_ERROR: no questions'; end if;
  if p_scoring_mode not in ('accuracy','speed') then raise exception 'VALIDATION_ERROR: scoring'; end if;

  -- A round left open from last lesson would take this one's place in the unique index, and the
  -- teacher standing in front of the class cannot debug that. Close it.
  update public.quiz_sessions set status='ended', ended_at=clock_timestamp()
    where class_id=p_class_id and status in ('lobby','running','paused');

  insert into public.quiz_sessions(school_id, class_id, subject_id, title, timer_seconds,
    scoring_mode, leaderboard_visible, created_by)
    values(p_school_id, p_class_id, p_subject_id,
      left(coalesce(nullif(trim(p_title),''),'Quiz Challenge'),120),
      p_timer_seconds, p_scoring_mode, coalesce(p_leaderboard_visible, true), actor)
    returning id into session_id;

  foreach question_id in array p_question_ids loop
    select * into question from public.question_bank
      where id=question_id and school_id=p_school_id and status='active' and deleted_at is null;
    if not found then continue; end if;
    position := position + 1;
    insert into public.quiz_questions(session_id, source_question_id, position, question_type,
      prompt, choices, answer_key, explanation, points)
      values(session_id, question.id, position, question.question_type, question.prompt,
        question.choices, question.answer_key, question.explanation, question.points);
  end loop;

  if position = 0 then raise exception 'VALIDATION_ERROR: no usable questions'; end if;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, actor, 'QUIZ_SESSION_CREATED', 'quiz_session', session_id,
      jsonb_build_object('classId', p_class_id, 'subjectId', p_subject_id, 'questions', position,
        'timerSeconds', p_timer_seconds, 'scoringMode', p_scoring_mode));

  return jsonb_build_object('sessionId', session_id, 'questionCount', position);
end $$;

comment on function public.create_quiz_session(uuid,uuid,uuid,text,uuid[],integer,text,boolean) is
  'Opens a round. The subject is required: it is what lets the round''s points become marks.';

commit;
