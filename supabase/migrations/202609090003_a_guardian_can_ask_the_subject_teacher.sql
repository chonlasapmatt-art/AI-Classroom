-- A guardian can ask the subject teacher a question.
--
-- Everything a guardian could do in this product was reading. They can see the marks, the register
-- and now the lesson material — and when they have a question about any of it, the product's answer
-- was to say nothing and let them find a phone number. Meanwhile the one thing teachers asked for
-- was somewhere the questions arrive instead of arriving in four places at once.
--
-- So: one small table of requests, addressed to a subject. Not to a person, because the teacher of
-- a subject changes and a request addressed to somebody who left is a request nobody reads; the
-- staff who teach that subject are the audience, whoever they are on the day it is read.
--
-- What this deliberately is not: it is not a chat. There is no thread, no reply, no read receipt —
-- a request is raised, it is read by the staff who teach the subject, and one of them marks it
-- handled. A school that needs a conversation has a phone, and a product that offers half a
-- messenger to a parent is promising an answer nobody agreed to give.

create table if not exists public.subject_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- The child the question is about, when the asker named one. A guardian may only name a child
  -- they are linked to, which the write path enforces.
  student_id uuid references public.students(id) on delete set null,
  raised_by uuid not null references auth.users(id) on delete cascade,
  raised_by_name text not null default '',
  body text not null,
  status text not null default 'open' check (status in ('open','handled')),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists subject_requests_subject_idx on public.subject_requests(school_id, subject_id, created_at desc);

alter table public.subject_requests enable row level security;

-- Read: the staff who teach the subject, the school's administrators, and the person who asked.
-- A guardian sees their own questions and nobody else's, because another family's question about
-- another family's child is not theirs to read.
drop policy if exists subject_requests_read on public.subject_requests;
create policy subject_requests_read on public.subject_requests for select using (
  deleted_at is null
  and (
    public.has_school_role(school_id, 'admin')
    or public.teacher_teaches_subject(subject_id)
    or raised_by = (select auth.uid())
  )
);

-- Every write goes through the routines below, which is where the rules live.
revoke all on table public.subject_requests from anon, authenticated;
grant select on table public.subject_requests to authenticated;

/**
 * Raise one request.
 *
 * The asker is whoever is signed in — never a name in the payload — so a request cannot be filed in
 * somebody else's name. A guardian may name only a child they are actually linked to; anybody may
 * ask about the subject itself by naming no child at all.
 */
create or replace function public.raise_subject_request(
  p_school_id uuid, p_subject_id uuid, p_student_id uuid, p_body text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); request_id uuid := gen_random_uuid(); asker text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'VALIDATION_ERROR: empty request'; end if;
  if char_length(p_body) > 2000 then raise exception 'VALIDATION_ERROR: request too long'; end if;
  if not exists(select 1 from public.subjects s where s.id = p_subject_id and s.school_id = p_school_id and s.deleted_at is null) then
    raise exception 'NOT_FOUND: subject';
  end if;
  if p_student_id is not null and not public.can_read_student(p_student_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  select coalesce(m.display_name, '') into asker
  from public.school_memberships m
  where m.school_id = p_school_id and m.profile_id = actor and m.status = 'active'
  limit 1;

  insert into public.subject_requests(id, school_id, subject_id, student_id, raised_by, raised_by_name, body)
  values (request_id, p_school_id, p_subject_id, p_student_id, actor, coalesce(asker,''), btrim(p_body));

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, target_student_id)
  values (p_school_id, actor, 'subject_request_raised', 'subject_request', request_id, p_student_id);

  return jsonb_build_object('entityId', request_id);
end $$;

/** Mark one request handled. Staff only — the asker cannot close their own question unanswered. */
create or replace function public.handle_subject_request(p_school_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target public.subject_requests%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target from public.subject_requests
  where id = p_request_id and school_id = p_school_id and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.teacher_teaches_subject(target.subject_id)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  update public.subject_requests
  set status = 'handled', handled_by = actor, handled_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, target_student_id)
  values (p_school_id, actor, 'subject_request_handled', 'subject_request', p_request_id, target.student_id);

  return jsonb_build_object('entityId', p_request_id, 'status', 'handled');
end $$;

revoke all on function public.raise_subject_request(uuid,uuid,uuid,text) from public, anon;
revoke all on function public.handle_subject_request(uuid,uuid) from public, anon;
grant execute on function public.raise_subject_request(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.handle_subject_request(uuid,uuid) to authenticated;
