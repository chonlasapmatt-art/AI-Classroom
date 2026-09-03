-- First-run activation could never create a school: the two `bootstrap_school_owner` functions were
-- ambiguous to Postgres, and the wrapper's own call to the other one was the call that failed.
--
-- `202608310034` added a six-argument wrapper that takes the administrator's display name and
-- delegates the school itself to the original five-argument function. Its last parameter carried a
-- default, so a five-argument call matched both functions and Postgres refused to choose:
--
--     ERROR:  function public.bootstrap_school_owner(uuid, text, text, text, text) is not unique
--     CONTEXT:  PL/pgSQL function bootstrap_school_owner(uuid,text,text,text,text,text) line 12
--
-- The gateway turns any refusal it has no name for into `SETUP_REJECTED`, which reaches the customer
-- as "ตั้งค่าโรงเรียนไม่สำเร็จ กรุณาตรวจข้อมูลและรหัสเปิดใช้งาน" -- a message about the product key,
-- for a failure that has nothing to do with the product key. The key verified correctly every time;
-- the school could not be created afterwards.
--
-- The default is what made the two functions ambiguous, and nothing passes five arguments any more:
-- the wrapper is the only caller of the five-argument function, and `admin-access` always sends six.
-- So the default goes. A parameter default cannot be removed by `create or replace`, hence the drop.
--
-- The body is unchanged from `202608310034`. This migration exists to change one thing.

begin;

drop function if exists public.bootstrap_school_owner(uuid,text,text,text,text,text);

create function public.bootstrap_school_owner(
  p_actor uuid, p_school_name text, p_school_code text, p_academic_year text, p_term text,
  p_display_name text
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
  'Service-role-only standalone school bootstrap with atomic admin display-name onboarding. The display name is required: a default made this ambiguous with the five-argument function.';

commit;
