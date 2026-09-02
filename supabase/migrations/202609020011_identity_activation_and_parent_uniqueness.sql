-- Two things an administrator needs from a roster: one row per person, and a way to make a row
-- usable when it is not.
--
-- The school ended up with five guardians all called the same name, created inside forty seconds.
-- The screen minted a fresh record id on every save, so a second click on a form that looked like it
-- had failed did not correct the first attempt — it created another guardian. Nothing in the
-- database said no, because nothing had been asked to.
--
-- The other half is the reverse problem: a row that exists and cannot sign in. A teacher is only
-- resolvable by name and code while the roster row is active, not deleted, and marked verified, and
-- an administrator looking at the screen has no way to see which of those is false, let alone fix
-- it. `activate_member_login` is that button: it sets every condition the sign-in checks and hands
-- back the exact name and code to type, so "I added them and they cannot get in" has an answer that
-- takes one click instead of a support conversation.

begin;

-- ---------------------------------------------------------------------------
-- One guardian per name, per school
-- ---------------------------------------------------------------------------
-- Case and spacing are presentation, the same rule the sign-in paths already apply to names.
-- Archived guardians are outside the index: a name becomes free again once the record is retired.
create unique index if not exists parents_unique_active_name
  on public.parents(school_id, lower(regexp_replace(trim(display_name),'\s+',' ','g')))
  where status = 'active';

/**
 * Is this name already taken by a different active guardian in this school?
 *
 * The unique index is the guarantee; this is what lets the two provisioning paths refuse with a name
 * the gateway can translate, instead of surfacing a raw constraint violation the screen would show
 * as "สร้างบัญชีไม่สำเร็จ".
 */
create or replace function public.parent_name_taken(p_school_id uuid, p_parent_id uuid, p_display_name text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.parents p
    where p.school_id = p_school_id
      and p.status = 'active'
      and (p_parent_id is null or p.id <> p_parent_id)
      and lower(regexp_replace(trim(p.display_name),'\s+',' ','g'))
        = lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Making a roster row usable
-- ---------------------------------------------------------------------------

/**
 * Turns a teacher or guardian row into one that can sign in, and says what to type.
 *
 * Every condition the sign-in resolvers test is set here in one transaction: the record active and
 * not deleted, a teacher marked verified, the login identity and school membership active where an
 * account already exists. It creates nothing and grants nothing beyond the school the caller already
 * administers, and it never touches a password — a person who has no account yet still needs one set,
 * and the answer says so rather than pretending otherwise.
 */
create or replace function public.activate_member_login(
  p_school_id uuid, p_role text, p_record_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  teacher_row public.teachers%rowtype;
  student_row public.students%rowtype;
  parent_row public.parents%rowtype;
  linked_profile uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role not in ('teacher','student','parent') then raise exception 'VALIDATION_ERROR'; end if;

  if p_role = 'teacher' then
    select * into teacher_row from public.teachers
      where id = p_record_id and school_id = p_school_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;

    update public.teachers
      set status = 'active', deleted_at = null, verification_status = 'verified_teacher',
          updated_at = clock_timestamp()
      where id = teacher_row.id
      returning profile_id into linked_profile;
  elsif p_role = 'student' then
    select * into student_row from public.students
      where id = p_record_id and school_id = p_school_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;

    -- `student_access_enabled` is the switch the student sign-in checks, and it is off for a child
    -- whose access a school suspended. Turning it back on is the point of pressing this.
    update public.students
      set status = 'active', deleted_at = null, student_access_enabled = true,
          updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
      where id = student_row.id
      returning profile_id into linked_profile;
  else
    select * into parent_row from public.parents
      where id = p_record_id and school_id = p_school_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if public.parent_name_taken(p_school_id, parent_row.id, parent_row.display_name) then
      raise exception 'PARENT_NAME_EXISTS';
    end if;

    update public.parents
      set status = 'active', updated_at = clock_timestamp()
      where id = parent_row.id
      returning profile_id into linked_profile;
  end if;

  -- An account that exists is put back into every state the sign-in requires. One that does not is
  -- left alone: creating it needs a password, which is a separate, deliberate act.
  if linked_profile is not null then
    update public.user_profiles set account_state = 'active', updated_at = clock_timestamp()
      where id = linked_profile;
    update public.member_login_identities set status = 'active', school_id = p_school_id,
      updated_at = clock_timestamp() where profile_id = linked_profile;
    -- A student's login identity lives in `students`, not `member_login_identities`, so the update
    -- above simply matches nothing for them. The membership is what every role needs.
    insert into public.school_memberships(school_id, profile_id, role, status)
      values(p_school_id, linked_profile, p_role::public.membership_role, 'active')
    on conflict(school_id, profile_id, role) do update
      set status = 'active', active_until = null, updated_at = clock_timestamp();
  end if;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, actor, 'MEMBER_LOGIN_ACTIVATED', p_role, p_record_id,
      jsonb_build_object('role', p_role, 'profileId', linked_profile));

  return jsonb_build_object(
    'role', p_role,
    'recordId', p_record_id,
    'displayName', case p_role when 'teacher' then teacher_row.display_name
                               when 'student' then student_row.display_name
                               else parent_row.display_name end,
    -- What the person types in the second field. A teacher signs in with their code and a student
    -- with their student number; a guardian signs in with a password, which this function
    -- deliberately does not know and never returns.
    'signInCode', case p_role when 'teacher' then teacher_row.teacher_code
                              when 'student' then student_row.student_code
                              else null end,
    'hasAccount', linked_profile is not null,
    -- Only a guardian is stuck without an account: the other two sign in by name and code, and their
    -- account is created on first use by the gateway that checks the pair.
    'needsPassword', p_role = 'parent' and linked_profile is null
  );
end $$;

revoke all on function public.parent_name_taken(uuid,uuid,text) from public,anon;
revoke all on function public.activate_member_login(uuid,text,uuid) from public,anon;
grant execute on function public.parent_name_taken(uuid,uuid,text) to authenticated;
grant execute on function public.activate_member_login(uuid,text,uuid) to authenticated, service_role;

comment on function public.activate_member_login(uuid,text,uuid) is
  'Sets every condition the name-based sign-in checks for one roster row, and returns what to type.';
comment on index public.parents_unique_active_name is
  'One active guardian per name per school. Case and spacing are presentation, not identity.';

commit;
