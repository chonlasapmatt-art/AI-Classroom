import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  configToJson, hexToHsl, hslToHex, isConfigV2, layerOrder, migrateConfig, raceForArchetype,
  shadeOf, shadesFor, tintVariables, type AvatarConfigV2
} from '../../src/features/avatars/avatarSchema';
import { EnhancedPixelAvatar } from '../../src/features/avatars/EnhancedPixelAvatar';
import { resolveLayers, traits, traitById, traitsForLayer } from '../../src/features/avatars/avatarTraits';
import { avatarThemes } from '../../src/features/avatars/avatarThemes';
import type { AvatarConfig } from '../../src/domain/types';

afterEach(cleanup);

const legacy: AvatarConfig = {
  archetype: 1, palette: 3, skinTone: 2, hair: 4, accessory: 5, badge: 1, outfit: 'hoodie'
};

describe('reading a saved avatar as version 2', () => {
  it('keeps every legacy field exactly as it was', () => {
    // Migration describes; it never repaints. Anything that changed here would be a child's avatar
    // changing underneath them.
    const migrated = migrateConfig(legacy);
    for (const [key, value] of Object.entries(legacy)) {
      expect(migrated[key as keyof AvatarConfig], key).toEqual(value);
    }
  });

  it('adds no layers, so the legacy renderer keeps drawing it', () => {
    expect(migrateConfig(legacy).layers).toBeUndefined();
  });

  it('reads the race the old config was already drawing', () => {
    const person = avatarThemes.findIndex((theme) => theme.kind === 'person');
    const animal = avatarThemes.findIndex((theme) => theme.kind === 'animal');
    expect(raceForArchetype(person)).toBe('human');
    expect(raceForArchetype(animal)).toBe('beastfolk');
    // An index from an older build wraps rather than throwing.
    expect(raceForArchetype(999)).toBeTruthy();
    expect(raceForArchetype(-4)).toBeTruthy();
  });

  it('fills the six tints from the colours the avatar already had', () => {
    const tints = migrateConfig(legacy).tints!;
    for (const key of ['skin', 'hair', 'primary', 'secondary', 'accent', 'magic'] as const) {
      expect(tints[key], key).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('tells a version-2 config from a version-1 one', () => {
    expect(isConfigV2(legacy)).toBe(false);
    expect(isConfigV2(null)).toBe(false);
    expect(isConfigV2(migrateConfig(legacy))).toBe(true);
  });
});

describe('what goes into the database', () => {
  it('drops undefined rather than writing null', () => {
    // `avatar_config` is merged into by an RPC a student may call. Fewer shapes it can hold is fewer
    // shapes to validate on the way in.
    // Cast, because the type forbids what JSON does not: a record read back from JSONB can carry an
    // explicit undefined, and dropping it is the behaviour under test.
    const config = {
      ...legacy, v: 2, race: 'demon', element: undefined, tints: { skin: '#f6ddc3', hair: undefined }
    } as unknown as AvatarConfigV2;
    const json = configToJson(config);
    expect('element' in json).toBe(false);
    expect(json.tints).toEqual({ skin: '#f6ddc3' });
  });

  it('survives a round trip through JSON', () => {
    const config = migrateConfig(legacy);
    expect(JSON.parse(JSON.stringify(configToJson(config)))).toEqual(configToJson(config));
  });

  it('drops an object that has nothing left in it', () => {
    const empty = { ...legacy, v: 2, tints: { skin: undefined } } as unknown as AvatarConfigV2;
    expect('tints' in configToJson(empty)).toBe(false);
  });
});

describe('the shade ramp', () => {
  it('round-trips a colour through HSL', () => {
    for (const hex of ['#5b3df5', '#0f766e', '#ffffff', '#000000', '#f6ddc3']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });

  it('darkens and lightens without leaving the hue', () => {
    const base = '#4930d1';
    expect(hexToHsl(shadeOf(base, -1)).l).toBeLessThan(hexToHsl(base).l);
    expect(hexToHsl(shadeOf(base, 1)).l).toBeGreaterThan(hexToHsl(base).l);
    expect(Math.abs(hexToHsl(shadeOf(base, -1)).h - hexToHsl(base).h)).toBeLessThan(0.02);
  });

  it('never runs off either end of the ramp', () => {
    // Black asked to go darker, and white asked to go lighter, both have to stay colours.
    for (const hex of ['#000000', '#ffffff']) {
      for (const step of [-3, -1, 1, 3]) {
        expect(shadeOf(hex, step), `${hex} ${step}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('gives every material four shades and no more', () => {
    const shades = shadesFor('#be185d');
    expect(Object.keys(shades).sort()).toEqual(['base', 'highlight', 'outline', 'shadow']);
    expect(shades.base).toBe('#be185d');
  });

  it('publishes one custom property per tint and shade', () => {
    const variables = tintVariables({ primary: '#5b3df5' });
    expect(variables['--av-primary']).toBe('#5b3df5');
    expect(variables['--av-primary-shadow']).toBeTruthy();
    expect(variables['--av-primary-highlight']).toBeTruthy();
    expect(variables['--av-outline']).toBe('#1a1030');
  });
});

describe('the layer compositor', () => {
  const layered: AvatarConfigV2 = {
    ...legacy, v: 2, race: 'dragonkin',
    layers: { body_base: 'body_dragonkin', face_features: 'face_fangs' }
  };

  it('draws back to front, in the one order there is', () => {
    const drawn = resolveLayers(layered).map(([layer]) => layer);
    const expected = layerOrder.filter((layer) => drawn.includes(layer));
    expect(drawn).toEqual(expected);
  });

  it('gives a config with no layers a body and a face anyway', () => {
    const bare = resolveLayers({ ...legacy, v: 2, race: 'spirit' });
    expect(bare.map(([, id]) => id)).toContain('body_spirit');
    expect(bare.some(([layer]) => layer === 'face_features')).toBe(true);
  });

  it('ignores a trait id it has never heard of rather than drawing nothing', () => {
    // A record written by a newer build reaches an older one. Losing one hat is recoverable;
    // rendering an empty square where a child's avatar was is not.
    const resolved = resolveLayers({ ...layered, layers: { ...layered.layers, hair_headpiece: 'not_a_trait' } });
    expect(resolved.some(([, id]) => id === 'not_a_trait')).toBe(false);
    expect(resolved.some(([, id]) => id === 'body_dragonkin')).toBe(true);
  });

  it('renders each layer once, tagged with what it is', () => {
    const { container } = render(<EnhancedPixelAvatar config={layered} size={64} />);
    const groups = [...container.querySelectorAll('g[data-layer]')];
    expect(groups.length).toBe(resolveLayers(layered).length);
    expect(groups.map((group) => group.getAttribute('data-layer'))).toContain('body_base');
    expect(container.querySelector('[data-trait="face_fangs"]')).toBeTruthy();
  });

  it('sets the palette on the svg rather than on every rectangle', () => {
    const { container } = render(
      <EnhancedPixelAvatar config={{ ...layered, tints: { primary: '#0f766e' } }} size={64} />
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('style')).toContain('--av-primary: #0f766e');
  });

  it('widens the box rather than keeping a second set of drawings for the large preview', () => {
    const { container } = render(<EnhancedPixelAvatar config={layered} size={200} grid={32} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('-4 -4 32 32');
  });
});

describe('the trait tables', () => {
  it('has no two traits sharing an id', () => {
    const ids = traits.map((trait) => trait.id);
    expect(new Set(ids).size, 'duplicate trait id').toBe(ids.length);
  });

  it('names every trait in Thai and files it under a real layer', () => {
    for (const trait of traits) {
      expect(trait.name.trim().length, trait.id).toBeGreaterThan(0);
      expect(layerOrder, trait.id).toContain(trait.layer);
      expect(trait.tags.length, trait.id).toBeGreaterThan(0);
    }
  });

  it('draws every trait without a hard-coded colour that cannot be tinted', () => {
    /*
     * The rule that makes palette-swapping work at all. A literal hex inside a sprite is a colour
     * the customiser's picker cannot reach, so the avatar comes out half-recoloured — and it is
     * invisible until somebody picks the one shirt that does not change.
     * White and the shared outline are the two allowed literals: teeth and lines are not tinted.
     */
    const allowed = new Set(['#ffffff', '#1a1030']);
    for (const trait of traits) {
      const { container } = render(<svg>{trait.draw()}</svg>);
      for (const rect of container.querySelectorAll('rect')) {
        const fill = rect.getAttribute('fill') ?? '';
        const ok = fill.startsWith('var(--av-') || allowed.has(fill.toLowerCase());
        expect(ok, `${trait.id} fill="${fill}"`).toBe(true);
      }
      cleanup();
    }
  });

  it('keeps every drawing on the grid', () => {
    for (const trait of traits) {
      const { container } = render(<svg>{trait.draw()}</svg>);
      for (const rect of container.querySelectorAll('rect')) {
        const x = Number(rect.getAttribute('x'));
        const y = Number(rect.getAttribute('y'));
        const right = x + Number(rect.getAttribute('width'));
        const bottom = y + Number(rect.getAttribute('height'));
        expect(Math.min(x, y), trait.id).toBeGreaterThanOrEqual(-4);
        expect(Math.max(right, bottom), trait.id).toBeLessThanOrEqual(28);
        // Half-unit precision at the finest: anything else is drawn between two pixels.
        for (const value of [x, y, right, bottom]) {
          expect(Math.abs(value * 2 - Math.round(value * 2)) < 1e-9, `${trait.id} ${value}`).toBe(true);
        }
      }
      cleanup();
    }
  });

  it('offers a body for every race', () => {
    for (const race of ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'] as const) {
      expect(traitsForLayer('body_base', race).length, race).toBeGreaterThan(0);
    }
  });

  it('finds a trait by id and refuses one that does not exist', () => {
    expect(traitById('body_human')?.layer).toBe('body_base');
    expect(traitById('nope')).toBeNull();
    expect(traitById(undefined)).toBeNull();
  });
});
