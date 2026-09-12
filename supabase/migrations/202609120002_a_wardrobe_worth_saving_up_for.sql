-- A wardrobe worth saving up for, and what the server charges for it.
--
-- The customiser gained nine tops, four bottoms and thirty-one reward pieces: streetwear, layered
-- plate with pauldrons, an exoskeleton rig, and an epic-and-legendary tier that carries floating
-- familiars, ambient light bands and trailing stardust. Thirty-four tops against ten bottoms is
-- three hundred and forty outfits, and the reward tier is what a child is saving towards.
--
-- A price the app knows but the server does not is a price nobody pays: the request to wear a thing
-- comes from the child's own browser, and "the client said it was free" is not a permission check.
--
-- `avatar_trait_price` is replaced whole rather than patched, for the reason the last replacement
-- gave: the function is a single `case` over the trait id, so there is nothing to add to. A second
-- function handling only the new ids would have to be consulted by everything that consults this
-- one, and the first caller to forget would silently hand out the expensive half of the wardrobe.
--
-- Every id that existed before keeps the price it had, to the point: a child who saved up for a pair
-- of dragon wings last term still owns dragon wings at 150. The parity test beside the app walks
-- whichever migration defines this function last, so it is reading this file from the moment it
-- lands.

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
  -- The base half: an eye shape, a haircut, a top, a pair of wings. Absent from here is free, and
  -- most of the wardrobe is absent from here on purpose — a shop where everything is locked is a
  -- shop that tells a new child they are dressed wrong.
  base_price as (
    select case split_part((select base from parts), '_', 1) || ':' ||
                substr((select base from parts), position('_' in (select base from parts)) + 1)
      when 'face:fangs' then 30
      when 'bottom:robehem' then 40
      when 'fx:sparkle' then 40
      when 'top:hoodiedrape' then 40
      when 'back:banner' then 50
      when 'bottom:cargo' then 50
      when 'face:star' then 50
      when 'fx:smokepuff' then 50
      when 'hair:hime' then 50
      when 'top:puffer' then 50
      when 'back:cape' then 60
      when 'back:wolftail' then 60
      when 'bottom:techpants' then 60
      when 'face:glow' then 60
      when 'front:lantern' then 60
      when 'fx:leaffall' then 60
      when 'hair:dreadlocks' then 60
      when 'top:druidwrap' then 60
      when 'top:kimono' then 60
      when 'top:varsity' then 60
      when 'back:spadetail' then 70
      when 'bottom:layeredskirt' then 70
      when 'face:cyber' then 70
      when 'fx:gridline' then 70
      when 'top:pirate' then 70
      when 'top:steamvest' then 70
      when 'back:shield' then 80
      when 'bottom:greaves' then 80
      when 'fx:motes' then 80
      when 'top:magerobe' then 80
      when 'aura:nature' then 90
      when 'aura:star' then 90
      when 'back:dragontail' then 90
      when 'front:orb' then 90
      when 'fx:flameorb' then 90
      when 'hair:cybercords' then 90
      when 'top:ninjagi' then 90
      when 'top:techwear' then 90
      when 'aura:fire' then 100
      when 'aura:ice' then 100
      when 'front:petbird' then 100
      when 'front:sword' then 100
      when 'fx:arc' then 100
      when 'fx:snowfall' then 100
      when 'top:runichood' then 100
      when 'aura:lightning' then 110
      when 'aura:shadow' then 110
      when 'back:tome' then 110
      when 'bottom:exogreaves' then 110
      when 'front:staff' then 110
      when 'fx:petalfall' then 110
      when 'top:spacesuit' then 110
      when 'aura:bloom' then 120
      when 'aura:cyber' then 120
      when 'back:batwings' then 120
      when 'front:neonfan' then 120
      when 'front:petcat' then 120
      when 'fx:glitch' then 120
      when 'hair:flame' then 120
      when 'top:chestplate' then 120
      when 'top:hazardcoat' then 120
      when 'aura:ember' then 130
      when 'back:foxtails' then 130
      when 'back:jetpack' then 130
      when 'bottom:platelegs' then 130
      when 'fx:neonstreak' then 130
      when 'aura:frostring' then 140
      when 'back:angelwings' then 140
      when 'front:chronowatch' then 140
      when 'fx:emberrise' then 140
      when 'hair:crystal' then 140
      when 'top:wizardrobe' then 140
      when 'aura:circuit' then 150
      when 'back:aurorasash' then 150
      when 'back:dragonwings' then 150
      when 'front:starlantern' then 150
      when 'fx:runeglyphs' then 150
      when 'top:circuitjacket' then 150
      when 'aura:prism' then 160
      when 'back:gearhalo' then 160
      when 'front:hologlobe' then 160
      when 'fx:stardust' then 160
      when 'top:feathercloak' then 160
      when 'aura:void' then 170
      when 'back:crystalspire' then 170
      when 'front:familiarwisp' then 170
      when 'fx:halolight' then 170
      when 'top:exorig' then 170
      when 'aura:aurora' then 180
      when 'back:stardusttrail' then 180
      when 'top:platelayered' then 180
      when 'aura:solar' then 190
      when 'back:voidcloak' then 190
      when 'front:runeblade' then 190
      when 'back:prismwings' then 200
      when 'back:runicfamiliar' then 200
      when 'back:phoenixplume' then 210
      when 'front:petdrake' then 220
      else 0 end
  ),
  -- The worn half: what is on top of the hair, or over the eyes. Priced separately because a
  -- composed trait names two things at once, and charging for the pair would mean buying the same
  -- hat again for every haircut it goes with.
  worn_price as (
    select case (select worn from parts)
      when 'beastears' then 30
      when 'eyepatch' then 40
      when 'hornscurved' then 40
      when 'monocle' then 50
      when 'catbeanie' then 60
      when 'goggles' then 60
      when 'hornsdragon' then 60
      when 'headset' then 70
      when 'visor' then 70
      when 'starshades' then 80
      when 'wizardhat' then 80
      when 'cybermask' then 90
      when 'halo' then 100
      when 'scouter' then 100
      when 'cybervisor' then 110
      when 'antlers' then 130
      when 'gasmask' then 150
      when 'crown' then 220
      else 0 end
  )
  select (select * from base_price) + (select * from worn_price);
$fn$;

comment on function public.avatar_trait_price(text) is
  'Points a customiser trait costs, computed from its id. Mirrors avatarTraits.tsx; guarded by a test.';
