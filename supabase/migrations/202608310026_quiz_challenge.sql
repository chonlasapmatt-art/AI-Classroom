-- Quiz Challenge: a short review competition run live in one classroom.
--
-- It is not an exam and is deliberately not built like one. An exam is a window a student sits
-- inside on their own; a quiz is a teacher moving a room through questions together, one at a time,
-- with a countdown everybody can see. The differences that matter here all follow from that:
--
--   * The teacher, not the clock and not the student, decides when the next question starts.
--   * The countdown is the server's. A device whose clock is wrong, or whose owner set it forward,
--     changes nothing: `question_started_at` is stamped by the server and every deadline is derived
--     from it.
--   * An answer is final. Submitting twice is not two answers, it is the same answer arriving twice,
--     which is what happens on a classroom wifi — so the answer row is unique per participant per
--     question and a repeat returns what was already recorded.
--   * Points for the quiz are not marks. Nothing here writes to the gradebook. A teacher who wants
--     to award something for a good round does it afterwards as a separate, deliberate act, through
--     the score path the rest of the product already uses.
--
-- Correctness outweighs speed by construction. Speed can add at most a quarter of a question's
-- points, so a fast wrong answer never beats a slow right one and guessing early is not a strategy.

begin;

-- The score ledger learns one new source. Everything else about awarding points is unchanged: the
-- same table, the same audit, the same sync entity.
alter table public.score_events drop constraint if exists score_events_category_check;
alter table public.score_events add constraint score_events_category_check
  check (category in ('bonus','participation','assignment','activity','project','test','exam','quiz','manual','other'));
alter table public.score_events drop constraint if exists score_events_source_type_check;
alter table public.score_events add constraint score_events_source_type_check
  check (source_type in ('manual','board','assignment','activity','test','exam','quiz','import','system'));

-- ---------------------------------------------------------------------------
-- The session
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  class_id uuid not null references public.classes(id),
  subject_id uuid references public.subjects(id),
  title text not null default 'Quiz Challenge',
  status text not null default 'lobby' check (status in ('lobby','running','paused','ended')),
  -- Null means the teacher is not running a countdown at all, which is the right default for a
  -- discussion-shaped round.
  timer_seconds integer check (timer_seconds is null or timer_seconds between 5 and 600),
  scoring_mode text not null default 'accuracy' check (scoring_mode in ('accuracy','speed')),
  leaderboard_visible boolean not null default true,
  current_position integer not null default 0,
  -- Stamped by the server when a question is put on the board. Every deadline is derived from it.
  question_started_at timestamptz,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index if not exists quiz_sessions_class_idx
  on public.quiz_sessions(school_id, class_id, created_at desc);
-- One live session per class. Two rounds running in one room is a question about which board the
-- students are looking at, and there is no good answer.
create unique index if not exists quiz_sessions_one_live_per_class
  on public.quiz_sessions(class_id) where status in ('lobby','running','paused');

alter table public.quiz_sessions enable row level security;
revoke all on public.quiz_sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The questions, copied
-- ---------------------------------------------------------------------------
-- Same rule the exam follows: a question edited in the bank next week must not change what a class
-- answered this week, so composition copies rather than points.
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  source_question_id uuid references public.question_bank(id),
  position integer not null check (position between 1 and 100),
  question_type text not null,
  prompt text not null,
  choices jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  points numeric(6,2) not null default 1 check (points = points and points > 0),
  unique(session_id, position)
);
alter table public.quiz_questions enable row level security;
revoke all on public.quiz_questions from public, anon, authenticated;

comment on table public.quiz_questions is
  'A copy of each question as the round used it, answer key included. No browser session may read it.';

-- ---------------------------------------------------------------------------
-- Who is playing
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  display_name text not null default '',
  avatar_id text not null default '',
  score numeric(8,2) not null default 0,
  correct_count integer not null default 0,
  answered_count integer not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(session_id, student_id)
);
create index if not exists quiz_participants_board on public.quiz_participants(session_id, score desc);
alter table public.quiz_participants enable row level security;
revoke all on public.quiz_participants from public, anon, authenticated;

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  participant_id uuid not null references public.quiz_participants(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected jsonb not null default '[]'::jsonb,
  is_correct boolean not null default false,
  response_ms integer,
  awarded numeric(8,2) not null default 0,
  answered_at timestamptz not null default now(),
  -- The idempotency that matters: one answer per participant per question, so a retry on a bad
  -- connection cannot become a second answer or a second score.
  unique(session_id, participant_id, question_id)
);
alter table public.quiz_answers enable row level security;
revoke all on public.quiz_answers from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** Whether this caller may run this round: staff of the school that owns it. */
create or replace function public.can_run_quiz(p_session_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.quiz_sessions s
    where s.id = p_session_id and public.can_operate_school(s.school_id)
  );
$$;

/**
 * When the question currently on the board stops accepting answers.
 *
 * Derived from the server's own stamp rather than stored, so pausing, resuming and a client with a
 * wrong clock all reach the same answer.
 */
create or replace function public.quiz_deadline(p_session public.quiz_sessions)
returns timestamptz language sql immutable as $$
  select case
    when p_session.timer_seconds is null or p_session.question_started_at is null then null
    else p_session.question_started_at + make_interval(secs => p_session.timer_seconds)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Building and running a round
-- ---------------------------------------------------------------------------

/**
 * Creates a round from questions the teacher picked, copying each one.
 *
 * The order given is the order asked. Random and difficulty-balanced selection are choices the
 * screen makes before calling this — the server's job is to fix the paper, not to shuffle it, so
 * that what was asked is exactly what the record says was asked.
 */
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
      jsonb_build_object('classId', p_class_id, 'questions', position, 'timerSeconds', p_timer_seconds,
        'scoringMode', p_scoring_mode));

  return jsonb_build_object('sessionId', session_id, 'questionCount', position);
end $$;

/** Moves the round: start it, show the next question, pause, resume or finish. */
create or replace function public.control_quiz_session(p_session_id uuid, p_command text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  session public.quiz_sessions%rowtype;
  total integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(session.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if session.status = 'ended' then raise exception 'QUIZ_ENDED' using errcode='42501'; end if;

  select count(*) into total from public.quiz_questions where session_id = session.id;

  if p_command = 'start' then
    update public.quiz_sessions set status='running', current_position=1,
      question_started_at=clock_timestamp(), started_at=coalesce(started_at, clock_timestamp())
      where id=session.id returning * into session;
  elsif p_command = 'next' then
    if session.current_position >= total then
      update public.quiz_sessions set status='ended', ended_at=clock_timestamp()
        where id=session.id returning * into session;
    else
      update public.quiz_sessions set status='running', current_position=session.current_position + 1,
        question_started_at=clock_timestamp() where id=session.id returning * into session;
    end if;
  elsif p_command = 'pause' then
    update public.quiz_sessions set status='paused' where id=session.id returning * into session;
  elsif p_command = 'resume' then
    -- Resuming restarts the countdown rather than resuming it part-used: a class that was
    -- interrupted has stopped reading the question, and giving them four seconds is not a round.
    update public.quiz_sessions set status='running', question_started_at=clock_timestamp()
      where id=session.id returning * into session;
  elsif p_command = 'end' then
    update public.quiz_sessions set status='ended', ended_at=clock_timestamp()
      where id=session.id returning * into session;
  else
    raise exception 'VALIDATION_ERROR: command';
  end if;

  return jsonb_build_object('sessionId', session.id, 'status', session.status,
    'currentPosition', session.current_position, 'questionCount', total,
    'questionStartedAt', session.question_started_at, 'serverTime', clock_timestamp());
end $$;

-- ---------------------------------------------------------------------------
-- The teacher's board
-- ---------------------------------------------------------------------------

/**
 * Everything on the board, in one call.
 *
 * The answer key is included because this is the teacher's screen and the room is looking at it —
 * but only for the question currently up, so a screenshot of the board never leaks the rest of the
 * round.
 */
create or replace function public.quiz_board(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  session public.quiz_sessions%rowtype;
  current_question public.quiz_questions%rowtype;
  total integer;
  joined integer;
  answered integer := 0;
  correct integer := 0;
begin
  if not public.can_run_quiz(p_session_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select count(*) into total from public.quiz_questions where session_id=session.id;
  select count(*) into joined from public.quiz_participants where session_id=session.id;
  select * into current_question from public.quiz_questions
    where session_id=session.id and position=session.current_position;

  if current_question.id is not null then
    select count(*), count(*) filter (where a.is_correct)
      into answered, correct
      from public.quiz_answers a where a.question_id=current_question.id;
  end if;

  return jsonb_build_object(
    'sessionId', session.id, 'title', session.title, 'status', session.status,
    'classId', session.class_id, 'subjectId', session.subject_id,
    'scoringMode', session.scoring_mode, 'leaderboardVisible', session.leaderboard_visible,
    'timerSeconds', session.timer_seconds,
    'currentPosition', session.current_position, 'questionCount', total,
    'questionStartedAt', session.question_started_at,
    'deadline', public.quiz_deadline(session),
    'serverTime', now(),
    'participants', joined, 'answered', answered, 'correct', correct,
    'question', case when current_question.id is null then null else jsonb_build_object(
      'id', current_question.id, 'position', current_question.position,
      'questionType', current_question.question_type, 'prompt', current_question.prompt,
      'choices', current_question.choices, 'answerKey', current_question.answer_key,
      'explanation', current_question.explanation, 'points', current_question.points) end,
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object('participantId', p.id, 'displayName', p.display_name,
        'avatarId', p.avatar_id, 'score', p.score, 'correct', p.correct_count,
        'answered', p.answered_count) order by p.score desc, p.correct_count desc, p.joined_at)
      from public.quiz_participants p where p.session_id=session.id
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- The student's side
-- ---------------------------------------------------------------------------

/**
 * The round waiting for this student, if there is one.
 *
 * A student already signed in and enrolled in the class does not type a code to join something
 * happening in the room they are sitting in. The enrolment is the invitation.
 */
create or replace function public.quiz_waiting_for_me()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); student public.students%rowtype; session public.quiz_sessions%rowtype;
begin
  if actor is null then return jsonb_build_object('waiting', false); end if;
  select * into student from public.students where profile_id=actor and deleted_at is null limit 1;
  if not found then return jsonb_build_object('waiting', false); end if;

  select s.* into session from public.quiz_sessions s
    join public.student_class_enrollments e
      on e.class_id = s.class_id and e.student_id = student.id and e.status='active' and e.deleted_at is null
    where s.status in ('lobby','running','paused')
    order by s.created_at desc limit 1;
  if not found then return jsonb_build_object('waiting', false); end if;

  return jsonb_build_object('waiting', true, 'sessionId', session.id, 'title', session.title,
    'status', session.status,
    'joined', exists(select 1 from public.quiz_participants p
      where p.session_id=session.id and p.student_id=student.id));
end $$;

/** Joins the round. Joining twice is joining once — a refresh must not create a second player. */
create or replace function public.join_quiz(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  student public.students%rowtype;
  session public.quiz_sessions%rowtype;
  participant public.quiz_participants%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if session.status = 'ended' then raise exception 'QUIZ_ENDED' using errcode='42501'; end if;

  select * into student from public.students
    where profile_id=actor and school_id=session.school_id and deleted_at is null limit 1;
  if not found then raise exception 'QUIZ_NOT_FOR_YOU' using errcode='42501'; end if;
  if not exists(
    select 1 from public.student_class_enrollments e
    where e.class_id=session.class_id and e.student_id=student.id and e.status='active' and e.deleted_at is null
  ) then raise exception 'QUIZ_NOT_FOR_YOU' using errcode='42501'; end if;

  insert into public.quiz_participants(session_id, school_id, student_id, display_name, avatar_id)
    values(session.id, session.school_id, student.id, student.display_name,
      coalesce(student.avatar_id::text, ''))
  on conflict(session_id, student_id) do update set last_seen_at=clock_timestamp()
  returning * into participant;

  return jsonb_build_object('participantId', participant.id, 'displayName', participant.display_name,
    'score', participant.score);
end $$;

/**
 * The question as a student may see it: no answer key, and only the one that is up.
 *
 * Stripping happens here rather than in the client, because a key sent to the device is a key one
 * developer-tools panel away from the whole room.
 */
create or replace function public.quiz_view(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  student public.students%rowtype;
  session public.quiz_sessions%rowtype;
  participant public.quiz_participants%rowtype;
  current_question public.quiz_questions%rowtype;
  answered public.quiz_answers%rowtype;
  total integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where profile_id=actor and school_id=session.school_id
    and deleted_at is null limit 1;
  if not found then raise exception 'QUIZ_NOT_FOR_YOU' using errcode='42501'; end if;
  select * into participant from public.quiz_participants
    where session_id=session.id and student_id=student.id;
  if not found then raise exception 'QUIZ_NOT_JOINED' using errcode='42501'; end if;

  select count(*) into total from public.quiz_questions where session_id=session.id;
  select * into current_question from public.quiz_questions
    where session_id=session.id and position=session.current_position;
  if current_question.id is not null then
    select * into answered from public.quiz_answers
      where session_id=session.id and participant_id=participant.id and question_id=current_question.id;
  end if;

  return jsonb_build_object(
    'sessionId', session.id, 'title', session.title, 'status', session.status,
    'currentPosition', session.current_position, 'questionCount', total,
    'serverTime', now(), 'deadline', public.quiz_deadline(session),
    'leaderboardVisible', session.leaderboard_visible,
    'me', jsonb_build_object('participantId', participant.id, 'displayName', participant.display_name,
      'score', participant.score, 'correct', participant.correct_count,
      'answered', participant.answered_count),
    'question', case when current_question.id is null or session.status = 'lobby' then null
      else jsonb_build_object('id', current_question.id, 'position', current_question.position,
        'questionType', current_question.question_type, 'prompt', current_question.prompt,
        'choices', current_question.choices, 'points', current_question.points) end,
    -- What they already sent, so a refresh shows their answer rather than an empty question.
    'myAnswer', case when answered.id is null then null else jsonb_build_object(
      'selected', answered.selected, 'isCorrect', answered.is_correct, 'awarded', answered.awarded) end
  );
end $$;

/**
 * Records one answer and scores it, once.
 *
 * Marking happens here because the device must never be told what the right answer was before the
 * question closes. The score is the question's points for a correct answer, plus at most a quarter
 * of them for speed when the round is in speed mode — a margin small enough that a fast wrong answer
 * never beats a slow right one.
 *
 * A late answer is refused rather than silently dropped, and a repeat returns the first answer
 * unchanged: on classroom wifi a submission arriving twice is one answer, not two.
 */
create or replace function public.submit_quiz_answer(
  p_session_id uuid, p_question_id uuid, p_selected jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  student public.students%rowtype;
  session public.quiz_sessions%rowtype;
  participant public.quiz_participants%rowtype;
  question public.quiz_questions%rowtype;
  existing public.quiz_answers%rowtype;
  deadline timestamptz;
  server_now timestamptz := clock_timestamp();
  elapsed_ms integer;
  correct boolean;
  awarded numeric := 0;
  speed_share numeric;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where profile_id=actor and school_id=session.school_id
    and deleted_at is null limit 1;
  if not found then raise exception 'QUIZ_NOT_FOR_YOU' using errcode='42501'; end if;
  select * into participant from public.quiz_participants
    where session_id=session.id and student_id=student.id for update;
  if not found then raise exception 'QUIZ_NOT_JOINED' using errcode='42501'; end if;

  select * into existing from public.quiz_answers
    where session_id=session.id and participant_id=participant.id and question_id=p_question_id;
  if found then
    return jsonb_build_object('recorded', true, 'alreadyAnswered', true,
      'isCorrect', existing.is_correct, 'awarded', existing.awarded);
  end if;

  select * into question from public.quiz_questions where id=p_question_id and session_id=session.id;
  if not found then raise exception 'NOT_FOUND: question'; end if;
  if question.position <> session.current_position then
    raise exception 'QUIZ_QUESTION_CLOSED' using errcode='42501';
  end if;
  if session.status <> 'running' then raise exception 'QUIZ_NOT_RUNNING' using errcode='42501'; end if;

  deadline := public.quiz_deadline(session);
  if deadline is not null and server_now > deadline then
    raise exception 'QUIZ_TIME_UP' using errcode='42501';
  end if;

  elapsed_ms := greatest(0, (extract(epoch from (server_now - session.question_started_at)) * 1000)::integer);
  correct := coalesce(p_selected, '[]'::jsonb) = question.answer_key;

  if correct then
    awarded := question.points;
    if session.scoring_mode = 'speed' and session.timer_seconds is not null then
      -- Fraction of the window still unused, capped so speed can add a quarter at most.
      speed_share := greatest(0, 1 - (elapsed_ms::numeric / (session.timer_seconds * 1000)));
      awarded := awarded + round(question.points * speed_share * 0.25, 2);
    end if;
  end if;

  insert into public.quiz_answers(session_id, participant_id, question_id, selected, is_correct,
    response_ms, awarded)
    values(session.id, participant.id, question.id, coalesce(p_selected,'[]'::jsonb), correct,
      elapsed_ms, awarded);

  update public.quiz_participants set
    score = score + awarded,
    correct_count = correct_count + case when correct then 1 else 0 end,
    answered_count = answered_count + 1,
    last_seen_at = server_now
  where id = participant.id;

  return jsonb_build_object('recorded', true, 'alreadyAnswered', false,
    'isCorrect', correct, 'awarded', awarded, 'explanation', question.explanation);
end $$;

-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------

create or replace function public.quiz_results(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare session public.quiz_sessions%rowtype; total integer;
begin
  if not public.can_run_quiz(p_session_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into total from public.quiz_questions where session_id=session.id;

  return jsonb_build_object(
    'sessionId', session.id, 'title', session.title, 'status', session.status,
    'classId', session.class_id, 'subjectId', session.subject_id, 'questionCount', total,
    'bonusAwarded', exists(
      select 1 from public.score_events e
      where e.source_type='quiz' and e.source_id=session.id and e.deleted_at is null),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object('participantId', p.id, 'studentId', p.student_id,
        'displayName', p.display_name, 'avatarId', p.avatar_id, 'score', p.score,
        'correct', p.correct_count, 'answered', p.answered_count,
        'accuracy', case when total = 0 then 0 else round(p.correct_count::numeric / total, 4) end)
        order by p.score desc, p.correct_count desc, p.joined_at)
      from public.quiz_participants p where p.session_id=session.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('position', q.position, 'prompt', q.prompt,
        'answered', (select count(*) from public.quiz_answers a where a.question_id=q.id),
        'correct', (select count(*) from public.quiz_answers a where a.question_id=q.id and a.is_correct))
        order by q.position)
      from public.quiz_questions q where q.session_id=session.id
    ), '[]'::jsonb)
  );
end $$;

/**
 * Turns a round into a small bonus on the gradebook, when the teacher says so.
 *
 * Quiz points are not marks and never become marks by themselves. This is the deliberate second act
 * that makes some of them count, it writes through the same score ledger as every other award, and
 * it refuses to run twice for the same round — a teacher pressing the button again after a slow
 * response must not double a class's bonus.
 */
create or replace function public.award_quiz_bonus(
  p_session_id uuid, p_awards jsonb, p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  session public.quiz_sessions%rowtype;
  award jsonb;
  student_id uuid;
  points numeric;
  written integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(session.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.score_events e
    where e.source_type='quiz' and e.source_id=session.id and e.deleted_at is null) then
    raise exception 'QUIZ_BONUS_ALREADY_AWARDED' using errcode='42501';
  end if;

  for award in select * from jsonb_array_elements(coalesce(p_awards,'[]'::jsonb)) loop
    student_id := (award->>'studentId')::uuid;
    points := coalesce((award->>'points')::numeric, 0);
    if student_id is null or points = 0 then continue; end if;
    if points < -10 or points > 10 then raise exception 'VALIDATION_ERROR: bonus out of range'; end if;
    if not exists(select 1 from public.quiz_participants p
      where p.session_id=session.id and p.student_id=student_id) then continue; end if;

    insert into public.score_events(school_id, student_id, class_id, subject_id, category, points,
      reason, source_type, source_id, awarded_by)
      values(session.school_id, student_id, session.class_id, session.subject_id, 'quiz', points,
        left(coalesce(nullif(trim(p_reason),''), 'คะแนนพิเศษจาก ' || session.title), 400),
        'quiz', session.id, actor);
    written := written + 1;
  end loop;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(session.school_id, actor, 'QUIZ_BONUS_AWARDED', 'quiz_session', session.id,
      jsonb_build_object('students', written, 'reason', trim(p_reason)));

  return jsonb_build_object('sessionId', session.id, 'awarded', written);
end $$;

/** Rounds this class has run, for the screen that offers to reopen or review one. */
create or replace function public.recent_quiz_sessions(p_school_id uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sessionId', s.id, 'title', s.title, 'status', s.status,
      'classId', s.class_id, 'subjectId', s.subject_id, 'createdAt', s.created_at,
      'endedAt', s.ended_at,
      'questionCount', (select count(*) from public.quiz_questions q where q.session_id=s.id),
      'participants', (select count(*) from public.quiz_participants p where p.session_id=s.id))
      order by s.created_at desc)
    from (select * from public.quiz_sessions where school_id=p_school_id
          order by created_at desc limit least(coalesce(p_limit,20), 100)) s
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Every table stays unreadable from a browser. The round is played entirely through these functions,
-- which is what keeps the answer key on the server.

revoke all on function public.can_run_quiz(uuid) from public,anon;
revoke all on function public.create_quiz_session(uuid,uuid,uuid,text,uuid[],integer,text,boolean) from public,anon;
revoke all on function public.control_quiz_session(uuid,text) from public,anon;
revoke all on function public.quiz_board(uuid) from public,anon;
revoke all on function public.quiz_waiting_for_me() from public,anon;
revoke all on function public.join_quiz(uuid) from public,anon;
revoke all on function public.quiz_view(uuid) from public,anon;
revoke all on function public.submit_quiz_answer(uuid,uuid,jsonb) from public,anon;
revoke all on function public.quiz_results(uuid) from public,anon;
revoke all on function public.award_quiz_bonus(uuid,jsonb,text) from public,anon;
revoke all on function public.recent_quiz_sessions(uuid,integer) from public,anon;

grant execute on function public.can_run_quiz(uuid) to authenticated;
grant execute on function public.create_quiz_session(uuid,uuid,uuid,text,uuid[],integer,text,boolean) to authenticated;
grant execute on function public.control_quiz_session(uuid,text) to authenticated;
grant execute on function public.quiz_board(uuid) to authenticated;
grant execute on function public.quiz_waiting_for_me() to authenticated;
grant execute on function public.join_quiz(uuid) to authenticated;
grant execute on function public.quiz_view(uuid) to authenticated;
grant execute on function public.submit_quiz_answer(uuid,uuid,jsonb) to authenticated;
grant execute on function public.quiz_results(uuid) to authenticated;
grant execute on function public.award_quiz_bonus(uuid,jsonb,text) to authenticated;
grant execute on function public.recent_quiz_sessions(uuid,integer) to authenticated;

comment on function public.submit_quiz_answer(uuid,uuid,jsonb) is
  'Records and marks one answer. Unique per participant per question, so a retry is not a second answer.';
comment on function public.award_quiz_bonus(uuid,jsonb,text) is
  'The deliberate second act that turns quiz points into a small gradebook bonus. Refuses to run twice.';

commit;
