-- An avatar can change its clothes.
--
-- Choosing an avatar was already something a person did for themselves, through `set_own_avatar`,
-- and choosing what it wears is the same kind of choice: it changes a drawing and nothing else. The
-- clothes live in `students.avatar_config`, which a student cannot write directly — the table is
-- theirs to read and a teacher's to change — so this is the same shape as the avatar function: a
-- security-definer routine that will only ever touch the caller's own row.
--
-- What it deliberately does not do: it does not create anything, it does not touch a role, a
-- membership or a password, it cannot name another student's row, and it merges rather than
-- replaces, so an avatar configured by a teacher keeps every part of its look except the shirt.

create or replace function public.set_own_outfit(p_school_id uuid, p_outfit text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); touched integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  -- The catalogue of outfits lives in the app, so the rule here is the shape of an id rather than a
  -- list of them: lower-case, short, and nothing that could be read as anything but a name.
  if p_outfit !~ '^[a-z][a-z0-9_-]{0,31}$' then raise exception 'VALIDATION_ERROR: unknown outfit'; end if;

  update public.students
  set avatar_config = coalesce(avatar_config, '{}'::jsonb) || jsonb_build_object('outfit', p_outfit),
      updated_at = clock_timestamp(),
      server_updated_at = clock_timestamp()
  where school_id = p_school_id and profile_id = actor and deleted_at is null;
  get diagnostics touched = row_count;

  if touched = 0 then raise exception 'NOT_FOUND: no student record of your own in this school'; end if;
  return jsonb_build_object('outfit', p_outfit);
end $$;

revoke all on function public.set_own_outfit(uuid,text) from public,anon;
grant execute on function public.set_own_outfit(uuid,text) to authenticated;
