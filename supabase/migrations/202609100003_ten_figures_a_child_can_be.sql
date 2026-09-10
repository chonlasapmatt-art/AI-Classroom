begin;

/*
 * Five figures became ten, and the server has to know all ten.
 *
 * `202609100002` taught `set_own_avatar_config` to keep the body a child built on, checked against
 * the five names the renderer had at the time. The renderer now draws ten — four animals with their
 * own silhouettes, and a streetwear figure — and a name the server does not recognise is refused
 * outright, so a child could pick the cat, press save, and be told their avatar was invalid.
 *
 * The list stays a list rather than becoming a pattern. A regular expression would accept
 * `catWizardSupreme` and store it for a renderer that cannot draw it, and the next person to add a
 * figure would have no reason to come here — which is exactly how the five got stale.
 */
create or replace function public.set_own_avatar_config(p_school_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  actor uuid := auth.uid();
  target public.students%rowtype;
  unlocked jsonb;
  layers jsonb := coalesce(p_config -> 'layers', '{}'::jsonb);
  tints jsonb := coalesce(p_config -> 'tints', '{}'::jsonb);
  body text := p_config ->> 'bodyArchetype';
  clean jsonb;
  entry record;
  new_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if jsonb_typeof(layers) <> 'object' or jsonb_typeof(tints) <> 'object' then
    raise exception 'VALIDATION_ERROR: layers and tints must be objects';
  end if;
  if body is not null and body not in (
    'dragonKnight', 'arcaneMage', 'demon', 'student', 'athlete',
    'cat', 'fox', 'rabbit', 'penguin', 'techwear'
  ) then
    raise exception 'VALIDATION_ERROR: unknown body';
  end if;

  select * into target from public.students
  where school_id = p_school_id and profile_id = actor and deleted_at is null
  for update;
  if not found then raise exception 'NOT_FOUND: no student record of your own in this school'; end if;

  unlocked := coalesce(target.avatar_config -> 'unlockedOutfits', '[]'::jsonb);

  -- Every trait named has to look like a trait id, and every priced one has to have been earned.
  for entry in select key, value from jsonb_each_text(layers) loop
    if entry.key !~ '^[a-z][a-z_]{0,23}$' or entry.value !~ '^[a-z][a-z0-9_]{0,47}$' then
      raise exception 'VALIDATION_ERROR: unknown trait';
    end if;
    if public.avatar_trait_price(entry.value) > 0 and not unlocked @> to_jsonb(entry.value) then
      raise exception 'TRAIT_LOCKED: % has not been redeemed', entry.value using errcode='42501';
    end if;
  end loop;

  -- Colours are hex or they are nothing: a config is display data that every other child sees.
  for entry in select key, value from jsonb_each_text(tints) loop
    if entry.key !~ '^(skin|hair|primary|secondary|accent|magic)$' or entry.value !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'VALIDATION_ERROR: unknown colour';
    end if;
  end loop;

  /*
   * Only the keys the renderer reads, and never the ones a student must not set.
   *
   * `unlockedOutfits` and `spentPoints` are the purse, written by `redeem_outfit` alone. Building
   * the object from scratch here rather than merging what arrived is what stops a crafted request
   * granting itself a wardrobe.
   */
  clean := jsonb_strip_nulls(jsonb_build_object(
    'v', 2,
    'race', p_config ->> 'race',
    'element', p_config ->> 'element',
    'animationSet', p_config ->> 'animationSet',
    'bodyArchetype', body,
    'layers', layers,
    'tints', tints
  ));

  update public.students
  set avatar_config = coalesce(avatar_config, '{}'::jsonb) || clean,
      updated_at = clock_timestamp(),
      server_updated_at = clock_timestamp(),
      version = version + 1
  where id = target.id
  returning version into new_version;
  perform public.journal_sync_change(p_school_id, 'student', target.id, 'upsert', new_version);

  return clean;
end $fn$;

comment on function public.set_own_avatar_config(uuid, jsonb) is
  'A student saves a customiser build of their own. Validates shape, body and earned traits.';

grant execute on function public.set_own_avatar_config(uuid, jsonb) to authenticated;

commit;
