-- Both ways of linking a guardian to a child raised `42702: column reference "parent_id" is
-- ambiguous`, and neither had ever created a row.
--
-- `link_parent_child` and `provision_managed_account` each declare a variable called `parent_id`,
-- and each writes a statement whose conflict target names the column `parent_id`. Inside a conflict
-- target Postgres cannot tell the variable from the column, so the whole statement is refused before
-- it runs. Both gateways translate a refusal they have no name for into one sentence — "เชื่อมบัญชี
-- ไม่สำเร็จ" for a guardian, "สร้างบัญชีไม่สำเร็จ" for an administrator — so the reason never reached
-- anybody, and the deployed database has `parent_student_links` empty to this day.
--
-- The variable is renamed to `guardian_id` in both. Nothing else changes: same checks, same writes,
-- same answers. This is the class of defect the probe README describes — valid SQL, a green test
-- suite, and a feature that has never once worked against a real database.

begin;

-- ---------------------------------------------------------------------------
-- The guardian's own path
-- ---------------------------------------------------------------------------
create or replace function public.link_parent_child(
  p_actor uuid, p_student_id uuid, p_relationship text default 'ผู้ปกครอง'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  identity public.member_login_identities%rowtype;
  target public.students%rowtype;
  school_name text;
  guardian_id uuid;
  existing_parent uuid;
  link public.parent_student_links%rowtype;
  policy_version text;
  new_consent uuid;
  next_status text;
  clean_relationship text := coalesce(nullif(regexp_replace(trim(coalesce(p_relationship,'')),'\s+',' ','g'),''),'ผู้ปกครอง');
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into identity from public.member_login_identities where profile_id=p_actor and role='parent';
  if not found or identity.status<>'active' then raise exception 'MEMBER_ACCESS_DENIED' using errcode='42501'; end if;

  select * into target from public.students
    where id=p_student_id and status='active' and deleted_at is null for update;
  if not found then raise exception 'CHILD_NOT_AVAILABLE' using errcode='22000'; end if;
  select name into school_name from public.schools where id=target.school_id;

  -- A guardian the school entered for this child, under this same name and with no account yet, is
  -- the same person: adopt that record rather than creating a second guardian for one child.
  select p.id into existing_parent from public.parents p
    join public.parent_student_links l on l.parent_id=p.id and l.student_id=target.id and l.deleted_at is null
    where p.school_id=target.school_id and p.profile_id is null
      and lower(regexp_replace(trim(p.display_name),'\s+',' ','g'))=identity.normalized_name
    limit 1;

  select id into guardian_id from public.parents
    where school_id=target.school_id and profile_id=p_actor limit 1;

  if guardian_id is null and existing_parent is not null then
    update public.parents set profile_id=p_actor,display_name=identity.display_name,
      first_name=identity.first_name,last_name=identity.last_name,status='active',updated_at=clock_timestamp()
      where id=existing_parent;
    guardian_id := existing_parent;
  elsif guardian_id is null then
    insert into public.parents(school_id,profile_id,display_name,first_name,last_name,status,creation_source)
      values(target.school_id,p_actor,identity.display_name,identity.first_name,identity.last_name,
        'active','self_registration')
      returning id into guardian_id;
  else
    update public.parents set display_name=identity.display_name,first_name=identity.first_name,
      last_name=identity.last_name,status='active',updated_at=clock_timestamp() where id=guardian_id;
  end if;

  next_status := case when existing_parent is not null then 'linked' else 'pending' end;

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
    values(target.school_id,guardian_id,target.id,clean_relationship,next_status,
      case when next_status='linked' then clock_timestamp() else null end)
  on conflict(parent_id,student_id) do update
    set relationship=excluded.relationship,
        status=case when public.parent_student_links.status='linked' then 'linked' else excluded.status end,
        linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),
        revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),
        version=public.parent_student_links.version+1
  returning * into link;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target.school_id,p_actor,'parent','active')
  on conflict(school_id,profile_id,role) do update
    set status='active',active_until=null,updated_at=clock_timestamp();

  -- An approved link carries the school's data-sharing consent with it, so an approved parent sees
  -- their child straight away instead of landing on an empty portal.
  if link.status='linked' and link.consent_id is null then
    select coalesce(value_json->>'version','1.0') into policy_version from public.settings
      where school_id=target.school_id and scope_type='school' and key='privacy_policy' limit 1;
    insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version)
      values(target.school_id,guardian_id,target.id,'student_data_sharing',coalesce(policy_version,'1.0'))
      returning id into new_consent;
    update public.parent_student_links set consent_id=new_consent,updated_at=clock_timestamp(),
      version=version+1 where id=link.id returning * into link;
  end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,p_actor,
      case when link.status='linked' then 'PARENT_CHILD_LINKED' else 'PARENT_CHILD_LINK_REQUESTED' end,
      'parent_student_link',link.id,target.id,
      jsonb_build_object('relationship',clean_relationship,'status',link.status,'adopted',existing_parent is not null));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_actor,'parent',
      case when link.status='linked' then 'PARENT_CHILD_LINKED' else 'PARENT_CHILD_LINK_REQUESTED' end,
      target.school_id,jsonb_build_object('linkId',link.id));

  return jsonb_build_object('linkId',link.id,'parentId',guardian_id,'studentId',target.id,
    'status',link.status,'schoolId',target.school_id,'schoolName',school_name,
    'displayName',target.display_name);
end $$;

revoke all on function public.link_parent_child(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.link_parent_child(uuid,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- The administrator's path
-- ---------------------------------------------------------------------------
-- The body from `202609020012`, with the same variable renamed and nothing else touched.
create or replace function public.provision_managed_account(
  p_actor uuid,
  p_school_id uuid,
  p_role text,
  p_record_id uuid,
  p_student_id uuid,
  p_profile_id uuid,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_auth_email text,
  p_relationship text default 'ผู้ปกครอง',
  p_phone text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
      where id=target_student.id;
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
end $$;

revoke all on function public.provision_managed_account(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_managed_account(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text) to service_role;

commit;
