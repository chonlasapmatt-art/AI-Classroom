import type { FullBodyArchetype } from './avatarFullBody';

/**
 * The skeleton under each figure, and the measurement that says two figures are not the same figure.
 *
 * ── What was wrong ──
 * Forty-one characters, and one skeleton. Every pivot the poses turn — the shoulder, the hip, the
 * neck, the root of a tail — was a constant in the stylesheet: `.frontArm { transform-origin: 17px
 * 23px }`, once, for the bear and the fairy and the drone alike. That is why the set read as one
 * body in forty-one costumes however carefully the costumes were drawn: a silhouette is mostly
 * where the joints are, and forty-one figures sharing a joint tree share a silhouette.
 *
 * It also made the poses lie. A digitigrade animal's knee is halfway down the shin and breaks the
 * other way; a levitating figure has no ground contact and should not plant a foot; a drone has no
 * legs to plant. All three were running the same stride from the same hip at y 36, which on the
 * drone was a pair of thrusters swinging like legs.
 *
 * ── What this is ──
 * One row per character: where its bones are, how it stands, and how wide a silhouette it cuts. The
 * anchors become custom properties on the figure's own root, so the stylesheet turns a joint it
 * does not have to know the position of, and a character with a lower hip really does stride from a
 * lower hip. The posture is applied to the figure's own groups — a scholar carries its neck forward,
 * an athlete stands wider — so the difference is in the drawing rather than only in the numbers.
 *
 * ── And the footprint ──
 * The five numbers a silhouette is: shoulder width, hip height, head aspect, limb thickness, horn
 * span. Two characters closer than `SILHOUETTE_MIN_DISTANCE` in that space are one shape in two
 * palettes, whatever their costumes say — which is the check `avatarIdentity` cannot make, because a
 * signature compares *which parts* two avatars are built from and cannot see that two different
 * parts happen to cut the same outline.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Bones
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where a joint is, in the 48-grid every drawing is authored on.
 *
 * Near and far rather than left and right: which of the two is nearer the reader is a fact about
 * which way the figure is turned, and it changes without the skeleton changing. A bone tree that
 * named sides would have to be restated for every one of the six directions.
 */
export interface BoneAnchors {
  /** Where the head turns. The face, the hair and the headwear pivot here together. */
  neck: readonly [number, number];
  /** The top of the skull: where a crest, a bun or a pair of ears is rooted. */
  crown: readonly [number, number];
  shoulderNear: readonly [number, number];
  shoulderFar: readonly [number, number];
  hipNear: readonly [number, number];
  hipFar: readonly [number, number];
  /** What the whole figure pivots and bobs about — the floor under it, or the air it hovers in. */
  root: readonly [number, number];
  /** The socket a tail hangs from. Low and behind on a beast, high on a dragon. */
  tail: readonly [number, number];
  /** The shoulder blades, where wings and a cape are rooted and where follow-through starts. */
  wing: readonly [number, number];
  /** Where horns leave the skull. Wide on a dragon, narrow on a demon, unused without horns. */
  horn: readonly [number, number];
  /** What a held thing swings about, which is the wrist rather than the hand. */
  grip: readonly [number, number];
}

/**
 * How a character stands, as the handful of offsets that separate one stance from another.
 *
 * Every one of these is applied as a transform on the figure's own groups rather than drawn in,
 * because a posture has to survive a pose: an athlete that stands wide has to still stand wide
 * halfway through a stride, and a stance baked into the artwork would be replaced by the keyframe
 * rather than composed with it.
 */
export interface ArchetypePosture {
  /** Degrees the neck carries the head forward. Positive is a scholar's stoop over a page. */
  neckTilt: number;
  /** Degrees the torso leans before any pose adds its own. Positive is forward. */
  torsoLean: number;
  /** How much wider or narrower than the plain frame the shoulders sit. 1 is a person. */
  shoulderSpan: number;
  /** Units the whole figure floats off the floor. Anything above zero plants no foot. */
  rootLift: number;
  /**
   * How far below the hip the knee breaks, in units.
   *
   * The digitigrade arch, and the reason a wolf does not walk like a person in a costume: the joint
   * that reads as a backwards knee is an ankle carried high, so the break is lower down the limb
   * and the segment under it does the stride.
   */
  kneeDrop: number;
}

/**
 * The five numbers a silhouette actually is.
 *
 * Not a hash and not an id: a point in a space where "how far apart" has a real answer. Two
 * characters can be built from entirely different parts and still cut the same outline out of the
 * light — a bear in a hoodie and a panda in a hoodie — and no comparison of *which parts* can see
 * that. Measuring the outline can.
 *
 * Raw grid units, not normalised, so a reader of this record can hold a ruler to a drawing and
 * check it. Normalising happens in the distance function, where the ranges live.
 */
export interface SilhouetteFootprint {
  /** Grid units between the two shoulder sockets. */
  shoulderWidth: number;
  /** Grid units the hip sits above the floor. A long-legged figure has a high hip. */
  hipHeight: number;
  /** Skull width over skull height. Above 1 is a wide chibi head; below it, a long muzzle. */
  headAspectRatio: number;
  /** Grid units across a limb. A gauntlet is thick; a fairy's arm is not. */
  limbThickness: number;
  /** Grid units between the tips of whatever leaves the head. Zero when nothing does. */
  hornSpan: number;
}

export interface ArchetypeRig {
  anchors: BoneAnchors;
  posture: ArchetypePosture;
  footprint: SilhouetteFootprint;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The four base skeletons
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A plain human frame: the numbers the stylesheet used to hold as constants.
 *
 * Kept exactly, so a character that says nothing about its skeleton draws and moves precisely as it
 * did before this file existed. Every other matrix below is stated as what it changes from this.
 */
const humanoidSkeleton: BoneAnchors = {
  neck: [24, 20],
  crown: [24, 8],
  shoulderNear: [17, 23],
  shoulderFar: [31, 23],
  hipNear: [20.5, 36],
  hipFar: [27.5, 36],
  root: [24, 46],
  tail: [31, 34],
  wing: [24, 24],
  horn: [24, 6],
  grip: [15, 29]
};

/**
 * A beast's, which is a human's with the weight moved down and back.
 *
 * The hip drops a unit and a half and the knee break goes with it — that is the digitigrade arch,
 * and it is why a wolf's stride reads as an animal's. The tail socket comes down to the base of the
 * spine, which is where a tail is rooted: at y 34 a wolf's tail left its back rather than its rump,
 * and the whole animal read as wearing one.
 */
const beastSkeleton: BoneAnchors = {
  ...humanoidSkeleton,
  neck: [24, 20.5],
  shoulderNear: [16.5, 23.5],
  shoulderFar: [31.5, 23.5],
  hipNear: [20, 37.5],
  hipFar: [28, 37.5],
  tail: [30.5, 36],
  horn: [24, 5.5]
};

/**
 * A fantasy lineage's: a longer torso and a higher shoulder, so the head sits further from the hip.
 *
 * The wing socket rises to the shoulder blade proper rather than the mid-back, which is what stops a
 * wing pivoting out of the middle of a ribcage, and the horn anchor rises because a dragon's horns
 * leave the skull at its corners rather than off its crown.
 */
const fantasySkeleton: BoneAnchors = {
  ...humanoidSkeleton,
  neck: [24, 19.5],
  crown: [24, 7],
  shoulderNear: [16.5, 22],
  shoulderFar: [31.5, 22],
  hipNear: [20.5, 35.5],
  hipFar: [27.5, 35.5],
  tail: [31, 33],
  wing: [24, 22.5],
  horn: [24, 5]
};

/**
 * A chassis's: joints that float rather than hinge.
 *
 * The shoulders sit outside the torso box, which is the magnetic gap — a manufactured arm is held
 * by a field rather than by a socket, and half a unit of daylight between plate and limb is the
 * whole read. The thruster mount is low and central, because that is where thrust has to act if the
 * figure is not to tip over.
 */
const chassisSkeleton: BoneAnchors = {
  ...humanoidSkeleton,
  neck: [24, 20],
  crown: [24, 7.5],
  shoulderNear: [16, 23],
  shoulderFar: [32, 23],
  hipNear: [20.5, 36.5],
  hipFar: [27.5, 36.5],
  tail: [24, 33],
  wing: [24, 26],
  horn: [24, 6]
};

const restingPosture: ArchetypePosture = {
  neckTilt: 0, torsoLean: 0, shoulderSpan: 1, rootLift: 0, kneeDrop: 0
};

/* ────────────────────────────────────────────────────────────────────────────
 * The forty-one rows
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What each character changes about its own skeleton.
 *
 * Stated as differences from the matrix its family uses, because a row that repeated every number
 * would be a row nobody could scan for the one that matters. A character with nothing to say here
 * is not an omission — the student is the plain frame on purpose, and it is what every other
 * posture is read against.
 */
interface RigSpec {
  base: BoneAnchors;
  posture?: Partial<ArchetypePosture>;
  anchors?: Partial<BoneAnchors>;
  footprint: SilhouetteFootprint;
}

/** The plain frame's own measurements, which every footprint below is a variation on. */
const plainFootprint: SilhouetteFootprint = {
  shoulderWidth: 14, hipHeight: 10, headAspectRatio: 1.2, limbThickness: 3, hornSpan: 0
};

const rigSpecs: Record<FullBodyArchetype, RigSpec> = {
  /* ── people ──
   * Ten classes, and the posture is the class. A scholar reads: the neck carries forward over a
   * page and the shoulders round in after it. An athlete stands: the shoulders go wide and the
   * weight sits low. The difference has to be in the stance rather than in the props, because a
   * picker shows these at forty pixels, where a held book is four dark squares and a stance is the
   * whole outline. */
  student: { base: humanoidSkeleton, footprint: plainFootprint },
  athlete: {
    base: humanoidSkeleton,
    posture: { shoulderSpan: 1.18, torsoLean: 2 },
    anchors: { shoulderNear: [15.5, 23.5], shoulderFar: [32.5, 23.5] },
    footprint: { ...plainFootprint, shoulderWidth: 17, limbThickness: 3.5 }
  },
  scientist: {
    base: humanoidSkeleton,
    posture: { neckTilt: 3 },
    footprint: { ...plainFootprint, shoulderWidth: 13.5, headAspectRatio: 1.25, hornSpan: 4 }
  },
  developer: {
    base: humanoidSkeleton,
    posture: { neckTilt: 5, torsoLean: 3, shoulderSpan: 0.94 },
    anchors: { shoulderNear: [17.5, 23.5], shoulderFar: [30.5, 23.5] },
    footprint: { ...plainFootprint, shoulderWidth: 12.8, hipHeight: 9, limbThickness: 3.6 }
  },
  scholar: {
    base: humanoidSkeleton,
    /* The forward neck the brief names, and the shoulders that come with it: nobody stoops over a
       book with their shoulders back. */
    posture: { neckTilt: 7, torsoLean: 4, shoulderSpan: 0.9 },
    anchors: { neck: [24, 20.5], shoulderNear: [17.5, 24], shoulderFar: [30.5, 24] },
    footprint: { shoulderWidth: 12.5, hipHeight: 8.4, headAspectRatio: 1.3, limbThickness: 2.4, hornSpan: 2 }
  },
  explorer: {
    base: humanoidSkeleton,
    posture: { shoulderSpan: 1.08, kneeDrop: 0.5 },
    anchors: { hipNear: [20, 36.5], hipFar: [28, 36.5] },
    footprint: { shoulderWidth: 15.6, hipHeight: 9.5, headAspectRatio: 1.12, limbThickness: 3.9, hornSpan: 3 }
  },
  artist: {
    base: humanoidSkeleton,
    posture: { neckTilt: 2, shoulderSpan: 0.96 },
    anchors: { grip: [14, 28] },
    footprint: { shoulderWidth: 13.2, hipHeight: 11.4, headAspectRatio: 1.34, limbThickness: 2.5, hornSpan: 5 }
  },
  musician: {
    base: humanoidSkeleton,
    posture: { torsoLean: -3, shoulderSpan: 1.02 },
    anchors: { grip: [15.5, 30] },
    footprint: { shoulderWidth: 14.6, hipHeight: 12, headAspectRatio: 1.06, limbThickness: 2.8, hornSpan: 5.5 }
  },
  inventor: {
    base: humanoidSkeleton,
    posture: { neckTilt: 4, shoulderSpan: 1.06, kneeDrop: -0.5 },
    anchors: { hipNear: [20.5, 35.5], hipFar: [27.5, 35.5] },
    footprint: { shoulderWidth: 15.2, hipHeight: 10.6, headAspectRatio: 1.42, limbThickness: 4.2, hornSpan: 4.5 }
  },
  adventurer: {
    base: humanoidSkeleton,
    posture: { shoulderSpan: 1.12, torsoLean: 1 },
    anchors: { shoulderNear: [16, 23], shoulderFar: [32, 23], wing: [24, 23] },
    footprint: { shoulderWidth: 16.4, hipHeight: 10, headAspectRatio: 0.96, limbThickness: 4.4, hornSpan: 1.5 }
  },

  /* ── beasts ──
   * Thirteen species, and what separates them is the head and what hangs behind rather than the
   * clothes: a dog and a cat in the same hoodie are told apart by the ears, the muzzle and the tail.
   * So the footprints move most in head aspect and horn span, and the skeletons in where the tail is
   * rooted and how far the knee has arched. */
  cat: {
    base: beastSkeleton,
    posture: { kneeDrop: 1.5, shoulderSpan: 0.94 },
    anchors: { tail: [31, 36.5] },
    footprint: { shoulderWidth: 13, hipHeight: 8.5, headAspectRatio: 1.3, limbThickness: 2.6, hornSpan: 7 }
  },
  fox: {
    base: beastSkeleton,
    posture: { kneeDrop: 1.5, shoulderSpan: 0.92, torsoLean: 2 },
    anchors: { tail: [30, 36.5] },
    footprint: { shoulderWidth: 12.4, hipHeight: 7.2, headAspectRatio: 1.02, limbThickness: 2.2, hornSpan: 8.6 }
  },
  rabbit: {
    base: beastSkeleton,
    posture: { kneeDrop: 2.5, shoulderSpan: 0.88 },
    anchors: { crown: [24, 5], tail: [30, 38] },
    /* The ears are the silhouette, and they are tall rather than wide: a rabbit read at 24 pixels is
       two vertical strokes over a small head, which is a horn span like nothing else in the set. */
    footprint: { shoulderWidth: 11.6, hipHeight: 6.4, headAspectRatio: 1.38, limbThickness: 2.3, hornSpan: 5.2 }
  },
  penguin: {
    base: beastSkeleton,
    posture: { kneeDrop: -1, shoulderSpan: 0.8 },
    anchors: { hipNear: [21, 39], hipFar: [27, 39], tail: [24, 38] },
    footprint: { shoulderWidth: 10.5, hipHeight: 5.6, headAspectRatio: 1.16, limbThickness: 4.1, hornSpan: 0 }
  },
  dog: {
    base: beastSkeleton,
    posture: { kneeDrop: 1.5, shoulderSpan: 1.02 },
    anchors: { tail: [30.5, 36.5] },
    footprint: { shoulderWidth: 14.4, hipHeight: 9.4, headAspectRatio: 1, limbThickness: 3.2, hornSpan: 9.8 }
  },
  panda: {
    base: beastSkeleton,
    posture: { kneeDrop: 0.5, shoulderSpan: 1.1 },
    anchors: { hipNear: [20, 38], hipFar: [28, 38], tail: [24, 37.5] },
    footprint: { shoulderWidth: 16.2, hipHeight: 7.4, headAspectRatio: 1.46, limbThickness: 4.3, hornSpan: 11.4 }
  },
  bear: {
    base: beastSkeleton,
    posture: { kneeDrop: 0.5, shoulderSpan: 1.24, torsoLean: 3 },
    anchors: { shoulderNear: [15, 23.5], shoulderFar: [33, 23.5], tail: [24, 37.5] },
    footprint: { shoulderWidth: 19.4, hipHeight: 8.2, headAspectRatio: 1.08, limbThickness: 5, hornSpan: 9.8 }
  },
  owl: {
    base: beastSkeleton,
    posture: { kneeDrop: -1.5, shoulderSpan: 0.98, neckTilt: -3 },
    anchors: { crown: [24, 5.5], hipNear: [21, 39], hipFar: [27, 39], wing: [24, 23] },
    footprint: { shoulderWidth: 13.6, hipHeight: 5.8, headAspectRatio: 1.5, limbThickness: 3.4, hornSpan: 6.2 }
  },
  raccoon: {
    base: beastSkeleton,
    posture: { kneeDrop: 1, shoulderSpan: 0.9 },
    anchors: { tail: [30, 37] },
    footprint: { shoulderWidth: 12.6, hipHeight: 9.8, headAspectRatio: 1.18, limbThickness: 2.9, hornSpan: 7.4 }
  },
  wolf: {
    base: beastSkeleton,
    /* The deepest arch in the set, which is what a wolf's stride is: the knee breaks low and the
       segment under it carries the whole of it. */
    posture: { kneeDrop: 2.5, shoulderSpan: 1.08, torsoLean: 4 },
    anchors: { tail: [30, 36.5] },
    footprint: { shoulderWidth: 15.4, hipHeight: 11, headAspectRatio: 0.92, limbThickness: 3.2, hornSpan: 11 }
  },
  tiger: {
    base: beastSkeleton,
    posture: { kneeDrop: 2, shoulderSpan: 1.14, torsoLean: 3 },
    anchors: { shoulderNear: [15.5, 23.5], shoulderFar: [32.5, 23.5], tail: [31, 36.5] },
    footprint: { shoulderWidth: 17.4, hipHeight: 10.2, headAspectRatio: 1.24, limbThickness: 4.2, hornSpan: 7.2 }
  },
  deer: {
    base: beastSkeleton,
    /* Cloven, so the knee is high and the shin long — the opposite of the wolf, and the reason a
       deer's walk is a lift rather than a push. */
    posture: { kneeDrop: -2, shoulderSpan: 0.92 },
    anchors: { crown: [24, 4.5], hipNear: [21, 35.5], hipFar: [27, 35.5], horn: [24, 3.5] },
    footprint: { shoulderWidth: 12.2, hipHeight: 12.6, headAspectRatio: 0.98, limbThickness: 2.3, hornSpan: 13.4 }
  },
  fantasyBeast: {
    base: beastSkeleton,
    posture: { kneeDrop: 2, shoulderSpan: 1.2, torsoLean: 5 },
    anchors: {
      shoulderNear: [15, 22.5], shoulderFar: [33, 22.5],
      wing: [24, 22], horn: [24, 4], tail: [31, 35.5]
    },
    footprint: { shoulderWidth: 18.6, hipHeight: 11.6, headAspectRatio: 0.86, limbThickness: 4.6, hornSpan: 12.2 }
  },

  /* ── fantasy ──
   * Elongated torsos and levitating roots. The four that hover carry a `rootLift` above zero, and
   * that one number is what stops the stride planting a foot on a figure whose feet are a hand's
   * width off the floor. */
  dragonKnight: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.22, torsoLean: 2 },
    anchors: { shoulderNear: [15, 22], shoulderFar: [33, 22], horn: [24, 4], tail: [31, 33] },
    footprint: { shoulderWidth: 18.2, hipHeight: 9.6, headAspectRatio: 1.04, limbThickness: 4.4, hornSpan: 12.6 }
  },
  arcaneMage: {
    base: fantasySkeleton,
    posture: { rootLift: 0.5, shoulderSpan: 0.92, neckTilt: -2 },
    anchors: { grip: [14.5, 27] },
    footprint: { shoulderWidth: 12.6, hipHeight: 11.2, headAspectRatio: 1.22, limbThickness: 2.6, hornSpan: 1 }
  },
  demon: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.1, torsoLean: 3 },
    anchors: { horn: [24, 4.5], tail: [31.5, 34], wing: [24, 22] },
    footprint: { shoulderWidth: 16, hipHeight: 10.8, headAspectRatio: 1.14, limbThickness: 3.4, hornSpan: 9 }
  },
  iceDragon: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.18, torsoLean: -2 },
    anchors: { horn: [24, 3.5], tail: [31, 33], crown: [24, 6] },
    footprint: { shoulderWidth: 17.6, hipHeight: 12.4, headAspectRatio: 0.88, limbThickness: 3.8, hornSpan: 14.4 }
  },
  elf: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 0.96, neckTilt: -4 },
    anchors: { neck: [24, 19], crown: [24, 6.5] },
    footprint: { shoulderWidth: 13.4, hipHeight: 13, headAspectRatio: 1.1, limbThickness: 2.5, hornSpan: 6.6 }
  },
  fairy: {
    base: fantasySkeleton,
    /* The highest root of anything with legs: a fairy does not stand, and the stride keyframes must
       not reach for a floor three units below its feet. */
    posture: { rootLift: 3, shoulderSpan: 0.78, neckTilt: -2 },
    anchors: { wing: [24, 21], crown: [24, 6] },
    footprint: { shoulderWidth: 9.4, hipHeight: 13.4, headAspectRatio: 1.52, limbThickness: 1.7, hornSpan: 4.6 }
  },
  vampire: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.02, torsoLean: -4 },
    anchors: { neck: [24, 19], wing: [24, 22] },
    footprint: { shoulderWidth: 14.6, hipHeight: 11.8, headAspectRatio: 0.98, limbThickness: 3, hornSpan: 6.8 }
  },
  warrior: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.26, kneeDrop: -0.5 },
    anchors: { shoulderNear: [14.5, 22.5], shoulderFar: [33.5, 22.5], horn: [24, 4] },
    footprint: { shoulderWidth: 19.6, hipHeight: 9.2, headAspectRatio: 1.16, limbThickness: 5.2, hornSpan: 10.6 }
  },
  paladin: {
    base: fantasySkeleton,
    posture: { shoulderSpan: 1.3, torsoLean: -2 },
    anchors: { shoulderNear: [14, 22], shoulderFar: [34, 22], wing: [24, 21.5] },
    footprint: { shoulderWidth: 21, hipHeight: 11, headAspectRatio: 1.32, limbThickness: 5.4, hornSpan: 2.6 }
  },
  celestial: {
    base: fantasySkeleton,
    posture: { rootLift: 2, shoulderSpan: 1, neckTilt: -5 },
    anchors: { wing: [24, 21], crown: [24, 5.5] },
    footprint: { shoulderWidth: 14.2, hipHeight: 13.8, headAspectRatio: 1.4, limbThickness: 2.1, hornSpan: 1.8 }
  },
  voidStalker: {
    base: fantasySkeleton,
    posture: { rootLift: 1.5, shoulderSpan: 0.86, torsoLean: 6, neckTilt: 4 },
    anchors: { neck: [24, 20], wing: [24, 23] },
    footprint: { shoulderWidth: 11, hipHeight: 12.2, headAspectRatio: 0.82, limbThickness: 1.9, hornSpan: 3.6 }
  },

  /* ── chassis ──
   * Seven frames, and all seven have the floating shoulder. What tells them apart is the leg — a
   * piston, a plain boot, a sealed suit, or no leg at all — and the head, which is the one part of a
   * machine a child looks at first. */
  techwear: {
    base: chassisSkeleton,
    posture: { shoulderSpan: 1.04, torsoLean: 2 },
    footprint: { shoulderWidth: 16.6, hipHeight: 9.4, headAspectRatio: 1.12, limbThickness: 3.2, hornSpan: 0 }
  },
  robotChassis: {
    base: chassisSkeleton,
    posture: { shoulderSpan: 1.16, kneeDrop: -1 },
    anchors: { shoulderNear: [15.5, 23], shoulderFar: [32.5, 23], crown: [24, 6.5] },
    footprint: { shoulderWidth: 17.8, hipHeight: 8, headAspectRatio: 1.48, limbThickness: 4.6, hornSpan: 6 }
  },
  cyborg: {
    base: chassisSkeleton,
    posture: { shoulderSpan: 1.1, torsoLean: 3, neckTilt: 2 },
    anchors: { shoulderFar: [32.5, 22.5] },
    footprint: { shoulderWidth: 16.8, hipHeight: 11.4, headAspectRatio: 1.04, limbThickness: 3.7, hornSpan: 2.4 }
  },
  astronaut: {
    base: chassisSkeleton,
    /* A sealed suit is thick everywhere and the helmet is a sphere: the widest head in the set, and
       the only silhouette whose skull reads as a circle rather than a box. */
    posture: { shoulderSpan: 1.2, kneeDrop: -1.5 },
    anchors: { crown: [24, 5], wing: [24, 25] },
    footprint: { shoulderWidth: 18.4, hipHeight: 7, headAspectRatio: 1.58, limbThickness: 5.4, hornSpan: 0 }
  },
  androidAI: {
    base: chassisSkeleton,
    posture: { shoulderSpan: 0.94, neckTilt: -3 },
    anchors: { neck: [24, 19.5], shoulderNear: [17, 22.5], shoulderFar: [31, 22.5] },
    footprint: { shoulderWidth: 13, hipHeight: 11.8, headAspectRatio: 0.94, limbThickness: 2.4, hornSpan: 4.4 }
  },
  netrunner: {
    base: chassisSkeleton,
    posture: { shoulderSpan: 0.9, torsoLean: 5, neckTilt: 6 },
    anchors: { neck: [24, 20.5], hipNear: [21, 37], hipFar: [27, 37] },
    footprint: { shoulderWidth: 12, hipHeight: 8.8, headAspectRatio: 1.36, limbThickness: 2.8, hornSpan: 0 }
  },
  drone: {
    base: chassisSkeleton,
    /* No legs at all, so no hip and no stride: the highest root in the set, and the only figure
       whose hip anchor sits above its own waist — a stride keyframe reaching for it finds nothing
       to plant. */
    posture: { rootLift: 4, shoulderSpan: 0.84 },
    anchors: { hipNear: [22, 34], hipFar: [26, 34], wing: [24, 28], crown: [24, 6] },
    footprint: { shoulderWidth: 10.2, hipHeight: 14.4, headAspectRatio: 1.62, limbThickness: 2, hornSpan: 7.8 }
  }
};

function resolveRig(spec: RigSpec): ArchetypeRig {
  return {
    anchors: { ...spec.base, ...(spec.anchors ?? {}) },
    posture: { ...restingPosture, ...(spec.posture ?? {}) },
    footprint: spec.footprint
  };
}

const rigs = Object.fromEntries(
  Object.entries(rigSpecs).map(([id, spec]) => [id, resolveRig(spec)])
) as Record<FullBodyArchetype, ArchetypeRig>;

/** The plain frame, for a record naming a character this build has dropped. */
export const plainRig: ArchetypeRig = resolveRig({ base: humanoidSkeleton, footprint: plainFootprint });

/**
 * The skeleton a character stands on.
 *
 * Answers for an id it does not know, because a build that drops an archetype must not blank the
 * children wearing it: the answer is the plain human frame, which is what those figures were drawn
 * on before any of this existed.
 */
export function rigFor(archetype: FullBodyArchetype | null | undefined): ArchetypeRig {
  return (archetype ? rigs[archetype] : undefined) ?? plainRig;
}

export const rigArchetypeIds = Object.keys(rigs) as FullBodyArchetype[];

/* ────────────────────────────────────────────────────────────────────────────
 * Bones as custom properties
 * ──────────────────────────────────────────────────────────────────────────── */

const pointOf = (value: readonly [number, number]) => [`${value[0]}px`, `${value[1]}px`] as const;

/**
 * The skeleton, in the form a stylesheet can turn.
 *
 * A CSS module cannot read a TypeScript record and a drawing cannot name a hashed class, so the
 * bones travel as custom properties on the figure's own root and the stylesheet reads them with a
 * fallback that is the plain human frame. That fallback is not decoration: a rule written before a
 * bone existed still resolves, so adding a joint is not a change to every pose.
 */
export function rigVariables(rig: ArchetypeRig): Record<string, string> {
  const { anchors, posture } = rig;
  const [neckX, neckY] = pointOf(anchors.neck);
  const [crownX, crownY] = pointOf(anchors.crown);
  const [nearX, nearY] = pointOf(anchors.shoulderNear);
  const [farX, farY] = pointOf(anchors.shoulderFar);
  const [hipNearX, hipY] = pointOf(anchors.hipNear);
  const [hipFarX] = pointOf(anchors.hipFar);
  const [rootX, rootY] = pointOf(anchors.root);
  const [tailX, tailY] = pointOf(anchors.tail);
  const [wingX, wingY] = pointOf(anchors.wing);
  const [hornX, hornY] = pointOf(anchors.horn);
  const [gripX, gripY] = pointOf(anchors.grip);
  return {
    '--rig-neck-x': neckX, '--rig-neck-y': neckY,
    '--rig-crown-x': crownX, '--rig-crown-y': crownY,
    '--rig-shoulder-near-x': nearX, '--rig-shoulder-near-y': nearY,
    '--rig-shoulder-far-x': farX, '--rig-shoulder-far-y': farY,
    '--rig-hip-near-x': hipNearX, '--rig-hip-far-x': hipFarX, '--rig-hip-y': hipY,
    '--rig-root-x': rootX, '--rig-root-y': rootY,
    '--rig-tail-x': tailX, '--rig-tail-y': tailY,
    '--rig-wing-x': wingX, '--rig-wing-y': wingY,
    '--rig-horn-x': hornX, '--rig-horn-y': hornY,
    '--rig-grip-x': gripX, '--rig-grip-y': gripY,
    '--rig-neck-tilt': `${posture.neckTilt}deg`,
    '--rig-torso-lean': `${posture.torsoLean}deg`,
    '--rig-shoulder-span': String(posture.shoulderSpan),
    /* Negative because the grid runs downwards: lifting a figure off the floor is moving it towards
       y 0, and a caller that had to remember the sign would eventually get it wrong. */
    '--rig-root-lift': `${-posture.rootLift}px`,
    '--rig-knee-drop': `${posture.kneeDrop}px`,
    /* One on anything that stands, zero on anything that floats. A keyframe multiplies its ground
       contact by this, so one number turns foot-planting off for every pose at once rather than
       each pose having to name the four characters that hover. */
    '--rig-planted': posture.rootLift > 0 ? '0' : '1'
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Silhouette distance
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The range each measurement is read against, so five numbers in different units can be one point.
 *
 * Fixed rather than computed from the set. A range that moved as characters were added would mean
 * adding one wide character quietly made two narrow ones more alike — and how far apart two figures
 * are has to be a fact about those two figures and nothing else.
 */
const footprintRanges: Record<keyof SilhouetteFootprint, readonly [number, number]> = {
  shoulderWidth: [8, 22],
  hipHeight: [5, 15],
  headAspectRatio: [0.8, 1.7],
  limbThickness: [1.5, 5.5],
  hornSpan: [0, 15]
};

const footprintKeys = Object.keys(footprintRanges) as Array<keyof SilhouetteFootprint>;

function normalise(key: keyof SilhouetteFootprint, value: number): number {
  const [low, high] = footprintRanges[key];
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/** The footprint as the point it is compared as, for anything that wants to show its working. */
export function footprintVector(footprint: SilhouetteFootprint): number[] {
  return footprintKeys.map((key) => normalise(key, footprint[key]));
}

/**
 * How far apart two silhouettes are, in the normalised five-space.
 *
 * Euclidean rather than an average of differences, because the question is whether the two outlines
 * are distinguishable *at a glance*, and one large difference does that on its own: a fairy and a
 * bear differ enough in shoulder width alone, and a metric that averaged it against four near-equal
 * numbers would report them as similar.
 */
export function footprintDistance(left: SilhouetteFootprint, right: SilhouetteFootprint): number {
  let total = 0;
  for (const key of footprintKeys) {
    const delta = normalise(key, left[key]) - normalise(key, right[key]);
    total += delta * delta;
  }
  return Math.sqrt(total);
}

/**
 * Closer than this and the two are one shape in two palettes.
 *
 * 0.45 of a space whose diagonal is √5 ≈ 2.24, so a fifth of the whole range. The line sits there
 * because that is about the distance between the plain student frame and the athlete's: the athlete
 * is the least different thing in the set that still earns its own row, and anything nearer than
 * that to something already taken does not.
 */
export const SILHOUETTE_MIN_DISTANCE = 0.45;

export function isSilhouetteDistinct(
  candidate: SilhouetteFootprint, taken: ReadonlyArray<SilhouetteFootprint>
): boolean {
  return taken.every((other) => footprintDistance(candidate, other) > SILHOUETTE_MIN_DISTANCE);
}

/** The nearest thing already taken, and how near — what a rejection has to be able to say. */
export function nearestFootprint(
  candidate: SilhouetteFootprint, taken: ReadonlyArray<SilhouetteFootprint>
): { distance: number; index: number } | null {
  let best: { distance: number; index: number } | null = null;
  taken.forEach((other, index) => {
    const distance = footprintDistance(candidate, other);
    if (best === null || distance < best.distance) best = { distance, index };
  });
  return best;
}

/** The silhouette a character cuts, for anything comparing one figure against another. */
export function footprintFor(archetype: FullBodyArchetype | null | undefined): SilhouetteFootprint {
  return rigFor(archetype).footprint;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The rule, as opposed to the measurement
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The bone tree as one comparable string.
 *
 * Every anchor and every posture offset, in a fixed order. Fixed rather than walked, because object
 * key order is a property of how a record was built, and two skeletons that are the same skeleton
 * must produce the same string on every device.
 */
export function skeletonSignature(rig: ArchetypeRig): string {
  const { anchors, posture } = rig;
  const bones: Array<keyof BoneAnchors> = [
    'neck', 'crown', 'shoulderNear', 'shoulderFar', 'hipNear', 'hipFar',
    'root', 'tail', 'wing', 'horn', 'grip'
  ];
  const joints = bones.map((bone) => `${bone}:${anchors[bone][0]},${anchors[bone][1]}`).join('|');
  const stance = [
    `tilt:${posture.neckTilt}`, `lean:${posture.torsoLean}`, `span:${posture.shoulderSpan}`,
    `lift:${posture.rootLift}`, `knee:${posture.kneeDrop}`
  ].join('|');
  return `${joints}#${stance}`;
}

/**
 * Whether two characters are distinguishable, and by what.
 *
 * ── Why this is not simply the distance ──
 * Ten of the forty-one are people, and people are the same shape. A scholar and a developer are
 * both a head, two arms and two legs at human proportions; no honest set of measurements puts them
 * a fifth of the whole range apart, and a table forced to say they are would be a table of numbers
 * chosen to pass a test rather than measurements of a drawing. Pushing them apart in the footprint
 * means giving one of them a twenty-two-unit shoulder, which is a lie about the drawing and would
 * show on the customiser's stage the moment anybody looked.
 *
 * So the footprint distance is one way of being distinct and not the only one. The other is the
 * rule the brief actually states: two figures that cut the same outline must then differ in the
 * skeleton under it — where the joints are and how the thing stands. That is a difference a child
 * sees, because it is what the poses turn: a scholar's stoop and an athlete's grounded stance read
 * as two different people at forty pixels even though their outlines measure nearly the same.
 *
 * A pair fails only when it is close in *both*, which is a genuine duplicate: the same shape moving
 * the same way in different paint.
 */
export interface SilhouetteVerdict {
  distinct: boolean;
  distance: number;
  /** Which clause carried it, for a message a person can act on. */
  reason: 'footprint' | 'skeleton' | 'none';
}

export function silhouetteVerdict(left: ArchetypeRig, right: ArchetypeRig): SilhouetteVerdict {
  const distance = footprintDistance(left.footprint, right.footprint);
  if (distance > SILHOUETTE_MIN_DISTANCE) return { distinct: true, distance, reason: 'footprint' };
  if (skeletonSignature(left) !== skeletonSignature(right)) {
    return { distinct: true, distance, reason: 'skeleton' };
  }
  return { distinct: false, distance, reason: 'none' };
}

