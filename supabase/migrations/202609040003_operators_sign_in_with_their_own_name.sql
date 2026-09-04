-- Turning an operator's name into the account it belongs to.
--
-- The console had no production entrance at all: `PlatformGate` rendered the development door or a
-- notice telling you to enable it, and that door signs a person in as an operator without asking
-- who they are — it works because there is exactly one, which is a property of a small deployment
-- rather than a way to authenticate anybody.
--
-- Now that an operator's account carries its own password, the ordinary rule of this product
-- applies to them as well: a name and a password, never an email address. This resolves the first
-- half. The password is GoTrue's business and is checked in the Edge Function that calls it, the
-- way every other entrance in this system does it.
--
-- Only active operators are returned. A revoked one is not a candidate — the door should not be the
-- place that discovers a person's authority was withdrawn, and returning them here would let a
-- correct password produce a session for somebody the platform has already dismissed.

create or replace function public.resolve_platform_operator_login(p_name text)
returns table(profile_id uuid, auth_email text)
language plpgsql security definer set search_path=public,pg_temp,auth as $$
declare
  wanted text := lower(regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g'));
begin
  if char_length(wanted) < 2 then
    return;
  end if;
  return query
    select a.profile_id, u.email::text
      from public.platform_admins a
      join auth.users u on u.id = a.profile_id
     where a.status = 'active'
       and a.revoked_at is null
       and u.email is not null
       -- Compared the same way the name was typed: collapsed whitespace, case folded. Storing the
       -- name unnormalised and normalising on the way in keeps the display name a person's to
       -- capitalise as they like.
       and lower(regexp_replace(trim(a.display_name),'\s+',' ','g')) = wanted
     -- Bounded because the caller tries a password against every row this returns. A name shared by
     -- half the operators must not become a way to test one password against all of them at once.
     limit 5;
end $$;

revoke all on function public.resolve_platform_operator_login(text) from public,anon,authenticated;
grant execute on function public.resolve_platform_operator_login(text) to service_role;

-- Two active operators answering to one name would make a correct password ambiguous, and the door
-- refuses rather than guessing. This makes that state hard to reach in the first place; it is a
-- partial index so a revoked operator keeps their name and history.
--
-- Created without `concurrently` on purpose: it must either exist when this migration finishes or
-- fail the migration, and a deployment that already holds a duplicate should stop here and be
-- looked at rather than carry on with an ambiguous door.
create unique index if not exists platform_admins_active_display_name_key
  on public.platform_admins (lower(regexp_replace(trim(display_name),'\s+',' ','g')))
  where status = 'active' and revoked_at is null and display_name <> '';
