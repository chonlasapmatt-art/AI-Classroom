-- An operator account that belongs to no school.
--
-- `platform_admins` already keeps authority separate from membership, which is the invariant that
-- matters. What was missing was a way to create an operator whose *account* is separate too: the
-- only path into that table was `enroll`, which grants platform authority to whichever account is
-- already signed in — and the only accounts that can sign in are a school's. So every operator was
-- also somebody's school administrator, in the records meant to tell those two apart.
--
-- It also left a fresh deployment with no way in at all. `enroll` needs a session; the console's
-- only door signs you in as an operator that already exists; and nothing could create the first one.
-- A platform with no operator could not be given one from inside the platform.
--
-- This function is the missing half. It provisions an operator directly, refuses to touch a profile
-- that holds any school membership, and is open without an actor exactly once — while there is no
-- operator at all. After that it is an ordinary platform action performed by an operator, with the
-- same fresh-re-authentication requirement as every other one.

create or replace function public.provision_platform_operator(
  p_actor uuid,
  p_profile_id uuid,
  p_display_name text,
  p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  existing_count integer;
  membership_count integer;
begin
  if p_profile_id is null or not exists(select 1 from auth.users where id=p_profile_id) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 200 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select count(*) into existing_count
    from public.platform_admins where status='active' and revoked_at is null;

  -- The bootstrap is the only moment this runs without an operator behind it, and it closes the
  -- instant it succeeds: from the second operator onwards this is a platform action like any other.
  if existing_count > 0 then
    if p_actor is null or not public.is_platform_admin(p_actor) then
      raise exception 'FORBIDDEN' using errcode='42501';
    end if;
    if not public.platform_reauth_fresh(p_actor,15) then
      raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501';
    end if;
  end if;

  -- The separation is enforced here rather than trusted to the caller. Handing platform authority
  -- to an account that administers a school is the exact thing `platform_admins` exists to avoid,
  -- and a check in an Edge Function is a check somebody can route around.
  select count(*) into membership_count
    from public.school_memberships where profile_id=p_profile_id and status='active';
  if membership_count > 0 then
    raise exception 'OPERATOR_HAS_SCHOOL_MEMBERSHIP' using errcode='42501';
  end if;

  -- `requested_role` stays null on purpose: the column's own constraint allows only the three school
  -- roles, and an operator asked for none of them. Saying so is more honest than borrowing one.
  insert into public.user_profiles(id, display_name, requested_role, account_state)
    values(p_profile_id, clean_name, null, 'active')
  on conflict(id) do update set display_name=excluded.display_name,
    account_state='active', updated_at=clock_timestamp();

  -- Reuses the existing grant so there is still one place that writes platform authority, one place
  -- that records it, and one bootstrap rule rather than two that can drift apart.
  return public.grant_platform_admin(
    coalesce(p_actor, p_profile_id), p_profile_id, clean_name, coalesce(p_notes,'')
  );
end $$;

revoke all on function public.provision_platform_operator(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.provision_platform_operator(uuid,uuid,text,text) to service_role;

-- Every operator, for the console's own list. `platform_admins` is revoked from `authenticated`
-- like every other table holding authority, so the console reads it through this instead.
create or replace function public.list_platform_operators(p_actor uuid)
returns table(
  profile_id uuid, display_name text, status text, mfa_enrolled_at timestamptz,
  granted_at timestamptz, revoked_at timestamptz, last_seen_at timestamptz,
  school_memberships integer
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_actor is null or not public.is_platform_admin(p_actor) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  return query
    select a.profile_id, a.display_name, a.status, a.mfa_enrolled_at,
           a.granted_at, a.revoked_at, a.last_seen_at,
           -- Surfaced rather than hidden: an operator carried over from before this migration may
           -- still administer a school, and the console should say which ones do.
           (select count(*)::integer from public.school_memberships m
              where m.profile_id = a.profile_id and m.status='active')
      from public.platform_admins a
     order by a.status, a.granted_at;
end $$;

revoke all on function public.list_platform_operators(uuid) from public,anon,authenticated;
grant execute on function public.list_platform_operators(uuid) to service_role;
