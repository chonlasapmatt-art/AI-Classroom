import type { ReactElement } from 'react';
import { px, ACCENT, HAIR, HAIR_HIGHLIGHT, HAIR_SHADOW, MAGIC, MAGIC_HIGHLIGHT } from './avatarSprites';
import { clampCrown, SKULL, type HairAnchors } from './avatarGeometry';
import { yawShift, type DirectionRig } from './avatarDirection';
import type { AvatarRace } from './avatarSchema';

/**
 * Hair, as two drawings rather than one.
 *
 * ── What was wrong ──
 * Every hairstyle used to be one group drawn after the head. That single fact produced all four of
 * the complaints at once: an afro drawn after the face covered the face; a bun drawn at y −1 was
 * sheared off by the frame; a cat's ears drawn inside the head were buried under the cap; and a
 * long style had nowhere to hang except over the chin. None of them is fixable by nudging a shape,
 * because all four are the same missing distinction — hair has a front and a back, and only the
 * front belongs over the face.
 *
 * ── The shape of the fix ──
 * A style returns two drawings. The back hangs behind everything, including the torso, which is
 * where length, volume and tails belong. The front is the cap on the skull, the fringe, and the
 * locks that frame the face — and it is bounded: nothing in it crosses the eye line unless the
 * style is one of the two that means to.
 *
 * ── Fitted, not scaled ──
 * A race changes where the cap sits, never how big the style is. An eared race wears its hair half
 * a unit lower and a little shallower so the ear roots are not buried; a robot's cap is a plate
 * with a seam. Every style is authored against `fit`, so one number moves the whole style and
 * nothing is left hanging where the old cap used to be. Scaling a style to make it fit is what this
 * file exists to stop: it puts the drawing off the grid and reads as a smear.
 */

/** How a cap sits on a particular skull. Authored per race; every style reads it. */
export interface HairFit {
  capTop: number;
  capHeight: number;
  capLeft: number;
  capWidth: number;
  /** Lowest a fringe may reach. Below the eye line only where a style means to cover an eye. */
  fringeFloor: number;
  /** A panel with a seam rather than hair: a head that is manufactured wears a helm. */
  plated: boolean;
}

/**
 * The cap each race wears.
 *
 * What changes is the depth, never the top. The first version lowered the whole cap for the eared
 * races on the reasoning that hair should not bury an ear root — and that opened half a unit of lit
 * scalp between the skull, which starts at y 4, and a cap that now started at 4.5. The ears are
 * drawn *after* the hair instead, which solves the burying without moving the hairline at all.
 *
 * So the number that moves is `capHeight`: a muzzled or eared head reads better under a shallower
 * cut, and a head that is manufactured wears a plate with a seam rather than hair.
 */
const raceFits: Record<AvatarRace, HairFit> = {
  human: { capTop: 3.5, capHeight: 5.5, capLeft: 14.5, capWidth: 19, fringeFloor: 12.5, plated: false },
  spirit: { capTop: 3.5, capHeight: 5.5, capLeft: 14.5, capWidth: 19, fringeFloor: 12.5, plated: false },
  demon: { capTop: 3.5, capHeight: 5, capLeft: 14.5, capWidth: 19, fringeFloor: 12, plated: false },
  dragonkin: { capTop: 3.5, capHeight: 4.5, capLeft: 14.5, capWidth: 19, fringeFloor: 11.5, plated: false },
  beastfolk: { capTop: 3.5, capHeight: 4.5, capLeft: 14.5, capWidth: 19, fringeFloor: 11.5, plated: false },
  robot: { capTop: 3.5, capHeight: 5, capLeft: 14.5, capWidth: 19, fringeFloor: 10.5, plated: true }
};

export function hairFitFor(race: AvatarRace | undefined): HairFit {
  return raceFits[race ?? 'human'] ?? raceFits.human;
}

/** The six points a style hangs things from, derived from the fit rather than counted again. */
export function hairAnchorsFor(fit: HairFit): HairAnchors {
  const capBottom = fit.capTop + fit.capHeight;
  return {
    top: [SKULL.centre, fit.capTop],
    left: [fit.capLeft, SKULL.temple],
    right: [fit.capLeft + fit.capWidth, SKULL.temple],
    back: [SKULL.centre, capBottom],
    front: [SKULL.centre, capBottom],
    faceFrame: { left: SKULL.sideOuter, right: SKULL.right + 0.5, y: SKULL.temple }
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The cap — the one part every style shares
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The hair that sits on the skull.
 *
 * Deliberately half a unit wider and half a unit higher than the bone on every side. A cap flush
 * with the skull leaves a hairline of lit skin showing between the two, which is the stray line
 * around the head in the brief: not a rendering artefact, just two rectangles meeting exactly.
 *
 * The temples carry it down past the brow at the sides, so no gap opens where a skull is wider than
 * its cap; they stop short of the jaw, because hair that reaches the chin is a hood.
 */
function cap(fit: HairFit): ReactElement {
  const bottom = fit.capTop + fit.capHeight;
  return (
    <>
      {px(fit.capLeft, fit.capTop, fit.capWidth, fit.capHeight, HAIR)}
      {px(fit.capLeft, fit.capTop, fit.capWidth, 1.5, HAIR_HIGHLIGHT)}
      {px(fit.capLeft, bottom - 0.5, fit.capWidth, 0.5, HAIR_SHADOW)}
      {/* The temples: what stops a gap opening where the skull is wider than the cap. */}
      {px(fit.capLeft, bottom, 2.5, 3, HAIR)}
      {px(fit.capLeft + fit.capWidth - 2.5, bottom, 2.5, 3, HAIR_SHADOW)}
      {/* A manufactured head reads as plating rather than hair, from the seam alone. */}
      {fit.plated ? (
        <>
          {px(fit.capLeft, fit.capTop + fit.capHeight / 2, fit.capWidth, 0.5, HAIR_SHADOW)}
          {px(SKULL.centre - 1.5, fit.capTop + 0.5, 3, 1, ACCENT)}
        </>
      ) : null}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fringes — the one part that is allowed near the face
 * ──────────────────────────────────────────────────────────────────────────── */

type Fringe = 'strands' | 'blunt' | 'parted' | 'swept' | 'spiky' | 'none';

/**
 * What falls over the brow.
 *
 * The rule every one of these obeys: a fringe hangs at the temples, not over the sockets. The old
 * one dropped two triangles at x 17 and x 27, which is exactly where the eyes are — so every avatar
 * in the school wore its hair through its own eyes. Where a strand does reach past the brow it does
 * it outside x 18.25–29.75, which is the pair of eye boxes `headNeck` draws.
 */
function fringe(kind: Fringe, fit: HairFit): ReactElement | null {
  const brow = fit.capTop + fit.capHeight;
  const floor = Math.min(fit.fringeFloor, SKULL.chin - 1);
  switch (kind) {
    case 'strands':
      return (
        <>
          <polygon points={`${SKULL.left},${brow - 0.5} ${SKULL.left + 3.5},${brow - 0.5} ${SKULL.left + 1.5},${floor}`} fill={HAIR} />
          <polygon points={`${SKULL.right - 3.5},${brow - 0.5} ${SKULL.right},${brow - 0.5} ${SKULL.right - 1.5},${floor - 0.5}`} fill={HAIR_SHADOW} />
        </>
      );
    case 'blunt':
      /* A straight edge across the brow. It stops above the eye line rather than on it: the half
         unit is the difference between a fringe and a blindfold. */
      return (
        <>
          {px(SKULL.left, brow - 1, SKULL.width, Math.max(0.75, SKULL.eyeLine - brow + 0.5), HAIR)}
          {px(SKULL.left, SKULL.eyeLine - 0.75, SKULL.width, 0.5, HAIR_SHADOW)}
        </>
      );
    case 'parted':
      return (
        <>
          <polygon points={`${SKULL.centre},${brow - 2} ${SKULL.centre},${brow} ${SKULL.left + 1},${floor - 1} ${SKULL.left},${brow - 1}`} fill={HAIR} />
          <polygon points={`${SKULL.centre},${brow - 2} ${SKULL.centre},${brow} ${SKULL.right - 1},${floor - 1.5} ${SKULL.right},${brow - 1}`} fill={HAIR_SHADOW} />
        </>
      );
    case 'swept':
      /* One sweep across the forehead with its long point at the near temple. The point hangs at
         x 15–17.5, which is outside the left socket: the eyes are x 18.25–22.25 and 25.75–29.75, and
         a sweep that ends between them is a sweep through one of them. */
      return (
        <polygon
          points={`${SKULL.left},${brow - 1.5} ${SKULL.right},${brow - 1.5} ${SKULL.right - 2},${brow + 0.5} ${SKULL.left + 2.5},${brow + 0.5} ${SKULL.left + 1},${floor - 1}`}
          fill={HAIR}
        />
      );
    case 'spiky':
      return (
        <>
          <polygon points={`${SKULL.left + 1},${brow} ${SKULL.left + 4},${brow} ${SKULL.left + 2},${brow + 2.5}`} fill={HAIR} />
          <polygon points={`${SKULL.right - 4},${brow} ${SKULL.right - 1},${brow} ${SKULL.right - 2},${brow + 2.5}`} fill={HAIR_SHADOW} />
        </>
      );
    case 'none':
      return null;
  }
}

/**
 * The locks that hang beside the face.
 *
 * Outside the skull rather than over it — x 12.5 and x 33.5 — because a lock drawn on the cheek is
 * a lock over an eye at every size the product actually shows an avatar at.
 */
function faceLocks(fit: HairFit, length: number, curl: boolean): ReactElement {
  const { left, right, y } = hairAnchorsFor(fit).faceFrame;
  return (
    <>
      {px(left, y, 2.5, length, HAIR)}
      {px(right, y, 2.5, length, HAIR_SHADOW)}
      {px(left, y, 0.75, length, HAIR_HIGHLIGHT)}
      {curl ? (
        <>
          <circle cx={left + 1.25} cy={y + length} r="1.75" fill={HAIR} />
          <circle cx={right + 1.25} cy={y + length} r="1.75" fill={HAIR_SHADOW} />
        </>
      ) : null}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The styles
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One hairstyle: what hangs behind, what rises above, and what falls over the brow.
 *
 * `back` is drawn behind the whole figure, `crown` and `fringe` after the face. Splitting them is
 * the whole reason this file exists — see the note at the top.
 */
export interface HairStyleDefinition {
  /** Behind the head and the body: length, volume, tails. Never over the face, by construction. */
  back?: (fit: HairFit) => ReactElement;
  /** Above the cap: a bun, a crest, a pair of puffs. Clamped to the frame's ceiling. */
  crown?: (fit: HairFit) => ReactElement;
  fringe: Fringe;
  /** Locks beside the face, in units of length. Absent means none. */
  locks?: number;
  curlyLocks?: boolean;
  /** A covering rather than a cut — a buzz, an afro's own cap — so the cap is drawn shallow. */
  shallow?: boolean;
}

const tie = (x: number, y: number): ReactElement => (
  <>{px(x, y, 4, 1.25, ACCENT)}{px(x, y, 4, 0.5, HAIR_HIGHLIGHT)}</>
);

export const hairStyleDefinitions: Record<string, HairStyleDefinition> = {
  short: { fringe: 'strands' },

  buzz: { fringe: 'none', shallow: true },

  bob: {
    back: () => <>{px(14, 7, 20, 8, HAIR_SHADOW)}{px(14, 14, 20, 1.5, HAIR)}</>,
    fringe: 'blunt',
    locks: 7
  },

  long: {
    /* Down past the shoulder blades, and behind the torso rather than over the chin. */
    back: () => (
      <>
        {px(13.5, 7, 21, 22, HAIR_SHADOW)}
        {px(13.5, 7, 21, 2, HAIR)}
        <polygon points="13.5,29 34.5,29 31,32 17,32" fill={HAIR_SHADOW} />
      </>
    ),
    fringe: 'parted',
    locks: 13
  },

  wavy: {
    back: () => (
      <>
        {px(13.5, 7, 21, 16, HAIR_SHADOW)}
        <circle cx="15.5" cy="23" r="3" fill={HAIR_SHADOW} />
        <circle cx="24" cy="24.5" r="3.5" fill={HAIR_SHADOW} />
        <circle cx="32.5" cy="23" r="3" fill={HAIR_SHADOW} />
      </>
    ),
    fringe: 'swept',
    locks: 11,
    curlyLocks: true
  },

  ponytail: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight;
      return (
        <>
          {px(30.5, root, 5, 15, HAIR)}
          {px(30.5, root, 1.5, 15, HAIR_HIGHLIGHT)}
          <polygon points={`30.5,${root + 15} 35.5,${root + 15} 34.5,${root + 18.5} 31.5,${root + 18.5}`} fill={HAIR_SHADOW} />
          {tie(30.5, root + 0.5)}
        </>
      );
    },
    fringe: 'strands',
    locks: 5
  },

  twintail: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight;
      return (
        <>
          {px(11, root, 4.5, 13, HAIR)}
          {px(32.5, root, 4.5, 13, HAIR_SHADOW)}
          {px(11, root, 1.25, 13, HAIR_HIGHLIGHT)}
          {tie(11, root + 0.5)}
          {tie(32.5, root + 0.5)}
        </>
      );
    },
    fringe: 'blunt',
    locks: 4
  },

  braid: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight;
      return (
        <>
          {px(31.5, root, 4.5, 5, HAIR)}
          {px(31.5, root + 5, 4.5, 4, HAIR_SHADOW)}
          {px(31.5, root + 9, 4.5, 4, HAIR)}
          {px(31.5, root + 13, 4.5, 3, HAIR_SHADOW)}
          {tie(31.75, root + 16)}
        </>
      );
    },
    fringe: 'parted',
    locks: 6
  },

  bun: {
    /* The knot rises off the cap rather than floating over it: its underside is inside the cap. */
    crown: (fit) => {
      const top = clampCrown(fit.capTop - 3.5);
      return (
        <>
          <circle cx={SKULL.centre} cy={top + 3.25} r="3.25" fill={HAIR} />
          <circle cx={SKULL.centre - 1} cy={top + 2.5} r="1.25" fill={HAIR_HIGHLIGHT} />
          {px(SKULL.centre - 2.5, top + 5.5, 5, 1, HAIR_SHADOW)}
        </>
      );
    },
    fringe: 'strands',
    locks: 3
  },

  curly: {
    back: () => (
      <>
        <circle cx="16" cy="10" r="4" fill={HAIR_SHADOW} />
        <circle cx="32" cy="10" r="4" fill={HAIR_SHADOW} />
        <circle cx="17" cy="16" r="3.5" fill={HAIR_SHADOW} />
        <circle cx="31" cy="16" r="3.5" fill={HAIR_SHADOW} />
      </>
    ),
    crown: (fit) => {
      const top = clampCrown(fit.capTop - 3);
      return (
        <>
          <circle cx={SKULL.left + 2.5} cy={top + 4.5} r="3" fill={HAIR} />
          <circle cx={SKULL.centre} cy={top + 3} r="3" fill={HAIR} />
          <circle cx={SKULL.right - 2.5} cy={top + 4.5} r="3" fill={HAIR} />
          <circle cx={SKULL.centre - 1} cy={top + 2} r="1.25" fill={HAIR_HIGHLIGHT} />
        </>
      );
    },
    fringe: 'strands',
    locks: 4
  },

  afro: {
    /*
     * The volume goes behind the head, which is the only place it can go.
     *
     * Drawn in front it was a circle of radius ten centred on the skull: it covered the eyes, the
     * nose and the mouth, and reached y −6 where the frame cut it off. Behind the head the same
     * volume is a halo around a face that is entirely visible — which is what an afro looks like.
     */
    back: () => (
      <>
        <ellipse cx={SKULL.centre} cy="10" rx="12.5" ry="10" fill={HAIR} />
        <ellipse cx={SKULL.centre - 4} cy="6" rx="4" ry="3" fill={HAIR_HIGHLIGHT} opacity="0.45" />
        <ellipse cx={SKULL.centre} cy="14" rx="12.5" ry="6" fill={HAIR_SHADOW} opacity="0.35" />
      </>
    ),
    fringe: 'blunt',
    shallow: true
  },

  /* ── The second dozen ──
   * Added because twelve cuts over six things worn on the head is seventy-two hairstyles, and
   * seventy-two is what the drawer showed a child who had already seen all of them. Every one of
   * these is a different silhouette rather than a different colour: a shaved side, a spike, a locked
   * length, a cord. What none of them is, is one of the twelve above with the parting moved. */

  undercut: {
    /* Shaved at the sides, weight on top. The whole read is the step between the two. */
    crown: (fit) => (
      <>
        {px(fit.capLeft + 1, clampCrown(fit.capTop - 1.5), fit.capWidth - 2, 2.5, HAIR)}
        {px(fit.capLeft + 1, clampCrown(fit.capTop - 1.5), fit.capWidth - 2, 1, HAIR_HIGHLIGHT)}
      </>
    ),
    fringe: 'swept',
    shallow: true
  },

  spiky: {
    crown: (fit) => {
      const base = fit.capTop + 0.5;
      const peak = clampCrown(base - 3.5);
      const spike = (x: number, lean: number) =>
        <polygon key={x} points={`${x - 2},${base} ${x + lean},${peak} ${x + 2},${base}`} fill={HAIR} />;
      return (
        <>
          {[SKULL.left + 3, SKULL.centre - 2, SKULL.centre + 2, SKULL.right - 3]
            .map((x, index) => spike(x, index % 2 === 0 ? -1 : 1))}
          {px(SKULL.centre - 1, peak + 1, 1, 2, HAIR_HIGHLIGHT)}
        </>
      );
    },
    fringe: 'spiky'
  },

  pixie: {
    back: () => px(15, 7, 18, 5, HAIR_SHADOW),
    fringe: 'parted',
    locks: 5
  },

  dreadlocks: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight;
      return (
        <>
          {[12, 16.5, 21, 25.5, 30, 34].map((x, index) => (
            <g key={x}>
              {px(x, root, 3, 11 + (index % 3) * 2, index % 2 ? HAIR_SHADOW : HAIR)}
              {px(x, root + 11 + (index % 3) * 2 - 1.5, 3, 1.5, ACCENT)}
            </g>
          ))}
        </>
      );
    },
    fringe: 'blunt',
    locks: 6
  },

  topknot: {
    crown: (fit) => {
      const top = clampCrown(fit.capTop - 3);
      return (
        <>
          {px(SKULL.centre - 2, top, 4, 3.5, HAIR)}
          {px(SKULL.centre - 2, top, 4, 1, HAIR_HIGHLIGHT)}
          {tie(SKULL.centre - 2, top + 3.5)}
        </>
      );
    },
    fringe: 'strands',
    locks: 4
  },

  sidepart: {
    /* The parting is off-centre and stays off-centre through a turn, which is exactly what a mirror
       would have got wrong: a child parted on the left is not the same child parted on the right. */
    crown: (fit) => px(SKULL.left + 2, fit.capTop - 0.5, 7, 2, HAIR_HIGHLIGHT),
    fringe: 'swept',
    locks: 6
  },

  cybercords: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight;
      return (
        <>
          {px(31, root, 2.5, 14, HAIR_SHADOW)}
          {px(34, root + 2, 2, 11, HAIR)}
          {px(31, root + 13, 2.5, 1.5, MAGIC)}
          {px(34, root + 12, 2, 1.5, MAGIC_HIGHLIGHT)}
        </>
      );
    },
    crown: (fit) => px(SKULL.centre - 4, clampCrown(fit.capTop - 1), 8, 1.25, MAGIC),
    fringe: 'blunt',
    shallow: true
  },

  flame: {
    /* Fire reads as a silhouette rather than as a colour, so the shape is three tongues of different
       heights: three of the same height is a crown, and a crown is a different character. */
    crown: (fit) => {
      const base = fit.capTop + 0.5;
      return (
        <>
          <polygon points={`${SKULL.left + 2},${base} ${SKULL.left + 5},${clampCrown(base - 4)} ${SKULL.left + 7},${base}`} fill={HAIR} />
          <polygon points={`${SKULL.centre - 3},${base} ${SKULL.centre},${clampCrown(base - 5)} ${SKULL.centre + 3},${base}`} fill={HAIR} />
          <polygon points={`${SKULL.right - 7},${base} ${SKULL.right - 4},${clampCrown(base - 3)} ${SKULL.right - 2},${base}`} fill={HAIR_SHADOW} />
          <polygon points={`${SKULL.centre - 1},${base} ${SKULL.centre},${clampCrown(base - 3)} ${SKULL.centre + 1},${base}`} fill={MAGIC_HIGHLIGHT} />
        </>
      );
    },
    fringe: 'spiky',
    shallow: true
  },

  crystal: {
    crown: (fit) => {
      const base = fit.capTop + 1;
      return (
        <>
          <polygon points={`${SKULL.centre - 5},${base} ${SKULL.centre - 3},${clampCrown(base - 4)} ${SKULL.centre - 1},${base}`} fill={MAGIC} />
          <polygon points={`${SKULL.centre - 1},${base} ${SKULL.centre + 1},${clampCrown(base - 5)} ${SKULL.centre + 3},${base}`} fill={MAGIC_HIGHLIGHT} />
          <polygon points={`${SKULL.centre + 3},${base} ${SKULL.centre + 5},${clampCrown(base - 3)} ${SKULL.centre + 6},${base}`} fill={MAGIC} />
        </>
      );
    },
    fringe: 'strands',
    locks: 5
  },

  pigtails: {
    back: (fit) => {
      const root = fit.capTop + fit.capHeight + 2;
      return (
        <>
          <circle cx="12" cy={root + 4} r="3.5" fill={HAIR} />
          <circle cx="36" cy={root + 4} r="3.5" fill={HAIR_SHADOW} />
          {px(11.5, root, 3, 4, HAIR)}
          {px(33.5, root, 3, 4, HAIR_SHADOW)}
          {tie(11.5, root)}
          {tie(33.5, root)}
        </>
      );
    },
    fringe: 'blunt',
    locks: 4
  },

  hime: {
    /* Blunt fringe, two straight temple lengths, and the rest down the back — the cut whose whole
       identity is three straight edges, which is why its locks are longer than its fringe is low. */
    back: () => (
      <>
        {px(14, 7, 20, 20, HAIR_SHADOW)}
        {px(14, 25, 20, 2, HAIR)}
      </>
    ),
    fringe: 'blunt',
    locks: 12
  },

  shaggy: {
    back: () => px(14.5, 7, 19, 10, HAIR_SHADOW),
    crown: (fit) => (
      <>
        {px(SKULL.left + 1, clampCrown(fit.capTop - 1), 5, 2, HAIR)}
        {px(SKULL.centre + 1, clampCrown(fit.capTop - 1.5), 6, 2.5, HAIR)}
      </>
    ),
    fringe: 'strands',
    locks: 7
  },

  mohawk: {
    crown: (fit) => {
      const base = fit.capTop + 1;
      const peak = clampCrown(base - 4);
      return (
        <>
          <polygon points={`${SKULL.centre - 4},${base} ${SKULL.centre},${peak} ${SKULL.centre + 4},${base}`} fill={HAIR} />
          <polygon points={`${SKULL.centre - 1.5},${base} ${SKULL.centre},${peak + 0.5} ${SKULL.centre + 1},${base}`} fill={HAIR_HIGHLIGHT} />
          <polygon points={`${SKULL.centre - 7},${base + 1.5} ${SKULL.centre - 4},${peak + 1.5} ${SKULL.centre - 2},${base + 1.5}`} fill={HAIR_SHADOW} />
          <polygon points={`${SKULL.centre + 2},${base + 1.5} ${SKULL.centre + 4},${peak + 1.5} ${SKULL.centre + 7},${base + 1.5}`} fill={HAIR_SHADOW} />
        </>
      );
    },
    fringe: 'spiky',
    shallow: true
  }
};

/**
 * Fur rather than hair, for a head whose silhouette is its ears.
 *
 * Three tufts low on the skull. A full cut under a pair of cat ears is two shapes competing at the
 * top of the head and the eye reads neither — which is why this exists rather than an animal race
 * simply wearing `short`.
 */
function furTuftFront(fit: HairFit): ReactElement {
  const brow = fit.capTop + fit.capHeight;
  return (
    <>
      {px(SKULL.left + 1, fit.capTop + 0.5, SKULL.width - 2, 3.5, HAIR)}
      {px(SKULL.left + 1, fit.capTop + 0.5, SKULL.width - 2, 1.25, HAIR_HIGHLIGHT)}
      {/* The outer two hang at the temples and the middle one stops at the brow: a tuft down the
          centre of the face is a fringe in the eyes, and the sockets start at x 18.25. */}
      <polygon points={`${SKULL.left},${brow - 1} ${SKULL.left + 3.5},${brow - 1} ${SKULL.left + 1.5},${brow + 2}`} fill={HAIR} />
      <polygon points={`${SKULL.centre - 2},${brow - 1} ${SKULL.centre + 1.5},${brow - 1} ${SKULL.centre - 0.5},${brow + 0.5}`} fill={HAIR} />
      <polygon points={`${SKULL.right - 3.5},${brow - 1} ${SKULL.right},${brow - 1} ${SKULL.right - 1.5},${brow + 2}`} fill={HAIR_SHADOW} />
    </>
  );
}

/** A head with no hair at all still needs an answer, and a bare skull is not one. */
const raceFallbackStyle: Record<AvatarRace, string> = {
  human: 'short',
  spirit: 'wavy',
  demon: 'short',
  dragonkin: 'fur',
  beastfolk: 'fur',
  robot: 'buzz'
};

/**
 * The wrap round the ear and the jaw — the layer a turned head cannot do without.
 *
 * Straight on it is a sliver at each edge of the skull, which is what hair looks like framing a face
 * and is nearly invisible. Turned, it is the whole point: the cap ends at the hairline, the skull
 * carries on past it, and without something following the side of the head a profile shows a band of
 * bare scalp between the hair and the jaw. That is the bald spot, and no amount of widening the cap
 * fixes it — a cap wide enough to cover a profile is a cap over the face when seen from the front.
 *
 * It slides with the turn rather than being redrawn per direction: the near panel comes across the
 * cheek, the far one tucks behind the skull, and both keep their own length.
 */
function sideWrap(fit: HairFit, length: number, rig?: DirectionRig): ReactElement {
  const slide = rig ? yawShift(rig, 3.5) : 0;
  const top = fit.capTop + fit.capHeight - 1;
  const drop = Math.max(3, Math.min(length, SKULL.chin - top));
  return (
    <g data-part="hairSide" transform={slide === 0 ? undefined : `translate(${slide} 0)`}>
      {px(SKULL.left - 0.5, top, 3, drop, HAIR)}
      {px(SKULL.right - 2.5, top, 3, drop, HAIR_SHADOW)}
      {/* The ear notch: the wrap tucks behind where an ear sits rather than running flat over it. */}
      {px(SKULL.left - 0.5, top, 0.75, drop, HAIR_HIGHLIGHT)}
    </g>
  );
}

/** What the compositor gets: three drawings, for the three places hair goes. */
export interface HairDrawing {
  back: ReactElement | null;
  /** The wrap round the ear and jaw. Drawn over the face's edge and under the fringe. */
  side: ReactElement;
  front: ReactElement;
}

/** Every style this system can draw, including the fur the animal races fall back to. */
export const hairStyleIds: string[] = [...Object.keys(hairStyleDefinitions), 'fur'];

/**
 * The style a saved avatar draws, fitted to the race wearing it.
 *
 * An unknown id is not an error to raise: a record written by a build that had a style this one has
 * dropped still belongs to a child, and the safe answer is the cut everybody starts with. The same
 * holds for a record with no hair layer at all, which is most of them.
 */
export function hairFor(
  styleId: string | undefined | null, race: AvatarRace | undefined, rig?: DirectionRig
): HairDrawing {
  const fit = hairFitFor(race);
  const requested = styleId ?? raceFallbackStyle[race ?? 'human'] ?? 'short';
  const id = requested === 'fur' || hairStyleDefinitions[requested] ? requested : 'short';

  if (id === 'fur') {
    return {
      back: null,
      // Fur wraps the jaw as much as hair does, and an animal head in profile is the case where a
      // missing wrap is most obvious: the cheek is the widest part of the silhouette.
      side: sideWrap(fit, 4, rig),
      front: <g data-part="hair">{furTuftFront(fit)}</g>
    };
  }

  const style = hairStyleDefinitions[id]!;
  const fitted: HairFit = style.shallow
    ? { ...fit, capHeight: Math.max(3.5, fit.capHeight - 1.5) }
    : fit;

  const back = style.back?.(fitted) ?? null;
  return {
    back: back ? <g data-part="hairBack">{back}</g> : null,
    /*
     * How far the wrap reaches is the style's own length where it has one, and a short frame where
     * it does not. A buzz cut still has hair beside the ear; what it does not have is length.
     */
    side: sideWrap(fitted, style.locks ?? (style.shallow ? 3 : 5), rig),
    front: (
      <g data-part="hair">
        {style.locks ? faceLocks(fitted, style.locks, style.curlyLocks ?? false) : null}
        {cap(fitted)}
        {style.crown?.(fitted) ?? null}
        {fringe(style.fringe, fitted)}
      </g>
    )
  };
}
