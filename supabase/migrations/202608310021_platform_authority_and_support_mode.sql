-- Platform authority: the operator of the whole service, and the audited way they enter one school.
--
-- Two roles are being kept apart here, and the distinction is the point of the migration.
--
--   A school administrator runs one school completely and has no reach at all into a second one.
--   That is a `school_memberships` row with role 'admin', and nothing in this file changes it.
--
--   A platform administrator operates the service: every school's health, the error and sync
--   centres, releases, feature flags, device revocation, suspension. They belong to no school, so
--   they get no membership anywhere — a membership is a claim about a school, and inventing one in
--   every school would make the two roles indistinguishable in exactly the records that are supposed
--   to tell them apart.
--
-- Reading everything without disabling RLS
--
--   Not one policy is loosened. Platform reads go through security-definer functions that check
--   `is_platform_admin` for themselves and return aggregates, so an ordinary session calling the
--   same table directly is refused by the same policy it always was.
--
-- Entering a school
--
--   A platform administrator helping a school cannot do it by reading dashboards. They need to
--   operate, and the honest way to allow that is not to quietly impersonate an administrator: it is
--   a support session that names a school, carries a reason, expires by itself, and is stamped onto
--   every record the actions leave behind. The three authority functions the schema already relies
--   on learn about that session, so every existing policy inherits it unchanged and nothing has to
--   be re-audited policy by policy.

begin;

-- ---------------------------------------------------------------------------
-- Who operates the platform
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  profile_id uuid primary key references public.user_profiles(id) on delete cascade,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active','suspended')),
  -- Second-factor enrolment is recorded rather than enforced here: the schema's job is to know
  -- whether an operator has one, so a policy about dangerous actions can be written against it.
  mfa_enrolled_at timestamptz,
  granted_by uuid references public.user_profiles(id),
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles(id),
  last_seen_at timestamptz,
  notes text not null default ''
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

comment on table public.platform_admins is
  'Service operators. Deliberately not a school membership: platform authority is not a claim about any school.';

/**
 * Whether this account operates the platform.
 *
 * Written for a named actor as well as for the current session, because the trusted gateway carries
 * the actor explicitly and cannot lean on auth.uid().
 */
create or replace function public.is_platform_admin(p_actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.platform_admins a
    where a.profile_id = p_actor and a.status = 'active' and a.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Support sessions
-- ---------------------------------------------------------------------------
create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references public.user_profiles(id),
  school_id uuid not null references public.schools(id),
  reason text not null check (char_length(trim(reason)) >= 8),
  started_at timestamptz not null default clock_timestamp(),
  -- Every session ends. An operator who forgets to leave is removed by the clock, which is why the
  -- authority check below reads this column rather than a status flag somebody has to maintain.
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('operator','expired','revoked')),
  actions_recorded integer not null default 0,
  created_ip_hash text not null default ''
);
create index if not exists support_sessions_active_idx
  on public.support_sessions(platform_admin_id, school_id, expires_at desc) where ended_at is null;
create index if not exists support_sessions_school_idx
  on public.support_sessions(school_id, started_at desc);

alter table public.support_sessions enable row level security;
revoke all on public.support_sessions from public, anon, authenticated;

comment on table public.support_sessions is
  'Time-boxed, reasoned entry by a platform operator into one school. Never a membership, never silent.';

/**
 * The session this caller is currently operating a school under, if any.
 *
 * Marked stable and kept trivial because the authority functions below call it on every row they
 * are asked about.
 */
create or replace function public.active_support_session(p_school_id uuid, p_actor uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select s.id from public.support_sessions s
  where s.platform_admin_id = p_actor and s.school_id = p_school_id
    and s.ended_at is null and s.expires_at > now()
    and public.is_platform_admin(p_actor)
  order by s.started_at desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Teaching the existing authority functions about support sessions
-- ---------------------------------------------------------------------------
-- These three are what every policy in the schema is written against. Extending them here is what
-- makes a support session work everywhere at once — and, just as importantly, what makes it stop
-- everywhere at once when the session expires.

create or replace function public.is_active_member(target_school uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.school_id=target_school and m.profile_id=(select auth.uid()) and m.status='active'
      and m.active_from<=now() and (m.active_until is null or m.active_until>now())
  ) or public.active_support_session(target_school, (select auth.uid())) is not null;
$$;

/**
 * Membership in a school with a given role — or a platform operator inside a live support session.
 *
 * Support authority answers only for 'admin'. A support session is there to let somebody do an
 * administrator's job for a while; it is not there to make them a student, a parent or a teacher of
 * that school, and the records that say who taught a class or who a child belongs to must keep
 * meaning what they say.
 */
create or replace function public.has_school_role(target_school uuid, target_role public.membership_role)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.school_id=target_school and m.profile_id=(select auth.uid()) and m.role=target_role
      and m.status='active' and m.active_from<=now() and (m.active_until is null or m.active_until>now())
      and (target_role <> 'teacher' or public.is_verified_teacher(target_school,(select auth.uid())))
  ) or (
    target_role = 'admin'
    and public.active_support_session(target_school, (select auth.uid())) is not null
  );
$$;

create or replace function public.can_operate_school(target_school uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_school_role(target_school,'admin')
    or public.is_verified_teacher(target_school,(select auth.uid()));
$$;

/** The named-actor form the trusted gateway uses, taught the same rule. */
create or replace function public.member_can_operate(p_actor uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.profile_id=p_actor and m.school_id=p_school_id and m.status='active'
      and (m.role='admin' or (m.role='teacher' and exists(
        select 1 from public.teachers t where t.school_id=m.school_id and t.profile_id=p_actor
          and t.status='active' and t.deleted_at is null and t.verification_status='verified_teacher')))
  ) or public.active_support_session(p_school_id, p_actor) is not null;
$$;

/**
 * Teacher-code authority, taught the same rule.
 *
 * A support session admits the operator here because issuing a teacher code is an administrator act
 * and a school locked out of its own code is a real support case. It stays out of reach of teachers,
 * which was the reason this function exists separately at all.
 */
create or replace function public.member_is_school_admin(p_actor uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.profile_id=p_actor and m.school_id=p_school_id and m.role='admin'
      and m.status='active' and m.active_from<=now()
      and (m.active_until is null or m.active_until>now())
  ) or public.active_support_session(p_school_id, p_actor) is not null;
$$;

revoke all on function public.is_platform_admin(uuid) from public, anon;
revoke all on function public.active_support_session(uuid,uuid) from public, anon;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.active_support_session(uuid,uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Every action taken under support carries the session that allowed it
-- ---------------------------------------------------------------------------
alter table public.audit_log add column if not exists support_session_id uuid references public.support_sessions(id);
create index if not exists audit_log_support_idx on public.audit_log(support_session_id, occurred_at desc)
  where support_session_id is not null;

/**
 * Stamps the support session onto an audit record, and counts it.
 *
 * A trigger rather than a parameter: dozens of functions already write to the audit log, and asking
 * every one of them to remember to pass the session would mean the one that forgot is the one that
 * mattered. This way the stamp is not something the calling code can decline to apply.
 */
create or replace function public.stamp_support_session()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare session_id uuid;
begin
  if new.support_session_id is not null or new.actor_profile_id is null then return new; end if;
  session_id := public.active_support_session(new.school_id, new.actor_profile_id);
  if session_id is null then return new; end if;
  new.support_session_id := session_id;
  update public.support_sessions set actions_recorded = actions_recorded + 1 where id = session_id;
  return new;
end $$;

drop trigger if exists audit_log_stamp_support on public.audit_log;
create trigger audit_log_stamp_support before insert on public.audit_log
  for each row execute function public.stamp_support_session();

-- ---------------------------------------------------------------------------
-- What the operations centre reads
-- ---------------------------------------------------------------------------

-- Devices already carry a school and a heartbeat. Operations needs to know what is running on them,
-- because "which schools are on a client too old for the current protocol" is the question behind
-- most sync incidents.
alter table public.devices
  add column if not exists profile_id uuid references public.user_profiles(id),
  add column if not exists client_version text not null default '',
  add column if not exists protocol_version integer,
  add column if not exists trusted boolean not null default false,
  add column if not exists revoked_by uuid references public.user_profiles(id),
  add column if not exists revoked_reason text;

create or replace function public.register_device(
  p_school_id uuid, p_device_id uuid, p_device_name text, p_device_type text,
  p_client_version text default '', p_protocol_version integer default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_active_member(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_device_type not in ('board','desktop','tablet','mobile') then raise exception 'VALIDATION_ERROR'; end if;
  -- A revoked device that comes back is refused rather than quietly re-registered: revocation that
  -- undoes itself on the next sync is not revocation.
  if exists(select 1 from public.devices where id=p_device_id and revoked_at is not null) then
    raise exception 'DEVICE_REVOKED' using errcode='42501';
  end if;
  insert into public.devices(id,school_id,device_name,device_type,status,last_seen_at,
    profile_id,client_version,protocol_version)
  values(p_device_id,p_school_id,left(trim(p_device_name),120),p_device_type,'active',clock_timestamp(),
    auth.uid(),left(coalesce(p_client_version,''),40),p_protocol_version)
  on conflict(id) do update set device_name=excluded.device_name,device_type=excluded.device_type,
    last_seen_at=clock_timestamp(),updated_at=clock_timestamp(),profile_id=excluded.profile_id,
    client_version=excluded.client_version,protocol_version=excluded.protocol_version
  where public.devices.school_id=p_school_id and public.devices.revoked_at is null;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,auth.uid(),'device_register','device',p_device_id,
      jsonb_build_object('name',p_device_name,'type',p_device_type,'clientVersion',p_client_version));
  return p_device_id;
end $$;
revoke all on function public.register_device(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.register_device(uuid,uuid,text,text,text,integer) to authenticated;

-- Errors reported by clients and by server paths that would otherwise fail silently.
create table if not exists public.platform_error_events (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id),
  profile_id uuid references public.user_profiles(id),
  device_id uuid,
  feature text not null default '',
  severity text not null default 'medium' check (severity in ('critical','high','medium','low')),
  code text not null default '',
  -- Deliberately a message and a context, never a payload: a log that carries records carries
  -- whatever was in them, and an operations screen is the wrong place to read a child's marks.
  message text not null default '',
  context_json jsonb not null default '{}',
  client_version text not null default '',
  protocol_version integer,
  occurred_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id)
);
create index if not exists platform_error_events_recent_idx
  on public.platform_error_events(occurred_at desc);
create index if not exists platform_error_events_school_idx
  on public.platform_error_events(school_id, severity, occurred_at desc);

alter table public.platform_error_events enable row level security;
revoke all on public.platform_error_events from public, anon, authenticated;

/** Records one error. Any signed-in client may report; nobody may read back through this path. */
create or replace function public.report_error_event(
  p_school_id uuid, p_feature text, p_severity text, p_code text, p_message text,
  p_context jsonb default '{}', p_client_version text default '', p_protocol_version integer default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_school_id is not null and not public.is_active_member(p_school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  insert into public.platform_error_events(school_id,profile_id,feature,severity,code,message,
    context_json,client_version,protocol_version)
  values(p_school_id,auth.uid(),left(coalesce(p_feature,''),80),
    case when p_severity in ('critical','high','medium','low') then p_severity else 'medium' end,
    left(coalesce(p_code,''),120),left(coalesce(p_message,''),1000),
    coalesce(p_context,'{}'::jsonb),left(coalesce(p_client_version,''),40),p_protocol_version);
end $$;
revoke all on function public.report_error_event(uuid,text,text,text,text,jsonb,text,integer) from public,anon;
grant execute on function public.report_error_event(uuid,text,text,text,text,jsonb,text,integer) to authenticated;

-- Feature flags control rollout. They are not authorisation, and the read function says so by
-- refusing to answer for a school the caller is not in.
create table if not exists public.feature_flags (
  key text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  -- Null school means the platform default; a row with a school overrides it for that school alone.
  school_id uuid references public.schools(id),
  enabled boolean not null default false,
  description text not null default '',
  updated_by uuid references public.user_profiles(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (key, school_id)
);
create unique index if not exists feature_flags_global_key
  on public.feature_flags(key) where school_id is null;
alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from public, anon, authenticated;
grant select on public.feature_flags to authenticated;
drop policy if exists feature_flags_readable on public.feature_flags;
create policy feature_flags_readable on public.feature_flags for select to authenticated
  using (school_id is null or public.is_active_member(school_id));

-- Releases and the minimum client the protocol still accepts.
create table if not exists public.platform_releases (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('production','staging','beta')),
  version text not null,
  minimum_supported_version text not null default '',
  protocol_version integer not null default 1,
  release_notes text not null default '',
  released_at timestamptz not null default clock_timestamp(),
  released_by uuid references public.user_profiles(id),
  is_current boolean not null default true
);
create unique index if not exists platform_releases_current
  on public.platform_releases(channel) where is_current;
alter table public.platform_releases enable row level security;
revoke all on public.platform_releases from public, anon, authenticated;
grant select on public.platform_releases to authenticated;
drop policy if exists platform_releases_readable on public.platform_releases;
create policy platform_releases_readable on public.platform_releases for select to authenticated
  using (is_current);

-- Security events that belong to the platform rather than to any one school.
create table if not exists public.platform_security_events (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.user_profiles(id),
  action text not null,
  target_school_id uuid references public.schools(id),
  target_profile_id uuid references public.user_profiles(id),
  support_session_id uuid references public.support_sessions(id),
  reason text not null default '',
  metadata_json jsonb not null default '{}',
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists platform_security_events_recent
  on public.platform_security_events(occurred_at desc);
alter table public.platform_security_events enable row level security;
revoke all on public.platform_security_events from public, anon, authenticated;

/** Writes one platform-level security record. Called by the operations functions below. */
create or replace function public.record_platform_event(
  p_actor uuid, p_action text, p_school_id uuid, p_profile_id uuid, p_reason text, p_metadata jsonb
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.platform_security_events(actor_profile_id,action,target_school_id,target_profile_id,
    support_session_id,reason,metadata_json)
  values(p_actor,p_action,p_school_id,p_profile_id,
    case when p_school_id is null then null else public.active_support_session(p_school_id,p_actor) end,
    left(coalesce(p_reason,''),400),coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function public.record_platform_event(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_platform_event(uuid,text,uuid,uuid,text,jsonb) to service_role;

commit;
