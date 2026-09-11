import type { ReactElement } from 'react';
import { SKULL } from './avatarGeometry';
import { directionRig, faceCentre, yawShift, type DirectionRig } from './avatarDirection';
import {
  px,
  ACCENT, HAIR, HAIR_HIGHLIGHT, HAIR_SHADOW, MAGIC, MAGIC_HIGHLIGHT, OUTLINE,
  PRIMARY, PRIMARY_HIGHLIGHT, PRIMARY_SHADOW, SECONDARY, SECONDARY_SHADOW,
  SKIN, SKIN_SHADOW, WHITE
} from './avatarSprites';

/**
 * The figure, drawn whole.
 *
 * ── Why a second body at all ──
 * The avatar this school already has is a bust: a head box at y 6–16 and a torso box at y 17–23 on
 * a 24-unit grid, with a single arm that swings. It is a good drawing of a person from the
 * shoulders up, and from the shoulders up there is no walk cycle, no leap, and no way to hold a
 * staff at arm's length — an "attack" can only ever be the whole picture sliding sideways, which is
 * exactly what the existing poses do.
 *
 * So this is a body rather than a redraw: 48 units square, the figure standing on the floor of it,
 * with limbs that exist as separate groups the stylesheet can turn. Nothing here replaces the bust.
 * A thousand saved avatars point at trait ids on the 24-grid and go on drawing as they always did;
 * this is the shape the customiser's stage shows and the shape the poses are choreographed for.
 *
 * ── Proportions ──
 * Two and a half heads tall, which is the chibi proportion of Final Fantasy VI and Chrono Trigger,
 * and the reason those sprites still read at 32 pixels across a classroom: the head carries the
 * identity, so it takes 40% of the height, and the body carries the pose, so it takes the rest.
 *
 *   head and face   y  3 – 21   (40%)  — jaw, eyes, hair, horns, ears
 *   torso and arms  y 21 – 35   (30%)  — shoulders, two-jointed arms, hands
 *   legs and feet   y 35 – 46   (30%)  — hips, thighs, knees, boots
 *   ground shadow   y 45 – 47          — an ellipse, so the figure stands on something
 *
 * ── Rules every part follows ──
 *   * whole or half units only, so the drawing stays on the grid it was authored on;
 *   * `var(--av-…)` for colour, never a literal, so recolouring is six string assignments;
 *   * a part never draws outside its own band, so any head composes with any legs.
 */

/** Back to front. The compositor draws in exactly this order and nothing else decides it. */
export type BodySlot =
  | 'aura_back'
  | 'shadow'
  | 'back_gear'
  | 'hair_back'
  | 'back_arm'
  | 'legs_feet'
  | 'torso_body'
  | 'head_neck'
  | 'face'
  | 'hair_side'
  | 'hair_headwear'
  | 'headwear'
  | 'front_arm_weapon'
  | 'overlay_fx';

/**
 * Fourteen steps, back to front, and nothing else decides the order.
 *
 * Each one exists because something was wrong without it, and most of them were wrong in the same
 * way: a part that had no step of its own had to share one, and sharing a step means one of the two
 * is drawn in the wrong place.
 *
 *   1. `aura_back` — light behind the figure. Above the shadow, under everything solid.
 *   2. `shadow` — the ground contact. Under the figure, over the aura, or it reads as a hole in it.
 *   3. `back_gear` — wings, tails, capes: rooted at the back and hanging behind the body.
 *   4. `hair_back` — length and volume. Behind the torso, which is where a plait actually hangs.
 *   5. `back_arm` — the far arm.
 *   6. `legs_feet`
 *   7. `torso_body`
 *   8. `head_neck` — the skull, the jaw and the ears. Not the face.
 *   9. `face` — eyes, mouth, snout. Its own step because the back view has none of it.
 *  10. `hair_side` — the wrap around the ear and jaw. Over the face's edge, under the fringe, and
 *      the step that stops a turned head showing bare skull where the hair should be.
 *  11. `hair_headwear` — the cap and the fringe.
 *  12. `headwear` — hats, horns, animal ears worn rather than grown.
 *  13. `front_arm_weapon` — the near arm and whatever it holds.
 *  14. `overlay_fx` — sparks, runes, speed lines: in front of all of it.
 *
 * A costume may leave a step empty. It may never move one.
 */
export const bodySlotOrder: BodySlot[] = [
  'aura_back', 'shadow', 'back_gear', 'hair_back', 'back_arm', 'legs_feet', 'torso_body',
  'head_neck', 'face', 'hair_side', 'hair_headwear', 'headwear', 'front_arm_weapon', 'overlay_fx'
];

/** Thai, because these are read by the person choosing what to change. */
export const bodySlotLabels: Record<BodySlot, string> = {
  aura_back: 'ออร่าด้านหลัง',
  shadow: 'เงาใต้เท้า',
  back_gear: 'ปีก/หาง/ผ้าคลุม',
  hair_back: 'ผมด้านหลัง',
  face: 'ตา/ปาก',
  hair_side: 'ผมด้านข้าง',
  headwear: 'หมวก/เขา/หู',
  back_arm: 'แขนหลัง',
  legs_feet: 'ขาและรองเท้า',
  torso_body: 'ลำตัว',
  head_neck: 'ใบหน้า',
  hair_headwear: 'ผมด้านหน้า',
  front_arm_weapon: 'แขนหน้าและอาวุธ',
  overlay_fx: 'เอฟเฟกต์'
};

export const FULL_BODY_GRID = 48;

/* ────────────────────────────────────────────────────────────────────────────
 * Ground
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shadow, which is what makes a figure stand rather than float.
 *
 * An ellipse rather than a rectangle, and drawn with an opacity rather than a chosen grey, so it
 * darkens whatever ground the avatar is placed on instead of stamping one particular grey over it.
 */
export function groundShadow(): ReactElement {
  return (
    <g data-part="shadow" opacity="0.28">
      <ellipse cx="24" cy="46" rx="9" ry="2" fill={OUTLINE} />
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Legs and feet — y 35 to 46
 *
 * Hips, thighs, a knee break, and a boot. The knee is where the walk comes from: a leg drawn as one
 * rectangle can only slide, and a slide is the difference between a sprite that walks and a sprite
 * being dragged across the floor.
 * ──────────────────────────────────────────────────────────────────────────── */

interface LegOptions {
  /** Boot colour. The brief calls this the accent, and it is what a class is recognised by. */
  boot: string;
  trouser: string;
  skin: string;
}

function leg(x: number, { boot, trouser, skin }: LegOptions, claw = false): ReactElement {
  return (
    <g>
      {px(x, 35, 5, 5, trouser)}
      {px(x, 39, 5, 1, PRIMARY_SHADOW)}
      {px(x + 0.5, 40, 4, 3, skin)}
      {claw ? (
        <>
          {px(x - 0.5, 43, 6, 2, boot)}
          {/* Three talons, which is the whole read of a digitigrade foot at this size. */}
          {px(x - 0.5, 45, 1.5, 1, WHITE)}
          {px(x + 1.5, 45, 1.5, 1, WHITE)}
          {px(x + 3.5, 45, 1.5, 1, WHITE)}
        </>
      ) : (
        <>
          {px(x - 0.5, 43, 6, 2.5, boot)}
          {px(x - 0.5, 43, 6, 0.5, ACCENT)}
          {px(x - 1, 44.5, 7, 1, OUTLINE)}
        </>
      )}
    </g>
  );
}

export function legsStanding(options: LegOptions, claw = false): ReactElement {
  return (
    <g data-part="legs">
      <g data-part="backLeg">{leg(25, options, claw)}</g>
      <g data-part="frontLeg">{leg(18, options, claw)}</g>
    </g>
  );
}

/** A robe hides the legs from the thigh down; the boots still show, which is what the brief asks. */
export function robedLegs(options: LegOptions): ReactElement {
  return (
    <g data-part="legs">
      <g data-part="backLeg">{leg(25, options)}</g>
      <g data-part="frontLeg">{leg(18, options)}</g>
      {/* The skirt of the robe. It stops at 42 rather than at the floor, because the brief asks for
          boots underneath and a hem that reaches the ground is a robe with nothing under it. */}
      {px(16, 33, 16, 7, PRIMARY)}
      <polygon points="16,40 32,40 34,42 14,42" fill={PRIMARY} />
      <polygon points="16,40 24,40 24,42 14,42" fill={PRIMARY_SHADOW} opacity="0.45" />
      {px(14, 41.5, 20, 1, SECONDARY)}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Torso — y 21 to 35
 * ──────────────────────────────────────────────────────────────────────────── */

export function torsoPlate(): ReactElement {
  return (
    <g data-part="torso">
      {px(17, 21, 14, 12, PRIMARY)}
      {px(17, 21, 14, 1.5, PRIMARY_HIGHLIGHT)}
      {px(17, 31.5, 14, 1.5, PRIMARY_SHADOW)}
      {/* A breastplate: the pauldron blocks and the centre ridge, which is what says armour here. */}
      {px(16, 22, 4, 4, SECONDARY)}
      {px(28, 22, 4, 4, SECONDARY)}
      {px(23, 23, 2, 9, SECONDARY_SHADOW)}
      {px(20, 27, 8, 1, ACCENT)}
    </g>
  );
}

export function torsoRobe(): ReactElement {
  return (
    <g data-part="torso">
      {px(17, 21, 14, 12, PRIMARY)}
      {px(17, 21, 14, 1.5, PRIMARY_HIGHLIGHT)}
      {/* The stole and the clasp holding it. A robe with no fastening reads as a nightshirt. */}
      {px(20, 21, 3, 12, SECONDARY)}
      {px(25, 21, 3, 12, SECONDARY)}
      {px(22.5, 22, 3, 3, ACCENT)}
      {px(17, 31.5, 14, 1.5, PRIMARY_SHADOW)}
    </g>
  );
}

export function torsoShirt(): ReactElement {
  return (
    <g data-part="torso">
      {px(17, 21, 14, 12, PRIMARY)}
      {px(17, 21, 14, 1.5, PRIMARY_HIGHLIGHT)}
      {/* A collar and a placket: the two details that make a shirt a school shirt. */}
      {px(21, 21, 6, 2, WHITE)}
      {px(23.5, 21, 1, 4, SECONDARY)}
      {px(17, 26, 14, 1, ACCENT)}
      {px(17, 31.5, 14, 1.5, PRIMARY_SHADOW)}
      {/* The ambient side, on every torso: light from the top-left, shadow down the right. */}
      {px(29.5, 22.5, 1.5, 9, PRIMARY_SHADOW)}
    </g>
  );
}

/**
 * An oversized hoodie: wider than the body, with the pouch and the drawstrings.
 *
 * The width is the costume. A hoodie drawn to the same 14 units as a school shirt is a school
 * shirt in a different colour, and "oversized" is the entire read of streetwear at this size.
 */
export function torsoHoodie(): ReactElement {
  return (
    <g data-part="torso">
      {px(15.5, 21, 17, 13, PRIMARY)}
      {px(15.5, 21, 17, 1.5, PRIMARY_HIGHLIGHT)}
      {px(30.5, 22.5, 2, 10, PRIMARY_SHADOW)}
      {/* The neck of the hood, bunched, and the two strings hanging off it. */}
      {px(20, 21, 8, 2.5, SECONDARY)}
      {px(21.5, 23, 1, 4.5, WHITE)}
      {px(26, 23, 1, 4.5, WHITE)}
      {/* The kangaroo pocket, with its own shaded lip. */}
      {px(18, 28, 12, 4.5, SECONDARY_SHADOW)}
      {px(18, 28, 12, 0.75, ACCENT)}
      {px(15.5, 32.5, 17, 1.5, PRIMARY_SHADOW)}
    </g>
  );
}

/**
 * A body that is one soft shape, for the animals that have no waist.
 *
 * A penguin is a rounded silhouette with a pale front, and the whole thing only works if the body
 * is a single ellipse rather than the standard box: the box is what made every animal in the old
 * catalogue read as a person in a costume.
 */
export function torsoRound(): ReactElement {
  return (
    <g data-part="torso">
      {/*
        * The dark back and the pale front, in that order.
        *
        * The first pass laid a half-opacity highlight over the whole shape and a large white belly
        * under it, which averaged out to a grey bucket. A penguin is two flat areas with a hard
        * edge between them: the body in the chosen colour, a belly inset from it on every side, and
        * one shadow down the far edge. No blending anywhere, which is also what keeps it pixel art.
        */}
      {/*
        * An egg, and the belly sits low in it.
        *
        * A round body with a round belly centred in it is a tyre: the ring of colour around the
        * white is even all the way round and the eye reads the hole rather than the bird. The body
        * is taller than it is wide, the belly is pushed down and slightly to the near side, and the
        * shoulders stay in the chosen colour — which is where a penguin's colour actually is.
        */}
      <ellipse cx="24" cy="28" rx="9.5" ry="9" fill={PRIMARY} />
      <ellipse cx="20" cy="23" rx="4.5" ry="3" fill={PRIMARY_HIGHLIGHT} opacity="0.4" />
      {/*
        * The belly reaches the bottom of the body, and that is the whole trick.
        *
        * Enclosed on all four sides — which is what a centred ellipse gives you — the white reads as
        * a hole and the figure as a life ring. Flush with the bottom edge it reads as a front: the
        * eye follows the outline of the bird and finds the pale side of it, which is what a penguin
        * is. Same two shapes either way; only the bottom edge moved.
        */}
      <ellipse cx="24" cy="32" rx="4.25" ry="4.75" fill={WHITE} />
      <ellipse cx="31.5" cy="29" rx="2" ry="6" fill={PRIMARY_SHADOW} opacity="0.45" />
    </g>
  );
}

/**
 * Chunky trainers, which is the one thing a streetwear figure cannot be without.
 *
 * The sole is drawn in white at two units, because on a 48-grid a thin sole disappears and the
 * silhouette goes back to being a school shoe.
 */
export function legsSneakers(options: LegOptions): ReactElement {
  const { trouser, skin } = options;
  const shoe = (x: number) => (
    <g>
      {px(x, 35, 5.5, 6, trouser)}
      {px(x, 35, 1.5, 6, 'var(--av-primary-highlight)')}
      {px(x + 0.5, 41, 4.5, 1.5, skin)}
      {/* Upper, swoosh, sole. */}
      {px(x - 1, 42, 7.5, 2, SECONDARY)}
      {px(x - 1, 42.5, 5, 0.75, ACCENT)}
      {px(x - 1.5, 44, 8, 2, WHITE)}
      {px(x - 1.5, 45.5, 8, 0.5, OUTLINE)}
    </g>
  );
  return (
    <g data-part="legs">
      <g data-part="backLeg">{shoe(25)}</g>
      <g data-part="frontLeg">{shoe(17.5)}</g>
    </g>
  );
}

/**
 * Short webbed feet under a round body: no thigh, because a penguin does not have one on show.
 *
 * They still reach y 46. Every figure in this file stands on the same floor line — the ground
 * shadow is drawn at it — and a costume that stops short of it hovers instead of standing.
 */
export function legsWebbed(): ReactElement {
  /*
   * Short and in the beak's colour, not the skin's.
   *
   * Drawn in skin the legs read as a person's bare legs under a costume, which is the exact thing
   * this archetype exists not to look like. A penguin's leg is the same orange as its feet and is
   * mostly hidden by the body: three units of it show, and then the foot.
   */
  const foot = (x: number) => (
    <g>
      {px(x + 0.5, 34.5, 3, 8, ACCENT)}
      {px(x + 0.5, 34.5, 1, 8, 'var(--av-magic-highlight)')}
      <polygon points={`${x - 1.5},42 ${x + 5.5},42 ${x + 6},45.5 ${x - 2},45.5`} fill={ACCENT} />
      <polygon points={`${x - 1.5},42 ${x + 5.5},42 ${x + 5.75},43 ${x - 1.75},43`} fill={'var(--av-magic-highlight)'} opacity="0.45" />
      {px(x - 2, 45.5, 8, 0.5, OUTLINE)}
    </g>
  );
  return (
    <g data-part="legs">
      <g data-part="backLeg">{foot(25)}</g>
      <g data-part="frontLeg">{foot(19)}</g>
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Arms — two joints, so an elbow exists
 *
 * The upper arm hangs from the shoulder and the forearm from the elbow, so a cast can raise the
 * whole arm while the hand stays level, and a swing can lag the forearm behind the shoulder. One
 * rectangle per arm can do neither.
 * ──────────────────────────────────────────────────────────────────────────── */

interface ArmOptions { sleeve: string; skin: string; wide?: boolean }

function arm(x: number, { sleeve, skin, wide }: ArmOptions, held?: ReactElement, mirrored = false): ReactElement {
  const width = wide ? 5 : 3.5;
  // An arm in the same cloth as the torso, drawn against the torso, is an arm nobody can see. The
  // seam is one unit of the sleeve's own shadow along the edge that meets the body, which is what
  // separates them without introducing a colour the palette does not already contain.
  const seam = mirrored ? x : x + width - 1;
  return (
    <g>
      {px(x, 22, width, 6, sleeve)}
      {px(seam, 22, 1, 6, 'var(--av-primary-shadow)')}
      {wide ? px(x - 0.5, 26, width + 1, 2.5, sleeve) : null}
      {px(x + 0.25, 27.5, width - 0.5, 4, skin)}
      {px(x + 0.25, 30.5, width - 0.5, 2, SKIN_SHADOW)}
      {/*
        * What the hand is holding, in its own group.
        *
        * It travels with the arm, which is the whole reason it is drawn inside one. But a pose that
        * turns the arm past the horizontal turns the blade with it, and a raised sword whose point
        * ends up in its owner's face is the single most noticeable thing on the screen. A sprite
        * sheet would simply redraw that frame; here the group is a handle the stylesheet can turn
        * back, so the arm goes up and the blade stays up with it.
        */}
      {held ? <g data-part="held">{held}</g> : null}
    </g>
  );
}

/*
 * Where the arms hang.
 *
 * Outside the torso rather than over it. The torso runs x 17–31, so an arm drawn at 15 and 29.5 had
 * its inner half behind the chest and read as a hand appearing from nowhere — most obviously on the
 * dragon knight, whose sword arrived in mid-air. These sit clear of the body on both sides, which
 * also puts each hand where its shoulder pivot swings it.
 */
export function backArm(options: ArmOptions, held?: ReactElement): ReactElement {
  return <g data-part="backArm">{arm(30.5, options, held, true)}</g>;
}

export function frontArm(options: ArmOptions, held?: ReactElement): ReactElement {
  return <g data-part="frontArm">{arm(13.5, options, held)}</g>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Head and face — y 3 to 21
 *
 * A jaw rather than a box. The bust the school already has draws the head as a 10×10 square, which
 * is right for a portrait and wrong for a figure: at two and a half heads tall the head is the
 * whole silhouette, and every avatar would end up the same shape from across the room.
 * ──────────────────────────────────────────────────────────────────────────── */

/** What is on top of the head. Fur shapes are drawn in hair colour, so they match what is worn. */
export type EarStyle = 'none' | 'pointed' | 'round' | 'cat' | 'fox' | 'rabbit';
/** What the middle of the face is. A muzzle pushes forward; a beak replaces the mouth entirely. */
export type SnoutStyle = 'none' | 'muzzle' | 'beak';

/**
 * The pink of a cheek and the inside of an ear.
 *
 * Not in the six-colour palette, because it is not a colour anybody should be able to set: a blush
 * tinted to the shirt stops reading as a blush. The fallback is the value, and the custom property
 * exists so a future theme can move it without touching every face.
 */
const BLUSH = 'var(--av-blush, #ff97ae)';

interface FaceOptions {
  /** Iris colour, and the darker half of it. */
  eye: string;
  /** The lit half of the iris. Two tones is what stops an eye reading as a coloured hole. */
  eyeLight?: string;
  snout?: SnoutStyle;
  ears?: EarStyle;
  /** Two soft dots on the cheeks. The single cheapest thing that makes a face read as cute. */
  blush?: boolean;
  whiskers?: boolean;
  /** Narrowed, angled eyes with a lit pupil — the same face read as dangerous rather than sweet. */
  sharp?: boolean;
  mouth?: 'smile' | 'fang' | 'none';
}

/**
 * One eye, in five layers.
 *
 * A flat coloured rectangle is what the bust does and it is the reason a thousand avatars all read
 * as the same doll: the eye is 40% of a chibi face and a solid block of colour has no direction in
 * it. So, from the back: the white, an iris in two tones with the light coming from the top-left,
 * a dark rim under the lid that keeps the white from floating, and two glints — a big one where the
 * light is and a small one opposite it. The small one is what makes it look wet.
 *
 * `sharp` narrows the lid and slants it inward, which is the whole difference between a face that
 * looks pleased to see you and one that does not.
 */
interface EyeOptions { eye: string; eyeLight?: string | undefined; sharp?: boolean | undefined }

function eyeAt(x: number, { eye, eyeLight, sharp }: EyeOptions, mirrored = false): ReactElement {
  const lit = eyeLight ?? 'var(--av-magic-highlight)';
  const top = sharp ? 10.5 : 9.75;
  const height = sharp ? 4 : 5.25;
  const inner = mirrored ? x : x + 3.25;
  return (
    <g>
      {px(x, top, 4, height, WHITE)}
      {/* The iris: base below, lit above, so the light has a direction. */}
      {px(x + 0.5, top + 0.75, 3, height - 1.25, eye)}
      {px(x + 0.5, top + 0.75, 3, (height - 1.25) / 2, lit)}
      {/* The lid line. Slanted inwards on a sharp eye, level on a soft one. */}
      {sharp
        ? <polygon points={`${x},${top} ${x + 4},${top - 1} ${x + 4},${top + 0.75} ${x},${top + 0.75}`} fill={OUTLINE} />
        : px(x, top, 4, 0.75, OUTLINE)}
      {/* The two glints. Big where the light is, small on the far side; the small one is the wet. */}
      {px(mirrored ? x + 2.25 : x + 0.75, top + 1, 1.25, 1.25, WHITE)}
      {px(inner - 0.75, top + height - 1.75, 0.75, 0.75, WHITE)}
    </g>
  );
}

/**
 * What is rooted in the top of the skull, drawn on its own so it can be placed twice.
 *
 * A costume draws its ears here, under its own hair, because the ten costumes are hand-fitted and
 * their hair is cut to leave the ears room. A figure a child assembled cannot promise that — any of
 * twelve cuts may be worn over any of six races — so the compositor draws the same group again
 * *after* the hair instead, which is the only arrangement in which a cat keeps its ears whatever it
 * has on its head. One drawing, two positions in the stack; the alternative was two drawings that
 * drift.
 */
export function earShape(ears: EarStyle, rig?: DirectionRig): ReactElement {
  const fur = 'var(--av-hair)';
  /*
   * A turn hides one ear without anything being taken out of the drawing.
   *
   * The pair is painted *before* the skull — that is what keeps their roots out of sight — so
   * sliding the pair along the turn does the occlusion for free: the far ear travels under the
   * skull and is covered by it, and the near one comes out past the cheek, which is exactly what
   * happens to a pair of ears on a head that turns.
   *
   * The alternative was to stop rendering one of them, and that restarts the twitch keyframe every
   * time somebody changes direction, because a group whose children change is a new element as far
   * as the animation is concerned.
   */
  const slide = rig ? yawShift(rig, 5) : 0;
  return (
    <g data-part="ears" transform={slide === 0 ? undefined : `translate(${slide} 0)`}>
        {ears === 'pointed' ? (
          <>
            <polygon points="15,9 11,6 14.5,13" fill={SKIN} />
            <polygon points="33,9 37,6 33.5,13" fill={SKIN} />
            <polygon points="15,9 12.5,7.5 14.5,11.5" fill={SKIN_SHADOW} />
            <polygon points="33,9 35.5,7.5 33.5,11.5" fill={SKIN_SHADOW} />
          </>
        ) : null}
        {ears === 'round' ? (
          <>
            {px(12.5, 9.5, 3, 4, SKIN)}
            {px(32.5, 9.5, 3, 4, SKIN)}
            {px(13, 10.5, 2, 2, SKIN_SHADOW)}
            {px(33, 10.5, 2, 2, SKIN_SHADOW)}
          </>
        ) : null}
        {/* A cat's ear is a short triangle with a soft pad inside it. The pad is the whole read. */}
        {ears === 'cat' ? (
          <>
            <polygon points="16,6.5 18.5,0.5 23,6" fill={fur} />
            <polygon points="32,6.5 29.5,0.5 25,6" fill={fur} />
            <polygon points="18,5.5 18.8,2.5 21,5.5" fill={BLUSH} />
            <polygon points="30,5.5 29.2,2.5 27,5.5" fill={BLUSH} />
            <polygon points="16,6.5 18.5,0.5 19.5,3" fill={HAIR_HIGHLIGHT} />
          </>
        ) : null}
        {/* A fox's are taller, sharper, and tipped in the darker fur. */}
        {ears === 'fox' ? (
          <>
            <polygon points="15.5,7 17,0 22.5,5" fill={fur} />
            <polygon points="32.5,7 31,0 25.5,5" fill={fur} />
            <polygon points="17,0 16.1,2.5 18.3,2" fill={HAIR_SHADOW} />
            <polygon points="31,0 31.9,2.5 29.7,2" fill={HAIR_SHADOW} />
            <polygon points="17.5,5.5 17.6,2.5 20.5,5" fill={WHITE} opacity="0.9" />
            <polygon points="30.5,5.5 30.4,2.5 27.5,5" fill={WHITE} opacity="0.9" />
          </>
        ) : null}
        {/*
          * A rabbit's stand up past the top of the frame, which is exactly why they read at 48px.
          *
          * Five units wide and eleven tall, leaning apart. The first pass drew them at three and a
          * half units straight up and they read as two sticks: an ear is a shape with a width, and
          * the lean is what tells the pair apart from a headband with antennae on it.
          */}
        {ears === 'rabbit' ? (
          /*
           * Rooted at y 0.75 rather than y 0. Leaning ears rotate their own top corner further up
           * than the rectangle they are drawn from, so a pair authored flush with the ceiling ends
           * up outside it once the lean is applied — and what leaves the frame is either clipped or
           * painted onto whatever sits beside the avatar.
           */
          <>
            <g transform="rotate(-10 19.5 7.75)">
              {px(17, 0.75, 5, 7.5, fur)}
              {px(18.25, 2, 2.5, 5, BLUSH)}
              {px(17, 0.75, 1.25, 7.5, HAIR_HIGHLIGHT)}
            </g>
            <g transform="rotate(10 28.5 7.75)">
              {px(26, 0.75, 5, 7.5, fur)}
              {px(27.25, 2, 2.5, 5, BLUSH)}
              {px(29.75, 0.75, 1.25, 7.5, HAIR_SHADOW)}
            </g>
          </>
        ) : null}
    </g>
  );
}

/**
 * The skull, the jaw and the neck — the head with nothing on it yet.
 *
 * Separated from the face because the two turn differently. A skull barely moves as the head turns:
 * it is a rounded volume seen from a slightly different side, and at this size that is a couple of
 * units of shading. The features move the whole way, and on the back view they are not drawn at all.
 * One element holding both could only ever do one of those things.
 *
 * The ears belong here rather than with the face: they are on the sides of the volume, so they are
 * what a turn hides first.
 */
export function headShape({ snout = 'none', ears = 'none', rig }:
Partial<FaceOptions> & { rig?: DirectionRig }): ReactElement {
  const turn = rig ?? directionRig('front');
  // The lit side follows the turn: a head turned to the reader's right is lit down its left. The
  // band is the third tone the whole figure is lit by and it is the only part of the skull that
  // moves, which is what stops a turn reading as the head being slid sideways.
  const shadeLeft = turn.yaw > 0.2 ? 15 : 31;
  return (
    <g data-part="head">
      {/* The neck, which is what stops a chibi head sitting straight on the collarbone. */}
      {px(22, 19.5, 4, 2, SKIN_SHADOW)}
      {/*
        * Ears go behind the skull so their base is hidden, and in their own group so they can
        * twitch: an animal head that never moves its ears is a hat.
        *
        * The one a turn has taken out of sight is not drawn: an ear on the far side of a head that
        * has turned away is behind the skull, and drawing it anyway is the thing that makes a
        * side view read as a front view with the features pushed over.
        */}
      {ears === 'none' ? null : earShape(ears, turn)}
      {/* Skull, then a jaw narrowing to a chin — the line that makes a head read as a face. */}
      {px(15, 4, 18, 13, SKIN)}
      {px(16.5, 17, 15, 2, SKIN)}
      {px(18.5, 19, 11, 1.5, SKIN_SHADOW)}
      {px(15, 4, 18, 1.5, 'var(--av-skin-highlight)')}
      {px(shadeLeft, 5.5, 2, 11.5, SKIN_SHADOW)}
      {/* A muzzle is the shape of the skull rather than a feature on it, so it turns with the head
          and stays drawn on the back view — a fox seen from behind still has a snout in profile. */}
      {snout === 'muzzle' ? px(19 + yawShift(turn, 3), 13, 10, 5, SKIN_SHADOW) : null}
    </g>
  );
}

/**
 * Everything that makes the head a face: eyes, mouth, blush, whiskers, and the front of a snout.
 *
 * Its own layer in the pipeline, for the two reasons the split exists. It is not drawn at all on the
 * back view — there is no arrangement of eyes that reads as the back of a head — and it moves the
 * full width of the turn while the skull under it barely moves, which is what the eye reads as a
 * head that has turned rather than a face that has slid.
 */
export function faceFeatures({
  eye, eyeLight, snout = 'none', blush, whiskers, sharp, mouth = 'smile', rig
}: FaceOptions & { rig?: DirectionRig }): ReactElement {
  const turn = rig ?? directionRig('front');
  /*
   * The back of a head has no face, and the group stays anyway.
   *
   * Empty rather than absent so the element keeps its identity across a change of direction: a
   * group that disappears and comes back is a new element, and the blink keyframe addressing its
   * eyes restarts from nothing every time somebody turns the figure round and back.
   */
  if (turn.faceHidden) return <g data-part="face" />;
  const shift = faceCentre(turn) - SKULL.centre;
  return (
    <g data-part="face" transform={shift === 0 ? undefined : `translate(${shift} 0)`}>
      {snout === 'muzzle' ? (
        <>
          {px(19, 13, 10, 1, SKIN)}
          {px(20.5, 15.5, 2, 1.5, OUTLINE)}
          {px(25.5, 15.5, 2, 1.5, OUTLINE)}
        </>
      ) : null}
      {snout === 'beak' ? (
        <>
          <polygon points="21,14 27,14 24,18.5" fill={ACCENT} />
          <polygon points="21,14 27,14 24,16" fill={'var(--av-magic-highlight)'} opacity="0.55" />
          {px(21, 16.5, 6, 0.5, OUTLINE)}
        </>
      ) : null}
      {whiskers ? (
        <g opacity="0.75">
          {px(11, 13.5, 5, 0.5, SKIN_SHADOW)}
          {px(11.5, 15.5, 4.5, 0.5, SKIN_SHADOW)}
          {px(32, 13.5, 5, 0.5, SKIN_SHADOW)}
          {px(32, 15.5, 4.5, 0.5, SKIN_SHADOW)}
        </g>
      ) : null}
      {/* The eyes, in their own group, because blinking is a thing eyes do and heads do not. */}
      <g data-part="eyes">
        {sharp ? (
          /*
           * The glow behind a lit pupil, which is what "neon" means at this size: the light spills
           * onto the skin around the eye rather than staying inside the iris.
           *
           * At full opacity this was a solid block the size of the socket, and every sharp-eyed
           * figure read as wearing purple goggles. A quarter of the colour is a glow; all of it is
           * a shape.
           */
          <g opacity="0.28">
            {px(17.9, 10, 4.8, 4.8, eye)}
            {px(25.4, 10, 4.8, 4.8, eye)}
          </g>
        ) : null}
        {eyeAt(18.25, { eye, eyeLight, sharp })}
        {eyeAt(25.75, { eye, eyeLight, sharp }, true)}
      </g>
      {blush ? (
        <g opacity="0.7">
          {px(16.5, 14.5, 3, 1.5, BLUSH)}
          {px(28.5, 14.5, 3, 1.5, BLUSH)}
        </g>
      ) : null}
      {snout === 'none' && mouth !== 'none' ? (
        <>
          {px(22.5, 16.25, 3, 0.75, OUTLINE)}
          {px(23.25, 17, 1.5, 0.5, OUTLINE)}
          {mouth === 'fang' ? px(22.75, 17, 1, 1, WHITE) : null}
        </>
      ) : null}
    </g>
  );
}

/**
 * The head and its face as one element, for a caller that fills one slot rather than two.
 *
 * The composed figure fills `head_neck` and `face` separately, which is what lets the back view drop
 * the features without the compositor knowing what a face is. This is the same two drawings in the
 * same order for anything that has only one place to put them.
 */
export function headNeck(options: FaceOptions & { rig?: DirectionRig }): ReactElement {
  return (
    <>
      {headShape({
        ...(options.snout === undefined ? {} : { snout: options.snout }),
        ...(options.ears === undefined ? {} : { ears: options.ears }),
        ...(options.rig === undefined ? {} : { rig: options.rig })
      })}
      {faceFeatures(options)}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hair and headwear — y 0 to 12, over the skull
 * ──────────────────────────────────────────────────────────────────────────── */

export function hornedHelm(): ReactElement {
  return (
    <g data-part="hair">
      {px(14.5, 3, 19, 5, HAIR)}
      {px(14.5, 3, 19, 1.5, HAIR_HIGHLIGHT)}
      {px(14.5, 7, 19, 1.5, HAIR_SHADOW)}
      {/* Two horns curving back: the dragon knight's whole silhouette from the back of the room. */}
      <polygon points="15,6 8,1 12,8" fill={SECONDARY} />
      <polygon points="33,6 40,1 36,8" fill={SECONDARY} />
      <polygon points="15,6 10,3 13,7" fill={SECONDARY_SHADOW} />
      <polygon points="33,6 38,3 35,7" fill={SECONDARY_SHADOW} />
      {px(22, 2, 4, 2, ACCENT)}
    </g>
  );
}

export function mageHood(): ReactElement {
  return (
    <g data-part="hair">
      {/* A cone with a brim, and the brim is what casts the shadow across the eyes. The apex is at
          y 0 rather than y −2: two units above the frame is two units nobody ever saw. */}
      <polygon points="24,0 36,10 12,10" fill={PRIMARY} />
      <polygon points="24,0 30,10 12,10" fill={PRIMARY_HIGHLIGHT} opacity="0.5" />
      {px(12, 9, 24, 2.5, SECONDARY)}
      {px(12, 11, 24, 1, SECONDARY_SHADOW)}
      {/* Hair escaping the hood: without it a hood is a bag, and the hair colour never shows. */}
      {px(14, 11.5, 3, 7, HAIR)}
      {px(31, 11.5, 3, 7, HAIR)}
      {px(22.5, 0, 3, 3, MAGIC)}
    </g>
  );
}

export function demonHorns(): ReactElement {
  return (
    <g data-part="hair">
      {px(14.5, 3.5, 19, 5.5, HAIR)}
      {px(14.5, 3.5, 19, 1.5, HAIR_HIGHLIGHT)}
      {/* Horn tips at y 0, which is the ceiling. At −1 they were sheared off by every crop. */}
      <polygon points="17,4.5 15,0 21,3.5" fill={SECONDARY} />
      <polygon points="31,4.5 33,0 27,3.5" fill={SECONDARY} />
      <polygon points="17,4.5 15.8,1.4 18.4,3.4" fill={SECONDARY_SHADOW} />
      <polygon points="31,4.5 32.2,1.4 29.6,3.4" fill={SECONDARY_SHADOW} />
    </g>
  );
}

export function shortHair(): ReactElement {
  return (
    <g data-part="hair">
      {px(14.5, 3.5, 19, 5.5, HAIR)}
      {px(14.5, 3.5, 19, 1.5, HAIR_HIGHLIGHT)}
      {px(14.5, 8, 3, 4, HAIR)}
      {px(30.5, 8, 3, 4, HAIR)}
      {px(14.5, 8.5, 19, 0.5, HAIR_SHADOW)}
      {/*
        * Two strands at the temples. A fringe drawn as one bar is a helmet — and one drawn at x 17
        * and x 27, which is where this was, is a fringe through both eyes: the sockets are x 18.25
        * to 22.25 and x 25.75 to 29.75, and a strand reaching y 12.5 crosses them both.
        */}
      <polygon points="15,8.5 18.5,8.5 16.5,12.5" fill={HAIR} />
      <polygon points="29.5,8.5 33,8.5 31.5,12" fill={HAIR_SHADOW} />
    </g>
  );
}

/**
 * A tuft rather than a hairstyle, for a head whose ears are the silhouette.
 *
 * A full fringe under a pair of cat ears fights them: two shapes at the top of the head and the
 * eye reads neither. This is three strands of the same fur, low enough to leave the ears alone.
 */
export function furTuft(): ReactElement {
  return (
    <g data-part="hair">
      {px(16, 4.5, 16, 3.5, HAIR)}
      {px(16, 4.5, 16, 1.25, HAIR_HIGHLIGHT)}
      {px(16, 7.5, 16, 0.5, HAIR_SHADOW)}
      {/* Three tufts, and the middle one stops at the brow: the outer two hang at the temples,
          clear of the sockets, and a tuft down the centre of the face is a fringe in the eyes. */}
      <polygon points="16,8 19.5,8 17.5,11.5" fill={HAIR} />
      <polygon points="22.25,8 25.75,8 24,9.5" fill={HAIR} />
      <polygon points="28.5,8 32,8 30.5,11" fill={HAIR_SHADOW} />
    </g>
  );
}

/**
 * The wizard's hat the brief asks for: wide brim, tall cone, and a tip bent over.
 *
 * The bend is the character. A straight cone is a party hat; the fold, and the band where the brim
 * meets the crown, are what make it read as something worn by somebody who does magic for a living.
 */
export function brimHat(): ReactElement {
  return (
    <g data-part="hair">
      {/*
        * The whole hat lives between y 0 and y 9.5.
        *
        * The first pass ran the crown up to y −9, which is off the top of the 48-grid: the figure
        * looked right on its own and lost its point the moment it was drawn in a picker cell, where
        * anything outside the box is either clipped or lands on the neighbour. The rule at the top
        * of this file — a part never draws outside its own band — is not decoration.
        */}
      {/* Crown, leaning, and the folded tip with its own shadow. */}
      <polygon points="17,7 29,7 26,1.5 21.5,1.5" fill={PRIMARY} />
      <polygon points="17,7 20.5,7 21.5,1.5 21.5,1.5" fill={'var(--av-primary-highlight)'} opacity="0.55" />
      {/* The folded tip. Its far corner used to sit at y −0.5, half a unit outside the frame — which
          is invisible on the stage and a cropped hat in every list row in the product. */}
      <polygon points="26,1.5 21.5,1.5 15.5,0.5 19,0" fill={PRIMARY} />
      <polygon points="26,1.5 21.5,1.5 18,0.9 21,0.5" fill={PRIMARY_SHADOW} />
      {/* Brim: wider than the head by three units each side, with a lit top edge. */}
      <polygon points="10,8 38,8 34,6 14,6" fill={SECONDARY} />
      <polygon points="10,8 38,8 38,9.5 10,9.5" fill={SECONDARY_SHADOW} />
      <polygon points="14,6 34,6 33,7 15,7" fill={'var(--av-primary-highlight)'} opacity="0.5" />
      {/* The band, and a star on it, which is where the eye lands. */}
      {px(15.5, 5.5, 19, 2, ACCENT)}
      <polygon points="24,4.5 24.9,6.2 26.8,6.6 24.9,7 24,8.8 23.1,7 21.2,6.6 23.1,6.2" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/**
 * A visor and a headset: a face half-covered by something with a light on it.
 *
 * The bar sits over one eye rather than both, because two covered eyes have no expression left and
 * the whole point of the chibi face is that it has one.
 */
export function techVisor(): ReactElement {
  return (
    <g data-part="hair">
      {px(14.5, 3.5, 19, 4.5, SECONDARY)}
      {px(14.5, 3.5, 19, 1.25, 'var(--av-primary-highlight)')}
      {px(14.5, 7, 19, 1, SECONDARY_SHADOW)}
      {/*
        * The patch covers one eye. Both was the first pass and it took the face with it: two lit
        * rectangles where the eyes should be is a pair of glasses, and the figure lost the one thing
        * a chibi head has to keep. Narrower than the socket, so the eye beside it still reads.
        */}
      {px(16.25, 9.25, 6.5, 4.5, OUTLINE)}
      {px(17, 10, 5, 3, MAGIC)}
      {px(17, 10, 5, 1, MAGIC_HIGHLIGHT)}
      {/* The strap from the patch to the band, which is what stops it floating on the cheek. */}
      {px(15, 11, 1.5, 1, SECONDARY_SHADOW)}
      {/* The band round the back of the head and the ear cup on the far side. */}
      {px(24.5, 6.5, 9, 1.5, SECONDARY_SHADOW)}
      {px(31, 8.5, 3.5, 5, SECONDARY)}
      {px(31.5, 10, 2.5, 2, MAGIC)}
    </g>
  );
}

/**
 * A fox's tail: as much of the silhouette as the ears are, so it is drawn as three widening
 * segments with a white tip rather than as a tapering rectangle.
 */
export function bushyTail(): ReactElement {
  return (
    <g data-part="tail">
      <ellipse cx="34" cy="33" rx="4" ry="3.5" fill={HAIR} />
      <ellipse cx="38.5" cy="30" rx="4.5" ry="4" fill={HAIR} />
      <ellipse cx="42" cy="26.5" rx="4" ry="3.5" fill={WHITE} />
      <ellipse cx="37.5" cy="31.5" rx="3.5" ry="2.5" fill={HAIR_SHADOW} opacity="0.55" />
      <ellipse cx="39.5" cy="28" rx="2" ry="1.5" fill={HAIR_HIGHLIGHT} opacity="0.6" />
    </g>
  );
}

/**
 * A cat's tail: one curve, thick at the root and tapering, with a pale tip.
 *
 * The cat was borrowing the dragon's segmented tail — arrowhead and all — which is the exact kind
 * of sharing that made a thousand avatars read as one. A cat tail is soft and it curls up.
 */
export function catTail(): ReactElement {
  return (
    <g data-part="tail">
      <path
        d="M31,33 C36,33 39,31 40,27 C40.5,24.5 39,22.5 37,22.5 C35.5,22.5 34.5,23.5 34.5,25"
        fill="none" stroke={HAIR} strokeWidth="3" strokeLinecap="round"
      />
      <path
        d="M31,34 C35.5,34 38,32 39,28.5"
        fill="none" stroke={HAIR_SHADOW} strokeWidth="1" strokeLinecap="round" opacity="0.7"
      />
      <circle cx="34.5" cy="25" r="1.5" fill={WHITE} />
    </g>
  );
}

/** A rabbit's, which is one round puff and nothing else. */
export function puffTail(): ReactElement {
  return (
    <g data-part="tail">
      <ellipse cx="33.5" cy="31" rx="3.5" ry="3.5" fill={WHITE} />
      <ellipse cx="34.5" cy="32" rx="2.5" ry="2" fill={HAIR_SHADOW} opacity="0.35" />
      <ellipse cx="32.5" cy="30" rx="1.5" ry="1.25" fill={WHITE} />
    </g>
  );
}

/**
 * Flippers instead of arms: one shape from shoulder to tip, held clear of the body.
 *
 * "Clear of" is the whole thing. Drawn at the standard shoulder positions the flipper sat inside a
 * body nine and a half units wide and vanished, so the penguin had no arms at all — it is the same
 * mistake the note above `backArm` records for the sword. These sit at the edge of the silhouette
 * and lean out of it.
 */
export function flipperArm(side: 'front' | 'back'): ReactElement {
  const cx = side === 'front' ? 15 : 33;
  const lean = side === 'front' ? -20 : 20;
  return (
    <g data-part={side === 'front' ? 'frontArm' : 'backArm'}>
      <g transform={`rotate(${lean} ${cx} 24)`}>
        <ellipse cx={cx} cy="29" rx="2.5" ry="6" fill={PRIMARY} />
        <ellipse cx={cx} cy="26" rx="2" ry="3.5" fill={PRIMARY_HIGHLIGHT} opacity="0.4" />
        <ellipse cx={cx} cy="33" rx="2" ry="2.5" fill={PRIMARY_SHADOW} opacity="0.7" />
      </g>
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Back gear — wings, tails, capes. Behind everything but the shadow.
 * ──────────────────────────────────────────────────────────────────────────── */

export function batWings(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="17,22 4,14 6,26 3,25 8,33 17,30" fill={SECONDARY} />
      <polygon points="31,22 44,14 42,26 45,25 40,33 31,30" fill={SECONDARY} />
      <polygon points="17,22 7,17 9,26 17,28" fill={SECONDARY_SHADOW} opacity="0.55" />
      <polygon points="31,22 41,17 39,26 31,28" fill={SECONDARY_SHADOW} opacity="0.55" />
    </g>
  );
}

export function scaledTail(): ReactElement {
  return (
    <g data-part="tail">
      {/* Segments rather than a curve: a tail drawn as one path cannot be seen to sway. */}
      {px(31, 33, 5, 3, SECONDARY)}
      {px(35, 34, 5, 3, SECONDARY)}
      {px(39, 36, 4, 3, SECONDARY)}
      {px(42, 38, 3, 3, SECONDARY_SHADOW)}
      <polygon points="44,38 48,40 44,43" fill={ACCENT} />
    </g>
  );
}

export function demonTail(): ReactElement {
  return (
    <g data-part="tail">
      {px(31, 34, 8, 2, SKIN)}
      {px(38, 35, 5, 2, SKIN)}
      <polygon points="42,34 47,36.5 42,39" fill={SECONDARY} />
    </g>
  );
}

export function cape(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="16,21 32,21 36,40 12,40" fill={SECONDARY} />
      <polygon points="16,21 24,21 24,40 12,40" fill={SECONDARY_SHADOW} opacity="0.4" />
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Held things — drawn inside an arm group, so they travel with the hand
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A sword, held blade-up beside the shoulder.
 *
 * Two things about where it sits. It is drawn outside the head box (x 15–33) rather than through
 * it, because a blade at rest that crosses the face is the first thing anybody notices and the last
 * thing they can unsee. And it is short — eleven units, not seventeen — so that when the arm swings
 * through a full raise the tip stays inside the 48-unit frame instead of leaving it.
 */
export function sword(): ReactElement {
  return (
    <g>
      {/* Guard and grip, sitting in the hand at y 27.5–31.5. */}
      {px(11.5, 27, 5, 1.5, SECONDARY)}
      {px(13.25, 28.5, 1.5, 3, SECONDARY_SHADOW)}
      {px(12.75, 18, 2.5, 9, WHITE)}
      {px(13.75, 18, 1, 9, 'var(--av-secondary-highlight)')}
      <polygon points="12.75,18 15.25,18 14,14.5" fill={WHITE} />
    </g>
  );
}

export function staff(): ReactElement {
  return (
    <g>
      {px(15.5, 10, 2, 24, SECONDARY)}
      {px(16, 10, 0.75, 24, SECONDARY_SHADOW)}
      {/* The stone and its glow, which is where the magic colour lives on this figure. */}
      <circle cx="16.5" cy="8" r="5" fill={MAGIC} opacity="0.25" />
      <circle cx="16.5" cy="8" r="3.5" fill={MAGIC} />
      <circle cx="16.5" cy="8" r="2" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

export function spellbook(): ReactElement {
  return (
    <g>
      {px(30, 24, 8, 6, SECONDARY)}
      {px(31, 25, 3, 4, WHITE)}
      {px(34.5, 25, 3, 4, '#fff7e8')}
      {px(33.75, 24, 0.5, 6, SECONDARY_SHADOW)}
    </g>
  );
}

export function shield(): ReactElement {
  return (
    <g>
      <polygon points="31,23 39,23 39,31 35,35 31,31" fill={SECONDARY} />
      <polygon points="33,25 37,25 37,30 35,32 33,30" fill={ACCENT} />
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Overlay effects — runes, sparks, speed. In front of everything.
 * ──────────────────────────────────────────────────────────────────────────── */

export function runeCircle(): ReactElement {
  return (
    <g data-part="fx" data-fx="cast">
      <ellipse cx="24" cy="45" rx="14" ry="3.5" fill="none" stroke={MAGIC} strokeWidth="1" opacity="0.85" />
      <ellipse cx="24" cy="45" rx="9" ry="2.2" fill="none" stroke={MAGIC_HIGHLIGHT} strokeWidth="0.75" opacity="0.7" />
      {px(9, 44.5, 1.5, 1.5, MAGIC)}
      {px(37.5, 44.5, 1.5, 1.5, MAGIC)}
      {px(23.5, 41.5, 1.5, 1.5, MAGIC_HIGHLIGHT)}
    </g>
  );
}

export function impactFlash(): ReactElement {
  return (
    <g data-part="fx" data-fx="attack">
      <polygon points="6,16 12,20 6,22 11,26 4,26" fill={ACCENT} opacity="0.9" />
    </g>
  );
}

export function speedLines(): ReactElement {
  return (
    <g data-part="fx" data-fx="run" opacity="0.7">
      {px(36, 24, 8, 1, ACCENT)}
      {px(38, 28, 8, 1, ACCENT)}
      {px(37, 32, 6, 1, ACCENT)}
    </g>
  );
}

export function cheerStars(): ReactElement {
  return (
    <g data-part="fx" data-fx="cheer">
      {px(11, 4, 2, 2, ACCENT)}
      {px(35, 6, 2, 2, MAGIC)}
      {px(23, 0, 2, 2, ACCENT)}
    </g>
  );
}

export function spellAura(): ReactElement {
  return (
    <g data-part="fx" data-fx="aura" opacity="0.5">
      <ellipse cx="24" cy="27" rx="17" ry="20" fill="none" stroke={MAGIC} strokeWidth="1" />
    </g>
  );
}

/**
 * Two small flames keeping station beside the head.
 *
 * The brief asks for floating orbs, and they do something no costume part can: they say the figure
 * is holding a spell while standing still. Each is three concentric shapes — a soft outer glow, the
 * body of the flame, and a white core — because a single circle at three units across reads as a
 * dot rather than as light. They orbit in their own group, so the stylesheet moves them without
 * moving the mage.
 */
export function flameOrbs(): ReactElement {
  const orb = (cx: number, cy: number, scale: number) => (
    <g>
      <circle cx={cx} cy={cy} r={2.6 * scale} fill={MAGIC} opacity="0.28" />
      <circle cx={cx} cy={cy} r={1.6 * scale} fill={MAGIC} />
      <circle cx={cx - 0.4 * scale} cy={cy - 0.4 * scale} r={0.7 * scale} fill={MAGIC_HIGHLIGHT} />
    </g>
  );
  return (
    <g data-part="orbs" data-fx="orbs">
      {orb(9.5, 12, 1)}
      {orb(38.5, 15.5, 0.85)}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The archetypes
 *
 * Each is the nine slots filled in. Two of them — the dragon knight and the arcane mage — are the
 * pair drawn in full; the rest answer the same nine slots differently, which is the point of
 * having slots rather than five separate drawings.
 * ──────────────────────────────────────────────────────────────────────────── */

export type FullBodyArchetype =
  | 'dragonKnight' | 'arcaneMage' | 'demon' | 'student' | 'athlete'
  | 'cat' | 'fox' | 'rabbit' | 'penguin' | 'techwear';

export interface ArchetypeDefinition {
  id: FullBodyArchetype;
  /** Thai, because it is read by the person choosing it. */
  name: string;
  description: string;
  /**
   * The costume, built for the direction it is being seen from.
   *
   * A function rather than a fixed object because a head that has turned is not the same drawing
   * with a transform on it: the face moves the full width of the turn, the ears slide behind the
   * skull, and on the back view the features are not drawn at all. A stored object could only ever
   * hold one of those.
   */
  slots: (rig: DirectionRig) => Partial<Record<BodySlot, ReactElement>>;
}

export const fullBodyArchetypes: Record<FullBodyArchetype, ArchetypeDefinition> = {
  dragonKnight: {
    id: 'dragonKnight',
    name: 'นักรบมังกร',
    description: 'เขา ปีกค้างคาว หางเป็นปล้อง ขากรงเล็บ และดาบในมือหน้า',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: <g>{batWings()}{scaledTail()}</g>,
      back_arm: backArm({ sleeve: SECONDARY, skin: SKIN }, shield()),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, true),
      torso_body: torsoPlate(),
      head_neck: headShape({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, snout: 'muzzle', sharp: true, rig }),
      face: faceFeatures({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, snout: 'muzzle', sharp: true, rig }),
      headwear: hornedHelm(),
      front_arm_weapon: frontArm({ sleeve: SECONDARY, skin: SKIN }, sword())
    })
  },
  arcaneMage: {
    id: 'arcaneMage',
    name: 'จอมเวทย์มนตร์',
    description: 'ผ้าคลุมมีฮู้ด แขนเสื้อกว้าง รองเท้าโผล่ใต้ชายผ้า ตำราลอย และไม้เท้า',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: cape(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN, wide: true }, spellbook()),
      legs_feet: robedLegs({ boot: ACCENT, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoRobe(),
      head_neck: headShape({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, rig }),
      face: faceFeatures({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, rig }),
      headwear: brimHat(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN, wide: true }, staff()),
      overlay_fx: <g>{spellAura()}{flameOrbs()}</g>
    })
  },
  demon: {
    id: 'demon',
    name: 'ปีศาจ',
    description: 'เขาแหลม หูแหลม หางปีศาจ และเท้ากีบ',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: demonTail(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, true),
      torso_body: torsoPlate(),
      head_neck: headShape({ eye: MAGIC, ears: 'pointed', rig }),
      face: faceFeatures({ eye: MAGIC, ears: 'pointed', rig }),
      headwear: demonHorns(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    })
  },
  student: {
    id: 'student',
    name: 'นักเรียน',
    description: 'เสื้อคอปก กางเกงนักเรียน และรองเท้าผ้าใบ',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: WHITE, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoShirt(),
      head_neck: headShape({ eye: OUTLINE, rig }),
      face: faceFeatures({ eye: OUTLINE, rig }),
      hair_headwear: shortHair(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    })
  },
  athlete: {
    id: 'athlete',
    name: 'นักกีฬา',
    description: 'ชุดกีฬา รองเท้าวิ่ง และท่ายืนพร้อมออกตัว',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_arm: backArm({ sleeve: ACCENT, skin: SKIN }),
      legs_feet: legsSneakers({ boot: ACCENT, trouser: PRIMARY, skin: SKIN }),
      torso_body: torsoShirt(),
      head_neck: headShape({ eye: OUTLINE, mouth: 'smile', rig }),
      face: faceFeatures({ eye: OUTLINE, mouth: 'smile', rig }),
      hair_headwear: shortHair(),
      front_arm_weapon: frontArm({ sleeve: ACCENT, skin: SKIN })
    })
  },

  /*
   * The animals.
   *
   * Each of the four is a different silhouette rather than the same body wearing different ears —
   * which is what the old catalogue did, and the reason a thousand avatars read as one avatar. Ears
   * and tail carry the identity from across a classroom; the blush and the round pupils carry the
   * "cute" the brief is actually asking for, and they are the parts a child recognises as theirs.
   */
  cat: {
    id: 'cat',
    name: 'น้องแมว',
    description: 'หูแมวมีวุ้นสีชมพู แก้มแดง หนวด และหางแกว่ง',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: catTail(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }),
      torso_body: torsoHoodie(),
      head_neck: headShape({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, ears: 'cat', blush: true, whiskers: true, rig }),
      face: faceFeatures({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, ears: 'cat', blush: true, whiskers: true, rig }),
      hair_headwear: furTuft(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    })
  },
  fox: {
    id: 'fox',
    name: 'น้องจิ้งจอก',
    description: 'หูแหลมปลายเข้ม ปากยื่น และหางฟูปลายขาว',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: bushyTail(),
      back_arm: backArm({ sleeve: SECONDARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, true),
      torso_body: torsoShirt(),
      head_neck: headShape({ eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT, ears: 'fox', snout: 'muzzle', whiskers: true, rig }),
      face: faceFeatures({ eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT, ears: 'fox', snout: 'muzzle', whiskers: true, rig }),
      hair_headwear: furTuft(),
      front_arm_weapon: frontArm({ sleeve: SECONDARY, skin: SKIN })
    })
  },
  rabbit: {
    id: 'rabbit',
    name: 'น้องกระต่าย',
    description: 'หูยาวตั้ง หางปุย แก้มแดง และรองเท้าผ้าใบ',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_gear: puffTail(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsSneakers({ boot: WHITE, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoHoodie(),
      head_neck: headShape({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, ears: 'rabbit', blush: true, mouth: 'fang', rig }),
      face: faceFeatures({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, ears: 'rabbit', blush: true, mouth: 'fang', rig }),
      hair_headwear: furTuft(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    })
  },
  penguin: {
    id: 'penguin',
    name: 'น้องเพนกวิน',
    description: 'ตัวกลมนุ่ม ปีกเป็นครีบ จมูกปาก และเท้าพังผืน',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_arm: flipperArm('back'),
      legs_feet: legsWebbed(),
      torso_body: torsoRound(),
      head_neck: headShape({ eye: OUTLINE, eyeLight: SECONDARY, snout: 'beak', blush: true, rig }),
      face: faceFeatures({ eye: OUTLINE, eyeLight: SECONDARY, snout: 'beak', blush: true, rig }),
      hair_headwear: furTuft(),
      front_arm_weapon: flipperArm('front')
    })
  },
  techwear: {
    id: 'techwear',
    name: 'สตรีทเทคแวร์',
    description: 'ฮู้ดตัวโคร่ง วิเซอร์เรืองแสง หูฟัง และสนีกเกอร์',
    slots: (rig) => ({
      shadow: groundShadow(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsSneakers({ boot: SECONDARY, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoHoodie(),
      // No neon glow behind the eyes here: the visor is already the tech, and two lit things
      // on one small face is one too many.
      head_neck: headShape({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, mouth: 'none', rig }),
      face: faceFeatures({ eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, mouth: 'none', rig }),
      headwear: techVisor(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    })
  }
};

export const fullBodyArchetypeList: ArchetypeDefinition[] = Object.values(fullBodyArchetypes);

/**
 * Which figure a race opens on.
 *
 * A dragonkin should not have to hunt for the dragon knight, and a human should not open on one. It
 * is a starting point rather than a rule: the customiser's chips change it, and the choice is saved
 * with the traits. It also answers for every avatar built before bodies were saved at all, which is
 * why it lives here rather than inside the customiser that used to own it -- the profile has to draw
 * the same figure the customiser previewed.
 */
export const archetypeForRace: Record<string, FullBodyArchetype> = {
  human: 'student',
  dragonkin: 'dragonKnight',
  demon: 'demon',
  // Beastfolk opened on the athlete, which is a person in sportswear: the one race whose whole
  // point is ears and a tail was the one race that had neither.
  beastfolk: 'cat',
  spirit: 'arcaneMage',
  robot: 'techwear'
};

/**
 * The figure a catalogue avatar draws, from the category it was filed under.
 *
 * The thousand catalogue avatars predate bodies: each is six integers and a theme, with no race and
 * no figure recorded. Read through the category, though, the answer is already there — an avatar in
 * "สัตว์" is an animal whatever its integers say — and it is the only way the picker grid can show a
 * thousand thumbnails as ten silhouettes rather than as one repeated a thousand times.
 *
 * The four animals rotate on the avatar's own index, so a page of animals is cats, foxes, rabbits
 * and penguins in a fixed order rather than a random-looking scatter that changes between builds.
 * A category takes a string rather than the catalogue's own union so this file stays free of it.
 */
export function bodyForCategory(category: string, seed = 0): FullBodyArchetype {
  const animals: FullBodyArchetype[] = ['cat', 'fox', 'rabbit', 'penguin'];
  switch (category) {
    case 'animal': return animals[Math.abs(Math.trunc(seed)) % animals.length]!;
    case 'mage': case 'spirit': return 'arcaneMage';
    case 'dragon': return 'dragonKnight';
    case 'demon': return 'demon';
    case 'techwear': case 'robot': case 'steampunk': return 'techwear';
    case 'sporty': return 'athlete';
    default: return 'student';
  }
}

/** The figure a saved configuration draws: the one it chose, else the one its race opens on. */
export function bodyArchetypeFor(
  config: { bodyArchetype?: FullBodyArchetype; race?: string } | null | undefined
): FullBodyArchetype | null {
  if (!config) return null;
  if (config.bodyArchetype) return config.bodyArchetype;
  return config.race ? archetypeForRace[config.race] ?? null : null;
}

/**
 * Which effect belongs to which pose.
 *
 * The overlay is part of the pose rather than part of the costume: a rune circle under a figure
 * that is standing still is a rune circle nobody asked for, and speed lines behind somebody
 * sitting down are worse. An archetype may carry a standing overlay of its own — the mage's aura —
 * and the pose's effect is drawn over it.
 */
export function overlayForPose(pose: string): ReactElement | null {
  if (pose === 'cast') return runeCircle();
  if (pose === 'attack') return impactFlash();
  if (pose === 'run') return speedLines();
  if (pose === 'cheer') return cheerStars();
  return null;
}
