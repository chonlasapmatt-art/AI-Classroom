import type { ReactElement } from 'react';
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
  | 'shadow'
  | 'back_gear'
  | 'back_arm'
  | 'legs_feet'
  | 'torso_body'
  | 'head_neck'
  | 'hair_headwear'
  | 'front_arm_weapon'
  | 'overlay_fx';

export const bodySlotOrder: BodySlot[] = [
  'shadow', 'back_gear', 'back_arm', 'legs_feet', 'torso_body',
  'head_neck', 'hair_headwear', 'front_arm_weapon', 'overlay_fx'
];

/** Thai, because these are read by the person choosing what to change. */
export const bodySlotLabels: Record<BodySlot, string> = {
  shadow: 'เงาใต้เท้า',
  back_gear: 'ปีก/หาง/ผ้าคลุม',
  back_arm: 'แขนหลัง',
  legs_feet: 'ขาและรองเท้า',
  torso_body: 'ลำตัว',
  head_neck: 'ใบหน้า',
  hair_headwear: 'ผมและหมวก',
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

interface FaceOptions {
  /** Iris colour. Everything else on the face is skin or the shared outline. */
  eye: string;
  snout?: boolean;
  ears?: 'none' | 'pointed' | 'round';
}

export function headNeck({ eye, snout, ears = 'none' }: FaceOptions): ReactElement {
  return (
    <g data-part="head">
      {/* The neck, which is what stops a chibi head sitting straight on the collarbone. */}
      {px(22, 19.5, 4, 2, SKIN_SHADOW)}
      {/* Skull, then a jaw narrowing to a chin — the line that makes a head read as a face. */}
      {px(15, 4, 18, 13, SKIN)}
      {px(16.5, 17, 15, 2, SKIN)}
      {px(18.5, 19, 11, 1.5, SKIN_SHADOW)}
      {px(15, 4, 18, 1.5, 'var(--av-skin-highlight)')}
      {ears === 'pointed' ? (
        <>
          <polygon points="15,9 11,6 14.5,13" fill={SKIN} />
          <polygon points="33,9 37,6 33.5,13" fill={SKIN} />
        </>
      ) : null}
      {ears === 'round' ? (
        <>
          {px(12.5, 9.5, 3, 4, SKIN)}
          {px(32.5, 9.5, 3, 4, SKIN)}
        </>
      ) : null}
      {snout ? (
        <>
          {px(19, 13, 10, 5, SKIN_SHADOW)}
          {px(19, 13, 10, 1, SKIN)}
          {px(20.5, 15.5, 2, 1.5, OUTLINE)}
          {px(25.5, 15.5, 2, 1.5, OUTLINE)}
        </>
      ) : null}
      {/* Eyes, with the highlight that is the whole difference between alive and painted. */}
      <g data-part="eyes">
        {px(18.5, 10, 3.5, 4.5, WHITE)}
        {px(26, 10, 3.5, 4.5, WHITE)}
        {px(19.5, 11, 2.5, 3, eye)}
        {px(27, 11, 2.5, 3, eye)}
        {px(20, 11.5, 1, 1, WHITE)}
        {px(27.5, 11.5, 1, 1, WHITE)}
      </g>
      {snout ? null : px(22.5, 16, 3, 1, SKIN_SHADOW)}
    </g>
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
      {/* A cone with a brim, and the brim is what casts the shadow across the eyes. */}
      <polygon points="24,-2 36,10 12,10" fill={PRIMARY} />
      <polygon points="24,-2 30,10 12,10" fill={PRIMARY_HIGHLIGHT} opacity="0.5" />
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
      <polygon points="17,4 15,-1 21,3" fill={SECONDARY} />
      <polygon points="31,4 33,-1 27,3" fill={SECONDARY} />
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

/* ────────────────────────────────────────────────────────────────────────────
 * The archetypes
 *
 * Each is the nine slots filled in. Two of them — the dragon knight and the arcane mage — are the
 * pair drawn in full; the rest answer the same nine slots differently, which is the point of
 * having slots rather than five separate drawings.
 * ──────────────────────────────────────────────────────────────────────────── */

export type FullBodyArchetype = 'dragonKnight' | 'arcaneMage' | 'demon' | 'student' | 'athlete';

export interface ArchetypeDefinition {
  id: FullBodyArchetype;
  /** Thai, because it is read by the person choosing it. */
  name: string;
  description: string;
  slots: Partial<Record<BodySlot, ReactElement>>;
}

export const fullBodyArchetypes: Record<FullBodyArchetype, ArchetypeDefinition> = {
  dragonKnight: {
    id: 'dragonKnight',
    name: 'นักรบมังกร',
    description: 'เขา ปีกค้างคาว หางเป็นปล้อง ขากรงเล็บ และดาบในมือหน้า',
    slots: {
      shadow: groundShadow(),
      back_gear: <g>{batWings()}{scaledTail()}</g>,
      back_arm: backArm({ sleeve: SECONDARY, skin: SKIN }, shield()),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, true),
      torso_body: torsoPlate(),
      head_neck: headNeck({ eye: OUTLINE, snout: true }),
      hair_headwear: hornedHelm(),
      front_arm_weapon: frontArm({ sleeve: SECONDARY, skin: SKIN }, sword())
    }
  },
  arcaneMage: {
    id: 'arcaneMage',
    name: 'จอมเวทย์มนตร์',
    description: 'ผ้าคลุมมีฮู้ด แขนเสื้อกว้าง รองเท้าโผล่ใต้ชายผ้า ตำราลอย และไม้เท้า',
    slots: {
      shadow: groundShadow(),
      back_gear: cape(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN, wide: true }, spellbook()),
      legs_feet: robedLegs({ boot: ACCENT, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoRobe(),
      head_neck: headNeck({ eye: MAGIC }),
      hair_headwear: mageHood(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN, wide: true }, staff()),
      overlay_fx: spellAura()
    }
  },
  demon: {
    id: 'demon',
    name: 'ปีศาจ',
    description: 'เขาแหลม หูแหลม หางปีศาจ และเท้ากีบ',
    slots: {
      shadow: groundShadow(),
      back_gear: demonTail(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: SECONDARY, trouser: PRIMARY, skin: SKIN }, true),
      torso_body: torsoPlate(),
      head_neck: headNeck({ eye: MAGIC, ears: 'pointed' }),
      hair_headwear: demonHorns(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    }
  },
  student: {
    id: 'student',
    name: 'นักเรียน',
    description: 'เสื้อคอปก กางเกงนักเรียน และรองเท้าผ้าใบ',
    slots: {
      shadow: groundShadow(),
      back_arm: backArm({ sleeve: PRIMARY, skin: SKIN }),
      legs_feet: legsStanding({ boot: WHITE, trouser: SECONDARY, skin: SKIN }),
      torso_body: torsoShirt(),
      head_neck: headNeck({ eye: OUTLINE }),
      hair_headwear: shortHair(),
      front_arm_weapon: frontArm({ sleeve: PRIMARY, skin: SKIN })
    }
  },
  athlete: {
    id: 'athlete',
    name: 'นักกีฬา',
    description: 'ชุดกีฬา รองเท้าวิ่ง และท่ายืนพร้อมออกตัว',
    slots: {
      shadow: groundShadow(),
      back_arm: backArm({ sleeve: ACCENT, skin: SKIN }),
      legs_feet: legsStanding({ boot: ACCENT, trouser: PRIMARY, skin: SKIN }),
      torso_body: torsoShirt(),
      head_neck: headNeck({ eye: OUTLINE }),
      hair_headwear: shortHair(),
      front_arm_weapon: frontArm({ sleeve: ACCENT, skin: SKIN })
    }
  }
};

export const fullBodyArchetypeList: ArchetypeDefinition[] = Object.values(fullBodyArchetypes);

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
