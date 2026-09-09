-- Server-side writes now announce themselves to the sync journal.
--
-- Devices learn what changed from `sync_changes`, and only `apply_sync_mutation` was writing to it.
-- Every other write path -- binding a student account, provisioning a managed account, inviting a
-- student into a class, transferring one, revoking access -- changed the row and told nobody. The
-- symptom was specific and total: an administrator creates a student, puts them in a class, and the
-- child signs in on that same browser to find an empty app. `students.profile_id` had been set by
-- `provision_managed_account`/`bind_student_access` without a journal row, so the device's copy of
-- that student still said `profile_id = null`, the local scope found no student record owned by the
-- signed-in profile, and every list filtered down to nothing.
--
-- The fix is one helper plus a call at the end of each of those paths, and a backfill so devices
-- already holding stale rows heal on their next pull rather than needing their cache cleared.

create or replace function public.journal_sync_change(
  p_school_id uuid, p_entity_type text, p_entity_id uuid,
  p_operation public.sync_operation default 'upsert', p_version integer default null
) returns bigint
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare resolved integer := p_version; new_revision bigint;
begin
  if p_school_id is null or p_entity_id is null then return null; end if;
  -- The journal carries the version a puller should expect to read back, so when a caller does not
  -- pass one it is read from the row itself rather than guessed.
  if resolved is null then
    case p_entity_type
      when 'student' then select version into resolved from public.students where id = p_entity_id;
      when 'enrollment' then select version into resolved from public.student_class_enrollments where id = p_entity_id;
      else resolved := null;
    end case;
  end if;
  insert into public.sync_changes(school_id, entity_type, entity_id, operation, version)
  values (p_school_id, p_entity_type, p_entity_id, p_operation, coalesce(resolved, 1))
  returning revision into new_revision;
  return new_revision;
end $fn$;

revoke all on function public.journal_sync_change(uuid, text, uuid, public.sync_operation, integer) from public;
revoke all on function public.journal_sync_change(uuid, text, uuid, public.sync_operation, integer) from anon;
revoke all on function public.journal_sync_change(uuid, text, uuid, public.sync_operation, integer) from authenticated;

-- A student's account binding is the one field the whole local projection keys on.
create or replace function public.bind_student_access(p_student_id uuid, p_actor uuid, p_source text default 'login')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  target public.students%rowtype;
  school_name text;
  first_access boolean;
  new_version integer;
begin
  select * into target from public.students
  where id = p_student_id and status = 'active' and deleted_at is null for update;
  if not found then raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000'; end if;
  if not target.student_access_enabled then
    raise exception 'STUDENT_ACCESS_REVOKED' using errcode='42501';
  end if;
  if target.profile_id is not null and target.profile_id <> p_actor then
    raise exception 'STUDENT_ACCESS_DENIED' using errcode='22000';
  end if;

  first_access := target.first_student_access_at is null;
  update public.students set
    profile_id = p_actor,
    first_student_access_at = coalesce(first_student_access_at, clock_timestamp()),
    last_student_access_at = clock_timestamp(),
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id
  returning version into new_version;
  perform public.journal_sync_change(target.school_id, 'student', target.id, 'upsert', new_version);

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_actor,target.display_name,'student','active')
    on conflict(id) do update set display_name = excluded.display_name,
      account_state = 'active', onboarding_completed_at = coalesce(public.user_profiles.onboarding_completed_at,clock_timestamp()),
      updated_at = clock_timestamp();
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target.school_id,p_actor,'student','active')
    on conflict(school_id,profile_id,role) do update
      set status = 'active', active_until = null, updated_at = clock_timestamp();

  select name into school_name from public.schools where id = target.school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,p_actor,
      case when first_access then 'STUDENT_FIRST_ACCESS' else 'STUDENT_ACCESS_GRANTED' end,
      'student',target.id,target.id,
      jsonb_build_object('source',p_source,'studentCode',target.student_code));
  return jsonb_build_object('studentId',target.id,'schoolId',target.school_id,
    'schoolName',school_name,'displayName',target.display_name,'firstAccess',first_access);
end $fn$;

create or replace function public.claim_student_account(p_actor uuid, p_school_code text, p_student_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  target_school public.schools%rowtype;
  target_student public.students%rowtype;
  requested text;
  confirmed_at timestamptz;
  new_version integer;
begin
  select requested_role into requested from public.user_profiles where id=p_actor;
  select email_confirmed_at into confirmed_at from auth.users where id=p_actor;
  if requested <> 'student' or confirmed_at is null then
    raise exception 'ACCOUNT_NOT_READY' using errcode='42501';
  end if;

  select * into target_school from public.schools
  where upper(code)=upper(trim(p_school_code)) and status='active' and deleted_at is null;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;

  select * into target_student from public.students
  where school_id=target_school.id
    and upper(student_code)=upper(trim(p_student_code))
    and lower(regexp_replace(trim(display_name),'\s+',' ','g'))=
        lower(regexp_replace(trim(p_display_name),'\s+',' ','g'))
    and status='active' and deleted_at is null
  for update;
  if not found then raise exception 'ONBOARDING_DETAILS_MISMATCH' using errcode='22000'; end if;
  if target_student.profile_id is not null and target_student.profile_id<>p_actor then
    raise exception 'TARGET_ALREADY_LINKED' using errcode='23505';
  end if;

  update public.students set profile_id=p_actor,updated_at=clock_timestamp(),
    server_updated_at=clock_timestamp(),version=version+1 where id=target_student.id
  returning version into new_version;
  perform public.journal_sync_change(target_school.id, 'student', target_student.id, 'upsert', new_version);
  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target_school.id,p_actor,'student','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
  update public.user_profiles set display_name=target_student.display_name,
    account_state='active',onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_actor;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(target_school.id,p_actor,'student_account_claimed','student',target_student.id,
      jsonb_build_object('studentCode',target_student.student_code));
  return jsonb_build_object('schoolId',target_school.id,'schoolName',target_school.name,
    'studentId',target_student.id,'accountState','active');
end $fn$;

create or replace function public.set_student_access(p_student_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  actor uuid := auth.uid();
  target public.students%rowtype;
  new_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into target from public.students where id = p_student_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(target.school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  update public.students set student_access_enabled = p_enabled,
    profile_id = case when p_enabled then profile_id else null end,
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id
  returning version into new_version;
  perform public.journal_sync_change(target.school_id, 'student', target.id, 'upsert', new_version);
  if not p_enabled and target.profile_id is not null then
    update public.school_memberships set status = 'suspended', updated_at = clock_timestamp()
      where school_id = target.school_id and profile_id = target.profile_id and role = 'student';
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,actor,
      case when p_enabled then 'STUDENT_ACCESS_ENABLED' else 'STUDENT_ACCESS_REVOKED' end,
      'student',target.id,target.id,jsonb_build_object('accessEnabled',p_enabled));
  return jsonb_build_object('studentId',target.id,'accessEnabled',p_enabled);
end $fn$;

create or replace function public.register_student_access(p_first_name text, p_last_name text, p_student_code text, p_school_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
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
    perform public.journal_sync_change(target_school.id, 'student', new_id, 'upsert', 1);
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
end $fn$;
