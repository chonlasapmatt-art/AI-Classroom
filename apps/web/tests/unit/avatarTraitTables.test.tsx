import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { traitCounts, traits, traitsForLayer } from '../../src/features/avatars/avatarTraits';
import { layerOrder, type LayerType } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

/*
 * What the drawers have to hold, and why the numbers are checked rather than claimed.
 *
 * The customiser prints these counts on screen — "50+ styles", "100+ items" — and a number typed
 * beside a list stops being true the first time somebody edits the list. So the screen computes them
 * from the tables and this fails if a table ever falls below what the screen promises.
 *
 * The counts come from composition: twelve hair shapes and six things worn on the head are seventy-
 * two hairstyles, each with its own id and its own drawing. That is a real seventy-two — every one
 * renders differently and can be saved — rather than one drawing shown seventy-two times.
 */
const minimums: Partial<Record<LayerType, number>> = {
  hair_headpiece: 50,
  face_features: 100,
  top_clothing: 25,
  bottom_clothing: 6
};

describe('the size of each drawer', () => {
  it('meets the minimum the customiser advertises', () => {
    const counts = traitCounts();
    for (const [layer, minimum] of Object.entries(minimums)) {
      expect(counts[layer as LayerType], layer).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('multiplies tops by bottoms into at least 150 outfits', () => {
    // The reason clothes are two layers rather than one: 25 drawings and 6 drawings are 150 outfits.
    const counts = traitCounts();
    expect(counts.top_clothing * counts.bottom_clothing).toBeGreaterThanOrEqual(150);
  });

  it('offers at least 40 things to wear that are not clothes', () => {
    // Wings, tails, capes, auras, held items, pets, halos. The empty row of each table is an option
    // rather than an item, so it does not count towards what a person can put on.
    const worn = traits.filter((trait) =>
      ['back_accessory', 'front_accessory', 'back_aura', 'front_fx'].includes(trait.layer)
      || (trait.layer === 'hair_headpiece' && trait.id.includes('__')));
    const items = worn.filter((trait) => !trait.tags.includes('none'));
    expect(new Set(items.map((trait) => trait.name.split(' · ').pop())).size).toBeGreaterThanOrEqual(40);
  });

  it('fills every layer', () => {
    const counts = traitCounts();
    for (const layer of layerOrder) expect(counts[layer], layer).toBeGreaterThan(0);
  });
});

describe('what every trait owes', () => {
  it('has an id nobody else has', () => {
    const ids = traits.map((trait) => trait.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws something, unless it is the option to wear nothing', () => {
    for (const trait of traits) {
      const { container } = render(<svg>{trait.draw()}</svg>);
      const rects = container.querySelectorAll('rect').length;
      if (trait.tags.includes('none')) expect(rects, trait.id).toBe(0);
      else expect(rects, trait.id).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('is named in Thai', () => {
    for (const trait of traits) {
      expect(/[฀-๿]/.test(trait.name), `${trait.id} · ${trait.name}`).toBe(true);
    }
  });

  it('says which colours reach it', () => {
    // The colour drawer offers exactly these, so a trait that lists none is a trait whose swatches
    // do nothing when a person taps them.
    for (const trait of traits) {
      if (trait.tags.includes('none')) continue;
      expect(trait.tintable.length, trait.id).toBeGreaterThan(0);
    }
  });
});

describe('what a new student can wear on the first day', () => {
  it('leaves every layer with a free option', () => {
    /*
     * Half the fantasy traits cost points, which is the point of earning them. The other half must
     * be free in every drawer, or a child who has just joined opens the customiser and finds a wall
     * of padlocks — dressed wrong by default, through no fault of their own.
     */
    for (const layer of layerOrder) {
      const free = traitsForLayer(layer).filter((trait) => !trait.price);
      expect(free.length, layer).toBeGreaterThan(0);
    }
  });

  it('charges for a fair share of the fantasy, and never for a plain uniform', () => {
    const priced = traits.filter((trait) => (trait.price ?? 0) > 0);
    expect(priced.length).toBeGreaterThan(40);
    for (const trait of priced) {
      expect(trait.price, trait.id).toBeGreaterThanOrEqual(20);
      expect(trait.price, trait.id).toBeLessThanOrEqual(400);
    }
    // The school uniform is what a student wears when they have earned nothing yet.
    expect(traits.find((trait) => trait.id === 'top_uniform')?.price).toBeUndefined();
  });
});

describe('the races', () => {
  it('gives each of them a body of its own', () => {
    for (const race of ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'] as const) {
      expect(traitsForLayer('body_base', race).length, race).toBe(1);
    }
  });

  it('lets any race wear any of the clothes', () => {
    // A hoodie does not care what is wearing it, and a table that had to be filtered per race would
    // be six tables that drift apart.
    for (const layer of ['top_clothing', 'bottom_clothing', 'hair_headpiece', 'face_features'] as const) {
      expect(traitsForLayer(layer, 'dragonkin').length).toBe(traitsForLayer(layer).length);
    }
  });
});
