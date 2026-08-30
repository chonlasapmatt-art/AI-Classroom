-- Passwordless student access.
--
-- Product decision: a student never has an email address or a password. Identity is the student
-- record the school already keeps, and the student proves it with their name plus their student
-- number. That is a low-entropy credential, so every guard that a password would normally provide
-- has to live on the server instead: the lookup functions below are service_role only, the Edge
-- Function rate-limits and locks out, and failures are indistinguishable from one another so the
-- pair cannot be used to enumerate the roster.
--
-- Nothing about the existing RLS model changes. The Edge Function mints a normal Supabase session
-- for a shadow auth user bound to exactly one student record, so auth.uid() keeps working and every
-- existing student policy applies unmodified.

begin;

alter table public.schools
  add column if not exists allow_student_self_registration boolean not null default true;

alter table public.students
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists creation_source text not null default 'teacher',
  add column if not exists student_access_enabled boolean not null default true,
  add column if not exists first_student_access_at timestamptz,
  add column if not exists last_student_access_at timestamptz;

alter table public.students drop constraint if exists students_creation_source_check;
alter table public.students add constraint students_creation_source_check
  check (creation_source in ('teacher','admin','self_registration','import','system'));

-- Matching is done on this column, never on the raw display name, so "  สมชาย   ใจดี " and
-- "สมชาย ใจดี" resolve to the same student instead of failing a login that should succeed.
alter table public.students
  add column if not exists normalized_name text
  generated always as (lower(regexp_replace(trim(display_name),'\s+',' ','g'))) stored;

create index if not exists students_normalized_name_idx
  on public.students(normalized_name,upper(student_code)) where deleted_at is null;

-- Failed attempts are kept keyed by hashes only. The raw name and student number never land here,
-- because this table is the one an operator is most likely to read during an incident.
create table if not exists public.student_access_attempts (
  id bigint generated always as identity primary key,
  action text not null,
  identity_hash text not null,
  client_hash text not null,
  school_id uuid references public.schools(id),
  student_id uuid references public.students(id),
  succeeded boolean not null,
  failure_reason text,
  attempted_at timestamptz not null default clock_timestamp()
);
create index if not exists student_access_attempts_identity_idx
  on public.student_access_attempts(identity_hash,attempted_at desc);
create index if not exists student_access_attempts_client_idx
  on public.student_access_attempts(client_hash,attempted_at desc);
alter table public.student_access_attempts enable row level security;
revoke all on public.student_access_attempts from public,anon,authenticated;

-- Resolution is deliberately school-blind: a student number can repeat across schools, and asking a
-- child which school they attend before we know we need to is UX we do not want. The caller gets
-- every match and must refuse to proceed when there is more than one.
create or replace function public.resolve_student_access(
  p_display_name text,
  p_student_code text,
  p_school_id uuid default null
) returns table(
  student_id uuid,
  school_id uuid,
  school_name text,
  display_name text,
  student_code text,
  profile_id uuid,
  access_enabled boolean
) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted_name text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
  wanted_code text := upper(trim(coalesce(p_student_code,'')));
begin
  if char_length(wanted_name) < 2 or char_length(wanted_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;
  return query
  select s.id, s.school_id, sc.name, s.display_name, s.student_code, s.profile_id,
         s.student_access_enabled
  from public.students s
  join public.schools sc on sc.id = s.school_id
  where s.normalized_name = wanted_name
    and upper(s.student_code) = wanted_code
    and s.status = 'active' and s.deleted_at is null
    and sc.status = 'active' and sc.deleted_at is null
    and (p_school_id is null or s.school_id = p_school_id)
  limit 10;
end $$;

-- Binds an already-resolved student record to the shadow auth user the Edge Function created.
-- Takes the student id, never a name, so a caller that skipped resolution cannot guess its way in.
create or replace function public.bind_student_access(
  p_student_id uuid,
  p_actor uuid,
  p_source text default 'login'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target public.students%rowtype;
  school_name text;
  first_access boolean;
begin
  select * into target from public.students
  where id = p_student_id and status = 'active' and deleted_at is null for update;
  if not found then raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000'; end if;
  if not target.student_access_enabled then
    raise exception 'STUDENT_ACCESS_REVOKED' using errcode='42501';
  end if;
  if target.profile_id is not null and target.profile_id <> p_actor then
    raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000';
  end if;

  first_access := target.first_student_access_at is null;
  update public.students set
    profile_id = p_actor,
    first_student_access_at = coalesce(first_student_access_at, clock_timestamp()),
    last_student_access_at = clock_timestamp(),
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id;

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_actor,target.display_name,'student','active')
    on conflict(id) do update set display_name = excluded.display_name,
      account_state = 'active', onboarding_completed_at = coalesce(public.user_profiles.onboarding_completed_at,clock_timestamp()),
      updated_at = clock_timestamp();
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target.school_id,p_actor,'student','active')
    on conflict(school_id,profile_id,role) do update
      set status = 'active', active_until = null, updated_at = clock_timestamp();

  select name into school_name from public.schools where id = target.school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,p_actor,
      case when first_access then 'STUDENT_FIRST_ACCESS' else 'STUDENT_ACCESS_GRANTED' end,
      'student',target.id,target.id,
      jsonb_build_object('source',p_source,'studentCode',target.student_code));
  return jsonb_build_object('studentId',target.id,'schoolId',target.school_id,
    'schoolName',school_name,'displayName',target.display_name,'firstAccess',first_access);
end $$;

-- First-time registration. Finds the teacher-created record before it considers creating anything,
-- so a student who registers when the teacher already entered them links instead of duplicating.
create or replace function public.register_student_access(
  p_first_name text,
  p_last_name text,
  p_student_code text,
  p_school_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_school public.schools%rowtype;
  target public.students%rowtype;
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  clean_code text := upper(trim(coalesce(p_student_code,'')));
  full_name text;
  created boolean := false;
  new_id uuid;
begin
  full_name := trim(clean_first || ' ' || clean_last);
  if char_length(clean_first) < 1 or char_length(clean_last) < 1 or char_length(clean_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select * into target_school from public.schools
  where id = p_school_id and status = 'active' and deleted_at is null;
  if not found then raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000'; end if;

  select * into target from public.students
  where school_id = target_school.id and upper(student_code) = clean_code
    and status = 'active' and deleted_at is null for update;

  if found then
    -- The student number is taken inside this school. It may only be reused by the same person,
    -- which is exactly what the name check decides.
    if target.normalized_name <> lower(full_name) then
      raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000';
    end if;
    if target.profile_id is not null then
      raise exception 'TARGET_ALREADY_LINKED' using errcode='23505';
    end if;
  else
    if not target_school.allow_student_self_registration then
      raise exception 'SELF_REGISTRATION_DISABLED' using errcode='42501';
    end if;
    new_id := gen_random_uuid();
    insert into public.students(id,school_id,student_code,display_name,first_name,last_name,
      avatar_index,status,creation_source,version)
      values(new_id,target_school.id,clean_code,full_name,clean_first,clean_last,
        (abs(hashtext(new_id::text)) % 100),'active','self_registration',1);
    select * into target from public.students where id = new_id;
    created := true;
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(target_school.id,null,'STUDENT_SELF_REGISTERED','student',new_id,new_id,
        jsonb_build_object('studentCode',clean_code,'creationSource','self_registration'));
  end if;

  if not created then
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(target_school.id,null,'STUDENT_SELF_LINKED','student',target.id,target.id,
        jsonb_build_object('studentCode',target.student_code,'creationSource',target.creation_source));
  end if;

  return jsonb_build_object('studentId',target.id,'schoolId',target_school.id,
    'schoolName',target_school.name,'displayName',target.display_name,'created',created);
end $$;

-- Recovery lookup for a shadow account whose creation succeeded but whose binding did not. Takes a
-- full address rather than a pattern, so it can confirm one known account and cannot list users.
create or replace function public.find_student_auth_user(p_email text)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare found_id uuid;
begin
  select id into found_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  return found_id;
end $$;

-- School picker for the first-time screen and for the rare cross-school disambiguation step.
-- Returns nothing but the school's own public identity, and never a student.
create or replace function public.search_public_schools(p_query text)
returns table(school_id uuid, name text, code text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted text := lower(trim(coalesce(p_query,'')));
begin
  if char_length(wanted) < 2 then raise exception 'QUERY_TOO_SHORT'; end if;
  return query
  select s.id, s.name, s.code from public.schools s
  where s.status = 'active' and s.deleted_at is null
    and (position(wanted in lower(s.name)) > 0 or position(wanted in lower(s.code)) > 0)
  order by s.name limit 10;
end $$;

-- Teacher-facing switch. Turning access off also releases the shadow account binding, so a lost or
-- shared device cannot keep a session alive against the record.
create or replace function public.set_student_access(
  p_student_id uuid,
  p_enabled boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  target public.students%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target from public.students where id = p_student_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(target.school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  update public.students set student_access_enabled = p_enabled,
    profile_id = case when p_enabled then profile_id else null end,
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id;
  if not p_enabled and target.profile_id is not null then
    update public.school_memberships set status = 'suspended', updated_at = clock_timestamp()
      where school_id = target.school_id and profile_id = target.profile_id and role = 'student';
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,actor,
      case when p_enabled then 'STUDENT_ACCESS_ENABLED' else 'STUDENT_ACCESS_REVOKED' end,
      'student',target.id,target.id,jsonb_build_object('accessEnabled',p_enabled));
  return jsonb_build_object('studentId',target.id,'accessEnabled',p_enabled);
end $$;

revoke all on function public.resolve_student_access(text,text,uuid) from public,anon,authenticated;
revoke all on function public.bind_student_access(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.register_student_access(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.search_public_schools(text) from public,anon,authenticated;
revoke all on function public.find_student_auth_user(text) from public,anon,authenticated;
grant execute on function public.find_student_auth_user(text) to service_role;
grant execute on function public.resolve_student_access(text,text,uuid) to service_role;
grant execute on function public.bind_student_access(uuid,uuid,text) to service_role;
grant execute on function public.register_student_access(text,text,text,uuid) to service_role;
grant execute on function public.search_public_schools(text) to service_role;
revoke all on function public.set_student_access(uuid,boolean) from public,anon;
grant execute on function public.set_student_access(uuid,boolean) to authenticated;

-- Teacher onboarding no longer parks a real teacher in a pending queue. The school code is the
-- proof of belonging, and an administrator can still revoke afterwards; making every new teacher
-- wait for a human simply left them unable to do their job on day one.
create or replace function public.request_teacher_account(
  p_actor uuid,
  p_school_code text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_school public.schools%rowtype;
  requested text;
  confirmed_at timestamptz;
  actor_email text;
  teacher_id uuid;
  generated_code text;
begin
  select requested_role into requested from public.user_profiles where id=p_actor;
  select email,email_confirmed_at into actor_email,confirmed_at from auth.users where id=p_actor;
  if requested <> 'teacher' or confirmed_at is null then
    raise exception 'ACCOUNT_NOT_READY' using errcode='42501';
  end if;
  if char_length(trim(p_display_name))<2 then raise exception 'VALIDATION_ERROR'; end if;

  select * into target_school from public.schools
  where upper(code)=upper(trim(p_school_code)) and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;

  select id into teacher_id from public.teachers
    where school_id=target_school.id and profile_id=p_actor and deleted_at is null limit 1;
  if teacher_id is null then
    generated_code := 'T-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.teachers(
      school_id,profile_id,teacher_code,display_name,email,subject,verification_status,status
    ) values(
      target_school.id,p_actor,generated_code,trim(p_display_name),actor_email,'',
      'verified_teacher','active'
    ) returning id into teacher_id;
  else
    update public.teachers set display_name=trim(p_display_name),email=actor_email,
      verification_status='verified_teacher',status='active',
      updated_at=clock_timestamp() where id=teacher_id;
  end if;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_actor,'teacher','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
  update public.user_profiles set display_name=trim(p_display_name),account_state='active',
    onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_actor;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target_school.id,p_actor,'teacher_account_activated','teacher',teacher_id,
      jsonb_build_object('displayName',trim(p_display_name),'verificationStatus','verified_teacher'));
  return jsonb_build_object('schoolId',target_school.id,'schoolName',target_school.name,
    'teacherId',teacher_id,'accountState','active','verificationStatus','verified_teacher');
end $$;

revoke all on function public.request_teacher_account(uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_teacher_account(uuid,text,text) to service_role;

commit;
