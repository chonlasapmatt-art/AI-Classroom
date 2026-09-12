import type { ReactElement } from 'react';
import {
  layerOrder,
  type AvatarConfigV2, type AvatarElement, type AvatarRace, type AvatarTints,
  type LayerType, type TraitOption
} from './avatarSchema';
import {
  auras, backAccessories, bottoms, effects, eyeShapes, eyewear, footwear, frontAccessories, handwear,
  hairShapes, headpieces, neckwear, outerwear, px, tops, type Sprite,
  ACCENT, MAGIC, OUTLINE, PRIMARY, SECONDARY, SKIN, SKIN_SHADOW
} from './avatarSprites';

/**
 * The trait tables.
 *
 * Two kinds of row live here. A handful are drawn one by one, because there is nothing to combine
 * them with — the six bodies, one per race. The rest are *composed*: a hairstyle is a shape and
 * something worn on top of it, a face is a pair of eyes and something worn over them, and an outfit
 * is a top and a bottom, which are separate layers and multiply on their own.
 *
 * That is where the counts come from, and none of it is arithmetic dressed as content: every
 * combination has its own id, draws differently from every other, and can be pointed at by a saved
 * config. Fifty hairstyles drawn one at a time would be fifty chances to drift off the grid and off
 * the palette, and most of them would differ from a neighbour by two pixels nobody could name.
 * Twelve shapes and six things to wear on them is the same fifty, drawn once each.
 *
 * ── Ids are a promise ──
 * A config stores a trait id, so renaming one changes what a child is wearing. The ids that existed
 * before composition — `face_neutral`, `face_smile`, `face_focused`, `face_glow`, `face_fangs` — are
 * kept exactly, by giving the empty accessory no suffix rather than renaming everything to
 * `face_neutral__bare`.
 */
export type TraitDraw = () => ReactElement;

export interface Trait extends TraitOption {
  draw: TraitDraw;
}

/*
 * ── body_base ──
 * One silhouette per race, and they are silhouettes rather than costumes: everything a body says
 * about who this is — a snout, a visor, a wisp instead of legs — has to survive at 24 pixels beside
 * thirty-nine others on a leaderboard. Clothes go on top and must not have to know which body they
 * are covering, so every one of these keeps the same torso box (x 6–18, y 17–23) and the same head
 * box (x 7–17, y 6–16) that the legacy figure has always used.
 */
const bodies: Trait[] = [
  {
    id: 'body_human', layer: 'body_base', name: 'มนุษย์', race: ['human'],
    tags: ['human', 'มนุษย์'], tintable: ['skin'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {px(10.5, 16, 3, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_dragonkin', layer: 'body_base', name: 'มังกร', race: ['dragonkin'],
    tags: ['dragon', 'มังกร', 'scale'], tintable: ['skin', 'secondary'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {/* the snout, which is the whole difference at 24 pixels */}
        {px(9.5, 12, 6, 3, SKIN_SHADOW)}
        {px(9.5, 12, 6, 1, SKIN)}
        {px(10, 13.5, 1, 1, OUTLINE)}
        {px(14, 13.5, 1, 1, OUTLINE)}
        {/* scales down the cheek */}
        {px(7, 8, 1, 1, SECONDARY)}
        {px(7, 10, 1, 1, SECONDARY)}
        {px(16, 8, 1, 1, SECONDARY)}
        {px(16, 10, 1, 1, SECONDARY)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_demon', layer: 'body_base', name: 'ปีศาจ', race: ['demon'],
    tags: ['demon', 'tiefling', 'ปีศาจ'], tintable: ['skin', 'magic'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {/* pointed ears, the quiet half of a tiefling; the horns are a headpiece */}
        {px(5.5, 9, 1.5, 3, SKIN)}
        {px(17, 9, 1.5, 3, SKIN)}
        {px(5.5, 9, 1.5, 1, SKIN_SHADOW)}
        {px(17, 9, 1.5, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_beastfolk', layer: 'body_base', name: 'สัตว์', race: ['beastfolk'],
    tags: ['beast', 'สัตว์', 'fox', 'wolf', 'cat'], tintable: ['skin', 'secondary'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(9, 12, 6, 3.5, SECONDARY)}
        {px(10.5, 12.5, 3, 1.5, SKIN)}
        {px(11.5, 12.5, 1.5, 1, OUTLINE)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_spirit', layer: 'body_base', name: 'วิญญาณ', race: ['spirit'],
    tags: ['spirit', 'ghost', 'วิญญาณ'], tintable: ['magic', 'skin'],
    draw: () => (
      <g opacity="0.82">
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 4, MAGIC)}
        {/* no legs: the body frays into three tails, which is the one thing a ghost must not have */}
        {px(6.5, 21, 3, 2, MAGIC)}
        {px(10.5, 21, 3, 2.5, MAGIC)}
        {px(14.5, 21, 3, 2, MAGIC)}
        {px(4.5, 16.5, 1.5, 4, MAGIC)}
        {px(18, 16.5, 1.5, 4, MAGIC)}
      </g>
    )
  },
  {
    id: 'body_robot', layer: 'body_base', name: 'หุ่นยนต์', race: ['robot'],
    tags: ['robot', 'หุ่นยนต์', 'tech'], tintable: ['secondary', 'accent'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SECONDARY)}
        {px(7, 6, 10, 1, 'var(--av-secondary-highlight)')}
        {px(7, 15, 10, 1, 'var(--av-secondary-shadow)')}
        {/* the seam and the vent, which is what stops a square head reading as a box */}
        {px(7, 11, 10, 0.5, OUTLINE)}
        {px(9, 15.5, 6, 1, 'var(--av-secondary-shadow)')}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(9.5, 18.5, 5, 2, ACCENT)}
        {px(4.5, 16.5, 1.5, 5, SECONDARY)}
        {px(18, 16.5, 1.5, 5, SECONDARY)}
      </g>
    )
  }
];

/** The "wearing nothing extra" row of a combining table, which every one of them has. */
const isEmpty = (sprite: Sprite) => sprite.tags.includes('none');

/**
 * Two sprites drawn as one trait, the second over the first.
 *
 * That order is the layering *inside* a layer: a hat goes over hair, a mask over eyes. Where the
 * second is the empty one the id keeps the first's name alone, so every id that existed before
 * composition still resolves to the same drawing.
 */
function compose(
  prefix: string, layer: LayerType, base: Sprite, worn: Sprite,
  tintable: Array<keyof AvatarTints>
): Trait {
  const bare = isEmpty(worn);
  const price = (base.price ?? 0) + (worn.price ?? 0);
  /*
   * What the till sells, which is not what the drawer shows.
   *
   * A composed trait can name two priced things at once, and charging for the pair would mean
   * buying the same hat again for every haircut it is worn with. So ownership is per piece: the
   * base half under its layer prefix, the worn half by its own name. The server prices exactly
   * these two keys and refuses a save that names a piece nobody bought.
   */
  const unlockKeys = [
    ...(base.price ? [`${prefix}_${base.id}`] : []),
    ...(!bare && worn.price ? [worn.id] : [])
  ];
  return {
    id: bare ? `${prefix}_${base.id}` : `${prefix}_${base.id}__${worn.id}`,
    layer,
    name: bare ? base.name : `${base.name} · ${worn.name}`,
    // The empty accessory contributes nothing, not even its own "none" — a short haircut is not a
    // trait that draws nothing, and search should not offer it under "ไม่มี".
    tags: bare ? base.tags : [...new Set([...base.tags, ...worn.tags])],
    tintable,
    ...(price > 0 ? { price } : {}),
    ...(unlockKeys.length > 0 ? { unlockKeys } : {}),
    draw: () => (<g>{base.draw()}{worn.draw()}</g>)
  };
}

/** A sprite that stands alone: clothes, wings, auras. */
function single(
  prefix: string, layer: LayerType, sprite: Sprite,
  tintable: Array<keyof AvatarTints>, element?: AvatarElement
): Trait {
  return {
    id: `${prefix}_${sprite.id}`,
    layer,
    name: sprite.name,
    tags: sprite.tags,
    tintable,
    ...(sprite.price ? { price: sprite.price, unlockKeys: [`${prefix}_${sprite.id}`] } : {}),
    ...(element ? { element } : {}),
    draw: sprite.draw
  };
}

/** An aura or an effect named after an element belongs to it, for the customiser's filters. */
function elementOf(sprite: Sprite): AvatarElement | undefined {
  const known: AvatarElement[] = ['fire', 'ice', 'lightning', 'shadow', 'nature', 'star', 'cyber'];
  return known.find((element) => sprite.id.includes(element) || sprite.tags.includes(element));
}

/** 12 shapes × 6 things worn on the head. */
const hair: Trait[] = hairShapes.flatMap((shape) => headpieces.map(
  (piece) => compose('hair', 'hair_headpiece', shape, piece, ['hair', 'secondary', 'magic', 'accent'])));

/** 12 pairs of eyes × 9 things worn over them. */
const faces: Trait[] = eyeShapes.flatMap((eye) => eyewear.map(
  (worn) => compose('face', 'face_features', eye, worn, ['skin', 'magic', 'accent'])));

/** 25 tops × 6 bottoms, which is 150 outfits out of 31 drawings because they are two layers. */
const topClothing: Trait[] = tops.map((top) => single('top', 'top_clothing', top, ['primary', 'secondary', 'accent', 'magic']));
const bottomClothing: Trait[] = bottoms.map((bottom) => single('bottom', 'bottom_clothing', bottom, ['secondary', 'primary', 'magic']));

/*
 * The four drawers that did not exist.
 *
 * Shoes, gloves, a coat over the shirt, something round the neck. Single sprites rather than
 * composed pairs: there is nothing to wear over a shoe, and inventing a second half for the sake of
 * symmetry would double a count without adding a drawing anybody can see.
 *
 * The tintable list is what the colour drawer offers for each, and it is the garment's own palette
 * rather than the whole six: a shoe reads as leather, canvas or plate, and offering to paint it in
 * the magic colour is offering a choice nobody wants and one more way to end up with a figure that
 * does not hold together.
 */
const footworn: Trait[] = footwear.map((item) => single('foot', 'footwear', item, ['secondary', 'accent', 'primary']));
const handworn: Trait[] = handwear.map((item) => single('hand', 'handwear', item, ['secondary', 'accent', 'magic']));
const outerworn: Trait[] = outerwear.map((item) => single('outer', 'outerwear', item, ['secondary', 'primary', 'accent', 'magic']));
const neckworn: Trait[] = neckwear.map((item) => single('neck', 'neckwear', item, ['accent', 'secondary', 'magic']));

const backWorn: Trait[] = backAccessories.map((item) => single('back', 'back_accessory', item, ['secondary', 'primary', 'accent']));
const frontWorn: Trait[] = frontAccessories.map((item) => single('front', 'front_accessory', item, ['secondary', 'primary', 'accent', 'magic']));
const auraTraits: Trait[] = auras.map((item) => single('aura', 'back_aura', item, ['magic', 'accent', 'secondary'], elementOf(item)));
const effectTraits: Trait[] = effects.map((item) => single('fx', 'front_fx', item, ['magic', 'accent', 'secondary'], elementOf(item)));

export const traits: Trait[] = [
  ...bodies, ...hair, ...faces, ...topClothing, ...bottomClothing,
  ...footworn, ...handworn, ...outerworn, ...neckworn,
  ...backWorn, ...frontWorn, ...auraTraits, ...effectTraits
];

const traitIndex = new Map(traits.map((trait) => [trait.id, trait]));

export function traitById(id: string | undefined | null): Trait | null {
  return id ? traitIndex.get(id) ?? null : null;
}

/*
 * The price list the till reads, one piece at a time.
 *
 * A drawer shows the cost of what is on the tile, which for a composed trait is two pieces added
 * together. Buying is per piece, so this is the other view of the same numbers: the base halves
 * under their layer prefix, the worn halves by their own name, and every one of them priced from
 * the sprite that carries the price. It mirrors `avatar_trait_key_price` on the server, which is
 * the thing that actually charges — and the parity test is what keeps the two honest.
 */
const pieceIndex = new Map<string, number>([
  ...hairShapes.filter((sprite) => sprite.price).map((sprite) => [`hair_${sprite.id}`, sprite.price!] as const),
  ...eyeShapes.filter((sprite) => sprite.price).map((sprite) => [`face_${sprite.id}`, sprite.price!] as const),
  ...tops.filter((sprite) => sprite.price).map((sprite) => [`top_${sprite.id}`, sprite.price!] as const),
  ...bottoms.filter((sprite) => sprite.price).map((sprite) => [`bottom_${sprite.id}`, sprite.price!] as const),
  ...footwear.filter((sprite) => sprite.price).map((sprite) => [`foot_${sprite.id}`, sprite.price!] as const),
  ...handwear.filter((sprite) => sprite.price).map((sprite) => [`hand_${sprite.id}`, sprite.price!] as const),
  ...outerwear.filter((sprite) => sprite.price).map((sprite) => [`outer_${sprite.id}`, sprite.price!] as const),
  ...neckwear.filter((sprite) => sprite.price).map((sprite) => [`neck_${sprite.id}`, sprite.price!] as const),
  ...backAccessories.filter((sprite) => sprite.price).map((sprite) => [`back_${sprite.id}`, sprite.price!] as const),
  ...frontAccessories.filter((sprite) => sprite.price).map((sprite) => [`front_${sprite.id}`, sprite.price!] as const),
  ...auras.filter((sprite) => sprite.price).map((sprite) => [`aura_${sprite.id}`, sprite.price!] as const),
  ...effects.filter((sprite) => sprite.price).map((sprite) => [`fx_${sprite.id}`, sprite.price!] as const),
  // The worn halves keep their own bare names, because a hat is a hat whatever it is worn over.
  ...headpieces.filter((sprite) => sprite.price).map((sprite) => [sprite.id, sprite.price!] as const),
  ...eyewear.filter((sprite) => sprite.price).map((sprite) => [sprite.id, sprite.price!] as const)
]);

/** Points one wardrobe piece costs. Zero for everything that was free from the start. */
export function traitPiecePrice(key: string): number {
  return pieceIndex.get(key) ?? 0;
}

/** Every piece that has a price, cheapest first: the shop's own stock list. */
export function pricedTraitPieces(): Array<{ key: string; price: number }> {
  return [...pieceIndex.entries()]
    .map(([key, price]) => ({ key, price }))
    .sort((left, right) => left.price - right.price || left.key.localeCompare(right.key));
}

/** The pieces of a trait this child does not own yet, in the order they would be bought. */
export function missingPieces(trait: Trait, owned: ReadonlySet<string>): string[] {
  return (trait.unlockKeys ?? []).filter((key) => !owned.has(key));
}

export function traitsForLayer(layer: LayerType, race?: AvatarRace): Trait[] {
  return traits.filter((trait) => trait.layer === layer
    && (!race || !trait.race || trait.race.includes(race)));
}

/** The body a race falls back to when a config names no layer at all. */
export function defaultBodyFor(race: AvatarRace): string {
  return bodies.find((body) => body.race?.includes(race))?.id ?? 'body_human';
}

/**
 * How many options each drawer holds.
 *
 * Computed rather than written down, because the customiser prints these counts on screen — "50+
 * styles", "100+ items" — and a number typed beside a list is a number that stops being true the
 * first time somebody adds to the list.
 */
export function traitCounts(): Record<LayerType, number> {
  const counts = Object.fromEntries(layerOrder.map((layer) => [layer, 0])) as Record<LayerType, number>;
  for (const trait of traits) counts[trait.layer] += 1;
  return counts;
}

/** Which trait fills each layer, once `hides` has had its say. */
export function resolveLayers(config: AvatarConfigV2): Array<[LayerType, string]> {
  const race = config.race ?? 'human';
  const chosen: Partial<Record<LayerType, string>> = {
    body_base: defaultBodyFor(race),
    face_features: 'face_neutral',
    ...(config.layers ?? {})
  };

  const hidden = new Set<LayerType>();
  for (const id of Object.values(chosen)) {
    for (const layer of traitById(id)?.hides ?? []) hidden.add(layer);
  }

  const resolved: Array<[LayerType, string]> = [];
  for (const layer of layerOrder) {
    const id = chosen[layer];
    if (!id || hidden.has(layer)) continue;
    if (!traitById(id)) continue;
    resolved.push([layer, id]);
  }
  return resolved;
}

/**
 * How many different figures the wardrobe can actually make.
 *
 * Not a marketing number: it is the product of the drawers, computed from the tables themselves, so
 * it is right the moment a drawer grows and cannot drift from what is on screen. Layers with nothing
 * in them are skipped rather than multiplying by zero — a drawer that has not been filled yet should
 * not make the whole wardrobe impossible.
 *
 * The count is of *combinations of worn things*: characters, colours and poses are on top of it and
 * are deliberately not multiplied in. A number with the palette folded in would be true and useless,
 * because two figures in different shades of the same outfit are not two looks to a child.
 */
export function wardrobeCombinations(): number {
  const counts = traitCounts();
  return layerOrder.reduce((total, layer) => {
    const options = counts[layer];
    return options > 0 ? total * options : total;
  }, 1);
}

/** The same number, said the way a person says it: "กว่า 4 ล้านแบบ". */
export function wardrobeCombinationsLabel(): string {
  const total = wardrobeCombinations();
  // Past a million million the number stops being information: a child reads it as "as many as
  // I like", which is the true answer, and a seventeen-digit figure is not.
  if (total >= 1_000_000_000_000) return 'มากกว่าล้านล้านแบบ';
  if (total >= 1_000_000_000) return `กว่า ${Math.floor(total / 1_000_000_000)} พันล้านแบบ`;
  if (total >= 1_000_000) return `กว่า ${Math.floor(total / 1_000_000)} ล้านแบบ`;
  if (total >= 1_000) return `กว่า ${Math.floor(total / 1_000)} พันแบบ`;
  return `${total} แบบ`;
}
