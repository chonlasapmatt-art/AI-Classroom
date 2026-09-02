-- An administrator may create a ready-to-use parent account before the child is known.
-- The parent can then sign in and use list_parent_children/link_child to connect safely.

begin;

create or replace function public.provision_parent_without_child(
  p_actor uuid,
  p_school_id uuid,
  p_parent_id uuid,
  p_profile_id uuid,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_auth_email text,
  p_phone text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  identity_role text;
  target_parent public.parents%rowtype;
begin
  if p_actor is null or p_profile_id is null or p_parent_id is null then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 200 or coalesce(trim(p_auth_email),'') = '' then
    raise exception 'VALIDATION_ERROR';
  end if;
  if not public.member_can_operate(p_actor,p_school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  select role into identity_role
  from public.member_login_identities
  where profile_id=p_profile_id;
  if identity_role is not null and identity_role <> 'parent' then
    raise exception 'ROLE_CONFLICT';
  end if;

  select * into target_parent
  from public.parents
  where id=p_parent_id and school_id=p_school_id
  for update;
  if found and target_parent.profile_id is not null and target_parent.profile_id <> p_profile_id then
    raise exception 'TARGET_ALREADY_LINKED';
  end if;

  insert into public.parents(id,school_id,profile_id,display_name,first_name,last_name,phone,status,creation_source)
    values(p_parent_id,p_school_id,p_profile_id,clean_name,clean_first,clean_last,nullif(trim(coalesce(p_phone,'')),''),'active','admin')
  on conflict(id) do update set profile_id=excluded.profile_id,display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,status='active',updated_at=clock_timestamp();

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_profile_id,clean_name,'parent','active')
  on conflict(id) do update set display_name=excluded.display_name,requested_role='parent',
    account_state='active',updated_at=clock_timestamp();

  insert into public.member_login_identities(profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source)
    values(p_profile_id,'parent',clean_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,'admin')
  on conflict(profile_id) do update set role='parent',display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,auth_email=excluded.auth_email,
    school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(p_school_id,p_profile_id,'parent','active')
  on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,p_actor,'MANAGED_ACCOUNT_PROVISIONED','parent',p_parent_id,
      jsonb_build_object('profileId',p_profile_id,'role','parent','source','admin','childLinked',false));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,'parent','MANAGED_ACCOUNT_PROVISIONED',p_school_id,jsonb_build_object('source','admin','childLinked',false));

  return jsonb_build_object('profileId',p_profile_id,'role','parent','displayName',clean_name,
    'schoolId',p_school_id,'parentId',p_parent_id,'linkId',null);
end $$;

revoke all on function public.provision_parent_without_child(uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_parent_without_child(uuid,uuid,uuid,uuid,text,text,text,text,text) to service_role;

commit;
