-- A second factor for the account that can suspend any school.
--
-- Re-authentication was a password inside a fifteen-minute window. That is a good answer to "is the
-- console unattended" and no answer at all to "is this the operator" -- a stolen password is still
-- one secret, and the account it opens can suspend a school, revoke a device or read a customer's
-- product key. The validation report has named this as an outstanding risk since the console
-- shipped.
--
-- Where the check lives is the whole design. The obvious place is inside `platform_reauth_fresh`,
-- reading `auth.jwt()->>'aal'` -- and it is wrong, because half the callers have no session. The
-- dangerous RPCs are called by the operator's own browser, but the gateway calls the same function
-- as `service_role` while holding `p_actor`, and `auth.jwt()` there belongs to the service role. A
-- check in that position would pass for every Edge Function call and fail for none.
--
-- So the assurance level is recorded when it is known -- at the moment the gateway proves the
-- password, reading the claim from the caller's own token -- and read back afterwards. The database
-- still decides; it decides on a fact it wrote down rather than one it cannot see.
--
-- Enrolment is not forced on an operator who has none yet, because it cannot be: an operator locked
-- out of the console cannot reach the screen that enrols a factor. What is enforced is that an
-- operator who *has* enrolled must use it -- so a stolen password stops being sufficient the moment
-- the real operator sets one up, and `platform_mfa_status` tells the console who has not.

begin;

alter table public.platform_admins
  add column if not exists last_reauth_aal text;

comment on column public.platform_admins.last_reauth_aal is
  'Assurance level of the session that last proved this operator''s password: aal1 or aal2.';

/**
 * Records that the operator proved their password, and at what assurance level.
 *
 * The gateway passes the level because it is the only thing that can see it: it holds the caller's
 * token. Defaulting to `aal1` when the caller says nothing is deliberate -- an unstated level is not
 * evidence of a second factor.
 */
create or replace function public.record_platform_reauth(p_actor uuid, p_aal text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare level text := case when lower(coalesce(p_aal,'')) = 'aal2' then 'aal2' else 'aal1' end;
begin
  update public.platform_admins
    set last_reauth_at=clock_timestamp(), last_seen_at=clock_timestamp(), last_reauth_aal=level
    where profile_id=p_actor;
  perform public.record_platform_event(p_actor,'PLATFORM_REAUTHENTICATED',null,null,'',
    jsonb_build_object('aal', level));
end $$;

-- The single-argument form stays callable so a gateway deployed before this migration keeps working.
-- It records `aal1`, which is exactly what an older gateway can prove.
create or replace function public.record_platform_reauth(p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.record_platform_reauth(p_actor, 'aal1');
end $$;

revoke all on function public.record_platform_reauth(uuid,text) from public,anon,authenticated;
grant execute on function public.record_platform_reauth(uuid,text) to service_role;

/** Whether this operator has a second factor they are expected to use. */
create or replace function public.platform_operator_has_mfa(p_actor uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from auth.mfa_factors
    where user_id = p_actor and status = 'verified'
  );
$$;

revoke all on function public.platform_operator_has_mfa(uuid) from public,anon;
grant execute on function public.platform_operator_has_mfa(uuid) to authenticated, service_role;

/**
 * Whether this operator proved themselves recently enough, and thoroughly enough.
 *
 * An operator with no factor is held to the old rule; one who has enrolled must have proved the
 * password from a session that had already cleared the second factor. Nothing here reads the current
 * session, on purpose -- see the note at the top of this migration.
 */
create or replace function public.platform_reauth_fresh(p_actor uuid, p_minutes integer default 15)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.platform_admins a
    where a.profile_id = p_actor and a.last_reauth_at is not null
      and a.last_reauth_at > now() - make_interval(mins => greatest(coalesce(p_minutes,15),1))
      and (not public.platform_operator_has_mfa(p_actor) or coalesce(a.last_reauth_aal,'aal1') = 'aal2')
  );
$$;

revoke all on function public.platform_reauth_fresh(uuid,integer) from public,anon;
grant execute on function public.platform_reauth_fresh(uuid,integer) to authenticated, service_role;

comment on function public.platform_reauth_fresh(uuid,integer) is
  'Recent password proof, at aal2 for any operator who has enrolled a second factor.';

/**
 * Who among the operators has a second factor, and whether this one does.
 *
 * The roster matters more than the personal answer. "MFA is available" is not a security property;
 * "every account that can suspend a school has one" is, and an operator cannot tell the difference
 * without being able to see the other operators.
 */
create or replace function public.platform_mfa_status()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'enrolled', public.platform_operator_has_mfa(actor),
    'sessionAal', coalesce(auth.jwt()->>'aal', 'aal1'),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', a.profile_id, 'displayName', p.display_name,
        'enrolled', public.platform_operator_has_mfa(a.profile_id),
        'lastReauthAt', a.last_reauth_at, 'lastReauthAal', a.last_reauth_aal
      ) order by p.display_name)
      from public.platform_admins a
      left join public.user_profiles p on p.id = a.profile_id
      where a.status = 'active' and a.revoked_at is null
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.platform_mfa_status() from public,anon;
grant execute on function public.platform_mfa_status() to authenticated;

commit;
