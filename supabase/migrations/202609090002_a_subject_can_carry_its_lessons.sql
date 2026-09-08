-- A subject can carry its lessons.
--
-- `class_files` already had a third kind of owner beside an assignment and a turned-in piece of
-- work: a subject. Nothing could use it. The scope helper answers NULL for a subject, so the write
-- fell through to `teacher_has_class_access(null)` — false for every teacher — and the read policy
-- asked the same question, so even the administrator who could upload was the only one who could
-- see it afterwards. Subject material was a column with no door.
--
-- Both doors are opened here, and they are deliberately different from the class ones:
--
--   * writing is for the staff who teach the subject. Not "a teacher", which would let the science
--     teacher publish into mathematics; not "a teacher of the class", because a subject's material
--     is not owned by one room. A teacher listed on `class_teachers` for that subject, anywhere in
--     the school, may publish to it — which is exactly the person a school would expect.
--
--   * reading is for the school. A lesson is not a mark: it names no child, carries no assessment,
--     and the reason it exists is that people can watch it. A student takes the subject next term,
--     a guardian wants to see what their child is being taught, a teacher covers a colleague's
--     class — all of them are active members of this school, and any narrower rule turns out to
--     mean "the lesson is invisible to somebody who needs it" more often than it protects anything.
--
-- Storage follows without a change: the bucket's read policy asks whether a `class_files` row for
-- that object is visible, so widening the row's visibility widens the file's.

create or replace function public.teacher_teaches_subject(target_subject uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.class_teachers ct
    join public.teachers t on t.id = ct.teacher_id
    where ct.subject_id = target_subject
      and t.profile_id = (select auth.uid())
      and t.status = 'active'
      and t.deleted_at is null
      and t.verification_status = 'verified_teacher'
      and public.is_verified_teacher(ct.school_id, (select auth.uid()))
      and (ct.active_until is null or ct.active_until > now())
  );
$$;

revoke all on function public.teacher_teaches_subject(uuid) from public, anon;
grant execute on function public.teacher_teaches_subject(uuid) to authenticated;

-- The write path. Only the `subject` branch is new; the assignment and submission rules are the
-- ones that were already there, repeated unchanged so this file is the whole story of the routine.
create or replace function public.record_class_file(
  p_school_id uuid, p_file_id uuid, p_owner_type text, p_owner_id text,
  p_file_name text, p_mime_type text, p_byte_size bigint, p_kind text, p_storage_path text
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
  elsif p_owner_type = 'subject' then
    if not (public.has_school_role(p_school_id,'admin')
            or public.teacher_teaches_subject(nullif(p_owner_id,'')::uuid)) then
      raise exception 'FORBIDDEN' using errcode='42501';
    end if;
    -- A subject belongs to a school, and material filed under another school's subject would be
    -- readable by this school's members. The path check above does not catch that; this does.
    if not exists(select 1 from public.subjects s
                  where s.id = nullif(p_owner_id,'')::uuid and s.school_id = p_school_id) then
      raise exception 'VALIDATION_ERROR: unknown subject';
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

-- The read path. Same policy as before with one clause added: a subject's material is readable by
-- the school's own active members.
drop policy if exists class_files_scoped_read on public.class_files;
create policy class_files_scoped_read on public.class_files for select using (
  public.has_school_role(school_id, 'admin')
  or public.teacher_has_class_access(public.class_file_class(owner_type, owner_id))
  or (owner_type = 'submission' and public.can_read_student(public.class_file_student(owner_type, owner_id)))
  or (owner_type = 'assignment' and exists(
        select 1 from public.student_class_enrollments e
        where e.class_id = public.class_file_class(class_files.owner_type, class_files.owner_id)
          and e.status = 'active' and e.deleted_at is null
          and public.can_read_student(e.student_id)))
  or (owner_type = 'subject' and public.is_active_member(school_id))
);
