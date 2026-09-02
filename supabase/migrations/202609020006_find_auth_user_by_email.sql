-- One honest way to ask "does an auth user already exist for this address".
--
-- Three provisioning paths — the school administrator creating a teacher, an administrator creating
-- a managed parent or teacher account, and the platform console creating a school administrator —
-- all recover from the same situation: `createUser` failed because the address was already taken by
-- an earlier attempt that got as far as Auth and no further. All three recovered by calling
-- `service.auth.admin.getUserByEmail(email)`, which does not exist in supabase-js v2. The call threw
-- a TypeError, the surrounding catch turned it into a generic failure, and the recovery path had
-- never once worked: retrying a half-finished provision failed forever.
--
-- `find_teacher_auth_user` already did exactly this lookup, correctly, for the teacher sign-in path.
-- What it did not do was say so in its name, and a parent-account path calling a teacher-named
-- function is the kind of thing that gets "cleaned up" later by somebody who reads only the name.
-- So the lookup gets a name that matches what it is. The old function stays, unchanged, because the
-- teacher sign-in path calls it and migrations are added rather than edited.

begin;

/**
 * The auth user for an address, or null.
 *
 * Used only to recover from a create-then-bind retry after the Auth user was created successfully.
 * It is service-role only: an address is a credential-adjacent fact, and answering "does an account
 * exist for this email" to a browser would hand out a membership oracle for free.
 */
create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare found_id uuid;
begin
  if coalesce(trim(p_email),'') = '' then return null; end if;
  select id into found_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  return found_id;
end $$;

revoke all on function public.find_auth_user_by_email(text) from public,anon,authenticated;
grant execute on function public.find_auth_user_by_email(text) to service_role;

comment on function public.find_auth_user_by_email(text) is
  'Service-role-only. Resolves an existing auth user id from an address so a failed provision can be retried.';

commit;
