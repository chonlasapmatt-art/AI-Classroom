begin;

-- Opening a room, naming it, resizing it, archiving it and deleting it are the school
-- administrator's work. Until now a verified teacher could do all five, which put the shape of the
-- school in the hands of everybody who teaches in it. A teacher keeps every room they were put in
-- charge of, reads its roster and registers it; they no longer change the structure itself.
create or replace function public.can_manage_classes(target_school uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_school_role(target_school,'admin');
$$;
revoke all on function public.can_manage_classes(uuid) from public,anon;
grant execute on function public.can_manage_classes(uuid) to authenticated;

create or replace function public.upsert_class(
  p_school_id uuid,p_class_id uuid,p_academic_term_id uuid,p_name text,p_grade_level text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid();
  current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_manage_classes(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_name),'')='' or not exists(
    select 1 from public.academic_terms where id=p_academic_term_id and school_id=p_school_id
  ) then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.classes(id,school_id,academic_term_id,name,grade_level,status,version)
    values(p_class_id,p_school_id,p_academic_term_id,trim(p_name),trim(p_grade_level),'active',1)
    on conflict(id) do update set name=excluded.name,grade_level=excluded.grade_level,
      academic_term_id=excluded.academic_term_id,updated_at=clock_timestamp(),
      version=public.classes.version+1,deleted_at=null
    returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'class_upsert','class',p_class_id,
      jsonb_build_object('name',p_name,'gradeLevel',p_grade_level));
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.set_class_capacity(p_school_id uuid,p_class_id uuid,p_capacity integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); enrolled integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_manage_classes(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_capacity is null or p_capacity<=0 or p_capacity>200 then raise exception 'VALIDATION_ERROR'; end if;
  select count(*) into enrolled from public.student_class_enrollments
    where class_id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null;
  if p_capacity<enrolled then raise exception 'VALIDATION_ERROR: capacity below enrollment'; end if;
  update public.classes set capacity=p_capacity,updated_at=clock_timestamp(),version=version+1
    where id=p_class_id and school_id=p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'class_capacity','class',p_class_id,jsonb_build_object('capacity',p_capacity));
  return jsonb_build_object('entityId',p_class_id,'capacity',p_capacity);
end $$;

create or replace function public.archive_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_manage_classes(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='archived',updated_at=clock_timestamp(),version=version+1
    where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
    values(p_school_id,actor,'class_archive','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.restore_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_manage_classes(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='active',deleted_at=null,updated_at=clock_timestamp(),version=version+1
    where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
    values(p_school_id,actor,'class_restore','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.delete_class(p_school_id uuid,p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); enrolled integer; current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_manage_classes(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select count(*) into enrolled from public.student_class_enrollments
    where class_id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null;
  if enrolled>0 then raise exception 'VALIDATION_ERROR: class has active enrollments'; end if;
  delete from public.class_teachers where class_id=p_class_id and school_id=p_school_id;
  update public.classes set status='inactive',deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1
    where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
    values(p_school_id,actor,'class_delete','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

revoke all on function public.upsert_class(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.set_class_capacity(uuid,uuid,integer) from public,anon;
revoke all on function public.archive_class(uuid,uuid) from public,anon;
revoke all on function public.restore_class(uuid,uuid) from public,anon;
revoke all on function public.delete_class(uuid,uuid) from public,anon;
grant execute on function public.upsert_class(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.set_class_capacity(uuid,uuid,integer) to authenticated;
grant execute on function public.archive_class(uuid,uuid) to authenticated;
grant execute on function public.restore_class(uuid,uuid) to authenticated;
grant execute on function public.delete_class(uuid,uuid) to authenticated;

comment on function public.can_manage_classes(uuid) is
  'Room structure is the school administrator''s. Teachers read the rooms they hold and register them.';

commit;
