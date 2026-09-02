begin;

/*
 * A small, privacy-safe read for the Operations Center. Online means that a trusted device sent a
 * heartbeat within the last 15 minutes. It returns identity and operational context only; school
 * records stay behind the school's own RLS and support-session boundary.
 */
create or replace function public.platform_online_people(p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'profileId', person.profile_id,
      'displayName', person.display_name,
      'role', person.role,
      'schoolName', person.school_name,
      'deviceName', person.device_name,
      'deviceType', person.device_type,
      'lastSeenAt', person.last_seen_at
    ) order by person.last_seen_at desc nulls last)
    from (
      select ranked.profile_id, ranked.display_name, ranked.role, ranked.school_name,
        ranked.device_name, ranked.device_type, ranked.last_seen_at
      from (
        select d.profile_id,
          coalesce(nullif(trim(p.display_name), ''), d.device_name, 'ไม่ระบุผู้ใช้') as display_name,
          coalesce(m.role::text, case when pa.profile_id is not null then 'platform_admin' else 'user' end) as role,
          s.name as school_name, d.device_name, d.device_type, d.last_seen_at,
          row_number() over (
            partition by coalesce(d.profile_id::text, 'device:' || d.id::text)
            order by d.last_seen_at desc nulls last
          ) as person_rank
        from public.devices d
        left join public.user_profiles p on p.id=d.profile_id and p.global_status='active'
        left join public.schools s on s.id=d.school_id
        left join public.platform_admins pa on pa.profile_id=d.profile_id
        left join lateral (
          select sm.role
          from public.school_memberships sm
          where sm.profile_id=d.profile_id and sm.status='active'
          order by sm.created_at desc
          limit 1
        ) m on true
        where d.revoked_at is null and d.last_seen_at > now() - interval '15 minutes'
      ) ranked
      where ranked.person_rank=1
      union all
      select pa.profile_id, coalesce(nullif(trim(p.display_name), ''), pa.display_name, 'ผู้ดูแลแพลตฟอร์ม'),
        'platform_admin', null, 'Operations Center', 'platform', pa.last_seen_at
      from public.platform_admins pa
      left join public.user_profiles p on p.id=pa.profile_id
      where pa.status='active' and pa.revoked_at is null
        and pa.last_seen_at > now() - interval '15 minutes'
        and not exists (
          select 1 from public.devices d2
          where d2.profile_id=pa.profile_id and d2.revoked_at is null
            and d2.last_seen_at > now() - interval '15 minutes'
        )
      order by last_seen_at desc nulls last
      limit least(greatest(coalesce(p_limit, 12), 1), 50)
    ) person
  ), '[]'::jsonb);
end $$;

revoke all on function public.platform_online_people(integer) from public,anon;
grant execute on function public.platform_online_people(integer) to authenticated;

commit;
