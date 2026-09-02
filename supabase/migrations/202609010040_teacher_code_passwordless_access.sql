-- Managed teachers enter with the name + code saved by the school administrator.
-- The Edge Function verifies the pair, creates a hidden Auth identity on first use, and mints
-- an ordinary Supabase session through a one-time magic-link token. The code is never stored as an
-- Auth password and is never exposed to the browser as a credential hash.

begin;

create or replace function public.resolve_teacher_access(
  p_display_name text,
  p_teacher_code text,
  p_teacher_id uuid default null
) returns table(
  teacher_id uuid,
  profile_id uuid,
  auth_email text,
  display_name text,
  school_id uuid,
  school_name text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted_name text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
  wanted_code text := upper(regexp_replace(trim(coalesce(p_teacher_code,'')),'[\s-]','','g'));
begin
  if char_length(wanted_name) < 2 or char_length(wanted_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;

  return query
  select t.id, t.profile_id, i.auth_email, t.display_name, t.school_id, s.name
  from public.teachers t
  join public.schools s on s.id=t.school_id
  left join public.member_login_identities i
    on i.profile_id=t.profile_id and i.role='teacher' and i.status='active'
  where (p_teacher_id is null or t.id=p_teacher_id)
    and t.status='active' and t.deleted_at is null
    and t.verification_status='verified_teacher'
    and lower(regexp_replace(trim(t.display_name),'\s+',' ','g'))=wanted_name
    and upper(regexp_replace(trim(t.teacher_code),'[\s-]','','g'))=wanted_code
    and s.status='active' and s.deleted_at is null
  limit 5;
end $$;

-- Used only to recover from a create/bind retry after the Auth user was created successfully.
create or replace function public.find_teacher_auth_user(p_email text)
returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare found_id uuid;
begin
  select id into found_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  return found_id;
end $$;

create or replace function public.activate_teacher_access(
  p_teacher_id uuid,
  p_profile_id uuid,
  p_auth_email text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target public.teachers%rowtype;
  school_name text;
  clean_name text;
  split_at integer;
  clean_first text;
  clean_last text;
begin
  if p_teacher_id is null or p_profile_id is null or coalesce(trim(p_auth_email),'')='' then
    raise exception 'VALIDATION_ERROR';
  end if;
  if not exists(
    select 1 from auth.users where id=p_profile_id and lower(email)=lower(trim(p_auth_email))
  ) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;

  select * into target from public.teachers
  where id=p_teacher_id and status='active' and deleted_at is null
    and verification_status='verified_teacher'
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if target.profile_id is not null and target.profile_id<>p_profile_id then
    raise exception 'TARGET_ALREADY_LINKED';
  end if;

  clean_name := regexp_replace(trim(coalesce(target.display_name,'')),'\s+',' ','g');
  if char_length(clean_name)<2 then raise exception 'VALIDATION_ERROR'; end if;
  split_at := strpos(clean_name,' ');
  clean_first := case when split_at>0 then left(clean_name,split_at-1) else clean_name end;
  clean_last := case when split_at>0 then trim(substr(clean_name,split_at+1)) else '-' end;

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_profile_id,clean_name,'teacher','active')
  on conflict(id) do update set display_name=excluded.display_name,
    requested_role='teacher', account_state='active', updated_at=clock_timestamp();

  insert into public.member_login_identities(
    profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source
  ) values(
    p_profile_id,'teacher',clean_name,clean_first,clean_last,lower(trim(p_auth_email)),target.school_id,'system'
  )
  on conflict(profile_id) do update set role='teacher',display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,auth_email=excluded.auth_email,
    school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  update public.teachers set profile_id=p_profile_id,first_name=clean_first,last_name=clean_last,
    verification_status='verified_teacher',updated_at=clock_timestamp()
  where id=target.id;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target.school_id,p_profile_id,'teacher','active')
  on conflict(school_id,profile_id,role) do update
    set status='active',active_until=null,updated_at=clock_timestamp();

  select name into school_name from public.schools where id=target.school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target.school_id,p_profile_id,'TEACHER_ACCESS_BOUND','teacher',target.id,
      jsonb_build_object('profileId',p_profile_id,'source','teacher_name_code'));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,'teacher','TEACHER_LOGIN_CREDENTIAL_CREATED',target.school_id,
      jsonb_build_object('teacherId',target.id,'accessModel','teacher_name_code'));

  return jsonb_build_object('profileId',p_profile_id,'displayName',clean_name,
    'role','teacher','schoolId',target.school_id,'schoolName',school_name);
end $$;

revoke all on function public.resolve_teacher_access(text,text,uuid) from public,anon,authenticated;
revoke all on function public.find_teacher_auth_user(text) from public,anon,authenticated;
revoke all on function public.activate_teacher_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_teacher_access(text,text,uuid) to service_role;
grant execute on function public.find_teacher_auth_user(text) to service_role;
grant execute on function public.activate_teacher_access(uuid,uuid,text) to service_role;

commit;
