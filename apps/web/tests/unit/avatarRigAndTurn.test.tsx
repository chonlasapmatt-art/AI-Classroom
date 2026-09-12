import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import { fullBodyArchetypeList } from '../../src/features/avatars/avatarFullBody';
import {
  footprintDistance, footprintFor, isSilhouetteDistinct, nearestFootprint, rigArchetypeIds, rigFor,
  rigVariables, silhouetteVerdict, skeletonSignature, SILHOUETTE_MIN_DISTANCE,
  type SilhouetteFootprint
} from '../../src/features/avatars/avatarRig';
import { avatarDirections, directionRig } from '../../src/features/avatars/avatarDirection';
import { crownShift, hairFitFor, hairFor, hairStyleIds } from '../../src/features/avatars/avatarHair';
import { COMPACT_DETAIL_BELOW, detailForSize, SKULL } from '../../src/features/avatars/avatarGeometry';
import type { AvatarRace } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];

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
    const crown = container.querySelector('[data-part="hair"]');
    expect(crown?.getAttribute('transform')).toMatch(/^translate\(2\.28 0\)$/);
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
