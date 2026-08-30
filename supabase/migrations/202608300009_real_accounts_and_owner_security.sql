begin;

-- Owner-approved upgrade: public registration is limited to teacher/student/parent requests.
-- The request is identity metadata only; it never creates an authoritative school membership.
alter table public.user_profiles add column if not exists requested_role text;
alter table public.user_profiles add column if not exists account_state text not null default 'registered';
alter table public.user_profiles drop constraint if exists user_profiles_requested_role_check;
alter table public.user_profiles add constraint user_profiles_requested_role_check
  check (requested_role is null or requested_role in ('teacher','student','parent'));
alter table public.user_profiles drop constraint if exists user_profiles_account_state_check;
alter table public.user_profiles add constraint user_profiles_account_state_check
  check (account_state in ('registered','email_unverified','verification_pending','active','suspended'));

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare requested text := new.raw_user_meta_data->>'requested_role';
begin
  if requested not in ('teacher','student','parent') then requested := null; end if;
  insert into public.user_profiles(id,display_name,requested_role,account_state)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'ผู้ใช้งาน'),200),
    requested,
    case when new.email_confirmed_at is null then 'email_unverified' else 'registered' end
  )
  on conflict(id) do update set
    display_name=excluded.display_name,
    requested_role=coalesce(public.user_profiles.requested_role,excluded.requested_role),
    updated_at=clock_timestamp();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Existing teachers remain usable. Newly created teacher records wait for trusted verification.
alter table public.teachers add column if not exists verification_status text;
update public.teachers set verification_status='verified_teacher' where verification_status is null;
alter table public.teachers alter column verification_status set default 'verification_pending';
alter table public.teachers alter column verification_status set not null;
alter table public.teachers drop constraint if exists teachers_verification_status_check;
alter table public.teachers add constraint teachers_verification_status_check
  check (verification_status in ('teacher_requested','verification_pending','verified_teacher','revoked'));

create or replace function public.is_verified_teacher(target_school uuid, target_profile uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    join public.teachers t on t.school_id=m.school_id and t.profile_id=m.profile_id
    where m.school_id=target_school and m.profile_id=target_profile and m.role='teacher'
      and m.status='active' and m.active_from<=now() and (m.active_until is null or m.active_until>now())
      and t.status='active' and t.deleted_at is null and t.verification_status='verified_teacher'
  );
$$;

create or replace function public.has_school_role(target_school uuid, target_role public.membership_role)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.school_id=target_school and m.profile_id=(select auth.uid()) and m.role=target_role
      and m.status='active' and m.active_from<=now() and (m.active_until is null or m.active_until>now())
      and (target_role <> 'teacher' or public.is_verified_teacher(target_school,(select auth.uid())))
  );
$$;

create or replace function public.can_operate_school(target_school uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_school_role(target_school,'admin') or public.is_verified_teacher(target_school,(select auth.uid()));
$$;

create or replace function public.teacher_has_class_access(target_class uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.class_teachers ct
    join public.teachers t on t.id=ct.teacher_id
    where ct.class_id=target_class and t.profile_id=(select auth.uid()) and t.status='active'
      and t.deleted_at is null and t.verification_status='verified_teacher'
      and public.is_verified_teacher(ct.school_id,(select auth.uid()))
      and (ct.active_until is null or ct.active_until>now())
  );
$$;

-- Parent links historically used both "linked" and "active". Treat either as active while retaining revocation.
create or replace function public.parent_has_active_link(target_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id
    where l.student_id=target_student and p.profile_id=(select auth.uid()) and l.status in ('active','linked')
      and l.revoked_at is null and l.deleted_at is null);
$$;
create or replace function public.parent_has_active_consent(target_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id
    join public.consents c on c.id=l.consent_id where l.student_id=target_student
      and p.profile_id=(select auth.uid()) and l.status in ('active','linked')
      and l.revoked_at is null and c.revoked_at is null);
$$;

create or replace function public.verify_teacher(
  p_school_id uuid, p_teacher_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target public.teachers%rowtype; peer_allowed boolean:=false;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select coalesce((value_json->>'allowVerifiedTeacherApproval')::boolean,false) into peer_allowed
    from public.settings where school_id=p_school_id and key='teacher_verification_policy' limit 1;
  if not (public.has_school_role(p_school_id,'admin') or (peer_allowed and public.is_verified_teacher(p_school_id,actor))) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into target from public.teachers where id=p_teacher_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'VALIDATION_ERROR: reason required'; end if;
  update public.teachers set verification_status='verified_teacher',status='active',updated_at=clock_timestamp()
    where id=p_teacher_id;
  update public.school_memberships set status='active',updated_at=clock_timestamp()
    where school_id=p_school_id and profile_id=target.profile_id and role='teacher';
  update public.user_profiles set account_state='active',updated_at=clock_timestamp() where id=target.profile_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,before_json,after_json,metadata_json)
  values(p_school_id,actor,'teacher_verified','teacher',p_teacher_id,to_jsonb(target),
    jsonb_build_object('verificationStatus','verified_teacher'),jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('teacherId',p_teacher_id,'status','verified_teacher');
end $$;

revoke all on function public.verify_teacher(uuid,uuid,text) from public,anon;
grant execute on function public.verify_teacher(uuid,uuid,text) to authenticated;

-- A verified teacher can perform normal school operations, including history-preserving transfer.
create or replace function public.transfer_student(p_student_id uuid,p_to_class_id uuid,p_academic_term_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare school uuid; actor uuid:=auth.uid(); old_record public.student_class_enrollments%rowtype; new_id uuid:=gen_random_uuid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select school_id into school from public.students where id=p_student_id and deleted_at is null;
  if school is null or not public.can_operate_school(school) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.classes where id=p_to_class_id and school_id=school and academic_term_id=p_academic_term_id and deleted_at is null) then raise exception 'VALIDATION_ERROR'; end if;
  select * into old_record from public.student_class_enrollments where student_id=p_student_id and academic_term_id=p_academic_term_id and status='active' and deleted_at is null for update;
  if found and old_record.class_id=p_to_class_id then raise exception 'DUPLICATE_ACTIVE_ENROLLMENT'; end if;
  if found then update public.student_class_enrollments set status='transferred',left_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=old_record.id; end if;
  insert into public.student_class_enrollments(id,school_id,student_id,class_id,academic_term_id,status) values(new_id,school,p_student_id,p_to_class_id,p_academic_term_id,'active');
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json,after_json)
  values(school,actor,'student_transfer','student_class_enrollment',new_id,p_student_id,to_jsonb(old_record),jsonb_build_object('class_id',p_to_class_id,'academic_term_id',p_academic_term_id));
  return new_id;
end $$;

-- Private owner access audit is server-only and works even before a school exists.
create table if not exists public.admin_access_attempts (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references auth.users(id) on delete set null,
  fingerprint_hash text not null,
  succeeded boolean not null,
  failure_reason text,
  attempted_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz
);
create index if not exists admin_access_rate_idx on public.admin_access_attempts(actor_profile_id,fingerprint_hash,attempted_at desc);
alter table public.admin_access_attempts enable row level security;
revoke all on public.admin_access_attempts from public,anon,authenticated;

create or replace function public.bootstrap_school_owner(
  p_actor uuid,p_school_name text,p_school_code text,p_academic_year text,p_term text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare school uuid:=gen_random_uuid(); term_id uuid:=gen_random_uuid(); profile_name text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if exists(select 1 from public.school_memberships where profile_id=p_actor) then raise exception 'ALREADY_HAS_MEMBERSHIP'; end if;
  if char_length(trim(p_school_name))<2 or upper(p_school_code)!~'^[A-Z0-9-]{3,20}$' or char_length(trim(p_academic_year))<2 or char_length(trim(p_term))<1 then raise exception 'VALIDATION_ERROR'; end if;
  select coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1),'เจ้าของระบบ') into profile_name from auth.users where id=p_actor;
  insert into public.user_profiles(id,display_name,account_state) values(p_actor,profile_name,'active')
    on conflict(id) do update set account_state='active',updated_at=clock_timestamp();
  insert into public.schools(id,name,code) values(school,trim(p_school_name),upper(p_school_code));
  insert into public.school_memberships(school_id,profile_id,role,status) values(school,p_actor,'admin','active');
  insert into public.academic_terms(id,school_id,academic_year,term,starts_on,ends_on,status)
    values(term_id,school,trim(p_academic_year),trim(p_term),current_date,current_date+interval '180 days','active');
  insert into public.settings(school_id,scope_type,key,value_json) values
    (school,'school','score_policy','{"weights":{"assignment":60,"activity":30,"test":10},"passingScore":60,"latePenaltyPercent":10,"missingItem":"zero"}'::jsonb),
    (school,'school','privacy_policy','{"version":"1.0","status":"draft"}'::jsonb),
    (school,'school','consent_policy','{"version":"1.0","status":"draft"}'::jsonb),
    (school,'school','teacher_verification_policy','{"allowVerifiedTeacherApproval":false}'::jsonb);
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(school,p_actor,'owner_school_bootstrap','school',school,jsonb_build_object('name',trim(p_school_name),'code',upper(p_school_code)));
  return school;
end $$;

revoke all on function public.bootstrap_school_owner(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_school_owner(uuid,text,text,text,text) to service_role;

-- Close the legacy privilege-escalation path. The Edge Function is now the only bootstrap boundary.
create or replace function public.bootstrap_school(p_school_name text,p_school_code text,p_academic_year text,p_term text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  raise exception 'OWNER_AUTHORIZATION_REQUIRED' using errcode='42501';
end $$;
revoke all on function public.bootstrap_school(text,text,text,text) from public,anon,authenticated;

-- Normal management RPCs use the operational boundary. Deep settings and role assignment remain admin-only.
create or replace function public.upsert_class(p_school_id uuid,p_class_id uuid,p_academic_term_id uuid,p_name text,p_grade_level text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_name),'')='' or not exists(select 1 from public.academic_terms where id=p_academic_term_id and school_id=p_school_id) then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.classes(id,school_id,academic_term_id,name,grade_level,status,version)
  values(p_class_id,p_school_id,p_academic_term_id,trim(p_name),trim(p_grade_level),'active',1)
  on conflict(id) do update set name=excluded.name,grade_level=excluded.grade_level,academic_term_id=excluded.academic_term_id,updated_at=clock_timestamp(),version=public.classes.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'class_upsert','class',p_class_id,jsonb_build_object('name',p_name,'gradeLevel',p_grade_level));
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.set_class_capacity(p_school_id uuid,p_class_id uuid,p_capacity integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); enrolled integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_capacity is null or p_capacity<=0 or p_capacity>200 then raise exception 'VALIDATION_ERROR'; end if;
  select count(*) into enrolled from public.student_class_enrollments where class_id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null;
  if p_capacity<enrolled then raise exception 'VALIDATION_ERROR: capacity below enrollment'; end if;
  update public.classes set capacity=p_capacity,updated_at=clock_timestamp(),version=version+1 where id=p_class_id and school_id=p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'class_capacity','class',p_class_id,jsonb_build_object('capacity',p_capacity));
  return jsonb_build_object('entityId',p_class_id,'capacity',p_capacity);
end $$;

create or replace function public.archive_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='archived',updated_at=clock_timestamp(),version=version+1 where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(p_school_id,actor,'class_archive','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.restore_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='active',deleted_at=null,updated_at=clock_timestamp(),version=version+1 where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(p_school_id,actor,'class_restore','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.delete_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); enrolled integer; current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select count(*) into enrolled from public.student_class_enrollments where class_id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null;
  if enrolled>0 then raise exception 'VALIDATION_ERROR: class has active enrollments'; end if;
  delete from public.class_teachers where class_id=p_class_id and school_id=p_school_id;
  update public.classes set status='inactive',deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(p_school_id,actor,'class_delete','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.upsert_subject(p_school_id uuid,p_subject_id uuid,p_code text,p_name text,p_name_en text,p_color_index integer,p_icon_key text,p_sort_order integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_code),'')='' or coalesce(trim(p_name),'')='' then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.subjects(id,school_id,code,name,name_en,color_index,icon_key,sort_order,status,version)
  values(p_subject_id,p_school_id,upper(trim(p_code)),trim(p_name),coalesce(p_name_en,''),coalesce(p_color_index,0),coalesce(p_icon_key,'default'),coalesce(p_sort_order,0),'active',1)
  on conflict(id) do update set code=excluded.code,name=excluded.name,name_en=excluded.name_en,color_index=excluded.color_index,icon_key=excluded.icon_key,sort_order=excluded.sort_order,updated_at=clock_timestamp(),version=public.subjects.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'subject_upsert','subject',p_subject_id,jsonb_build_object('code',p_code,'name',p_name));
  return jsonb_build_object('entityId',p_subject_id,'version',current_version);
end $$;

create or replace function public.archive_subject(p_school_id uuid,p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.subjects set status='inactive',updated_at=clock_timestamp(),version=version+1 where id=p_subject_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(p_school_id,actor,'subject_archive','subject',p_subject_id);
  return jsonb_build_object('entityId',p_subject_id,'version',current_version);
end $$;

create or replace function public.upsert_teacher(p_school_id uuid,p_teacher_id uuid,p_teacher_code text,p_display_name text,p_email text,p_subject text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.teachers(id,school_id,teacher_code,display_name,email,subject,status,version,verification_status)
  values(p_teacher_id,p_school_id,trim(p_teacher_code),trim(p_display_name),coalesce(p_email,''),coalesce(p_subject,''),'active',1,'verification_pending')
  on conflict(id) do update set teacher_code=excluded.teacher_code,display_name=excluded.display_name,email=excluded.email,subject=excluded.subject,updated_at=clock_timestamp(),version=public.teachers.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'teacher_upsert','teacher',p_teacher_id,jsonb_build_object('displayName',p_display_name,'verificationStatus','verification_pending'));
  return jsonb_build_object('entityId',p_teacher_id,'version',current_version);
end $$;

create or replace function public.assign_class_teacher(p_school_id uuid,p_class_teacher_id uuid,p_class_id uuid,p_teacher_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('primary','assistant') then raise exception 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id) or not exists(select 1 from public.teachers where id=p_teacher_id and school_id=p_school_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class) values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role)
  on conflict(class_id,teacher_id) do update set role_in_class=excluded.role_in_class,updated_at=clock_timestamp();
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,actor,'class_teacher_assign','class_teacher',p_class_teacher_id,jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'role',p_role));
  return jsonb_build_object('entityId',p_class_teacher_id);
end $$;

create or replace function public.unassign_class_teacher(p_school_id uuid,p_class_teacher_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  delete from public.class_teachers where id=p_class_teacher_id and school_id=p_school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id) values(p_school_id,actor,'class_teacher_unassign','class_teacher',p_class_teacher_id);
  return jsonb_build_object('entityId',p_class_teacher_id);
end $$;

create or replace function public.revoke_parent_link(p_school_id uuid,p_parent_link_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); link public.parent_student_links%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into link from public.parent_student_links where id=p_parent_link_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.parent_student_links set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_parent_link_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json) values(p_school_id,actor,'parent_link_revoke','parent_student_link',p_parent_link_id,link.student_id,to_jsonb(link));
  return jsonb_build_object('entityId',p_parent_link_id);
end $$;

revoke all on function public.upsert_class(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.set_class_capacity(uuid,uuid,integer) from public,anon;
revoke all on function public.archive_class(uuid,uuid) from public,anon;
revoke all on function public.restore_class(uuid,uuid) from public,anon;
revoke all on function public.delete_class(uuid,uuid) from public,anon;
revoke all on function public.upsert_subject(uuid,uuid,text,text,text,integer,text,integer) from public,anon;
revoke all on function public.archive_subject(uuid,uuid) from public,anon;
revoke all on function public.upsert_teacher(uuid,uuid,text,text,text,text) from public,anon;
revoke all on function public.assign_class_teacher(uuid,uuid,uuid,uuid,text) from public,anon;
revoke all on function public.unassign_class_teacher(uuid,uuid) from public,anon;
revoke all on function public.revoke_parent_link(uuid,uuid) from public,anon;

grant execute on function public.upsert_class(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.set_class_capacity(uuid,uuid,integer) to authenticated;
grant execute on function public.archive_class(uuid,uuid) to authenticated;
grant execute on function public.restore_class(uuid,uuid) to authenticated;
grant execute on function public.delete_class(uuid,uuid) to authenticated;
grant execute on function public.upsert_subject(uuid,uuid,text,text,text,integer,text,integer) to authenticated;
grant execute on function public.archive_subject(uuid,uuid) to authenticated;
grant execute on function public.upsert_teacher(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.assign_class_teacher(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.unassign_class_teacher(uuid,uuid) to authenticated;
grant execute on function public.revoke_parent_link(uuid,uuid) to authenticated;

comment on table public.admin_access_attempts is 'Server-only owner access attempts. Raw access codes must never be stored.';
comment on function public.bootstrap_school_owner(uuid,text,text,text,text) is 'Service-role-only school bootstrap after Edge Function owner-code validation.';

commit;
