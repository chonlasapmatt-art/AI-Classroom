import type { ReactElement } from 'react';
import {
  px,
  ACCENT, HAIR, MAGIC, MAGIC_HIGHLIGHT, OUTLINE,
  PRIMARY, PRIMARY_HIGHLIGHT, PRIMARY_SHADOW, SECONDARY, SECONDARY_SHADOW,
  SKIN, WHITE
} from './avatarSprites';
import {
  backArm, batWings, bodySlotOrder, brimHat, bushyTail, cape, catTail, demonHorns, demonTail,
  earShape, faceFeatures, flameOrbs, flipperArm, frontArm, groundShadow, headShape, hornedHelm, legsSneakers,
  legsStanding, legsWebbed, robedLegs, scaledTail, shield, spellAura,
  staff, sword, torsoRound, torsoShirt,
  type BodySlot, type EarStyle, type SnoutStyle
} from './avatarFullBody';
import { hairFor, hairStyleDefinitions } from './avatarHair';
import { directionRig, type DirectionRig } from './avatarDirection';
import type { AvatarConfigV2, AvatarRace, LayerType } from './avatarSchema';

/**
 * The figure, assembled from what a child actually chose.
 *
 * ── The problem this solves ──
 * There were two avatars in this product and only one of them could be customised. The bust drew
 * every trait a child owned — a labcoat, a wizard hat, a pair of goggles, a fox's tails — on a
 * 24-unit grid, and the figure drew ten fixed costumes on a 48-unit grid with no idea any of those
 * traits existed. So the customiser's drawers changed the portrait in a class list and left the
 * character on the stage exactly as it was, which is the same as saying the drawers did nothing.
 *
 * This is the bridge, and it is deliberately a *translation* rather than a second wardrobe: the
 * vocabulary stays the trait ids that are already stored in `avatar_config.layers`, already priced
 * by `avatar_trait_price` on the server, already refused when unearned, and already covered by the
 * parity test. Nothing here invents an id. Everything here answers one question — what does
 * `top_labcoat` look like on a body with legs — and answers it inside the band that slot owns.
 *
 * ── Why families rather than one drawing per id ──
 * Twenty-five tops as twenty-five bespoke functions is twenty-five chances to drift off the palette
 * and off the grid, and at 48 units across, `sweater` and `scarfcoat` differ by details nobody can
 * see. So a top is a *shape* (how the garment is cut) plus its *marks* (collar, placket, belt,
 * emblem), and the twenty-five ids are twenty-five combinations of those, each visibly its own
 * garment and none of them able to leave the torso box. The same holds for legs, hair and the rest.
 *
 * ── The band rules, restated because everything here depends on them ──
 *   head and face   y  3 – 21     hair and headwear may reach y 0
 *   torso and arms  y 21 – 35
 *   legs and feet   y 35 – 46, and the feet must reach 46 or the figure hovers
 *   back and front  anywhere, but never over the face
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Torsos — y 21 to 35
 *
 * One cut, then its marks. `sleeve` is what the arms are told to wear, so a labcoat's arms are white
 * and a jersey's are the team colour without either of them knowing what a torso is.
 * ──────────────────────────────────────────────────────────────────────────── */

interface TopShape {
  /** The garment body. */
  cloth: string;
  /** What the sleeves are cut from, handed to the arms. */
  sleeve: string;
  /** Drawn over the cloth: collar, placket, belt, emblem. */
  marks?: ReactElement;
  /** Wide, for a coat or a hoodie; the standard box otherwise. */
  wide?: boolean;
  /** A hem below the waist — a coat, a robe — drawn into the torso band's bottom. */
  skirt?: string;
}

function topFrom({ cloth, marks, wide, skirt }: TopShape): ReactElement {
  const x = wide ? 15.5 : 17;
  const width = wide ? 17 : 14;
  return (
    <g data-part="torso">
      {px(x, 21, width, 12, cloth)}
      {px(x, 21, width, 1.5, PRIMARY_HIGHLIGHT)}
      {px(x + width - 1.5, 22.5, 1.5, 9, PRIMARY_SHADOW)}
      {px(x, 31.5, width, 1.5, PRIMARY_SHADOW)}
      {skirt ? (
        <>
          {px(x - 0.5, 32.5, width + 1, 3, skirt)}
          {px(x - 0.5, 34.5, width + 1, 1, SECONDARY_SHADOW)}
        </>
      ) : null}
      {marks ?? null}
    </g>
  );
}

/** A collar in white, which is what makes a uniform a uniform. */
const collarMarks = (accent = ACCENT): ReactElement => (
  <>
    {px(21, 21, 6, 2, WHITE)}
    {px(23.5, 21, 1, 4, SECONDARY)}
    {px(17, 26, 14, 1, accent)}
  </>
);

const hoodMarks = (): ReactElement => (
  <>
    {px(20, 21, 8, 2.5, SECONDARY)}
    {px(21.5, 23, 1, 4.5, WHITE)}
    {px(26, 23, 1, 4.5, WHITE)}
    {px(18, 28, 12, 4.5, SECONDARY_SHADOW)}
    {px(18, 28, 12, 0.75, ACCENT)}
  </>
);

const plateMarks = (): ReactElement => (
  <>
    {px(16, 22, 4, 4, SECONDARY)}
    {px(28, 22, 4, 4, SECONDARY)}
    {px(23, 23, 2, 9, SECONDARY_SHADOW)}
    {px(20, 27, 8, 1, ACCENT)}
  </>
);

const lapelMarks = (lapel: string): ReactElement => (
  <>
    <polygon points="21,21 24,26 24,21" fill={lapel} />
    <polygon points="27,21 24,26 24,21" fill={lapel} />
    {px(23.5, 26, 1, 6, SECONDARY_SHADOW)}
    {px(21, 29, 6, 1, ACCENT)}
  </>
);

const numberMarks = (): ReactElement => (
  <>
    {px(19, 21, 10, 1.5, SECONDARY)}
    {px(22, 24, 4, 5, WHITE)}
    {px(23, 25.5, 2, 2, SECONDARY)}
  </>
);

const apronMarks = (): ReactElement => (
  <>
    {px(20, 22, 8, 10, WHITE)}
    {px(20, 22, 8, 0.75, SECONDARY_SHADOW)}
    {px(19.5, 26, 9, 0.75, ACCENT)}
  </>
);

/*
 * The same apron, for a coat that is already white.
 *
 * A white apron on a white coat is an apron nobody can see, which is what the chef and the surgeon
 * both wore. This one is drawn as its edges — a hem, a bib line and the tie — so the garment reads
 * by its outline rather than by its fill.
 */
const whiteApronMarks = (): ReactElement => (
  <>
    {px(19.5, 22, 9, 0.75, SECONDARY_SHADOW)}
    {px(19.5, 22, 0.75, 10, SECONDARY_SHADOW)}
    {px(27.75, 22, 0.75, 10, SECONDARY_SHADOW)}
    {px(19.5, 31.25, 9, 0.75, SECONDARY_SHADOW)}
    {px(17, 26, 14, 1, ACCENT)}
    {px(23, 26, 2, 3, ACCENT)}
  </>
);

const stoleMarks = (): ReactElement => (
  <>
    {px(20, 21, 3, 12, SECONDARY)}
    {px(25, 21, 3, 12, SECONDARY)}
    {px(22.5, 22, 3, 3, ACCENT)}
  </>
);

const runicMarks = (): ReactElement => (
  <>
    {px(19, 21, 10, 2, SECONDARY_SHADOW)}
    {px(22, 24, 4, 4, MAGIC)}
    {px(23, 25, 2, 2, MAGIC_HIGHLIGHT)}
    {px(18, 30, 12, 1, MAGIC)}
  </>
);

const techMarks = (): ReactElement => (
  <>
    {px(16.5, 22, 15, 1, MAGIC)}
    {px(18, 25, 5, 3, SECONDARY_SHADOW)}
    {px(19, 26, 3, 1, MAGIC_HIGHLIGHT)}
    {px(25, 24, 5, 6, SECONDARY_SHADOW)}
    {px(26, 28, 3, 1, ACCENT)}
  </>
);

const vestMarks = (): ReactElement => (
  <>
    {px(19, 21, 4, 12, SECONDARY)}
    {px(25, 21, 4, 12, SECONDARY)}
    {px(23, 24, 2, 2, ACCENT)}
    {px(23, 28, 2, 2, ACCENT)}
  </>
);

const wrapMarks = (): ReactElement => (
  <>
    <polygon points="17,21 31,21 24,31" fill={SECONDARY} />
    <polygon points="17,21 24,21 24,27" fill={SECONDARY_SHADOW} />
    {px(17, 30, 14, 2, ACCENT)}
  </>
);

const sashMarks = (): ReactElement => (
  <>
    <polygon points="17,22 31,26 31,29 17,25" fill={SECONDARY} />
    {px(17, 30, 14, 1.5, ACCENT)}
  </>
);

const strapMarks = (): ReactElement => (
  <>
    {px(18, 21, 2.5, 12, SECONDARY)}
    {px(21, 25, 9, 4, SECONDARY_SHADOW)}
    {px(21.5, 26, 3, 1, ACCENT)}
  </>
);

const suitMarks = (): ReactElement => (
  <>
    {px(17, 21, 14, 2, WHITE)}
    {px(20, 24, 8, 5, MAGIC)}
    {px(21, 25, 6, 2, MAGIC_HIGHLIGHT)}
    {px(17, 30, 14, 1.5, SECONDARY)}
  </>
);

const scarfMarks = (): ReactElement => (
  <>
    {px(19, 21, 10, 3, SECONDARY)}
    {px(20, 23.5, 3, 6, SECONDARY_SHADOW)}
    {px(17, 27, 14, 1, ACCENT)}
  </>
);

const knitMarks = (): ReactElement => (
  <>
    {px(17, 23, 14, 1, PRIMARY_SHADOW)}
    {px(17, 27, 14, 1, PRIMARY_SHADOW)}
    {px(17, 31, 14, 1, PRIMARY_SHADOW)}
    {px(20, 21, 8, 1.5, SECONDARY)}
  </>
);

/**
 * The tops, by id.
 *
 * Every id in `avatarSprites.tops` has a row here, because a garment a child owns and cannot see on
 * the figure is a garment that does not exist. The `sleeve` column is why a labcoat has white arms.
 */
const tops: Record<string, TopShape> = {
  uniform: { cloth: PRIMARY, sleeve: PRIMARY, marks: collarMarks() },
  collar: { cloth: PRIMARY, sleeve: PRIMARY, marks: collarMarks(SECONDARY) },
  hoodie: { cloth: PRIMARY, sleeve: PRIMARY, marks: hoodMarks(), wide: true },
  blazer: { cloth: SECONDARY, sleeve: SECONDARY, marks: lapelMarks(PRIMARY) },
  jersey: { cloth: PRIMARY, sleeve: ACCENT, marks: numberMarks() },
  labcoat: { cloth: WHITE, sleeve: WHITE, marks: lapelMarks(PRIMARY), wide: true, skirt: WHITE },
  apron: { cloth: PRIMARY, sleeve: SKIN, marks: apronMarks() },
  magerobe: { cloth: PRIMARY, sleeve: PRIMARY, marks: stoleMarks(), skirt: PRIMARY },
  runichood: { cloth: SECONDARY, sleeve: SECONDARY, marks: runicMarks(), wide: true, skirt: SECONDARY },
  chestplate: { cloth: SECONDARY, sleeve: SECONDARY, marks: plateMarks() },
  techwear: { cloth: SECONDARY, sleeve: SECONDARY, marks: techMarks(), wide: true },
  streetwear: { cloth: PRIMARY, sleeve: PRIMARY, marks: hoodMarks(), wide: true },
  steamvest: { cloth: SECONDARY, sleeve: SKIN, marks: vestMarks() },
  kimono: { cloth: PRIMARY, sleeve: PRIMARY, marks: wrapMarks(), wide: true, skirt: PRIMARY },
  poncho: { cloth: PRIMARY, sleeve: SKIN, marks: sashMarks(), wide: true, skirt: SECONDARY },
  tanktop: { cloth: PRIMARY, sleeve: SKIN, marks: strapMarks() },
  sweater: { cloth: PRIMARY, sleeve: PRIMARY, marks: knitMarks() },
  raincoat: { cloth: ACCENT, sleeve: ACCENT, marks: hoodMarks(), wide: true, skirt: ACCENT },
  scarfcoat: { cloth: SECONDARY, sleeve: SECONDARY, marks: scarfMarks(), wide: true },
  bandmember: { cloth: SECONDARY, sleeve: SECONDARY, marks: numberMarks() },
  chefcoat: { cloth: WHITE, sleeve: WHITE, marks: whiteApronMarks() },
  ninjagi: { cloth: SECONDARY_SHADOW, sleeve: SECONDARY_SHADOW, marks: sashMarks() },
  pirate: { cloth: WHITE, sleeve: WHITE, marks: vestMarks() },
  spacesuit: { cloth: WHITE, sleeve: WHITE, marks: suitMarks(), wide: true },
  druidwrap: { cloth: PRIMARY, sleeve: SKIN, marks: wrapMarks(), skirt: SECONDARY }
};

/** What the sleeves are cut from, so an arm never has to know which garment it belongs to. */
export function sleeveFor(topId: string | undefined): string {
  const shape = topId ? tops[baseOf(topId)] : undefined;
  return shape?.sleeve ?? PRIMARY;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Legs — y 35 to 46, feet on the floor at 46
 * ──────────────────────────────────────────────────────────────────────────── */

const legStyles: Record<string, () => ReactElement> = {
  trousers: () => legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }),
  skirt: () => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25.5, 39, 4, 4, SKIN)}{px(25, 43, 5, 2.5, SECONDARY)}{px(25, 45.5, 5, 0.5, OUTLINE)}</g>
      <g data-part="frontLeg">{px(18.5, 39, 4, 4, SKIN)}{px(18, 43, 5, 2.5, SECONDARY)}{px(18, 45.5, 5, 0.5, OUTLINE)}</g>
      {/* The skirt itself, flaring from the waist and stopping above the knee. */}
      <polygon points="17,35 31,35 33,40 15,40" fill={PRIMARY} />
      <polygon points="17,35 24,35 24,40 15,40" fill={PRIMARY_HIGHLIGHT} opacity="0.35" />
      {px(15, 39.5, 18, 1, SECONDARY)}
    </g>
  ),
  shorts: () => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25, 35, 5, 4, PRIMARY)}{px(25.5, 39, 4, 4, SKIN)}{px(25, 43, 5, 2.5, ACCENT)}{px(25, 45.5, 5, 0.5, OUTLINE)}</g>
      <g data-part="frontLeg">{px(18, 35, 5, 4, PRIMARY)}{px(18.5, 39, 4, 4, SKIN)}{px(18, 43, 5, 2.5, ACCENT)}{px(18, 45.5, 5, 0.5, OUTLINE)}</g>
    </g>
  ),
  robehem: () => robedLegs({ boot: ACCENT, trouser: SECONDARY, skin: SKIN }),
  greaves: () => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25, 35, 5, 5, SECONDARY)}{px(25, 40, 5, 3, SECONDARY_SHADOW)}{px(24.5, 43, 6, 3, SECONDARY)}{px(24.5, 43, 6, 0.75, ACCENT)}{px(24, 45.5, 7, 0.5, OUTLINE)}</g>
      <g data-part="frontLeg">{px(18, 35, 5, 5, SECONDARY)}{px(18, 40, 5, 3, SECONDARY_SHADOW)}{px(17.5, 43, 6, 3, SECONDARY)}{px(17.5, 43, 6, 0.75, ACCENT)}{px(17, 45.5, 7, 0.5, OUTLINE)}</g>
    </g>
  ),
  techpants: () => legsSneakers({ boot: SECONDARY, trouser: SECONDARY, skin: SKIN })
};

/* ────────────────────────────────────────────────────────────────────────────
 * Back — wings, tails, and things carried behind
 * ──────────────────────────────────────────────────────────────────────────── */

function featheredWings(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="17,22 6,17 8,28 17,30" fill={WHITE} />
      <polygon points="31,22 42,17 40,28 31,30" fill={WHITE} />
      <polygon points="17,24 9,21 10,27 17,28" fill={SECONDARY_SHADOW} opacity="0.35" />
      <polygon points="31,24 39,21 38,27 31,28" fill={SECONDARY_SHADOW} opacity="0.35" />
    </g>
  );
}

function dragonWings(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="17,21 4,14 5,30 17,31" fill={SECONDARY} />
      <polygon points="31,21 44,14 43,30 31,31" fill={SECONDARY} />
      <polygon points="17,23 8,19 8,28 17,29" fill={SECONDARY_SHADOW} />
      <polygon points="31,23 40,19 40,28 31,29" fill={SECONDARY_SHADOW} />
      {px(5, 20, 12, 0.75, ACCENT)}
      {px(31, 20, 12, 0.75, ACCENT)}
    </g>
  );
}

function backpack(): ReactElement {
  return (
    <g data-part="back">
      {px(31, 22, 6, 9, SECONDARY)}
      {px(31, 22, 6, 1.5, SECONDARY_SHADOW)}
      {px(32, 25, 4, 3, ACCENT)}
      {px(29, 23, 2, 7, SECONDARY_SHADOW)}
    </g>
  );
}

function tome(): ReactElement {
  return (
    <g data-part="back">
      {px(32, 24, 7, 8, SECONDARY)}
      {px(32, 24, 7, 1, MAGIC)}
      {px(33, 26, 5, 4, WHITE)}
      {px(34, 27, 3, 1, MAGIC)}
    </g>
  );
}

function banner(): ReactElement {
  return (
    <g data-part="back">
      {px(34, 12, 1.5, 24, SECONDARY_SHADOW)}
      <polygon points="35.5,13 44,15 44,24 35.5,22" fill={PRIMARY} />
      <polygon points="35.5,13 39,13.8 39,22.6 35.5,22" fill={PRIMARY_HIGHLIGHT} opacity="0.4" />
      {px(35.5, 17, 8.5, 1, ACCENT)}
    </g>
  );
}

function jetpack(): ReactElement {
  return (
    <g data-part="back">
      {px(30.5, 22, 6, 8, SECONDARY)}
      {px(30.5, 22, 6, 1.5, WHITE)}
      {px(32, 30, 3, 3, SECONDARY_SHADOW)}
      <polygon points="32,33 35,33 33.5,38" fill={MAGIC} />
      <polygon points="32.5,33 34.5,33 33.5,36" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

function foxTails(): ReactElement {
  return (
    <g data-part="tail">
      {bushyTail()}
      <ellipse cx="37" cy="35" rx="3.5" ry="3" fill={HAIR} />
      <ellipse cx="40" cy="33" rx="3" ry="2.5" fill={WHITE} />
    </g>
  );
}

const backGear: Record<string, () => ReactElement> = {
  none: () => <g data-part="back" />,
  batwings: () => batWings(),
  dragonwings: dragonWings,
  angelwings: featheredWings,
  cape: () => cape(),
  dragontail: () => scaledTail(),
  spadetail: () => demonTail(),
  foxtails: foxTails,
  wolftail: () => bushyTail(),
  backpack,
  tome,
  banner,
  shield: () => shield(),
  jetpack
};

/* ────────────────────────────────────────────────────────────────────────────
 * Front — what the near hand is holding
 * ──────────────────────────────────────────────────────────────────────────── */

function flask(): ReactElement {
  return (
    <g>
      {px(13, 27, 4, 2, WHITE)}
      <polygon points="13.5,29 16.5,29 17.5,34 12.5,34" fill={WHITE} opacity="0.85" />
      <polygon points="13.2,31 16.8,31 17.5,34 12.5,34" fill={MAGIC} />
      {px(14, 25.5, 2, 1.5, SECONDARY)}
    </g>
  );
}

function laptop(): ReactElement {
  return (
    <g>
      {px(8.5, 29, 9, 1, SECONDARY_SHADOW)}
      {px(9, 24, 8, 5, SECONDARY)}
      {px(9.75, 24.75, 6.5, 3.5, MAGIC)}
      {px(9.75, 24.75, 6.5, 1, MAGIC_HIGHLIGHT)}
    </g>
  );
}

function ball(): ReactElement {
  return (
    <g>
      <circle cx="12" cy="32" r="4" fill={WHITE} />
      <circle cx="12" cy="32" r="4" fill="none" stroke={OUTLINE} strokeWidth="0.5" />
      <polygon points="12,29 14,31 13,33.5 11,33.5 10,31" fill={SECONDARY} />
    </g>
  );
}

function palette(): ReactElement {
  return (
    <g>
      <ellipse cx="12.5" cy="30" rx="4.5" ry="3.5" fill={WHITE} />
      <circle cx="10.5" cy="29" r="1" fill={ACCENT} />
      <circle cx="13" cy="28.5" r="1" fill={MAGIC} />
      <circle cx="14.5" cy="30.5" r="1" fill={SECONDARY} />
      <circle cx="11" cy="31.5" r="1" fill={PRIMARY} />
    </g>
  );
}

function lantern(): ReactElement {
  return (
    <g>
      {px(13.5, 24, 1, 3, SECONDARY_SHADOW)}
      {px(11.5, 27, 5, 5, SECONDARY)}
      {px(12.25, 28, 3.5, 3, MAGIC)}
      {px(12.25, 28, 3.5, 1, MAGIC_HIGHLIGHT)}
      {px(11.5, 32, 5, 1, SECONDARY_SHADOW)}
    </g>
  );
}

function petCat(): ReactElement {
  return (
    <g>
      <ellipse cx="13.5" cy="31" rx="4" ry="3" fill={HAIR} />
      <circle cx="11.5" cy="28.5" r="2.5" fill={HAIR} />
      <polygon points="9.5,26.5 10.5,24 12,26.5" fill={HAIR} />
      <polygon points="11.5,26.5 12.5,24 13.5,26.5" fill={HAIR} />
      {px(10.5, 28, 1, 1, WHITE)}
      {px(12.5, 28, 1, 1, WHITE)}
      <path d="M17,30 C18.5,29 18.5,26.5 17,26" fill="none" stroke={HAIR} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

function petBird(): ReactElement {
  return (
    <g>
      <ellipse cx="13" cy="27" rx="3" ry="2.5" fill={ACCENT} />
      <circle cx="11" cy="25.5" r="1.75" fill={ACCENT} />
      <polygon points="9.25,25.5 7.5,26 9.25,26.5" fill={SECONDARY} />
      {px(10.5, 25, 0.75, 0.75, OUTLINE)}
      <polygon points="14,26 17,24.5 16,28" fill={'var(--av-magic-highlight)'} />
    </g>
  );
}

function orb(): ReactElement {
  return (
    <g>
      <circle cx="14" cy="29" r="3.5" fill={MAGIC} opacity="0.35" />
      <circle cx="14" cy="29" r="2.25" fill={MAGIC} />
      <circle cx="13.25" cy="28.25" r="0.9" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/**
 * An open book, in the near hand.
 *
 * The figure already had one — at x 30 to 38, drawn for the far hand of the mage, where it reads
 * as something carried behind. Held in the near hand those same coordinates put it across the
 * chest, which is how every scholar in the catalogue ended up wearing a white box.
 */
function openBook(): ReactElement {
  return (
    <g>
      {px(9, 26.5, 8, 6, SECONDARY)}
      {px(9.75, 27.25, 3.25, 4.5, WHITE)}
      {px(13, 27.25, 3.25, 4.5, '#fff7e8')}
      {px(12.75, 26.5, 0.5, 6, SECONDARY_SHADOW)}
      {px(9, 32, 8, 0.5, OUTLINE)}
    </g>
  );
}

function compass(): ReactElement {
  return (
    <g>
      <circle cx="14" cy="29.5" r="3" fill={SECONDARY} />
      <circle cx="14" cy="29.5" r="2" fill={WHITE} />
      <polygon points="14,27.75 14.75,29.5 14,31.25 13.25,29.5" fill={ACCENT} />
    </g>
  );
}

const heldItems: Record<string, () => ReactElement> = {
  none: () => <g />,
  staff: () => staff(),
  sword: () => sword(),
  flask,
  laptop,
  book: openBook,
  ball,
  palette,
  lantern,
  petcat: petCat,
  petbird: petBird,
  orb,
  compass
};

/* ────────────────────────────────────────────────────────────────────────────
 * Hair, headwear, and what is worn on top of it — y 0 to 12
 * ──────────────────────────────────────────────────────────────────────────── */

/*
 * Hair moved out.
 *
 * It used to be twelve one-line entries here, each a silhouette handed to a shared cap and drawn in
 * a single group after the face. That arrangement is what put an afro over a pair of eyes and a bun
 * a unit above the frame, and no amount of editing those twelve lines fixes it — the fault is that
 * there was one group where there needed to be two. `avatarHair.tsx` holds the whole system now:
 * geometry, anchors, per-race fit, a back drawing and a front one. This file asks it for a style
 * and puts each half in its own slot.
 */

/** Worn on top of the hair. The plain one draws nothing, which is what "no hat" means. */
const headpieces: Record<string, () => ReactElement> = {
  plain: () => <g />,
  hornscurved: () => demonHorns(),
  hornsdragon: () => hornedHelm(),
  beastears: () => <g data-part="ears"><polygon points="16,6.5 18.5,0.5 23,6" fill={HAIR} /><polygon points="32,6.5 29.5,0.5 25,6" fill={HAIR} /><polygon points="18,5.5 18.8,2.5 21,5.5" fill={'var(--av-blush, #ff97ae)'} /><polygon points="30,5.5 29.2,2.5 27,5.5" fill={'var(--av-blush, #ff97ae)'} /></g>,
  wizardhat: () => brimHat(),
  halo: () => (
    /* Centred at y 2 rather than 1.5: a ring of stroke width 1.25 drawn on ry 2 reaches half a
       stroke past its own top edge, so at 1.5 the ring's lit edge was outside the frame. */
    <g data-part="hair">
      <ellipse cx="24" cy="2" rx="7" ry="1.75" fill="none" stroke={MAGIC} strokeWidth="1.25" />
      <ellipse cx="24" cy="2" rx="7" ry="1.75" fill="none" stroke={MAGIC_HIGHLIGHT} strokeWidth="0.5" />
    </g>
  ),

  /* ── the six added to the head ──
   * Drawn on the 48-grid against the same skull every hairstyle is fitted to, so a visor sits on the
   * brow of a cut it has never met and a crown sits on the crown of one. Each stays inside y 0–12,
   * which is the band headwear owns; what leaves it is sheared off in every list in the product. */
  cybervisor: () => (
    <g data-part="headwear">
      {px(14, 7.5, 20, 2.5, SECONDARY)}
      {px(14, 7.5, 20, 0.75, SECONDARY_SHADOW)}
      {px(16, 10, 16, 3, MAGIC)}
      {px(16, 10, 16, 1, MAGIC_HIGHLIGHT)}
      {px(14, 10, 1.5, 3, SECONDARY_SHADOW)}
      {px(32.5, 10, 1.5, 3, SECONDARY_SHADOW)}
    </g>
  ),
  catbeanie: () => (
    <g data-part="headwear">
      {px(14, 2.5, 20, 6, SECONDARY)}
      {px(14, 7, 20, 1.5, ACCENT)}
      {px(14, 2.5, 20, 1, 'var(--av-primary-highlight)')}
      <polygon points="16,2.5 19,0 22,2.5" fill={SECONDARY} />
      <polygon points="32,2.5 29,0 26,2.5" fill={SECONDARY} />
      <polygon points="17.5,2.2 19,0.8 20.5,2.2" fill={'var(--av-blush, #ff97ae)'} />
      <polygon points="30.5,2.2 29,0.8 27.5,2.2" fill={'var(--av-blush, #ff97ae)'} />
    </g>
  ),
  headset: () => (
    <g data-part="headwear">
      {px(15, 1.5, 18, 2, SECONDARY_SHADOW)}
      {px(15, 1.5, 18, 0.75, 'var(--av-primary-highlight)')}
      {px(11.5, 3.5, 4, 7, SECONDARY)}
      {px(32.5, 3.5, 4, 7, SECONDARY)}
      {px(12.5, 5.5, 2, 3, MAGIC)}
      {px(33.5, 5.5, 2, 3, MAGIC)}
      {/* The boom, which is the half that says "headset" rather than "earmuffs". */}
      {px(15.5, 10, 4, 0.75, SECONDARY_SHADOW)}
    </g>
  ),
  crown: () => (
    <g data-part="headwear">
      <polygon points="15,5.5 15,0.5 19,3.5 24,0 29,3.5 33,0.5 33,5.5" fill={ACCENT} />
      {px(15, 5.5, 18, 2, SECONDARY)}
      {px(15, 5.5, 18, 0.5, 'var(--av-primary-highlight)')}
      {px(23.25, 3, 1.5, 1.5, MAGIC_HIGHLIGHT)}
      {px(17, 6, 1.25, 1.25, MAGIC)}
      {px(29.75, 6, 1.25, 1.25, MAGIC)}
    </g>
  ),
  gasmask: () => (
    <g data-part="headwear">
      {px(14.5, 3.5, 19, 2.5, SECONDARY_SHADOW)}
      {/* Over the face on purpose, which is the one style allowed to be: a mask that leaves the eyes
          showing is a headband. The filter below the jaw is what stops it reading as goggles. */}
      {px(16.5, 8.5, 15, 8, SECONDARY)}
      {px(16.5, 8.5, 15, 1, 'var(--av-primary-highlight)')}
      {px(18.5, 10, 4, 3.5, MAGIC)}
      {px(25.5, 10, 4, 3.5, MAGIC)}
      {px(21.5, 15, 5, 3, SECONDARY_SHADOW)}
      {px(22.5, 17, 3, 1, OUTLINE)}
    </g>
  ),
  antlers: () => (
    <g data-part="headwear">
      {px(17, 2.5, 1.5, 5, SECONDARY)}
      {px(13.5, 0.5, 1.5, 4, SECONDARY)}
      {px(19.5, 0, 1.5, 4.5, SECONDARY_SHADOW)}
      {px(29.5, 2.5, 1.5, 5, SECONDARY)}
      {px(33, 0.5, 1.5, 4, SECONDARY)}
      {px(27, 0, 1.5, 4.5, SECONDARY_SHADOW)}
      {px(14.5, 4, 19, 2, HAIR)}
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Faces — the eyes a child picked, and what is worn over them
 * ──────────────────────────────────────────────────────────────────────────── */

interface FaceStyle {
  eye: string;
  eyeLight?: string;
  sharp?: boolean;
  blush?: boolean;
  mouth?: 'smile' | 'fang' | 'none';
}

const faceStyles: Record<string, FaceStyle> = {
  neutral: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)' },
  smile: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)', blush: true },
  focused: { eye: OUTLINE, sharp: true, mouth: 'none' },
  glow: { eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  fangs: { eye: OUTLINE, mouth: 'fang' },
  sleepy: { eye: SECONDARY, eyeLight: 'var(--av-magic-highlight)', mouth: 'none' },
  wink: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)', blush: true, mouth: 'smile' },
  star: { eye: MAGIC, eyeLight: WHITE, blush: true },
  wide: { eye: OUTLINE, eyeLight: WHITE },
  fierce: { eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT, sharp: true, mouth: 'fang' },
  calm: { eye: SECONDARY, eyeLight: 'var(--av-magic-highlight)' },
  cyber: { eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, sharp: true, mouth: 'none' }
};

/** Worn over the eyes, drawn after the face so it covers rather than hides behind it. */
const eyewear: Record<string, () => ReactElement | null> = {
  bare: () => null,
  square: () => (
    <g data-part="eyewear">
      {px(17.5, 9.5, 5.5, 5, 'none')}
      <rect x="17.5" y="9.5" width="5.5" height="5" fill="none" stroke={OUTLINE} strokeWidth="0.75" />
      <rect x="25" y="9.5" width="5.5" height="5" fill="none" stroke={OUTLINE} strokeWidth="0.75" />
      {px(23, 11.5, 2, 0.75, OUTLINE)}
    </g>
  ),
  round: () => (
    <g data-part="eyewear">
      <circle cx="20.25" cy="12" r="3" fill="none" stroke={OUTLINE} strokeWidth="0.75" />
      <circle cx="27.75" cy="12" r="3" fill="none" stroke={OUTLINE} strokeWidth="0.75" />
      {px(23.25, 11.6, 1.5, 0.75, OUTLINE)}
    </g>
  ),
  visor: () => (
    <g data-part="eyewear">
      {px(15.5, 9.5, 17, 4.5, OUTLINE)}
      {px(16.5, 10.5, 15, 2.5, MAGIC)}
      {px(16.5, 10.5, 15, 1, MAGIC_HIGHLIGHT)}
    </g>
  ),
  cybermask: () => (
    <g data-part="eyewear">
      {px(15.5, 9, 17, 6, SECONDARY)}
      {px(17, 10.5, 5, 3, MAGIC)}
      {px(25, 10.5, 5, 3, MAGIC)}
      {px(15.5, 14.5, 17, 1, SECONDARY_SHADOW)}
      {px(20, 16, 8, 2.5, SECONDARY_SHADOW)}
    </g>
  ),
  surgical: () => (
    <g data-part="eyewear">
      {px(16.5, 14, 15, 5, WHITE)}
      {px(16.5, 14, 15, 0.75, SECONDARY_SHADOW)}
      {px(14.5, 14.5, 2, 1, WHITE)}
      {px(31.5, 14.5, 2, 1, WHITE)}
    </g>
  ),
  eyepatch: () => (
    <g data-part="eyewear">
      {px(16.5, 9.25, 7, 5, OUTLINE)}
      {px(14.5, 10.5, 18, 0.75, OUTLINE)}
    </g>
  ),
  goggles: () => (
    <g data-part="eyewear">
      {px(14.5, 9, 19, 5.5, SECONDARY)}
      <circle cx="20.25" cy="11.75" r="2.5" fill={MAGIC} opacity="0.7" />
      <circle cx="27.75" cy="11.75" r="2.5" fill={MAGIC} opacity="0.7" />
      {px(14.5, 9, 19, 1, SECONDARY_SHADOW)}
    </g>
  ),
  monocle: () => (
    <g data-part="eyewear">
      <circle cx="20.25" cy="12" r="3.25" fill="none" stroke={ACCENT} strokeWidth="0.75" />
      {px(17, 15, 0.75, 4, ACCENT)}
    </g>
  ),

  /* Three more, drawn against the same pair of sockets every face has: x 18.25–22.25 and
     25.75–29.75. A lens authored against one eye shape and not the sockets lands on the cheek of
     every other one. */
  readingglasses: () => (
    <g data-part="eyewear">
      <rect x="17.75" y="9.5" width="5" height="5" fill={WHITE} opacity="0.35" />
      <rect x="25.25" y="9.5" width="5" height="5" fill={WHITE} opacity="0.35" />
      <rect x="17.75" y="9.5" width="5" height="5" fill="none" stroke={OUTLINE} strokeWidth="0.6" />
      <rect x="25.25" y="9.5" width="5" height="5" fill="none" stroke={OUTLINE} strokeWidth="0.6" />
      {px(22.75, 11.5, 2.5, 0.6, OUTLINE)}
    </g>
  ),
  starshades: () => (
    <g data-part="eyewear">
      {px(17, 9.5, 14, 4.5, SECONDARY_SHADOW)}
      {px(17, 9.5, 14, 0.75, SECONDARY)}
      <polygon
        points="20.25,9.75 21.1,11.4 22.9,11.4 21.5,12.5 22,14.2 20.25,13.2 18.5,14.2 19,12.5 17.6,11.4 19.4,11.4"
        fill={MAGIC_HIGHLIGHT}
      />
      {px(26, 11, 3.5, 1.25, MAGIC)}
    </g>
  ),
  scouter: () => (
    <g data-part="eyewear">
      {/* One eye, not both. Two covered eyes leave a chibi face with no expression at all, which is
          the one thing it cannot spare. */}
      {px(24.75, 9.25, 8, 5, SECONDARY)}
      {px(25.5, 10, 6.5, 3.5, MAGIC)}
      {px(25.5, 10, 6.5, 1, MAGIC_HIGHLIGHT)}
      {px(32, 10.5, 1.5, 5, SECONDARY_SHADOW)}
      {px(23.5, 11, 1.5, 1.25, SECONDARY_SHADOW)}
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Aura and effects
 * ──────────────────────────────────────────────────────────────────────────── */

const ringAura = (stroke: string, dashed = false): ReactElement => (
  <g data-part="fx" data-fx="aura" opacity="0.55">
    <ellipse
      cx="24" cy="27" rx="17" ry="20" fill="none" stroke={stroke} strokeWidth="1"
      {...(dashed ? { strokeDasharray: '3 2' } : {})}
    />
  </g>
);

const auras: Record<string, () => ReactElement> = {
  none: () => <g data-part="fx" />,
  fire: () => (
    <g data-part="fx" data-fx="aura" opacity="0.6">
      <polygon points="24,4 28,14 24,11 20,14" fill={ACCENT} />
      <polygon points="10,34 13,24 16,32" fill={ACCENT} />
      <polygon points="38,34 35,24 32,32" fill={ACCENT} />
    </g>
  ),
  ice: () => ringAura(MAGIC_HIGHLIGHT, true),
  shadow: () => (
    <g data-part="fx" data-fx="aura" opacity="0.5">
      <ellipse cx="24" cy="30" rx="16" ry="14" fill={OUTLINE} opacity="0.35" />
    </g>
  ),
  nature: () => (
    <g data-part="fx" data-fx="aura" opacity="0.6">
      <ellipse cx="12" cy="24" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(-25 12 24)" />
      <ellipse cx="36" cy="28" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(25 36 28)" />
      <ellipse cx="14" cy="33" rx="2" ry="1.25" fill={ACCENT} transform="rotate(15 14 33)" />
    </g>
  ),
  star: () => spellAura(),
  cyber: () => (
    <g data-part="fx" data-fx="aura" opacity="0.5">
      {px(6, 20, 36, 0.5, MAGIC)}
      {px(6, 30, 36, 0.5, MAGIC)}
      {px(6, 40, 36, 0.5, MAGIC)}
    </g>
  ),
  lightning: () => (
    <g data-part="fx" data-fx="aura" opacity="0.65">
      <polygon points="9,18 13,24 10,24 13,31" fill={MAGIC_HIGHLIGHT} />
      <polygon points="39,18 35,24 38,24 35,31" fill={MAGIC_HIGHLIGHT} />
    </g>
  )
};

const effects: Record<string, () => ReactElement> = {
  none: () => <g data-part="fx" />,
  sparkle: () => (
    <g data-part="fx" opacity="0.9">
      <polygon points="11,14 12,17 15,18 12,19 11,22 10,19 7,18 10,17" fill={MAGIC_HIGHLIGHT} />
      <polygon points="37,20 37.7,22 39.7,22.7 37.7,23.4 37,25.4 36.3,23.4 34.3,22.7 36.3,22" fill={MAGIC_HIGHLIGHT} />
    </g>
  ),
  flameorb: () => flameOrbs(),
  smokepuff: () => (
    <g data-part="fx" opacity="0.45">
      <circle cx="11" cy="38" r="3" fill={WHITE} />
      <circle cx="15" cy="40" r="2" fill={WHITE} />
      <circle cx="37" cy="39" r="2.5" fill={WHITE} />
    </g>
  ),
  leaffall: () => (
    <g data-part="fx" opacity="0.8">
      <ellipse cx="12" cy="10" rx="2" ry="1.25" fill={ACCENT} transform="rotate(-30 12 10)" />
      <ellipse cx="36" cy="16" rx="2" ry="1.25" fill={ACCENT} transform="rotate(20 36 16)" />
      <ellipse cx="30" cy="6" rx="1.5" ry="1" fill={ACCENT} transform="rotate(-10 30 6)" />
    </g>
  ),
  motes: () => (
    <g data-part="fx" opacity="0.85">
      <circle cx="10" cy="24" r="1.25" fill={MAGIC} />
      <circle cx="38" cy="20" r="1" fill={MAGIC} />
      <circle cx="13" cy="16" r="0.9" fill={MAGIC_HIGHLIGHT} />
      <circle cx="35" cy="32" r="1.1" fill={MAGIC_HIGHLIGHT} />
    </g>
  ),
  arc: () => (
    <g data-part="fx" opacity="0.8">
      <path d="M10,20 Q24,8 38,20" fill="none" stroke={MAGIC} strokeWidth="0.75" strokeDasharray="2 2" />
    </g>
  ),
  gridline: () => (
    <g data-part="fx" opacity="0.6">
      {px(7, 44, 34, 0.5, MAGIC)}
      {px(12, 42, 24, 0.5, MAGIC)}
      {px(17, 40, 14, 0.5, MAGIC)}
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Races — the body under the clothes
 * ──────────────────────────────────────────────────────────────────────────── */

interface RaceShape {
  ears: EarStyle;
  snout: SnoutStyle;
  whiskers?: boolean;
  /** Drawn when the child has chosen no back accessory of their own. */
  tail?: () => ReactElement;
  /** A body that is not a torso box: the penguin, and anything else that is one soft shape. */
  round?: boolean;
  claw?: boolean;
}

const races: Record<AvatarRace, RaceShape> = {
  human: { ears: 'none', snout: 'none' },
  dragonkin: { ears: 'none', snout: 'muzzle', tail: scaledTail, claw: true },
  demon: { ears: 'pointed', snout: 'none', tail: demonTail, claw: true },
  beastfolk: { ears: 'cat', snout: 'none', whiskers: true, tail: catTail },
  spirit: { ears: 'pointed', snout: 'none' },
  robot: { ears: 'round', snout: 'none' }
};

/* ────────────────────────────────────────────────────────────────────────────
 * The translation itself
 * ──────────────────────────────────────────────────────────────────────────── */

/** `top_labcoat` → `labcoat`; `hair_bob__wizardhat` → `bob`. */
export function baseOf(traitId: string): string {
  const withoutLayer = traitId.slice(traitId.indexOf('_') + 1);
  const base = withoutLayer.split('__')[0] ?? withoutLayer;
  return base;
}

/** `hair_bob__wizardhat` → `wizardhat`; `hair_bob` → undefined. */
export function wornOf(traitId: string): string | undefined {
  const parts = traitId.split('__');
  return parts.length > 1 ? parts[1] : undefined;
}

function layerOf(config: AvatarConfigV2, layer: LayerType): string | undefined {
  return config.layers?.[layer];
}

/**
 * Every slot of the figure, from one saved configuration.
 *
 * A missing choice is not an error: an avatar saved before a drawer existed simply gets its race's
 * own answer, which is why a record from the first week still draws a whole person. The order of
 * the returned map does not matter — the compositor draws by `bodySlotOrder` and nothing else
 * decides it.
 */
export function figureSlotsFor(
  config: AvatarConfigV2, rig: DirectionRig = directionRig('front')
): Partial<Record<BodySlot, ReactElement>> {
  const race = races[config.race ?? 'human'] ?? races.human;

  const topId = layerOf(config, 'top_clothing');
  const top = topId ? tops[baseOf(topId)] : undefined;
  const sleeve = top?.sleeve ?? PRIMARY;

  const bottomId = layerOf(config, 'bottom_clothing');
  const bottom = bottomId ? legStyles[baseOf(bottomId)] : undefined;

  const backId = layerOf(config, 'back_accessory');
  const back = backId ? backGear[baseOf(backId)] : undefined;

  const frontId = layerOf(config, 'front_accessory');
  const held = frontId ? heldItems[baseOf(frontId)] : undefined;

  const hairId = layerOf(config, 'hair_headpiece');
  /*
   * The style, fitted to this race, as two drawings.
   *
   * `hairFor` answers for an id it does not know and for no id at all, so an avatar saved before
   * this drawer existed — which is most of them — gets the cut its race falls back to rather than a
   * bare skull, and a build that later drops a style does not blank out the children wearing it.
   */
  const hair = hairFor(hairId ? baseOf(hairId) : undefined, config.race, rig);
  const worn = hairId ? wornOf(hairId) : undefined;
  const headpiece = worn ? headpieces[worn] : undefined;

  const faceId = layerOf(config, 'face_features');
  const face = faceId ? faceStyles[baseOf(faceId)] : undefined;
  const overEyes = faceId ? wornOf(faceId) : undefined;
  const glasses = overEyes ? eyewear[overEyes] : undefined;

  const auraId = layerOf(config, 'back_aura');
  const aura = auraId ? auras[baseOf(auraId)] : undefined;

  const fxId = layerOf(config, 'front_fx');
  const fx = fxId ? effects[baseOf(fxId)] : undefined;

  /*
   * A tail belongs to the race unless the child chose something else to wear on their back.
   *
   * Both live in the same slot, because a cape and a tail are the same z-position and drawing them
   * together puts a tail through a cape. The choice wins when there is one, and the race answers
   * when there is not — so a beastfolk who has bought no wings still has a tail.
   */
  const backDrawing = back && baseOf(backId ?? '') !== 'none'
    ? back()
    : race.tail
      ? race.tail()
      : undefined;

  const slots: Partial<Record<BodySlot, ReactElement>> = {
    shadow: groundShadow(),
    back_arm: backArm({ sleeve, skin: SKIN }),
    legs_feet: race.round
      ? legsWebbed()
      : bottom
        ? bottom()
        : legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, race.claw),
    torso_body: race.round ? torsoRound() : top ? topFrom(top) : torsoShirt(),
    head_neck: headShape({
      /*
       * The ears are drawn after the hair instead, in the headwear step.
       *
       * A costume's hair is cut to leave its own ears room; a figure a child assembled has any of
       * twelve cuts over any of six races, and there is no cap that clears a rabbit's ears and
       * still reads as hair. So the one race whose whole silhouette is its ears keeps them.
       */
      ears: 'none',
      snout: race.snout,
      rig
    }),
    face: faceFeatures({
      eye: face?.eye ?? OUTLINE,
      ...(face?.eyeLight === undefined ? {} : { eyeLight: face.eyeLight }),
      ...(face?.sharp === undefined ? {} : { sharp: face.sharp }),
      ...(face?.blush === undefined ? {} : { blush: face.blush }),
      ...(face?.mouth === undefined ? {} : { mouth: face.mouth }),
      snout: race.snout,
      ...(race.whiskers === undefined ? {} : { whiskers: race.whiskers }),
      rig
    }),
    /* The wrap round the ear and the jaw: over the edge of the face, under the fringe. Without it a
       turned head shows a band of bare scalp between the cap and the jaw. */
    hair_side: hair.side,
    /* The cap and the fringe. Length and volume are not here — they went into `hair_back`. */
    hair_headwear: hair.front,
    /* Worn rather than grown, and last over the head: ears and horns first, then a hat, then what
       is over the eyes. A fringe under a hat and a hat under a fringe are different drawings. */
    headwear: (
      <g>
        {race.ears === 'none' ? null : earShape(race.ears, rig)}
        {headpiece ? headpiece() : null}
        {glasses ? glasses() : null}
      </g>
    ),
    front_arm_weapon: race.round
      ? flipperArm('front')
      : frontArm({ sleeve, skin: SKIN }, held && baseOf(frontId ?? '') !== 'none' ? held() : undefined)
  };

  if (backDrawing) slots.back_gear = backDrawing;
  if (hair.back) slots.hair_back = hair.back;

  const overlay = [
    aura && baseOf(auraId ?? '') !== 'none' ? aura() : null,
    fx && baseOf(fxId ?? '') !== 'none' ? fx() : null
  ].filter(Boolean);
  if (overlay.length > 0) slots.overlay_fx = <g>{overlay}</g>;

  return slots;
}

/** Whether a configuration says enough to be drawn as a composed figure rather than a costume. */
export function hasFigureChoices(config: AvatarConfigV2 | null | undefined): boolean {
  if (!config) return false;
  const layers = config.layers;
  if (!layers) return false;
  return Object.keys(layers).length > 0;
}

/** Exposed for the tests that check every id in the trait tables has somewhere to be drawn. */
export const figurePartTables = {
  tops, legStyles, backGear, heldItems, hairStyles: hairStyleDefinitions, headpieces, faceStyles,
  eyewear, auras, effects, races
};

/** Re-exported so a caller composing a figure does not have to import from two places. */
export { bodySlotOrder };
