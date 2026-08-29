-- Subjects (learning areas) are school-owned structure, like classes and teachers: readable by any
-- active member, writable only through these security-definer functions. Assignments, activities and
-- tests gain an optional subject so a gradebook column means one learning area.

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null,
  name text not null,
  name_en text not null default '',
  color_index integer not null default 0,
  icon_key text not null default 'default',
  sort_order integer not null default 0,
  status public.record_status not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(school_id, code)
);
alter table public.subjects enable row level security;

create policy subjects_member_read on public.subjects for select to authenticated
  using (public.is_active_member(school_id));

grant select on public.subjects to authenticated;

alter table public.assignments add column if not exists subject_id uuid references public.subjects(id);
alter table public.assignments add column if not exists instructions text not null default '';
alter table public.activities add column if not exists subject_id uuid references public.subjects(id);
alter table public.tests add column if not exists subject_id uuid references public.subjects(id);
alter table public.submissions add column if not exists student_note text not null default '';

create index if not exists assignments_subject_idx on public.assignments(school_id, subject_id);
create index if not exists activities_subject_idx on public.activities(school_id, subject_id);
create index if not exists tests_subject_idx on public.tests(school_id, subject_id);

create or replace function public.upsert_subject(
  p_school_id uuid, p_subject_id uuid, p_code text, p_name text, p_name_en text,
  p_color_index integer, p_icon_key text, p_sort_order integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_code),'')='' or coalesce(trim(p_name),'')='' then
    raise exception 'VALIDATION_ERROR: subject code and name are required';
  end if;
  insert into public.subjects(id,school_id,code,name,name_en,color_index,icon_key,sort_order,status,version)
  values(p_subject_id,p_school_id,upper(trim(p_code)),trim(p_name),coalesce(p_name_en,''),
         coalesce(p_color_index,0),coalesce(p_icon_key,'default'),coalesce(p_sort_order,0),'active',1)
  on conflict(id) do update set code=excluded.code,name=excluded.name,name_en=excluded.name_en,
    color_index=excluded.color_index,icon_key=excluded.icon_key,sort_order=excluded.sort_order,
    updated_at=clock_timestamp(),version=public.subjects.version+1,deleted_at=null
  returning version into current_version;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'subject_upsert','subject',p_subject_id,jsonb_build_object('code',p_code,'name',p_name));
  return jsonb_build_object('entityId',p_subject_id,'version',current_version);
end $$;

create or replace function public.archive_subject(p_school_id uuid, p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.subjects set status='inactive',updated_at=clock_timestamp(),version=version+1
  where id=p_subject_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
  values(p_school_id,actor,'subject_archive','subject',p_subject_id);
  return jsonb_build_object('entityId',p_subject_id,'version',current_version);
end $$;

revoke all on function public.upsert_subject(uuid,uuid,text,text,text,integer,text,integer) from public,anon;
revoke all on function public.archive_subject(uuid,uuid) from public,anon;
grant execute on function public.upsert_subject(uuid,uuid,text,text,text,integer,text,integer) to authenticated;
grant execute on function public.archive_subject(uuid,uuid) to authenticated;

-- Class lifecycle: restore an archived class, or soft-delete an empty one. Deleting a class never
-- removes attendance or score history; those rows keep their own class_id for the audit trail.
create or replace function public.restore_class(p_school_id uuid, p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.classes set status='active',deleted_at=null,updated_at=clock_timestamp(),version=version+1
  where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
  values(p_school_id,actor,'class_restore','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

create or replace function public.delete_class(p_school_id uuid, p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer; enrolled integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select count(*) into enrolled from public.student_class_enrollments
  where class_id=p_class_id and school_id=p_school_id and status='active' and deleted_at is null;
  if enrolled > 0 then raise exception 'VALIDATION_ERROR: class still has % active enrollments', enrolled; end if;
  delete from public.class_teachers where class_id=p_class_id and school_id=p_school_id;
  update public.classes set status='inactive',deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1
  where id=p_class_id and school_id=p_school_id returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id)
  values(p_school_id,actor,'class_delete','class',p_class_id);
  return jsonb_build_object('entityId',p_class_id,'version',current_version);
end $$;

revoke all on function public.restore_class(uuid,uuid) from public,anon;
revoke all on function public.delete_class(uuid,uuid) from public,anon;
grant execute on function public.restore_class(uuid,uuid) to authenticated;
grant execute on function public.delete_class(uuid,uuid) to authenticated;

-- The management RPCs added in 202608290005 assumed columns the core schema does not have:
-- classes/teachers had no version counter, teachers had no email or subject, and class_teachers
-- names its role column role_in_class with no (class_id, teacher_id) uniqueness. Add what is
-- missing and redefine the two affected functions against the real columns.
alter table public.classes add column if not exists version integer not null default 1;
alter table public.teachers add column if not exists email text not null default '';
alter table public.teachers add column if not exists subject text not null default '';
alter table public.teachers add column if not exists version integer not null default 1;
alter table public.class_teachers add column if not exists updated_at timestamptz not null default now();
create unique index if not exists class_teachers_class_teacher_key on public.class_teachers(class_id, teacher_id);

create or replace function public.upsert_teacher(
  p_school_id uuid, p_teacher_id uuid, p_teacher_code text, p_display_name text, p_email text, p_subject text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'VALIDATION_ERROR: display name required'; end if;
  insert into public.teachers(id,school_id,teacher_code,display_name,email,subject,status,version)
  values(p_teacher_id,p_school_id,p_teacher_code,p_display_name,coalesce(p_email,''),coalesce(p_subject,''),'active',1)
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
  insert into public.class_teachers(id,school_id,class_id,teacher_id,role_in_class)
  values(p_class_teacher_id,p_school_id,p_class_id,p_teacher_id,p_role)
  on conflict(class_id,teacher_id) do update set role_in_class=excluded.role_in_class,updated_at=clock_timestamp();
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'class_teacher_assign','class_teacher',p_class_teacher_id,jsonb_build_object('classId',p_class_id,'teacherId',p_teacher_id,'role',p_role));
  return jsonb_build_object('entityId',p_class_teacher_id);
end $$;
