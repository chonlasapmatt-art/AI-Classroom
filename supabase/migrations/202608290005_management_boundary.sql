-- Structural records (classes, teachers, class assignment, parent links, consent) are not part of
-- the sync-push mutation contract: they stay server-owned and are changed only through these
-- security-definer functions, so RLS on the underlying tables can remain read-only.

create or replace function public.upsert_class(
  p_school_id uuid, p_class_id uuid, p_academic_term_id uuid, p_name text, p_grade_level text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'VALIDATION_ERROR: name required'; end if;
  if not exists(select 1 from public.academic_terms where id=p_academic_term_id and school_id=p_school_id) then
    raise exception 'VALIDATION_ERROR: unknown academic term';
  end if;
  insert into public.classes(id,school_id,academic_term_id,name,grade_level,status,version)
  values(p_class_id,p_school_id,p_academic_term_id,p_name,p_grade_level,'active',1)
  on conflict(id) do update set name=excluded.name,grade_level=excluded.grade_level,
    academic_term_id=excluded.academic_term_id,updated_at=clock_timestamp(),
    version=public.classes.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'class_upsert','class',p_class_id,jsonb_build_object('name',p_name,'gradeLevel',p_grade_level));
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.archive_class(p_school_id uuid, p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='archived',updated_at=clock_timestamp(),version=version+1
  where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
  values(p_school_id,actor,'class_archive','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.upsert_teacher(
  p_school_id uuid, p_teacher_id uuid, p_teacher_code text, p_display_name text, p_email text, p_subject text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'VALIDATION_ERROR: display name required'; end if;
  insert into public.teachers(id,school_id,teacher_code,display_name,email,subject,status,version)
  values(p_teacher_id,p_school_id,p_teacher_code,p_display_name,p_email,p_subject,'active',1)
  on conflict(id) do update set teacher_code=excluded.teacher_code,display_name=excluded.display_name,
    email=excluded.email,subject=excluded.subject,updated_at=clock_timestamp(),
    version=public.teachers.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'teacher_upsert','teacher',p_teacher_id,jsonb_build_object('displayName',p_display_name,'subject',p_subject));
  return jsonb_build_object('entityId',p_teacher_id,'version',current_version);
end $$;

create or replace function public.assign_class_teacher(
  p_school_id uuid, p_class_teacher_id uuid, p_class_id uuid, p_teacher_id uuid, p_role text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('primary','assistant') then raise exception 'VALIDATION_ERROR: unsupported role'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id) then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.teachers where id=p_teacher_id and school_id=p_school_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.class_teachers(id,school_id,class_id,teacher_id,role)
  values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role)
  on conflict(class_id,teacher_id) do update set role=excluded.role;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'class_teacher_assign','class_teacher',p_class_teacher_id,jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'role',p_role));
  return jsonb_build_object('entityId',p_class_teacher_id);
end $$;

create or replace function public.unassign_class_teacher(p_school_id uuid, p_class_teacher_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  delete from public.class_teachers where id=p_class_teacher_id and school_id=p_school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
  values(p_school_id,actor,'class_teacher_unassign','class_teacher',p_class_teacher_id);
  return jsonb_build_object('entityId',p_class_teacher_id);
end $$;

create or replace function public.set_parent_consent(
  p_school_id uuid, p_parent_link_id uuid, p_granted boolean, p_policy_version text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); link public.parent_student_links%rowtype; new_consent_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into link from public.parent_student_links where id=p_parent_link_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_school_role(p_school_id,'admin')
       or exists(select 1 from public.parents p where p.id=link.parent_id and p.profile_id=actor)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version,accepted_at,revoked_at)
  values(p_school_id,link.parent_id,link.student_id,'student_data_sharing',p_policy_version,
         clock_timestamp(),
         case when p_granted then null else clock_timestamp() end)
  returning id into new_consent_id;
  update public.parent_student_links
  set consent_id = case when p_granted then new_consent_id else null end,
      status = case when p_granted then 'linked' else status end,
      updated_at = clock_timestamp()
  where id = p_parent_link_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
  values(p_school_id,actor,'parent_consent','parent_student_link',p_parent_link_id,link.student_id,
         jsonb_build_object('granted',p_granted,'policyVersion',p_policy_version));
  return jsonb_build_object('entityId',p_parent_link_id,'granted',p_granted);
end $$;

create or replace function public.revoke_parent_link(p_school_id uuid, p_parent_link_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); link public.parent_student_links%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into link from public.parent_student_links where id=p_parent_link_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.parent_student_links set status='revoked', updated_at=clock_timestamp() where id=p_parent_link_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id)
  values(p_school_id,actor,'parent_link_revoke','parent_student_link',p_parent_link_id,link.student_id);
  return jsonb_build_object('entityId',p_parent_link_id);
end $$;

revoke all on function public.upsert_class(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.archive_class(uuid,uuid) from public,anon;
revoke all on function public.upsert_teacher(uuid,uuid,text,text,text,text) from public,anon;
revoke all on function public.assign_class_teacher(uuid,uuid,uuid,uuid,text) from public,anon;
revoke all on function public.unassign_class_teacher(uuid,uuid) from public,anon;
revoke all on function public.set_parent_consent(uuid,uuid,boolean,text) from public,anon;
revoke all on function public.revoke_parent_link(uuid,uuid) from public,anon;

grant execute on function public.upsert_class(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.archive_class(uuid,uuid) to authenticated;
grant execute on function public.upsert_teacher(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.assign_class_teacher(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.unassign_class_teacher(uuid,uuid) to authenticated;
grant execute on function public.set_parent_consent(uuid,uuid,boolean,text) to authenticated;
grant execute on function public.revoke_parent_link(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- LINE parent linking
-- A parent may reach the system through LINE before they ever have a Supabase
-- account, so the profile link becomes optional and the redeem path runs with
-- the service role from the line-notify webhook only.
-- ---------------------------------------------------------------------------
alter table public.parents alter column profile_id drop not null;

create or replace function public.open_parent_invitations()
returns table(id uuid, school_id uuid, student_id uuid)
language sql security definer set search_path=public,pg_temp as $$
  select id, school_id, student_id from public.parent_link_invitations
  where used_at is null and revoked_at is null and expires_at > now() and attempt_count < max_attempts;
$$;

create or replace function public.record_parent_invitation_attempt(p_invitation_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  update public.parent_link_invitations set attempt_count = attempt_count + 1 where id = p_invitation_id;
$$;

create or replace function public.redeem_parent_invitation(
  p_invitation_id uuid, p_line_user_id text, p_display_name text, p_relationship text default 'ผู้ปกครอง'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation public.parent_link_invitations%rowtype; parent_id uuid; link_id uuid;
begin
  select * into invitation from public.parent_link_invitations where id=p_invitation_id for update;
  if not found or invitation.used_at is not null or invitation.revoked_at is not null
     or invitation.expires_at <= now() or invitation.attempt_count >= invitation.max_attempts then
    raise exception 'INVITATION_INVALID' using errcode='22000';
  end if;

  select id into parent_id from public.parents
  where school_id=invitation.school_id and line_user_id=p_line_user_id limit 1;
  if parent_id is null then
    insert into public.parents(school_id,profile_id,display_name,line_user_id,line_linked_at)
    values(invitation.school_id,null,coalesce(nullif(p_display_name,''),'ผู้ปกครอง'),p_line_user_id,clock_timestamp())
    returning id into parent_id;
  else
    update public.parents set line_linked_at=clock_timestamp(),updated_at=clock_timestamp() where id=parent_id;
  end if;

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
  values(invitation.school_id,parent_id,invitation.student_id,p_relationship,'linked',clock_timestamp())
  on conflict(parent_id,student_id) do update set status='linked',linked_at=clock_timestamp(),
    revoked_at=null,updated_at=clock_timestamp(),version=public.parent_student_links.version+1
  returning id into link_id;

  update public.parent_link_invitations set used_at=clock_timestamp() where id=p_invitation_id;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,metadata_json)
  values(invitation.school_id,null,'parent_link_redeem','parent_student_link',link_id,invitation.student_id,
         jsonb_build_object('channel','line'));

  return jsonb_build_object('parentId',parent_id,'linkId',link_id,'studentId',invitation.student_id);
end $$;

revoke all on function public.open_parent_invitations() from public,anon,authenticated;
revoke all on function public.record_parent_invitation_attempt(uuid) from public,anon,authenticated;
revoke all on function public.redeem_parent_invitation(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.open_parent_invitations() to service_role;
grant execute on function public.record_parent_invitation_attempt(uuid) to service_role;
grant execute on function public.redeem_parent_invitation(uuid,text,text,text) to service_role;
