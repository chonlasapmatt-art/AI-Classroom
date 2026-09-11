-- More to wear on a head, and what the server charges for it.
--
-- The wardrobe gained twelve haircuts and six things worn over them. Twenty-four cuts by twelve
-- headpieces is two hundred and eighty-eight hairstyles — every one with its own id, its own drawing
-- and its own price — and a price the app knows but the server does not is a price nobody pays: the
-- request to wear a thing comes from the child's own browser, and "the client said it was free" is
-- not a permission check.
--
-- `avatar_trait_price` is replaced whole rather than patched. The function is a single `case` over
-- the trait id, so there is nothing to add to: a second function that handled only the new ids would
-- have to be consulted by everything that consults this one, and the first caller to forget would
-- silently hand out the expensive half of the wardrobe. Replacing a function in a new migration is
-- the repair path this repository already uses, and the parity test walks whichever migration
-- defines it last.
--
-- Nothing else changes. The ids that existed before keep the prices they had, to the point: a child
-- who saved up for a pair of dragon wings last term still owns dragon wings at 150.

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
  -- The base half: an eye shape, a haircut, a top, a pair of wings. Absent from here is free.
  base_price as (
    select case split_part((select base from parts), '_', 1) || ':' ||
                substr((select base from parts), position('_' in (select base from parts)) + 1)
      when 'face:glow' then 60
      when 'face:fangs' then 30
      when 'face:star' then 50
      when 'face:cyber' then 70
      -- The haircuts that cost something. The first twelve are free and stay free: a child who has
      -- earned nothing yet must still be able to have hair.
      when 'hair:dreadlocks' then 60
      when 'hair:cybercords' then 90
      when 'hair:flame' then 120
      when 'hair:crystal' then 140
      when 'hair:hime' then 50
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
      when 'cybervisor' then 110
      when 'catbeanie' then 60
      when 'headset' then 70
      when 'crown' then 220
      when 'gasmask' then 150
      when 'antlers' then 130
      when 'visor' then 70
      when 'cybermask' then 90
      when 'eyepatch' then 40
      when 'goggles' then 60
      when 'monocle' then 50
      when 'starshades' then 80
      when 'scouter' then 100
      else 0 end
  )
  select (select * from base_price) + (select * from worn_price);
$fn$;

comment on function public.avatar_trait_price(text) is
  'Points a customiser trait costs, computed from its id. Mirrors avatarTraits.tsx; guarded by a test.';
