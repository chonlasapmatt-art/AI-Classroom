import type { ReactElement } from 'react';
import {
  px,
  ACCENT, HAIR, MAGIC, MAGIC_HIGHLIGHT, OUTLINE,
  PRIMARY, PRIMARY_HIGHLIGHT, PRIMARY_SHADOW, SECONDARY, SECONDARY_SHADOW,
  SKIN, WHITE
} from './avatarSprites';
import {
  archetypeBodyFor, backArm, batWings, bodyArchetypeFor, bodySlotOrder, brimHat, bushyTail, cape,
  catTail, demonHorns, demonTail,
  backpack, earShape, faceFeatures, flameOrbs, flask, flipperArm, frontArm, groundShadow, headShape,
  hornedHelm, jetpack, lantern, legsSneakers, openBook, palette,
  legsStanding, legsWebbed, robedLegs, scaledTail, shield, spellAura,
  staff, sword, torsoRound,
  type BodySlot, type BrowShape, type EarStyle, type EyeShape, type FootwearShape, type HandwearShape,
  type MouthShape, type SnoutStyle
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

/**
 * What else is on the torso, in the order it is put on.
 *
 * Both live inside the torso group rather than in compositing steps of their own, and that is not
 * an optimisation. `.torso` is animated — it leans on a run, twists on a strike, compresses into a
 * cast — so a coat drawn as its own layer stays bolt upright while the body under it leans away.
 * Same fault as a shoe that does not walk, and the same fix: hand it to the thing that moves.
 */
interface TorsoLayers {
  /** A coat, a poncho, a harness: over the shirt, under anything round the neck. */
  over?: ReactElement | undefined;
  /** A scarf, a collar, a pendant: last, because it sits on top of everything else. */
  neck?: ReactElement | undefined;
}

function topFrom({ cloth, marks, wide, skirt }: TopShape, extra: TorsoLayers = {}): ReactElement {
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
      {extra.over ?? null}
      {extra.neck ?? null}
    </g>
  );
}

/**
 * A bare torso that still takes a coat and a scarf.
 *
 * A child who has chosen an overcoat but no shirt, or who is wearing a character whose own body is
 * its costume, still has a neck and still has shoulders. Without this the two new drawers did
 * nothing at all unless a shirt happened to be underneath them, which is not what "change every
 * part" means.
 */
function torsoLayersOnly(extra: TorsoLayers): ReactElement | null {
  if (!extra.over && !extra.neck) return null;
  return <g data-part="torso">{extra.over ?? null}{extra.neck ?? null}</g>;
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

/* ── The three families the wardrobe was thin in ──
 *
 * Each of these is a silhouette rather than a trim: a puffer is horizontal bands that read at any
 * size, plate is a pair of pauldrons that break the shoulder line, an exo rig is a frame you can see
 * the body through. A garment whose whole identity is a stripe across the chest is a recolour with
 * extra steps, and the customiser already has enough of those.
 */

/* ── The three families the wardrobe was thin in ──
 *
 * ── The box these have to live in ──
 * A torso is x 17–31, y 21–33, and marks are drawn inside the torso group — which is painted before
 * both arms. Anything reaching past x 19 on the near side is behind the arm by the time the figure is
 * composed, and a shoulder plate nobody can see is not a shoulder plate. The first cut of these went
 * out to x 14 for its pauldrons and lost every one of them.
 *
 * The one strip that *is* free is above y 21: the arms start at 22, so a collar, a gorget or a hood
 * roll drawn at 19–21 clears both of them and is the only way a garment can break the shoulder line.
 * Three of the nine use it, and they are the three whose whole identity is what happens at the
 * shoulder.
 *
 * ── And contrast ──
 * Every mark below is in `SECONDARY`, `ACCENT`, `WHITE` or `MAGIC`, never in a shade of the cloth it
 * sits on. The first cut used `PRIMARY_SHADOW` on `PRIMARY` — one step of lightness apart on a
 * twenty-step ramp — and at the size a picker tile actually draws, that is one flat colour.
 */

/** Quilted bands and a zip: what says "puffer" rather than "jacket" at forty pixels. */
const quiltMarks = (): ReactElement => (
  <>
    {px(17, 21, 14, 1.5, SECONDARY)}
    {px(17, 24, 14, 1, SECONDARY_SHADOW)}
    {px(17, 27.5, 14, 1, SECONDARY_SHADOW)}
    {px(17, 31, 14, 1, SECONDARY_SHADOW)}
    {px(23.5, 22.5, 1, 10, ACCENT)}
  </>
);

/** A hood that is down: a roll above the shoulder line, which is the one place it can be seen. */
const drapeMarks = (): ReactElement => (
  <>
    {px(19, 19.5, 10, 2.5, SECONDARY)}
    {px(19, 19.5, 10, 0.75, ACCENT)}
    {px(21, 23, 1, 6, WHITE)}
    {px(26, 23, 1, 6, WHITE)}
    {px(18, 29, 12, 3, SECONDARY_SHADOW)}
  </>
);

/** Ribbed collar and hem, and a letter patch. The contrast sleeves come from `sleeve`. */
const varsityMarks = (): ReactElement => (
  <>
    {px(17, 21, 14, 1.5, WHITE)}
    {px(17, 31, 14, 1.5, WHITE)}
    {px(21, 24, 6, 5, ACCENT)}
    {px(23, 25.5, 2, 2, SECONDARY)}
  </>
);

/**
 * Layered plate: a gorget that clears the shoulders, three overlapping bands, and a central ridge.
 *
 * The gorget at y 19.5 is the pauldron's replacement and it does the same job — it is the thing that
 * breaks the shoulder line and says "armour" before any of the detail below it is legible.
 */
const pauldronMarks = (): ReactElement => (
  <>
    {px(18, 19.5, 12, 2, SECONDARY)}
    {px(18, 19.5, 12, 0.75, ACCENT)}
    {px(17, 22, 14, 1, 'var(--av-secondary-highlight)')}
    {px(17, 25, 14, 1, SECONDARY_SHADOW)}
    {px(17, 28, 14, 1, SECONDARY_SHADOW)}
    {px(23, 22, 2, 10, ACCENT)}
  </>
);

/** Vertical folds and a clasped yoke: what a robe has that a tunic does not. */
const foldMarks = (): ReactElement => (
  <>
    {px(19.5, 21, 1, 12, SECONDARY_SHADOW)}
    {px(23.5, 21, 1, 12, SECONDARY_SHADOW)}
    {px(27.5, 21, 1, 12, SECONDARY_SHADOW)}
    {px(20, 21, 8, 2, MAGIC)}
    {px(22.5, 24, 3, 3, MAGIC_HIGHLIGHT)}
  </>
);

/** A feathered collar, scalloped rather than solid, so it reads as plumage and not as a bib. */
const plumeMarks = (): ReactElement => (
  <>
    {px(17, 20.5, 14, 2, WHITE)}
    {px(17.5, 22.5, 3, 2, WHITE)}
    {px(22.5, 22.5, 3, 2, WHITE)}
    {px(27.5, 22.5, 3, 2, WHITE)}
    {px(17, 22, 14, 0.5, ACCENT)}
  </>
);

/** An exoskeleton: two lit struts, a cross brace, and a power cell you can see the glow of. */
const exoMarks = (): ReactElement => (
  <>
    {px(18.5, 21, 1.5, 12, ACCENT)}
    {px(28, 21, 1.5, 12, ACCENT)}
    {px(17, 26, 14, 1, ACCENT)}
    {px(22, 24.5, 4, 4, SECONDARY)}
    {px(23, 25.5, 2, 2, MAGIC_HIGHLIGHT)}
  </>
);

/** One circuit route with corners, not a grid: a grid of lines reads as a grid. */
const circuitMarks = (): ReactElement => (
  <>
    {px(19, 21, 1, 7, MAGIC)}
    {px(19, 27, 6, 1, MAGIC)}
    {px(24.5, 23, 1, 5, MAGIC_HIGHLIGHT)}
    {px(24.5, 23, 5, 1, MAGIC)}
    {px(28.5, 23, 1, 8, MAGIC)}
    {px(21, 30, 8, 1, MAGIC_HIGHLIGHT)}
  </>
);

/** A collar that stands past the jaw, and the hazard banding under it. */
const hazardMarks = (): ReactElement => (
  <>
    {px(19, 19, 10, 2.5, ACCENT)}
    {px(19, 19, 10, 0.75, WHITE)}
    {px(17, 29, 14, 2, SECONDARY_SHADOW)}
    {px(18, 29, 2.5, 2, WHITE)}
    {px(22, 29, 2.5, 2, WHITE)}
    {px(26, 29, 2.5, 2, WHITE)}
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
  druidwrap: { cloth: PRIMARY, sleeve: SKIN, marks: wrapMarks(), skirt: SECONDARY },

  puffer: { cloth: PRIMARY, sleeve: PRIMARY, marks: quiltMarks(), wide: true },
  hoodiedrape: { cloth: SECONDARY, sleeve: SECONDARY, marks: drapeMarks(), wide: true },
  varsity: { cloth: SECONDARY, sleeve: WHITE, marks: varsityMarks() },
  platelayered: { cloth: SECONDARY, sleeve: SECONDARY, marks: pauldronMarks(), wide: true },
  wizardrobe: { cloth: PRIMARY, sleeve: PRIMARY, marks: foldMarks(), wide: true, skirt: PRIMARY },
  feathercloak: { cloth: PRIMARY, sleeve: PRIMARY, marks: plumeMarks(), wide: true, skirt: PRIMARY },
  exorig: { cloth: SECONDARY_SHADOW, sleeve: SECONDARY, marks: exoMarks(), wide: true },
  circuitjacket: { cloth: SECONDARY_SHADOW, sleeve: SECONDARY_SHADOW, marks: circuitMarks() },
  hazardcoat: { cloth: ACCENT, sleeve: ACCENT, marks: hazardMarks(), wide: true, skirt: ACCENT }
};

/** What the sleeves are cut from, so an arm never has to know which garment it belongs to. */
export function sleeveFor(topId: string | undefined): string {
  const shape = topId ? tops[baseOf(topId)] : undefined;
  return shape?.sleeve ?? PRIMARY;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Legs — y 35 to 46, feet on the floor at 46
 * ──────────────────────────────────────────────────────────────────────────── */

const legStyles: Record<string, (shoe?: FootwearShape) => ReactElement> = {
  trousers: (shoe) => legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN, shoe }),
  skirt: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25.5, 39, 4, 4, SKIN)}{shoe ? shoe(25) : (<>{px(25, 43, 5, 2.5, SECONDARY)}{px(25, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
      <g data-part="frontLeg">{px(18.5, 39, 4, 4, SKIN)}{shoe ? shoe(18) : (<>{px(18, 43, 5, 2.5, SECONDARY)}{px(18, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
      {/* The skirt itself, flaring from the waist and stopping above the knee. */}
      <polygon points="17,35 31,35 33,40 15,40" fill={PRIMARY} />
      <polygon points="17,35 24,35 24,40 15,40" fill={PRIMARY_HIGHLIGHT} opacity="0.35" />
      {px(15, 39.5, 18, 1, SECONDARY)}
    </g>
  ),
  shorts: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25, 35, 5, 4, PRIMARY)}{px(25.5, 39, 4, 4, SKIN)}{shoe ? shoe(25) : (<>{px(25, 43, 5, 2.5, ACCENT)}{px(25, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
      <g data-part="frontLeg">{px(18, 35, 5, 4, PRIMARY)}{px(18.5, 39, 4, 4, SKIN)}{shoe ? shoe(18) : (<>{px(18, 43, 5, 2.5, ACCENT)}{px(18, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
    </g>
  ),
  robehem: (shoe) => robedLegs({ boot: ACCENT, trouser: SECONDARY, skin: SKIN, shoe }),
  greaves: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25, 35, 5, 5, SECONDARY)}{px(25, 40, 5, 3, SECONDARY_SHADOW)}{shoe ? shoe(25) : (<>{px(24.5, 43, 6, 3, SECONDARY)}{px(24.5, 43, 6, 0.75, ACCENT)}{px(24, 45.5, 7, 0.5, OUTLINE)}</>)}</g>
      <g data-part="frontLeg">{px(18, 35, 5, 5, SECONDARY)}{px(18, 40, 5, 3, SECONDARY_SHADOW)}{shoe ? shoe(18) : (<>{px(17.5, 43, 6, 3, SECONDARY)}{px(17.5, 43, 6, 0.75, ACCENT)}{px(17, 45.5, 7, 0.5, OUTLINE)}</>)}</g>
    </g>
  ),
  techpants: (shoe) => legsSneakers({ boot: SECONDARY, trouser: SECONDARY, skin: SKIN, shoe }),

  /* ── Four more legs ──
   * Tops and bottoms multiply, so a bottom is worth as many outfits as there are tops — which made
   * six the number holding the whole wardrobe down. Each of these changes the outline of the leg
   * rather than its colour: a cargo pocket at the thigh, a plate skirt over the knee, a piston at
   * the calf, a hem in two layers. */
  cargo: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">
        {px(25, 35, 5, 8, SECONDARY)}{px(24.5, 37, 1.5, 3, SECONDARY_SHADOW)}
        {shoe ? shoe(25) : (<>{px(25, 42.5, 5, 0.5, PRIMARY_SHADOW)}{px(24.5, 43, 6, 2.5, PRIMARY)}{px(24, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
      <g data-part="frontLeg">
        {px(18, 35, 5, 8, SECONDARY)}{px(22, 37, 1.5, 3, SECONDARY_SHADOW)}
        {shoe ? shoe(18) : (<>{px(18, 42.5, 5, 0.5, PRIMARY_SHADOW)}{px(17.5, 43, 6, 2.5, PRIMARY)}{px(17, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
    </g>
  ),
  platelegs: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">
        {px(25, 35, 5.5, 4, SECONDARY)}{px(25, 35, 5.5, 0.5, ACCENT)}
        {px(25, 39.5, 5, 3.5, SECONDARY_SHADOW)}{shoe ? shoe(25) : (<>{px(24.5, 43, 6, 3, SECONDARY)}{px(24, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
      <g data-part="frontLeg">
        {px(17.5, 35, 5.5, 4, SECONDARY)}{px(17.5, 35, 5.5, 0.5, ACCENT)}
        {px(18, 39.5, 5, 3.5, SECONDARY_SHADOW)}{shoe ? shoe(18) : (<>{px(17.5, 43, 6, 3, SECONDARY)}{px(17, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
    </g>
  ),
  exogreaves: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">
        {px(25.5, 35, 4, 5, SECONDARY_SHADOW)}{px(24.5, 36, 1, 4, SECONDARY)}
        {px(25.5, 40, 4, 3, SECONDARY_SHADOW)}{px(26, 40.5, 1, 2, MAGIC)}
        {shoe ? shoe(25) : (<>{px(24.5, 43, 6, 2.5, SECONDARY)}{px(24, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
      <g data-part="frontLeg">
        {px(18.5, 35, 4, 5, SECONDARY_SHADOW)}{px(22.5, 36, 1, 4, SECONDARY)}
        {px(18.5, 40, 4, 3, SECONDARY_SHADOW)}{px(21, 40.5, 1, 2, MAGIC)}
        {shoe ? shoe(18) : (<>{px(17.5, 43, 6, 2.5, SECONDARY)}{px(17, 45.5, 7, 0.5, OUTLINE)}</>)}
      </g>
    </g>
  ),
  layeredskirt: (shoe) => (
    <g data-part="legs">
      <g data-part="backLeg">{px(25.5, 39, 4, 4, SKIN)}{shoe ? shoe(25) : (<>{px(25, 43, 5, 2.5, SECONDARY)}{px(25, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
      <g data-part="frontLeg">{px(18.5, 39, 4, 4, SKIN)}{shoe ? shoe(18) : (<>{px(18, 43, 5, 2.5, SECONDARY)}{px(18, 45.5, 5, 0.5, OUTLINE)}</>)}</g>
      {/* Two hems rather than one, the under-layer wider: that offset is the whole read, and it is
          what a single flared panel cannot say however it is shaded. */}
      <polygon points="17.5,35 30.5,35 32,39 16,39" fill={PRIMARY} />
      <polygon points="16,38.5 32,38.5 34,42 14,42" fill={PRIMARY_SHADOW} />
      {px(14, 41.5, 20, 0.5, ACCENT)}
      <polygon points="17.5,35 24,35 24,39 16,39" fill={PRIMARY_HIGHLIGHT} opacity="0.3" />
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Footwear — drawn inside a leg, at y 41 to 46
 *
 * Every shape here is authored against the leg's own left edge, so one drawing serves the near leg,
 * the far leg, and every leg style under it. The floor is y 46 and nothing may cross it: a figure
 * whose shoe reaches 46.5 is a figure standing half a unit underground, and the ground shadow is
 * drawn at 46 for everybody.
 * ──────────────────────────────────────────────────────────────────────────── */

const sole = (x: number, width = 8) => px(x - (width - 5) / 2, 45.5, width, 0.5, OUTLINE);

const footwearStyles: Record<string, FootwearShape> = {
  none: () => <g />,
  /** The school shoe: flat, dark, a strap across the instep. Free, and the one everybody starts in. */
  schoolshoe: (x) => (
    <g>
      {px(x - 0.5, 42.5, 6, 3, SECONDARY_SHADOW)}
      {px(x - 0.5, 42.5, 6, 0.75, SECONDARY)}
      {px(x + 1, 43.5, 3, 0.75, ACCENT)}
      {sole(x, 7)}
    </g>
  ),
  /** High-top trainer: a thick white sole is the whole read at this size. */
  trainer: (x) => (
    <g>
      {px(x - 0.5, 41, 6, 3.5, PRIMARY)}
      {px(x - 0.5, 41, 6, 1, PRIMARY_HIGHLIGHT)}
      {px(x - 0.5, 42.5, 4, 0.75, ACCENT)}
      {px(x - 1, 44, 7, 1.5, WHITE)}
      {sole(x, 7)}
    </g>
  ),
  /** Canvas plimsoll: low, soft, a rubber toe cap. */
  plimsoll: (x) => (
    <g>
      {px(x - 0.5, 43, 6, 2.5, PRIMARY)}
      {px(x + 3, 43, 2.5, 2.5, WHITE)}
      {px(x - 0.5, 43, 6, 0.5, PRIMARY_HIGHLIGHT)}
      {sole(x, 7)}
    </g>
  ),
  /** Knee boot: the shaft is the silhouette, so it runs from the calf rather than the ankle. */
  kneeboot: (x) => (
    <g>
      {px(x + 0.5, 38, 4, 6, SECONDARY)}
      {px(x + 0.5, 38, 1, 6, 'var(--av-secondary-highlight)')}
      {px(x - 0.5, 43.5, 6, 2, SECONDARY_SHADOW)}
      {px(x + 0.5, 38, 4, 0.75, ACCENT)}
      {sole(x, 7)}
    </g>
  ),
  /** Buckled boot: two straps across a heavy shaft. */
  buckleboot: (x) => (
    <g>
      {px(x, 40, 5, 4.5, SECONDARY_SHADOW)}
      {px(x - 0.5, 43.5, 6, 2, SECONDARY)}
      {px(x, 41, 5, 0.75, ACCENT)}
      {px(x, 42.5, 5, 0.75, ACCENT)}
      {sole(x, 7)}
    </g>
  ),
  /** Steel sabaton: plate over the instep, a lit rim along the toe. */
  sabaton: (x) => (
    <g>
      {px(x - 0.5, 41.5, 6, 2, SECONDARY)}
      {px(x - 1, 43.5, 7, 2, SECONDARY)}
      {px(x - 1, 43.5, 7, 0.75, 'var(--av-secondary-highlight)')}
      {px(x + 3.5, 44, 2.5, 1.5, ACCENT)}
      {sole(x, 8)}
    </g>
  ),
  /** Sandal: straps and a bare foot, which is mostly what is *not* drawn. */
  sandal: (x) => (
    <g>
      {px(x + 0.5, 42.5, 4, 0.75, SECONDARY)}
      {px(x + 0.5, 44, 4, 0.75, SECONDARY)}
      {px(x, 44.75, 5, 0.75, ACCENT)}
      {sole(x, 6)}
    </g>
  ),
  /** Hover plate: no contact at all, so it carries its own lit underside instead of a sole. */
  hoverplate: (x) => (
    <g>
      {px(x - 0.5, 42.5, 6, 2, SECONDARY_SHADOW)}
      {px(x - 0.5, 42.5, 6, 0.5, 'var(--av-secondary-highlight)')}
      {px(x, 44.75, 5, 0.75, MAGIC)}
      <g opacity="0.4">{px(x - 1, 45.5, 7, 0.5, MAGIC_HIGHLIGHT)}</g>
    </g>
  ),
  /** Rune-stitched boot: a soft shaft with a lit glyph on the outside. */
  runeboot: (x) => (
    <g>
      {px(x, 39.5, 5, 5, MAGIC)}
      {px(x, 39.5, 5, 0.75, MAGIC_HIGHLIGHT)}
      {px(x - 0.5, 43.5, 6, 2, 'var(--av-magic-shadow)')}
      {px(x + 1.5, 41, 1, 2.5, MAGIC_HIGHLIGHT)}
      {px(x + 0.5, 42, 3, 0.75, MAGIC_HIGHLIGHT)}
      {sole(x, 7)}
    </g>
  ),
  /** Skate: a blade under the sole, which is the only footwear here that changes the outline below it. */
  skate: (x) => (
    <g>
      {px(x - 0.5, 41.5, 6, 3, WHITE)}
      {px(x - 0.5, 41.5, 6, 0.75, ACCENT)}
      {px(x - 1, 44.5, 7, 0.75, SECONDARY_SHADOW)}
      {px(x - 1, 45.5, 7, 0.5, 'var(--av-accent-highlight)')}
    </g>
  ),
  /** Talon guard: an open cage that leaves a clawed foot showing, for anything that has claws. */
  talonguard: (x) => (
    <g>
      {px(x, 41.5, 5, 1.5, SECONDARY)}
      {px(x - 0.5, 43, 6, 1, SECONDARY_SHADOW)}
      {px(x - 0.5, 44, 1.5, 1.5, WHITE)}
      {px(x + 1.75, 44, 1.5, 1.5, WHITE)}
      {px(x + 4, 44, 1.5, 1.5, WHITE)}
      {sole(x, 7)}
    </g>
  ),
  /** Thruster boot: a vent at the heel and a lit ring, for the chassis families. */
  thrusterboot: (x) => (
    <g>
      {px(x - 0.5, 41.5, 6, 3, SECONDARY_SHADOW)}
      {px(x - 0.5, 41.5, 6, 0.75, ACCENT)}
      {px(x - 1, 43.5, 2, 2, SECONDARY)}
      {px(x - 1, 44.5, 2, 0.75, MAGIC_HIGHLIGHT)}
      {sole(x, 8)}
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Handwear — drawn inside an arm, at the hand
 * ──────────────────────────────────────────────────────────────────────────── */

const handwearStyles: Record<string, HandwearShape> = {
  none: () => <g />,
  /** A plain knitted glove: the cuff is the tell, because the hand itself is three pixels. */
  knitglove: (x, mirrored) => (
    <g>
      {px(x + 0.25, 27.5, 3, 1.25, SECONDARY)}
      {px(x + 0.25, 28.75, 3, 3.75, SECONDARY_SHADOW)}
      {px(mirrored ? x + 0.25 : x + 2.5, 28.75, 0.75, 3.75, 'var(--av-secondary-highlight)')}
    </g>
  ),
  /** Fingerless: the cuff stops and the hand carries on, which is the whole silhouette. */
  fingerless: (x) => (
    <g>
      {px(x + 0.25, 27.5, 3, 2.5, SECONDARY)}
      {px(x + 0.25, 27.5, 3, 0.75, ACCENT)}
    </g>
  ),
  /** A gauntlet: plate to the wrist with a lit knuckle band. */
  gauntlet: (x) => (
    <g>
      {px(x - 0.25, 26.5, 3.5, 2, SECONDARY)}
      {px(x + 0.25, 28.5, 3, 4, SECONDARY)}
      {px(x + 0.25, 30, 3, 0.75, ACCENT)}
      {px(x - 0.25, 26.5, 3.5, 0.75, 'var(--av-secondary-highlight)')}
    </g>
  ),
  /** A long opera glove: the only one that reaches past the elbow. */
  longglove: (x) => (
    <g>
      {px(x + 0.25, 24, 3, 8.5, WHITE)}
      {px(x + 0.25, 24, 3, 0.75, ACCENT)}
      {px(x + 0.25, 31, 3, 1.5, 'var(--av-accent-highlight)')}
    </g>
  ),
  /** A wrapped hand: bandage over the knuckles, for the fighters. */
  handwrap: (x) => (
    <g>
      {px(x + 0.25, 28, 3, 0.75, WHITE)}
      {px(x + 0.25, 29.25, 3, 0.75, WHITE)}
      {px(x + 0.25, 30.5, 3, 0.75, WHITE)}
    </g>
  ),
  /** A cyber hand: a lit seam down the back of it. */
  cyberhand: (x) => (
    <g>
      {px(x + 0.25, 27.5, 3, 5, SECONDARY_SHADOW)}
      {px(x + 1.25, 28, 1, 4, MAGIC)}
      {px(x + 0.25, 27.5, 3, 0.75, MAGIC_HIGHLIGHT)}
    </g>
  ),
  /** A claw guard: three points past the fingers. */
  clawguard: (x) => (
    <g>
      {px(x + 0.25, 27.5, 3, 3, SECONDARY)}
      {px(x + 0.25, 30.5, 0.75, 2, WHITE)}
      {px(x + 1.5, 30.5, 0.75, 2, WHITE)}
      {px(x + 2.75, 30.5, 0.75, 2, WHITE)}
    </g>
  ),
  /** A rune band: not a glove at all, which is why it reads differently from the rest. */
  runeband: (x) => (
    <g>
      {px(x - 0.25, 27, 3.5, 1.5, MAGIC)}
      {px(x - 0.25, 27, 3.5, 0.5, MAGIC_HIGHLIGHT)}
      <g opacity="0.45">{px(x - 0.75, 26.5, 4.5, 2.5, MAGIC)}</g>
    </g>
  )
};

/* ────────────────────────────────────────────────────────────────────────────
 * Outerwear and neckwear — drawn inside the torso
 * ──────────────────────────────────────────────────────────────────────────── */

const outerwearStyles: Record<string, () => ReactElement> = {
  none: () => <g />,
  /** An open coat: two panels down the sides with the shirt showing between them. */
  opencoat: () => (
    <>
      {px(15.5, 21, 4, 14, SECONDARY)}
      {px(28.5, 21, 4, 14, SECONDARY)}
      {px(15.5, 21, 4, 1, 'var(--av-secondary-highlight)')}
      {px(28.5, 21, 4, 1, 'var(--av-secondary-highlight)')}
      {px(15.5, 33.5, 4, 1, SECONDARY_SHADOW)}
      {px(28.5, 33.5, 4, 1, SECONDARY_SHADOW)}
    </>
  ),
  /** A gilet: cropped, quilted, no sleeves — so it stops at the waist and never past the shoulder. */
  gilet: () => (
    <>
      {px(16, 21, 4, 11, PRIMARY)}
      {px(28, 21, 4, 11, PRIMARY)}
      {px(16, 24, 4, 0.75, PRIMARY_SHADOW)}
      {px(28, 24, 4, 0.75, PRIMARY_SHADOW)}
      {px(16, 27.5, 4, 0.75, PRIMARY_SHADOW)}
      {px(28, 27.5, 4, 0.75, PRIMARY_SHADOW)}
    </>
  ),
  /** A hooded cloak: shoulders and a hood roll above them. */
  hoodedcloak: () => (
    <>
      {px(15, 20.5, 18, 3, SECONDARY_SHADOW)}
      {px(18, 18.5, 12, 2.5, SECONDARY)}
      {px(18, 18.5, 12, 0.75, 'var(--av-secondary-highlight)')}
      {px(15, 23.5, 3.5, 12, SECONDARY_SHADOW)}
      {px(29.5, 23.5, 3.5, 12, SECONDARY_SHADOW)}
    </>
  ),
  /** A tabard: one panel front and centre, belted. The heraldry slot. */
  tabard: () => (
    <>
      {px(20, 21, 8, 13, ACCENT)}
      {px(20, 21, 8, 0.75, 'var(--av-accent-highlight)')}
      {px(17, 27.5, 14, 1.5, SECONDARY_SHADOW)}
      {px(22.5, 23.5, 3, 3, WHITE)}
    </>
  ),
  /** A harness: straps rather than cloth, so the shirt under it is the visible half. */
  harness: () => (
    <>
      {px(19, 21, 1.5, 13, SECONDARY_SHADOW)}
      {px(27.5, 21, 1.5, 13, SECONDARY_SHADOW)}
      {px(17, 26, 14, 1.5, SECONDARY_SHADOW)}
      {px(22.5, 25.5, 3, 2.5, ACCENT)}
    </>
  ),
  /** A lab overcoat: long, white, open, with the hem below the waist. */
  overcoat: () => (
    <>
      {px(15.5, 21, 3.5, 15, WHITE)}
      {px(29, 21, 3.5, 15, WHITE)}
      {px(15.5, 21, 3.5, 1, 'var(--av-primary-highlight)')}
      {px(29, 21, 3.5, 1, 'var(--av-primary-highlight)')}
      {px(16.5, 29, 2, 2.5, SECONDARY_SHADOW)}
    </>
  ),
  /** A circuit mantle: lit traces down two narrow panels. */
  circuitmantle: () => (
    <>
      {px(16, 21, 3, 13, SECONDARY_SHADOW)}
      {px(29, 21, 3, 13, SECONDARY_SHADOW)}
      {px(17, 22, 1, 11, MAGIC)}
      {px(30, 22, 1, 11, MAGIC)}
      {px(16, 21, 3, 0.75, MAGIC_HIGHLIGHT)}
      {px(29, 21, 3, 0.75, MAGIC_HIGHLIGHT)}
    </>
  ),
  /** Feathered pauldrons over the shoulders and nothing below them. */
  plumemantle: () => (
    <>
      {px(15, 20.5, 6, 4, WHITE)}
      {px(27, 20.5, 6, 4, WHITE)}
      {px(15, 24, 6, 0.75, ACCENT)}
      {px(27, 24, 6, 0.75, ACCENT)}
      {px(20, 20.5, 8, 1.5, WHITE)}
    </>
  )
};

const neckwearStyles: Record<string, () => ReactElement> = {
  none: () => <g />,
  /** A school tie, which is the one every uniform in the country already has. */
  schooltie: () => (
    <>
      {px(21.5, 21, 5, 1.5, WHITE)}
      {px(23.25, 22.5, 1.5, 5, ACCENT)}
      {px(23.25, 22.5, 1.5, 1, 'var(--av-accent-highlight)')}
    </>
  ),
  /** A long scarf: round the neck and hanging down one side. */
  longscarf: () => (
    <>
      {px(19.5, 20.5, 9, 2.5, ACCENT)}
      {px(19.5, 20.5, 9, 0.75, 'var(--av-accent-highlight)')}
      {px(20, 23, 2.5, 8, ACCENT)}
      {px(20, 30, 2.5, 1, 'var(--av-accent-shadow)')}
    </>
  ),
  /** A bow, centred under the chin. */
  ribbonbow: () => (
    <>
      {px(21, 21, 6, 1.25, ACCENT)}
      {px(20.5, 21.5, 2.5, 2, ACCENT)}
      {px(25, 21.5, 2.5, 2, ACCENT)}
      {px(23, 21.5, 2, 2, 'var(--av-accent-shadow)')}
    </>
  ),
  /** A fur collar: a soft ring that breaks the shoulder line. */
  furcollar: () => (
    <>
      {px(18.5, 19.5, 11, 3, WHITE)}
      {px(18.5, 19.5, 11, 0.75, 'var(--av-primary-highlight)')}
      {px(19.5, 22.5, 9, 0.75, SECONDARY_SHADOW)}
    </>
  ),
  /** A pendant on a cord: the smallest thing in the drawer, and readable because it is lit. */
  pendant: () => (
    <>
      {px(21, 21, 6, 0.75, SECONDARY_SHADOW)}
      {px(23.5, 21.75, 1, 2, SECONDARY_SHADOW)}
      {px(22.5, 23.75, 3, 3, MAGIC)}
      {px(23.25, 24.5, 1.5, 1.5, MAGIC_HIGHLIGHT)}
    </>
  ),
  /** A high gorget: metal, and the only one that covers the throat entirely. */
  gorget: () => (
    <>
      {px(19, 19, 10, 3.5, SECONDARY)}
      {px(19, 19, 10, 0.75, 'var(--av-secondary-highlight)')}
      {px(19, 22, 10, 0.75, SECONDARY_SHADOW)}
      {px(23, 20, 2, 1.5, ACCENT)}
    </>
  ),
  /** A neon choker: a lit band and a drop. */
  neonchoker: () => (
    <>
      {px(20.5, 20.75, 7, 1.25, MAGIC)}
      {px(20.5, 20.75, 7, 0.5, MAGIC_HIGHLIGHT)}
      {px(23.5, 22, 1, 1.5, MAGIC_HIGHLIGHT)}
    </>
  ),
  /** A bell collar, for anything with ears. */
  bellcollar: () => (
    <>
      {px(20, 20.75, 8, 1.5, ACCENT)}
      {px(20, 20.75, 8, 0.5, 'var(--av-accent-highlight)')}
      {px(23, 22.25, 2, 2, WHITE)}
      {px(23.5, 23, 1, 1, OUTLINE)}
    </>
  )
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


function foxTails(): ReactElement {
  return (
    <g data-part="tail">
      {bushyTail()}
      <ellipse cx="37" cy="35" rx="3.5" ry="3" fill={HAIR} />
      <ellipse cx="40" cy="33" rx="3" ry="2.5" fill={WHITE} />
    </g>
  );
}

/* ── The reward tier, on the back ──
 *
 * Eight pieces a child is saving towards rather than starting with, and each one carries something
 * the free half of the wardrobe does not: a companion that is its own drawing, a banded light
 * standing in for an ambient glow, a trail that reads as motion in a still frame.
 *
 * All of them take their colour from the child's own six rather than introducing a ninth hue, which
 * is what keeps a legendary item inside the app's own dark monochrome instead of making a hole in
 * it. `data-part="tail"` and `data-part="wing"` are how a piece asks the poses to swing it — a
 * familiar that hangs dead still while the figure runs is a sticker rather than a companion.
 */
function runicFamiliar(): ReactElement {
  return (
    <g data-part="back">
      <g data-part="tail">
        <g opacity="0.3"><circle cx="37" cy="22" r="7" fill={MAGIC} /></g>
        <polygon points="37,17 41,22 37,27 33,22" fill={MAGIC} />
        <polygon points="37,19 39.5,22 37,25 34.5,22" fill={MAGIC_HIGHLIGHT} />
        {px(35.5, 21, 1, 1, WHITE)}
        {px(38, 23, 1, 1, WHITE)}
        {px(31, 28, 1.5, 1.5, MAGIC)}
        {px(41, 16, 1.5, 1.5, MAGIC)}
      </g>
    </g>
  );
}

function stardustTrail(): ReactElement {
  return (
    <g data-part="back">
      <g data-part="tail">
        {px(31, 26, 3, 3, WHITE)}
        <g opacity="0.75">{px(35, 29, 2.5, 2.5, ACCENT)}</g>
        <g opacity="0.5">{px(38, 32, 2, 2, ACCENT)}</g>
        <g opacity="0.3">{px(40.5, 35, 1.5, 1.5, WHITE)}</g>
        <g opacity="0.18">{px(42.5, 37.5, 1, 1, WHITE)}</g>
      </g>
    </g>
  );
}

function prismWings(): ReactElement {
  return (
    <g data-part="wing" opacity="0.9">
      <polygon points="17,21 4,15 6,31 17,31" fill={MAGIC} />
      <polygon points="31,21 44,15 42,31 31,31" fill={MAGIC} />
      <polygon points="17,23 7,19 7,24 17,25" fill={MAGIC_HIGHLIGHT} />
      <polygon points="31,23 41,19 41,24 31,25" fill={MAGIC_HIGHLIGHT} />
      <polygon points="17,27 7,26 8,30 17,30" fill={ACCENT} />
      <polygon points="31,27 41,26 40,30 31,30" fill={ACCENT} />
    </g>
  );
}

function voidCloak(): ReactElement {
  return (
    <g data-part="back">
      <polygon points="16,22 32,22 36,44 12,44" fill="var(--av-magic-outline)" />
      {px(16, 22, 16, 1.5, MAGIC)}
      <g opacity="0.45">{px(14, 30, 20, 1.5, MAGIC)}</g>
      {px(17, 36, 1.5, 1.5, MAGIC_HIGHLIGHT)}
      {px(27, 39, 1.5, 1.5, MAGIC_HIGHLIGHT)}
      {px(22, 33, 1, 1, WHITE)}
    </g>
  );
}

function phoenixPlume(): ReactElement {
  return (
    <g data-part="tail">
      <g opacity="0.25"><ellipse cx="36" cy="32" rx="10" ry="12" fill={MAGIC} /></g>
      <polygon points="30,34 44,24 42,32 32,37" fill={ACCENT} />
      <polygon points="30,36 45,36 41,42 32,40" fill="var(--av-accent-shadow)" />
      <polygon points="30,33 40,27 39,31 32,34" fill={WHITE} opacity="0.5" />
      {px(42, 25, 1.5, 1.5, WHITE)}
    </g>
  );
}

function gearHalo(): ReactElement {
  return (
    <g data-part="back">
      <g data-part="orbs">
        <g opacity="0.35"><ellipse cx="24" cy="3" rx="11" ry="3" fill={MAGIC} /></g>
        <ellipse cx="24" cy="3" rx="9" ry="2" fill="none" stroke={SECONDARY} strokeWidth="1.5" />
        {px(14, 2, 2, 2, ACCENT)}
        {px(32, 2, 2, 2, ACCENT)}
        {px(23, 0.5, 2, 1.5, ACCENT)}
      </g>
    </g>
  );
}

function crystalSpire(): ReactElement {
  return (
    <g data-part="back">
      <g opacity="0.25"><ellipse cx="24" cy="26" rx="16" ry="12" fill={MAGIC} /></g>
      <polygon points="10,34 12,20 15,34" fill={MAGIC} />
      <polygon points="14,34 17,16 19,34" fill={MAGIC_HIGHLIGHT} />
      <polygon points="33,34 35,16 38,34" fill={MAGIC_HIGHLIGHT} />
      <polygon points="37,34 39,21 41,34" fill={MAGIC} />
    </g>
  );
}

/**
 * A ribbon trailing behind one shoulder, not a plank through both of them.
 *
 * The first cut was three bars 36 units wide at chest height. Behind the figure or not, a
 * full-width horizontal bar sticking out past both arms reads as a plank the character has been
 * nailed to — and it crossed the one part of the silhouette a child actually looks at.
 *
 * Rooted at the far shoulder and falling away behind, it is the same colours doing the job they were
 * meant to do: a light that moves with the figure rather than a bar that spans it.
 */
function auroraSash(): ReactElement {
  return (
    <g data-part="back" opacity="0.85">
      <g data-part="wing">
        <polygon points="30,22 36,24 44,36 38,38" fill={MAGIC} />
        <polygon points="31,24 35.5,25.5 42,35 38,36" fill={ACCENT} opacity="0.8" />
        <polygon points="32,26 35,27 40,34 37.5,34.5" fill={MAGIC_HIGHLIGHT} opacity="0.7" />
        {px(29, 21.5, 3, 3, "var(--av-magic-shadow)")}
      </g>
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
  jetpack,
  runicfamiliar: runicFamiliar,
  stardusttrail: stardustTrail,
  prismwings: prismWings,
  voidcloak: voidCloak,
  phoenixplume: phoenixPlume,
  gearhalo: gearHalo,
  crystalspire: crystalSpire,
  aurorasash: auroraSash
};

/* ────────────────────────────────────────────────────────────────────────────
 * Front — what the near hand is holding
 * ──────────────────────────────────────────────────────────────────────────── */


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

function compass(): ReactElement {
  return (
    <g>
      <circle cx="14" cy="29.5" r="3" fill={SECONDARY} />
      <circle cx="14" cy="29.5" r="2" fill={WHITE} />
      <polygon points="14,27.75 14.75,29.5 14,31.25 13.25,29.5" fill={ACCENT} />
    </g>
  );
}

/* ── The reward tier, in the hand ──
 *
 * Same rule as the back half, and one extra constraint: a held thing hangs off the near wrist, which
 * the poses swing through a hundred and fifty degrees. Anything here has to read upside down, because
 * halfway through a cheer it is — which is why none of them carries text or a face. */
function runeBlade(): ReactElement {
  return (
    <g>
      <g opacity="0.3">{px(11.5, 12, 5, 18, MAGIC)}</g>
      {px(13, 13, 2, 16, WHITE)}
      {px(13, 16, 2, 1.5, MAGIC)}
      {px(13, 20, 2, 1.5, MAGIC)}
      {px(13, 24, 2, 1.5, MAGIC)}
      {px(11, 29, 6, 1.5, ACCENT)}
      {px(13, 30.5, 2, 3, SECONDARY_SHADOW)}
    </g>
  );
}

function familiarWisp(): ReactElement {
  return (
    <g data-part="orbs">
      <g opacity="0.3"><circle cx="13" cy="26" r="5" fill={MAGIC} /></g>
      <circle cx="13" cy="26" r="2.5" fill={MAGIC} />
      <circle cx="12.5" cy="25.5" r="1" fill={MAGIC_HIGHLIGHT} />
      {px(10, 31, 1.5, 1.5, MAGIC)}
      {px(16, 21, 1, 1, MAGIC_HIGHLIGHT)}
    </g>
  );
}

function holoGlobe(): ReactElement {
  return (
    <g opacity="0.9">
      <circle cx="14" cy="28" r="4" fill={MAGIC} />
      {px(10, 27.5, 8, 1, MAGIC_HIGHLIGHT)}
      <ellipse cx="14" cy="28" rx="1.5" ry="4" fill="none" stroke={MAGIC_HIGHLIGHT} strokeWidth="0.5" />
      {px(11, 32.5, 6, 1, ACCENT)}
    </g>
  );
}

function chronoWatch(): ReactElement {
  return (
    <g>
      <circle cx="14" cy="28.5" r="4" fill={SECONDARY} />
      <circle cx="14" cy="28.5" r="3" fill={WHITE} />
      {px(13.5, 26, 1, 3, OUTLINE)}
      {px(14, 28, 2.5, 1, OUTLINE)}
      {px(13, 23.5, 2, 1.5, ACCENT)}
    </g>
  );
}

function starLantern(): ReactElement {
  return (
    <g>
      <g opacity="0.3"><circle cx="14" cy="29" r="6.5" fill={ACCENT} /></g>
      {px(13.5, 22, 1, 3, SECONDARY_SHADOW)}
      {px(11, 25, 6, 7, SECONDARY)}
      {px(12, 26, 4, 5, ACCENT)}
      <polygon points="14,26.5 14.8,28.5 16.8,28.5 15.2,29.8 15.8,31.8 14,30.6 12.2,31.8 12.8,29.8 11.2,28.5 13.2,28.5" fill={WHITE} />
    </g>
  );
}

function neonFan(): ReactElement {
  return (
    <g>
      <polygon points="8,24 20,24 14,31" fill={MAGIC} />
      <polygon points="10,25 18,25 14,29.5" fill={MAGIC_HIGHLIGHT} />
      {px(13.5, 30, 1, 4, SECONDARY_SHADOW)}
    </g>
  );
}

function petDrake(): ReactElement {
  return (
    <g data-part="held">
      {px(10, 27, 8, 5, SECONDARY)}
      {px(17, 25.5, 3, 3, SECONDARY)}
      <polygon points="10,27 7,22 12,25" fill={SECONDARY_SHADOW} />
      <polygon points="14,27 12,22 17,25" fill={SECONDARY_SHADOW} />
      {px(18, 26.5, 1, 1, ACCENT)}
      {px(10, 32, 7, 1, SECONDARY_SHADOW)}
      {px(8, 29, 2.5, 1.5, SECONDARY_SHADOW)}
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
  compass,
  runeblade: runeBlade,
  familiarwisp: familiarWisp,
  hologlobe: holoGlobe,
  chronowatch: chronoWatch,
  starlantern: starLantern,
  neonfan: neonFan,
  petdrake: petDrake
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
  /** The cut of the eye. A colour cannot tell two expressions apart at this size; a shape can. */
  eyeShape?: EyeShape;
  wink?: boolean;
  brow?: BrowShape;
  mouth?: MouthShape;
}

/*
 * Twelve expressions, and what each one is made of.
 *
 * They used to differ by iris colour and a blush flag, which is why a grid of them read as one
 * child painted twelve times: same lid, same brow, same three-pixel mouth on every face in the
 * school. Each row now names a cut of eye, a brow and a mouth — shapes, which survive being 48
 * pixels across, where a violet iris does not.
 */
const faceStyles: Record<string, FaceStyle> = {
  neutral: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)', brow: 'flat', mouth: 'smile' },
  smile: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)', blush: true, brow: 'raised', mouth: 'grin' },
  focused: { eye: OUTLINE, sharp: true, brow: 'angled', mouth: 'flat' },
  glow: { eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, eyeShape: 'wide', brow: 'none', mouth: 'smile' },
  fangs: { eye: OUTLINE, brow: 'angled', mouth: 'fang' },
  sleepy: { eye: SECONDARY, eyeLight: 'var(--av-magic-highlight)', eyeShape: 'sleepy', brow: 'raised', mouth: 'none' },
  wink: { eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)', blush: true, wink: true, brow: 'raised', mouth: 'grin' },
  star: { eye: MAGIC, eyeLight: WHITE, eyeShape: 'star', blush: true, brow: 'raised', mouth: 'open' },
  wide: { eye: OUTLINE, eyeLight: WHITE, eyeShape: 'wide', brow: 'raised', mouth: 'open' },
  fierce: { eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT, sharp: true, brow: 'angled', mouth: 'fang' },
  calm: { eye: SECONDARY, eyeLight: 'var(--av-magic-highlight)', brow: 'flat', mouth: 'cat' },
  cyber: { eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, sharp: true, brow: 'none', mouth: 'flat' }
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
    <g data-part="auraPulse">
      <ellipse
        cx="24" cy="27" rx="17" ry="20" fill="none" stroke={stroke} strokeWidth="1"
        {...(dashed ? { strokeDasharray: '3 2' } : {})}
      />
    </g>
  </g>
);

/*
 * The sixteen auras, and the one thing they all used to have in common.
 *
 * Each was a still drawing painted behind the figure — a ring of fire that never flickered, embers
 * that never rose, an aurora hanging in the air like a printed stripe. Light is the one part of a
 * figure that has no business holding still, and a still drawing of light reads as a sticker of it.
 *
 * So each one names a motion the stylesheet knows: `auraPulse` for a rim that breathes, `auraRise`
 * for anything leaving the ground, `auraSway` for a curtain, `auraSpin` for a ring that turns, and
 * `auraFlicker` for current, which switches rather than fades. A few gained particles to move with:
 * one mote drifting alone reads as a dust speck, three read as a stream.
 *
 * All of it is transform and opacity, all of it is switched off at `compact` and under
 * `prefers-reduced-motion`, and a new aura that names no motion simply stands still as before.
 */
const auras: Record<string, () => ReactElement> = {
  none: () => <g data-part="fx" />,
  fire: () => (
    <g data-part="fx" data-fx="aura" opacity="0.6">
      <g data-part="auraRise">
        <polygon points="24,4 28,14 24,11 20,14" fill={ACCENT} />
        <polygon points="10,34 13,24 16,32" fill={ACCENT} />
        <polygon points="38,34 35,24 32,32" fill={ACCENT} />
        <polygon points="13,41 15,34 17,40" fill={MAGIC_HIGHLIGHT} />
        <polygon points="33,42 35,35 37,41" fill={MAGIC_HIGHLIGHT} />
      </g>
    </g>
  ),
  ice: () => ringAura(MAGIC_HIGHLIGHT, true),
  shadow: () => (
    <g data-part="fx" data-fx="aura" opacity="0.5">
      <g data-part="auraPulse">
        <ellipse cx="24" cy="30" rx="16" ry="14" fill={OUTLINE} opacity="0.35" />
        <ellipse cx="24" cy="30" rx="18" ry="16" fill="none" stroke={OUTLINE} strokeWidth="0.75" opacity="0.3" />
      </g>
    </g>
  ),
  nature: () => (
    <g data-part="fx" data-fx="aura" opacity="0.6">
      <g data-part="auraRise">
        <ellipse cx="12" cy="24" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(-25 12 24)" />
        <ellipse cx="36" cy="28" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(25 36 28)" />
        <ellipse cx="14" cy="33" rx="2" ry="1.25" fill={ACCENT} transform="rotate(15 14 33)" />
        <ellipse cx="34" cy="37" rx="2" ry="1.25" fill={SECONDARY} transform="rotate(-20 34 37)" />
      </g>
    </g>
  ),
  star: () => spellAura(),
  cyber: () => (
    <g data-part="fx" data-fx="aura" opacity="0.5">
      <g data-part="auraFlicker">
        {px(6, 20, 36, 0.5, MAGIC)}
        {px(6, 30, 36, 0.5, MAGIC)}
        {px(6, 40, 36, 0.5, MAGIC)}
      </g>
    </g>
  ),
  lightning: () => (
    <g data-part="fx" data-fx="aura" opacity="0.65">
      <g data-part="auraFlicker">
        <polygon points="9,18 13,24 10,24 13,31" fill={MAGIC_HIGHLIGHT} />
        <polygon points="39,18 35,24 38,24 35,31" fill={MAGIC_HIGHLIGHT} />
        {px(6, 27, 1.5, 1.5, ACCENT)}
        {px(41, 22, 1.5, 1.5, ACCENT)}
      </g>
    </g>
  ),

  /* ── The reward tier ──
   * An aura is the one layer allowed to be a wash rather than a shape, so these are banded
   * opacities standing in for an ambient light. Three steps rather than a smooth ramp: a
   * forty-stop gradient stops reading as pixels and starts reading as a blur, and the whole set is
   * drawn as pixels. */
  prism: () => (
    <g data-part="fx" data-fx="aura">
      <g data-part="auraSway">
        <g opacity="0.5">{px(6, 14, 5, 26, MAGIC)}{px(37, 14, 5, 26, MAGIC)}</g>
        <g opacity="0.3">{px(3, 18, 3, 18, ACCENT)}{px(42, 18, 3, 18, ACCENT)}</g>
        <g opacity="0.7">{px(9, 22, 1.5, 10, MAGIC_HIGHLIGHT)}{px(38, 22, 1.5, 10, MAGIC_HIGHLIGHT)}</g>
      </g>
    </g>
  ),
  ember: () => (
    <g data-part="fx" data-fx="aura">
      <g data-part="auraRise">
        <g opacity="0.8">{px(10, 38, 2.5, 2.5, ACCENT)}</g>
        <g opacity="0.8">{px(36, 40, 2.5, 2.5, ACCENT)}</g>
        <g opacity="0.55">{px(12, 32, 2, 2, ACCENT)}</g>
        <g opacity="0.55">{px(34, 30, 2, 2, ACCENT)}</g>
        <g opacity="0.3">{px(9, 25, 1.5, 1.5, WHITE)}{px(38, 22, 1.5, 1.5, WHITE)}</g>
      </g>
    </g>
  ),
  /*
   * A rim rather than a disc.
   *
   * The first cut was two filled ellipses at 0.55 and 0.3 across the whole figure, and a filled
   * shape behind a character does not read as light — it reads as the character standing in front of
   * a large coloured blob, dimmed by it. An aura is the *edge* of something: a ring at the silhouette
   * and a few motes leaving it. Same idea for `solar` below, and for the same reason.
   */
  void: () => (
    <g data-part="fx" data-fx="aura">
      <g data-part="auraPulse">
        <ellipse cx="24" cy="29" rx="17" ry="16" fill="none" stroke="var(--av-magic-outline)" strokeWidth="3" opacity="0.45" />
        <ellipse cx="24" cy="29" rx="19" ry="17.5" fill="none" stroke={MAGIC} strokeWidth="1.5" opacity="0.3" />
      </g>
      <g data-part="auraRise">
        {px(8, 22, 1.5, 1.5, MAGIC_HIGHLIGHT)}
        {px(38, 34, 1.5, 1.5, MAGIC_HIGHLIGHT)}
        {px(11, 40, 1, 1, MAGIC)}
      </g>
    </g>
  ),
  bloom: () => (
    <g data-part="fx" data-fx="aura" opacity="0.8">
      <g data-part="auraRise">
        <ellipse cx="9" cy="20" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(-25 9 20)" />
        <ellipse cx="11" cy="30" rx="2" ry="1.25" fill={SECONDARY} transform="rotate(15 11 30)" />
        <ellipse cx="8" cy="38" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(30 8 38)" />
        <ellipse cx="39" cy="24" rx="2.5" ry="1.5" fill={ACCENT} transform="rotate(25 39 24)" />
        <ellipse cx="37" cy="34" rx="2" ry="1.25" fill={SECONDARY} transform="rotate(-15 37 34)" />
      </g>
    </g>
  ),
  /*
   * A curtain behind the figure, not a set of bands across it.
   *
   * Horizontal bands at y 10, 14 and 18 ran straight through the skull, which is y 4–17. Behind the
   * head they still read as stripes across a face, because a stripe that starts and ends outside the
   * silhouette is a stripe whichever layer it is on. Vertical columns hang behind the figure the way
   * an aurora actually does, and they leave the face alone by construction.
   */
  aurora: () => (
    <g data-part="fx" data-fx="aura">
      <g data-part="auraSway">
        <g opacity="0.4">{px(7, 4, 3, 34, MAGIC)}{px(38, 6, 3, 30, MAGIC)}</g>
        <g opacity="0.28">{px(11, 8, 2, 28, ACCENT)}{px(35, 3, 2, 33, ACCENT)}</g>
        <g opacity="0.16">{px(4, 10, 1.5, 24, MAGIC_HIGHLIGHT)}{px(43, 12, 1.5, 22, MAGIC_HIGHLIGHT)}</g>
      </g>
    </g>
  ),
  circuit: () => (
    <g data-part="fx" data-fx="aura" opacity="0.65">
      <g data-part="auraFlicker">
        {px(6, 22, 6, 1, MAGIC)}{px(11, 22, 1, 12, MAGIC)}{px(6, 33, 6, 1, MAGIC)}
        {px(36, 18, 6, 1, MAGIC)}{px(36, 18, 1, 14, MAGIC)}{px(36, 31, 6, 1, MAGIC)}
        {px(10, 21, 2.5, 2.5, MAGIC_HIGHLIGHT)}
        {px(35, 30, 2.5, 2.5, MAGIC_HIGHLIGHT)}
      </g>
    </g>
  ),
  frostring: () => (
    <g data-part="fx" data-fx="aura" opacity="0.75">
      <g data-part="auraSpin">
        <ellipse cx="24" cy="44" rx="15" ry="3.5" fill="none" stroke={ACCENT} strokeWidth="1" />
        <ellipse cx="24" cy="44" rx="11" ry="2.5" fill="none" stroke={WHITE} strokeWidth="0.5" />
        {px(10, 42, 2, 2, WHITE)}
        {px(36, 42, 2, 2, WHITE)}
      </g>
    </g>
  ),
  solar: () => (
    <g data-part="fx" data-fx="aura">
      <g data-part="auraPulse">
        <circle cx="24" cy="26" r="19" fill="none" stroke={ACCENT} strokeWidth="2" opacity="0.4" />
        <circle cx="24" cy="26" r="21.5" fill="none" stroke={WHITE} strokeWidth="1" opacity="0.22" />
      </g>
      <g data-part="auraSpin">
        <polygon points="24,3 25.5,8 22.5,8" fill={ACCENT} opacity="0.8" />
        <polygon points="5,14 10,16 7,19" fill={ACCENT} opacity="0.8" />
        <polygon points="43,14 38,16 41,19" fill={ACCENT} opacity="0.8" />
        <polygon points="24,47 22.5,42 25.5,42" fill={ACCENT} opacity="0.6" />
      </g>
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
  ),

  /* ── The reward tier ──
   * An effect is in front of everything, which makes it the one layer that can ruin a face. Every
   * one of these keeps clear of x 15–33 at the eye line, and none is more than five shapes. A trail
   * is four squares at falling opacities: that reads as motion in a still frame, and costs four
   * rectangles rather than a filter — which matters, because these are the pieces a child who has
   * earned them wears everywhere, including in a list of forty. */
  stardust: () => (
    <g data-part="fx">
      {px(36, 10, 2.5, 2.5, WHITE)}
      <g opacity="0.7">{px(39, 15, 2, 2, ACCENT)}</g>
      <g opacity="0.45">{px(41.5, 20, 1.5, 1.5, ACCENT)}</g>
      <g opacity="0.25">{px(43, 25, 1, 1, WHITE)}</g>
    </g>
  ),
  runeglyphs: () => (
    <g data-part="fx" opacity="0.9">
      <polygon points="8,12 12,12 12,13 10,13 10,17 9,17 9,13 8,13" fill={MAGIC} />
      <polygon points="37,18 41,18 41,19 39.5,19 39.5,23 38.5,23 38.5,19 37,19" fill={MAGIC} />
      {px(11, 25, 2, 2, MAGIC_HIGHLIGHT)}
    </g>
  ),
  neonstreak: () => (
    <g data-part="fx">
      {px(3, 22, 9, 1, MAGIC)}
      <g opacity="0.6">{px(2, 26, 7, 1, MAGIC)}</g>
      {px(36, 30, 9, 1, MAGIC_HIGHLIGHT)}
      <g opacity="0.6">{px(39, 34, 7, 1, MAGIC)}</g>
    </g>
  ),
  petalfall: () => (
    <g data-part="fx" opacity="0.85">
      <ellipse cx="9" cy="8" rx="2" ry="1.25" fill={ACCENT} transform="rotate(-30 9 8)" />
      <ellipse cx="38" cy="14" rx="2" ry="1.25" fill={ACCENT} transform="rotate(25 38 14)" />
      <ellipse cx="6" cy="24" rx="1.5" ry="1" fill={PRIMARY_HIGHLIGHT} transform="rotate(10 6 24)" />
      <ellipse cx="42" cy="32" rx="1.5" ry="1" fill={ACCENT} transform="rotate(-15 42 32)" />
    </g>
  ),
  emberrise: () => (
    <g data-part="fx">
      {px(9, 36, 2, 2, ACCENT)}
      <g opacity="0.7">{px(8, 29, 1.5, 1.5, ACCENT)}</g>
      <g opacity="0.45">{px(10, 22, 1.5, 1.5, WHITE)}</g>
      {px(38, 34, 2, 2, ACCENT)}
      <g opacity="0.6">{px(40, 26, 1.5, 1.5, ACCENT)}</g>
    </g>
  ),
  glitch: () => (
    <g data-part="fx" opacity="0.8">
      {px(9, 19, 6, 1, MAGIC)}
      {px(11, 20, 6, 1, ACCENT)}
      {px(33, 35, 6, 1, MAGIC)}
      {px(31, 36, 6, 1, ACCENT)}
    </g>
  ),
  snowfall: () => (
    <g data-part="fx" opacity="0.9">
      {px(8, 9, 2, 2, WHITE)}
      {px(39, 16, 2, 2, WHITE)}
      {px(11, 26, 1.5, 1.5, WHITE)}
      {px(36, 32, 1.5, 1.5, WHITE)}
    </g>
  ),
  /*
   * An effect is drawn in front of everything, so this one has to be light or it is a veil over a
   * face. The first cut reached y 14 at a third opacity, which put a beige sheet over the hair and
   * the brow of every figure wearing it — the most expensive item in the catalogue, making its owner
   * harder to see.
   */
  halolight: () => (
    <g data-part="fx">
      <g opacity="0.22"><polygon points="19,0 29,0 32,8 16,8" fill={WHITE} /></g>
      <g opacity="0.12"><polygon points="16,0 32,0 36,7 12,7" fill={ACCENT} /></g>
      {px(19, 2.5, 10, 1, WHITE)}
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
 * The species this configuration is, which the character chosen answers before the race does.
 *
 * ── What was wrong ──
 * A child picked one of forty-one characters — น้องแมว, มังกรน้ำแข็ง, หุ่นยนต์ — and the figure did not
 * change. The wardrobe drew a complete human over the top of whatever had been chosen: its head,
 * its face, its torso, its legs and its arms, every time, whether or not the child had chosen
 * anything in those drawers. All that survived of the character was the handful of slots the
 * wardrobe happened to leave empty, which is why picking a cat produced a person with a tail.
 *
 * ── The rule ──
 * The character says what the body is. The race says it only when a child has picked one that is
 * not the default, because then they have said something specific that the character cannot know —
 * and a human-by-default race is not a statement, it is the absence of one. Everything a child
 * actually chose in a drawer still goes on top: this decides the body, never the clothes.
 */
function speciesOf(config: AvatarConfigV2): RaceShape & { hairRace: AvatarRace } {
  const race = config.race ?? 'human';
  if (race !== 'human' && races[race]) {
    return { ...races[race], hairRace: race };
  }
  const body = archetypeBodyFor(bodyArchetypeFor(config));
  return {
    ears: body.ears,
    snout: body.snout,
    whiskers: body.whiskers,
    claw: body.claw,
    round: body.round,
    hairRace: body.hairRace
  };
}

/**
 * Every slot of the figure, from one saved configuration.
 *
 * A missing choice is not an error and it is not a gap either: the slot is left out of the map, and
 * the compositor then draws the character's own — so a cat that has been given no hat keeps the
 * fur between its ears, and a drone that has been given no shirt keeps its chassis. The order of
 * the returned map does not matter; the compositor draws by `bodySlotOrder` and nothing else
 * decides it.
 */
export function figureSlotsFor(
  config: AvatarConfigV2, rig: DirectionRig = directionRig('front')
): Partial<Record<BodySlot, ReactElement>> {
  const race = speciesOf(config);

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
   * The style, fitted to the head it is going on, as two drawings.
   *
   * The fit is the character's rather than the race's now, which is what stops a cap sitting on a
   * muzzle as though the skull under it were human: a cut is authored against a fit and never
   * scaled to a skull, so the only way to put the same bob on a fox and on a child is to hand it
   * the right fit. `hairFor` still answers for an id it does not know, so a build that drops a
   * style does not blank out the children wearing it.
   *
   * No style chosen means no drawing rather than a fallback cut. A record that predates this drawer
   * keeps its character's own head — the fur between a cat's ears, a visor, a helm — which is the
   * thing a fallback cap was covering up.
   */
  const hair = hairId
    ? hairFor(baseOf(hairId), race.hairRace, rig)
    : { back: null, side: null, front: null };
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
   * The four that go inside something else.
   *
   * None of these is a compositing step. A shoe belongs to a foot and a foot swings; a glove belongs
   * to a hand and a hand swings; a coat and a scarf belong to a torso that leans, twists and
   * compresses. Drawn as layers of their own they would all stand perfectly still while the body
   * moved out from under them — the fault that hair had until the head became one thing — so each is
   * handed to the part that actually moves and drawn inside its group.
   *
   * `none` is a real row in each table and resolves to nothing, which is how a child takes a thing
   * off rather than swapping it for something else.
   */
  const shoeId = layerOf(config, 'footwear');
  const shoe = shoeId && baseOf(shoeId) !== 'none' ? footwearStyles[baseOf(shoeId)] : undefined;

  const gloveId = layerOf(config, 'handwear');
  const glove = gloveId && baseOf(gloveId) !== 'none' ? handwearStyles[baseOf(gloveId)] : undefined;

  const coatId = layerOf(config, 'outerwear');
  const coat = coatId && baseOf(coatId) !== 'none' ? outerwearStyles[baseOf(coatId)] : undefined;

  const collarId = layerOf(config, 'neckwear');
  const collar = collarId && baseOf(collarId) !== 'none' ? neckwearStyles[baseOf(collarId)] : undefined;

  const torsoExtra = {
    ...(coat ? { over: coat() } : {}),
    ...(collar ? { neck: collar() } : {})
  };

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

  /*
   * A garment is drawn when there is a garment, and not otherwise.
   *
   * The wardrobe used to fill these three slots whatever the child had chosen — a shirt, a pair of
   * trousers and two bare arms — which is how a robot chassis, a penguin's body and a drone's hull
   * all came out wearing the same school shirt. An empty drawer now leaves the slot out of the map
   * and the character's own body stands, which is what it was drawn for.
   *
   * The arms are here rather than beside them because they are half garment: they carry the
   * sleeve's colour, and the front one carries whatever is being held. Either of those is a reason
   * to draw them; neither being present is a reason to leave the character's own arms alone.
   */
  const holding = held && baseOf(frontId ?? '') !== 'none' ? held() : undefined;
  const slots: Partial<Record<BodySlot, ReactElement>> = {
    shadow: groundShadow(),
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
    })
  };

  /*
   * An expression is the child's when they picked one, and the character's when they did not.
   *
   * A cat has round pupils and a blush, a robot has a lit bar where a mouth would be, and both were
   * being painted over with the same neutral pair of eyes — including on the saved avatars that
   * predate this drawer entirely and never asked for a neutral face.
   */
  if (face) {
    slots.face = faceFeatures({
      eye: face.eye ?? OUTLINE,
      ...(face?.eyeLight === undefined ? {} : { eyeLight: face.eyeLight }),
      ...(face?.sharp === undefined ? {} : { sharp: face.sharp }),
      ...(face?.blush === undefined ? {} : { blush: face.blush }),
      ...(face?.eyeShape === undefined ? {} : { eyeShape: face.eyeShape }),
      ...(face?.wink === undefined ? {} : { wink: face.wink }),
      ...(face?.brow === undefined ? {} : { brow: face.brow }),
      ...(face?.mouth === undefined ? {} : { mouth: face.mouth }),
      snout: race.snout,
      ...(race.whiskers === undefined ? {} : { whiskers: race.whiskers }),
      rig
    });
  }

  /* The wrap round the ear and the jaw: over the edge of the face, under the fringe. Without it a
     turned head shows a band of bare scalp between the cap and the jaw. */
  if (hair.side) slots.hair_side = hair.side;
  /* The cap and the fringe. Length and volume are not here — they went into `hair_back`. */
  if (hair.front) slots.hair_headwear = hair.front;

  if (race.round) {
    // No waist to cut a garment for, so the body is one shape and the arms are flippers.
    slots.torso_body = torsoRound();
    slots.legs_feet = legsWebbed();
    slots.back_arm = flipperArm('back');
    slots.front_arm_weapon = flipperArm('front');
  } else {
    /*
     * A coat, a scarf, a shoe or a glove is reason enough to draw the part it goes on.
     *
     * Each of these used to be gated behind the garment under it: no shirt meant no torso group, so
     * an overcoat drew nothing; no trousers meant no legs, so a pair of boots drew nothing; and the
     * arms only existed when there was a sleeve or something in the hand, so gloves drew nothing.
     * A child who put on only the new thing saw no change at all, which is the worst possible answer
     * — it reads as the drawer being broken rather than as a choice not taken.
     */
    if (top) slots.torso_body = topFrom(top, torsoExtra);
    else {
      const bare = torsoLayersOnly(torsoExtra);
      if (bare) slots.torso_body = bare;
    }
    if (bottom) slots.legs_feet = bottom(shoe);
    else if (shoe) slots.legs_feet = legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN, shoe });
    if (top || holding || glove) {
      slots.back_arm = backArm({ sleeve, skin: SKIN, cuff: glove });
      slots.front_arm_weapon = frontArm({ sleeve, skin: SKIN, cuff: glove }, holding);
    }
  }

  /*
   * Worn rather than grown, and last over the head: ears and horns first, then a hat, then what is
   * over the eyes. A fringe under a hat and a hat under a fringe are different drawings.
   *
   * Left out entirely when there is nothing to put there, so a character's own helm, visor or pair
   * of horns is not replaced by an empty group — which is what used to happen, and is why an ice
   * dragon arrived bare-headed.
   */
  const onHead = [
    race.ears === 'none' ? null : earShape(race.ears, rig),
    headpiece ? headpiece() : null,
    glasses ? glasses() : null
  ].filter(Boolean);
  if (onHead.length > 0) slots.headwear = <g>{onHead}</g>;

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
  eyewear, auras, effects, races,
  footwearStyles, handwearStyles, outerwearStyles, neckwearStyles
};

/** Re-exported so a caller composing a figure does not have to import from two places. */
export { bodySlotOrder };
