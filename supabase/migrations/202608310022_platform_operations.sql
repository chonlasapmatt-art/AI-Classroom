-- The operations centre: what a platform operator can see, and what they can do.
--
-- Everything in this file is a security-definer function that checks `is_platform_admin` for itself.
-- That is the whole authorisation model for the console, and it was chosen over adding policies to
-- fifty tables for one reason: a policy is a rule about a row, and almost nothing here is a row. An
-- operator asks "how many schools are unhealthy" and "which clients are behind the protocol", and
-- the honest answer to both is a computed aggregate that no row-level rule could express.
--
-- The reads return aggregates and identifiers. They do not return a child's marks, a parent's
-- contact details or the contents of a submission — running the service does not require reading
-- what the service holds, and an operations screen that showed it would make every operator a
-- reader of every school. When an operator genuinely needs to work inside a school, they start a
-- support session and use the ordinary school screens, where the ordinary policies apply and every
-- action is stamped with the session that allowed it.
--
-- The actions that change something all take a reason, all write a platform security event, and all
-- prefer suspension to deletion.

begin;

-- ---------------------------------------------------------------------------
-- Bootstrapping and managing operators
-- ---------------------------------------------------------------------------
-- Service-role only. The first operator is created by the deployment through the trusted gateway,
-- after a code held in the server environment is checked; no signed-in session can reach this.

create or replace function public.grant_platform_admin(
  p_actor uuid, p_profile_id uuid, p_display_name text default '', p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing_count integer;
begin
  if p_profile_id is null or not exists(select 1 from public.user_profiles where id=p_profile_id) then
    raise exception 'NOT_FOUND';
  end if;
  select count(*) into existing_count from public.platform_admins where status='active' and revoked_at is null;
  -- After the first, granting platform authority is itself a platform action: an operator does it,
  -- and it is recorded as one.
  if existing_count > 0 and not public.is_platform_admin(p_actor) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  insert into public.platform_admins(profile_id, display_name, granted_by, notes)
    values(p_profile_id, left(coalesce(p_display_name,''),200), p_actor, left(coalesce(p_notes,''),400))
  on conflict(profile_id) do update set status='active', revoked_at=null, revoked_by=null,
    display_name=coalesce(nullif(excluded.display_name,''), public.platform_admins.display_name),
    notes=excluded.notes;

  perform public.record_platform_event(p_actor,'PLATFORM_ADMIN_GRANTED',null,p_profile_id,
    coalesce(p_notes,''), jsonb_build_object('bootstrap', existing_count = 0));
  return jsonb_build_object('profileId', p_profile_id, 'bootstrap', existing_count = 0);
end $$;

create or replace function public.revoke_platform_admin(p_actor uuid, p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare remaining integer;
begin
  if not public.is_platform_admin(p_actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 4 then raise exception 'VALIDATION_ERROR: reason required'; end if;
  select count(*) into remaining from public.platform_admins
    where status='active' and revoked_at is null and profile_id <> p_profile_id;
  -- A platform with no operator cannot be recovered from inside the platform.
  if remaining = 0 then raise exception 'LAST_PLATFORM_ADMIN' using errcode='42501'; end if;

  update public.platform_admins set status='suspended', revoked_at=clock_timestamp(), revoked_by=p_actor
    where profile_id=p_profile_id;
  -- Any school they were inside stops being theirs to operate the moment authority is withdrawn.
  update public.support_sessions set ended_at=clock_timestamp(), ended_reason='revoked'
    where platform_admin_id=p_profile_id and ended_at is null;
  perform public.record_platform_event(p_actor,'PLATFORM_ADMIN_REVOKED',null,p_profile_id,p_reason,'{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Proving it is still them
-- ---------------------------------------------------------------------------
-- Suspending a school and raising the minimum client version are not actions to take from an
-- unattended laptop. Each one below requires the operator to have re-entered their password
-- recently, which the gateway verifies and records here — the check is in the database rather than
-- in the console, so a direct API call faces it too.

alter table public.platform_admins add column if not exists last_reauth_at timestamptz;

create or replace function public.record_platform_reauth(p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.platform_admins set last_reauth_at=clock_timestamp(), last_seen_at=clock_timestamp()
    where profile_id=p_actor;
  perform public.record_platform_event(p_actor,'PLATFORM_REAUTHENTICATED',null,null,'','{}'::jsonb);
end $$;
revoke all on function public.record_platform_reauth(uuid) from public,anon,authenticated;
grant execute on function public.record_platform_reauth(uuid) to service_role;

/** Whether this operator proved their password within the window a dangerous action requires. */
create or replace function public.platform_reauth_fresh(p_actor uuid, p_minutes integer default 15)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.platform_admins
    where profile_id=p_actor and last_reauth_at is not null
      and last_reauth_at > now() - make_interval(mins => greatest(coalesce(p_minutes,15),1))
  );
$$;
revoke all on function public.platform_reauth_fresh(uuid,integer) from public,anon;
grant execute on function public.platform_reauth_fresh(uuid,integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Support mode
-- ---------------------------------------------------------------------------

/**
 * Enters a school, for a stated reason and a stated length of time.
 *
 * The reason is required and stored because "why was an operator in our school on Tuesday" is a
 * question a school is entitled to ask and get an answer to. The duration is capped rather than
 * open-ended: an operator who needs longer starts another session, which leaves a second record.
 */
create or replace function public.start_support_session(
  p_school_id uuid, p_reason text, p_minutes integer default 60
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); session_id uuid; school public.schools%rowtype; minutes integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'VALIDATION_ERROR: reason required';
  end if;
  select * into school from public.schools where id=p_school_id and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  minutes := least(greatest(coalesce(p_minutes,60), 5), 240);

  -- One school at a time. An operator holding sessions in several schools at once cannot answer
  -- which one an action belonged to, and neither can the log.
  update public.support_sessions set ended_at=clock_timestamp(), ended_reason='operator'
    where platform_admin_id=actor and ended_at is null;

  insert into public.support_sessions(platform_admin_id, school_id, reason, expires_at)
    values(actor, p_school_id, trim(p_reason), clock_timestamp() + make_interval(mins => minutes))
    returning id into session_id;

  update public.platform_admins set last_seen_at=clock_timestamp() where profile_id=actor;
  perform public.record_platform_event(actor,'SUPPORT_SESSION_STARTED',p_school_id,null,trim(p_reason),
    jsonb_build_object('minutes', minutes, 'sessionId', session_id));
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json,support_session_id)
    values(p_school_id,actor,'SUPPORT_SESSION_STARTED','support_session',session_id,
      jsonb_build_object('reason',trim(p_reason),'minutes',minutes),session_id);

  return jsonb_build_object('sessionId',session_id,'schoolId',p_school_id,'schoolName',school.name,
    'reason',trim(p_reason),'expiresAt',clock_timestamp() + make_interval(mins => minutes),
    'serverTime',clock_timestamp());
end $$;

create or replace function public.end_support_session(p_session_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); ended public.support_sessions%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  update public.support_sessions set ended_at=clock_timestamp(), ended_reason='operator'
    where platform_admin_id=actor and ended_at is null
      and (p_session_id is null or id=p_session_id)
    returning * into ended;
  if ended.id is not null then
    perform public.record_platform_event(actor,'SUPPORT_SESSION_ENDED',ended.school_id,null,ended.reason,
      jsonb_build_object('sessionId',ended.id,'actionsRecorded',ended.actions_recorded));
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json,support_session_id)
      values(ended.school_id,actor,'SUPPORT_SESSION_ENDED','support_session',ended.id,
        jsonb_build_object('actionsRecorded',ended.actions_recorded),ended.id);
  end if;
end $$;

/**
 * What the banner shows. Returns nothing at all when no session is live, including when one expired
 * a second ago — the screen must stop claiming authority at the same moment the database does.
 */
create or replace function public.current_support_session()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); session public.support_sessions%rowtype; school_name text;
begin
  if actor is null then return jsonb_build_object('active', false); end if;
  select * into session from public.support_sessions
    where platform_admin_id=actor and ended_at is null and expires_at > now()
    order by started_at desc limit 1;
  if not found then return jsonb_build_object('active', false); end if;
  select name into school_name from public.schools where id=session.school_id;
  return jsonb_build_object('active', true, 'sessionId', session.id, 'schoolId', session.school_id,
    'schoolName', school_name, 'reason', session.reason, 'startedAt', session.started_at,
    'expiresAt', session.expires_at, 'actionsRecorded', session.actions_recorded,
    'serverTime', now());
end $$;

-- ---------------------------------------------------------------------------
-- School health
-- ---------------------------------------------------------------------------

/**
 * One school's operational state, derived rather than stored.
 *
 * Stored health goes stale the moment nothing runs, and the moment it goes stale it is worse than no
 * health at all: an operator reads "healthy" off a row written before the incident. Deriving it
 * means the answer is about now, every time it is asked.
 */
create or replace function public.school_health(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  school public.schools%rowtype;
  critical_errors integer;
  high_errors integer;
  open_conflicts integer;
  device_count integer;
  stale_devices integer;
  behind_devices integer;
  last_sync timestamptz;
  last_activity timestamptz;
  minimum_protocol integer;
  status text := 'healthy';
  reasons text[] := '{}';
begin
  -- A platform operator asks about any school; a school's own administrator asks about theirs. The
  -- function is granted to `authenticated` so both can call it, so it decides for itself which of
  -- the two the caller is rather than assuming the grant already said.
  if not (public.is_platform_admin(auth.uid()) or public.has_school_role(p_school_id,'admin')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into school from public.schools where id=p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select coalesce(protocol_version,1) into minimum_protocol from public.platform_releases
    where channel='production' and is_current limit 1;
  minimum_protocol := coalesce(minimum_protocol, 1);

  select count(*) filter (where severity='critical'), count(*) filter (where severity='high')
    into critical_errors, high_errors
    from public.platform_error_events
    where school_id=p_school_id and resolved_at is null and occurred_at > now() - interval '24 hours';

  select count(*) into open_conflicts from public.sync_conflicts
    where school_id=p_school_id and status='needs_review';

  select count(*), count(*) filter (where last_successful_sync_at is null or last_successful_sync_at < now() - interval '7 days'),
         count(*) filter (where protocol_version is not null and protocol_version < minimum_protocol),
         max(last_successful_sync_at)
    into device_count, stale_devices, behind_devices, last_sync
    from public.devices where school_id=p_school_id and revoked_at is null;

  select max(occurred_at) into last_activity from public.audit_log where school_id=p_school_id;

  if school.status <> 'active' then
    status := 'critical'; reasons := reasons || 'โรงเรียนถูกระงับการใช้งาน';
  end if;
  if critical_errors > 0 then
    status := 'critical'; reasons := reasons || format('ข้อผิดพลาดร้ายแรง %s รายการใน 24 ชั่วโมง', critical_errors);
  end if;
  if device_count > 0 and stale_devices = device_count then
    status := 'critical'; reasons := reasons || 'ไม่มีอุปกรณ์ใดซิงก์สำเร็จเลยใน 7 วัน';
  end if;

  if status <> 'critical' then
    if high_errors > 0 then
      status := 'warning'; reasons := reasons || format('ข้อผิดพลาดระดับสูง %s รายการ', high_errors);
    end if;
    if open_conflicts > 0 then
      status := 'warning'; reasons := reasons || format('ข้อมูลขัดแย้งรอตรวจสอบ %s รายการ', open_conflicts);
    end if;
    if behind_devices > 0 then
      status := 'warning'; reasons := reasons || format('อุปกรณ์ที่ใช้เวอร์ชันเก่าเกินไป %s เครื่อง', behind_devices);
    end if;
    if last_activity is null or last_activity < now() - interval '14 days' then
      status := 'warning'; reasons := reasons || 'ไม่มีการใช้งานใน 14 วัน';
    end if;
  end if;

  return jsonb_build_object(
    'schoolId', p_school_id, 'status', status, 'reasons', to_jsonb(reasons),
    'criticalErrors', critical_errors, 'highErrors', high_errors, 'openConflicts', open_conflicts,
    'deviceCount', device_count, 'staleDevices', stale_devices, 'outdatedDevices', behind_devices,
    'lastSuccessfulSyncAt', last_sync, 'lastActivityAt', last_activity
  );
end $$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); release public.platform_releases%rowtype;
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into release from public.platform_releases where channel='production' and is_current limit 1;
  return jsonb_build_object(
    'serverTime', now(),
    'schools', jsonb_build_object(
      'total', (select count(*) from public.schools where deleted_at is null),
      'active', (select count(*) from public.schools where status='active' and deleted_at is null),
      'suspended', (select count(*) from public.schools where status<>'active' and deleted_at is null)
    ),
    'people', jsonb_build_object(
      'teachers', (select count(*) from public.teachers where deleted_at is null and status='active'),
      'students', (select count(*) from public.students where deleted_at is null and status='active'),
      'parents', (select count(*) from public.parents),
      'platformAdmins', (select count(*) from public.platform_admins where status='active' and revoked_at is null)
    ),
    'devices', jsonb_build_object(
      'total', (select count(*) from public.devices where revoked_at is null),
      'revoked', (select count(*) from public.devices where revoked_at is not null),
      'staleWeek', (select count(*) from public.devices
        where revoked_at is null and (last_successful_sync_at is null or last_successful_sync_at < now() - interval '7 days'))
    ),
    'sync', jsonb_build_object(
      'conflictsOpen', (select count(*) from public.sync_conflicts where status='needs_review'),
      'changesToday', (select count(*) from public.sync_changes where changed_at > now() - interval '24 hours'),
      'lastChangeAt', (select max(changed_at) from public.sync_changes)
    ),
    'errors', jsonb_build_object(
      'critical', (select count(*) from public.platform_error_events where resolved_at is null and severity='critical'),
      'high', (select count(*) from public.platform_error_events where resolved_at is null and severity='high'),
      'openTotal', (select count(*) from public.platform_error_events where resolved_at is null)
    ),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from public.notification_outbox where status='pending'),
      'failed', (select count(*) from public.notification_outbox where status in ('failed','dead_letter'))
    ),
    'support', jsonb_build_object(
      'activeSessions', (select count(*) from public.support_sessions where ended_at is null and expires_at > now()),
      'sessionsToday', (select count(*) from public.support_sessions where started_at > now() - interval '24 hours')
    ),
    'release', case when release.id is null then null else jsonb_build_object(
      'version', release.version, 'minimumSupportedVersion', release.minimum_supported_version,
      'protocolVersion', release.protocol_version, 'releasedAt', release.released_at) end
  );
end $$;

create or replace function public.platform_schools()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'schoolId', s.id, 'name', s.name, 'code', s.code, 'status', s.status, 'createdAt', s.created_at,
      'teachers', (select count(*) from public.teachers t where t.school_id=s.id and t.deleted_at is null),
      'students', (select count(*) from public.students st where st.school_id=s.id and st.deleted_at is null),
      'health', public.school_health(s.id)
    ) order by s.name)
    from public.schools s where s.deleted_at is null
  ), '[]'::jsonb);
end $$;

/**
 * One school in operational detail.
 *
 * Counts, health, devices and the audit trail — not the records themselves. An operator who needs to
 * see a class list starts a support session and looks at the school's own screens, where the school's
 * own policies decide what they see and the log says they were there.
 */
create or replace function public.platform_school_detail(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare school public.schools%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into school from public.schools where id=p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'schoolId', school.id, 'name', school.name, 'code', school.code, 'status', school.status,
    'timezone', school.timezone, 'createdAt', school.created_at,
    'health', public.school_health(school.id),
    'counts', jsonb_build_object(
      'teachers', (select count(*) from public.teachers where school_id=school.id and deleted_at is null),
      'students', (select count(*) from public.students where school_id=school.id and deleted_at is null),
      'parents', (select count(*) from public.parents where school_id=school.id),
      'classes', (select count(*) from public.classes where school_id=school.id and deleted_at is null),
      'subjects', (select count(*) from public.subjects where school_id=school.id and deleted_at is null),
      'assignments', (select count(*) from public.assignments where school_id=school.id and deleted_at is null),
      'questions', (select count(*) from public.question_bank where school_id=school.id and deleted_at is null),
      'exams', (select count(*) from public.tests where school_id=school.id and deleted_at is null),
      'admins', (select count(*) from public.school_memberships where school_id=school.id and role='admin' and status='active')
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('deviceId', d.id, 'name', d.device_name, 'type', d.device_type,
        'lastSeenAt', d.last_seen_at, 'lastSyncAt', d.last_successful_sync_at,
        'clientVersion', d.client_version, 'protocolVersion', d.protocol_version,
        'trusted', d.trusted, 'revokedAt', d.revoked_at) order by d.last_seen_at desc nulls last)
      from public.devices d where d.school_id=school.id
    ), '[]'::jsonb),
    'recentErrors', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'severity', e.severity, 'feature', e.feature,
        'code', e.code, 'message', e.message, 'occurredAt', e.occurred_at, 'resolvedAt', e.resolved_at)
        order by e.occurred_at desc)
      from (select * from public.platform_error_events where school_id=school.id
            order by occurred_at desc limit 25) e
    ), '[]'::jsonb),
    'recentAudit', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'entityType', a.entity_type,
        'occurredAt', a.occurred_at, 'supportSessionId', a.support_session_id) order by a.occurred_at desc)
      from (select * from public.audit_log where school_id=school.id
            order by occurred_at desc limit 50) a
    ), '[]'::jsonb),
    'supportSessions', coalesce((
      select jsonb_agg(jsonb_build_object('sessionId', s.id, 'reason', s.reason, 'startedAt', s.started_at,
        'expiresAt', s.expires_at, 'endedAt', s.ended_at, 'actionsRecorded', s.actions_recorded)
        order by s.started_at desc)
      from (select * from public.support_sessions where school_id=school.id
            order by started_at desc limit 20) s
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.platform_errors(
  p_school_id uuid default null, p_severity text default null,
  p_since interval default interval '7 days', p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'schoolId', e.school_id, 'schoolName', s.name,
      'severity', e.severity, 'feature', e.feature, 'code', e.code, 'message', e.message,
      'clientVersion', e.client_version, 'protocolVersion', e.protocol_version,
      'occurredAt', e.occurred_at, 'resolvedAt', e.resolved_at) order by e.occurred_at desc)
    from (
      select * from public.platform_error_events
      where occurred_at > now() - coalesce(p_since, interval '7 days')
        and (p_school_id is null or school_id = p_school_id)
        and (p_severity is null or severity = p_severity)
      order by occurred_at desc limit least(coalesce(p_limit,100), 500)
    ) e left join public.schools s on s.id = e.school_id
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_devices(p_school_id uuid default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('deviceId', d.id, 'schoolId', d.school_id, 'schoolName', s.name,
      'name', d.device_name, 'type', d.device_type, 'status', d.status,
      'lastSeenAt', d.last_seen_at, 'lastSyncAt', d.last_successful_sync_at,
      'clientVersion', d.client_version, 'protocolVersion', d.protocol_version,
      'trusted', d.trusted, 'revokedAt', d.revoked_at, 'revokedReason', d.revoked_reason)
      order by d.last_seen_at desc nulls last)
    from (
      select * from public.devices
      where (p_school_id is null or school_id = p_school_id)
      order by last_seen_at desc nulls last limit least(coalesce(p_limit,200), 500)
    ) d left join public.schools s on s.id = d.school_id
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_security_log(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'actorProfileId', e.actor_profile_id,
      'actorName', p.display_name, 'schoolId', e.target_school_id, 'schoolName', s.name,
      'targetProfileId', e.target_profile_id, 'supportSessionId', e.support_session_id,
      'reason', e.reason, 'occurredAt', e.occurred_at) order by e.occurred_at desc)
    from (select * from public.platform_security_events order by occurred_at desc limit least(coalesce(p_limit,100),500)) e
    left join public.schools s on s.id = e.target_school_id
    left join public.user_profiles p on p.id = e.actor_profile_id
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_flags_and_releases()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object('key', f.key, 'schoolId', f.school_id, 'schoolName', s.name,
        'enabled', f.enabled, 'description', f.description, 'updatedAt', f.updated_at)
        order by f.key, s.name nulls first)
      from public.feature_flags f left join public.schools s on s.id = f.school_id
    ), '[]'::jsonb),
    'releases', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'channel', r.channel, 'version', r.version,
        'minimumSupportedVersion', r.minimum_supported_version, 'protocolVersion', r.protocol_version,
        'releaseNotes', r.release_notes, 'releasedAt', r.released_at, 'isCurrent', r.is_current)
        order by r.released_at desc)
      from public.platform_releases r
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
-- Each takes a reason, records a platform event, and changes a status rather than removing a row.

/** Suspends or restores a school. Records stay; access stops. */
create or replace function public.set_school_status(p_school_id uuid, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); school public.schools%rowtype;
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not public.platform_reauth_fresh(actor) then raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'VALIDATION_ERROR'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'VALIDATION_ERROR: reason required'; end if;
  select * into school from public.schools where id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  update public.schools set status=p_status::public.record_status, updated_at=clock_timestamp()
    where id=p_school_id;
  perform public.record_platform_event(actor,
    case when p_status='active' then 'SCHOOL_RESTORED' else 'SCHOOL_SUSPENDED' end,
    p_school_id, null, p_reason, jsonb_build_object('previousStatus', school.status));
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,before_json,after_json,metadata_json)
    values(p_school_id,actor,
      case when p_status='active' then 'SCHOOL_RESTORED' else 'SCHOOL_SUSPENDED' end,
      'school',p_school_id,jsonb_build_object('status',school.status),
      jsonb_build_object('status',p_status),jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('schoolId',p_school_id,'status',p_status);
end $$;

/** Suspends or restores one account across the whole platform. */
create or replace function public.set_profile_status(p_profile_id uuid, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'VALIDATION_ERROR'; end if;
  if not public.platform_reauth_fresh(actor) then raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'VALIDATION_ERROR: reason required'; end if;
  if not exists(select 1 from public.user_profiles where id=p_profile_id) then raise exception 'NOT_FOUND'; end if;

  update public.user_profiles set global_status=p_status::public.record_status, updated_at=clock_timestamp()
    where id=p_profile_id;
  -- A suspended account keeps its memberships but loses the status that makes them count.
  update public.school_memberships set status=case when p_status='active' then 'active' else 'suspended' end,
    updated_at=clock_timestamp() where profile_id=p_profile_id;
  perform public.record_platform_event(actor,
    case when p_status='active' then 'ACCOUNT_RESTORED' else 'ACCOUNT_SUSPENDED' end,
    null, p_profile_id, p_reason, '{}'::jsonb);
  return jsonb_build_object('profileId',p_profile_id,'status',p_status);
end $$;

/** Revokes a device. It cannot re-register itself; a person must add it again deliberately. */
create or replace function public.revoke_device(p_device_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); device public.devices%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into device from public.devices where id=p_device_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- A school's own administrator may revoke a device in their school; a platform operator may
  -- revoke any. Both leave the same record.
  if not (public.is_platform_admin(actor) or public.has_school_role(device.school_id,'admin')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 4 then raise exception 'VALIDATION_ERROR: reason required'; end if;

  update public.devices set revoked_at=clock_timestamp(), revoked_by=actor,
    revoked_reason=left(trim(p_reason),400), status='suspended', updated_at=clock_timestamp()
    where id=p_device_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json)
    values(device.school_id,actor,'DEVICE_REVOKED','device',p_device_id,
      jsonb_build_object('reason',trim(p_reason),'name',device.device_name));
  if public.is_platform_admin(actor) then
    perform public.record_platform_event(actor,'DEVICE_REVOKED',device.school_id,null,p_reason,
      jsonb_build_object('deviceId',p_device_id));
  end if;
  return jsonb_build_object('deviceId',p_device_id,'revoked',true);
end $$;

-- Signing everybody in a school out again.
--
-- Worth being exact about what this can and cannot do. An access token already issued stays
-- cryptographically valid until it expires, so this cannot reach into a device and tear up a session
-- that is already open. What it does is set a moment before which every session is refused: the
-- client checks it whenever it loads or syncs and signs itself out, and the next token refresh has
-- nothing to renew. When the intent is to stop somebody rather than to log them out, suspension is
-- the tool — it is checked by every policy, not by the client.
alter table public.user_profiles add column if not exists force_logout_after timestamptz;

create or replace function public.force_school_logout(p_school_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); affected integer;
begin
  if not (public.is_platform_admin(actor) or public.has_school_role(p_school_id,'admin')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'VALIDATION_ERROR: reason required'; end if;

  update public.user_profiles set force_logout_after=clock_timestamp(), updated_at=clock_timestamp()
    where id in (select profile_id from public.school_memberships where school_id=p_school_id and status='active');
  get diagnostics affected = row_count;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json)
    values(p_school_id,actor,'SCHOOL_FORCE_LOGOUT','school',p_school_id,
      jsonb_build_object('reason',trim(p_reason),'accounts',affected));
  if public.is_platform_admin(actor) then
    perform public.record_platform_event(actor,'SCHOOL_FORCE_LOGOUT',p_school_id,null,p_reason,
      jsonb_build_object('accounts',affected));
  end if;
  return jsonb_build_object('schoolId',p_school_id,'accounts',affected);
end $$;

/** Whether this session was signed out from the outside and should stop using itself. */
create or replace function public.session_revoked_at()
returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
  select force_logout_after from public.user_profiles where id=(select auth.uid());
$$;

create or replace function public.resolve_error_event(p_event_id bigint, p_note text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.platform_error_events set resolved_at=clock_timestamp(), resolved_by=actor
    where id=p_event_id and resolved_at is null;
  perform public.record_platform_event(actor,'ERROR_RESOLVED',null,null,p_note,
    jsonb_build_object('eventId',p_event_id));
end $$;

create or replace function public.set_feature_flag(
  p_key text, p_school_id uuid, p_enabled boolean, p_description text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_key !~ '^[a-z][a-z0-9_]{2,60}$' then raise exception 'VALIDATION_ERROR: key'; end if;
  insert into public.feature_flags(key,school_id,enabled,description,updated_by)
    values(p_key,p_school_id,coalesce(p_enabled,false),left(coalesce(p_description,''),400),actor)
  on conflict(key,school_id) do update set enabled=excluded.enabled,
    description=coalesce(nullif(excluded.description,''), public.feature_flags.description),
    updated_by=actor, updated_at=clock_timestamp();
  perform public.record_platform_event(actor,'FEATURE_FLAG_SET',p_school_id,null,p_description,
    jsonb_build_object('key',p_key,'enabled',p_enabled));
  return jsonb_build_object('key',p_key,'schoolId',p_school_id,'enabled',p_enabled);
end $$;

/**
 * Publishes a release on one channel.
 *
 * The protocol version travels with it because an older client must be refused rather than allowed
 * to write records a newer server would read differently. Raising it is the deliberate act that
 * turns "please update" into "you must".
 */
create or replace function public.publish_release(
  p_channel text, p_version text, p_minimum_version text, p_protocol_version integer, p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); release_id uuid;
begin
  if not public.is_platform_admin(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_channel not in ('production','staging','beta') then raise exception 'VALIDATION_ERROR: channel'; end if;
  if not public.platform_reauth_fresh(actor) then raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if coalesce(trim(p_version),'')='' then raise exception 'VALIDATION_ERROR: version'; end if;
  if coalesce(p_protocol_version,0) < 1 then raise exception 'VALIDATION_ERROR: protocol'; end if;

  update public.platform_releases set is_current=false where channel=p_channel and is_current;
  insert into public.platform_releases(channel,version,minimum_supported_version,protocol_version,
    release_notes,released_by,is_current)
    values(p_channel,trim(p_version),coalesce(trim(p_minimum_version),''),p_protocol_version,
      left(coalesce(p_notes,''),4000),actor,true)
    returning id into release_id;

  perform public.record_platform_event(actor,'RELEASE_PUBLISHED',null,null,p_notes,
    jsonb_build_object('channel',p_channel,'version',p_version,'protocolVersion',p_protocol_version,
      'minimumSupportedVersion',p_minimum_version));
  return jsonb_build_object('releaseId',release_id,'channel',p_channel,'version',p_version);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The console runs as an ordinary signed-in session, so these are granted to `authenticated` and
-- each one checks `is_platform_admin` for itself. Granting to a role rather than checking inside
-- would mean a person's authority was decided when the grant was written rather than when they ask.

revoke all on function public.grant_platform_admin(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.revoke_platform_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grant_platform_admin(uuid,uuid,text,text) to service_role;
grant execute on function public.revoke_platform_admin(uuid,uuid,text) to service_role;

revoke all on function public.start_support_session(uuid,text,integer) from public,anon;
revoke all on function public.end_support_session(uuid) from public,anon;
revoke all on function public.current_support_session() from public,anon;
revoke all on function public.school_health(uuid) from public,anon;
revoke all on function public.platform_overview() from public,anon;
revoke all on function public.platform_schools() from public,anon;
revoke all on function public.platform_school_detail(uuid) from public,anon;
revoke all on function public.platform_errors(uuid,text,interval,integer) from public,anon;
revoke all on function public.platform_devices(uuid,integer) from public,anon;
revoke all on function public.platform_security_log(integer) from public,anon;
revoke all on function public.platform_flags_and_releases() from public,anon;
revoke all on function public.set_school_status(uuid,text,text) from public,anon;
revoke all on function public.set_profile_status(uuid,text,text) from public,anon;
revoke all on function public.revoke_device(uuid,text) from public,anon;
revoke all on function public.force_school_logout(uuid,text) from public,anon;
revoke all on function public.session_revoked_at() from public,anon;
revoke all on function public.resolve_error_event(bigint,text) from public,anon;
revoke all on function public.set_feature_flag(text,uuid,boolean,text) from public,anon;
revoke all on function public.publish_release(text,text,text,integer,text) from public,anon;

grant execute on function public.start_support_session(uuid,text,integer) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;
grant execute on function public.current_support_session() to authenticated;
grant execute on function public.school_health(uuid) to authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_schools() to authenticated;
grant execute on function public.platform_school_detail(uuid) to authenticated;
grant execute on function public.platform_errors(uuid,text,interval,integer) to authenticated;
grant execute on function public.platform_devices(uuid,integer) to authenticated;
grant execute on function public.platform_security_log(integer) to authenticated;
grant execute on function public.platform_flags_and_releases() to authenticated;
grant execute on function public.set_school_status(uuid,text,text) to authenticated;
grant execute on function public.set_profile_status(uuid,text,text) to authenticated;
grant execute on function public.revoke_device(uuid,text) to authenticated;
grant execute on function public.force_school_logout(uuid,text) to authenticated;
grant execute on function public.session_revoked_at() to authenticated;
grant execute on function public.resolve_error_event(bigint,text) to authenticated;
grant execute on function public.set_feature_flag(text,uuid,boolean,text) to authenticated;
grant execute on function public.publish_release(text,text,text,integer,text) to authenticated;

comment on function public.school_health(uuid) is
  'Derived operational state for one school. Never stored, so it can never be stale.';
comment on function public.start_support_session(uuid,text,integer) is
  'Time-boxed, reasoned entry into one school by a platform operator. Ends by the clock, not by memory.';

commit;
