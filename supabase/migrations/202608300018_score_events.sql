-- Individual, bonus and corrected scores, recorded as events rather than as a running total.
--
-- Product decision: a teacher gives points from wherever they are — most often from the board, with
-- the class watching — and every one of those points has to be explainable afterwards. A score that
-- lives as a single number cannot answer "why is this 78?", so each award is its own row: who gave
-- it, to whom, for what, in which subject, and when. Correcting a score adds another event rather
-- than rewriting one, which is what makes the history in this table complete by construction.
--
-- Writing goes through the same trusted sync mutation every other record uses, so an offline award
-- queues and replays exactly like an attendance mark, and RLS decides who may read it.

begin;

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  class_id uuid references public.classes(id),
  subject_id uuid references public.subjects(id),
  category text not null default 'bonus'
    check (category in ('bonus','participation','assignment','activity','project','test','exam','manual','other')),
  -- NaN is a valid numeric in Postgres and would poison every total, so it is rejected here: the
  -- only value that fails "points = points" is NaN.
  points numeric(7,2) not null check (points = points and points between -1000 and 1000),
  reason text not null default '',
  source_type text not null default 'manual'
    check (source_type in ('manual','board','assignment','activity','test','exam','import','system')),
  source_id uuid,
  awarded_by uuid references public.user_profiles(id),
  occurred_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists score_events_student_idx on public.score_events(school_id, student_id, occurred_at desc);
create index if not exists score_events_class_idx on public.score_events(school_id, class_id, occurred_at desc);

alter table public.score_events enable row level security;

-- The same audience as any other score: staff of the school, the student it belongs to, and a parent
-- whose link is both approved and consented.
create policy score_events_scoped_read on public.score_events for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.has_school_role(school_id,'teacher')
  or public.student_owns_student_record(student_id)
  or (public.parent_has_active_link(student_id) and public.parent_has_active_consent(student_id))
);
grant select on public.score_events to authenticated;

-- Writes never come from a session directly; they arrive through apply_sync_mutation below.
revoke insert, update, delete on public.score_events from authenticated;

comment on table public.score_events is
  'One row per award. Corrections append a new event; nothing here is rewritten, so the table is the history.';

-- ---------------------------------------------------------------------------
-- Replaces 202608300011's definition. score_event joins the accepted entity list; every other
-- entity, and the idempotency, conflict and journal behaviour, is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.apply_sync_mutation(
  p_school_id uuid, p_device_id uuid, p_idempotency_key text, p_request_hash text,
  p_entity_type text, p_entity_id uuid, p_operation public.sync_operation, p_payload jsonb, p_base_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); stored public.sync_idempotency%rowtype; device public.devices%rowtype; current_version integer; result jsonb; new_revision bigint; class_scope uuid; student_scope uuid; critical boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  select * into device from public.devices where id=p_device_id and school_id=p_school_id for update;
  if not found or device.status<>'active' or device.revoked_at is not null then raise exception 'DEVICE_REVOKED' using errcode='42501'; end if;
  if p_entity_type not in ('student','enrollment','assignment','submission','activity','activity_score','test','test_score','attendance','setting','timetable_entry','achievement','score_event') then raise exception 'VALIDATION_ERROR: unsupported entity'; end if;
  if char_length(p_idempotency_key)<8 or char_length(p_request_hash)<32 then raise exception 'VALIDATION_ERROR: invalid idempotency'; end if;
  select * into stored from public.sync_idempotency where school_id=p_school_id and device_id=p_device_id and idempotency_key=p_idempotency_key;
  if found then
    if stored.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_INTEGRITY_ERROR' using errcode='22000'; end if;
    return stored.response_json;
  end if;
  critical := p_entity_type in ('attendance','activity_score','test_score');
  case p_entity_type
    when 'attendance' then select version,class_id,student_id into current_version,class_scope,student_scope from public.attendance where id=p_entity_id and school_id=p_school_id for update;
    when 'activity_score' then select s.version,a.class_id,s.student_id into current_version,class_scope,student_scope from public.activity_scores s join public.activities a on a.id=s.activity_id where s.id=p_entity_id and s.school_id=p_school_id for update;
    when 'test_score' then select s.version,t.class_id,s.student_id into current_version,class_scope,student_scope from public.test_scores s join public.tests t on t.id=s.test_id where s.id=p_entity_id and s.school_id=p_school_id for update;
    when 'assignment' then select version,class_id into current_version,class_scope from public.assignments where id=p_entity_id and school_id=p_school_id for update;
    when 'activity' then select version,class_id into current_version,class_scope from public.activities where id=p_entity_id and school_id=p_school_id for update;
    when 'test' then select version,class_id into current_version,class_scope from public.tests where id=p_entity_id and school_id=p_school_id for update;
    when 'submission' then select s.version,a.class_id,s.student_id into current_version,class_scope,student_scope from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=p_entity_id and s.school_id=p_school_id for update;
    when 'student' then select version,id into current_version,student_scope from public.students where id=p_entity_id and school_id=p_school_id for update;
    when 'enrollment' then select version,class_id,student_id into current_version,class_scope,student_scope from public.student_class_enrollments where id=p_entity_id and school_id=p_school_id for update;
    when 'setting' then select version into current_version from public.settings where id=p_entity_id and school_id=p_school_id for update;
    when 'timetable_entry' then select version,class_id into current_version,class_scope from public.timetable_entries where id=p_entity_id and school_id=p_school_id for update;
    when 'achievement' then select version,student_id into current_version,student_scope from public.student_achievements where id=p_entity_id and school_id=p_school_id for update;
    when 'score_event' then select version,student_id,class_id into current_version,student_scope,class_scope from public.score_events where id=p_entity_id and school_id=p_school_id for update;
  end case;
  current_version := coalesce(current_version,0);
  if critical and current_version<>p_base_version then
    insert into public.sync_conflicts(school_id,device_id,entity_type,entity_id,base_version,server_version,client_payload,server_payload)
    values(p_school_id,p_device_id,p_entity_type,p_entity_id,p_base_version,current_version,p_payload,jsonb_build_object('version',current_version));
    result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','conflict','code','SYNC_CONFLICT','message','Critical record version changed','serverVersion',current_version);
    insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
    return result;
  end if;
  if p_entity_type in ('attendance','assignment','activity','activity_score','test','test_score','enrollment') and not (public.has_school_role(p_school_id,'admin') or (class_scope is not null and public.teacher_has_class_access(class_scope)) or (class_scope is null and public.has_school_role(p_school_id,'teacher'))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='student' and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='submission' and not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(class_scope) or public.student_owns_student_record(coalesce(student_scope,(p_payload->>'studentId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='setting' and not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- A timetable is school structure: an admin, or a teacher who already teaches the class, sets it.
  if p_entity_type='timetable_entry' and not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(coalesce(class_scope,(p_payload->>'classId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- A score is academic authority: only school staff may write one, whatever the screen offered.
  if p_entity_type='score_event' and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- Badges are handed out by staff only; a student cannot award one to themselves.
  if p_entity_type='achievement' and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  if p_operation='delete' then
    case p_entity_type
      when 'student' then update public.students set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),updated_by=actor,version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'enrollment' then update public.student_class_enrollments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'assignment' then update public.assignments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),updated_by=actor,version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'submission' then update public.submissions set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'activity' then update public.activities set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'activity_score' then update public.activity_scores set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'test' then update public.tests set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'test_score' then update public.test_scores set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'attendance' then update public.attendance set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'setting' then update public.settings set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'timetable_entry' then update public.timetable_entries set deleted_at=clock_timestamp(),status='archived',updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'achievement' then update public.student_achievements set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'score_event' then update public.score_events set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
    end case;
    if current_version is null then raise exception 'NOT_FOUND'; end if;
  else
    case p_entity_type
      when 'attendance' then
        class_scope:=(p_payload->>'classId')::uuid; student_scope:=(p_payload->>'studentId')::uuid;
        if not public.teacher_has_class_access(class_scope) and not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
        if not exists(select 1 from public.student_class_enrollments where school_id=p_school_id and class_id=class_scope and student_id=student_scope and status='active' and deleted_at is null) then raise exception 'VALIDATION_ERROR: inactive enrollment'; end if;
        insert into public.attendance(id,school_id,class_id,student_id,attendance_date,status,note,version)
        values(p_entity_id,p_school_id,class_scope,student_scope,(p_payload->>'attendanceDate')::date,(p_payload->>'status')::public.attendance_status,coalesce(p_payload->>'note',''),1)
        on conflict(id) do update set status=excluded.status,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.attendance.version+1,deleted_at=null returning version into current_version;
      when 'student' then
        insert into public.students(id,school_id,student_code,display_name,avatar_index,avatar_config,status,version,created_by,updated_by)
        values(p_entity_id,p_school_id,p_payload->>'studentCode',p_payload->>'displayName',coalesce((p_payload->>'avatarIndex')::integer,0),p_payload->'avatarConfig',coalesce((p_payload->>'status')::public.record_status,'active'),1,actor,actor)
        on conflict(id) do update set display_name=excluded.display_name,avatar_index=excluded.avatar_index,avatar_config=excluded.avatar_config,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.students.version+1,deleted_at=null returning version into current_version;
      when 'assignment' then
        class_scope:=(p_payload->>'classId')::uuid; if not public.teacher_has_class_access(class_scope) and not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN'; end if;
        insert into public.assignments(id,school_id,class_id,title,description,assigned_at,due_at,max_score,status,version,created_by,updated_by)
        values(p_entity_id,p_school_id,class_scope,p_payload->>'title',coalesce(p_payload->>'description',''),coalesce((p_payload->>'assignedAt')::timestamptz,now()),(p_payload->>'dueAt')::timestamptz,(p_payload->>'maxScore')::numeric,p_payload->>'status',1,actor,actor)
        on conflict(id) do update set title=excluded.title,description=excluded.description,due_at=excluded.due_at,max_score=excluded.max_score,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.assignments.version+1,deleted_at=null returning version into current_version;
      when 'submission' then
        insert into public.submissions(id,school_id,assignment_id,student_id,submitted_at,status,score,is_late,teacher_note,version)
        values(p_entity_id,p_school_id,(p_payload->>'assignmentId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'submittedAt')::timestamptz,p_payload->>'status',(p_payload->>'score')::numeric,coalesce((p_payload->>'isLate')::boolean,false),coalesce(p_payload->>'teacherNote',''),1)
        on conflict(id) do update set submitted_at=excluded.submitted_at,status=excluded.status,score=excluded.score,is_late=excluded.is_late,teacher_note=excluded.teacher_note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.submissions.version+1,deleted_at=null returning version into current_version;
      when 'activity' then
        insert into public.activities(id,school_id,class_id,title,activity_date,max_score,status,version) values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,p_payload->>'title',(p_payload->>'activityDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1)
        on conflict(id) do update set title=excluded.title,activity_date=excluded.activity_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activities.version+1,deleted_at=null returning version into current_version;
      when 'activity_score' then
        insert into public.activity_scores(id,school_id,activity_id,student_id,score,note,version) values(p_entity_id,p_school_id,(p_payload->>'activityId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'score')::numeric,coalesce(p_payload->>'note',''),1)
        on conflict(id) do update set score=excluded.score,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activity_scores.version+1,deleted_at=null returning version into current_version;
      when 'test' then
        insert into public.tests(id,school_id,class_id,title,test_date,max_score,status,version) values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,p_payload->>'title',(p_payload->>'testDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1)
        on conflict(id) do update set title=excluded.title,test_date=excluded.test_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.tests.version+1,deleted_at=null returning version into current_version;
      when 'test_score' then
        insert into public.test_scores(id,school_id,test_id,student_id,score,published_at,version) values(p_entity_id,p_school_id,(p_payload->>'testId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'score')::numeric,(p_payload->>'publishedAt')::timestamptz,1)
        on conflict(id) do update set score=excluded.score,published_at=excluded.published_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.test_scores.version+1,deleted_at=null returning version into current_version;
      when 'enrollment' then
        insert into public.student_class_enrollments(id,school_id,student_id,class_id,academic_term_id,status,enrolled_at,left_at,version) values(p_entity_id,p_school_id,(p_payload->>'studentId')::uuid,(p_payload->>'classId')::uuid,(p_payload->>'academicTermId')::uuid,p_payload->>'status',coalesce((p_payload->>'enrolledAt')::timestamptz,now()),(p_payload->>'leftAt')::timestamptz,1)
        on conflict(id) do update set class_id=excluded.class_id,status=excluded.status,left_at=excluded.left_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_class_enrollments.version+1,deleted_at=null returning version into current_version;
      when 'setting' then
        insert into public.settings(id,school_id,scope_type,scope_id,key,value_json,version) values(p_entity_id,p_school_id,p_payload->>'scopeType',(p_payload->>'scopeId')::uuid,p_payload->>'key',p_payload->'valueJson',1)
        on conflict(id) do update set value_json=excluded.value_json,updated_at=clock_timestamp(),version=public.settings.version+1,deleted_at=null returning version into current_version;
      when 'timetable_entry' then
        insert into public.timetable_entries(id,school_id,class_id,subject_id,teacher_id,academic_term_id,day_of_week,period,start_time,end_time,room,status,version)
        values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,(p_payload->>'teacherId')::uuid,(p_payload->>'academicTermId')::uuid,(p_payload->>'dayOfWeek')::integer,(p_payload->>'period')::integer,(p_payload->>'startTime')::time,(p_payload->>'endTime')::time,coalesce(p_payload->>'room',''),coalesce((p_payload->>'status')::public.record_status,'active'),1)
        on conflict(id) do update set class_id=excluded.class_id,subject_id=excluded.subject_id,teacher_id=excluded.teacher_id,academic_term_id=excluded.academic_term_id,day_of_week=excluded.day_of_week,period=excluded.period,start_time=excluded.start_time,end_time=excluded.end_time,room=excluded.room,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.timetable_entries.version+1,deleted_at=null returning version into current_version;
      when 'achievement' then
        -- Re-awarding the same badge is a no-op, matching the client: the dedupe key is the identity.
        insert into public.student_achievements(id,school_id,student_id,achievement_key,dedupe_key,note,awarded_by,awarded_at,version)
        values(p_entity_id,p_school_id,(p_payload->>'studentId')::uuid,p_payload->>'achievementKey',p_payload->>'dedupeKey',coalesce(p_payload->>'note',''),(p_payload->>'awardedBy')::uuid,coalesce((p_payload->>'awardedAt')::timestamptz,now()),1)
        on conflict(id) do update set note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_achievements.version+1,deleted_at=null returning version into current_version;
      when 'score_event' then
        -- One award is one row. Correcting a score adds another event rather than rewriting this
        -- one, so the history a teacher inspects is the table itself and nothing is ever lost.
        student_scope:=(p_payload->>'studentId')::uuid;
        insert into public.score_events(id,school_id,student_id,class_id,subject_id,category,points,reason,source_type,source_id,awarded_by,occurred_at,version)
        values(p_entity_id,p_school_id,student_scope,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,coalesce(p_payload->>'category','bonus'),(p_payload->>'points')::numeric,coalesce(p_payload->>'reason',''),coalesce(p_payload->>'sourceType','manual'),(p_payload->>'sourceId')::uuid,actor,coalesce((p_payload->>'occurredAt')::timestamptz,now()),1)
        on conflict(id) do update set points=excluded.points,reason=excluded.reason,category=excluded.category,subject_id=excluded.subject_id,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.score_events.version+1,deleted_at=null returning version into current_version;
    end case;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json,metadata_json) values(p_school_id,actor,case when p_operation='delete' then 'sync_delete' else 'sync_upsert' end,p_entity_type,p_entity_id,student_scope,p_payload,jsonb_build_object('device_id',p_device_id,'idempotency_key',p_idempotency_key));
  insert into public.sync_changes(school_id,entity_type,entity_id,operation,version) values(p_school_id,p_entity_type,p_entity_id,p_operation,current_version) returning revision into new_revision;
  update public.devices set last_seen_at=clock_timestamp(),last_successful_sync_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_device_id;
  result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','accepted','version',current_version,'revision',new_revision);
  insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
  return result;
end $$;
revoke all on function public.apply_sync_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) from public,anon;
grant execute on function public.apply_sync_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) to authenticated;

commit;
