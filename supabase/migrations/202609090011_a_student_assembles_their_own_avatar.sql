-- A student assembles their own avatar, and the server prices it.
--
-- Until now a child could pick one of the catalogue's finished characters (`set_own_avatar`) or wear
-- an outfit they had bought (`set_own_outfit`). The customiser adds a third thing: a combination of
-- traits that no catalogue id names — a particular hat on a particular face in a particular colour —
-- and there was no way for the one row a student may write to hold it.
--
-- Two rules, and both of them exist because this is the only avatar write a student can make on
-- their own behalf:
--
--   * **the shape is checked, not trusted.** The column is JSONB and the client sends the whole
--     object, so this reads out only the keys the renderer understands and drops everything else.
--     A config is display data, but it is display data that every other child sees.
--   * **a priced trait has to have been earned.** Prices live in the app, which cannot be the
--     authority on what a child may wear: the request comes from the child's own browser. So the
--     price is recomputed here, from ids, and a trait that costs points is refused unless it is
--     already in `unlockedOutfits`.
--
-- The prices are computed from the id rather than listed, because the ids are compositional in
-- exactly the way the drawings are: `hair_bob__wizardhat` is a free shape plus an eighty-point hat,
-- and listing all 181 priced combinations would be 181 chances for this file and the trait table to
-- disagree. A test walks every priced trait and checks this function agrees with the app.

create or replace function public.avatar_trait_price(p_trait text)
returns integer language sql immutable set search_path to 'public','pg_temp'
as $fn$
  with parts as (
    select
      case when position('__' in p_trait) > 0
        then split_part(p_trait, '__', 1) else p_trait end as base,
      case when position('__' in p_trait) > 0
        then split_part(p_trait, '__', 2) else null end as worn
  ),
  -- The base half: an eye shape, a top, a pair of wings. Everything absent from here is free.
  base_price as (
    select case split_part((select base from parts), '_', 1) || ':' ||
                substr((select base from parts), position('_' in (select base from parts)) + 1)
      when 'face:glow' then 60
      when 'face:fangs' then 30
      when 'face:star' then 50
      when 'face:cyber' then 70
      when 'top:magerobe' then 80
      when 'top:runichood' then 100
      when 'top:chestplate' then 120
      when 'top:techwear' then 90
      when 'top:steamvest' then 70
      when 'top:kimono' then 60
      when 'top:ninjagi' then 90
      when 'top:pirate' then 70
      when 'top:spacesuit' then 110
      when 'top:druidwrap' then 60
      when 'bottom:robehem' then 40
      when 'bottom:greaves' then 80
      when 'bottom:techpants' then 60
      when 'back:batwings' then 120
      when 'back:dragonwings' then 150
      when 'back:angelwings' then 140
      when 'back:cape' then 60
      when 'back:dragontail' then 90
      when 'back:spadetail' then 70
      when 'back:foxtails' then 130
      when 'back:wolftail' then 60
      when 'back:tome' then 110
      when 'back:banner' then 50
      when 'back:shield' then 80
      when 'back:jetpack' then 130
      when 'front:staff' then 110
      when 'front:sword' then 100
      when 'front:lantern' then 60
      when 'front:petcat' then 120
      when 'front:petbird' then 100
      when 'front:orb' then 90
      when 'aura:fire' then 100
      when 'aura:ice' then 100
      when 'aura:shadow' then 110
      when 'aura:nature' then 90
      when 'aura:star' then 90
      when 'aura:cyber' then 120
      when 'aura:lightning' then 110
      when 'fx:sparkle' then 40
      when 'fx:flameorb' then 90
      when 'fx:smokepuff' then 50
      when 'fx:leaffall' then 60
      when 'fx:motes' then 80
      when 'fx:arc' then 100
      when 'fx:gridline' then 70
      else 0 end
  ),
  -- The worn half: what is on top of the hair, or over the eyes.
  worn_price as (
    select case (select worn from parts)
      when 'hornscurved' then 40
      when 'hornsdragon' then 60
      when 'beastears' then 30
      when 'wizardhat' then 80
      when 'halo' then 100
      when 'visor' then 70
      when 'cybermask' then 90
      when 'eyepatch' then 40
      when 'goggles' then 60
      when 'monocle' then 50
      else 0 end
  )
  select (select * from base_price) + (select * from worn_price);
$fn$;

comment on function public.avatar_trait_price(text) is
  'Points a customiser trait costs, computed from its id. Mirrors avatarTraits.tsx; guarded by a test.';

create or replace function public.set_own_avatar_config(p_school_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  actor uuid := auth.uid();
  target public.students%rowtype;
  unlocked jsonb;
  layers jsonb := coalesce(p_config -> 'layers', '{}'::jsonb);
  tints jsonb := coalesce(p_config -> 'tints', '{}'::jsonb);
  clean jsonb;
  entry record;
  new_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if jsonb_typeof(layers) <> 'object' or jsonb_typeof(tints) <> 'object' then
    raise exception 'VALIDATION_ERROR: layers and tints must be objects';
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
  'A student saves a customiser build of their own. Validates shape and refuses unearned traits.';

grant execute on function public.avatar_trait_price(text) to authenticated;
grant execute on function public.set_own_avatar_config(uuid, jsonb) to authenticated;
