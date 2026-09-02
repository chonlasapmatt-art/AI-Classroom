-- Keep every sign-in an index lookup, whatever the roster grows to.
--
-- Each role reaches the system through one query that runs on every attempt. Three of the five were
-- already backed by an index shaped like the query. Two were not, and both degrade in exactly the
-- way that is invisible in a demo school and painful in a real one — a sequential scan that is fast
-- over thirty rows and slow over thirty thousand.
--
--   * A teacher signs in by name and code. `resolve_teacher_access` normalised `display_name`
--     inside the WHERE clause, so no index could serve it and every attempt read the whole teacher
--     table. The name gets the same stored generated column students have had since
--     `202608300015_student_passwordless_access`, and an index that carries both halves of the pair
--     the query actually asks for.
--   * The operations console's development door counts recent failures by machine.
--     `admin_access_attempts` was indexed on `(actor_profile_id, fingerprint_hash, attempted_at)`,
--     and that query has no account to lead with — it is checked before anybody is signed in — so
--     the leading column was never available and the scan grew with every sign-in ever recorded.
--
-- Unchanged and already correct, recorded here so the next person does not have to re-derive it:
-- students match on `students_matchable_code_idx`, administrators and parents on
-- `member_login_identities_lookup_idx`, and the rate-limit windows on the `identity_hash` and
-- `client_hash` indexes of the two attempt tables.

begin;

-- ---------------------------------------------------------------------------
-- Teachers: the name, stored the way it is compared
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column if not exists normalized_name text
  generated always as (lower(regexp_replace(trim(display_name),'\s+',' ','g'))) stored;

-- The pair the sign-in asks for, in one index, over the rows it can ever match.
create index if not exists teachers_name_code_lookup_idx
  on public.teachers(normalized_name, public.normalize_teacher_code(teacher_code))
  where status='active' and deleted_at is null;

-- Superseded by the index above. It led with `school_id`, which the sign-in does not know: a teacher
-- types a name and a code, not a school. Kept for less than a day; nothing depends on it.
drop index if exists public.teachers_matchable_code_idx;

create or replace function public.resolve_teacher_access(
  p_display_name text,
  p_teacher_code text,
  p_teacher_id uuid default null
) returns table(
  teacher_id uuid,
  profile_id uuid,
  auth_email text,
  display_name text,
  school_id uuid,
  school_name text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  wanted_name text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
  wanted_code text := public.normalize_teacher_code(p_teacher_code);
begin
  if char_length(wanted_name) < 2 or char_length(wanted_code) < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;

  return query
  select t.id, t.profile_id, i.auth_email, t.display_name, t.school_id, s.name
  from public.teachers t
  join public.schools s on s.id=t.school_id
  left join public.member_login_identities i
    on i.profile_id=t.profile_id and i.role='teacher' and i.status='active'
  where (p_teacher_id is null or t.id=p_teacher_id)
    and t.status='active' and t.deleted_at is null
    and t.verification_status='verified_teacher'
    -- Both halves read straight off `teachers_name_code_lookup_idx`.
    and t.normalized_name=wanted_name
    and public.normalize_teacher_code(t.teacher_code)=wanted_code
    and s.status='active' and s.deleted_at is null
  limit 5;
end $$;

revoke all on function public.resolve_teacher_access(text,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_teacher_access(text,text,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rate limiting: counted by machine, before anybody is signed in
-- ---------------------------------------------------------------------------
create index if not exists admin_access_fingerprint_idx
  on public.admin_access_attempts(fingerprint_hash, attempted_at desc);

comment on column public.teachers.normalized_name is
  'Case- and space-insensitive display name. Written by the database; compared against, never displayed.';

commit;
