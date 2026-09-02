-- The school owner account is created by register-owner and is attached to its
-- school by 202608310034_owner_onboarding_display_name.sql. This migration makes
-- that saved admin identity available through the normal name + password login.
-- The owner activation code remains a server-side one-time gate and is never
-- copied into a table or browser storage.

begin;

create or replace function public.resolve_member_login(p_role text, p_display_name text)
returns table(profile_id uuid, auth_email text, display_name text, school_id uuid, school_name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare wanted text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
begin
  if p_role not in ('teacher','parent','admin') or char_length(wanted)<2 then
    raise exception 'VALIDATION_ERROR';
  end if;
  return query
  select i.profile_id,i.auth_email,i.display_name,
    coalesce(i.school_id,m.school_id),coalesce(s.name,ms.name)
  from public.member_login_identities i
  left join public.schools s on s.id=i.school_id
  left join lateral (
    select m2.school_id from public.school_memberships m2
    where m2.profile_id=i.profile_id and m2.status='active'
    order by m2.created_at limit 1
  ) m on true
  left join public.schools ms on ms.id=m.school_id
  where i.normalized_name=wanted and i.status='active' and i.role=p_role
  limit 5;
end $$;

revoke all on function public.resolve_member_login(text,text) from public,anon,authenticated;
grant execute on function public.resolve_member_login(text,text) to service_role;

comment on function public.resolve_member_login(text,text)
  is 'Service-role-only name lookup for parent, teacher and saved school-admin login.';

commit;
