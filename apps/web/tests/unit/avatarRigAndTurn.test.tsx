import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import {
  fullBodyArchetypeList, shield, spellbook, sword, FULL_BODY_GRID
} from '../../src/features/avatars/avatarFullBody';
import {
  footprintDistance, footprintFor, isSilhouetteDistinct, nearestFootprint, rigArchetypeIds, rigFor,
  rigVariables, silhouetteVerdict, skeletonSignature, SILHOUETTE_MIN_DISTANCE,
  type SilhouetteFootprint
} from '../../src/features/avatars/avatarRig';
import { avatarDirections, directionRig } from '../../src/features/avatars/avatarDirection';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { crownShift, hairFitFor, hairFor, hairStyleIds } from '../../src/features/avatars/avatarHair';
import { COMPACT_DETAIL_BELOW, detailForSize, SKULL } from '../../src/features/avatars/avatarGeometry';
import type { AvatarConfigV2, AvatarRace } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];

const here = dirname(fileURLToPath(import.meta.url));
const poseStyles = readFileSync(
  resolve(here, '../../src/features/avatars/FullBodyAvatar.module.css'), 'utf8');

/** One `@keyframes` block, braces and all. A `[^}]*` match stops at the first frame's brace. */
function keyframes(name: string): string {
  const start = poseStyles.indexOf(`@keyframes ${name} {`);
  if (start < 0) throw new Error(`no @keyframes ${name}`);
  let depth = 0;
  for (let index = poseStyles.indexOf('{', start); index < poseStyles.length; index += 1) {
    if (poseStyles[index] === '{') depth += 1;
    if (poseStyles[index] === '}') {
      depth -= 1;
      if (depth === 0) return poseStyles.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** Every rotation a keyframe passes through, keyed by the stop it happens at. */
function anglesByStop(name: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const match of keyframes(name).matchAll(/([\d.]+)%\s*\{\s*transform: rotate\((-?[\d.]+)deg\)/g)) {
    found.set(match[1]!, Number(match[2]));
  }
  return found;
}

type Point = readonly [number, number];

function rotate([x, y]: Point, [cx, cy]: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Every corner a drawing occupies, rects and polygons alike. */
function cornersOf(drawing: ReturnType<typeof shield>): Point[] {
  const { container } = render(<svg>{drawing}</svg>);
  const points: Point[] = [];
  for (const rect of container.querySelectorAll('rect')) {
    const x = Number(rect.getAttribute('x'));
    const y = Number(rect.getAttribute('y'));
    const w = Number(rect.getAttribute('width'));
    const h = Number(rect.getAttribute('height'));
    points.push([x, y], [x + w, y], [x, y + h], [x + w, y + h]);
  }
  for (const polygon of container.querySelectorAll('polygon')) {
    for (const pair of (polygon.getAttribute('points') ?? '').trim().split(/\s+/)) {
      const [x, y] = pair.split(',').map(Number);
      points.push([x!, y!]);
    }
  }
  cleanup();
  return points;
}

/*
 * The skeleton, and why forty-one characters needed forty-one of them.
 *
 * Every pivot the poses turn used to be a constant in the stylesheet: one shoulder, one hip, one
 * neck, for the bear and the fairy and the drone alike. A silhouette is mostly where the joints are,
 * so forty-one figures sharing a joint tree share a silhouette however carefully their costumes are
 * drawn — and the poses lied on top of it, with a legless drone bobbing in time with a stride.
 */
describe('the skeleton under each figure', () => {
  it('has a row for every character the picker offers, and no orphans', () => {
    const drawn = new Set(fullBodyArchetypeList.map((archetype) => archetype.id));
    const rigged = new Set(rigArchetypeIds);
    for (const id of drawn) expect(rigged.has(id), `${id} has no skeleton`).toBe(true);
    for (const id of rigged) expect(drawn.has(id), `${id} is a skeleton nothing draws`).toBe(true);
    expect(drawn.size).toBe(41);
  });

  it('gives no two characters the same bone tree', () => {
    // The whole point. Two characters with identical joints and identical stance are one character
    // twice, and the picker row the second one takes could have held something new.
    const seen = new Map<string, string>();
    for (const id of rigArchetypeIds) {
      const signature = skeletonSignature(rigFor(id));
      const clash = seen.get(signature);
      expect(clash, `${id} and ${clash} are the same skeleton`).toBeUndefined();
      seen.set(signature, id);
    }
  });

  it('gives the classes the postures their class actually stands in', () => {
    // A scholar reads: the neck carries forward over a page. An athlete stands: shoulders wide and
    // weight low. At forty pixels a held book is four dark squares and a stance is the whole outline.
    expect(rigFor('scholar').posture.neckTilt).toBeGreaterThan(5);
    expect(rigFor('athlete').posture.shoulderSpan).toBeGreaterThan(1.1);
    expect(rigFor('student').posture).toEqual({
      neckTilt: 0, torsoLean: 0, shoulderSpan: 1, rootLift: 0, kneeDrop: 0
    });
  });

  it('arches a digitigrade knee down and a cloven one up', () => {
    // The joint that reads as a backwards knee is an ankle carried high, so a wolf's break is lower
    // down the limb; a deer's is the opposite, which is why its walk is a lift rather than a push.
    expect(rigFor('wolf').posture.kneeDrop).toBeGreaterThan(1);
    expect(rigFor('deer').posture.kneeDrop).toBeLessThan(0);
  });

  it('lifts the four that hover off the floor, and plants everything else', () => {
    for (const id of ['fairy', 'celestial', 'voidStalker', 'drone'] as const) {
      expect(rigFor(id).posture.rootLift, id).toBeGreaterThan(0);
      expect(rigVariables(rigFor(id))['--rig-planted'], id).toBe('0');
    }
    for (const id of ['student', 'wolf', 'warrior', 'astronaut'] as const) {
      expect(rigVariables(rigFor(id))['--rig-planted'], id).toBe('1');
    }
  });

  it('roots a beast tail at the rump rather than at the middle of its back', () => {
    // At y 34 a wolf's tail left its back, and the whole animal read as wearing one.
    expect(rigFor('wolf').anchors.tail[1]).toBeGreaterThan(rigFor('student').anchors.tail[1]);
  });

  it('answers for an id this build has never heard of', () => {
    // A build that drops an archetype must not blank the children wearing it.
    const unknown = rigFor('nonesuch' as never);
    expect(unknown.posture.shoulderSpan).toBe(1);
    expect(unknown.anchors.shoulderNear).toEqual([17, 23]);
  });

  it('carries every bone to the stylesheet as a property it can resolve', () => {
    const variables = rigVariables(rigFor('wolf'));
    for (const name of [
      '--rig-neck-x', '--rig-neck-y', '--rig-crown-x', '--rig-crown-y',
      '--rig-shoulder-near-x', '--rig-shoulder-far-x', '--rig-hip-near-x', '--rig-hip-far-x',
      '--rig-hip-y', '--rig-root-x', '--rig-root-y', '--rig-tail-x', '--rig-tail-y',
      '--rig-wing-x', '--rig-wing-y', '--rig-horn-x', '--rig-horn-y', '--rig-grip-x', '--rig-grip-y',
      '--rig-neck-tilt', '--rig-torso-lean', '--rig-shoulder-span', '--rig-root-lift',
      '--rig-knee-drop', '--rig-planted'
    ]) {
      expect(variables[name], name).toBeTruthy();
    }
  });

  it('puts the skeleton on the figure the customiser is actually showing', () => {
    const { container } = render(<FullBodyAvatar archetype="scholar" size={176} />);
    const style = container.querySelector('svg')?.getAttribute('style') ?? '';
    expect(style).toContain('--rig-neck-tilt: 7deg');
    // The tints still arrive on the same element: a bone must not have displaced a colour.
    expect(style).toContain('--av-skin');
  });

  it('wraps each band of slots in the group that carries its posture', () => {
    // Between the costume and the pose, because it belongs to neither: drawn in it would be
    // overwritten by the first keyframe, and written into the poses each of the eight would have to
    // name each of the forty-one.
    const { container } = render(<FullBodyAvatar archetype="athlete" animation="run" />);
    for (const slot of ['head_neck', 'torso_body', 'front_arm_weapon', 'back_arm']) {
      const group = container.querySelector(`[data-slot="${slot}"]`);
      expect(group?.getAttribute('class'), slot).toBeTruthy();
    }
  });

  it('turns a whole head, not a bare skull', () => {
    /*
     * The fault a still frame cannot show.
     *
     * A pose that tilted the head addressed the group the *skull* draws itself into. Hair, fringe,
     * side wrap and hat are separate slots — they have to be, because half are painted before the
     * face and half after — so a wave tilted a bare skull and left the hair standing where it was.
     * At rest they line up; the moment anything moves, the hair stops fitting the head.
     *
     * All six carry the same handle now, including the length behind the torso: a plait that keeps
     * still while the head it grows from turns is the same fault seen from behind.
     */
    // A composed figure rather than a bare costume, because `hair_back` only exists once a child has
    // chosen a cut with length in it — which is the case the fault is most visible in.
    const longHaired: AvatarConfigV2 = {
      archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2, race: 'human',
      layers: { hair_headpiece: 'hair_long', face_features: 'face_smile', top_clothing: 'top_uniform' }
    };
    const { container } = render(
      <FullBodyAvatar
        archetype="student"
        animation="wave"
        slots={figureSlotsFor(longHaired, directionRig('front'))}
      />);
    for (const slot of ['hair_back', 'head_neck', 'face', 'hair_side', 'hair_headwear']) {
      const outer = container.querySelector(`[data-slot="${slot}"]`);
      expect(outer?.getAttribute('class'), `${slot} carries no posture`).toMatch(/stanceHead/);
      const rig = outer?.firstElementChild;
      expect(rig?.getAttribute('class'), `${slot} does not turn with the head`).toMatch(/headRig/);
    }

    // And the poses address that handle rather than the skull's own group.
    for (const rule of [
      '.idle .headRig { animation: headDrift',
      '.wave .headRig { animation: waveHeadTilt',
      '.cast .headRig { animation: castLook'
    ]) {
      expect(poseStyles, rule).toContain(rule);
    }
    expect(poseStyles, 'a pose still tilts the skull alone').not.toMatch(/\.\w+ \.head \{ animation:/);
  });
});

/*
 * What a raised hand is holding, and whether it is still in the picture.
 *
 * The cheer takes both arms past 150 degrees and counter-rotates whatever they carry so it stays
 * upright. Those two rotations compose, and if the second one is centred on the wrong wrist the
 * result is a shield that turns correctly around somebody else's hand and leaves the frame.
 *
 * jsdom lays out no SVG, so the rule is applied here to the authored points: every corner of the
 * drawing, through the hand's rotation and then the shoulder's, at every stop the keyframes pass
 * through. That checks the composition rather than a spelling of it, and it is the only way to catch
 * this without a browser — which is how it got shipped in the first place.
 */
describe('what a raised hand is holding', () => {
  const cases = [
    { name: 'shield', drawing: shield, arm: 'cheerArmBack', held: 'heldUprightBack', grip: 'gripFar', shoulder: 'shoulderFar' },
    { name: 'spellbook', drawing: spellbook, arm: 'cheerArmBack', held: 'heldUprightBack', grip: 'gripFar', shoulder: 'shoulderFar' },
    { name: 'sword', drawing: sword, arm: 'cheerArmFront', held: 'heldUprightFront', grip: 'grip', shoulder: 'shoulderNear' }
  ] as const;

  it('stays inside the frame through every stop of the cheer', () => {
    const { anchors } = rigFor('adventurer');
    for (const { name, drawing, arm, held, grip, shoulder } of cases) {
      const armAngles = anglesByStop(arm);
      const heldAngles = anglesByStop(held);
      expect(armAngles.size, `${arm} has no rotations`).toBeGreaterThan(0);

      for (const [stop, armDegrees] of armAngles) {
        const heldDegrees = heldAngles.get(stop);
        expect(heldDegrees, `${held} has no stop at ${stop}%`).toBeDefined();
        for (const corner of cornersOf(drawing())) {
          const inHand = rotate(corner, anchors[grip], heldDegrees!);
          const [x, y] = rotate(inHand, anchors[shoulder], armDegrees);
          expect(x, `${name} at ${stop}% reaches x ${x.toFixed(1)}`).toBeGreaterThanOrEqual(0);
          expect(x, `${name} at ${stop}% reaches x ${x.toFixed(1)}`).toBeLessThanOrEqual(FULL_BODY_GRID);
          expect(y, `${name} at ${stop}% reaches y ${y.toFixed(1)}`).toBeGreaterThanOrEqual(0);
          expect(y, `${name} at ${stop}% reaches y ${y.toFixed(1)}`).toBeLessThanOrEqual(FULL_BODY_GRID);
        }
      }
    }
  });

  it('turns the far hand about the far wrist, and the near hand about the near one', () => {
    // The defect itself, stated as the rule that prevents it. Both fall back to the plain frame's
    // two wrists, which are mirror images at 15 and 33.
    expect(poseStyles).toContain('.held   { transform-origin: var(--rig-grip-x, 15px) var(--rig-grip-y, 29px); }');
    expect(poseStyles).toContain('.backArm .held { transform-origin: var(--rig-grip-far-x, 33px) var(--rig-grip-far-y, 29px); }');
    // Order matters: the far rule has to come after the general one to win on the far arm.
    expect(poseStyles.indexOf('.backArm .held {')).toBeGreaterThan(poseStyles.indexOf('.held   {'));
  });

  it('mirrors the far wrist when a costume moves the near one', () => {
    // Three costumes reposition the near grip and none of them was going to remember the mirror.
    for (const id of ['artist', 'musician', 'arcaneMage'] as const) {
      const { grip, gripFar } = rigFor(id).anchors;
      expect(gripFar[0], id).toBeCloseTo(48 - grip[0], 6);
      expect(gripFar[1], id).toBe(grip[1]);
    }
  });
});

/*
 * And whether two characters are actually two characters.
 *
 * A signature compares *which parts* two avatars are built from, and cannot see that two different
 * parts happen to cut the same outline. Measuring the outline can.
 */
describe('the silhouette footprint', () => {
  const plain = footprintFor('student');

  it('is zero from a figure to itself, and symmetric between two', () => {
    expect(footprintDistance(plain, plain)).toBe(0);
    const bear = footprintFor('bear');
    expect(footprintDistance(plain, bear)).toBeCloseTo(footprintDistance(bear, plain), 10);
  });

  it('draws its line at the distance the brief names', () => {
    expect(SILHOUETTE_MIN_DISTANCE).toBe(0.45);
  });

  it('scores a fairy and a bear as nothing alike', () => {
    // One large difference is enough to tell two outlines apart at a glance, which is why this is
    // Euclidean rather than an average: shoulder width alone separates these two.
    expect(footprintDistance(footprintFor('fairy'), footprintFor('bear'))).toBeGreaterThan(1);
  });

  it('refuses a proposal that lands on top of something already taken', () => {
    const taken = [plain, footprintFor('bear')];
    const recolour: SilhouetteFootprint = { ...plain, headAspectRatio: plain.headAspectRatio + 0.01 };
    expect(isSilhouetteDistinct(recolour, taken)).toBe(false);
    expect(isSilhouetteDistinct(footprintFor('drone'), taken)).toBe(true);
    // A rejection has to be able to say what it collided with.
    expect(nearestFootprint(recolour, taken)?.index).toBe(0);
    expect(nearestFootprint(recolour, [])).toBeNull();
  });

  it('holds the rule for every pair in the set the product ships', () => {
    /*
     * The rule the brief states, which is not simply the distance.
     *
     * Ten of the forty-one are people, and people are the same shape: no honest measurement puts a
     * scholar and a developer a fifth of the whole range apart, and a table forced to say they were
     * would be numbers chosen to pass a test rather than measurements of a drawing.
     *
     * So a pair is distinct when it is far enough apart in the footprint *or* when it differs in the
     * skeleton under it — where the joints are and how the thing stands, which is what the poses
     * turn and what a child reads at forty pixels. A pair that is close in both is a genuine
     * duplicate, and there are none.
     */
    const failures: string[] = [];
    for (let left = 0; left < rigArchetypeIds.length; left += 1) {
      for (let right = left + 1; right < rigArchetypeIds.length; right += 1) {
        const a = rigArchetypeIds[left]!;
        const b = rigArchetypeIds[right]!;
        const verdict = silhouetteVerdict(rigFor(a), rigFor(b));
        if (!verdict.distinct) failures.push(`${a}/${b} at ${verdict.distance.toFixed(3)}`);
      }
    }
    expect(failures, `same shape and same skeleton: ${failures.join(', ')}`).toEqual([]);
  });

  it('separates the families it can separate by outline alone', () => {
    // Across families the outline really does do the work: an animal, a lineage and a chassis are
    // built differently enough that the measurement carries it without falling back on the bones.
    for (const [a, b] of [['wolf', 'fairy'], ['drone', 'bear'], ['astronaut', 'voidStalker']] as const) {
      expect(silhouetteVerdict(rigFor(a), rigFor(b)).reason, `${a}/${b}`).toBe('footprint');
    }
  });
});

/*
 * Turning a head with hair on it.
 *
 * Hair sits *on* a skull rather than being painted onto it, so when the skull turns the mass comes
 * round the near side and the parting moves with it. Without that a profile is a correct side view
 * of a face with a full-face cap still centred over it, and the hair reads as a hat nobody turned.
 */
describe('hair through a whole turn', () => {
  it('carries the crown forward by a fixed fraction of the cap, and not at all from the front', () => {
    const fit = hairFitFor('human');
    expect(crownShift(fit, directionRig('front'))).toBe(0);
    // Twelve percent of the cap's own width, in the direction of the turn. Proportional rather than
    // a fixed number of units, so a shallow animal cut moves by the same fraction of itself.
    expect(crownShift(fit, directionRig('right'))).toBeCloseTo(fit.capWidth * 0.12, 6);
    expect(crownShift(fit, directionRig('left'))).toBeCloseTo(-fit.capWidth * 0.12, 6);
    expect(Math.abs(crownShift(fit, directionRig('three_quarter_left'))))
      .toBeLessThan(Math.abs(crownShift(fit, directionRig('left'))));
  });

  it('moves the whole crown as one group rather than asking each style to remember', () => {
    // Twenty-four styles applying the shift themselves is twenty-four chances for one to forget, and
    // the one that forgot would be a hat sliding off a head.
    const { container } = render(<svg>{hairFor('long', 'human', directionRig('right')).front}</svg>);
    const crown = container.querySelector('[data-part="hairCrown"]');
    expect(crown?.getAttribute('transform')).toMatch(/^translate\(2\.28 0\)$/);
  });

  it('widens the cap rather than sliding it off the skull underneath', () => {
    /*
     * The bald patch, in its second and subtler form.
     *
     * Translating the cap with the crown moved its trailing edge 2.28 units off a skull that had not
     * moved, so every turned head wore a band of lit scalp down its far side — the same fault as
     * before, reintroduced by the fix for a different one. The cap covers the union of where it was
     * and where the turn takes it, so the skull stays covered at every angle.
     */
    const fit = hairFitFor('human');
    const skullWidth = SKULL.right - SKULL.left;
    for (const direction of avatarDirections) {
      const { container } = render(<svg>{hairFor('long', 'human', directionRig(direction)).front}</svg>);
      const covering = [...container.querySelectorAll('rect')].filter((node) => {
        const left = Number(node.getAttribute('x'));
        return left <= SKULL.left && left + Number(node.getAttribute('width')) >= SKULL.right;
      });
      expect(covering.length, `${direction} leaves scalp beside the cap`).toBeGreaterThan(0);
      expect(Number(covering[0]!.getAttribute('width')), direction).toBeGreaterThanOrEqual(skullWidth);
      cleanup();
    }
    expect(fit.capWidth).toBeGreaterThan(skullWidth);
  });

  it('hangs a face lock off the skull rather than off the crown', () => {
    // Given the crown's full travel the far lock walked across the cheek and the near one left the
    // head entirely — a dark stick in the air beside a bald temple.
    const { container } = render(<svg>{hairFor('long', 'human', directionRig('right')).front}</svg>);
    const locks = container.querySelector('polygon')?.parentElement;
    expect(locks?.getAttribute('transform')).toMatch(/^translate\(1\.75 0\)$/);
  });

  it('takes the far lock away once it is behind the head', () => {
    // Past three-quarters it is on the far cheek of a profile, which is not a place hair shows.
    const profile = render(<svg>{hairFor('long', 'human', directionRig('right')).front}</svg>);
    const atProfile = profile.container.querySelectorAll('polygon').length;
    cleanup();
    const quarter = render(<svg>{hairFor('long', 'human', directionRig('three_quarter_right')).front}</svg>);
    expect(quarter.container.querySelectorAll('polygon').length).toBeGreaterThan(atProfile);
  });

  it('tucks the far temple behind the face rather than letting it cross the cheek', () => {
    for (const direction of ['left', 'right', 'three_quarter_left', 'three_quarter_right'] as const) {
      const { container } = render(<svg>{hairFor('long', 'human', directionRig(direction)).side}</svg>);
      const clip = container.querySelector('clipPath');
      expect(clip, `${direction} has no facial clip`).not.toBeNull();
      expect(container.querySelector(`g[clip-path="url(#${clip!.id})"]`), direction).not.toBeNull();
      cleanup();
    }
    // And a front view is exactly the drawing it has always been: nothing clipped, nothing to clip.
    const { container } = render(<svg>{hairFor('long', 'human', directionRig('front')).side}</svg>);
    expect(container.querySelector('clipPath')).toBeNull();
  });

  it('drapes a length over the shoulder instead of hanging it in the air', () => {
    // A ponytail authored for a front view is, seen from the side, a rope hanging beside the figure:
    // the shoulder it should lie on has moved. It gets a lean as well as a slide, because a straight
    // rope is what reads as floating.
    for (const id of ['ponytail', 'twintail', 'long', 'braid']) {
      const { container } = render(<svg>{hairFor(id, 'human', directionRig('left')).back}</svg>);
      const length = container.querySelector('[data-part="hairLength"]');
      expect(length?.getAttribute('transform'), id).toMatch(/translate\(-?[\d.]+ 0\) rotate\(/);
      cleanup();
    }
    const { container } = render(<svg>{hairFor('ponytail', 'human', directionRig('front')).back}</svg>);
    expect(container.querySelector('[data-part="hairLength"]')?.getAttribute('transform')).toBeNull();
  });

  it('leaves no background showing through the skull at any angle, whatever the cut', () => {
    /*
     * The bald patch, measured rather than eyeballed.
     *
     * The back node used to be null for half the styles, which straight on is right and turned is a
     * silhouette with a bite out of it: the skull's outline is narrower than the hair on it, and the
     * strip between the two is background. The mass is unconditional now, sized to the fit rather
     * than to the style, and it has to cover the skull ear to ear in every direction.
     */
    for (const race of races) {
      for (const id of hairStyleIds) {
        for (const direction of avatarDirections) {
          const { container } = render(<svg>{hairFor(id, race, directionRig(direction)).back}</svg>);
          const mass = container.querySelector('[data-part="hairBackMass"]');
          expect(mass, `${race}/${id}/${direction} has no mass behind the skull`).not.toBeNull();
          const covering = [...mass!.querySelectorAll('rect')].filter((node) => {
            const left = Number(node.getAttribute('x'));
            const right = left + Number(node.getAttribute('width'));
            return left <= SKULL.left && right >= SKULL.right;
          });
          expect(covering.length, `${race}/${id}/${direction} leaves a gap at the skull`)
            .toBeGreaterThan(0);
          cleanup();
        }
      }
    }
  });

  it('never mirrors the drawing to make a side of it', () => {
    // The cheap answer, and the one that swaps the parting in a child's hair for somebody else's.
    for (const direction of avatarDirections) {
      const drawing = hairFor('sidepart', 'human', directionRig(direction));
      for (const node of [drawing.back, drawing.side, drawing.front]) {
        const { container } = render(<svg>{node}</svg>);
        expect(container.innerHTML, direction).not.toContain('scale(-');
        cleanup();
      }
    }
  });
});

/*
 * And how much of all this is worth paying for at thirty-two pixels.
 */
describe('the detail a size earns', () => {
  it('drops to compact below the size a micro-stroke stops being visible at', () => {
    expect(COMPACT_DETAIL_BELOW).toBe(48);
    expect(detailForSize(24)).toBe('compact');
    expect(detailForSize(47)).toBe('compact');
    expect(detailForSize(48)).toBe('full');
    expect(detailForSize(176)).toBe('full');
  });

  it('says so on the element, so the stylesheet can switch the effects off', () => {
    const { container: small } = render(<FullBodyAvatar archetype="arcaneMage" size={32} />);
    expect(small.querySelector('svg')?.getAttribute('data-detail')).toBe('compact');
    expect(small.querySelector('svg')?.getAttribute('class')).toMatch(/compact/);

    const { container: large } = render(<FullBodyAvatar archetype="arcaneMage" size={176} />);
    expect(large.querySelector('svg')?.getAttribute('data-detail')).toBe('full');
    expect(large.querySelector('svg')?.getAttribute('class')).not.toMatch(/compact/);
  });

  it('lets a caller ask for the other one, because a size is a hint rather than a rule', () => {
    const { container } = render(<FullBodyAvatar archetype="arcaneMage" size={32} detail="full" />);
    expect(container.querySelector('svg')?.getAttribute('data-detail')).toBe('full');
  });

  it('keeps the figure itself whole: it is the effects that go, not the character', () => {
    const { container } = render(<FullBodyAvatar archetype="arcaneMage" size={32} />);
    for (const part of ['head', 'torso', 'frontArm', 'backArm', 'legs']) {
      expect(container.querySelector(`[data-part="${part}"]`), part).not.toBeNull();
    }
  });
});
