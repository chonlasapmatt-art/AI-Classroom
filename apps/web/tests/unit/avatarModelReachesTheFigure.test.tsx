// Picking a character has to change the character.
//
// There were forty-one to choose between — น้องแมว, มังกรน้ำแข็ง, หุ่นยนต์ — and choosing one changed
// almost nothing you could see. The wardrobe drew a complete human over whatever had been picked:
// its head, its face, its torso, its legs and its arms, every time, whether or not the child had
// chosen anything in those drawers. All that survived of the character was the handful of slots the
// wardrobe happened to leave empty, which is why picking a cat produced a person with a tail, and
// why the same cap sat on a muzzle, a beak and a manufactured head alike.
//
// The rule these hold: the character says what the body is, the wardrobe says what is worn on it,
// and an empty drawer leaves the character's own.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import {
  archetypeBodyFor, fullBodyArchetypeList, plainBody, type FullBodyArchetype
} from '../../src/features/avatars/avatarFullBody';
import type { AvatarConfigV2 } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

/** What a child has on after opening the customiser once: the plainest thing in each drawer. */
const dressed = (bodyArchetype: FullBodyArchetype): AvatarConfigV2 => ({
  archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2, bodyArchetype,
  layers: {
    hair_headpiece: 'hair_short', face_features: 'face_neutral',
    top_clothing: 'top_uniform', bottom_clothing: 'bottom_trousers'
  }
});

const partsOf = (config: AvatarConfigV2) => {
  const { container } = render(
    <FullBodyAvatar archetype={config.bodyArchetype!} slots={figureSlotsFor(config)} />
  );
  return [...container.querySelectorAll('[data-part]')].map((node) => node.getAttribute('data-part'));
};

describe('the character a child picks', () => {
  it('keeps its ears and its snout under a full set of clothes', () => {
    // The wardrobe dresses the body; it does not replace it. A cat in school uniform is still a cat.
    const eared = fullBodyArchetypeList.filter((one) => archetypeBodyFor(one.id).ears !== 'none');
    expect(eared.length, 'no character in the catalogue has ears').toBeGreaterThan(4);

    for (const one of eared) {
      const parts = partsOf(dressed(one.id));
      expect(parts, `${one.id} loses its ears once dressed`).toContain('ears');
      // And they are over the hair rather than under it: a cap that buries an ear is the fault this
      // whole pipeline exists to prevent, and it is invisible to anything that only counts parts.
      expect(parts.indexOf('hair'), `${one.id} wears its ears under its hair`)
        .toBeLessThan(parts.lastIndexOf('ears'));
      cleanup();
    }
  });

  it('fits a chosen haircut to the head it is going on', () => {
    // A cut is authored against a fit and never scaled to a skull. The wardrobe used to read the
    // race field, which is `human` for everybody who has not touched it.
    const muzzled = fullBodyArchetypeList.filter((one) => archetypeBodyFor(one.id).snout !== 'none');
    expect(muzzled.length, 'no character in the catalogue has a snout').toBeGreaterThan(2);
    for (const one of muzzled) {
      expect(archetypeBodyFor(one.id).hairRace, `${one.id} takes the human cap`).not.toBe('human');
    }
  });

  it('keeps its own head covering when the child has put nothing on it', () => {
    /*
     * A helm, a visor, a pair of horns: the wardrobe used to fill this slot with an empty group
     * whatever was underneath, so an ice dragon arrived bare-headed. Nothing chosen now means the
     * slot is not in the map at all and the character's own drawing stands.
     */
    const bare: AvatarConfigV2 = {
      archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2,
      bodyArchetype: 'iceDragon', layers: { top_clothing: 'top_uniform' }
    };
    expect(figureSlotsFor(bare).headwear, 'an empty drawer still filled the slot').toBeUndefined();
    expect(partsOf(bare)).toContain('headwear');
  });

  it('keeps its own body when the child has chosen no clothes', () => {
    // A robot chassis, a drone's hull and a penguin's body are the character rather than an outfit,
    // and every one of them used to come out wearing the same school shirt.
    const nothingOn: AvatarConfigV2 = {
      archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2,
      bodyArchetype: 'robotChassis', layers: { face_features: 'face_neutral' }
    };
    const slots = figureSlotsFor(nothingOn);
    expect(slots.torso_body, 'a shirt was drawn over the chassis').toBeUndefined();
    expect(slots.legs_feet, 'trousers were drawn over the chassis').toBeUndefined();
    // The figure is still whole: the character supplies what the wardrobe did not.
    for (const part of ['torso', 'legs', 'head']) {
      expect(partsOf(nothingOn), `${part} is missing from an undressed figure`).toContain(part);
    }
  });

  it('still draws a whole person for a saved avatar that names no character at all', () => {
    // Most saved records predate bodies entirely. They resolve through their race to a character,
    // and a plain human frame is what they were always drawn as.
    const old: AvatarConfigV2 = {
      archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2,
      layers: { top_clothing: 'top_uniform', hair_headpiece: 'hair_short' }
    };
    expect(archetypeBodyFor(undefined)).toEqual(plainBody);
    const { container } = render(<FullBodyAvatar archetype="student" slots={figureSlotsFor(old)} />);
    for (const part of ['head', 'torso', 'legs', 'hair']) {
      expect(
        container.querySelector(`[data-part="${part}"]`), `an old record has no ${part}`
      ).not.toBeNull();
    }
  });

  it('lets an explicit race override the character, because that is a choice too', () => {
    // The race chips predate the forty-one and a child may have used them. A race that is not the
    // default is something the child said; `human` is the absence of a statement, not a statement.
    const dragonInHumanClothes: AvatarConfigV2 = {
      ...dressed('student'), race: 'beastfolk'
    };
    expect(partsOf(dragonInHumanClothes)).toContain('ears');
  });
});
