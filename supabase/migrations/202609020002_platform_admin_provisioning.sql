begin;

-- A platform operator can create a ready-to-use school administrator without sending them
-- through public onboarding. Auth is still created by the Edge Function; this function binds that
-- Auth user to the school atomically and keeps platform authority separate from school membership.
create or replace function public.provision_school_admin(
  p_actor uuid,
  p_profile_id uuid,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_auth_email text,
  p_school_id uuid,
  p_school_name text,
  p_school_code text,
  p_academic_year text,
  p_term text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  clean_code text := upper(trim(coalesce(p_school_code,'')));
  target_school public.schools%rowtype;
  identity_role text;
  term_id uuid;
  created_school boolean := false;
begin
  if p_actor is null or not public.is_platform_admin(p_actor) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not public.platform_reauth_fresh(p_actor,15) then
    raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if p_profile_id is null or not exists(select 1 from auth.users where id=p_profile_id) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if char_length(clean_name)<2 or char_length(clean_name)>200
    or char_length(clean_first)<1 or char_length(clean_last)<1
    or coalesce(trim(p_auth_email),'')='' then
    raise exception 'VALIDATION_ERROR';
  end if;

  if p_school_id is null then
    if char_length(trim(coalesce(p_school_name,'')))<2
      or clean_code !~ '^[A-Z0-9-]{3,20}$'
      or char_length(trim(coalesce(p_academic_year,'')))<2
      or char_length(trim(coalesce(p_term,'')))<1 then
      raise exception 'VALIDATION_ERROR';
    end if;
    begin
      insert into public.schools(name,code)
        values(trim(p_school_name),clean_code)
        returning * into target_school;
    exception when unique_violation then
      raise exception 'SCHOOL_CODE_TAKEN';
    end;
    created_school := true;
    term_id := gen_random_uuid();
    insert into public.academic_terms(id,school_id,academic_year,term,starts_on,ends_on,status)
      values(term_id,target_school.id,trim(p_academic_year),trim(p_term),current_date,current_date+interval '180 days','active');
    insert into public.settings(school_id,scope_type,key,value_json) values
      (target_school.id,'school','score_policy','{"weights":{"assignment":60,"activity":30,"test":10},"passingScore":60,"latePenaltyPercent":10,"missingItem":"zero"}'::jsonb),
      (target_school.id,'school','privacy_policy','{"version":"1.0","status":"draft"}'::jsonb),
      (target_school.id,'school','consent_policy','{"version":"1.0","status":"draft"}'::jsonb),
      (target_school.id,'school','teacher_verification_policy','{"allowVerifiedTeacherApproval":false}'::jsonb);
  else
    select * into target_school
    from public.schools
    where id=p_school_id and status='active' and deleted_at is null;
    if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;
  end if;

  select role into identity_role from public.member_login_identities where profile_id=p_profile_id;
  if identity_role is not null and identity_role<>'admin' then
    raise exception 'ROLE_CONFLICT';
  end if;

  insert into public.user_profiles(id,display_name,requested_role,account_state,onboarding_completed_at)
    values(p_profile_id,clean_name,'admin','active',clock_timestamp())
  on conflict(id) do update set display_name=excluded.display_name,requested_role='admin',
    account_state='active',onboarding_completed_at=coalesce(public.user_profiles.onboarding_completed_at,excluded.onboarding_completed_at),
    updated_at=clock_timestamp();

  insert into public.member_login_identities(
    profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source
  ) values(p_profile_id,'admin',clean_name,clean_first,clean_last,lower(trim(p_auth_email)),target_school.id,'platform')
  on conflict(profile_id) do update set role='admin',display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,auth_email=excluded.auth_email,
    school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_profile_id,'admin','active')
  on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target_school.id,p_actor,'PLATFORM_ADMIN_PROVISIONED','admin',p_profile_id,
      jsonb_build_object('displayName',clean_name,'schoolId',target_school.id,'createdSchool',created_school));
  perform public.record_platform_event(p_actor,'SCHOOL_ADMIN_PROVISIONED',target_school.id,p_profile_id,
    'สร้างบัญชีผู้ดูแลโรงเรียนจาก Super Admin',
    jsonb_build_object('displayName',clean_name,'createdSchool',created_school));

  return jsonb_build_object(
    'profileId',p_profile_id,'schoolId',target_school.id,'schoolName',target_school.name,
    'schoolCode',target_school.code,'displayName',clean_name,'createdSchool',created_school
  );
end $$;

revoke all on function public.provision_school_admin(uuid,uuid,text,text,text,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_school_admin(uuid,uuid,text,text,text,text,uuid,text,text,text,text) to service_role;

comment on function public.provision_school_admin(uuid,uuid,text,text,text,text,uuid,text,text,text,text) is
  'Platform-admin-only binding of an Auth user to a school administrator, optionally creating the school and its defaults.';

commit;
