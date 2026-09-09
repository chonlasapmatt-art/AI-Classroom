-- A child exchanges points for something to wear, and the server decides whether they can.
--
-- Earning is computed rather than recorded, from the two things that already say what a child has
-- earned: their register marks, and the append-only ledger of points a teacher gave them. Nothing
-- new is stored for either, so editing a register -- a child marked absent turns out to have been at
-- the dentist -- simply makes the total correct rather than needing an offsetting entry to chase it.
--
-- Spending is the one part that cannot be recomputed from anything else, so it is written down: on
-- the child's own avatar record, which is the one row a student is allowed to write. That is exactly
-- why the price cannot be a parameter. A device asking to buy a lab coat for nothing must be refused
-- by something that is not the device, so the price list lives here and `avatarOutfits.ts` is
-- checked against it by a test.

/**
 * What one child has earned: two points for every day they came, one for every day they came late.
 *
 * Illness and family leave earn nothing and cost nothing -- being ill is not a failure of conduct
 * and a scheme that docked points for it would teach children to come in sick. Coming late still
 * earns, because a child who is late has come, and paying nothing for arriving at 08:40 teaches
 * them to stay away instead.
 */
create or replace function public.student_points_earned(p_student_id uuid)
returns integer language sql stable security definer set search_path to 'public','pg_temp'
as $fn$
  select greatest(0, coalesce((
    select sum(case a.status when 'present' then 2 when 'late' then 1 else 0 end)
    from public.attendance a
    where a.student_id = p_student_id and a.deleted_at is null
  ), 0) + greatest(0, floor(coalesce((
    select sum(e.points) from public.score_events e
    where e.student_id = p_student_id and e.deleted_at is null
  ), 0)))::integer);
$fn$;

/** The price list. The app's catalogue must agree with it, and a test says so. */
create or replace function public.outfit_price(p_outfit text)
returns integer language sql immutable
as $fn$
  select case p_outfit
    when 'blazer' then 20
    when 'apron' then 40
    when 'dungarees' then 60
    when 'labcoat' then 100
    else 0
  end;
$fn$;

/**
 * Buys one outfit for the child making the request, and nobody else.
 *
 * The whole point of this being a definer function is that the price and the balance are both read
 * here rather than sent: a device may ask to buy, and that is all it may do. Buying twice is not an
 * error and does not charge twice -- a second press, a retried request, two tabs -- it simply
 * reports the outfit as already owned, which keeps the operation safe to repeat.
 */
create or replace function public.redeem_outfit(p_school_id uuid, p_outfit text)
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
  if p_outfit !~ '^[a-z][a-z0-9_-]{0,31}$' then raise exception 'VALIDATION_ERROR: unknown outfit'; end if;

  select * into target from public.students
  where school_id = p_school_id and profile_id = actor and deleted_at is null
  for update;
  if not found then raise exception 'NOT_FOUND: no student record of your own in this school'; end if;

  price := public.outfit_price(p_outfit);
  owned := coalesce(target.avatar_config -> 'unlockedOutfits', '[]'::jsonb);
  spent := coalesce((target.avatar_config ->> 'spentPoints')::integer, 0);

  -- Free from the start, or bought already: either way there is nothing to charge.
  if price = 0 or owned @> to_jsonb(p_outfit) then
    return jsonb_build_object('outfit', p_outfit, 'status', 'already_owned', 'spent', spent);
  end if;

  earned := public.student_points_earned(target.id);
  if earned - spent < price then
    raise exception 'INSUFFICIENT_POINTS: % needed, % available', price, earned - spent using errcode='22000';
  end if;

  update public.students set
    avatar_config = coalesce(avatar_config, '{}'::jsonb) || jsonb_build_object(
      'unlockedOutfits', owned || to_jsonb(p_outfit),
      'spentPoints', spent + price
    ),
    updated_at = clock_timestamp(), server_updated_at = clock_timestamp(), version = version + 1
  where id = target.id
  returning version into new_version;
  -- Devices learn what changed from the journal; a purchase that is not announced is a wardrobe
  -- that only exists on the tab that bought it.
  perform public.journal_sync_change(p_school_id, 'student', target.id, 'upsert', new_version);

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, target_student_id, after_json)
  values (p_school_id, actor, 'OUTFIT_REDEEMED', 'student', target.id, target.id,
    jsonb_build_object('outfit', p_outfit, 'price', price, 'spentAfter', spent + price));

  return jsonb_build_object('outfit', p_outfit, 'status', 'redeemed', 'price', price, 'spent', spent + price);
end $fn$;

grant execute on function public.redeem_outfit(uuid, text) to authenticated;
revoke all on function public.student_points_earned(uuid) from public;
revoke all on function public.student_points_earned(uuid) from anon;

-- Choosing an outfit already worked; it just never told the other devices about it.
create or replace function public.set_own_outfit(p_school_id uuid, p_outfit text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare actor uuid := auth.uid(); target public.students%rowtype; new_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  -- The catalogue of outfits lives in the app, so the rule here is the shape of an id rather than a
  -- list of them: lower-case, short, and nothing that could be read as anything but a name.
  if p_outfit !~ '^[a-z][a-z0-9_-]{0,31}$' then raise exception 'VALIDATION_ERROR: unknown outfit'; end if;

  select * into target from public.students
  where school_id = p_school_id and profile_id = actor and deleted_at is null
  for update;
  if not found then raise exception 'NOT_FOUND: no student record of your own in this school'; end if;

  -- Wearing a priced outfit requires having bought it. Having enough points is not the same as
  -- having spent them, or a child would own the wardrobe the day they could afford one of it.
  if public.outfit_price(p_outfit) > 0
    and not coalesce(target.avatar_config -> 'unlockedOutfits', '[]'::jsonb) @> to_jsonb(p_outfit) then
    raise exception 'OUTFIT_LOCKED: this outfit has not been redeemed' using errcode='42501';
  end if;

  update public.students
  set avatar_config = coalesce(avatar_config, '{}'::jsonb) || jsonb_build_object('outfit', p_outfit),
      updated_at = clock_timestamp(),
      server_updated_at = clock_timestamp(),
      version = version + 1
  where id = target.id
  returning version into new_version;
  perform public.journal_sync_change(p_school_id, 'student', target.id, 'upsert', new_version);

  return jsonb_build_object('outfit', p_outfit);
end $fn$;
