import { SKULL } from './avatarGeometry';

/**
 * Which way the figure is facing, and what that does to the drawing.
 *
 * ── Why not `scaleX(-1)` ──
 * Mirroring the whole root is the cheap answer and it is wrong in three ways that all show at once:
 * the parting in the hair swaps sides, so a child's avatar becomes a different child; anything with
 * text or a number on it reads backwards; and the near arm — which is drawn in front of the body and
 * pivots from the near shoulder — becomes the far arm without its depth order changing, so the
 * figure's hand goes behind its own chest.
 *
 * ── What this does instead ──
 * A direction is three facts, and each of them is applied to a different part of the stack:
 *
 *   * **yaw**, how far round the head and torso have turned. The drawing is the same drawing; the
 *     parts are offset along x by how far they are from the axis of rotation, which is what gives a
 *     three-quarter view without a second set of art. A face at yaw 1 has its features pushed to
 *     one side of the skull and its far ear hidden, which is what the eye reads as "turned".
 *   * **depth swap**, whether the near arm and leg are the ones on the left or on the right. This is
 *     a z-order change rather than a position change, and it is the half a mirror gets wrong.
 *   * **facing**, whether the far side of the head is showing at all — the back view, where the face
 *     is not drawn and the hair is the whole of it.
 *
 * Nothing here animates. A pose must never decide which way its subject is facing: that was the run
 * cycle turning the character round twice a second, and the fix is that direction is a prop with one
 * default and no keyframe may touch it.
 */
export type AvatarDirection =
  | 'front'
  | 'three_quarter_left'
  | 'left'
  | 'three_quarter_right'
  | 'right'
  | 'back';

export const avatarDirections: AvatarDirection[] = [
  'front', 'three_quarter_left', 'left', 'three_quarter_right', 'right', 'back'
];

export const directionLabels: Record<AvatarDirection, string> = {
  front: 'หันหน้า',
  three_quarter_left: 'เฉียงซ้าย',
  left: 'หันซ้าย',
  three_quarter_right: 'เฉียงขวา',
  right: 'หันขวา',
  back: 'หันหลัง'
};

export interface DirectionRig {
  /**
   * How far round, from −1 (fully left) through 0 (front) to +1 (fully right).
   *
   * A number rather than a name so a part can be offset in proportion to it: a nose moves the whole
   * way, an ear moves half of it, and the skull itself barely moves at all. Naming six cases in
   * every part is six chances for one of them to be forgotten.
   */
  yaw: number;
  /** True when the face is away from the reader. The features are not drawn at all. */
  faceHidden: boolean;
  /** Which of the two ears the turn has taken out of sight, if either. */
  hiddenEar: 'none' | 'left' | 'right';
  /** Whether the arm and leg drawn in front are the figure's own left or right. */
  nearSide: 'left' | 'right';
  /** How much the shoulders narrow as the torso turns — a body seen edge-on is not as wide. */
  shoulderScale: number;
}

/**
 * One number per direction, and everything else derived from it.
 *
 * The three-quarter views are 0.55 rather than 0.5: at exactly half the face reads as ambiguous —
 * neither turned nor straight on — and a chibi head is wide enough that the difference between
 * "slightly turned" and "turned" is a few units of a 48-grid.
 */
const yawOf: Record<AvatarDirection, number> = {
  front: 0,
  three_quarter_left: -0.55,
  left: -1,
  three_quarter_right: 0.55,
  right: 1,
  back: 0
};

export function directionRig(direction: AvatarDirection): DirectionRig {
  const yaw = yawOf[direction];
  return {
    yaw,
    faceHidden: direction === 'back',
    // An ear goes out of sight only on a full side view; at three-quarters both are still there,
    // which is why a hairstyle must not decide where its side volume goes from the name alone.
    hiddenEar: direction === 'left' ? 'right' : direction === 'right' ? 'left' : 'none',
    /*
     * The near limb, which is the half a mirror gets wrong.
     *
     * Turned to the reader's left, the figure's right side is the one nearer the reader, so the
     * right arm is drawn in front. This is a depth order, not a position: the arms keep their own
     * pivots and their own lengths, and only which one is painted last changes.
     */
    nearSide: yaw < 0 ? 'right' : 'left',
    shoulderScale: 1 - Math.abs(yaw) * 0.22
  };
}

/** How far a part at this distance from the turn axis moves, in grid units. */
export function yawShift(rig: DirectionRig, distanceFromAxis: number): number {
  return rig.yaw * distanceFromAxis;
}

/** The centre line of the face after the turn — where the eyes, nose and mouth sit. */
export function faceCentre(rig: DirectionRig): number {
  // Two-thirds of half the skull: the features crowd towards the turned side without leaving it,
  // which is what separates a turned head from a head with its face slid off the edge.
  return SKULL.centre + yawShift(rig, (SKULL.width / 2) * 0.66);
}

/** Whether this direction shows the back of the head rather than the front of it. */
export function showsBackOfHead(direction: AvatarDirection): boolean {
  return direction === 'back';
}
