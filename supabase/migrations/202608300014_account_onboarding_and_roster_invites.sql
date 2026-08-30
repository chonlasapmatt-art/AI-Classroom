-- Account onboarding, game-like class roster invites and safe parent self-service.
-- Names are never a sufficient authorizer: student and parent claims require the school code,
-- student code and an exact normalized name match, with rate limiting at the Edge Function.

begin;

alter table public.user_profiles
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.account_onboarding_attempts (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references auth.users(id) on delete cascade,
  action text not null,
  school_code_hash text not null,
  succeeded boolean not null,
  failure_reason text,
  attempted_at timestamptz not null default clock_timestamp()
);
create index if not exists account_onboarding_attempts_rate_idx
  on public.account_onboarding_attempts(actor_profile_id,attempted_at desc);
alter table public.account_onboarding_attempts enable row level security;
revoke all on public.account_onboarding_attempts from public,anon,authenticated;

create or replace function public.claim_student_account(
  p_actor uuid,
  p_school_code text,
  p_student_code text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_school public.schools%rowtype;
  target_student public.students%rowtype;
  requested text;
  confirmed_at timestamptz;
begin
  select requested_role into requested from public.user_profiles where id=p_actor;
  select email_confirmed_at into confirmed_at from auth.users where id=p_actor;
  if requested <> 'student' or confirmed_at is null then
    raise exception 'ACCOUNT_NOT_READY' using errcode='42501';
  end if;

  select * into target_school from public.schools
  where upper(code)=upper(trim(p_school_code)) and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;

  select * into target_student from public.students
  where school_id=target_school.id
    and upper(student_code)=upper(trim(p_student_code))
    and lower(regexp_replace(trim(display_name),'\s+',' ','g'))=
        lower(regexp_replace(trim(p_display_name),'\s+',' ','g'))
    and status='active' and deleted_at is null
  for update;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;
  if target_student.profile_id is not null and target_student.profile_id<>p_actor then
    raise exception 'TARGET_ALREADY_LINKED' using errcode='23505';
  end if;

  update public.students set profile_id=p_actor,updated_at=clock_timestamp(),
    server_updated_at=clock_timestamp(),version=version+1 where id=target_student.id;
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_actor,'student','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
  update public.user_profiles set display_name=target_student.display_name,
    account_state='active',onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_actor;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target_school.id,p_actor,'student_account_claimed','student',target_student.id,
      jsonb_build_object('studentCode',target_student.student_code));
  return jsonb_build_object('schoolId',target_school.id,'schoolName',target_school.name,
    'studentId',target_student.id,'accountState','active');
end $$;

create or replace function public.request_teacher_account(
  p_actor uuid,
  p_school_code text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_school public.schools%rowtype;
  requested text;
  confirmed_at timestamptz;
  actor_email text;
  teacher_id uuid;
  generated_code text;
begin
  select requested_role into requested from public.user_profiles where id=p_actor;
  select email,email_confirmed_at into actor_email,confirmed_at from auth.users where id=p_actor;
  if requested <> 'teacher' or confirmed_at is null then
    raise exception 'ACCOUNT_NOT_READY' using errcode='42501';
  end if;
  if char_length(trim(p_display_name))<2 then raise exception 'VALIDATION_ERROR'; end if;

  select * into target_school from public.schools
  where upper(code)=upper(trim(p_school_code)) and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;

  select id into teacher_id from public.teachers
    where school_id=target_school.id and profile_id=p_actor and deleted_at is null limit 1;
  if teacher_id is null then
    generated_code := 'REQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.teachers(
      school_id,profile_id,teacher_code,display_name,email,subject,verification_status,status
    ) values(
      target_school.id,p_actor,generated_code,trim(p_display_name),actor_email,'',
      'verification_pending','active'
    ) returning id into teacher_id;
  else
    update public.teachers set display_name=trim(p_display_name),email=actor_email,
      verification_status=case when verification_status='revoked' then 'verification_pending' else verification_status end,
      updated_at=clock_timestamp() where id=teacher_id;
  end if;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_actor,'teacher','inactive')
    on conflict(school_id,profile_id,role) do update
      set status='inactive',active_until=null,updated_at=clock_timestamp();
  update public.user_profiles set display_name=trim(p_display_name),account_state='verification_pending',
    onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_actor;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target_school.id,p_actor,'teacher_verification_requested','teacher',teacher_id,
      jsonb_build_object('displayName',trim(p_display_name)));
  return jsonb_build_object('schoolId',target_school.id,'schoolName',target_school.name,
    'teacherId',teacher_id,'accountState','verification_pending');
end $$;

create or replace function public.request_parent_account_link(
  p_actor uuid,
  p_school_code text,
  p_student_code text,
  p_student_name text,
  p_parent_name text,
  p_relationship text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_school public.schools%rowtype;
  target_student public.students%rowtype;
  requested text;
  confirmed_at timestamptz;
  parent_id uuid;
  link_id uuid;
begin
  select requested_role into requested from public.user_profiles where id=p_actor;
  select email_confirmed_at into confirmed_at from auth.users where id=p_actor;
  if requested <> 'parent' or confirmed_at is null then
    raise exception 'ACCOUNT_NOT_READY' using errcode='42501';
  end if;
  if char_length(trim(p_parent_name))<2 or char_length(trim(p_relationship))<2 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select * into target_school from public.schools
  where upper(code)=upper(trim(p_school_code)) and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;
  select * into target_student from public.students
  where school_id=target_school.id
    and upper(student_code)=upper(trim(p_student_code))
    and lower(regexp_replace(trim(display_name),'\s+',' ','g'))=
        lower(regexp_replace(trim(p_student_name),'\s+',' ','g'))
    and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;

  select id into parent_id from public.parents
    where school_id=target_school.id and profile_id=p_actor limit 1;
  if parent_id is null then
    insert into public.parents(school_id,profile_id,display_name,status)
      values(target_school.id,p_actor,trim(p_parent_name),'active') returning id into parent_id;
  else
    update public.parents set display_name=trim(p_parent_name),status='active',updated_at=clock_timestamp()
      where id=parent_id;
  end if;

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status)
    values(target_school.id,parent_id,target_student.id,trim(p_relationship),'pending')
    on conflict(parent_id,student_id) do update
      set relationship=excluded.relationship,
          status=case when public.parent_student_links.status='linked' then 'linked' else 'pending' end,
          revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),
          version=public.parent_student_links.version+1
    returning id into link_id;
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_actor,'parent','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
  update public.user_profiles set display_name=trim(p_parent_name),account_state='active',
    onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_actor;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target_school.id,p_actor,'parent_link_requested','parent_student_link',link_id,target_student.id,
      jsonb_build_object('relationship',trim(p_relationship),'status','pending'));
  return jsonb_build_object('schoolId',target_school.id,'schoolName',target_school.name,
    'parentLinkId',link_id,'accountState','active','linkState','pending');
end $$;

revoke all on function public.claim_student_account(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.request_teacher_account(uuid,text,text) from public,anon,authenticated;
revoke all on function public.request_parent_account_link(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_student_account(uuid,text,text,text) to service_role;
grant execute on function public.request_teacher_account(uuid,text,text) to service_role;
grant execute on function public.request_parent_account_link(uuid,text,text,text,text,text) to service_role;

-- Creating a class as a verified teacher automatically makes that teacher its primary teacher.
create or replace function public.upsert_class(
  p_school_id uuid,p_class_id uuid,p_academic_term_id uuid,p_name text,p_grade_level text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid();
  current_version integer;
  existed boolean;
  actor_teacher_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_name),'')='' or not exists(
    select 1 from public.academic_terms where id=p_academic_term_id and school_id=p_school_id
  ) then raise exception 'VALIDATION_ERROR'; end if;
  select exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id) into existed;
  insert into public.classes(id,school_id,academic_term_id,name,grade_level,status,version)
    values(p_class_id,p_school_id,p_academic_term_id,trim(p_name),trim(p_grade_level),'active',1)
    on conflict(id) do update set name=excluded.name,grade_level=excluded.grade_level,
      academic_term_id=excluded.academic_term_id,updated_at=clock_timestamp(),
      version=public.classes.version+1,deleted_at=null
    returning version into current_version;
  if not existed and public.is_verified_teacher(p_school_id,actor) then
    select id into actor_teacher_id from public.teachers
      where school_id=p_school_id and profile_id=actor and verification_status='verified_teacher'
        and deleted_at is null limit 1;
    if actor_teacher_id is not null then
      insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class)
        values(gen_random_uuid(),p_school_id,p_class_id,actor_teacher_id,'primary')
        on conflict(class_id,teacher_id) do update set active_until=null,role_in_class='primary',updated_at=clock_timestamp();
    end if;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'class_upsert','class',p_class_id,
      jsonb_build_object('name',p_name,'gradeLevel',p_grade_level,'teacherAutoAssigned',not existed));
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;
revoke all on function public.upsert_class(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.upsert_class(uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.search_school_students(
  p_school_id uuid,p_class_id uuid,p_query text
) returns table(
  student_id uuid,display_name text,student_code text,current_class_id uuid,current_class_name text
) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(trim(p_query))<2 then raise exception 'QUERY_TOO_SHORT'; end if;
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
    and position(lower(trim(p_query)) in lower(s.display_name))>0
  order by s.display_name
  limit 20;
end $$;

create or replace function public.invite_student_to_class(
  p_school_id uuid,p_class_id uuid,p_student_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(p_school_id,actor,'class_roster_invite','student_class_enrollment',enrollment_id,p_student_id,
      jsonb_build_object('classId',p_class_id,'method','name_search_invite'));
  return jsonb_build_object('status','joined','enrollmentId',enrollment_id);
end $$;

revoke all on function public.search_school_students(uuid,uuid,text) from public,anon;
revoke all on function public.invite_student_to_class(uuid,uuid,uuid) from public,anon;
grant execute on function public.search_school_students(uuid,uuid,text) to authenticated;
grant execute on function public.invite_student_to_class(uuid,uuid,uuid) to authenticated;

-- A parent owns their own parent record and can correct contact/relationship details.
create or replace function public.update_own_parent_profile(
  p_school_id uuid,p_display_name text,p_phone text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); parent_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(trim(p_display_name))<2 then raise exception 'VALIDATION_ERROR'; end if;
  update public.parents set display_name=trim(p_display_name),phone=nullif(trim(coalesce(p_phone,'')),''),
    updated_at=clock_timestamp() where school_id=p_school_id and profile_id=actor returning id into parent_id;
  if parent_id is null then raise exception 'NOT_FOUND'; end if;
  update public.user_profiles set display_name=trim(p_display_name),updated_at=clock_timestamp() where id=actor;
  return jsonb_build_object('parentId',parent_id);
end $$;

create or replace function public.update_own_parent_link(
  p_school_id uuid,p_parent_link_id uuid,p_relationship text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(trim(p_relationship))<2 then raise exception 'VALIDATION_ERROR'; end if;
  update public.parent_student_links l set relationship=trim(p_relationship),updated_at=clock_timestamp(),version=l.version+1
  where l.id=p_parent_link_id and l.school_id=p_school_id and exists(
    select 1 from public.parents p where p.id=l.parent_id and p.profile_id=actor
  );
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('entityId',p_parent_link_id);
end $$;

create or replace function public.revoke_parent_link(p_school_id uuid,p_parent_link_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); link public.parent_student_links%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into link from public.parent_student_links where id=p_parent_link_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.can_operate_school(p_school_id) or exists(
    select 1 from public.parents p where p.id=link.parent_id and p.profile_id=actor
  )) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.parent_student_links set status='revoked',revoked_at=clock_timestamp(),
    updated_at=clock_timestamp(),version=version+1 where id=p_parent_link_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json)
    values(p_school_id,actor,'parent_link_revoke','parent_student_link',p_parent_link_id,link.student_id,to_jsonb(link));
  return jsonb_build_object('entityId',p_parent_link_id);
end $$;

revoke all on function public.update_own_parent_profile(uuid,text,text) from public,anon;
revoke all on function public.update_own_parent_link(uuid,uuid,text) from public,anon;
revoke all on function public.revoke_parent_link(uuid,uuid) from public,anon;
grant execute on function public.update_own_parent_profile(uuid,text,text) to authenticated;
grant execute on function public.update_own_parent_link(uuid,uuid,text) to authenticated;
grant execute on function public.revoke_parent_link(uuid,uuid) to authenticated;

-- Pending parent requests remain visible to their owner; student data does not become visible until
-- the link is approved and a consent record exists.
drop policy if exists parent_links_scoped_read on public.parent_student_links;
create policy parent_links_scoped_read on public.parent_student_links for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or exists(select 1 from public.parents p where p.id=parent_student_links.parent_id and p.profile_id=auth.uid())
  or exists(select 1 from public.student_class_enrollments e
    where e.student_id=parent_student_links.student_id and public.teacher_has_class_access(e.class_id))
);

-- Parents and students may read the teachers attached to their own class. This enables the parent
-- portal to show homeroom and subject teachers without opening any other school's roster.
drop policy if exists class_teachers_scoped_read on public.class_teachers;
create policy class_teachers_scoped_read on public.class_teachers for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.teacher_has_class_access(class_id)
  or exists(select 1 from public.student_class_enrollments e where e.class_id=class_teachers.class_id
    and e.status='active' and e.deleted_at is null and public.student_owns_student_record(e.student_id))
  or exists(select 1 from public.student_class_enrollments e where e.class_id=class_teachers.class_id
    and e.status='active' and e.deleted_at is null
    and public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id))
);

-- Staff approval is authoritative; the parent may grant/revoke their own consent only after their
-- link has already been approved by staff.
create or replace function public.set_parent_consent(
  p_school_id uuid,p_parent_link_id uuid,p_granted boolean,p_policy_version text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); link public.parent_student_links%rowtype; new_consent_id uuid; parent_owner boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into link from public.parent_student_links where id=p_parent_link_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select exists(select 1 from public.parents p where p.id=link.parent_id and p.profile_id=actor) into parent_owner;
  if not (public.can_operate_school(p_school_id) or (parent_owner and link.status='linked')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version,accepted_at,revoked_at)
    values(p_school_id,link.parent_id,link.student_id,'student_data_sharing',p_policy_version,
      clock_timestamp(),case when p_granted then null else clock_timestamp() end)
    returning id into new_consent_id;
  update public.parent_student_links set
    consent_id=case when p_granted then new_consent_id else null end,
    status=case when p_granted then 'linked' else status end,
    updated_at=clock_timestamp(),version=version+1 where id=p_parent_link_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(p_school_id,actor,'parent_consent','parent_student_link',p_parent_link_id,link.student_id,
      jsonb_build_object('granted',p_granted,'policyVersion',p_policy_version));
  return jsonb_build_object('entityId',p_parent_link_id,'granted',p_granted);
end $$;
revoke all on function public.set_parent_consent(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.set_parent_consent(uuid,uuid,boolean,text) to authenticated;

commit;
