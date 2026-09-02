-- An account could never be deleted. Not archived, not suspended — deleted.
--
-- `audit_log.actor_profile_id` points at `user_profiles`, the log is append-only by trigger, and the
-- foreign key has no delete behaviour. So the first thing anybody did — a single sign-in writes one
-- row — pinned their account in place forever. A school that created a guardian for the wrong child,
-- a student who left, a teacher who resigned: every one of them stayed, and the only answer the
-- system had was to suspend the account and leave the name on the list.
--
-- Deleting the log is not the answer; the log is the record of what was done to children's data and
-- it must not be editable. What the log actually needs from an actor is *who acted*, and it was
-- keeping that as a pointer to a live account rather than as a fact of its own.
--
-- So: `actor_label` records the name at the moment of the act, and the one mutation the append-only
-- trigger now allows is releasing `actor_profile_id` — nothing else about a row may change, and the
-- label must survive. `erase_member_account` then detaches the person from every record that can
-- hold them, deletes what only exists to log them in, and reports anything left that would block the
-- account's removal, so the gateway can say what is holding it rather than failing blind.
--
-- What erasure is not: removing somebody from the roster. The teacher, student or guardian record
-- stays and keeps its history; what goes is the way in, and the personal account behind it.

begin;

-- ---------------------------------------------------------------------------
-- The log remembers who, without holding the account hostage
-- ---------------------------------------------------------------------------
alter table public.audit_log add column if not exists actor_label text;

-- The backfill is an update on an append-only table, so the guard comes off for the length of it.
drop trigger if exists audit_append_only on public.audit_log;

update public.audit_log entry
  set actor_label = profile.display_name
  from public.user_profiles profile
  where entry.actor_profile_id = profile.id and entry.actor_label is null;

/**
 * The log takes no edits, with one exception: releasing a deleted account's pointer.
 *
 * Everything else about the row — what happened, to whom, when, and the name of who did it — must be
 * identical, so the only information this can remove is the link to a `user_profiles` row that is
 * about to stop existing. `actor_label` is what makes that safe: the name is already written down.
 */
create or replace function public.prevent_audit_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op = 'UPDATE'
    and old.actor_profile_id is not null and new.actor_profile_id is null
    and new.id = old.id and new.school_id = old.school_id and new.action = old.action
    and new.entity_type = old.entity_type
    and new.entity_id is not distinct from old.entity_id
    and new.target_student_id is not distinct from old.target_student_id
    and new.before_json is not distinct from old.before_json
    and new.after_json is not distinct from old.after_json
    and new.metadata_json is not distinct from old.metadata_json
    and new.occurred_at = old.occurred_at
    and new.actor_label is not distinct from old.actor_label
  then
    return new;
  end if;
  raise exception 'audit_log is append-only' using errcode='42501';
end $$;

create trigger audit_append_only before update or delete on public.audit_log
  for each row execute function public.prevent_audit_mutation();

/** Writes the actor's name into the row as it is created, so the row never depends on the account. */
create or replace function public.stamp_audit_actor_label() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.actor_label is null and new.actor_profile_id is not null then
    select display_name into new.actor_label from public.user_profiles where id = new.actor_profile_id;
  end if;
  return new;
end $$;

drop trigger if exists audit_stamp_actor_label on public.audit_log;
create trigger audit_stamp_actor_label before insert on public.audit_log
  for each row execute function public.stamp_audit_actor_label();

comment on column public.audit_log.actor_label is
  'Who acted, as a name recorded at the time. Outlives the account, which may be erased.';

-- ---------------------------------------------------------------------------
-- Erasing one account
-- ---------------------------------------------------------------------------

/**
 * Detaches a person from everything that can hold them, and says what is left.
 *
 * The roster row stays: erasing an account is not removing a student from a school, and a class that
 * a teacher taught still says so. What goes is the login — the identity, the memberships, the
 * devices, the sign-in attempts — and every reference to the account that a record can do without.
 * References that cannot be released are returned rather than raised, because the caller's next step
 * is deleting the authentication account and it needs to know whether that will work.
 *
 * Refused for: yourself, a platform operator, the last administrator a school has, and anybody whose
 * membership reaches a school this caller does not administer.
 */
create or replace function public.erase_member_account(p_school_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  label text;
  role_here text;
  other_schools integer;
  remaining_admins integer;
  reference record;
  blocking text[] := array[]::text[];
  held integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_profile_id is null then raise exception 'VALIDATION_ERROR'; end if;
  if p_profile_id = actor then raise exception 'CANNOT_ERASE_SELF'; end if;

  select display_name into label from public.user_profiles where id = p_profile_id;
  if label is null then raise exception 'NOT_FOUND'; end if;

  if exists(select 1 from public.platform_admins
    where profile_id = p_profile_id and status = 'active' and revoked_at is null) then
    raise exception 'CANNOT_ERASE_PLATFORM_OPERATOR';
  end if;

  select count(*) into other_schools from public.school_memberships
    where profile_id = p_profile_id and school_id <> p_school_id and status = 'active';
  if other_schools > 0 then raise exception 'ACCOUNT_BELONGS_TO_ANOTHER_SCHOOL'; end if;

  select role::text into role_here from public.school_memberships
    where profile_id = p_profile_id and school_id = p_school_id limit 1;
  if role_here = 'admin' then
    select count(*) into remaining_admins from public.school_memberships
      where school_id = p_school_id and role = 'admin' and status = 'active' and profile_id <> p_profile_id;
    if remaining_admins = 0 then raise exception 'LAST_ADMINISTRATOR'; end if;
  end if;

  -- The way in, and the traces of using it. None of these mean anything once the account is gone.
  delete from public.member_login_identities where profile_id = p_profile_id;
  delete from public.school_memberships where profile_id = p_profile_id;
  delete from public.member_account_events where profile_id = p_profile_id;
  delete from public.member_access_attempts where profile_id = p_profile_id;
  delete from public.student_access_attempts where student_id in (
    select id from public.students where profile_id = p_profile_id);
  delete from public.password_reset_requests where profile_id = p_profile_id;

  -- Everything else that names this account and can do without it. Discovered rather than listed, so
  -- a table added next year is covered by the same rule as the ones here.
  for reference in
    select conrelid::regclass::text as table_name, attname as column_name
    from pg_constraint
    join pg_attribute on pg_attribute.attrelid = pg_constraint.conrelid
      and pg_attribute.attnum = pg_constraint.conkey[1]
    where confrelid = 'public.user_profiles'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 1
      and conrelid <> 'public.user_profiles'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', reference.table_name, reference.column_name)
      into held using p_profile_id;
    if held > 0 then
      begin
        execute format('update %s set %I = null where %I = $1',
          reference.table_name, reference.column_name, reference.column_name) using p_profile_id;
      exception when others then
        blocking := blocking || format('%s.%s (%s)', reference.table_name, reference.column_name, sqlerrm);
      end;
    end if;
  end loop;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, actor, 'MEMBER_ACCOUNT_ERASED', coalesce(role_here,'member'), p_profile_id,
      jsonb_build_object('displayName', label, 'role', role_here));

  return jsonb_build_object(
    'profileId', p_profile_id, 'displayName', label, 'role', role_here,
    'blocking', to_jsonb(blocking),
    -- The roster row is deliberately still there, and an administrator should be told so rather than
    -- discover it: the person is still a student of this school, they simply cannot sign in.
    'rosterKept', true
  );
end $$;

revoke all on function public.erase_member_account(uuid,uuid) from public,anon;
grant execute on function public.erase_member_account(uuid,uuid) to authenticated, service_role;

comment on function public.erase_member_account(uuid,uuid) is
  'Releases every reference to one account so it can be deleted. Keeps the roster row and the log.';

commit;
