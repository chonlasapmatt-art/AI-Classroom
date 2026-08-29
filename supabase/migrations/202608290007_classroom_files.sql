-- Classroom file exchange.
--
-- Teachers hand out material (PDF, Excel, CSV, images) and students hand work back the same way.
-- File bytes live in the private "classroom-files" storage bucket; this table is the metadata other
-- devices read so they know what to download. Writes go through security-definer functions, so the
-- table itself stays read-only for clients, exactly like the other structural records.

create table if not exists public.class_files (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  owner_type text not null check (owner_type in ('assignment','submission','subject')),
  owner_id text not null,
  uploaded_by uuid references public.user_profiles(id),
  file_name text not null,
  mime_type text not null default '',
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 15728640),
  kind text not null default 'other',
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.class_files enable row level security;

create index if not exists class_files_owner_idx on public.class_files(school_id, owner_type, owner_id);

-- A submission owner id is "<assignmentId>:<studentId>", so the student part identifies the owner.
create or replace function public.class_file_student(p_owner_type text, p_owner_id text)
returns uuid language sql immutable set search_path=public,pg_temp as $$
  select case when p_owner_type = 'submission' and position(':' in p_owner_id) > 0
              then nullif(split_part(p_owner_id, ':', 2), '')::uuid end;
$$;

create or replace function public.class_file_class(p_owner_type text, p_owner_id text)
returns uuid language sql stable set search_path=public,pg_temp as $$
  select case
    when p_owner_type = 'assignment' then (select class_id from public.assignments where id = nullif(p_owner_id,'')::uuid)
    when p_owner_type = 'submission' then (select a.class_id from public.assignments a
                                           where a.id = nullif(split_part(p_owner_id, ':', 1),'')::uuid)
  end;
$$;

-- Readable by an admin, by a teacher of the class the file belongs to, and by the student who owns
-- the work (plus their consented parent). Material for a class is readable by everyone in it.
create policy class_files_scoped_read on public.class_files for select to authenticated
using (
  public.has_school_role(school_id,'admin')
  or public.teacher_has_class_access(public.class_file_class(owner_type, owner_id))
  or (owner_type = 'submission' and public.can_read_student(public.class_file_student(owner_type, owner_id)))
  or (owner_type in ('assignment','subject') and exists (
        select 1 from public.student_class_enrollments e
        where e.class_id = public.class_file_class(owner_type, owner_id)
          and e.status = 'active' and e.deleted_at is null
          and public.can_read_student(e.student_id)))
);

grant select on public.class_files to authenticated;

create or replace function public.record_class_file(
  p_school_id uuid, p_file_id uuid, p_owner_type text, p_owner_id text, p_file_name text,
  p_mime_type text, p_byte_size bigint, p_kind text, p_storage_path text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); scope_class uuid; scope_student uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if p_owner_type not in ('assignment','submission','subject') then raise exception 'VALIDATION_ERROR: unsupported owner'; end if;
  if p_byte_size > 15728640 then raise exception 'VALIDATION_ERROR: file too large'; end if;
  if p_storage_path not like p_school_id::text || '/%' then raise exception 'VALIDATION_ERROR: path outside school scope'; end if;

  scope_class := public.class_file_class(p_owner_type, p_owner_id);
  scope_student := public.class_file_student(p_owner_type, p_owner_id);

  -- Teachers publish material and grade work; a student may only attach to their own submission.
  if p_owner_type = 'submission' then
    if not (public.has_school_role(p_school_id,'admin')
            or public.teacher_has_class_access(scope_class)
            or public.student_owns_student_record(scope_student)) then
      raise exception 'FORBIDDEN' using errcode='42501';
    end if;
  else
    if not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(scope_class)) then
      raise exception 'FORBIDDEN' using errcode='42501';
    end if;
  end if;

  insert into public.class_files(id,school_id,owner_type,owner_id,uploaded_by,file_name,mime_type,byte_size,kind,storage_path)
  values(p_file_id,p_school_id,p_owner_type,p_owner_id,actor,p_file_name,coalesce(p_mime_type,''),p_byte_size,coalesce(p_kind,'other'),p_storage_path)
  on conflict(id) do update set file_name=excluded.file_name,mime_type=excluded.mime_type,
    byte_size=excluded.byte_size,kind=excluded.kind,storage_path=excluded.storage_path,
    updated_at=clock_timestamp(),deleted_at=null;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
  values(p_school_id,actor,'class_file_upload','class_file',p_file_id,scope_student,
         jsonb_build_object('ownerType',p_owner_type,'ownerId',p_owner_id,'fileName',p_file_name,'byteSize',p_byte_size));

  return jsonb_build_object('entityId',p_file_id,'storagePath',p_storage_path);
end $$;

create or replace function public.delete_class_file(p_school_id uuid, p_file_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); file public.class_files%rowtype; scope_class uuid; scope_student uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into file from public.class_files where id=p_file_id and school_id=p_school_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  scope_class := public.class_file_class(file.owner_type, file.owner_id);
  scope_student := public.class_file_student(file.owner_type, file.owner_id);
  if not (public.has_school_role(p_school_id,'admin')
          or public.teacher_has_class_access(scope_class)
          or (file.uploaded_by = actor)
          or (file.owner_type = 'submission' and public.student_owns_student_record(scope_student))) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  delete from public.class_files where id=p_file_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id)
  values(p_school_id,actor,'class_file_delete','class_file',p_file_id,scope_student);
  return jsonb_build_object('entityId',p_file_id,'storagePath',file.storage_path);
end $$;

revoke all on function public.record_class_file(uuid,uuid,text,text,text,text,bigint,text,text) from public,anon;
revoke all on function public.delete_class_file(uuid,uuid) from public,anon;
grant execute on function public.record_class_file(uuid,uuid,text,text,text,text,bigint,text,text) to authenticated;
grant execute on function public.delete_class_file(uuid,uuid) to authenticated;

-- Private bucket: no public URLs, every read goes through an authorized client.
insert into storage.buckets (id, name, public, file_size_limit)
values ('classroom-files', 'classroom-files', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

-- Objects are addressed as "<schoolId>/<ownerType>/<ownerId>/<fileId>-<name>", so the first path
-- segment scopes every rule to one school and the metadata row decides who may read it.
drop policy if exists classroom_files_read on storage.objects;
create policy classroom_files_read on storage.objects for select to authenticated
using (
  bucket_id = 'classroom-files'
  and exists (select 1 from public.class_files f where f.storage_path = storage.objects.name)
);

drop policy if exists classroom_files_write on storage.objects;
create policy classroom_files_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'classroom-files'
  and public.is_active_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists classroom_files_delete on storage.objects;
create policy classroom_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'classroom-files'
  and public.is_active_member((storage.foldername(name))[1]::uuid)
  and not exists (select 1 from public.class_files f where f.storage_path = storage.objects.name)
);
