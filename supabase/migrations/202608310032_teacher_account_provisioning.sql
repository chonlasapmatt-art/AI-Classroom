begin;

-- Creates the identity behind a teacher record that a school administrator has already verified.
-- The password is created by the trusted Edge Function and is never stored in this database.
create or replace function public.provision_teacher_identity(
  p_actor uuid,
  p_school_id uuid,
  p_teacher_id uuid,
  p_profile_id uuid,
  p_auth_email text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target public.teachers%rowtype;
  clean_name text;
  split_at integer;
  clean_first text;
  clean_last text;
begin
  if p_actor is null or p_profile_id is null then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if not exists (
    select 1 from public.school_memberships
    where school_id=p_school_id and profile_id=p_actor and role='admin'
      and status='active' and active_from<=now()
      and (active_until is null or active_until>now())
  ) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  select * into target from public.teachers
    where id=p_teacher_id and school_id=p_school_id and status='active' and deleted_at is null
    for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if target.verification_status<>'verified_teacher' then
    raise exception 'TEACHER_NOT_VERIFIED' using errcode='42501';
  end if;
  if target.profile_id is not null and target.profile_id<>p_profile_id then
    raise exception 'TARGET_ALREADY_LINKED';
  end if;
  if not exists (
    select 1 from auth.users where id=p_profile_id and lower(email)=lower(trim(p_auth_email))
  ) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;

  clean_name := regexp_replace(trim(coalesce(target.display_name,'')),'\s+',' ','g');
  if char_length(clean_name)<2 then raise exception 'VALIDATION_ERROR'; end if;
  split_at := strpos(clean_name,' ');
  clean_first := case when split_at>0 then left(clean_name,split_at-1) else clean_name end;
  clean_last := case when split_at>0 then trim(substr(clean_name,split_at+1)) else '-' end;

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_profile_id,clean_name,'teacher','active')
  on conflict(id) do update set display_name=excluded.display_name,
    requested_role='teacher',account_state='active',updated_at=clock_timestamp();

  insert into public.member_login_identities(
    profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source
  ) values(p_profile_id,'teacher',clean_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,'admin')
  on conflict(profile_id) do update set role='teacher',display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,auth_email=excluded.auth_email,
    school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  update public.teachers set profile_id=p_profile_id,first_name=clean_first,last_name=clean_last,
    updated_at=clock_timestamp() where id=target.id;
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(p_school_id,p_profile_id,'teacher','active')
  on conflict(school_id,profile_id,role) do update set status='active',active_until=null,
    updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,p_actor,'TEACHER_ACCOUNT_PROVISIONED','teacher',target.id,
      jsonb_build_object('profileId',p_profile_id,'displayName',clean_name,'source','admin'));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,'teacher','TEACHER_ACCOUNT_PROVISIONED',p_school_id,
      jsonb_build_object('teacherId',target.id,'source','admin'));
  return jsonb_build_object('teacherId',target.id,'profileId',p_profile_id,'displayName',clean_name);
end $$;

revoke all on function public.provision_teacher_identity(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.provision_teacher_identity(uuid,uuid,uuid,uuid,text) to service_role;

commit;
