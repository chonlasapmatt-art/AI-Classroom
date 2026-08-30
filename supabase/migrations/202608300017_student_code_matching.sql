-- Match a student number the way a person reads it.
--
-- The student entrance strips spaces and hyphens from what a child types — "ป.6/1-15" and "ป61 15"
-- are meant to be the same number — but the lookup compared the result byte for byte against what
-- the school stored. Any code the school entered with a separator therefore could never be signed
-- in with: the child typed it exactly as printed on their card and got the generic refusal, because
-- the stored "P6-01" was being compared against the stripped "P601". Structured student numbers are
-- the norm in Thai schools, so this locked out most of them, including every code the development
-- seeder produces.
--
-- Both sides are normalised the same way here. The stored value keeps whatever formatting the school
-- chose — it is what appears on reports and in exports — and only the comparison ignores separators.

begin;

-- Same normalisation the client and the Edge Function apply before they ever call in.
create or replace function public.normalize_student_code(p_code text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select upper(regexp_replace(coalesce(p_code,''),'[\s-]','','g'));
$$;

create index if not exists students_matchable_code_idx
  on public.students(normalized_name,public.normalize_student_code(student_code))
  where deleted_at is null;

create or replace function public.resolve_student_access(
  p_display_name text,
  p_student_code text,
  p_school_id uuid default null
) returns table(
  student_id uuid,
  school_id uuid,
  school_name text,
  display_name text,
  student_code text,
  profile_id uuid,
  access_enabled boolean
) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted_name text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
  wanted_code text := public.normalize_student_code(p_student_code);
begin
  if char_length(wanted_name) < 2 or char_length(wanted_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;
  return query
  select s.id, s.school_id, sc.name, s.display_name, s.student_code, s.profile_id,
         s.student_access_enabled
  from public.students s
  join public.schools sc on sc.id = s.school_id
  where s.normalized_name = wanted_name
    and public.normalize_student_code(s.student_code) = wanted_code
    and s.status = 'active' and s.deleted_at is null
    and sc.status = 'active' and sc.deleted_at is null
    and (p_school_id is null or s.school_id = p_school_id)
  limit 10;
end $$;

create or replace function public.register_student_access(
  p_first_name text,
  p_last_name text,
  p_student_code text,
  p_school_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_school public.schools%rowtype;
  target public.students%rowtype;
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  clean_code text := upper(trim(coalesce(p_student_code,'')));
  match_code text := public.normalize_student_code(p_student_code);
  full_name text;
  created boolean := false;
  new_id uuid;
begin
  full_name := trim(clean_first || ' ' || clean_last);
  if char_length(clean_first) < 1 or char_length(clean_last) < 1 or char_length(match_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select * into target_school from public.schools
  where id = p_school_id and status = 'active' and deleted_at is null;
  if not found then raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000'; end if;

  -- Separator-insensitive here too, so a child who registers cannot create a second record that
  -- reads as the same number as the one their teacher already entered.
  select * into target from public.students
  where school_id = target_school.id and public.normalize_student_code(student_code) = match_code
    and status = 'active' and deleted_at is null for update;

  if found then
    if target.normalized_name <> lower(full_name) then
      raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000';
    end if;
    if target.profile_id is not null then
      raise exception 'TARGET_ALREADY_LINKED' using errcode='23505';
    end if;
  else
    if not target_school.allow_student_self_registration then
      raise exception 'SELF_REGISTRATION_DISABLED' using errcode='42501';
    end if;
    new_id := gen_random_uuid();
    insert into public.students(id,school_id,student_code,display_name,first_name,last_name,
      avatar_index,status,creation_source,version)
      values(new_id,target_school.id,clean_code,full_name,clean_first,clean_last,
        (abs(hashtext(new_id::text)) % 100),'active','self_registration',1);
    select * into target from public.students where id = new_id;
    created := true;
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(target_school.id,null,'STUDENT_SELF_REGISTERED','student',new_id,new_id,
        jsonb_build_object('studentCode',clean_code,'creationSource','self_registration'));
  end if;

  if not created then
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(target_school.id,null,'STUDENT_SELF_LINKED','student',target.id,target.id,
        jsonb_build_object('studentCode',target.student_code,'creationSource',target.creation_source));
  end if;

  return jsonb_build_object('studentId',target.id,'schoolId',target_school.id,
    'schoolName',target_school.name,'displayName',target.display_name,'created',created);
end $$;

revoke all on function public.resolve_student_access(text,text,uuid) from public,anon,authenticated;
revoke all on function public.register_student_access(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_student_access(text,text,uuid) to service_role;
grant execute on function public.register_student_access(text,text,text,uuid) to service_role;

comment on function public.normalize_student_code(text) is
  'Comparison form of a student number: spaces and hyphens removed, upper-cased. Storage keeps the school''s own formatting.';

commit;
