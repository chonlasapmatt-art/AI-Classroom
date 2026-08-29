import { describe, expect, it } from 'vitest';
import {
  AVATAR_VARIANT_COUNT, avatarAccessories, avatarAnimations, avatarBadges, avatarPalettes, avatarThemes,
  configFromIndex, hairStyles, resolveAvatar, skinTones, themeById
} from '../../src/features/avatars/avatarThemes';

describe('avatar catalogue', () => {
  it('offers more than one hundred distinct looks', () => {
    expect(AVATAR_VARIANT_COUNT).toBeGreaterThan(100);
    expect(AVATAR_VARIANT_COUNT).toBe(
      avatarThemes.length * avatarPalettes.length * skinTones.length * hairStyles.length * avatarAccessories.length * avatarBadges.length
    );
  });

  it('keeps every theme id unique', () => {
    expect(new Set(avatarThemes.map((theme) => theme.id)).size).toBe(avatarThemes.length);
  });

  it('covers the animation states the classroom screens use', () => {
    expect(avatarAnimations).toEqual(['idle', 'blink', 'wave', 'study', 'celebrate']);
  });

  it('resolves a stable identity for the same avatar index', () => {
    const first = resolveAvatar(42);
    const second = resolveAvatar(42);
    expect(first.theme.id).toBe(second.theme.id);
    expect(first.skinTone).toBe(second.skinTone);
    expect(first.hair.id).toBe(second.hair.id);
  });

  it('lets a saved config override the index-derived look', () => {
    const custom = { archetype: 3, palette: 2, skinTone: 5, hair: 4, accessory: 6, badge: 1 };
    const identity = resolveAvatar(0, custom);
    expect(identity.theme).toBe(avatarThemes[3]);
    expect(identity.skinTone).toBe(skinTones[5]);
    expect(identity.hair).toBe(hairStyles[4]);
    expect(identity.accessory).toBe(avatarAccessories[6]);
    expect(identity.badge).toBe(avatarBadges[1]);
  });

  it('handles negative, fractional and out-of-range parts without leaving the catalogue', () => {
    for (const index of [-13, -1, 0, 7.9, 1000]) {
      const identity = resolveAvatar(index);
      expect(avatarThemes).toContain(identity.theme);
      expect(skinTones).toContain(identity.skinTone as never);
    }
    const identity = resolveAvatar(0, { archetype: 99, palette: -4, skinTone: 42, hair: -7, accessory: 33, badge: 12 });
    expect(avatarThemes).toContain(identity.theme);
    expect(hairStyles).toContain(identity.hair);
    expect(avatarAccessories).toContain(identity.accessory);
  });

  it('spreads consecutive indexes across every theme', () => {
    const themes = new Set(Array.from({ length: avatarThemes.length }, (_, index) => configFromIndex(index).archetype));
    expect(themes.size).toBe(avatarThemes.length);
  });

  it('resolves a theme by id', () => {
    expect(themeById('musician').name).toBe('นักดนตรี');
  });
});
