begin;

alter table public.class_teachers add column if not exists subject_id uuid references public.subjects(id);

create index if not exists class_teachers_subject_scope_idx
  on public.class_teachers(school_id, teacher_id, class_id, subject_id)
  where active_until is null;

create or replace function public.assign_class_teacher_with_subject(
  p_school_id uuid, p_class_teacher_id uuid, p_class_id uuid, p_teacher_id uuid, p_role text, p_subject_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('primary','assistant') then raise exception 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id and status='active') then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.teachers where id=p_teacher_id and school_id=p_school_id and status='active') then raise exception 'NOT_FOUND'; end if;
  if p_subject_id is not null and not exists(select 1 from public.subjects where id=p_subject_id and school_id=p_school_id and status='active') then raise exception 'SUBJECT_NOT_AVAILABLE'; end if;
  insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class,subject_id)
    values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role,p_subject_id)
    on conflict(class_id,teacher_id,active_from) do update set role_in_class=excluded.role_in_class,subject_id=excluded.subject_id,active_until=null;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'TEACHER_SUBJECT_CLASS_ASSIGNED','class_teacher',p_class_teacher_id,
      jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'subjectId',p_subject_id,'role',p_role));
  return jsonb_build_object('entityId',p_class_teacher_id,'subjectId',p_subject_id);
end $$;

revoke all on function public.assign_class_teacher_with_subject(uuid,uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.assign_class_teacher_with_subject(uuid,uuid,uuid,uuid,text,uuid) to authenticated;

commit;
