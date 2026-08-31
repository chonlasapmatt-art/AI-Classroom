-- Repairs `school_health`, which could not run at all.
--
-- The function declared a variable called `status` and then counted rows in tables that have a
-- column of that name. Postgres refuses to guess which one `where status='needs_review'` means and
-- raises 42702, so every call failed — which meant the operations console could list no schools and
-- open no school, because both go through this function.
--
-- Two things are changed and nothing else. The local variables are renamed so they cannot collide
-- with a column again, and every column reference in the function is qualified with its table. The
-- second is what actually prevents a recurrence: a future variable named after a column is harmless
-- when the column says which table it came from.

begin;

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
  health_status text := 'healthy';
  health_reasons text[] := '{}';
begin
  -- A platform operator asks about any school; a school's own administrator asks about theirs. The
  -- function is granted to `authenticated` so both can call it, so it decides for itself which of
  -- the two the caller is rather than assuming the grant already said.
  if not (public.is_platform_admin(auth.uid()) or public.has_school_role(p_school_id,'admin')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into school from public.schools where public.schools.id = p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select coalesce(r.protocol_version, 1) into minimum_protocol
    from public.platform_releases r
    where r.channel = 'production' and r.is_current limit 1;
  minimum_protocol := coalesce(minimum_protocol, 1);

  select count(*) filter (where e.severity = 'critical'),
         count(*) filter (where e.severity = 'high')
    into critical_errors, high_errors
    from public.platform_error_events e
    where e.school_id = p_school_id and e.resolved_at is null
      and e.occurred_at > now() - interval '24 hours';

  select count(*) into open_conflicts
    from public.sync_conflicts c
    where c.school_id = p_school_id and c.status = 'needs_review';

  select count(*),
         count(*) filter (
           where d.last_successful_sync_at is null
              or d.last_successful_sync_at < now() - interval '7 days'),
         count(*) filter (
           where d.protocol_version is not null and d.protocol_version < minimum_protocol),
         max(d.last_successful_sync_at)
    into device_count, stale_devices, behind_devices, last_sync
    from public.devices d
    where d.school_id = p_school_id and d.revoked_at is null;

  select max(a.occurred_at) into last_activity
    from public.audit_log a where a.school_id = p_school_id;

  if school.status <> 'active' then
    health_status := 'critical';
    health_reasons := health_reasons || 'โรงเรียนถูกระงับการใช้งาน';
  end if;
  if critical_errors > 0 then
    health_status := 'critical';
    health_reasons := health_reasons || format('ข้อผิดพลาดร้ายแรง %s รายการใน 24 ชั่วโมง', critical_errors);
  end if;
  if device_count > 0 and stale_devices = device_count then
    health_status := 'critical';
    health_reasons := health_reasons || 'ไม่มีอุปกรณ์ใดซิงก์สำเร็จเลยใน 7 วัน';
  end if;

  if health_status <> 'critical' then
    if high_errors > 0 then
      health_status := 'warning';
      health_reasons := health_reasons || format('ข้อผิดพลาดระดับสูง %s รายการ', high_errors);
    end if;
    if open_conflicts > 0 then
      health_status := 'warning';
      health_reasons := health_reasons || format('ข้อมูลขัดแย้งรอตรวจสอบ %s รายการ', open_conflicts);
    end if;
    if behind_devices > 0 then
      health_status := 'warning';
      health_reasons := health_reasons || format('อุปกรณ์ที่ใช้เวอร์ชันเก่าเกินไป %s เครื่อง', behind_devices);
    end if;
    -- A school nobody has touched in a fortnight is worth an operator's attention. A school that has
    -- only just been created has no activity yet and is not a problem, so its own age decides.
    if (last_activity is null and school.created_at < now() - interval '14 days')
      or last_activity < now() - interval '14 days' then
      health_status := 'warning';
      health_reasons := health_reasons || 'ไม่มีการใช้งานใน 14 วัน';
    end if;
  end if;

  return jsonb_build_object(
    'schoolId', p_school_id, 'status', health_status, 'reasons', to_jsonb(health_reasons),
    'criticalErrors', critical_errors, 'highErrors', high_errors, 'openConflicts', open_conflicts,
    'deviceCount', device_count, 'staleDevices', stale_devices, 'outdatedDevices', behind_devices,
    'lastSuccessfulSyncAt', last_sync, 'lastActivityAt', last_activity
  );
end $$;

commit;
