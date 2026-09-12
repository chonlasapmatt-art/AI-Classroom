/**
 * Where the figure is, in the units every drawing is authored in.
 *
 * Until this file existed the numbers were repeated: a hairstyle knew the skull started at y 4
 * because the person drawing it had counted, a hat knew the brim cleared the brow because 8 looked
 * right, and a crop knew the head ended at 21 because a screenshot said so. Six files held the same
 * measurements and none of them agreed after the first edit — which is how hair ends up floating a
 * unit above a skull, and how a crown that fits the stage is sheared off in a list row.
 *
 * So the measurements live here once and everything reads them. A part that needs a new number
 * adds it here rather than counting again.
 */

/** The grid every full-body drawing is authored on. 48 × 48, origin top-left. */
export const FIGURE_GRID = 48;

/**
 * The box a drawing may not leave.
 *
 * Not a style rule: a shape outside it is either clipped by the frame or painted over whatever sits
 * beside the avatar, and which of those happens depends on a CSS property three components away.
 * `ceiling` is 0 because the frame's own top edge is 0 — a crown at y −3 is a crown nobody sees.
 */
export const FIGURE_BOUNDS = {
  ceiling: 0,
  floor: FIGURE_GRID,
  left: 0,
  right: FIGURE_GRID
} as const;

/**
 * The skull, and the landmarks hair is fitted to.
 *
 * `headNeck` draws the skull as x 15–33, y 4–17 with a jaw to 19 and a neck to 21.5. Every one of
 * those edges is something a hairstyle has to meet exactly: a cap that starts at 4 leaves a seam
 * where the skull's own lit edge shows through, and one that starts at 3 covers it.
 */
export const SKULL = {
  /** The top of the bone. Hair sits half a unit above it so there is no seam. */
  top: 4,
  left: 15,
  right: 33,
  /** Where the skull narrows into the jaw. */
  jaw: 17,
  chin: 19,
  neck: 21.5,
  centre: 24,
  /** Where a fringe stops and the face begins. Below this a fringe is over the eyes. */
  brow: 9,
  /** The top of the eye sockets. Nothing that is not deliberately over the eyes may cross it. */
  eyeLine: 9.75,
  /** Where a side lock is rooted. */
  temple: 6.5,
  /** The outer edge of a side lock: clear of the skull, so it frames the face rather than hiding it. */
  sideOuter: 12.5,
  width: 18
} as const;

/**
 * The six points a hairstyle may attach to.
 *
 * A style says "a tail from the back anchor" rather than "a rectangle at x 32, y 8", so the same
 * style fitted to a lower cap — which is what an eared race wears — moves its tail with the cap
 * instead of leaving it hanging in the air.
 */
export interface HairAnchors {
  top: readonly [number, number];
  left: readonly [number, number];
  right: readonly [number, number];
  back: readonly [number, number];
  front: readonly [number, number];
  /** The pair of x positions a face-framing lock hangs at, and the y it starts from. */
  faceFrame: { left: number; right: number; y: number };
  /**
   * The same six points under the names a hairstyle actually thinks in.
   *
   * `top`, `left` and `back` are where these started, and they are too vague to hang a turn off:
   * "left" is the reader's left on one direction and the figure's on another, and "back" was doing
   * duty for both the nape and the occiput, which are four units apart and behave differently when
   * the head turns. The anatomical names are unambiguous in a way the compass ones are not, and a
   * style that says `temple_R` cannot be read as meaning the other side by somebody adding a
   * direction later.
   */
  crown: readonly [number, number];
  forehead_center: readonly [number, number];
  temple_L: readonly [number, number];
  temple_R: readonly [number, number];
  /** The back of the skull, where volume and length are rooted. Not the nape. */
  occipital_back: readonly [number, number];
  /** Where the skull ends and the neck begins: the floor a back node may not draw past. */
  neck_joint: readonly [number, number];
}

/** The bands a part is allowed to draw in. A part that leaves its band cannot compose with others. */
export const BANDS = {
  head: { top: 3, bottom: 21 },
  torso: { top: 21, bottom: 35 },
  legs: { top: 35, bottom: 46 },
  /** Hair and headwear reach the ceiling, and no further. */
  crown: { top: FIGURE_BOUNDS.ceiling, bottom: 12 }
} as const;

/** Keeps a shape's top edge inside the frame without moving anything that already fits. */
export function clampCrown(top: number): number {
  return Math.max(FIGURE_BOUNDS.ceiling, top);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Crops
 * ──────────────────────────────────────────────────────────────────────────── */

/** How much of the figure is in shot. One drawing, four windows onto it. */
export type AvatarCropMode = 'full' | 'half' | 'bust' | 'portrait';

/**
 * Four crops of one drawing, each square, each starting at the frame's own ceiling.
 *
 * Every one of them begins at y 0 rather than y 1. The bust crop used to start at 1, which is inside
 * the band hair and headwear are authored in — so a wizard's hat, a rabbit's ears and every crown in
 * the wardrobe lost their top unit in every list row in the product while looking correct on the
 * customiser's stage. One unit, and it was the most visible fault in the set.
 *
 * They are square because every frame that holds one is: a circle, a rounded square and a card slot
 * all crop to a square, and a non-square viewBox inside a square element letterboxes the figure and
 * then centres the letterbox rather than the person.
 */
export const cropViewBox: Record<AvatarCropMode, string> = {
  /** The whole grid: the figure standing on its shadow. */
  full: '0 0 48 48',
  /** Head to hip, so the outfit reads without the legs taking half the height. */
  half: '6 0 36 36',
  /** Head and upper torso — what a 40-pixel row has room for. */
  bust: '9 0 30 30',
  /** Head and shoulders only, for the sizes where a torso is four dark pixels. */
  portrait: '12 0 24 24'
};

/**
 * The crop a given size gets, which is the whole crop policy of the product.
 *
 * It lives here rather than in each caller because a rule spread across fourteen call sites is
 * fourteen rules that drift. The numbers come from what is legible: below 40 pixels a torso is four
 * dark rows and the face is what anybody is looking for; above 112 there is room for the legs, and
 * cropping them throws away the outfit a child spent points on.
 */
export function cropForSize(size: number): AvatarCropMode {
  if (size < 40) return 'portrait';
  if (size < 64) return 'bust';
  if (size < 112) return 'half';
  return 'full';
}

/* ────────────────────────────────────────────────────────────────────────────
 * Detail
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How much of the drawing is worth paying for at a given size.
 *
 * Deliberately a separate question from the crop, because they are separate questions and running
 * them together is how a 32-pixel row ends up cheap in the wrong way. The crop is *what is in
 * frame*; this is *what is drawn inside it*. A profile header and a leaderboard row can want the
 * same window onto the figure and very different amounts of work: one of them is on screen once,
 * and the other is on screen forty times.
 *
 * Only two levels, because there are only two answers anybody needs. A third would be a judgement
 * call at every call site and the call sites would disagree.
 */
export type AvatarDetail = 'full' | 'compact';

/**
 * Under this, the effects are noise that costs frames.
 *
 * 48 pixels, which is one grid unit per pixel: below it a `0.5`-unit micro-stroke is half a device
 * pixel and a trailing particle is a square of colour two pixels across. Neither is visible and
 * both are a composited layer and an animation ticking every frame — forty of those in a list is
 * exactly where a mid-range classroom tablet drops below sixty.
 */
export const COMPACT_DETAIL_BELOW = 48;

export function detailForSize(size: number): AvatarDetail {
  return size < COMPACT_DETAIL_BELOW ? 'compact' : 'full';
}
