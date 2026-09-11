import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { hairFor, hairStyleIds } from '../../src/features/avatars/avatarHair';
import { bodySlotOrder, fullBodyArchetypeList } from '../../src/features/avatars/avatarFullBody';
import { avatarDirections, directionRig, faceCentre } from '../../src/features/avatars/avatarDirection';
import { SKULL } from '../../src/features/avatars/avatarGeometry';
import {
  changedAnchorGroups, distinctFrom, DUPLICATE_THRESHOLD, isAcceptableReroll, isTooSimilar,
  signatureOf, signatureOverlap
} from '../../src/features/avatars/avatarIdentity';
import type { AvatarConfigV2, AvatarRace } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const poseStyles = readFileSync(
  resolve(here, '../../src/features/avatars/FullBodyAvatar.module.css'), 'utf8');

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];

function config(race: AvatarRace, hair: string, extra: Record<string, string> = {}): AvatarConfigV2 {
  return {
    archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
    v: 2, race, layers: { hair_headpiece: `hair_${hair}`, face_features: 'face_smile', ...extra }
  };
}

/*
 * Turning the figure round.
 *
 * The cheap version of this is `transform: scaleX(-1)` on the root, and it is wrong in three ways
 * that all show at once: the parting in the hair swaps sides, so a child's avatar becomes a
 * different child; anything with a number on it reads backwards; and the near arm, which is drawn in
 * front of the body and pivots from the near shoulder, becomes the far arm without its depth order
 * changing — so the figure's hand goes behind its own chest.
 *
 * A direction here is a re-composition: the face moves the width of the turn, the ears slide behind
 * the skull, the near limb changes which side it is, and the back view has no face at all.
 */
describe('which way the figure is facing', () => {
  it('offers six directions and opens on the front', () => {
    expect(avatarDirections).toEqual([
      'front', 'three_quarter_left', 'left', 'three_quarter_right', 'right', 'back'
    ]);
    const { container } = render(<FullBodyAvatar archetype="student" />);
    expect(container.querySelector('svg')?.getAttribute('data-direction')).toBe('front');
  });

  it('never mirrors the whole drawing to make a side view', () => {
    // The one thing this must not be. A keyframe cannot do it either — that was the run cycle
    // turning the character round twice a second.
    expect(poseStyles).not.toMatch(/scaleX\(-/);
    expect(poseStyles).not.toMatch(/scale\(-/);
    for (const direction of avatarDirections) {
      const { container } = render(<FullBodyAvatar archetype="student" direction={direction} />);
      const root = container.querySelector('svg > g');
      expect(root?.getAttribute('transform') ?? '', direction).not.toContain('scale(-1');
      cleanup();
    }
  });

  it('moves the features across the skull rather than off it', () => {
    for (const direction of avatarDirections) {
      const centre = faceCentre(directionRig(direction));
      // Inside the skull at every angle: a face that leaves it is a face slid sideways, which is
      // what a mirror looks like when it is applied to one layer instead of the whole drawing.
      expect(centre, direction).toBeGreaterThanOrEqual(SKULL.left + 2);
      expect(centre, direction).toBeLessThanOrEqual(SKULL.right - 2);
    }
    // And the turn is a real displacement rather than a rounding error.
    expect(Math.abs(faceCentre(directionRig('left')) - SKULL.centre)).toBeGreaterThan(3);
  });

  it('draws no face on the back of a head, and keeps the group so nothing restarts', () => {
    const { container } = render(<FullBodyAvatar archetype="student" direction="back" />);
    const face = container.querySelector('[data-part="face"]');
    expect(face, 'the face group went away entirely').not.toBeNull();
    expect(face?.querySelector('[data-part="eyes"]'), 'a back view with eyes in it').toBeNull();
  });

  it('keeps a face on every direction that is not the back', () => {
    for (const direction of avatarDirections.filter((item) => item !== 'back')) {
      const { container } = render(<FullBodyAvatar archetype="student" direction={direction} />);
      expect(container.querySelector('[data-part="eyes"]'), direction).not.toBeNull();
      cleanup();
    }
  });

  it('leaves no bare skull on a turned head, whatever the hair is', () => {
    /*
     * The bald spot. A cap ends at the hairline and the skull carries on past it, so a profile with
     * nothing following the side of the head shows a band of scalp between the hair and the jaw.
     * Widening the cap does not fix it — a cap wide enough for a profile is a cap over the face from
     * the front — which is why `hair_side` is a step of its own.
     */
    for (const race of races) {
      for (const id of hairStyleIds) {
        for (const direction of avatarDirections) {
          const { side } = hairFor(id, race, directionRig(direction));
          const { container } = render(<svg>{side}</svg>);
          const covering = [...container.querySelectorAll('rect')].filter((node) => {
            const top = Number(node.getAttribute('y'));
            const bottom = top + Number(node.getAttribute('height'));
            /*
             * Starts at or above the hairline and carries on past it.
             *
             * Not "reaches the jaw": a buzz cut in profile really is bare skin below the ear, and a
             * rule that demanded coverage down to the chin would be asking every style to be long.
             * What every style owes is that the hair does not simply stop at the cap's edge, which
             * is the band of scalp a turned head was showing.
             */
            return top <= SKULL.brow && bottom - top >= 3;
          });
          expect(covering.length, `${race}/${id}/${direction} shows bare skull`).toBeGreaterThan(0);
          cleanup();
        }
      }
    }
  });

  it('gives the composed figure all three hair layers and puts them in three steps', () => {
    const slots = figureSlotsFor(config('human', 'long'), directionRig('left'));
    expect(slots.hair_back, 'no length behind the figure').toBeTruthy();
    expect(slots.hair_side, 'no wrap round the ear').toBeTruthy();
    expect(slots.hair_headwear, 'no cap or fringe').toBeTruthy();

    // Behind the body, then over the face's edge, then over the brow. Not one group in one place.
    expect(bodySlotOrder.indexOf('hair_back')).toBeLessThan(bodySlotOrder.indexOf('torso_body'));
    expect(bodySlotOrder.indexOf('face')).toBeLessThan(bodySlotOrder.indexOf('hair_side'));
    expect(bodySlotOrder.indexOf('hair_side')).toBeLessThan(bodySlotOrder.indexOf('hair_headwear'));
  });

  it('builds every costume for the direction it is being seen from', () => {
    // A stored object could only ever hold one direction, which is why the costume is a function of
    // the rig rather than a table of elements.
    for (const archetype of fullBodyArchetypeList) {
      const front = archetype.slots(directionRig('front'));
      const back = archetype.slots(directionRig('back'));
      expect(typeof archetype.slots, archetype.id).toBe('function');
      expect(front.head_neck, archetype.id).toBeTruthy();
      expect(back.head_neck, archetype.id).toBeTruthy();
    }
  });
});

/*
 * And telling two avatars apart.
 *
 * A catalogue built by combining parts will happily produce two entries that differ by a colour and
 * nothing else. A child reads those as the same character listed twice, and the second one takes a
 * slot that could have held something they had not seen.
 */
describe('what makes an avatar a different avatar', () => {
  it('ignores colour, because a recolour is not a character', () => {
    const plain = config('human', 'short');
    const repainted: AvatarConfigV2 = { ...plain, tints: { hair: '#ff0000', primary: '#00ff00' } };
    expect(signatureOf(plain).hash).toBe(signatureOf(repainted).hash);
  });

  it('hashes the same avatar the same way every time', () => {
    // Stable across devices and builds, which rules out anything that walks keys in insertion order.
    const a = config('human', 'short', { top_clothing: 'top_uniform' });
    const b = config('human', 'short', { top_clothing: 'top_uniform' });
    expect(signatureOf(a).hash).toBe(signatureOf(b).hash);
    expect(signatureOf(a).hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('scores two near-identical avatars as near-identical', () => {
    const left = signatureOf(config('human', 'short', { top_clothing: 'top_uniform' }));
    const right = signatureOf(config('human', 'short', { top_clothing: 'top_hoodie' }));
    expect(signatureOverlap(left, right)).toBeGreaterThan(DUPLICATE_THRESHOLD);
    expect(isTooSimilar(left, right)).toBe(true);
  });

  it('scores two genuinely different avatars as different', () => {
    const left = signatureOf(config('human', 'short', { top_clothing: 'top_uniform' }));
    const right = signatureOf(config('robot', 'mohawk', { top_clothing: 'top_techwear' }));
    expect(signatureOverlap(left, right)).toBeLessThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('counts a re-roll only when it has moved two structural groups', () => {
    const before = config('human', 'short', { top_clothing: 'top_uniform' });
    const hairOnly = config('human', 'mohawk', { top_clothing: 'top_uniform' });
    const hairAndClothes = config('human', 'mohawk', { top_clothing: 'top_techwear' });

    expect(changedAnchorGroups(before, hairOnly).size).toBe(1);
    expect(isAcceptableReroll(before, hairOnly), 'one group is a recolour with extra steps').toBe(false);
    expect(isAcceptableReroll(before, hairAndClothes)).toBe(true);
  });

  it('re-rolls until the proposal is distinct, and stops rather than hanging', () => {
    const taken = [signatureOf(config('human', 'short', { top_clothing: 'top_uniform' }))];
    const ladder = [
      config('human', 'short', { top_clothing: 'top_uniform' }),
      config('human', 'short', { top_clothing: 'top_hoodie' }),
      config('robot', 'mohawk', { top_clothing: 'top_techwear' })
    ];
    const picked = distinctFrom(taken, (attempt) => ladder[Math.min(attempt, ladder.length - 1)]!);
    expect(picked.rerolls).toBeGreaterThan(0);
    expect(isTooSimilar(picked.signature, taken[0]!)).toBe(false);

    // A catalogue small enough to exhaust is a real thing. A picker that hangs is worse than one
    // with a near-duplicate in it, so it gives up and returns the least bad it saw.
    const cornered = distinctFrom(taken, () => ladder[0]!, 4);
    expect(cornered.rerolls).toBe(4);
    expect(cornered.config).toBeTruthy();
  });
});
