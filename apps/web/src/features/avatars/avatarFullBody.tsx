import type { ReactElement } from 'react';
import { SKULL } from './avatarGeometry';
import type { AvatarRace } from './avatarSchema';
import { directionRig, faceCentre, faceSqueeze, yawShift, type DirectionRig } from './avatarDirection';
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

/**
 * A shoe, drawn at whichever leg is asking for it.
 *
 * ── Why a function and not a slot ──
 * A leg swings. `frontLeg` and `backLeg` are separately animated groups, and a shoe painted as its
 * own compositing step stands still on the floor while the leg walks out from under it — the same
 * fault as hair that does not follow a head, and just as invisible in a still frame. So footwear is
 * handed *into* the leg and drawn inside its group, which means it turns at the hip with everything
 * else attached to that leg.
 *
 * `x` is the leg's own left edge, so one drawing serves both legs and every leg style: a shoe is
 * authored once against that origin and lands correctly on a boot, a sneaker, a hoof or a piston.
 */
export type FootwearShape = (x: number) => ReactElement;

interface LegOptions {
  /** Boot colour. The brief calls this the accent, and it is what a class is recognised by. */
  boot: string;
  trouser: string;
  skin: string;
  /** What the child chose to put on the foot, drawn over whatever the leg style's own foot is. */
  shoe?: FootwearShape | undefined;
}

function leg(x: number, { boot, trouser, skin, shoe }: LegOptions, claw = false): ReactElement {
  return (
    <g>
      {px(x, 35, 5, 5, trouser)}
      {px(x, 39, 5, 1, PRIMARY_SHADOW)}
      {px(x + 0.5, 40, 4, 3, skin)}
      {shoe ? shoe(x) : claw ? (
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
  const { trouser, skin, shoe: chosen } = options;
  const shoe = (x: number) => (
    <g>
      {px(x, 35, 5.5, 6, trouser)}
      {px(x, 35, 1.5, 6, 'var(--av-primary-highlight)')}
      {px(x + 0.5, 41, 4.5, 1.5, skin)}
      {/* Upper, swoosh, sole — unless the child has chosen something else to put on the foot. */}
      {chosen ? chosen(x) : (
        <>
          {px(x - 1, 42, 7.5, 2, SECONDARY)}
          {px(x - 1, 42.5, 5, 0.75, ACCENT)}
          {px(x - 1.5, 44, 8, 2, WHITE)}
          {px(x - 1.5, 45.5, 8, 0.5, OUTLINE)}
        </>
      )}
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

/**
 * A glove, drawn at whichever hand is asking for it.
 *
 * The same rule footwear follows and for the same reason: an arm swings, so a cuff painted as its
 * own layer hangs in the air where the hand used to be. `x` is the arm's own left edge and
 * `mirrored` says which arm it is, because a cuff's lit edge is on the side the light comes from
 * and that is not the same side on both arms.
 */
export type HandwearShape = (x: number, mirrored: boolean) => ReactElement;

interface ArmOptions {
  sleeve: string;
  skin: string;
  wide?: boolean;
  /** What the child chose to put on the hand, drawn over the bare one. */
  cuff?: HandwearShape | undefined;
}

function arm(x: number, { sleeve, skin, wide, cuff }: ArmOptions, held?: ReactElement, mirrored = false): ReactElement {
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
      {/* Over the bare hand, under whatever it is holding: a glove goes on before a sword. */}
      {cuff ? cuff(x, mirrored) : null}
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
export type EarStyle =
  | 'none' | 'pointed' | 'round' | 'cat' | 'fox' | 'rabbit'
  /* ── the four the second pass needed ──
   * A bear and a panda are the same round ear at different heights; a wolf's is a cat's stretched
   * and set wider; an owl has tufts rather than ears. Each is here because the species it belongs to
   * is unrecognisable without it — an owl drawn with cat ears is a cat. */
  | 'bear' | 'wolf' | 'owl' | 'small';
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

/**
 * The mouth, which carries as much of an expression as the eyes do and used to have one drawing.
 *
 * Every face in the product wore the same three pixels: a bar and a dimple under it, with a tooth
 * added for a fang. Six shapes now, and each is a different silhouette rather than the same one
 * recoloured — a grin is wide and open, a cat's mouth is two curves, a flat line is the face of
 * somebody concentrating.
 */
export type MouthShape = 'smile' | 'fang' | 'none' | 'grin' | 'open' | 'flat' | 'cat';

function mouthShape(shape: MouthShape): ReactElement | null {
  switch (shape) {
    case 'none':
      return null;
    case 'flat':
      // Concentration: one level line, no curve to it at all.
      return <g data-part="mouth">{px(22.25, 16.5, 3.5, 0.75, OUTLINE)}</g>;
    case 'grin':
      // Wide and open, with the teeth as the lit half rather than as separate pixels.
      return (
        <g data-part="mouth">
          {px(21.5, 16, 5, 2.25, OUTLINE)}
          {px(22, 16.25, 4, 0.75, WHITE)}
          {px(22.5, 18.25, 3, 0.5, OUTLINE)}
        </g>
      );
    case 'open':
      // Surprise, or delight: a small round hole, darker at the bottom where the light does not go.
      return (
        <g data-part="mouth">
          {px(22.75, 16, 2.5, 2.5, OUTLINE)}
          {px(23.25, 17.5, 1.5, 0.75, 'var(--av-blush, #ff97ae)')}
        </g>
      );
    case 'cat':
      // Two little curves meeting in the middle, which is the cheapest mouth that reads as fond.
      return (
        <g data-part="mouth">
          {px(21.75, 16.25, 1, 0.75, OUTLINE)}
          {px(22.75, 17, 1, 0.75, OUTLINE)}
          {px(23.75, 17, 1, 0.75, OUTLINE)}
          {px(24.75, 16.25, 1, 0.75, OUTLINE)}
        </g>
      );
    case 'fang':
      return (
        <g data-part="mouth">
          {px(22.5, 16.25, 3, 0.75, OUTLINE)}
          {px(23.25, 17, 1.5, 0.5, OUTLINE)}
          {px(22.75, 17, 1, 1, WHITE)}
          {px(24.75, 17, 1, 1, WHITE)}
        </g>
      );
    default:
      return (
        <g data-part="mouth">
          {px(22.5, 16.25, 3, 0.75, OUTLINE)}
          {px(23.25, 17, 1.5, 0.5, OUTLINE)}
        </g>
      );
  }
}

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
  /** The cut of the eye itself. Shape is what separates one expression from another; colour is not. */
  eyeShape?: EyeShape;
  /** Shut on one side only, which is the whole of a wink and cannot be done with a colour. */
  wink?: boolean;
  brow?: BrowShape;
  mouth?: MouthShape;
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
/**
 * The shape of an eye, which is most of what one face has that another does not.
 *
 * Colour was the only thing that separated twelve expressions, and colour is the one difference a
 * 48-pixel face cannot carry: a violet iris and a black one in the same socket, under the same lid,
 * over the same mouth, read as one character painted twice. These are shapes — how tall the white
 * is, where the lid cuts it, whether it is closed at all.
 *
 * `soft` is the eye every figure had. The rest are departures from it, and each one is drawn rather
 * than tinted.
 */
export type EyeShape = 'soft' | 'sharp' | 'wide' | 'sleepy' | 'star' | 'closed';

/** A brow says more than an iris does. Four of them, above the lid and never touching it. */
export type BrowShape = 'none' | 'flat' | 'angled' | 'raised';

interface EyeOptions {
  eye: string;
  eyeLight?: string | undefined;
  sharp?: boolean | undefined;
  shape?: EyeShape | undefined;
}

/** How tall the white is, where the lid sits, and how much iris is under it. */
const eyeGeometry: Record<EyeShape, { top: number; height: number }> = {
  soft: { top: 9.75, height: 5.25 },
  sharp: { top: 10.5, height: 4 },
  // Rounder and taller, with the lid lifted clear of the iris: surprise, and what a child reads as
  // friendly at this size.
  wide: { top: 9.25, height: 6 },
  // Half shut. The lid comes down over most of the white rather than the eye being drawn smaller,
  // which is the difference between sleepy and simply little.
  sleepy: { top: 11.25, height: 2.5 },
  star: { top: 9.5, height: 5.5 },
  closed: { top: 12, height: 1 }
};

function eyeAt(x: number, { eye, eyeLight, sharp, shape }: EyeOptions, mirrored = false): ReactElement {
  const lit = eyeLight ?? 'var(--av-magic-highlight)';
  const cut: EyeShape = shape ?? (sharp ? 'sharp' : 'soft');
  const { top, height } = eyeGeometry[cut];

  /* A closed eye is a lash line and nothing else: no white, no iris, no glint to give it away. */
  if (cut === 'closed') {
    return (
      <g>
        {px(x, top, 4, 0.75, OUTLINE)}
        {px(mirrored ? x - 0.5 : x + 3.75, top - 0.75, 0.75, 0.75, OUTLINE)}
      </g>
    );
  }

  const inner = mirrored ? x : x + 3.25;
  const irisTop = top + 0.75;
  const irisHeight = height - 1.25;
  return (
    <g>
      {px(x, top, 4, height, WHITE)}
      {/* The iris: base below, lit above, so the light has a direction. */}
      {px(x + 0.5, irisTop, 3, irisHeight, eye)}
      {px(x + 0.5, irisTop, 3, irisHeight / 2, lit)}
      {/*
        * A star in the iris, for the one expression that is about delight rather than mood.
        *
        * Four arms and a lit centre, drawn in the highlight rather than in white, so it reads as the
        * iris catching light and not as a sticker over it.
        */}
      {cut === 'star' ? (
        <g>
          {px(x + 1.25, irisTop + 0.5, 1.5, irisHeight - 1, lit)}
          {px(x + 0.5, irisTop + irisHeight / 2 - 0.75, 3, 1.5, lit)}
          {px(x + 1.5, irisTop + irisHeight / 2 - 0.5, 1, 1, WHITE)}
        </g>
      ) : null}
      {/* The lid line. Slanted inwards on a sharp eye, level on a soft one, lifted on a wide one. */}
      {cut === 'sharp'
        ? <polygon points={`${x},${top} ${x + 4},${top - 1} ${x + 4},${top + 0.75} ${x},${top + 0.75}`} fill={OUTLINE} />
        : px(x, top, 4, cut === 'sleepy' ? 1 : 0.75, OUTLINE)}
      {/* The two glints. Big where the light is, small on the far side; the small one is the wet. */}
      {cut === 'sleepy' ? null : px(mirrored ? x + 2.25 : x + 0.75, top + 1, 1.25, 1.25, WHITE)}
      {cut === 'sleepy' ? null : px(inner - 0.75, top + height - 1.75, 0.75, 0.75, WHITE)}
    </g>
  );
}

/**
 * The pair of brows, drawn above whatever the lid is doing.
 *
 * `angled` drops the inner end and lifts the outer one, which is the whole of a scowl; `raised`
 * does the opposite and reads as open or delighted; `flat` is a level line, the resting face. They
 * are mirrored about the face's centre so both sides of a scowl point the same way.
 */
function browPair(shape: BrowShape): ReactElement | null {
  if (shape === 'none') return null;
  const brow = (x: number, mirrored: boolean) => {
    if (shape === 'flat') return px(x, 8, 4, 0.75, OUTLINE);
    const near = shape === 'angled' ? 8.75 : 7.5;
    const far = shape === 'angled' ? 7.5 : 8.5;
    const left = mirrored ? far : near;
    const right = mirrored ? near : far;
    return (
      <polygon
        points={`${x},${left} ${x + 4},${right} ${x + 4},${right + 0.75} ${x},${left + 0.75}`}
        fill={OUTLINE}
      />
    );
  };
  return <g data-part="brows">{brow(18.25, false)}{brow(25.75, true)}</g>;
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
        {/* A bear's, and a panda's: round, low and set wide, which is the whole difference from a
            cat's. Set high they read as a mouse. */}
        {ears === 'bear' ? (
          <>
            <circle cx="15" cy="6" r="3.5" fill={fur} />
            <circle cx="33" cy="6" r="3.5" fill={fur} />
            <circle cx="15" cy="6" r="1.75" fill={BLUSH} />
            <circle cx="33" cy="6" r="1.75" fill={BLUSH} />
          </>
        ) : null}
        {/* A wolf's: a cat's ear stretched and stood further apart, tipped in the darker fur. */}
        {ears === 'wolf' ? (
          <>
            <polygon points="14.5,7.5 16.5,0 21.5,6" fill={fur} />
            <polygon points="33.5,7.5 31.5,0 26.5,6" fill={fur} />
            <polygon points="16.5,0 15.6,2.5 18,2" fill={HAIR_SHADOW} />
            <polygon points="31.5,0 32.4,2.5 30,2" fill={HAIR_SHADOW} />
          </>
        ) : null}
        {/* An owl has no ears at all — the tufts are feathers, and they sit inboard rather than at
            the edge of the skull, which is what stops it reading as a horned cat. */}
        {ears === 'owl' ? (
          <>
            <polygon points="17.5,5 19,0.5 21.5,4.5" fill={fur} />
            <polygon points="30.5,5 29,0.5 26.5,4.5" fill={fur} />
            <polygon points="18.5,4.5 19,2 20.2,4.2" fill={HAIR_HIGHLIGHT} />
          </>
        ) : null}
        {/* Barely there: a deer, a raccoon, anything whose silhouette is carried by something else. */}
        {ears === 'small' ? (
          <>
            {px(13.5, 7, 2.5, 3, fur)}
            {px(32, 7, 2.5, 3, HAIR_SHADOW)}
            {px(14, 7.75, 1.5, 1.5, BLUSH)}
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
  eye, eyeLight, snout = 'none', blush, whiskers, sharp, eyeShape, wink, brow = 'none',
  mouth = 'smile', rig
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
  /*
   * Moved and narrowed, about the face's own centre line.
   *
   * The order matters and is read right to left: the pair is squeezed towards x 24 first, then the
   * whole thing is carried to where the turn puts it. Squeezing after the move would compress it
   * towards the skull's centre instead of its own, which pulls the near eye back the way it came.
   */
  const centre = faceCentre(turn);
  const squeeze = faceSqueeze(turn);
  const transform = turn.yaw === 0
    ? undefined
    : `translate(${centre - SKULL.centre} 0) translate(${SKULL.centre} 0) scale(${squeeze} 1) translate(${-SKULL.centre} 0)`;
  return (
    <g data-part="face" transform={transform}>
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
      {browPair(brow)}
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
        {eyeAt(18.25, { eye, eyeLight, sharp, shape: eyeShape })}
        {/* A wink shuts the near eye only, so the pair still reads as one face doing one thing. */}
        {eyeAt(25.75, { eye, eyeLight, sharp, shape: wink ? 'closed' : eyeShape }, true)}
      </g>
      {blush ? (
        <g opacity="0.7">
          {px(16.5, 14.5, 3, 1.5, BLUSH)}
          {px(28.5, 14.5, 3, 1.5, BLUSH)}
        </g>
      ) : null}
      {snout === 'none' ? mouthShape(mouth) : null}
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
 * The second parts library
 *
 * Ten costumes needed five torsos, four pairs of legs and a handful of held things. Forty-one need
 * more vocabulary, and the vocabulary is the point: an archetype assembled from parts nothing else
 * uses is a bespoke drawing wearing a spec's clothes, while an archetype that is only a recolour of
 * another is the thing this whole pass exists to stop. Each part below is used by at least two
 * archetypes and is the reason at least one of them is recognisable.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A wolf's: long, low and straight out behind, unlike a cat's upright curl. */
export function wolfTail(): ReactElement {
  return (
    <g data-part="tail">
      <polygon points="31,31 40,28 43,31 40,35 31,35" fill={HAIR} />
      <polygon points="40,28 43,31 41,32" fill={HAIR_HIGHLIGHT} />
      <polygon points="31,33 40,33 40,35 31,35" fill={HAIR_SHADOW} />
    </g>
  );
}

/** A raccoon's, which is the species: the rings are the whole recognition. */
export function ringTail(): ReactElement {
  return (
    <g data-part="tail">
      {px(31, 30, 10, 4, HAIR)}
      {px(33, 30, 2, 4, HAIR_SHADOW)}
      {px(36.5, 30, 2, 4, HAIR_SHADOW)}
      {px(40, 30, 1.5, 4, WHITE)}
    </g>
  );
}

/** A stub, for a bear, a panda or a deer — animals a long tail would make into something else. */
export function stubTail(): ReactElement {
  return (
    <g data-part="tail">
      <circle cx="33" cy="33" r="2.5" fill={HAIR} />
      <circle cx="32.4" cy="32.4" r="1.1" fill={HAIR_HIGHLIGHT} />
    </g>
  );
}

/** Feathered, for an owl and for anything angelic: layered rather than membraned. */
export function featherWings(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="16,24 7,22 5,30 15,32" fill={WHITE} />
      <polygon points="32,24 41,22 43,30 33,32" fill={WHITE} />
      <polygon points="16,27 8,26 7,30 15,31" fill={SECONDARY_SHADOW} opacity="0.4" />
      <polygon points="32,27 40,26 41,30 33,31" fill={SECONDARY_SHADOW} opacity="0.4" />
    </g>
  );
}

/** A fairy's: four small panes, lit rather than solid, so they read as glass at 32 pixels. */
export function fairyWings(): ReactElement {
  return (
    <g data-part="wing" opacity="0.75">
      <ellipse cx="12" cy="24" rx="5" ry="7" fill={MAGIC} />
      <ellipse cx="36" cy="24" rx="5" ry="7" fill={MAGIC} />
      <ellipse cx="13" cy="32" rx="3.5" ry="4.5" fill={MAGIC_HIGHLIGHT} />
      <ellipse cx="35" cy="32" rx="3.5" ry="4.5" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/* ── torsos ── */

/** A white coat over whatever is under it: the scientist, the inventor, the medic. */
export function torsoLabcoat(): ReactElement {
  return (
    <g data-part="torso">
      {px(16, 21, 16, 14, WHITE)}
      {px(16, 21, 16, 1.5, 'var(--av-primary-highlight)')}
      {px(23.5, 21, 1, 14, SECONDARY_SHADOW)}
      {px(17, 22, 5, 4, PRIMARY)}
      {px(18, 27, 3, 1, ACCENT)}
    </g>
  );
}

/** A collar, a lapel and a tie: the developer, the scholar, anybody at a desk. */
export function torsoSuit(): ReactElement {
  return (
    <g data-part="torso">
      {px(17, 21, 14, 12, SECONDARY)}
      {px(17, 21, 14, 1.5, 'var(--av-primary-highlight)')}
      <polygon points="21,21 24,27 24,21" fill={WHITE} />
      <polygon points="27,21 24,27 24,21" fill={WHITE} />
      {px(23.25, 22, 1.5, 7, ACCENT)}
      {px(17, 31.5, 14, 1.5, SECONDARY_SHADOW)}
    </g>
  );
}

/** A sealed suit with a chest panel and a collar ring: the astronaut and the diver. */
export function torsoSpacesuit(): ReactElement {
  return (
    <g data-part="torso">
      {px(15.5, 21, 17, 14, WHITE)}
      {px(15.5, 21, 17, 2, SECONDARY)}
      {px(19, 24, 10, 5, SECONDARY_SHADOW)}
      {px(20, 25, 3, 2, MAGIC)}
      {px(24.5, 25, 3.5, 1, ACCENT)}
      {px(15.5, 31, 17, 1.5, ACCENT)}
    </g>
  );
}

/** Layered plate with a pauldron each side: the paladin, the heavy warrior. */
export function torsoHeavyPlate(): ReactElement {
  return (
    <g data-part="torso">
      {px(16, 21, 16, 13, SECONDARY)}
      {px(16, 21, 16, 1.5, 'var(--av-primary-highlight)')}
      {px(13.5, 21, 5, 5, SECONDARY)}
      {px(29.5, 21, 5, 5, SECONDARY)}
      {px(13.5, 21, 5, 1, ACCENT)}
      {px(29.5, 21, 5, 1, ACCENT)}
      {px(21, 26, 6, 6, ACCENT)}
      {px(22, 27.5, 4, 3, MAGIC)}
    </g>
  );
}

/** A panelled chassis with a core: the robot, the android, the drone. */
export function torsoChassis(): ReactElement {
  return (
    <g data-part="torso">
      {px(16.5, 21, 15, 13, SECONDARY)}
      {px(16.5, 21, 15, 1.5, 'var(--av-primary-highlight)')}
      {px(16.5, 26, 15, 0.5, OUTLINE)}
      <circle cx="24" cy="29" r="3" fill={MAGIC} />
      <circle cx="24" cy="29" r="1.25" fill={MAGIC_HIGHLIGHT} />
      {px(17.5, 22.5, 3, 2, SECONDARY_SHADOW)}
      {px(27.5, 22.5, 3, 2, SECONDARY_SHADOW)}
    </g>
  );
}

/* ── legs ── */

interface HoofOptions { boot: string; trouser: string; shoe?: FootwearShape | undefined }

/** Cloven, for a deer and a faun: the leg narrows where a boot would widen. */
export function legsHooves({ boot, trouser, shoe }: HoofOptions): ReactElement {
  const leg = (x: number) => (
    <g>
      {px(x, 35, 5, 6, trouser)}
      {px(x + 1, 41, 3, 3, HAIR_SHADOW)}
      {shoe ? shoe(x) : (
        <>
          {px(x + 0.5, 44, 4, 2, boot)}
          {px(x + 2.25, 44, 0.5, 2, OUTLINE)}
        </>
      )}
    </g>
  );
  return (
    <g data-part="legs">
      <g data-part="backLeg">{leg(25)}</g>
      <g data-part="frontLeg">{leg(18)}</g>
    </g>
  );
}

/** Jointed metal: a piston at the knee and a plate at the foot. */
export function legsMechanical({ boot, trouser, shoe }: HoofOptions): ReactElement {
  const leg = (x: number) => (
    <g>
      {px(x + 0.5, 35, 4, 4, trouser)}
      {px(x + 1.5, 39, 2, 3, OUTLINE)}
      {px(x + 0.5, 42, 4, 2, trouser)}
      {shoe ? shoe(x) : (
        <>
          {px(x - 0.5, 44, 6, 2, boot)}
          {px(x - 0.5, 44, 6, 0.5, ACCENT)}
        </>
      )}
    </g>
  );
  return (
    <g data-part="legs">
      <g data-part="backLeg">{leg(25)}</g>
      <g data-part="frontLeg">{leg(18)}</g>
    </g>
  );
}

/**
 * No legs at all: a wisp, a drone, anything that hovers.
 *
 * It still occupies the leg band and still reaches the floor, because the ground shadow is drawn at
 * y 46 and a figure whose lowest point is y 38 reads as falling rather than as flying. The taper
 * and the two motes are what say the gap is deliberate.
 */
export function legsHovering(): ReactElement {
  return (
    <g data-part="legs">
      <g data-part="backLeg">
        <polygon points="20,35 28,35 26,41 22,41" fill={MAGIC} opacity="0.75" />
        <polygon points="22,41 26,41 25,44 23,44" fill={MAGIC} opacity="0.45" />
      </g>
      <g data-part="frontLeg">
        {px(21, 44, 2, 1.5, MAGIC_HIGHLIGHT)}
        {px(25, 45, 1.5, 1, MAGIC_HIGHLIGHT)}
      </g>
    </g>
  );
}

/* ── worn on the head ── */

/** A sealed dome with a lit band: the astronaut. Nothing else in the set covers the whole skull. */
export function spaceHelmet(): ReactElement {
  return (
    <g data-part="headwear">
      <ellipse cx="24" cy="11" rx="11.5" ry="11" fill={WHITE} opacity="0.28" />
      <ellipse cx="24" cy="11" rx="11.5" ry="11" fill="none" stroke={SECONDARY} strokeWidth="1.5" />
      {px(13.5, 3.5, 21, 2, SECONDARY)}
      {px(15, 5.5, 18, 1, MAGIC_HIGHLIGHT)}
      {px(12.5, 17, 23, 2, SECONDARY_SHADOW)}
    </g>
  );
}

/** A thin band with one stone: the elf, the celestial, the royal. */
export function circlet(): ReactElement {
  return (
    <g data-part="headwear">
      {px(14.5, 6, 19, 1.5, ACCENT)}
      {px(14.5, 6, 19, 0.5, 'var(--av-primary-highlight)')}
      <polygon points="24,3 25.5,6 22.5,6" fill={MAGIC} />
      <polygon points="24,4 24.8,6 23.2,6" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/** Straight, back-swept and cold: the ice dragon, told from the fire one by the angle alone. */
export function iceHorns(): ReactElement {
  return (
    <g data-part="headwear">
      {px(14.5, 3.5, 19, 5, HAIR)}
      {px(14.5, 3.5, 19, 1.5, HAIR_HIGHLIGHT)}
      <polygon points="16,5 9,0 13,7" fill={MAGIC} />
      <polygon points="32,5 39,0 35,7" fill={MAGIC} />
      <polygon points="16,5 11,2 14,6" fill={MAGIC_HIGHLIGHT} />
      <polygon points="32,5 37,2 34,6" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/** Two aerials over a plated cap: the android, the drone, anything that receives. */
export function antennaCap(): ReactElement {
  return (
    <g data-part="headwear">
      {px(14.5, 4, 19, 4.5, SECONDARY)}
      {px(14.5, 4, 19, 1.25, 'var(--av-primary-highlight)')}
      {px(17, 7.5, 1, 4, SECONDARY_SHADOW)}
      {px(17, 1.25, 1, 3.25, SECONDARY)}
      {px(30, 1.25, 1, 3.25, SECONDARY)}
      {/* Centred at 1.25 with a radius of 1.25, so the tip of each aerial is exactly the ceiling.
          At 0.75 the lit half of the bead was outside the frame and sheared off by every crop. */}
      <circle cx="17.5" cy="1.25" r="1.25" fill={MAGIC} />
      <circle cx="30.5" cy="1.25" r="1.25" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

/** A hood pulled up, face still showing: the explorer, the netrunner, the rogue. */
export function hoodUp(): ReactElement {
  return (
    <g data-part="headwear">
      <polygon points="24,0.5 36,10 36,17 31,12 17,12 12,17 12,10" fill={PRIMARY} />
      <polygon points="24,0.5 30,9 18,9" fill={PRIMARY_HIGHLIGHT} opacity="0.45" />
      {px(12, 16, 24, 2, PRIMARY_SHADOW)}
    </g>
  );
}

/**
 * A smooth plate over the whole skull with one lit seam: the android that is trying to pass.
 *
 * It exists because the android was a recolour of the robot — the same chassis, the same aerials,
 * the same legs, differing only in an overlay the silhouette test does not look at. Two of the four
 * structural anchors had to move, and the head is the one a reader checks first.
 */
export function faceplate(): ReactElement {
  return (
    <g data-part="headwear">
      {px(14.5, 3, 19, 6, SECONDARY)}
      {px(14.5, 3, 19, 1.25, 'var(--av-primary-highlight)')}
      {px(14.5, 8, 19, 1, SECONDARY_SHADOW)}
      {px(16, 9.5, 16, 1, MAGIC)}
      {px(23, 1.5, 2, 1.5, MAGIC_HIGHLIGHT)}
    </g>
  );
}

/** A soft cap pulled to one side: the artist, the musician. */
export function beret(): ReactElement {
  return (
    <g data-part="headwear">
      <ellipse cx="24" cy="5" rx="10.5" ry="4" fill={SECONDARY} />
      <ellipse cx="21" cy="4" rx="4" ry="1.75" fill={'var(--av-primary-highlight)'} opacity="0.5" />
      {px(32, 1.5, 1.5, 2.5, ACCENT)}
      {px(14, 6.5, 20, 1.5, SECONDARY_SHADOW)}
    </g>
  );
}

/** Goggles pushed up onto the forehead, which is how somebody who uses them wears them. */
export function goggleBand(): ReactElement {
  return (
    <g data-part="headwear">
      {px(14.5, 3.5, 19, 5, HAIR)}
      {px(14.5, 3.5, 19, 1.5, HAIR_HIGHLIGHT)}
      {px(14, 7, 20, 2.5, SECONDARY_SHADOW)}
      <circle cx="19" cy="8.25" r="2.5" fill={SECONDARY} />
      <circle cx="29" cy="8.25" r="2.5" fill={SECONDARY} />
      <circle cx="19" cy="8.25" r="1.25" fill={MAGIC} />
      <circle cx="29" cy="8.25" r="1.25" fill={MAGIC} />
    </g>
  );
}

/* ── things a hand holds ── */

/*
 * Six drawings that were private to the figure translator and are now shared.
 *
 * They were reachable only from , which imports from here — so an archetype that
 * wanted a flask could not have one without a cycle. Moving them is the alternative to drawing a
 * second flask, and a second drawing of the same object is how two parts of one product end up
 * disagreeing about what a flask looks like.
 */

/*
 * Six drawings that were private to the figure translator and are now shared.
 *
 * They were reachable only from `avatarFigureParts`, which imports from here — so an archetype
 * that wanted a flask could not have one without a cycle. Moving them is the alternative to
 * drawing a second flask, and a second drawing of one object is how two parts of a product end up
 * disagreeing about what a flask looks like.
 */
export function flask(): ReactElement {
  return (
    <g>
      {px(13, 27, 4, 2, WHITE)}
      <polygon points="13.5,29 16.5,29 17.5,34 12.5,34" fill={WHITE} opacity="0.85" />
      <polygon points="13.2,31 16.8,31 17.5,34 12.5,34" fill={MAGIC} />
      {px(14, 25.5, 2, 1.5, SECONDARY)}
    </g>
  );
}

export function openBook(): ReactElement {
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

export function palette(): ReactElement {
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

export function lantern(): ReactElement {
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

export function backpack(): ReactElement {
  return (
    <g data-part="back">
      {px(31, 22, 6, 9, SECONDARY)}
      {px(31, 22, 6, 1.5, SECONDARY_SHADOW)}
      {px(32, 25, 4, 3, ACCENT)}
      {px(29, 23, 2, 7, SECONDARY_SHADOW)}
    </g>
  );
}

export function jetpack(): ReactElement {
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

export function wrench(): ReactElement {
  return (
    <g data-part="held">
      {px(14, 24, 2, 9, SECONDARY)}
      {px(13, 22, 4, 3, SECONDARY)}
      {px(14, 22, 2, 1.5, OUTLINE)}
      {px(14, 24, 0.75, 9, 'var(--av-primary-highlight)')}
    </g>
  );
}

export function paintBrush(): ReactElement {
  return (
    <g data-part="held">
      {px(14.5, 23, 1.5, 9, ACCENT)}
      {px(14, 21, 2.5, 2, SECONDARY)}
      {px(14, 19.5, 2.5, 1.75, MAGIC)}
    </g>
  );
}

export function guitar(): ReactElement {
  return (
    <g data-part="held">
      <ellipse cx="15" cy="30" rx="4.5" ry="5.5" fill={SECONDARY} />
      <circle cx="15" cy="30" r="1.75" fill={OUTLINE} />
      {px(14.25, 19, 1.5, 7, SECONDARY_SHADOW)}
      {px(13.75, 18, 2.5, 1.5, ACCENT)}
    </g>
  );
}

export function torch(): ReactElement {
  return (
    <g data-part="held">
      {px(14.5, 25, 1.5, 8, SECONDARY_SHADOW)}
      <polygon points="15.25,18 18,23 12.5,23" fill={ACCENT} />
      <polygon points="15.25,20 16.8,23 13.7,23" fill={MAGIC_HIGHLIGHT} />
    </g>
  );
}

export function blaster(): ReactElement {
  return (
    <g data-part="held">
      {px(11, 25, 7, 3, SECONDARY)}
      {px(11, 25, 7, 1, 'var(--av-primary-highlight)')}
      {px(14.5, 28, 2, 4, SECONDARY_SHADOW)}
      {px(9, 25.5, 2, 2, MAGIC)}
    </g>
  );
}

export function tabletSlab(): ReactElement {
  return (
    <g data-part="held">
      {px(10.5, 24, 7, 9, SECONDARY)}
      {px(11.5, 25, 5, 7, MAGIC)}
      {px(11.5, 25, 5, 1.5, MAGIC_HIGHLIGHT)}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The archetypes
 *
 * Forty-one figures in four families. Ten of them are written out in full below because they were
 * drawn one at a time before there was a vocabulary to assemble them from, and rewriting a costume a
 * thousand children are already wearing to save a few lines is not a trade worth making. The other
 * thirty-one are assembled from the parts above by `buildArchetype`, which is the same nine slots
 * filled in — just stated as what the figure *is* rather than as a list of function calls.
 * ──────────────────────────────────────────────────────────────────────────── */

export type FullBodyArchetype =
  // The ten drawn one at a time, before there was a vocabulary to assemble from. Their ids are in a
  // thousand saved records, so they are never renamed and never re-spelled.
  | 'dragonKnight' | 'arcaneMage' | 'demon' | 'student' | 'athlete'
  | 'cat' | 'fox' | 'rabbit' | 'penguin' | 'techwear'
  // People.
  | 'scientist' | 'developer' | 'scholar' | 'explorer' | 'artist' | 'musician' | 'inventor'
  | 'adventurer'
  // Animals.
  | 'dog' | 'panda' | 'bear' | 'owl' | 'raccoon' | 'wolf' | 'tiger' | 'deer' | 'fantasyBeast'
  // Fantasy.
  | 'iceDragon' | 'elf' | 'fairy' | 'vampire' | 'warrior' | 'paladin' | 'celestial' | 'voidStalker'
  // Machines.
  | 'robotChassis' | 'cyborg' | 'astronaut' | 'androidAI' | 'netrunner' | 'drone';

/**
 * The species facts of a costume, stated rather than left inside its drawing.
 *
 * ── Why this exists ──
 * A child picks a character — a cat, an ice dragon, a robot chassis — and then dresses it from the
 * drawers. Those are two different questions, and the wardrobe was answering both: it drew a whole
 * human figure over whatever had been chosen, so every one of the forty-one characters came out as
 * the same person and only the things the wardrobe happened to leave empty (a tail, an aura) ever
 * reached the screen. Picking a model did nothing you could see.
 *
 * The costume owns the body and the wardrobe owns the clothes, so the wardrobe has to be able to
 * read the body it is dressing: where the ears are, whether there is a muzzle, whether this is a
 * torso box or one soft shape, and which cap a hairstyle takes on this skull. That is all this is —
 * no drawings, nothing the compositor has to order, just the handful of facts a garment or a
 * haircut has to fit itself to.
 */
export interface ArchetypeBody {
  ears: EarStyle;
  snout: SnoutStyle;
  whiskers: boolean;
  /** Claws rather than boots, which changes the foot and nothing else. */
  claw: boolean;
  /** One soft shape rather than a torso box: a penguin, a drone, anything without a waist. */
  round: boolean;
  /**
   * Which cap a chosen hairstyle takes on this head.
   *
   * A hairstyle is authored against a fit rather than scaled to a skull — see `avatarHair` — and the
   * fits are named after the six races because that is where they came from. A muzzled or eared head
   * wears a shallower cut, and a manufactured one wears a plate with a seam rather than hair.
   */
  hairRace: AvatarRace;
}

/** A plain human frame: what a costume has unless it says otherwise. */
export const plainBody: ArchetypeBody = {
  ears: 'none', snout: 'none', whiskers: false, claw: false, round: false, hairRace: 'human'
};

export interface ArchetypeDefinition {
  id: FullBodyArchetype;
  /** Thai, because it is read by the person choosing it. */
  name: string;
  description: string;
  /** Which of the four families the picker files it under. */
  group: ArchetypeGroup;
  /** The body under the costume, for the wardrobe that dresses it. */
  body: ArchetypeBody;
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

const handDrawnArchetypes: Partial<Record<FullBodyArchetype, ArchetypeDefinition>> = {
  dragonKnight: {
    id: 'dragonKnight',
    body: { ...plainBody, snout: 'muzzle', claw: true, hairRace: 'dragonkin' },
    group: 'fantasy',
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
    body: { ...plainBody, hairRace: 'spirit' },
    group: 'fantasy',
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
    body: { ...plainBody, ears: 'pointed', claw: true, hairRace: 'demon' },
    group: 'fantasy',
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
    body: plainBody,
    group: 'humanoid',
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
    body: plainBody,
    group: 'humanoid',
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
    body: { ...plainBody, ears: 'cat', whiskers: true, hairRace: 'beastfolk' },
    group: 'beast',
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
    body: { ...plainBody, ears: 'fox', snout: 'muzzle', whiskers: true, claw: true, hairRace: 'beastfolk' },
    group: 'beast',
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
    body: { ...plainBody, ears: 'rabbit', hairRace: 'beastfolk' },
    group: 'beast',
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
    body: { ...plainBody, snout: 'beak', round: true, hairRace: 'beastfolk' },
    group: 'beast',
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
    body: { ...plainBody, hairRace: 'robot' },
    group: 'scifi',
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

/* ────────────────────────────────────────────────────────────────────────────
 * The other thirty-one, stated rather than drawn
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a figure is made of, as a record.
 *
 * Ten costumes could be written out by hand. Forty-one cannot: a list of function calls repeated
 * forty-one times is forty-one chances to give one of them the wrong pair of legs, and no way to see
 * at a glance that the wolf and the fox are actually different. A spec is the same nine slots said
 * once each — and because it is data, "is this one a recolour of that one" becomes a question that
 * can be answered by reading two lines rather than two drawings.
 */
interface ArchetypeSpec {
  id: FullBodyArchetype;
  name: string;
  description: string;
  group: ArchetypeGroup;
  ears?: EarStyle;
  snout?: SnoutStyle;
  whiskers?: boolean;
  /** Claws rather than boots, which changes the foot and nothing else. */
  claw?: boolean;
  eye?: string;
  eyeLight?: string;
  sharp?: boolean;
  blush?: boolean;
  mouth?: 'smile' | 'fang' | 'none';
  torso: () => ReactElement;
  legs: 'standing' | 'sneakers' | 'webbed' | 'robed' | 'hooves' | 'mechanical' | 'hovering';
  /** What is worn on the head. Absent leaves the hair the child chose showing. */
  headwear?: () => ReactElement;
  hair?: () => ReactElement;
  back?: () => ReactElement;
  /** Colours the sleeves; the arms take it from here so a labcoat's arms are white. */
  sleeve?: string;
  frontHand?: () => ReactElement;
  backHand?: () => ReactElement;
  overlay?: () => ReactElement;
}

/** The four families the picker groups by, and the reason each one exists. */
export type ArchetypeGroup = 'humanoid' | 'beast' | 'fantasy' | 'scifi';

export const archetypeGroupLabels: Record<ArchetypeGroup, string> = {
  humanoid: 'คน',
  beast: 'สัตว์',
  fantasy: 'แฟนตาซี',
  scifi: 'ไซไฟ'
};

function legsFor(kind: ArchetypeSpec['legs'], claw: boolean): ReactElement {
  const plain = { boot: SECONDARY, trouser: PRIMARY, skin: SKIN };
  switch (kind) {
    case 'sneakers': return legsSneakers(plain);
    case 'webbed': return legsWebbed();
    case 'robed': return robedLegs({ boot: ACCENT, trouser: SECONDARY, skin: SKIN });
    case 'hooves': return legsHooves({ boot: SECONDARY, trouser: PRIMARY });
    case 'mechanical': return legsMechanical({ boot: ACCENT, trouser: SECONDARY });
    case 'hovering': return legsHovering();
    case 'standing':
    default: return legsStanding(plain, claw);
  }
}

/**
 * Which cap a spec's head takes, read off the head rather than listed again.
 *
 * The fits are named after the six races because that is where they came from, and what separates
 * them is depth: a muzzled or eared skull wears a shallower cut, a manufactured one wears a plate
 * with a seam, and a pointed-eared one sits between. Deriving it here means a new archetype cannot
 * forget to say — it says it by having ears or a snout, which it had to do anyway.
 */
function hairRaceFor(spec: ArchetypeSpec): AvatarRace {
  if (spec.group === 'scifi') return 'robot';
  if (spec.snout && spec.snout !== 'none') return 'beastfolk';
  if (spec.ears && spec.ears !== 'none' && spec.ears !== 'pointed') return 'beastfolk';
  if (spec.ears === 'pointed') return spec.group === 'fantasy' ? 'demon' : 'spirit';
  return 'human';
}

/** One spec, turned into the same nine slots everything else fills. */
function buildArchetype(spec: ArchetypeSpec): ArchetypeDefinition {
  const sleeve = spec.sleeve ?? PRIMARY;
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    group: spec.group,
    body: {
      ears: spec.ears ?? 'none',
      snout: spec.snout ?? 'none',
      whiskers: spec.whiskers ?? false,
      claw: spec.claw ?? false,
      // A body with no waist is one the wardrobe cannot cut a shirt for: it keeps its own shape.
      round: spec.legs === 'webbed' || spec.legs === 'hovering',
      hairRace: hairRaceFor(spec)
    },
    slots: (rig) => {
      const slots: Partial<Record<BodySlot, ReactElement>> = {
        shadow: groundShadow(),
        back_arm: backArm({ sleeve, skin: SKIN }, spec.backHand?.()),
        legs_feet: legsFor(spec.legs, spec.claw ?? false),
        torso_body: spec.torso(),
        head_neck: headShape({
          ...(spec.snout === undefined ? {} : { snout: spec.snout }),
          ...(spec.ears === undefined ? {} : { ears: spec.ears }),
          rig
        }),
        face: faceFeatures({
          eye: spec.eye ?? OUTLINE,
          ...(spec.eyeLight === undefined ? {} : { eyeLight: spec.eyeLight }),
          ...(spec.sharp === undefined ? {} : { sharp: spec.sharp }),
          ...(spec.blush === undefined ? {} : { blush: spec.blush }),
          ...(spec.mouth === undefined ? {} : { mouth: spec.mouth }),
          ...(spec.snout === undefined ? {} : { snout: spec.snout }),
          ...(spec.whiskers === undefined ? {} : { whiskers: spec.whiskers }),
          rig
        }),
        front_arm_weapon: frontArm({ sleeve, skin: SKIN }, spec.frontHand?.())
      };
      if (spec.hair) slots.hair_headwear = spec.hair();
      if (spec.headwear) slots.headwear = spec.headwear();
      if (spec.back) slots.back_gear = spec.back();
      if (spec.overlay) slots.overlay_fx = spec.overlay();
      return slots;
    }
  };
}

/*
 * The thirty-one.
 *
 * Grouped as the brief groups them, and each one differs from its neighbours in at least two of the
 * structural anchors — the body it stands on, what is on its head, what is behind it, what it holds.
 * One anchor's difference is a recolour; that rule is the same one `avatarIdentity.ts` enforces on a
 * child's own build, and it is enforced here by a test that compares every pair.
 */
const archetypeSpecs: ArchetypeSpec[] = [
  /* ── people ── */
  { id: 'scientist', name: 'นักวิทยาศาสตร์', description: 'เสื้อกาวน์ แว่นตา และหลอดทดลองในมือ', group: 'humanoid',
    torso: torsoLabcoat, legs: 'standing', sleeve: WHITE, hair: shortHair, headwear: goggleBand,
    frontHand: flask, eyeLight: 'var(--av-magic-highlight)' },
  { id: 'developer', name: 'นักเขียนโปรแกรม', description: 'เสื้อฮู้ด หูฟัง และแท็บเล็ตในมือ', group: 'humanoid',
    torso: torsoHoodie, legs: 'sneakers', hair: shortHair, headwear: hoodUp, frontHand: tabletSlab },
  { id: 'scholar', name: 'นักวิชาการ', description: 'สูทเรียบ แว่นตา และตำราเปิดอยู่', group: 'humanoid',
    torso: torsoSuit, legs: 'standing', sleeve: SECONDARY, hair: shortHair, headwear: circlet,
    frontHand: openBook, backHand: spellbook },
  { id: 'explorer', name: 'นักสำรวจ', description: 'ฮู้ดกันลม เป้สะพายหลัง และคบเพลิง', group: 'humanoid',
    torso: torsoShirt, legs: 'standing', hair: shortHair, headwear: hoodUp, back: backpack, frontHand: torch },
  { id: 'artist', name: 'ศิลปิน', description: 'หมวกเบเรต์ ผ้ากันเปื้อน และพู่กัน', group: 'humanoid',
    torso: torsoShirt, legs: 'sneakers', hair: shortHair, headwear: beret, frontHand: paintBrush,
    backHand: palette, blush: true },
  { id: 'musician', name: 'นักดนตรี', description: 'หมวกเบเรต์ กีตาร์ และท่ายืนเล่น', group: 'humanoid',
    torso: torsoSuit, legs: 'sneakers', sleeve: SECONDARY, hair: shortHair, headwear: beret,
    frontHand: guitar, mouth: 'smile' },
  { id: 'inventor', name: 'นักประดิษฐ์', description: 'เสื้อกาวน์ แว่นตานิรภัย และประแจ', group: 'humanoid',
    torso: torsoLabcoat, legs: 'mechanical', sleeve: WHITE, hair: shortHair, headwear: goggleBand,
    frontHand: wrench, backHand: lantern },
  { id: 'adventurer', name: 'นักผจญภัย', description: 'เกราะเบา ผ้าคลุม ดาบ และโล่', group: 'humanoid',
    torso: torsoPlate, legs: 'standing', sleeve: SECONDARY, hair: shortHair, back: cape,
    frontHand: sword, backHand: shield },

  /* ── animals ── */
  { id: 'dog', name: 'น้องหมา', description: 'หูตก ปากยื่น หางกระดิก และแก้มแดง', group: 'beast',
    ears: 'small', snout: 'muzzle', whiskers: true, blush: true, torso: torsoHoodie, legs: 'standing',
    hair: furTuft, back: wolfTail, mouth: 'fang' },
  { id: 'panda', name: 'น้องแพนด้า', description: 'หูกลม ตาขอบดำ ตัวกลม และหางสั้น', group: 'beast',
    ears: 'bear', blush: true, torso: torsoRound, legs: 'standing', hair: furTuft, back: stubTail,
    eye: OUTLINE, eyeLight: WHITE },
  { id: 'bear', name: 'น้องหมี', description: 'หูกลมต่ำ ตัวใหญ่ อุ้งเท้าหนา', group: 'beast',
    ears: 'bear', snout: 'muzzle', torso: torsoRound, legs: 'standing', claw: true, hair: furTuft,
    back: stubTail },
  { id: 'owl', name: 'น้องนกฮูก', description: 'พู่ขนบนหัว ปากงุ้ม และปีกขนนก', group: 'beast',
    ears: 'owl', snout: 'beak', torso: torsoRound, legs: 'webbed', hair: furTuft, back: featherWings,
    eye: ACCENT, eyeLight: WHITE, sharp: true },
  { id: 'raccoon', name: 'น้องแรคคูน', description: 'หน้ากากรอบตา หางลายปล้อง และมือคล่อง', group: 'beast',
    ears: 'small', snout: 'muzzle', whiskers: true, torso: torsoShirt, legs: 'standing', hair: furTuft,
    back: ringTail, eye: OUTLINE, eyeLight: WHITE },
  { id: 'wolf', name: 'น้องหมาป่า', description: 'หูแหลมสูง ตาคม และหางยาวตรง', group: 'beast',
    ears: 'wolf', snout: 'muzzle', whiskers: true, sharp: true, torso: torsoPlate, legs: 'standing',
    claw: true, hair: furTuft, back: wolfTail, mouth: 'fang', eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'tiger', name: 'น้องเสือ', description: 'หูกลม ลายพาดกลอน เขี้ยว และกรงเล็บ', group: 'beast',
    ears: 'cat', snout: 'muzzle', whiskers: true, sharp: true, torso: torsoPlate, legs: 'standing',
    claw: true, hair: furTuft, back: catTail, mouth: 'fang', eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'deer', name: 'น้องกวาง', description: 'หูเล็ก กีบเท้า และเขากวาง', group: 'beast',
    ears: 'small', snout: 'muzzle', blush: true, torso: torsoShirt, legs: 'hooves', hair: furTuft,
    back: stubTail },
  { id: 'fantasyBeast', name: 'สัตว์ในตำนาน', description: 'เขาโค้ง ปีกค้างคาว หางปล้อง และออร่า', group: 'beast',
    ears: 'wolf', snout: 'muzzle', sharp: true, torso: torsoPlate, legs: 'standing', claw: true,
    headwear: hornedHelm, back: batWings, overlay: spellAura, mouth: 'fang',
    eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },

  /* ── fantasy ── */
  { id: 'iceDragon', name: 'มังกรน้ำแข็ง', description: 'เขาน้ำแข็งตรง เกล็ดเย็น หางปล้อง และคทา', group: 'fantasy',
    snout: 'muzzle', sharp: true, torso: torsoPlate, legs: 'standing', claw: true, sleeve: SECONDARY,
    headwear: iceHorns, back: scaledTail, frontHand: staff, overlay: spellAura,
    eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'elf', name: 'เอลฟ์', description: 'หูแหลม มงกุฎบาง และธนูแห่งป่า', group: 'fantasy',
    ears: 'pointed', torso: torsoShirt, legs: 'standing', hair: shortHair, headwear: circlet,
    back: cape, frontHand: staff, eye: SECONDARY, eyeLight: 'var(--av-magic-highlight)' },
  { id: 'fairy', name: 'นางฟ้า', description: 'ปีกใส ตัวเล็ก และผงแสง', group: 'fantasy',
    ears: 'pointed', blush: true, torso: torsoShirt, legs: 'hovering', hair: shortHair,
    headwear: circlet, back: fairyWings, overlay: flameOrbs, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'vampire', name: 'แวมไพร์', description: 'หูแหลม เขี้ยว ผ้าคลุมยาว และตาแดง', group: 'fantasy',
    ears: 'pointed', sharp: true, mouth: 'fang', torso: torsoSuit, legs: 'standing', sleeve: SECONDARY,
    hair: shortHair, back: cape, eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'warrior', name: 'นักรบ', description: 'เกราะอก ดาบ โล่ และท่ายืนมั่น', group: 'fantasy',
    torso: torsoHeavyPlate, legs: 'standing', sleeve: SECONDARY, headwear: hornedHelm,
    frontHand: sword, backHand: shield, sharp: true },
  { id: 'paladin', name: 'อัศวินศักดิ์สิทธิ์', description: 'เกราะหนัก ปีกขนนก และแสงศักดิ์สิทธิ์', group: 'fantasy',
    torso: torsoHeavyPlate, legs: 'standing', sleeve: SECONDARY, headwear: circlet,
    back: featherWings, frontHand: sword, overlay: spellAura, eye: ACCENT, eyeLight: WHITE },
  { id: 'celestial', name: 'เทพสวรรค์', description: 'ลอยเหนือพื้น ปีกขนนก และวงแสง', group: 'fantasy',
    torso: torsoRobe, legs: 'hovering', sleeve: WHITE, headwear: circlet, back: featherWings,
    overlay: flameOrbs, eye: MAGIC, eyeLight: WHITE },
  { id: 'voidStalker', name: 'ผู้เดินในเงา', description: 'ฮู้ดคลุม เงาดำ และตาเรืองแสง', group: 'fantasy',
    sharp: true, mouth: 'none', torso: torsoRobe, legs: 'hovering', sleeve: SECONDARY,
    headwear: hoodUp, back: cape, overlay: spellAura, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },

  /* ── machines ── */
  { id: 'robotChassis', name: 'หุ่นยนต์', description: 'โครงเหล็ก แกนพลังงาน และเสาอากาศ', group: 'scifi',
    ears: 'round', mouth: 'none', torso: torsoChassis, legs: 'mechanical', sleeve: SECONDARY,
    headwear: antennaCap, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT, sharp: true },
  { id: 'cyborg', name: 'ไซบอร์ก', description: 'ครึ่งคนครึ่งจักรกล ตาเรืองแสง และแขนกล', group: 'scifi',
    ears: 'round', sharp: true, torso: torsoChassis, legs: 'standing', sleeve: SECONDARY,
    headwear: techVisor, frontHand: blaster, eye: ACCENT, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'astronaut', name: 'นักบินอวกาศ', description: 'ชุดอวกาศ หมวกกระจก และเจ็ตแพ็ก', group: 'scifi',
    torso: torsoSpacesuit, legs: 'mechanical', sleeve: WHITE, headwear: spaceHelmet, back: jetpack,
    eye: OUTLINE, eyeLight: 'var(--av-magic-highlight)' },
  { id: 'androidAI', name: 'แอนดรอยด์', description: 'ผิวเรียบ รอยต่อเรืองแสง และเสาอากาศคู่', group: 'scifi',
    mouth: 'none', sharp: true, torso: torsoSuit, legs: 'standing', sleeve: SECONDARY,
    headwear: faceplate, overlay: flameOrbs, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'netrunner', name: 'เน็ตรันเนอร์', description: 'ฮู้ดไซเบอร์ แว่นเรืองแสง และแท็บเล็ต', group: 'scifi',
    sharp: true, mouth: 'none', torso: torsoHoodie, legs: 'mechanical', headwear: hoodUp,
    back: backpack, frontHand: tabletSlab, overlay: spellAura, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT },
  { id: 'drone', name: 'โดรนลอยฟ้า', description: 'ไม่มีขา ลอยด้วยแกนพลังงาน และเสาอากาศ', group: 'scifi',
    mouth: 'none', sharp: true, torso: torsoChassis, legs: 'hovering', sleeve: SECONDARY,
    headwear: antennaCap, back: jetpack, overlay: flameOrbs, eye: MAGIC, eyeLight: MAGIC_HIGHLIGHT }
];

/**
 * The ten and the thirty-one, as one table.
 *
 * Spread in this order so a hand-written costume always wins: if a spec ever reuses an id that is
 * already drawn by hand, the drawing a thousand children are wearing is the one that survives.
 */
export const fullBodyArchetypes: Record<FullBodyArchetype, ArchetypeDefinition> = {
  ...Object.fromEntries(archetypeSpecs.map((spec) => [spec.id, buildArchetype(spec)])),
  ...handDrawnArchetypes
} as Record<FullBodyArchetype, ArchetypeDefinition>;

export const fullBodyArchetypeList: ArchetypeDefinition[] = Object.values(fullBodyArchetypes);

/** The figures in one family, in the order they are declared. */
export function archetypesInGroup(group: ArchetypeGroup): ArchetypeDefinition[] {
  return fullBodyArchetypeList.filter((archetype) => archetype.group === group);
}

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
 * The body a costume stands on, for the wardrobe that has to dress it.
 *
 * Answers for an id it does not know and for no id at all, because both happen: a build that drops
 * an archetype must not blank the children wearing it, and most saved avatars predate bodies
 * entirely. Either way the answer is a plain human frame, which is what those avatars were drawn as.
 */
export function archetypeBodyFor(id: FullBodyArchetype | null | undefined): ArchetypeBody {
  return (id ? fullBodyArchetypes[id]?.body : undefined) ?? plainBody;
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
