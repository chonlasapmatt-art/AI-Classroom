-- `erase_member_account` refused every call from the gateway with `AUTH_REQUIRED`.
--
-- It read the caller from `auth.uid()`, which is exactly right for a browser and empty for the
-- service role the Edge Function uses — and the Edge Function is the only caller that can finish the
-- job, because deleting the authentication account needs the admin API. So the one path that could
-- work was the one path the function turned away.
--
-- The actor may now be passed in, and only when there is no session to read: a signed-in caller is
-- always themselves, so a browser cannot name somebody else and borrow their authority.

begin;

create or replace function public.erase_member_account(
  p_school_id uuid, p_profile_id uuid, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  -- A session, when there is one, and never the argument in preference to it: passing an actor is
  -- for the trusted server, which has no session at all.
  actor uuid := coalesce(auth.uid(), p_actor);
  label text;
  role_here text;
  other_schools integer;
  remaining_admins integer;
  reference record;
  blocking text[] := array[]::text[];
  held integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.member_can_operate(actor, p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_profile_id is null then raise exception 'VALIDATION_ERROR'; end if;
  if p_profile_id = actor then raise exception 'CANNOT_ERASE_SELF'; end if;

  select display_name into label from public.user_profiles where id = p_profile_id;
  if label is null then raise exception 'NOT_FOUND'; end if;

  if exists(select 1 from public.platform_admins
    where profile_id = p_profile_id and status = 'active' and revoked_at is null) then
    raise exception 'CANNOT_ERASE_PLATFORM_OPERATOR';
  end if;

  select count(*) into other_schools from public.school_memberships
    where profile_id = p_profile_id and school_id <> p_school_id and status = 'active';
  if other_schools > 0 then raise exception 'ACCOUNT_BELONGS_TO_ANOTHER_SCHOOL'; end if;

  select role::text into role_here from public.school_memberships
    where profile_id = p_profile_id and school_id = p_school_id limit 1;
  if role_here = 'admin' then
    select count(*) into remaining_admins from public.school_memberships
      where school_id = p_school_id and role = 'admin' and status = 'active' and profile_id <> p_profile_id;
    if remaining_admins = 0 then raise exception 'LAST_ADMINISTRATOR'; end if;
  end if;

  -- The way in, and the traces of using it. None of these mean anything once the account is gone.
  delete from public.member_login_identities where profile_id = p_profile_id;
  delete from public.school_memberships where profile_id = p_profile_id;
  delete from public.member_account_events where profile_id = p_profile_id;
  delete from public.member_access_attempts where profile_id = p_profile_id;
  delete from public.student_access_attempts where student_id in (
    select id from public.students where profile_id = p_profile_id);
  delete from public.password_reset_requests where profile_id = p_profile_id;

  -- Everything else that names this account and can do without it. Discovered rather than listed, so
  -- a table added next year is covered by the same rule as the ones here.
  for reference in
    select conrelid::regclass::text as table_name, attname as column_name
    from pg_constraint
    join pg_attribute on pg_attribute.attrelid = pg_constraint.conrelid
      and pg_attribute.attnum = pg_constraint.conkey[1]
    where confrelid = 'public.user_profiles'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 1
      and conrelid <> 'public.user_profiles'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', reference.table_name, reference.column_name)
      into held using p_profile_id;
    if held > 0 then
      begin
        execute format('update %s set %I = null where %I = $1',
          reference.table_name, reference.column_name, reference.column_name) using p_profile_id;
      exception when others then
        blocking := blocking || format('%s.%s (%s)', reference.table_name, reference.column_name, sqlerrm);
      end;
    end if;
  end loop;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, actor, 'MEMBER_ACCOUNT_ERASED', coalesce(role_here,'member'), p_profile_id,
      jsonb_build_object('displayName', label, 'role', role_here));

  return jsonb_build_object(
    'profileId', p_profile_id, 'displayName', label, 'role', role_here,
    'blocking', to_jsonb(blocking),
    -- The roster row is deliberately still there, and an administrator should be told so rather than
    -- discover it: the person is still a student of this school, they simply cannot sign in.
    'rosterKept', true
  );
end $$;

drop function if exists public.erase_member_account(uuid,uuid);

revoke all on function public.erase_member_account(uuid,uuid,uuid) from public,anon;
grant execute on function public.erase_member_account(uuid,uuid,uuid) to authenticated, service_role;

comment on function public.erase_member_account(uuid,uuid,uuid) is
  'Releases every reference to one account so it can be deleted. Keeps the roster row and the log.';

commit;
