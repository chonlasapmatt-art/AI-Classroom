-- Teacher responsibility and subject-scoped authorization.
--
-- The legacy class_teachers row is intentionally reused:
--   primary + null subject  = class advisor
--   assistant + null subject = assistant advisor
--   primary + subject       = subject owner
--   assistant + subject     = subject co-teacher
-- A teacher may therefore hold more than one row in the same class.

begin;

-- The old index made a teacher/class pair unique and silently prevented mixed responsibilities.
drop index if exists public.class_teachers_class_teacher_key;

create unique index if not exists class_teachers_one_class_advisor
  on public.class_teachers(class_id)
  where role_in_class = 'primary' and subject_id is null and active_until is null;
create unique index if not exists class_teachers_one_assistant_advisor
  on public.class_teachers(class_id)
  where role_in_class = 'assistant' and subject_id is null and active_until is null;
create unique index if not exists class_teachers_one_subject_owner
  on public.class_teachers(class_id, subject_id)
  where role_in_class = 'primary' and subject_id is not null and active_until is null;
create unique index if not exists class_teachers_unique_active_responsibility
  on public.class_teachers(class_id, teacher_id, role_in_class, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where active_until is null;

-- ---------------------------------------------------------------------------
-- One source of truth for the responsibility matrix
-- ---------------------------------------------------------------------------

create or replace function public.teacher_can_view_class(p_school_id uuid, p_class_id uuid default null)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_school_role(p_school_id,'admin') or exists(
    select 1
    from public.class_teachers ct
    join public.teachers t on t.id=ct.teacher_id and t.school_id=p_school_id
    where ct.school_id=p_school_id
      and (p_class_id is null or ct.class_id=p_class_id)
      and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active'
      and t.deleted_at is null and t.verification_status='verified_teacher'
      and public.is_verified_teacher(p_school_id,(select auth.uid()))
  );
$$;

create or replace function public.teacher_is_class_advisor(p_school_id uuid, p_class_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id
    where ct.school_id=p_school_id and ct.class_id=p_class_id and ct.role_in_class='primary'
      and ct.subject_id is null and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid())));
$$;

create or replace function public.teacher_is_assistant_advisor(p_school_id uuid, p_class_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id
    where ct.school_id=p_school_id and ct.class_id=p_class_id and ct.role_in_class='assistant'
      and ct.subject_id is null and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid())));
$$;

create or replace function public.teacher_is_subject_owner(p_school_id uuid, p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id
    where ct.school_id=p_school_id and ct.class_id=p_class_id and ct.role_in_class='primary'
      and ct.subject_id=p_subject_id and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid())));
$$;

create or replace function public.teacher_is_subject_co_teacher(p_school_id uuid, p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id
    where ct.school_id=p_school_id and ct.class_id=p_class_id and ct.role_in_class='assistant'
      and ct.subject_id=p_subject_id and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid())));
$$;

create or replace function public.teacher_can_view_student(p_school_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.student_class_enrollments e
    where e.school_id=p_school_id and e.student_id=p_student_id and e.status='active' and e.deleted_at is null
      and public.teacher_can_view_class(p_school_id,e.class_id)
  );
$$;

create or replace function public.teacher_can_view_score(p_school_id uuid, p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id
    where ct.school_id=p_school_id and ct.class_id=p_class_id
      and (ct.subject_id is null or ct.subject_id=p_subject_id)
      and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid())));
$$;

create or replace function public.teacher_can_edit_subject_score(
  p_school_id uuid, p_class_id uuid, p_subject_id uuid, p_academic_term_id uuid default null
)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_subject_id is not null
    and exists(select 1 from public.classes c where c.id=p_class_id and c.school_id=p_school_id
      and (p_academic_term_id is null or c.academic_term_id=p_academic_term_id))
    and public.teacher_is_subject_owner(p_school_id,p_class_id,p_subject_id);
$$;

create or replace function public.teacher_can_manage_subject_content(
  p_school_id uuid, p_class_id uuid, p_subject_id uuid, p_academic_term_id uuid default null
)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.teacher_can_edit_subject_score(p_school_id,p_class_id,p_subject_id,p_academic_term_id);
$$;

create or replace function public.teacher_can_manage_question_subject(p_school_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_subject_id is not null and exists(
    select 1 from public.class_teachers ct
    join public.teachers t on t.id=ct.teacher_id and t.school_id=p_school_id
    where ct.school_id=p_school_id and ct.subject_id=p_subject_id and ct.role_in_class='primary'
      and (ct.active_until is null or ct.active_until>now())
      and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null
      and public.is_verified_teacher(p_school_id,(select auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- Direct table writes are guarded too. This covers sync RPCs and future RPCs.
-- Attendance deliberately remains outside this guard: its existing class-level workflow is kept.
-- ---------------------------------------------------------------------------

create or replace function public.guard_teacher_academic_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare row_json jsonb; school_id uuid; class_id uuid; subject_id uuid; parent_id uuid; student_id uuid;
begin
  row_json := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  school_id := (row_json->>'school_id')::uuid;
  if public.has_school_role(school_id,'admin') then return case when tg_op='DELETE' then old else new end; end if;
  if not public.has_school_role(school_id,'teacher') then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  if tg_table_name in ('assignments','activities','tests') then
    class_id := (row_json->>'class_id')::uuid; subject_id := (row_json->>'subject_id')::uuid;
    if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'activity_scores' then
    select a.class_id,a.subject_id into class_id,subject_id from public.activities a where a.id=(row_json->>'activity_id')::uuid;
    if not public.teacher_can_edit_subject_score(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'test_scores' then
    select t.class_id,t.subject_id into class_id,subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_edit_subject_score(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'submissions' then
    parent_id := (row_json->>'assignment_id')::uuid; student_id := (row_json->>'student_id')::uuid;
    if not public.student_owns_student_record(student_id) then
      select a.class_id,a.subject_id into class_id,subject_id from public.assignments a where a.id=parent_id;
      if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
    end if;
  elsif tg_table_name = 'score_events' then
    class_id := (row_json->>'class_id')::uuid; subject_id := (row_json->>'subject_id')::uuid; student_id := (row_json->>'student_id')::uuid;
    if class_id is null or not public.teacher_can_edit_subject_score(school_id,class_id,subject_id)
       or not exists(select 1 from public.student_class_enrollments e where e.school_id=school_id and e.class_id=class_id and e.student_id=student_id and e.status='active' and e.deleted_at is null) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'exam_questions' then
    select t.class_id,t.subject_id into class_id,subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists guard_assignments_subject_owner on public.assignments;
create trigger guard_assignments_subject_owner before insert or update or delete on public.assignments for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_activities_subject_owner on public.activities;
create trigger guard_activities_subject_owner before insert or update or delete on public.activities for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_tests_subject_owner on public.tests;
create trigger guard_tests_subject_owner before insert or update or delete on public.tests for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_activity_scores_subject_owner on public.activity_scores;
create trigger guard_activity_scores_subject_owner before insert or update or delete on public.activity_scores for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_test_scores_subject_owner on public.test_scores;
create trigger guard_test_scores_subject_owner before insert or update or delete on public.test_scores for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_submissions_subject_owner on public.submissions;
create trigger guard_submissions_subject_owner before insert or update or delete on public.submissions for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_score_events_subject_owner on public.score_events;
create trigger guard_score_events_subject_owner before insert or update or delete on public.score_events for each row execute function public.guard_teacher_academic_scope();
drop trigger if exists guard_exam_questions_subject_owner on public.exam_questions;
create trigger guard_exam_questions_subject_owner before insert or update or delete on public.exam_questions for each row execute function public.guard_teacher_academic_scope();

-- ---------------------------------------------------------------------------
-- Assignment limits and history-aware assignment RPCs
-- ---------------------------------------------------------------------------

create or replace function public.assign_class_teacher(
  p_school_id uuid, p_class_teacher_id uuid, p_class_id uuid, p_teacher_id uuid, p_role text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('primary','assistant') then raise exception 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id and status='active')
     or not exists(select 1 from public.teachers where id=p_teacher_id and school_id=p_school_id and status='active') then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.class_teachers where school_id=p_school_id and class_id=p_class_id and role_in_class=p_role and subject_id is null and active_until is null) then
    raise exception 'RESPONSIBILITY_LIMIT_REACHED' using errcode='23505';
  end if;
  select id into target from public.class_teachers where id=p_class_teacher_id or
    (school_id=p_school_id and class_id=p_class_id and teacher_id=p_teacher_id and role_in_class=p_role and subject_id is null) limit 1;
  if target is null then
    insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class,subject_id) values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role,null) returning id into target;
  else
    update public.class_teachers set active_until=null where id=target;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'TEACHER_RESPONSIBILITY_ASSIGNED','class_teacher',target,jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'responsibility',case when p_role='primary' then 'CLASS_ADVISOR' else 'ASSISTANT_ADVISOR' end));
  return jsonb_build_object('entityId',target,'responsibility',case when p_role='primary' then 'CLASS_ADVISOR' else 'ASSISTANT_ADVISOR' end);
end $$;

create or replace function public.assign_class_teacher_with_subject(
  p_school_id uuid, p_class_teacher_id uuid, p_class_id uuid, p_teacher_id uuid, p_role text, p_subject_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target uuid; responsibility text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('primary','assistant') then raise exception 'VALIDATION_ERROR'; end if;
  if p_subject_id is null then return public.assign_class_teacher(p_school_id,p_class_teacher_id,p_class_id,p_teacher_id,p_role); end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id and status='active')
     or not exists(select 1 from public.teachers where id=p_teacher_id and school_id=p_school_id and status='active')
     or not exists(select 1 from public.subjects where id=p_subject_id and school_id=p_school_id and status='active') then raise exception 'NOT_FOUND'; end if;
  if p_role='primary' and exists(select 1 from public.class_teachers where school_id=p_school_id and class_id=p_class_id and subject_id=p_subject_id and role_in_class='primary' and active_until is null) then raise exception 'SUBJECT_OWNER_LIMIT_REACHED' using errcode='23505'; end if;
  select id into target from public.class_teachers where id=p_class_teacher_id or
    (school_id=p_school_id and class_id=p_class_id and teacher_id=p_teacher_id and role_in_class=p_role and subject_id=p_subject_id) limit 1;
  if target is null then
    insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class,subject_id) values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role,p_subject_id) returning id into target;
  else
    update public.class_teachers set active_until=null where id=target;
  end if;
  responsibility := case when p_role='primary' then 'SUBJECT_OWNER' else 'SUBJECT_CO_TEACHER' end;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'TEACHER_RESPONSIBILITY_ASSIGNED','class_teacher',target,jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'subjectId',p_subject_id,'responsibility',responsibility));
  return jsonb_build_object('entityId',target,'subjectId',p_subject_id,'responsibility',responsibility);
end $$;

-- ---------------------------------------------------------------------------
-- Narrow question-bank reads and writes to subject owners
-- ---------------------------------------------------------------------------

drop policy if exists question_bank_staff_read on public.question_bank;
create policy question_bank_staff_read on public.question_bank for select to authenticated using (
  public.has_school_role(school_id,'admin') or public.teacher_can_manage_question_subject(school_id,subject_id)
);
drop policy if exists question_categories_staff_read on public.question_categories;
create policy question_categories_staff_read on public.question_categories for select to authenticated using (
  public.has_school_role(school_id,'admin') or public.teacher_can_manage_question_subject(school_id,subject_id)
);
drop policy if exists exam_questions_staff_read on public.exam_questions;
create policy exam_questions_staff_read on public.exam_questions for select to authenticated using (
  public.has_school_role(school_id,'admin') or exists(select 1 from public.tests t where t.id=test_id and public.teacher_can_manage_subject_content(t.school_id,t.class_id,t.subject_id))
);
drop policy if exists score_events_scoped_read on public.score_events;
create policy score_events_scoped_read on public.score_events for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or (class_id is not null and public.teacher_can_view_score(school_id,class_id,subject_id))
  or public.student_owns_student_record(student_id)
  or (public.parent_has_active_link(student_id) and public.parent_has_active_consent(student_id))
);

create or replace function public.save_bank_question(p_school_id uuid, p_question_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target uuid; chosen_category uuid; chosen_subject uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  chosen_subject := (p_payload->>'subjectId')::uuid;
  if not public.has_school_role(p_school_id,'admin') and not public.teacher_can_manage_question_subject(p_school_id,chosen_subject) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  if coalesce(trim(p_payload->>'prompt'),'')='' then raise exception 'VALIDATION_ERROR'; end if;
  chosen_category := (p_payload->>'categoryId')::uuid;
  if chosen_category is not null and not exists(select 1 from public.question_categories c where c.id=chosen_category and c.school_id=p_school_id and (public.has_school_role(p_school_id,'admin') or public.teacher_can_manage_question_subject(p_school_id,c.subject_id))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.question_bank(id,school_id,subject_id,category_id,grade_level,unit,topic,difficulty,question_type,prompt,choices,answer_key,explanation,points,tags,status,created_by,updated_by)
  values(coalesce(p_question_id,gen_random_uuid()),p_school_id,chosen_subject,chosen_category,coalesce(p_payload->>'gradeLevel',''),coalesce(p_payload->>'unit',''),coalesce(p_payload->>'topic',''),coalesce(p_payload->>'difficulty','medium'),coalesce(p_payload->>'questionType','multiple_choice'),trim(p_payload->>'prompt'),coalesce(p_payload->'choices','[]'::jsonb),coalesce(p_payload->'answerKey','[]'::jsonb),coalesce(p_payload->>'explanation',''),coalesce((p_payload->>'points')::numeric,1),coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb)) as value),'{}'),coalesce(p_payload->>'status','active'),actor,actor)
  on conflict(id) do update set subject_id=excluded.subject_id,category_id=excluded.category_id,grade_level=excluded.grade_level,unit=excluded.unit,topic=excluded.topic,difficulty=excluded.difficulty,question_type=excluded.question_type,prompt=excluded.prompt,choices=excluded.choices,answer_key=excluded.answer_key,explanation=excluded.explanation,points=excluded.points,tags=excluded.tags,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),deleted_at=null returning id into target;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,case when p_question_id is null then 'QUESTION_CREATED' else 'QUESTION_UPDATED' end,'question_bank',target,jsonb_build_object('subjectId',chosen_subject,'categoryId',chosen_category));
  return target;
end $$;

create or replace function public.archive_bank_question(p_question_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target public.question_bank%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target from public.question_bank where id=p_question_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_school_role(target.school_id,'admin') and not public.teacher_can_manage_question_subject(target.school_id,target.subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  update public.question_bank set status='archived',updated_by=actor,updated_at=clock_timestamp() where id=target.id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(target.school_id,actor,'QUESTION_ARCHIVED','question_bank',target.id);
end $$;

-- Keep the complete sync gateway, but make the subject part of the authoritative upsert payload.
-- The table triggers above then apply the same owner check to online and replayed offline writes.
create or replace function public.apply_sync_mutation(
  p_school_id uuid, p_device_id uuid, p_idempotency_key text, p_request_hash text,
  p_entity_type text, p_entity_id uuid, p_operation public.sync_operation, p_payload jsonb, p_base_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); stored public.sync_idempotency%rowtype; device public.devices%rowtype; current_version integer; result jsonb; new_revision bigint; class_scope uuid; student_scope uuid; critical boolean;
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
  current_version:=coalesce(current_version,0);
  if critical and current_version<>p_base_version then
    insert into public.sync_conflicts(school_id,device_id,entity_type,entity_id,base_version,server_version,client_payload,server_payload) values(p_school_id,p_device_id,p_entity_type,p_entity_id,p_base_version,current_version,p_payload,jsonb_build_object('version',current_version));
    result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','conflict','code','SYNC_CONFLICT','message','Critical record version changed','serverVersion',current_version);
    insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result); return result;
  end if;
  if p_entity_type='attendance' and not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(coalesce(class_scope,(p_payload->>'classId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type in ('assignment','activity','test','activity_score','test_score','submission','score_event') and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher') or public.student_owns_student_record(coalesce(student_scope,(p_payload->>'studentId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='setting' and not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='timetable_entry' and not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(coalesce(class_scope,(p_payload->>'classId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
      when 'achievement' then update public.student_achievements set deleted_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
      when 'score_event' then update public.score_events set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=p_entity_id and school_id=p_school_id returning version into current_version;
    end case;
    if current_version is null then raise exception 'NOT_FOUND'; end if;
  else
    case p_entity_type
      when 'attendance' then
        class_scope:=(p_payload->>'classId')::uuid; student_scope:=(p_payload->>'studentId')::uuid;
        if not exists(select 1 from public.student_class_enrollments where school_id=p_school_id and class_id=class_scope and student_id=student_scope and status='active' and deleted_at is null) then raise exception 'VALIDATION_ERROR: inactive enrollment'; end if;
        insert into public.attendance(id,school_id,class_id,student_id,attendance_date,status,note,version) values(p_entity_id,p_school_id,class_scope,student_scope,(p_payload->>'attendanceDate')::date,(p_payload->>'status')::public.attendance_status,coalesce(p_payload->>'note',''),1) on conflict(id) do update set status=excluded.status,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.attendance.version+1,deleted_at=null returning version into current_version;
      when 'student' then
        insert into public.students(id,school_id,student_code,display_name,avatar_index,avatar_config,status,version,created_by,updated_by) values(p_entity_id,p_school_id,p_payload->>'studentCode',p_payload->>'displayName',coalesce((p_payload->>'avatarIndex')::integer,0),p_payload->'avatarConfig',coalesce((p_payload->>'status')::public.record_status,'active'),1,actor,actor) on conflict(id) do update set display_name=excluded.display_name,avatar_index=excluded.avatar_index,avatar_config=excluded.avatar_config,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.students.version+1,deleted_at=null returning version into current_version;
      when 'assignment' then
        class_scope:=(p_payload->>'classId')::uuid;
        insert into public.assignments(id,school_id,class_id,subject_id,title,description,assigned_at,due_at,max_score,status,version,created_by,updated_by) values(p_entity_id,p_school_id,class_scope,(p_payload->>'subjectId')::uuid,p_payload->>'title',coalesce(p_payload->>'description',''),coalesce((p_payload->>'assignedAt')::timestamptz,now()),(p_payload->>'dueAt')::timestamptz,(p_payload->>'maxScore')::numeric,p_payload->>'status',1,actor,actor) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,description=excluded.description,due_at=excluded.due_at,max_score=excluded.max_score,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.assignments.version+1,deleted_at=null returning version into current_version;
      when 'submission' then
        insert into public.submissions(id,school_id,assignment_id,student_id,submitted_at,status,score,is_late,teacher_note,version) values(p_entity_id,p_school_id,(p_payload->>'assignmentId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'submittedAt')::timestamptz,p_payload->>'status',(p_payload->>'score')::numeric,coalesce((p_payload->>'isLate')::boolean,false),coalesce(p_payload->>'teacherNote',''),1) on conflict(id) do update set submitted_at=excluded.submitted_at,status=excluded.status,score=excluded.score,is_late=excluded.is_late,teacher_note=excluded.teacher_note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.submissions.version+1,deleted_at=null returning version into current_version;
      when 'activity' then
        insert into public.activities(id,school_id,class_id,subject_id,title,activity_date,max_score,status,version) values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,p_payload->>'title',(p_payload->>'activityDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,activity_date=excluded.activity_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activities.version+1,deleted_at=null returning version into current_version;
      when 'activity_score' then
        insert into public.activity_scores(id,school_id,activity_id,student_id,score,note,version) values(p_entity_id,p_school_id,(p_payload->>'activityId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'score')::numeric,coalesce(p_payload->>'note',''),1) on conflict(id) do update set score=excluded.score,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activity_scores.version+1,deleted_at=null returning version into current_version;
      when 'test' then
        insert into public.tests(id,school_id,class_id,subject_id,title,test_date,max_score,status,version) values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,p_payload->>'title',(p_payload->>'testDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,test_date=excluded.test_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.tests.version+1,deleted_at=null returning version into current_version;
      when 'test_score' then
        insert into public.test_scores(id,school_id,test_id,student_id,score,published_at,version) values(p_entity_id,p_school_id,(p_payload->>'testId')::uuid,(p_payload->>'studentId')::uuid,(p_payload->>'score')::numeric,(p_payload->>'publishedAt')::timestamptz,1) on conflict(id) do update set score=excluded.score,published_at=excluded.published_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.test_scores.version+1,deleted_at=null returning version into current_version;
      when 'enrollment' then
        insert into public.student_class_enrollments(id,school_id,student_id,class_id,academic_term_id,status,enrolled_at,left_at,version) values(p_entity_id,p_school_id,(p_payload->>'studentId')::uuid,(p_payload->>'classId')::uuid,(p_payload->>'academicTermId')::uuid,p_payload->>'status',coalesce((p_payload->>'enrolledAt')::timestamptz,now()),(p_payload->>'leftAt')::timestamptz,1) on conflict(id) do update set class_id=excluded.class_id,status=excluded.status,left_at=excluded.left_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_class_enrollments.version+1,deleted_at=null returning version into current_version;
      when 'setting' then
        insert into public.settings(id,school_id,scope_type,scope_id,key,value_json,version) values(p_entity_id,p_school_id,p_payload->>'scopeType',(p_payload->>'scopeId')::uuid,p_payload->>'key',p_payload->'valueJson',1) on conflict(id) do update set value_json=excluded.value_json,updated_at=clock_timestamp(),version=public.settings.version+1,deleted_at=null returning version into current_version;
      when 'timetable_entry' then
        insert into public.timetable_entries(id,school_id,class_id,subject_id,teacher_id,academic_term_id,day_of_week,period,start_time,end_time,room,status,version) values(p_entity_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,(p_payload->>'teacherId')::uuid,(p_payload->>'academicTermId')::uuid,(p_payload->>'dayOfWeek')::integer,(p_payload->>'period')::integer,(p_payload->>'startTime')::time,(p_payload->>'endTime')::time,coalesce(p_payload->>'room',''),coalesce((p_payload->>'status')::public.record_status,'active'),1) on conflict(id) do update set class_id=excluded.class_id,subject_id=excluded.subject_id,teacher_id=excluded.teacher_id,academic_term_id=excluded.academic_term_id,day_of_week=excluded.day_of_week,period=excluded.period,start_time=excluded.start_time,end_time=excluded.end_time,room=excluded.room,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.timetable_entries.version+1,deleted_at=null returning version into current_version;
      when 'achievement' then
        insert into public.student_achievements(id,school_id,student_id,achievement_key,dedupe_key,note,awarded_by,awarded_at,version) values(p_entity_id,p_school_id,(p_payload->>'studentId')::uuid,p_payload->>'achievementKey',p_payload->>'dedupeKey',coalesce(p_payload->>'note',''),(p_payload->>'awardedBy')::uuid,coalesce((p_payload->>'awardedAt')::timestamptz,now()),1) on conflict(id) do update set note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_achievements.version+1,deleted_at=null returning version into current_version;
      when 'score_event' then
        student_scope:=(p_payload->>'studentId')::uuid;
        insert into public.score_events(id,school_id,student_id,class_id,subject_id,category,points,reason,source_type,source_id,awarded_by,occurred_at,version) values(p_entity_id,p_school_id,student_scope,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,coalesce(p_payload->>'category','bonus'),(p_payload->>'points')::numeric,coalesce(p_payload->>'reason',''),coalesce(p_payload->>'sourceType','manual'),(p_payload->>'sourceId')::uuid,actor,coalesce((p_payload->>'occurredAt')::timestamptz,now()),1) on conflict(id) do update set points=excluded.points,reason=excluded.reason,category=excluded.category,subject_id=excluded.subject_id,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.score_events.version+1,deleted_at=null returning version into current_version;
    end case;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json,metadata_json) values(p_school_id,actor,case when p_operation='delete' then 'sync_delete' else 'sync_upsert' end,p_entity_type,p_entity_id,student_scope,p_payload,jsonb_build_object('device_id',p_device_id,'idempotency_key',p_idempotency_key));
  insert into public.sync_changes(school_id,entity_type,entity_id,operation,version) values(p_school_id,p_entity_type,p_entity_id,p_operation,current_version) returning revision into new_revision;
  update public.devices set last_seen_at=clock_timestamp(),last_successful_sync_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_device_id;
  result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',p_entity_id,'status','accepted','version',current_version,'revision',new_revision);
  insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
  return result;
end $$;

revoke all on function public.teacher_can_view_class(uuid,uuid) from public,anon;
revoke all on function public.teacher_is_class_advisor(uuid,uuid) from public,anon;
revoke all on function public.teacher_is_assistant_advisor(uuid,uuid) from public,anon;
revoke all on function public.teacher_is_subject_owner(uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_is_subject_co_teacher(uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_can_view_student(uuid,uuid) from public,anon;
revoke all on function public.teacher_can_view_score(uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_can_edit_subject_score(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_can_manage_subject_content(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_can_manage_question_subject(uuid,uuid) from public,anon;
grant execute on function public.teacher_can_view_class(uuid,uuid), public.teacher_is_class_advisor(uuid,uuid), public.teacher_is_assistant_advisor(uuid,uuid), public.teacher_is_subject_owner(uuid,uuid,uuid), public.teacher_is_subject_co_teacher(uuid,uuid,uuid), public.teacher_can_view_student(uuid,uuid), public.teacher_can_view_score(uuid,uuid,uuid), public.teacher_can_edit_subject_score(uuid,uuid,uuid,uuid), public.teacher_can_manage_subject_content(uuid,uuid,uuid,uuid), public.teacher_can_manage_question_subject(uuid,uuid) to authenticated;

commit;
