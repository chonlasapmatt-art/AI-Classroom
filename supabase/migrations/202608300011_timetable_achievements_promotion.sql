-- Weekly timetable, positive student achievements, cohort promotion and teacher removal.
--
-- The client already carries these records locally (Dexie schema v7). This migration gives them a
-- server home with the same boundaries the rest of the schema uses: read through RLS, write through
-- the trusted mutation path (timetable, achievements, enrolment changes) or a security-definer
-- function (teacher removal), and every change lands in the sync journal so other devices pull it.

begin;

-- ---------------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------------
create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  class_id uuid not null references public.classes(id),
  subject_id uuid references public.subjects(id),
  teacher_id uuid references public.teachers(id),
  academic_term_id uuid not null references public.academic_terms(id),
  -- 1 = Monday … 7 = Sunday, matching ISO-8601 so date maths needs no lookup table.
  day_of_week integer not null check (day_of_week between 1 and 7),
  period integer not null check (period between 1 and 20),
  start_time time not null,
  end_time time not null,
  room text not null default '',
  status public.record_status not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_time > start_time)
);

-- One class cannot be in two places in the same period, and neither can one teacher.
create unique index if not exists timetable_one_slot_per_class
  on public.timetable_entries(academic_term_id, class_id, day_of_week, period)
  where status = 'active' and deleted_at is null;
create unique index if not exists timetable_one_slot_per_teacher
  on public.timetable_entries(academic_term_id, teacher_id, day_of_week, period)
  where status = 'active' and deleted_at is null and teacher_id is not null;
create index if not exists timetable_school_class_idx on public.timetable_entries(school_id, class_id);

alter table public.timetable_entries enable row level security;

-- A timetable is who-teaches-what, not personal data: every member of the class sees the same grid.
create policy timetable_scoped_read on public.timetable_entries for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.teacher_has_class_access(class_id)
  or exists(select 1 from public.student_class_enrollments e
    where e.class_id = timetable_entries.class_id and e.deleted_at is null
      and (public.student_owns_student_record(e.student_id)
        or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id))))
);
grant select on public.timetable_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Student achievements
-- ---------------------------------------------------------------------------
create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  achievement_key text not null check (achievement_key in
    ('on_time_submitter','steady_attendance','score_improver','reader','thinker','experimenter','creator','helper')),
  -- Stable identity so re-running an award pass never duplicates a badge.
  dedupe_key text not null,
  note text not null default '',
  awarded_by uuid references public.user_profiles(id),
  awarded_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(school_id, dedupe_key)
);
create index if not exists achievements_student_idx on public.student_achievements(school_id, student_id);

alter table public.student_achievements enable row level security;

-- Recognition follows the student: the student, their consented parent, their teachers, the admin.
create policy achievements_scoped_read on public.student_achievements for select to authenticated
  using (public.can_read_student(student_id));
grant select on public.student_achievements to authenticated;

-- ---------------------------------------------------------------------------
-- Teacher removal
-- ---------------------------------------------------------------------------
-- Soft-deletes a teacher record. Refused while the teacher still holds a class assignment, so a
-- class is never left without the person the timetable and gradebook point at.
create or replace function public.delete_teacher(p_school_id uuid, p_teacher_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target public.teachers%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into target from public.teachers where id=p_teacher_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.class_teachers where teacher_id=p_teacher_id and school_id=p_school_id) then
    raise exception 'VALIDATION_ERROR: teacher still assigned to a class';
  end if;
  update public.timetable_entries set teacher_id=null, updated_at=clock_timestamp(), server_updated_at=clock_timestamp(),
    version=version+1 where teacher_id=p_teacher_id and school_id=p_school_id and deleted_at is null;
  update public.teachers set deleted_at=clock_timestamp(), status='inactive', updated_at=clock_timestamp()
    where id=p_teacher_id;
  update public.school_memberships set status='suspended', updated_at=clock_timestamp()
    where school_id=p_school_id and profile_id=target.profile_id and role='teacher';
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,before_json)
  values(p_school_id,actor,'teacher_deleted','teacher',p_teacher_id,to_jsonb(target));
  return jsonb_build_object('teacherId',p_teacher_id,'status','deleted');
end $$;
revoke all on function public.delete_teacher(uuid,uuid) from public,anon;
grant execute on function public.delete_teacher(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Academic years and terms
-- ---------------------------------------------------------------------------
-- A school has to be able to open next year before anybody can be promoted into it. Terms are
-- structure, so they are written through this function rather than the sync boundary.
create or replace function public.upsert_academic_term(
  p_school_id uuid, p_term_id uuid, p_academic_year text, p_term text,
  p_starts_on date, p_ends_on date, p_status text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_academic_year),'')='' or coalesce(trim(p_term),'')='' then
    raise exception 'VALIDATION_ERROR: academic year and term are required';
  end if;
  if p_status not in ('draft','active','closed') then raise exception 'VALIDATION_ERROR: unknown term status'; end if;
  if p_ends_on < p_starts_on then raise exception 'VALIDATION_ERROR: term ends before it starts'; end if;
  insert into public.academic_terms(id,school_id,academic_year,term,starts_on,ends_on,status)
  values(p_term_id,p_school_id,trim(p_academic_year),trim(p_term),p_starts_on,p_ends_on,p_status)
  on conflict(id) do update set academic_year=excluded.academic_year,term=excluded.term,starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,status=excluded.status,updated_at=clock_timestamp(),deleted_at=null;
  -- One active term at a time keeps "the current term" unambiguous for every screen and report.
  if p_status='active' then
    update public.academic_terms set status='closed',updated_at=clock_timestamp()
      where school_id=p_school_id and id<>p_term_id and status='active';
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'academic_term_upsert','academic_term',p_term_id,
    jsonb_build_object('academicYear',p_academic_year,'term',p_term,'status',p_status));
  return jsonb_build_object('entityId',p_term_id,'status',p_status);
end $$;
revoke all on function public.upsert_academic_term(uuid,uuid,text,text,date,date,text) from public,anon;
grant execute on function public.upsert_academic_term(uuid,uuid,text,text,date,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Trusted mutation boundary: two more entity types
-- ---------------------------------------------------------------------------
-- Replaces 202608290003's definition. Timetable slots and achievements join the accepted entity
-- list; everything else is unchanged, including idempotency, conflict handling and the journal.
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
  if p_entity_type not in ('student','enrollment','assignment','submission','activity','activity_score','test','test_score','attendance','setting','timetable_entry','achievement') then raise exception 'VALIDATION_ERROR: unsupported entity'; end if;
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

comment on table public.timetable_entries is 'Weekly lesson slots; a week is the set of slots, never a generated grid.';
comment on table public.student_achievements is 'Positive recognition only; a badge is earned, never removed for poor performance.';

commit;
