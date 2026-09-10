begin;

/*
 * The wardrobe had prices and no till.
 *
 * `avatar_trait_price` has costed every premium piece since the customiser shipped — a wizard hat at
 * 80, dragon wings at 150 — and `set_own_avatar_config` refuses to save a piece that has not been
 * bought. What never existed is the buying: `redeem_outfit` prices its argument with
 * `outfit_price`, which knows four outfits and nothing about traits, so a trait id passed to it came
 * back "already_owned" without ever being added to the wardrobe. Every priced piece in the app was
 * therefore unreachable: shown, costed, and impossible to own.
 *
 * ── What a child buys ──
 * Not a combination. A trait id can name two things at once — `hair_bob__wizardhat` is a haircut and
 * a hat — and charging for the pair would mean buying the same hat again for every haircut it is
 * worn with. So the unit of ownership is the *piece*: the base half (`top_magerobe`) and the worn
 * half (`wizardhat`) are bought separately and each is then wearable with anything.
 *
 * Both live in `avatar_config.unlockedOutfits`, beside the four outfits, because that array already
 * means "what this child has bought" and a second one would be a second thing to keep in step.
 */

/**
 * What one piece costs, whichever half of a trait id it is.
 *
 * `avatar_trait_price` reads a whole trait id and sums its halves, which is the right answer for
 * "may this be worn" and the wrong shape for "what does this cost". Rather than restate both price
 * tables — the guarded mirror of `avatarSprites.tsx`, and the one thing in this system that must not
 * drift — this asks the same function twice: once as a base id, and once as the worn half of a
 * trait whose base is free. Exactly one of those can be non-zero for a real key.
 */
create or replace function public.avatar_trait_key_price(p_key text)
returns integer language sql immutable set search_path to 'public','pg_temp'
as $fn$
  select greatest(
    public.avatar_trait_price(p_key),
    public.avatar_trait_price('hair_short__' || p_key)
  );
$fn$;

comment on function public.avatar_trait_key_price(text) is
  'Points one wardrobe piece costs, whether it is a base trait id or the worn half of one.';

revoke all on function public.avatar_trait_key_price(text) from public, anon;
grant execute on function public.avatar_trait_key_price(text) to authenticated;

/**
 * Buys one wardrobe piece for the child making the request, and nobody else.
 *
 * The same shape as `redeem_outfit` and for the same reason: the price and the balance are both read
 * here rather than sent, so a device may ask to buy and that is all it may do. Buying twice is not
 * an error and does not charge twice — a second press, a retried request, two tabs — it reports the
 * piece as already owned, which keeps the operation safe to repeat.
 */
create or replace function public.redeem_avatar_trait(p_school_id uuid, p_key text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  actor uuid := auth.uid();
  target public.students%rowtype;
  price integer;
  earned integer;
  spent integer;
  owned jsonb;
  new_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  -- The same shape the config validator accepts, so nothing can be bought that cannot be worn.
  if p_key !~ '^[a-z][a-z0-9_]{0,47}$' then raise exception 'VALIDATION_ERROR: unknown piece'; end if;

  select * into target from public.students
  where school_id = p_school_id and profile_id = actor and deleted_at is null
  for update;
  if not found then raise exception 'NOT_FOUND: no student record of your own in this school'; end if;

  price := public.avatar_trait_key_price(p_key);
  owned := coalesce(target.avatar_config -> 'unlockedOutfits', '[]'::jsonb);
  spent := coalesce((target.avatar_config ->> 'spentPoints')::integer, 0);

  -- Free from the start, or bought already: either way there is nothing to charge.
  if price = 0 or owned @> to_jsonb(p_key) then
    return jsonb_build_object('piece', p_key, 'status', 'already_owned', 'spent', spent);
  end if;

  earned := public.student_points_earned(target.id);
  if earned - spent < price then
    raise exception 'INSUFFICIENT_POINTS: % needed, % available', price, earned - spent using errcode='22000';
  end if;

  update public.students set
    avatar_config = coalesce(avatar_config, '{}'::jsonb) || jsonb_build_object(
      'unlockedOutfits', owned || to_jsonb(p_key),
      'spentPoints', spent + price
    ),
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id
  returning version into new_version;
  -- Devices learn what changed from the journal; a purchase nobody announces is a wardrobe that
  -- exists only on the tab that bought it.
  perform public.journal_sync_change(p_school_id, 'student', target.id, 'upsert', new_version);

  return jsonb_build_object('piece', p_key, 'status', 'purchased', 'price', price, 'spent', spent + price);
end $fn$;

comment on function public.redeem_avatar_trait(uuid, text) is
  'A student spends their own points on one wardrobe piece. Price and balance are read server-side.';

revoke all on function public.redeem_avatar_trait(uuid, text) from public, anon;
grant execute on function public.redeem_avatar_trait(uuid, text) to authenticated;

/*
 * And the save now asks the question the till answers.
 *
 * The check was "is this whole trait id in the wardrobe", which nothing could ever put there. It is
 * now "is each priced half of it in the wardrobe" — the halves being what `redeem_avatar_trait`
 * sells — so a hat bought once is a hat that can be worn with every haircut.
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
  piece text;
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

  -- Every trait named has to look like a trait id, and every priced piece in it has to be owned.
  for entry in select key, value from jsonb_each_text(layers) loop
    if entry.key !~ '^[a-z][a-z_]{0,23}$' or entry.value !~ '^[a-z][a-z0-9_]{0,47}(__[a-z][a-z0-9_]{0,47})?$' then
      raise exception 'VALIDATION_ERROR: unknown trait';
    end if;
    foreach piece in array array[
      split_part(entry.value, '__', 1),
      nullif(split_part(entry.value, '__', 2), '')
    ] loop
      if piece is not null
         and public.avatar_trait_key_price(piece) > 0
         and not unlocked @> to_jsonb(piece) then
        raise exception 'TRAIT_LOCKED: % has not been redeemed', piece using errcode='42501';
      end if;
    end loop;
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
   * `unlockedOutfits` and `spentPoints` are the purse, written by the two redeem functions alone.
   * Building the object from scratch here rather than merging what arrived is what stops a crafted
   * request granting itself a wardrobe.
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
  'A student saves a customiser build of their own. Validates shape, body and every priced piece.';

grant execute on function public.set_own_avatar_config(uuid, jsonb) to authenticated;

commit;
