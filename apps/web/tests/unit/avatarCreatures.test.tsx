import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import {
  archetypesInGroup, fullBodyArchetypes, fullBodyArchetypeList, type FullBodyArchetype
} from '../../src/features/avatars/avatarFullBody';
import { creatureSpecs, creatureIdOfArchetype } from '../../src/features/avatars/avatarCreatures';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { traits, traitsForLayer, wardrobeCombinations } from '../../src/features/avatars/avatarTraits';
import type { AvatarConfigV2, LayerType } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

/*
 * The animals that are animals.
 *
 * The set had nine beasts and every one of them was a child with ears on: same skull, same two arms,
 * same trousers. A school looking at that sees one figure in nine hats, which is what it told us.
 * These nine are four-legged bodies, and what is worth testing about them is exactly the two things
 * that were wrong before — that they are not people, and that no two of them are each other.
 */

const creatureIds = Object.keys(creatureSpecs)
  .map((id) => `${id}Beast` as FullBodyArchetype);

function configFor(archetype: FullBodyArchetype, layers: Partial<Record<LayerType, string>> = {}): AvatarConfigV2 {
  return {
    archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
    v: 2, race: 'beastfolk', bodyArchetype: archetype, layers
  };
}

describe('the creatures', () => {
  it('adds nine of them, and each one is a four-legged body', () => {
    expect(creatureIds).toHaveLength(9);
    for (const id of creatureIds) {
      const archetype = fullBodyArchetypes[id];
      expect(archetype, id).toBeTruthy();
      expect(archetype.body.quadruped, `${id} is not marked as four-legged`).toBe(true);
      expect(archetype.group, id).toBe('beast');
    }
  });

  it('draws every part a pose reaches for', () => {
    /*
     * The four the compositor animates, plus the body and the head. A creature's forelegs carry the
     * arm classes — that pairing is a trot — so a figure missing them would stand still through half
     * of every pose.
     */
    for (const id of creatureIds) {
      const { container } = render(<FullBodyAvatar archetype={id} />);
      for (const part of ['head', 'face', 'torso', 'frontArm', 'backArm', 'frontLeg', 'backLeg', 'legs', 'tail']) {
        expect(container.querySelector(`[data-part="${part}"]`), `${id} has no ${part}`).not.toBeNull();
      }
      cleanup();
    }
  });

  it('refuses the clothes a person wears', () => {
    /*
     * The whole point. Handing an animal the garment drawers is what produced a cat standing on two
     * legs in a school shirt — so a creature's slot map has no torso, no legs and no arms in it at
     * all, whatever the child last had their person wearing.
     */
    const dressed = configFor('catBeast', {
      top_clothing: 'top_uniform',
      bottom_clothing: 'bottom_trousers',
      footwear: 'foot_trainer',
      handwear: 'hand_longglove'
    });
    const slots = figureSlotsFor(dressed);
    expect(slots.torso_body, 'a cat in a shirt').toBeUndefined();
    expect(slots.legs_feet, 'a cat in trousers').toBeUndefined();
    expect(slots.back_arm, 'a cat with arms').toBeUndefined();
  });

  it('takes everything that goes on a head, a neck, a back or a mouth', () => {
    // Most of the wardrobe still fits, which is why a creature needed no wardrobe of its own.
    const worn = figureSlotsFor(configFor('dogBeast', {
      hair_headpiece: 'hair_short__wizardhat',
      neckwear: 'neck_bellcollar',
      back_accessory: 'back_cape',
      front_accessory: 'front_book',
      back_aura: 'aura_star'
    }));
    expect(worn.headwear, 'a hat').toBeTruthy();
    expect(worn.hair_side, 'a collar').toBeTruthy();
    expect(worn.back_gear, 'a cape').toBeTruthy();
    expect(worn.front_arm_weapon, 'something carried').toBeTruthy();
    expect(worn.overlay_fx, 'an aura').toBeTruthy();
  });

  it('keeps the tail when a cape is worn over it', () => {
    // Both are back gear and the wardrobe hands over one slot, so a chosen cape used to take the
    // animal's tail off with it.
    const caped = figureSlotsFor(configFor('catBeast', { back_accessory: 'back_cape' }));
    const markup = JSON.stringify(caped.back_gear);
    expect(markup).toContain('tail');
  });

  it('gives no two species the same outline', () => {
    /*
     * Colour is not a difference: the complaint was a category that read as one figure with the
     * palette changed, and every creature here recolours from the same four swatches. So the shape
     * fields are what have to differ, and two species sharing five of six is two species sharing a
     * silhouette.
     */
    const seen = new Map<string, string>();
    for (const [id, spec] of Object.entries(creatureSpecs)) {
      const shape = [spec.skull, spec.ear, spec.muzzle, spec.build, spec.tail].join('|');
      expect(seen.get(shape), `${id} is drawn like ${seen.get(shape)}`).toBeUndefined();
      seen.set(shape, id);
    }
  });

  it('answers which creature a character is, and says no for everybody else', () => {
    expect(creatureIdOfArchetype('lionBeast')).toBe('lion');
    expect(creatureIdOfArchetype('student')).toBeNull();
    expect(creatureIdOfArchetype('cat'), 'the half-cat is not a cat').toBeNull();
    expect(creatureIdOfArchetype(null)).toBeNull();
  });

  it('leaves the half-animals their own names', () => {
    // Two characters called น้องแมว in one picker is a picker nobody can use. The costume is named
    // for what it is; the animal keeps the animal's name.
    const names = fullBodyArchetypeList.map((archetype) => archetype.name);
    expect(new Set(names).size, 'two figures share a name').toBe(names.length);
    expect(fullBodyArchetypes.cat.name).toBe('เด็กหูแมว');
    expect(fullBodyArchetypes.catBeast.name).toBe('น้องแมว');
  });

  it('files them where a child looks for an animal', () => {
    expect(archetypesInGroup('beast').length).toBe(22);
  });
});

describe('changing one thing without changing the character', () => {
  it('offers an empty row in every drawer a thing can be taken out of', () => {
    /*
     * The unequip strip under the stage writes the empty id of a slot, and an id that is not in the
     * table would be a chip that takes something off and leaves a broken build behind.
     */
    const removable: Array<[LayerType, string]> = [
      ['front_accessory', 'front_none'],
      ['back_accessory', 'back_none'],
      ['outerwear', 'outer_none'],
      ['neckwear', 'neck_none'],
      ['handwear', 'hand_none'],
      ['footwear', 'foot_none'],
      ['back_aura', 'aura_none'],
      ['front_fx', 'fx_none']
    ];
    for (const [layer, empty] of removable) {
      expect(traits.some((trait) => trait.id === empty), `${layer} has no empty row`).toBe(true);
      expect(traitsForLayer(layer).some((trait) => trait.id === empty), `${empty} is not in ${layer}`).toBe(true);
    }
  });

  it('counts more builds than anybody will ever wear', () => {
    // The school asked for a thousand. The drawers multiply to a great deal more than that, and the
    // number on the screen is computed from the tables rather than typed.
    expect(wardrobeCombinations()).toBeGreaterThan(1000);
  });
});
