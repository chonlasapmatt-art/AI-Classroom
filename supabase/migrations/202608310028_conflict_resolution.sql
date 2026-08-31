-- Resolving a sync conflict.
--
-- A conflict is written when a device pushes a change based on a version the server has already
-- moved past — two people edited the same mark, the same attendance row, from two devices. The
-- schema has recorded those since the beginning and nothing could ever close one, so they piled up
-- silently: the push was refused, the device kept the change in its queue, and nobody was ever asked
-- what should win.
--
-- Two answers are possible and both are somebody's decision, not the database's:
--
--   'server' — the value on the server is right; the device's version is discarded.
--   'mine'   — the device's version is right; it is written on top of the current server value.
--
-- Choosing 'mine' goes through the ordinary mutation path rather than writing the row directly. That
-- is the whole point: it takes the current version as its base, so the reapplied value is a normal
-- edit with a normal version bump and a normal revision, and every other device learns about it the
-- same way it learns about anything else.
--
-- Both answers are recorded with who chose and why. A mark that changed because somebody resolved a
-- conflict must be explainable months later.

begin;

alter table public.sync_conflicts
  add column if not exists resolution text
    check (resolution is null or resolution in ('server','mine')),
  add column if not exists resolution_reason text not null default '';

create index if not exists sync_conflicts_open_idx
  on public.sync_conflicts(school_id, created_at desc) where status = 'needs_review';

/**
 * The conflicts a school still has to decide, with enough of each side to decide with.
 *
 * Both payloads are returned because the question being asked is "which of these two is right", and
 * an answer given without seeing both is a guess. They are the school's own records, and the policy
 * on the table already restricts this to its staff.
 */
create or replace function public.open_sync_conflicts(p_school_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'conflictId', c.id, 'entityType', c.entity_type, 'entityId', c.entity_id,
      'baseVersion', c.base_version, 'serverVersion', c.server_version,
      'clientPayload', c.client_payload, 'serverPayload', c.server_payload,
      'deviceName', d.device_name, 'createdAt', c.created_at
    ) order by c.created_at desc)
    from (
      select * from public.sync_conflicts
      where school_id = p_school_id and status = 'needs_review'
      order by created_at desc limit least(coalesce(p_limit, 50), 200)
    ) c left join public.devices d on d.id = c.device_id
  ), '[]'::jsonb);
end $$;

/**
 * Closes one conflict the way a person decided it.
 *
 * Reapplying takes the server's current version as its base, so it cannot itself conflict, and it
 * travels as an ordinary mutation — same idempotency, same revision, same journal. The idempotency
 * key is derived from the conflict id, so pressing the button twice resolves it once.
 */
create or replace function public.resolve_sync_conflict(
  p_conflict_id uuid, p_choice text, p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  conflict public.sync_conflicts%rowtype;
  applied jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_choice not in ('server','mine') then raise exception 'VALIDATION_ERROR: choice'; end if;
  select * into conflict from public.sync_conflicts where id = p_conflict_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(conflict.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if conflict.status <> 'needs_review' then
    return jsonb_build_object('conflictId', conflict.id, 'alreadyResolved', true,
      'resolution', conflict.resolution);
  end if;

  if p_choice = 'mine' then
    applied := public.apply_sync_mutation(
      conflict.school_id, conflict.device_id,
      'conflict-' || replace(conflict.id::text, '-', ''),
      md5(conflict.id::text || conflict.client_payload::text || 'conflict-resolution'),
      conflict.entity_type, conflict.entity_id, 'upsert',
      conflict.client_payload,
      -- The current server version, not the stale one the device pushed against. Reapplying is a
      -- new edit made in full knowledge of what it overwrites.
      conflict.server_version
    );
  end if;

  update public.sync_conflicts set
    status = 'resolved', resolution = p_choice,
    resolution_reason = left(coalesce(trim(p_reason), ''), 400),
    resolved_by = actor, resolved_at = clock_timestamp()
  where id = conflict.id;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id,
    before_json, after_json, metadata_json)
    values(conflict.school_id, actor, 'SYNC_CONFLICT_RESOLVED', conflict.entity_type, conflict.entity_id,
      conflict.server_payload, conflict.client_payload,
      jsonb_build_object('choice', p_choice, 'reason', trim(coalesce(p_reason, '')),
        'baseVersion', conflict.base_version, 'serverVersion', conflict.server_version));

  return jsonb_build_object('conflictId', conflict.id, 'resolution', p_choice,
    'alreadyResolved', false, 'applied', applied);
end $$;

revoke all on function public.open_sync_conflicts(uuid,integer) from public,anon;
revoke all on function public.resolve_sync_conflict(uuid,text,text) from public,anon;
grant execute on function public.open_sync_conflicts(uuid,integer) to authenticated;
grant execute on function public.resolve_sync_conflict(uuid,text,text) to authenticated;

comment on function public.resolve_sync_conflict(uuid,text,text) is
  'Closes one sync conflict. Reapplying the device version goes through the ordinary mutation path against the current server version.';

commit;
