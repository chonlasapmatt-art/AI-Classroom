begin;

-- The standalone product setup wizard lets the buyer choose the name that appears in the school
-- server. Keep the old five-argument function intact for existing internal callers, and expose a
-- six-argument wrapper so the school bootstrap and identity update succeed or fail together.
create or replace function public.bootstrap_school_owner(
  p_actor uuid, p_school_name text, p_school_code text, p_academic_year text, p_term text,
  p_display_name text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  school uuid;
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  first_part text;
  last_part text;
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 200 then
    raise exception 'VALIDATION_ERROR: display name';
  end if;

  school := public.bootstrap_school_owner(p_actor, p_school_name, p_school_code, p_academic_year, p_term);
  first_part := split_part(clean_name, ' ', 1);
  last_part := nullif(trim(substr(clean_name, char_length(first_part) + 1)), '');
  last_part := coalesce(last_part, first_part);

  update public.user_profiles
    set display_name=clean_name, requested_role='admin', account_state='active',
        onboarding_completed_at=coalesce(onboarding_completed_at, clock_timestamp()), updated_at=clock_timestamp()
    where id=p_actor;

  update public.member_login_identities
    set display_name=clean_name, first_name=first_part, last_name=last_part,
        school_id=school, updated_at=clock_timestamp()
    where profile_id=p_actor;

  if not found then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;
  return school;
end $$;

revoke all on function public.bootstrap_school_owner(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_school_owner(uuid,text,text,text,text,text) to service_role;

comment on function public.bootstrap_school_owner(uuid,text,text,text,text,text) is
  'Service-role-only standalone school bootstrap with atomic admin display-name onboarding.';

commit;
