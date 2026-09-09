import { describe, expect, it } from 'vitest';
import {
  AVATAR_CATALOG_SIZE, avatarById, avatarCatalog, avatarCategoryLabels, catalogSignature,
  LEGACY_CATALOG_SIZE, searchAvatars, type AvatarCategory
} from '../../src/features/avatars/avatarCatalog';
import { generatedAvatars, GENERATED_COUNT } from '../../src/features/avatars/avatarGenerated';
import { traitById } from '../../src/features/avatars/avatarTraits';
import type { AvatarConfigV2 } from '../../src/features/avatars/avatarSchema';

/*
 * A catalogue of a thousand, and the three things that would make it worthless.
 *
 * An id that moves — a record stores `avatar_384` and nothing else, so if index 383 ever means a
 * different drawing, a child's avatar changes without anybody touching it.
 *
 * A duplicate — a person scrolling past the same face four times concludes there are not really a
 * thousand, and they are right to.
 *
 * An empty filter — a chip labelled "มังกร" that shows nothing is worse than no chip at all.
 */
describe('the generated half of the catalogue', () => {
  it('appends, and never renumbers what was already there', () => {
    expect(avatarCatalog).toHaveLength(AVATAR_CATALOG_SIZE);
    expect(AVATAR_CATALOG_SIZE).toBeGreaterThanOrEqual(900);
    expect(avatarCatalog[0]!.id).toBe('avatar_001');
    expect(avatarCatalog[LEGACY_CATALOG_SIZE - 1]!.id).toBe('avatar_160');
    expect(avatarCatalog[LEGACY_CATALOG_SIZE]!.id).toBe('avatar_161');
    expect(avatarCatalog.at(-1)!.id).toBe(`avatar_${String(AVATAR_CATALOG_SIZE).padStart(3, '0')}`);
  });

  it('leaves the original hundred and sixty as flat configs', () => {
    // They are what children are already wearing, and the legacy renderer draws them. A layered
    // config in this range would quietly repaint somebody.
    for (const avatar of avatarCatalog.slice(0, LEGACY_CATALOG_SIZE)) {
      expect((avatar.config as AvatarConfigV2).layers, avatar.id).toBeUndefined();
    }
  });

  it('builds the same avatar from the same index every time', () => {
    // Nothing in the generator may read a clock or a random seed: an id is stored, so index 384 has
    // to mean one thing next term and on every device.
    const first = generatedAvatars.map((avatar) => `${avatar.name}|${JSON.stringify(avatar.config)}`);
    const second = generatedAvatars.map((avatar) => `${avatar.name}|${JSON.stringify(avatar.config)}`);
    expect(first).toEqual(second);
    expect(generatedAvatars).toHaveLength(GENERATED_COUNT);
  });

  it('never draws the same avatar twice', () => {
    const signatures = avatarCatalog.map(catalogSignature);
    expect(new Set(signatures).size).toBe(AVATAR_CATALOG_SIZE);
  });

  it('names every one of them in Thai, and does not repeat a name', () => {
    for (const avatar of avatarCatalog.slice(LEGACY_CATALOG_SIZE)) {
      expect(/[฀-๿]/.test(avatar.name), avatar.id).toBe(true);
    }
    const names = avatarCatalog.slice(LEGACY_CATALOG_SIZE).map((avatar) => avatar.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('points every layer at a trait that exists', () => {
    // A config naming a trait the tables do not have renders a hole where a hat should be.
    for (const avatar of generatedAvatars) {
      for (const [layer, id] of Object.entries(avatar.config.layers ?? {})) {
        expect(traitById(id), `${avatar.index} ${layer}=${id}`).not.toBeNull();
      }
    }
  });

  it('gives every one of them the six colours', () => {
    for (const avatar of generatedAvatars) {
      for (const key of ['skin', 'hair', 'primary', 'secondary', 'accent', 'magic'] as const) {
        expect(avatar.config.tints?.[key], `${avatar.index} ${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('the chips along the top', () => {
  it('has something behind every one of them', () => {
    for (const category of Object.keys(avatarCategoryLabels) as AvatarCategory[]) {
      expect(searchAvatars('', category).length, category).toBeGreaterThan(0);
    }
  });

  it('labels every category in Thai', () => {
    for (const [category, label] of Object.entries(avatarCategoryLabels)) {
      expect(/[฀-๿]/.test(label), category).toBe(true);
    }
  });

  it('fills the fantasy chips from the generated half', () => {
    // The point of generating them: a school opening "มังกร" should find dragons, not one dragon.
    for (const category of ['dragon', 'demon', 'mage', 'spirit', 'robot', 'techwear'] as const) {
      expect(searchAvatars('', category).length, category).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('finding one of a thousand', () => {
  it('still finds an avatar by its id', () => {
    expect(searchAvatars('avatar_007')).toHaveLength(1);
    expect(avatarById('avatar_900')?.id).toBe('avatar_900');
  });

  it('finds characters by what they are, in either language', () => {
    expect(searchAvatars('มังกร').length).toBeGreaterThan(0);
    expect(searchAvatars('dragon').length).toBeGreaterThan(0);
    expect(searchAvatars('จอมเวทย์').length).toBeGreaterThan(0);
  });

  it('returns everything when nothing is asked', () => {
    expect(searchAvatars('', 'all')).toHaveLength(AVATAR_CATALOG_SIZE);
  });
});
