-- Teacher login uses the code entered by a school administrator when the roster row is created.
-- The password is still owned by Supabase Auth and is issued by the managed account workflow.

begin;

create index if not exists teachers_login_code_idx
  on public.teachers(school_id, upper(regexp_replace(trim(teacher_code),'[\s-]','','g')))
  where status='active' and deleted_at is null;

create or replace function public.resolve_member_login(p_role text, p_display_name text)
returns table(profile_id uuid, auth_email text, display_name text, school_id uuid, school_name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
  wanted_code text := upper(regexp_replace(trim(coalesce(p_display_name,'')),'[\s-]','','g'));
begin
  if p_role not in ('teacher','parent') or char_length(wanted)<2 then
    raise exception 'VALIDATION_ERROR';
  end if;

  return query
  select i.profile_id,i.auth_email,i.display_name,
    coalesce(i.school_id,m.school_id),
    coalesce(s.name,ms.name)
  from public.member_login_identities i
  left join public.schools s on s.id=i.school_id
  left join lateral (
    select m2.school_id from public.school_memberships m2
    where m2.profile_id=i.profile_id and m2.status='active'
    order by m2.created_at limit 1
  ) m on true
  left join public.schools ms on ms.id=m.school_id
  left join public.teachers t on t.profile_id=i.profile_id
    and t.school_id=coalesce(i.school_id,m.school_id)
    and t.status='active' and t.deleted_at is null
  where i.status='active'
    and (
      i.normalized_name=wanted
      or (p_role='teacher' and upper(regexp_replace(trim(coalesce(t.teacher_code,'')),'[\s-]','','g'))=wanted_code)
    )
    and (i.role=p_role or (p_role='teacher' and i.role='admin'))
  limit 5;
end $$;

revoke all on function public.resolve_member_login(text,text) from public,anon,authenticated;
grant execute on function public.resolve_member_login(text,text) to service_role;

commit;
