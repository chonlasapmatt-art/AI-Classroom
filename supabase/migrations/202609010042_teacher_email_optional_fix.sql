begin;

-- Managed teachers do not need an email address. The old function used NULLIF('', '')
-- against the legacy NOT NULL column, which made the otherwise valid admin form fail with:
-- null value in column "email" of relation "teachers".
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
    values(p_teacher_id,p_school_id,trim(p_teacher_code),trim(p_display_name),
      coalesce(nullif(trim(coalesce(p_email,'')),''),''),trim(coalesce(p_subject,'')),
      'active','verified_teacher','admin',1)
  on conflict(id) do update set teacher_code=excluded.teacher_code,display_name=excluded.display_name,
    email=coalesce(excluded.email,''),subject=excluded.subject,verification_status='verified_teacher',status='active',
    creation_source='admin',updated_at=clock_timestamp(),version=public.teachers.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'TEACHER_CREATED','teacher',p_teacher_id,
      jsonb_build_object('displayName',trim(p_display_name),'teacherCode',trim(p_teacher_code),'managedAccount',true));
  return jsonb_build_object('entityId',p_teacher_id,'version',current_version);
end $$;

revoke all on function public.upsert_teacher(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.upsert_teacher(uuid,uuid,text,text,text,text) to authenticated;

commit;
