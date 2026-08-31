-- Repairs `exam_state`, which made every published exam impossible to sit.
--
-- Two meanings of the word "published" had collided. `schedule_exam` stores 'published' to mean
-- "released to students"; `exam_state` read it as "results published" and returned that verdict
-- before it ever looked at the window. `start_exam_attempt` requires the state 'open', which a
-- published exam could therefore never reach — so a teacher could compose an exam, schedule it,
-- watch it say "published", and no student could start it.
--
-- The stored status says whether the exam is released. The window says whether it is open right now.
-- Those are different questions, and the fix is to stop the first from answering the second: a
-- released exam falls through to the window, exactly as an exam with no explicit status already did.
--
-- 'draft', 'closed' and 'archived' still short-circuit, because those really are answers that no
-- window can overturn.
--
-- Whether results have been released is not this function's business at all — that is
-- `test_scores.published_at`, per student, which is where it already lived.

begin;

create or replace function public.exam_state(
  p_status text, p_opens_at timestamptz, p_closes_at timestamptz, p_now timestamptz default now()
) returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_status = 'draft' then 'draft'
    when p_status = 'archived' then 'archived'
    when p_status = 'closed' then 'closed'
    -- Released. The window decides what that means right now.
    when p_opens_at is not null and p_now < p_opens_at then 'scheduled'
    when p_closes_at is not null and p_now > p_closes_at then 'grading'
    else 'open'
  end;
$$;

comment on function public.exam_state(text,timestamptz,timestamptz,timestamptz) is
  'The state an exam is in, derived from its status and its window. A released exam is open only inside its window.';

commit;
