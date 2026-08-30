-- Scheduled exams and the question bank they are built from.
--
-- Two rules shape everything here.
--
-- The first is that an exam opens and closes on the server's clock. A student's device clock is
-- theirs to change, so it decides nothing: the window, the countdown and the refusal all come from
-- `exam_access`, which reads now() on the server and is the only thing the client asks.
--
-- The second is that a question bank is staff material. Students and parents are not given a
-- narrower view of it — they are given none, at the grant level, so a direct API call fails the same
-- way a hidden route would. Answer keys live in the same table and inherit that.
--
-- Exams keep a snapshot of every question they use. Editing a bank question later must not silently
-- change what somebody already sat, so composition copies the content rather than pointing at it.

begin;

-- ---------------------------------------------------------------------------
-- Scheduling on the existing test record
-- ---------------------------------------------------------------------------
alter table public.tests
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists duration_minutes integer,
  add column if not exists attempt_limit integer not null default 1,
  add column if not exists instructions text not null default '',
  add column if not exists exam_kind text not null default 'test';

alter table public.tests drop constraint if exists tests_exam_kind_check;
alter table public.tests add constraint tests_exam_kind_check
  check (exam_kind in ('test','quiz','midterm','final','practice'));
alter table public.tests drop constraint if exists tests_window_check;
alter table public.tests add constraint tests_window_check
  check (opens_at is null or closes_at is null or closes_at > opens_at);
alter table public.tests drop constraint if exists tests_duration_check;
alter table public.tests add constraint tests_duration_check
  check (duration_minutes is null or duration_minutes between 1 and 600);
alter table public.tests drop constraint if exists tests_attempts_check;
alter table public.tests add constraint tests_attempts_check
  check (attempt_limit between 1 and 20);

/**
 * The state an exam is in, derived from its schedule and its explicit status rather than stored.
 *
 * Storing it would mean a row that says "open" hours after it closed, because nothing runs at the
 * moment a window ends. Deriving it means the answer is correct whenever it is asked.
 */
create or replace function public.exam_state(
  p_status text, p_opens_at timestamptz, p_closes_at timestamptz, p_now timestamptz default now()
) returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_status = 'draft' then 'draft'
    when p_status = 'archived' then 'archived'
    when p_status = 'closed' then 'closed'
    when p_status = 'published' then 'published'
    when p_opens_at is not null and p_now < p_opens_at then 'scheduled'
    when p_closes_at is not null and p_now > p_closes_at then 'grading'
    when p_opens_at is null and p_closes_at is null then 'open'
    else 'open'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  subject_id uuid references public.subjects(id),
  grade_level text not null default '',
  unit text not null default '',
  topic text not null default '',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  question_type text not null default 'multiple_choice'
    check (question_type in ('multiple_choice','multiple_select','true_false','short_answer')),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  -- [{ "id": "a", "text": "…" }]; empty for short answer.
  choices jsonb not null default '[]'::jsonb,
  -- ["a"] for one answer, ["a","c"] for several, ["คำตอบ"] for short answer.
  answer_key jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  points numeric(6,2) not null default 1 check (points = points and points > 0 and points <= 1000),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists question_bank_school_idx on public.question_bank(school_id, subject_id, status);
create index if not exists question_bank_search_idx on public.question_bank(school_id, grade_level, unit, difficulty);

alter table public.question_bank enable row level security;

-- Staff only, and stated as a grant rather than as a policy alone: a student or parent calling the
-- API directly is refused by privilege, not by a policy that has to be written correctly forever.
revoke all on public.question_bank from public, anon, authenticated;
grant select on public.question_bank to authenticated;
drop policy if exists question_bank_staff_read on public.question_bank;
create policy question_bank_staff_read on public.question_bank for select to authenticated
  using (public.has_school_role(school_id,'admin') or public.is_verified_teacher(school_id,(select auth.uid())));

comment on table public.question_bank is
  'Teacher and admin material, answer keys included. Students and parents have no read path to it.';

-- ---------------------------------------------------------------------------
-- Exam composition: a snapshot, never a pointer
-- ---------------------------------------------------------------------------
create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  test_id uuid not null references public.tests(id) on delete cascade,
  -- Where it came from, for reporting. The content below is what the exam actually uses.
  source_question_id uuid references public.question_bank(id),
  position integer not null check (position between 1 and 500),
  question_type text not null,
  prompt text not null,
  choices jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  points numeric(6,2) not null default 1 check (points = points and points > 0),
  created_at timestamptz not null default now(),
  unique(test_id, position)
);
create index if not exists exam_questions_test_idx on public.exam_questions(test_id, position);

alter table public.exam_questions enable row level security;
revoke all on public.exam_questions from public, anon, authenticated;
grant select on public.exam_questions to authenticated;

-- Staff see the whole question. A student sitting the exam reads it through take_exam below, which
-- strips the answer key; this policy is what stops them reading the table directly.
drop policy if exists exam_questions_staff_read on public.exam_questions;
create policy exam_questions_staff_read on public.exam_questions for select to authenticated
  using (public.has_school_role(school_id,'admin') or public.is_verified_teacher(school_id,(select auth.uid())));

comment on table public.exam_questions is
  'A copy of each question as the exam used it. Editing the bank afterwards never rewrites a sat paper.';

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  test_id uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.students(id),
  attempt_number integer not null default 1,
  -- Both stamped from the server clock. The countdown a student sees is derived from these.
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  submitted_reason text check (submitted_reason in ('student','timeout','staff')),
  answers jsonb not null default '{}'::jsonb,
  auto_score numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(test_id, student_id, attempt_number)
);
create index if not exists exam_attempts_student_idx on public.exam_attempts(school_id, student_id, test_id);

alter table public.exam_attempts enable row level security;
revoke all on public.exam_attempts from public, anon, authenticated;
grant select on public.exam_attempts to authenticated;

drop policy if exists exam_attempts_scoped_read on public.exam_attempts;
create policy exam_attempts_scoped_read on public.exam_attempts for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.is_verified_teacher(school_id,(select auth.uid()))
  or public.student_owns_student_record(student_id)
  or (public.parent_has_active_link(student_id) and public.parent_has_active_consent(student_id))
);

-- ---------------------------------------------------------------------------
-- The one question a student's device may ask about time
-- ---------------------------------------------------------------------------

/**
 * What this person may do with this exam, right now, according to the server.
 *
 * The client renders whatever this returns and never computes the window itself. A device clock set
 * forward or back changes nothing, because no part of the decision is taken on the device.
 */
create or replace function public.exam_access(p_test_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  exam public.tests%rowtype;
  actor uuid := auth.uid();
  student public.students%rowtype;
  attempt public.exam_attempts%rowtype;
  state text;
  used integer := 0;
  server_now timestamptz := now();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into exam from public.tests where id=p_test_id and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_active_member(exam.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  state := public.exam_state(exam.status, exam.opens_at, exam.closes_at, server_now);

  select * into student from public.students
    where school_id=exam.school_id and profile_id=actor and deleted_at is null limit 1;

  if found then
    select count(*) into used from public.exam_attempts
      where test_id=exam.id and student_id=student.id;
    select * into attempt from public.exam_attempts
      where test_id=exam.id and student_id=student.id and submitted_at is null
      order by attempt_number desc limit 1;
  end if;

  return jsonb_build_object(
    'testId', exam.id,
    'serverTime', server_now,
    'state', state,
    'opensAt', exam.opens_at,
    'closesAt', exam.closes_at,
    'durationMinutes', exam.duration_minutes,
    'attemptLimit', exam.attempt_limit,
    'attemptsUsed', used,
    'canStart', state='open' and student.id is not null and used < exam.attempt_limit and attempt.id is null,
    'activeAttemptId', attempt.id,
    'expiresAt', attempt.expires_at,
    'questionCount', (select count(*) from public.exam_questions where test_id=exam.id)
  );
end $$;

/**
 * Opens an attempt. The start time and the expiry are written here, from the server clock, so a
 * refresh or a restart resumes the same countdown instead of granting a fresh one.
 */
create or replace function public.start_exam_attempt(p_test_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  exam public.tests%rowtype;
  actor uuid := auth.uid();
  student public.students%rowtype;
  attempt public.exam_attempts%rowtype;
  used integer;
  server_now timestamptz := now();
  deadline timestamptz;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into exam from public.tests where id=p_test_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students
    where school_id=exam.school_id and profile_id=actor and deleted_at is null limit 1;
  if not found then raise exception 'EXAM_NOT_FOR_YOU' using errcode='42501'; end if;
  if public.exam_state(exam.status, exam.opens_at, exam.closes_at, server_now) <> 'open' then
    raise exception 'EXAM_CLOSED' using errcode='42501';
  end if;

  -- An attempt already running is resumed, never restarted: that is what makes a refresh safe.
  select * into attempt from public.exam_attempts
    where test_id=exam.id and student_id=student.id and submitted_at is null
    order by attempt_number desc limit 1;
  if found then
    return jsonb_build_object('attemptId',attempt.id,'startedAt',attempt.started_at,
      'expiresAt',attempt.expires_at,'serverTime',server_now,'resumed',true);
  end if;

  select count(*) into used from public.exam_attempts where test_id=exam.id and student_id=student.id;
  if used >= exam.attempt_limit then raise exception 'EXAM_ATTEMPTS_EXHAUSTED' using errcode='42501'; end if;

  deadline := least(
    coalesce(server_now + make_interval(mins => exam.duration_minutes), coalesce(exam.closes_at, server_now + interval '365 days')),
    coalesce(exam.closes_at, server_now + interval '365 days')
  );

  insert into public.exam_attempts(school_id,test_id,student_id,attempt_number,started_at,expires_at)
    values(exam.school_id,exam.id,student.id,used+1,server_now,deadline)
    returning * into attempt;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(exam.school_id,actor,'EXAM_ATTEMPT_STARTED','exam_attempt',attempt.id,student.id,
      jsonb_build_object('testId',exam.id,'attemptNumber',attempt.attempt_number));

  return jsonb_build_object('attemptId',attempt.id,'startedAt',attempt.started_at,
    'expiresAt',attempt.expires_at,'serverTime',server_now,'resumed',false);
end $$;

/**
 * Records answers and, when asked or when the time is up, closes the attempt.
 *
 * Submitting late is not refused outright — a network stall must not lose a paper — but the server
 * records why it closed, and an attempt whose deadline has passed is closed as a timeout whatever
 * the client believed.
 */
create or replace function public.submit_exam_attempt(
  p_attempt_id uuid, p_answers jsonb, p_final boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  attempt public.exam_attempts%rowtype;
  actor uuid := auth.uid();
  student public.students%rowtype;
  server_now timestamptz := now();
  expired boolean;
  earned numeric := 0;
  question record;
  given jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into attempt from public.exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where id=attempt.student_id;
  if student.profile_id is distinct from actor then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if attempt.submitted_at is not null then
    return jsonb_build_object('attemptId',attempt.id,'submittedAt',attempt.submitted_at,'alreadySubmitted',true);
  end if;

  expired := attempt.expires_at is not null and server_now > attempt.expires_at;

  update public.exam_attempts set
    answers = coalesce(p_answers,'{}'::jsonb),
    submitted_at = case when p_final or expired then server_now else null end,
    submitted_reason = case when expired then 'timeout' when p_final then 'student' else null end,
    updated_at = server_now
  where id=attempt.id returning * into attempt;

  -- Objective questions are marked here so a teacher starts from a total rather than from zero.
  if attempt.submitted_at is not null then
    for question in
      select id, question_type, answer_key, points from public.exam_questions where test_id=attempt.test_id
    loop
      given := attempt.answers -> question.id::text;
      if given is not null and question.question_type in ('multiple_choice','true_false','multiple_select')
        and given = question.answer_key then
        earned := earned + question.points;
      end if;
    end loop;
    update public.exam_attempts set auto_score=earned where id=attempt.id;
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(attempt.school_id,actor,'EXAM_ATTEMPT_SUBMITTED','exam_attempt',attempt.id,attempt.student_id,
        jsonb_build_object('testId',attempt.test_id,'reason',attempt.submitted_reason,'autoScore',earned));
  end if;

  return jsonb_build_object('attemptId',attempt.id,'submittedAt',attempt.submitted_at,
    'reason',attempt.submitted_reason,'autoScore',case when attempt.submitted_at is null then null else earned end,
    'serverTime',server_now);
end $$;

/**
 * The paper as a student may see it: the questions in order, with the answer key removed.
 *
 * Stripping happens on the server. Sending the key and hiding it in the client would put every
 * answer one developer-tools panel away from the class.
 */
create or replace function public.take_exam(p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare attempt public.exam_attempts%rowtype; student public.students%rowtype; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into attempt from public.exam_attempts where id=p_attempt_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where id=attempt.student_id;
  if student.profile_id is distinct from actor then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'attemptId',attempt.id,
    'expiresAt',attempt.expires_at,
    'serverTime',now(),
    'answers',attempt.answers,
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object('id',q.id,'position',q.position,'questionType',q.question_type,
        'prompt',q.prompt,'choices',q.choices,'points',q.points) order by q.position)
      from public.exam_questions q where q.test_id=attempt.test_id
    ),'[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Staff writes
-- ---------------------------------------------------------------------------

create or replace function public.save_bank_question(
  p_school_id uuid, p_question_id uuid, p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_payload->>'prompt'),'')='' then raise exception 'VALIDATION_ERROR'; end if;

  insert into public.question_bank(id,school_id,subject_id,grade_level,unit,topic,difficulty,question_type,
    prompt,choices,answer_key,explanation,points,tags,status,created_by,updated_by)
  values(coalesce(p_question_id,gen_random_uuid()),p_school_id,(p_payload->>'subjectId')::uuid,
    coalesce(p_payload->>'gradeLevel',''),coalesce(p_payload->>'unit',''),coalesce(p_payload->>'topic',''),
    coalesce(p_payload->>'difficulty','medium'),coalesce(p_payload->>'questionType','multiple_choice'),
    trim(p_payload->>'prompt'),coalesce(p_payload->'choices','[]'::jsonb),coalesce(p_payload->'answerKey','[]'::jsonb),
    coalesce(p_payload->>'explanation',''),coalesce((p_payload->>'points')::numeric,1),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb)) as value),'{}'),
    coalesce(p_payload->>'status','active'),actor,actor)
  on conflict(id) do update set subject_id=excluded.subject_id,grade_level=excluded.grade_level,
    unit=excluded.unit,topic=excluded.topic,difficulty=excluded.difficulty,question_type=excluded.question_type,
    prompt=excluded.prompt,choices=excluded.choices,answer_key=excluded.answer_key,explanation=excluded.explanation,
    points=excluded.points,tags=excluded.tags,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),
    deleted_at=null
  returning id into target;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,case when p_question_id is null then 'QUESTION_CREATED' else 'QUESTION_UPDATED' end,
      'question_bank',target,jsonb_build_object('prompt',left(trim(p_payload->>'prompt'),200),
        'difficulty',p_payload->>'difficulty','type',p_payload->>'questionType'));
  return target;
end $$;

create or replace function public.archive_bank_question(p_question_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target public.question_bank%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target from public.question_bank where id=p_question_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(target.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.question_bank set status='archived',updated_by=actor,updated_at=clock_timestamp() where id=target.id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
    values(target.school_id,actor,'QUESTION_ARCHIVED','question_bank',target.id);
end $$;

/**
 * Puts bank questions onto an exam by copying them.
 *
 * The copy is the point: a question edited in the bank next term must not change the paper a class
 * already sat, and an exam that has been taken keeps exactly the wording and the key it was marked
 * against.
 */
create or replace function public.compose_exam(p_test_id uuid, p_question_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  exam public.tests%rowtype;
  question public.question_bank%rowtype;
  taken integer;
  next_position integer := 0;
  added integer := 0;
  question_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into exam from public.tests where id=p_test_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(exam.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  -- Changing the paper under somebody who is sitting it would invalidate their attempt.
  select count(*) into taken from public.exam_attempts where test_id=exam.id;
  if taken > 0 then raise exception 'EXAM_ALREADY_TAKEN' using errcode='42501'; end if;

  select coalesce(max(position),0) into next_position from public.exam_questions where test_id=exam.id;

  foreach question_id in array p_question_ids loop
    select * into question from public.question_bank
      where id=question_id and school_id=exam.school_id and status='active' and deleted_at is null;
    if not found then continue; end if;
    next_position := next_position + 1;
    insert into public.exam_questions(school_id,test_id,source_question_id,position,question_type,prompt,
      choices,answer_key,explanation,points)
      values(exam.school_id,exam.id,question.id,next_position,question.question_type,question.prompt,
        question.choices,question.answer_key,question.explanation,question.points);
    added := added + 1;
  end loop;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(exam.school_id,actor,'EXAM_COMPOSED','test',exam.id,jsonb_build_object('added',added));
  return added;
end $$;

/** Sets the window an exam is open for, and records the change. */
create or replace function public.schedule_exam(
  p_test_id uuid, p_opens_at timestamptz, p_closes_at timestamptz,
  p_duration_minutes integer, p_attempt_limit integer, p_status text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); exam public.tests%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into exam from public.tests where id=p_test_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(exam.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('draft','published','closed') then raise exception 'VALIDATION_ERROR'; end if;
  if p_opens_at is not null and p_closes_at is not null and p_closes_at <= p_opens_at then
    raise exception 'VALIDATION_ERROR: window'; end if;

  update public.tests set opens_at=p_opens_at, closes_at=p_closes_at,
    duration_minutes=p_duration_minutes, attempt_limit=coalesce(p_attempt_limit,1), status=p_status,
    updated_at=clock_timestamp(), server_updated_at=clock_timestamp(), version=version+1
  where id=exam.id returning * into exam;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(exam.school_id,actor,'EXAM_SCHEDULE_CHANGED','test',exam.id,
      jsonb_build_object('opensAt',p_opens_at,'closesAt',p_closes_at,'durationMinutes',p_duration_minutes,
        'attemptLimit',p_attempt_limit,'status',p_status));

  return jsonb_build_object('testId',exam.id,'state',public.exam_state(exam.status,exam.opens_at,exam.closes_at,now()));
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.save_bank_question(uuid,uuid,jsonb) from public,anon;
revoke all on function public.archive_bank_question(uuid) from public,anon;
revoke all on function public.compose_exam(uuid,uuid[]) from public,anon;
revoke all on function public.schedule_exam(uuid,timestamptz,timestamptz,integer,integer,text) from public,anon;
revoke all on function public.exam_access(uuid) from public,anon;
revoke all on function public.start_exam_attempt(uuid) from public,anon;
revoke all on function public.submit_exam_attempt(uuid,jsonb,boolean) from public,anon;
revoke all on function public.take_exam(uuid) from public,anon;
grant execute on function public.save_bank_question(uuid,uuid,jsonb) to authenticated;
grant execute on function public.archive_bank_question(uuid) to authenticated;
grant execute on function public.compose_exam(uuid,uuid[]) to authenticated;
grant execute on function public.schedule_exam(uuid,timestamptz,timestamptz,integer,integer,text) to authenticated;
grant execute on function public.exam_access(uuid) to authenticated;
grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.submit_exam_attempt(uuid,jsonb,boolean) to authenticated;
grant execute on function public.take_exam(uuid) to authenticated;

commit;
