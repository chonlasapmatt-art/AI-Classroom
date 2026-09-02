-- A guardian an administrator links to a child was not actually linked.
--
-- `provision_managed_account` wrote the relationship as `pending` — the status meant for a guardian
-- who found the child themselves by name and still has to be recognised by staff. An administrator
-- picking a child from their own school's roster is not making a claim that needs checking: they are
-- the ones who would check it. The row therefore sat in a queue waiting for its own author, the
-- guardian's portal said "รอครูอนุมัติ" forever, and nothing the administrator did on the screen
-- afterwards could move it.
--
-- Two changes. A relationship an administrator creates is `linked` from the start, with its
-- `linked_at` set, exactly as approving one produces. And `admin_link_parent_child` gives staff the
-- act that had no home: attaching one more child to a guardian who already exists, without inventing
-- a second guardian record or asking for a password that is already set.
--
-- Consent is deliberately not granted here. Linking says who this guardian is to this child;
-- consent says the school agrees to share that child's data, and it stays the separate, recorded
-- decision it already was.

begin;

-- ---------------------------------------------------------------------------
-- Provisioning: an administrator's link is a link
-- ---------------------------------------------------------------------------
-- The body below is the one from `202609020009_managed_account_provision_fix`, with the parent
-- branch's link status changed and nothing else touched.
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
    -- `linked`, not `pending`. The queue this used to join is the staff queue for guardians who
    -- found a child by name; an administrator choosing a child off their own roster is the person
    -- that queue exists to ask.
    insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
      values(p_school_id,parent_id,p_student_id,coalesce(nullif(trim(p_relationship),''),'ผู้ปกครอง'),'linked',clock_timestamp())
    on conflict(parent_id,student_id) do update set relationship=excluded.relationship,
      status='linked',linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),
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

-- ---------------------------------------------------------------------------
-- One more child for a guardian who already exists
-- ---------------------------------------------------------------------------

/**
 * Attaches a child to a guardian the school already holds, as staff.
 *
 * The only way to link a second child used to be the create-account form, which asks for a password
 * — so attaching a sibling meant re-entering credentials for an account that already had them, and
 * a mistyped name created a second guardian instead. This is that act on its own: no account is
 * created, no password is read or written, and the guardian and the child must both already belong
 * to the school this caller operates.
 *
 * The relationship is `linked` immediately, for the same reason the provisioning path is: staff
 * deciding a relationship is what approval means. Consent to share the child's data is a separate
 * decision and is left exactly as it was.
 */
create or replace function public.admin_link_parent_child(
  p_school_id uuid, p_parent_id uuid, p_student_id uuid, p_relationship text default 'ผู้ปกครอง'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  parent_row public.parents%rowtype;
  student_row public.students%rowtype;
  link public.parent_student_links%rowtype;
  clean_relationship text := coalesce(nullif(regexp_replace(trim(coalesce(p_relationship,'')),'\s+',' ','g'),''),'ผู้ปกครอง');
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  select * into parent_row from public.parents
    where id=p_parent_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select * into student_row from public.students
    where id=p_student_id and school_id=p_school_id and status='active' and deleted_at is null;
  if not found then raise exception 'CHILD_NOT_AVAILABLE' using errcode='22000'; end if;

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
    values(p_school_id,parent_row.id,student_row.id,clean_relationship,'linked',clock_timestamp())
  on conflict(parent_id,student_id) do update
    set relationship=excluded.relationship,status='linked',
        linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),
        revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),
        version=public.parent_student_links.version+1
  returning * into link;

  -- A guardian with an account keeps their way in. One entered on paper has no profile yet, and
  -- there is nothing to make a member of anything.
  if parent_row.profile_id is not null then
    insert into public.school_memberships(school_id,profile_id,role,status)
      values(p_school_id,parent_row.profile_id,'parent','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
  end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(p_school_id,actor,'PARENT_LINK_CREATED','parent_student_link',link.id,link.student_id,
      jsonb_build_object('parentId',parent_row.id,'relationship',clean_relationship,'status',link.status,'source','admin'));

  return jsonb_build_object('linkId',link.id,'parentId',parent_row.id,'studentId',student_row.id,
    'status',link.status,'displayName',student_row.display_name);
end $$;

revoke all on function public.admin_link_parent_child(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.admin_link_parent_child(uuid,uuid,uuid,text) to authenticated;

comment on function public.admin_link_parent_child(uuid,uuid,uuid,text) is
  'Staff attach one more child to an existing guardian. Creates no account and grants no consent.';

commit;
