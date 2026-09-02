import { describe, expect, it } from 'vitest';
import {
  AVATAR_CATALOG_SIZE, avatarById, avatarCatalog, configForAvatarId, initialsFor, isValidAvatarId, searchAvatars
} from '../../src/features/avatars/avatarCatalog';
import { resolveAvatar } from '../../src/features/avatars/avatarThemes';

describe('avatar catalogue', () => {
  it('offers exactly 160 selectable avatars with stable ids', () => {
    expect(avatarCatalog).toHaveLength(AVATAR_CATALOG_SIZE);
    expect(avatarCatalog[0]!.id).toBe('avatar_001');
    expect(avatarCatalog[159]!.id).toBe('avatar_160');
    expect(new Set(avatarCatalog.map((avatar) => avatar.id)).size).toBe(AVATAR_CATALOG_SIZE);
  });

  it('makes every catalogue entry visually distinct', () => {
    const signatures = avatarCatalog.map((avatar) => Object.values(avatar.config).join('-'));
    expect(new Set(signatures).size).toBe(AVATAR_CATALOG_SIZE);
  });

  it('maps an id to a config deterministically', () => {
    expect(configForAvatarId('avatar_042')).toEqual(configForAvatarId('avatar_042'));
    expect(resolveAvatar(0, configForAvatarId('avatar_042')).theme.id)
      .toBe(resolveAvatar(999, configForAvatarId('avatar_042')).theme.id);
  });

  it('validates ids and falls back when one is missing or unknown', () => {
    expect(isValidAvatarId('avatar_001')).toBe(true);
    expect(isValidAvatarId('avatar_101')).toBe(true);
    expect(isValidAvatarId(null)).toBe(false);
    expect(avatarById('nope')).toBeNull();
    expect(configForAvatarId(null)).toBeNull();
    expect(initialsFor('ธนกร ศรีสุวรรณ')).toBe('ธศ');
    expect(initialsFor('Somchai')).toBe('So');
    expect(initialsFor('   ')).toBe('?');
  });

  it('searches by id, name, keyword and category', () => {
    expect(searchAvatars('avatar_007')).toHaveLength(1);
    expect(searchAvatars('', 'glasses').every((avatar) => avatar.category === 'glasses')).toBe(true);
    expect(searchAvatars('แว่น').length).toBeGreaterThan(0);
    expect(searchAvatars('', 'all')).toHaveLength(AVATAR_CATALOG_SIZE);
  });

  it('covers every category so the filter is never empty', () => {
    for (const category of ['classic', 'glasses', 'sporty', 'creative', 'scholar', 'animal'] as const) {
      expect(searchAvatars('', category).length).toBeGreaterThan(0);
    }
  });
});
