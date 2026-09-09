-- Joining a room, and telling the devices about it.
--
-- Three things here:
--
--   * `provision_managed_account`, `invite_student_to_class` and `transfer_student` write rows the
--     devices read, and none of them journalled the write. A student invited into a room by a
--     teacher appeared on the server and on nobody's screen until that device's cache was cleared.
--   * `search_school_students` matched on the display name only. A teacher adding a child to their
--     room is told the child's name and number, and the number is the half that is unambiguous --
--     two children share a name, no two share a number.
--   * a backfill, so every device already holding a stale student or enrollment heals on its next
--     pull instead of needing a reinstall.

create or replace function public.provision_managed_account(
  p_actor uuid, p_school_id uuid, p_role text, p_record_id uuid, p_student_id uuid, p_profile_id uuid,
  p_display_name text, p_first_name text, p_last_name text, p_auth_email text,
  p_relationship text default 'ผู้ปกครอง', p_phone text default ''
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  identity_role text;
  target_teacher public.teachers%rowtype;
  target_student public.students%rowtype;
  target_parent public.parents%rowtype;
  guardian_id uuid := p_record_id;
  link_id uuid;
  new_version integer;
begin
  if p_actor is null or p_profile_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_role not in ('teacher','student','parent') or char_length(clean_name)<2
    or char_length(clean_name)>200 or coalesce(trim(p_auth_email),'')='' then
    raise exception 'VALIDATION_ERROR';
  end if;
  if not public.member_can_operate(p_actor,p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  select role into identity_role from public.member_login_identities where profile_id=p_profile_id;
  if identity_role is not null and identity_role<>p_role then raise exception 'ROLE_CONFLICT'; end if;

  if p_role='teacher' then
    select * into target_teacher from public.teachers
      where id=p_record_id and school_id=p_school_id and status='active' and deleted_at is null for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if target_teacher.profile_id is not null and target_teacher.profile_id<>p_profile_id then raise exception 'TARGET_ALREADY_LINKED'; end if;
  elsif p_role='student' then
    select * into target_student from public.students
      where id=p_record_id and school_id=p_school_id and status='active' and deleted_at is null for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if target_student.profile_id is not null and target_student.profile_id<>p_profile_id then raise exception 'TARGET_ALREADY_LINKED'; end if;
  else
    if p_student_id is null then raise exception 'VALIDATION_ERROR'; end if;
    select * into target_student from public.students
      where id=p_student_id and school_id=p_school_id and status='active' and deleted_at is null;
    if not found then raise exception 'NOT_FOUND'; end if;
    if guardian_id is null then guardian_id:=gen_random_uuid(); end if;
    select * into target_parent from public.parents where id=guardian_id and school_id=p_school_id for update;
    if found and target_parent.profile_id is not null and target_parent.profile_id<>p_profile_id then
      raise exception 'TARGET_ALREADY_LINKED';
    end if;
    insert into public.parents(id,school_id,profile_id,display_name,first_name,last_name,phone,status,creation_source)
      values(guardian_id,p_school_id,p_profile_id,clean_name,clean_first,clean_last,nullif(trim(coalesce(p_phone,'')),''),'active','admin')
    on conflict(id) do update set profile_id=excluded.profile_id,display_name=excluded.display_name,
      first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,status='active',updated_at=clock_timestamp();
  end if;

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_profile_id,clean_name,p_role,'active')
  on conflict(id) do update set display_name=excluded.display_name,requested_role=excluded.requested_role,
    account_state='active',updated_at=clock_timestamp();

  insert into public.member_login_identities(profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source)
    values(p_profile_id,p_role,clean_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,'admin')
  on conflict(profile_id) do update set role=excluded.role,display_name=excluded.display_name,
    first_name=excluded.first_name,last_name=excluded.last_name,auth_email=excluded.auth_email,
    school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  if p_role='teacher' then
    update public.teachers set profile_id=p_profile_id,first_name=clean_first,last_name=clean_last,
      verification_status='verified_teacher',status='active',updated_at=clock_timestamp() where id=target_teacher.id;
  elsif p_role='student' then
    update public.students set profile_id=p_profile_id,first_name=clean_first,last_name=clean_last,
      student_access_enabled=true,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1
      where id=target_student.id
    returning version into new_version;
    -- Without this the child's own device never learns the record is theirs, and the app opens empty.
    perform public.journal_sync_change(p_school_id,'student',target_student.id,'upsert',new_version);
  else
    -- `linked`, not `pending`. The queue this used to join is the staff queue for guardians who
    -- found a child by name; an administrator choosing a child off their own roster is the person
    -- that queue exists to ask.
    insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
      values(p_school_id,guardian_id,p_student_id,coalesce(nullif(trim(p_relationship),''),'ผู้ปกครอง'),'linked',clock_timestamp())
    on conflict(parent_id,student_id) do update set relationship=excluded.relationship,
      status='linked',linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),
      revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),version=public.parent_student_links.version+1
    returning id into link_id;
  end if;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(p_school_id,p_profile_id,p_role::public.membership_role,'active')
  on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,p_actor,'MANAGED_ACCOUNT_PROVISIONED',p_role,p_record_id,
      jsonb_build_object('profileId',p_profile_id,'role',p_role,'source','admin'));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,p_role,'MANAGED_ACCOUNT_PROVISIONED',p_school_id,jsonb_build_object('source','admin'));

  return jsonb_build_object('profileId',p_profile_id,'role',p_role,'displayName',clean_name,
    'schoolId',p_school_id,'parentId',case when p_role='parent' then guardian_id else null end,'linkId',link_id);
end $fn$;

create or replace function public.invite_student_to_class(p_school_id uuid, p_class_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  actor uuid:=auth.uid();
  target_class public.classes%rowtype;
  existing_enrollment public.student_class_enrollments%rowtype;
  enrolled_count integer;
  enrollment_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target_class from public.classes
    where id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(p_class_id)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists(select 1 from public.students where id=p_student_id and school_id=p_school_id
    and status='active' and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
  select * into existing_enrollment from public.student_class_enrollments
    where student_id=p_student_id and academic_term_id=target_class.academic_term_id
      and status='active' and deleted_at is null for update;
  if found then
    if existing_enrollment.class_id=p_class_id then
      return jsonb_build_object('status','already_member','enrollmentId',existing_enrollment.id);
    end if;
    return jsonb_build_object('status','already_enrolled_elsewhere','currentClassId',existing_enrollment.class_id);
  end if;
  select count(*) into enrolled_count from public.student_class_enrollments
    where class_id=p_class_id and status='active' and deleted_at is null;
  if enrolled_count>=target_class.capacity then raise exception 'CLASS_FULL' using errcode='22000'; end if;
  insert into public.student_class_enrollments(school_id,student_id,class_id,academic_term_id,status)
    values(p_school_id,p_student_id,p_class_id,target_class.academic_term_id,'active') returning id into enrollment_id;
  -- The roster row and the student it points at both have to reach the devices: the enrollment so
  -- the room fills, the student so a child whose record is new to this device is not a blank name.
  perform public.journal_sync_change(p_school_id,'enrollment',enrollment_id,'upsert',1);
  perform public.journal_sync_change(p_school_id,'student',p_student_id,'upsert',null);
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(p_school_id,actor,'class_roster_invite','student_class_enrollment',enrollment_id,p_student_id,
      jsonb_build_object('classId',p_class_id,'method','name_search_invite'));
  return jsonb_build_object('status','joined','enrollmentId',enrollment_id);
end $fn$;

create or replace function public.transfer_student(p_student_id uuid, p_to_class_id uuid, p_academic_term_id uuid)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  school uuid; actor uuid:=auth.uid();
  old_record public.student_class_enrollments%rowtype;
  new_id uuid:=gen_random_uuid();
  closed_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select school_id into school from public.students where id=p_student_id and deleted_at is null;
  if school is null or not public.can_operate_school(school) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.classes where id=p_to_class_id and school_id=school and academic_term_id=p_academic_term_id and deleted_at is null) then raise exception 'VALIDATION_ERROR'; end if;
  select * into old_record from public.student_class_enrollments where student_id=p_student_id and academic_term_id=p_academic_term_id and status='active' and deleted_at is null for update;
  if found and old_record.class_id=p_to_class_id then raise exception 'DUPLICATE_ACTIVE_ENROLLMENT'; end if;
  if found then
    update public.student_class_enrollments set status='transferred',left_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=old_record.id
    returning version into closed_version;
    perform public.journal_sync_change(school,'enrollment',old_record.id,'upsert',closed_version);
  end if;
  insert into public.student_class_enrollments(id,school_id,student_id,class_id,academic_term_id,status) values(new_id,school,p_student_id,p_to_class_id,p_academic_term_id,'active');
  perform public.journal_sync_change(school,'enrollment',new_id,'upsert',1);
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json,after_json)
  values(school,actor,'student_transfer','student_class_enrollment',new_id,p_student_id,to_jsonb(old_record),jsonb_build_object('class_id',p_to_class_id,'academic_term_id',p_academic_term_id));
  return new_id;
end $fn$;

-- Name or number. A teacher holds a slip with both on it, and the number is the half that is not
-- shared by two children in the same year.
create or replace function public.search_school_students(p_school_id uuid, p_class_id uuid, p_query text)
returns table(student_id uuid, display_name text, student_code text, current_class_id uuid, current_class_name text)
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $fn$
declare needle text := lower(trim(coalesce(p_query,'')));
        code_needle text := public.normalize_student_code(coalesce(p_query,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(needle)<2 then raise exception 'QUERY_TOO_SHORT'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(p_class_id)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  return query
  select s.id,s.display_name,s.student_code,c.id,c.name
  from public.students s
  left join public.student_class_enrollments e on e.student_id=s.id and e.status='active'
    and e.deleted_at is null
  left join public.classes c on c.id=e.class_id
  where s.school_id=p_school_id and s.status='active' and s.deleted_at is null
    and (
      position(needle in lower(s.display_name))>0
      or (char_length(code_needle)>0 and position(code_needle in public.normalize_student_code(s.student_code))>0)
    )
  -- An exact number is the one the teacher typed off the slip, so it leads.
  order by (public.normalize_student_code(s.student_code)=code_needle) desc, s.display_name
  limit 20;
end $fn$;

-- Heal what the missing journal entries left behind: every student and every enrollment whose
-- current version was never announced gets one entry now, so devices pull it on their next tick.
do $backfill$
declare touched integer;
begin
  insert into public.sync_changes(school_id, entity_type, entity_id, operation, version)
  select s.school_id, 'student', s.id, 'upsert'::public.sync_operation, s.version
  from public.students s
  where s.version > coalesce((select max(c.version) from public.sync_changes c
    where c.entity_type='student' and c.entity_id=s.id), 0);
  get diagnostics touched = row_count;
  raise notice 'journalled % student rows', touched;

  insert into public.sync_changes(school_id, entity_type, entity_id, operation, version)
  select e.school_id, 'enrollment', e.id, 'upsert'::public.sync_operation, e.version
  from public.student_class_enrollments e
  where e.version > coalesce((select max(c.version) from public.sync_changes c
    where c.entity_type='enrollment' and c.entity_id=e.id), 0);
  get diagnostics touched = row_count;
  raise notice 'journalled % enrollment rows', touched;
end $backfill$;
