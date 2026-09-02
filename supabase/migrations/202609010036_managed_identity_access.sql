begin;

-- Managed roster entries are usable identities. The Auth address is deterministic and internal;
-- staff never has to collect an email just to create a teacher account.
create or replace function public.upsert_teacher(
  p_school_id uuid, p_teacher_id uuid, p_teacher_code text, p_display_name text, p_email text, p_subject text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_display_name),'')='' or coalesce(trim(p_teacher_code),'')='' then
    raise exception 'VALIDATION_ERROR';
  end if;
  insert into public.teachers(id,school_id,teacher_code,display_name,email,subject,status,verification_status,creation_source,version)
    values(p_teacher_id,p_school_id,trim(p_teacher_code),trim(p_display_name),nullif(trim(coalesce(p_email,'')),''),trim(coalesce(p_subject,'')),'active','verified_teacher','admin',1)
  on conflict(id) do update set teacher_code=excluded.teacher_code,display_name=excluded.display_name,
    email=excluded.email,subject=excluded.subject,verification_status='verified_teacher',status='active',
    creation_source='admin',updated_at=clock_timestamp(),
    version=public.teachers.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'TEACHER_CREATED','teacher',p_teacher_id,
      jsonb_build_object('displayName',trim(p_display_name),'teacherCode',trim(p_teacher_code),'managedAccount',true));
  return jsonb_build_object('entityId',p_teacher_id,'version',current_version);
end $$;

-- The Edge Function creates the Auth user; this trusted function binds it to the one teacher row.
-- Verification is already implied by the school administrator's managed creation workflow.
create or replace function public.provision_teacher_identity(
  p_actor uuid, p_school_id uuid, p_teacher_id uuid, p_profile_id uuid, p_auth_email text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.teachers%rowtype; clean_name text; split_at integer; clean_first text; clean_last text;
begin
  if p_actor is null or p_profile_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not exists(select 1 from public.school_memberships where school_id=p_school_id and profile_id=p_actor
    and role='admin' and status='active' and active_from<=now() and (active_until is null or active_until>now())) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into target from public.teachers where id=p_teacher_id and school_id=p_school_id and status='active' and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if target.profile_id is not null and target.profile_id<>p_profile_id then raise exception 'TARGET_ALREADY_LINKED'; end if;
  if not exists(select 1 from auth.users where id=p_profile_id and lower(email)=lower(trim(p_auth_email))) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  clean_name := regexp_replace(trim(coalesce(target.display_name,'')),'\s+',' ','g');
  if char_length(clean_name)<2 then raise exception 'VALIDATION_ERROR'; end if;
  split_at := strpos(clean_name,' ');
  clean_first := case when split_at>0 then left(clean_name,split_at-1) else clean_name end;
  clean_last := case when split_at>0 then trim(substr(clean_name,split_at+1)) else '-' end;
  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_profile_id,clean_name,'teacher','active')
  on conflict(id) do update set display_name=excluded.display_name,requested_role='teacher',account_state='active',updated_at=clock_timestamp();
  insert into public.member_login_identities(profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source)
    values(p_profile_id,'teacher',clean_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,'admin')
  on conflict(profile_id) do update set role='teacher',display_name=excluded.display_name,first_name=excluded.first_name,
    last_name=excluded.last_name,auth_email=excluded.auth_email,school_id=excluded.school_id,status='active',updated_at=clock_timestamp();
  update public.teachers set profile_id=p_profile_id,first_name=clean_first,last_name=clean_last,
    verification_status='verified_teacher',updated_at=clock_timestamp() where id=target.id;
  insert into public.school_memberships(school_id,profile_id,role,status) values(p_school_id,p_profile_id,'teacher','active')
    on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,p_actor,'TEACHER_ACCOUNT_PROVISIONED','teacher',target.id,jsonb_build_object('profileId',p_profile_id,'source','admin'));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,'teacher','TEACHER_LOGIN_CREDENTIAL_CREATED',p_school_id,jsonb_build_object('teacherId',target.id));
  return jsonb_build_object('teacherId',target.id,'profileId',p_profile_id,'displayName',clean_name);
end $$;
revoke all on function public.provision_teacher_identity(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.provision_teacher_identity(uuid,uuid,uuid,uuid,text) to service_role;

-- Parent search is school-scoped. A parent never gets a global student directory.
create or replace function public.search_children_for_parent(p_actor uuid, p_school_id uuid, p_child_name text)
returns table(student_id uuid, display_name text, school_id uuid, school_name text, class_name text,
  masked_code text, avatar_index integer, already_linked boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare wanted text := lower(regexp_replace(trim(coalesce(p_child_name,'')),'\s+',' ','g'));
begin
  if p_actor is null or p_school_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(wanted)<2 then raise exception 'QUERY_TOO_SHORT'; end if;
  return query select s.id,s.display_name,s.school_id,sc.name,
    coalesce((select c.name from public.student_class_enrollments e join public.classes c on c.id=e.class_id
      where e.student_id=s.id and e.status='active' and e.deleted_at is null order by e.enrolled_at desc limit 1),''),
    public.mask_student_code(s.student_code),s.avatar_index,
    exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id
      where l.student_id=s.id and p.profile_id=p_actor and l.deleted_at is null and l.revoked_at is null)
  from public.students s join public.schools sc on sc.id=s.school_id
  where s.school_id=p_school_id and s.status='active' and s.deleted_at is null and sc.status='active' and sc.deleted_at is null
    and (s.normalized_name=wanted or s.normalized_name like wanted||' %'
      or lower(regexp_replace(trim(coalesce(s.first_name,'')),'\s+',' ','g'))=wanted)
  order by s.display_name limit 10;
end $$;
revoke all on function public.search_children_for_parent(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.search_children_for_parent(uuid,uuid,text) to service_role;

-- A valid school-scoped match links immediately. Pending rows remain supported for legacy/exceptions.
create or replace function public.link_parent_child(p_actor uuid, p_student_id uuid, p_relationship text default 'ผู้ปกครอง')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare identity public.member_login_identities%rowtype; target public.students%rowtype; school_name text;
  parent_id uuid; existing_parent uuid; link public.parent_student_links%rowtype; policy_version text; new_consent uuid;
  clean_relationship text := coalesce(nullif(regexp_replace(trim(coalesce(p_relationship,'')),'\s+',' ','g'),''),'ผู้ปกครอง');
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into identity from public.member_login_identities where profile_id=p_actor and role='parent';
  if not found or identity.status<>'active' then raise exception 'MEMBER_ACCESS_DENIED' using errcode='42501'; end if;
  select * into target from public.students where id=p_student_id and status='active' and deleted_at is null for update;
  if not found or (identity.school_id is not null and identity.school_id<>target.school_id) then raise exception 'CHILD_NOT_AVAILABLE' using errcode='22000'; end if;
  select name into school_name from public.schools where id=target.school_id;
  select p.id into existing_parent from public.parents p join public.parent_student_links l on l.parent_id=p.id and l.student_id=target.id and l.deleted_at is null
    where p.school_id=target.school_id and p.profile_id is null and lower(regexp_replace(trim(p.display_name),'\s+',' ','g'))=identity.normalized_name limit 1;
  select id into parent_id from public.parents where school_id=target.school_id and profile_id=p_actor limit 1;
  if parent_id is null and existing_parent is not null then
    update public.parents set profile_id=p_actor,display_name=identity.display_name,first_name=identity.first_name,last_name=identity.last_name,status='active',updated_at=clock_timestamp() where id=existing_parent;
    parent_id:=existing_parent;
  elsif parent_id is null then
    insert into public.parents(school_id,profile_id,display_name,first_name,last_name,status,creation_source)
      values(target.school_id,p_actor,identity.display_name,identity.first_name,identity.last_name,'active','self_registration') returning id into parent_id;
  else
    update public.parents set display_name=identity.display_name,first_name=identity.first_name,last_name=identity.last_name,status='active',updated_at=clock_timestamp() where id=parent_id;
  end if;
  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
    values(target.school_id,parent_id,target.id,clean_relationship,'linked',clock_timestamp())
  on conflict(parent_id,student_id) do update set relationship=excluded.relationship,status='linked',linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),version=public.parent_student_links.version+1
  returning * into link;
  insert into public.school_memberships(school_id,profile_id,role,status) values(target.school_id,p_actor,'parent','active')
    on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();
  if link.consent_id is null then
    select coalesce(value_json->>'version','1.0') into policy_version from public.settings where school_id=target.school_id and scope_type='school' and key='privacy_policy' limit 1;
    insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version) values(target.school_id,parent_id,target.id,'student_data_sharing',coalesce(policy_version,'1.0')) returning id into new_consent;
    update public.parent_student_links set consent_id=new_consent,updated_at=clock_timestamp(),version=version+1 where id=link.id returning * into link;
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,p_actor,'PARENT_CHILD_LINKED','parent_student_link',link.id,target.id,jsonb_build_object('relationship',clean_relationship,'status','linked','immediate',true));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_actor,'parent','PARENT_CHILD_LINKED',target.school_id,jsonb_build_object('linkId',link.id));
  return jsonb_build_object('linkId',link.id,'parentId',parent_id,'studentId',target.id,'status','linked','schoolId',target.school_id,'schoolName',school_name,'displayName',target.display_name);
end $$;

-- Parent registration records the selected school so the next child search cannot cross schools.
create or replace function public.register_member_identity(
  p_actor uuid,p_role text,p_first_name text,p_last_name text,p_auth_email text,p_school_id uuid default null,p_source text default 'self_registration'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare clean_first text:=regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g'); clean_last text:=regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  full_name text; target_school public.schools%rowtype; teacher_id uuid; generated_code text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_role not in ('teacher','parent','admin') or char_length(clean_first)<1 or char_length(clean_last)<1 or coalesce(trim(p_auth_email),'')='' then raise exception 'VALIDATION_ERROR'; end if;
  if p_role='teacher' then raise exception 'TEACHER_ADMIN_ONLY' using errcode='42501'; end if;
  full_name:=trim(clean_first||' '||clean_last);
  if p_role in ('teacher','parent') then
    select * into target_school from public.schools where id=p_school_id and status='active' and deleted_at is null;
    if not found then raise exception 'SCHOOL_NOT_AVAILABLE' using errcode='22000'; end if;
  end if;
  insert into public.user_profiles(id,display_name,requested_role,account_state) values(p_actor,full_name,p_role,'active')
    on conflict(id) do update set display_name=excluded.display_name,requested_role=excluded.requested_role,account_state='active',updated_at=clock_timestamp();
  insert into public.member_login_identities(profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source)
    values(p_actor,p_role,full_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,p_source)
    on conflict(profile_id) do update set display_name=excluded.display_name,first_name=excluded.first_name,last_name=excluded.last_name,school_id=excluded.school_id,status='active',updated_at=clock_timestamp();
  if p_role='teacher' then
    generated_code:='T-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.teachers(school_id,profile_id,teacher_code,display_name,first_name,last_name,email,subject,verification_status,status,creation_source)
      values(target_school.id,p_actor,generated_code,full_name,clean_first,clean_last,'','','verified_teacher','active','self_registration')
      on conflict(school_id,profile_id) do update set display_name=excluded.display_name,first_name=excluded.first_name,last_name=excluded.last_name,verification_status='verified_teacher',status='active';
    insert into public.school_memberships(school_id,profile_id,role,status) values(target_school.id,p_actor,'teacher','active') on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();
  end if;
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json) values(p_actor,p_role,'MEMBER_REGISTERED',p_school_id,jsonb_build_object('source',p_source));
  return jsonb_build_object('profileId',p_actor,'role',p_role,'displayName',full_name,'schoolId',p_school_id,
    'schoolName',case when p_school_id is null then null else target_school.name end,'teacherId',teacher_id);
end $$;

revoke all on function public.register_member_identity(uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.register_member_identity(uuid,text,text,text,text,uuid,text) to service_role;

commit;
