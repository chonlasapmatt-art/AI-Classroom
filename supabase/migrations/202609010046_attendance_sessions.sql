begin;

-- Keep legacy daily rows readable, while allowing a separate record for every lesson and homeroom.
alter table public.attendance
  add column if not exists session_key text not null default 'daily',
  add column if not exists session_type text not null default 'daily',
  add column if not exists period integer,
  add column if not exists subject_id uuid references public.subjects(id),
  add column if not exists timetable_entry_id uuid references public.timetable_entries(id);

alter table public.attendance drop constraint if exists attendance_session_type_check;
alter table public.attendance add constraint attendance_session_type_check check (session_type in ('daily', 'class', 'homeroom'));
alter table public.attendance drop constraint if exists attendance_period_check;
alter table public.attendance add constraint attendance_period_check check (period is null or period between 1 and 20);
drop index if exists public.one_active_attendance;
create unique index if not exists one_active_attendance_session on public.attendance(class_id, student_id, attendance_date, session_key) where deleted_at is null;
create index if not exists attendance_student_day_idx on public.attendance(school_id, student_id, attendance_date, session_key) where deleted_at is null;

-- A deliberately narrow RPC for the new attendance fields. Other sync entities continue using
-- apply_sync_mutation unchanged, so this feature cannot alter unrelated mutation paths.
create or replace function public.apply_attendance_mutation(
  p_school_id uuid, p_device_id uuid, p_idempotency_key text, p_request_hash text,
  p_entity_type text, p_entity_id uuid, p_operation public.sync_operation, p_payload jsonb, p_base_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); stored public.sync_idempotency%rowtype; device public.devices%rowtype; current_version integer; result jsonb; new_revision bigint; class_scope uuid; student_scope uuid; session_scope text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_entity_type <> 'attendance' then raise exception 'VALIDATION_ERROR: attendance only'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  select * into device from public.devices where id=p_device_id and school_id=p_school_id for update;
  if not found or device.status <> 'active' or device.revoked_at is not null then raise exception 'DEVICE_REVOKED' using errcode='42501'; end if;
  if char_length(p_idempotency_key) < 8 or char_length(p_request_hash) < 32 then raise exception 'VALIDATION_ERROR: invalid idempotency'; end if;
  select * into stored from public.sync_idempotency where school_id=p_school_id and device_id=p_device_id and idempotency_key=p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_INTEGRITY_ERROR' using errcode='22000'; end if;
    return stored.response_json;
  end if;
  select version, class_id, student_id into current_version, class_scope, student_scope from public.attendance where id=p_entity_id and school_id=p_school_id for update;
  current_version := coalesce(current_version, 0);
  if current_version <> p_base_version then
    insert into public.sync_conflicts(school_id,device_id,entity_type,entity_id,base_version,server_version,client_payload,server_payload)
    values(p_school_id,p_device_id,'attendance',p_entity_id,p_base_version,current_version,p_payload,jsonb_build_object('version',current_version));
    result := jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','conflict','code','SYNC_CONFLICT','message','Critical record version changed','serverVersion',current_version);
    insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
    return result;
  end if;
  class_scope := coalesce(class_scope, (p_payload->>'classId')::uuid);
  student_scope := coalesce(student_scope, (p_payload->>'studentId')::uuid);
  session_scope := coalesce(nullif(p_payload->>'sessionKey',''), 'daily');
  if not public.has_school_role(p_school_id,'admin') and not public.teacher_has_class_access(class_scope) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.student_class_enrollments where school_id=p_school_id and class_id=class_scope and student_id=student_scope and status='active' and deleted_at is null) then raise exception 'VALIDATION_ERROR: inactive enrollment'; end if;
  if p_operation = 'delete' then
    update public.attendance set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
    if current_version is null then raise exception 'NOT_FOUND'; end if;
  else
    insert into public.attendance(id,school_id,class_id,student_id,attendance_date,status,note,session_key,session_type,period,subject_id,timetable_entry_id,version)
    values(p_entity_id,p_school_id,class_scope,student_scope,(p_payload->>'attendanceDate')::date,(p_payload->>'status')::public.attendance_status,coalesce(p_payload->>'note',''),session_scope,coalesce(nullif(p_payload->>'sessionType',''),'daily'),nullif(p_payload->>'period','')::integer,(p_payload->>'subjectId')::uuid,(p_payload->>'timetableEntryId')::uuid,1)
    on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,attendance_date=excluded.attendance_date,status=excluded.status,note=excluded.note,session_key=excluded.session_key,session_type=excluded.session_type,period=excluded.period,subject_id=excluded.subject_id,timetable_entry_id=excluded.timetable_entry_id,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.attendance.version+1,deleted_at=null returning version into current_version;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json,metadata_json) values(p_school_id,actor,case when p_operation='delete' then 'sync_delete' else 'sync_upsert' end,'attendance',p_entity_id,student_scope,p_payload,jsonb_build_object('device_id',p_device_id,'idempotency_key',p_idempotency_key,'session_key',session_scope));
  insert into public.sync_changes(school_id,entity_type,entity_id,operation,version) values(p_school_id,'attendance',p_entity_id,p_operation,current_version) returning revision into new_revision;
  update public.devices set last_seen_at=clock_timestamp(),last_successful_sync_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_device_id;
  result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','accepted','version',current_version,'revision',new_revision);
  insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
  return result;
end $$;

revoke all on function public.apply_attendance_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) from public,anon;
grant execute on function public.apply_attendance_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) to authenticated;

commit;
