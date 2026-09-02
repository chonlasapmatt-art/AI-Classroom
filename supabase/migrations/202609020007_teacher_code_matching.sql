-- Match a teacher code the way a school writes it.
--
-- This is the same fault `202608300017_student_code_matching` fixed for student numbers, still
-- standing on the teacher side. `resolve_teacher_access` stripped spaces and dashes from the stored
-- code, while the client and the Edge Function sent a form with every non-latin character removed.
-- The two never agreed on anything a Thai school actually types:
--
--   stored `ครู-01`  the roster keeps it as written
--   sent   `01`      the browser deleted the Thai letters before the request left
--
-- So a teacher whose code was written in Thai could not sign in at all, and for a code written
-- *entirely* in Thai the sign-in button was disabled outright, because the normalised form was
-- empty. The administrator had saved a code, it was correct, and it was refused.
--
-- Both sides are normalised the same way here, and the rule is the one the roster already implied:
-- spaces and dashes are separators, everything else is the code. The stored value keeps whatever
-- formatting the school chose — it appears on reports and in exports — and only the comparison
-- ignores the separators.

begin;

-- Same normalisation the client and the Edge Function apply before they ever call in.
create or replace function public.normalize_teacher_code(p_code text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select upper(regexp_replace(coalesce(p_code,''),'[\s-]','','g'));
$$;

create index if not exists teachers_matchable_code_idx
  on public.teachers(school_id, public.normalize_teacher_code(teacher_code))
  where deleted_at is null;

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
    and lower(regexp_replace(trim(t.display_name),'\s+',' ','g'))=wanted_name
    and public.normalize_teacher_code(t.teacher_code)=wanted_code
    and s.status='active' and s.deleted_at is null
  limit 5;
end $$;

revoke all on function public.resolve_teacher_access(text,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_teacher_access(text,text,uuid) to service_role;

comment on function public.normalize_teacher_code(text) is
  'Separator-insensitive form of a teacher code. Spaces and dashes are formatting; everything else is the code.';

commit;
