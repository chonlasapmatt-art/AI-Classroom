-- An administrator could not create a login for a teacher, a student, or a parent linked to a child.
--
-- `provision_managed_account` is the one path behind all three, and it had never worked. Two faults,
-- both invisible from the screen because the gateway turned every database refusal into the same
-- "สร้างบัญชีไม่สำเร็จ":
--
--   1. `school_memberships.role` is the enum `public.membership_role`. Every other function in the
--      schema inserts a literal there — `'teacher'`, `'parent'` — which Postgres reads as `unknown`
--      and resolves against the column. This one passes the `text` parameter `p_role`, and there is
--      no implicit cast from `text` to an enum, so the insert failed every time with
--      `column "role" is of type membership_role but expression is of type text`. The only managed
--      account that could be created was a parent with no child attached, because that case is
--      handled by `provision_parent_without_child`, which inserts the literal.
--
--   2. `member_login_identities.role` allowed only 'teacher', 'parent' and 'admin'. It was written
--      before students had accounts of their own; they sign in by name and student number now, and
--      an administrator creating that login was writing a role the constraint rejected.
--
-- Nothing else about the function changes. The body below is the one from
-- `202609010044_admin_managed_accounts`, with the cast added and nothing else touched.

begin;

-- ---------------------------------------------------------------------------
-- Students are a login role like the others
-- ---------------------------------------------------------------------------
alter table public.member_login_identities drop constraint if exists member_login_identities_role_check;
alter table public.member_login_identities add constraint member_login_identities_role_check
  check (role in ('teacher','parent','admin','student'));

-- ---------------------------------------------------------------------------
-- The provisioning path, with the enum named
-- ---------------------------------------------------------------------------
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
  parent_id uuid := p_record_id;
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
    if parent_id is null then parent_id:=gen_random_uuid(); end if;
    select * into target_parent from public.parents where id=parent_id and school_id=p_school_id for update;
    if found and target_parent.profile_id is not null and target_parent.profile_id<>p_profile_id then
      raise exception 'TARGET_ALREADY_LINKED';
    end if;
    insert into public.parents(id,school_id,profile_id,display_name,first_name,last_name,phone,status,creation_source)
      values(parent_id,p_school_id,p_profile_id,clean_name,clean_first,clean_last,nullif(trim(coalesce(p_phone,'')),''),'active','admin')
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
    insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status)
      values(p_school_id,parent_id,p_student_id,coalesce(nullif(trim(p_relationship),''),'ผู้ปกครอง'),'pending')
    on conflict(parent_id,student_id) do update set relationship=excluded.relationship,
      status=case when public.parent_student_links.status='revoked' then 'pending' else public.parent_student_links.status end,
      revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),version=public.parent_student_links.version+1
    returning id into link_id;
  end if;

  -- The cast is the fix. `p_role` is text and the column is an enum, and Postgres will not bridge
  -- that on its own for a variable the way it does for a literal.
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(p_school_id,p_profile_id,p_role::public.membership_role,'active')
  on conflict(school_id,profile_id,role) do update set status='active',active_until=null,updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,p_actor,'MANAGED_ACCOUNT_PROVISIONED',p_role,p_record_id,
      jsonb_build_object('profileId',p_profile_id,'role',p_role,'source','admin'));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_profile_id,p_role,'MANAGED_ACCOUNT_PROVISIONED',p_school_id,jsonb_build_object('source','admin'));

  return jsonb_build_object('profileId',p_profile_id,'role',p_role,'displayName',clean_name,
    'schoolId',p_school_id,'parentId',case when p_role='parent' then parent_id else null end,'linkId',link_id);
end $$;

revoke all on function public.provision_managed_account(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_managed_account(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text) to service_role;

commit;
