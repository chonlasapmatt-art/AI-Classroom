import { avatarAccessories, avatarPalettes, avatarThemes, hairStyles, skinTones, type AvatarTheme } from './avatarThemes';
import type { AvatarConfig } from '../../domain/types';

/**
 * The 100 avatars anyone can pick for themselves.
 *
 * Each entry is a deterministic combination of the drawing parts already used across the app, so a
 * catalogue avatar renders through exactly the same component as everything else: no image files to
 * ship, no remote URLs to break, and the same look on every device. Ids are stable
 * (`avatar_001` … `avatar_100`) and are the only thing stored on a record.
 */
export const AVATAR_CATALOG_SIZE = 100;

export type AvatarCategory = 'classic' | 'glasses' | 'sporty' | 'creative' | 'scholar';

export interface CatalogAvatar {
  id: string;
  index: number;
  name: string;
  category: AvatarCategory;
  config: AvatarConfig;
  theme: AvatarTheme;
  keywords: string[];
}

export const avatarCategoryLabels: Record<AvatarCategory, string> = {
  classic: 'คลาสสิก', glasses: 'ใส่แว่น', sporty: 'สายกีฬา', creative: 'สายสร้างสรรค์', scholar: 'สายวิชาการ'
};

/** Accessory indexes that read as "wearing glasses" in the renderer. */
const glassesAccessories = new Set([1, 2]);

function categoryFor(config: AvatarConfig, theme: AvatarTheme): AvatarCategory {
  if (glassesAccessories.has(config.accessory)) return 'glasses';
  if (theme.id === 'athlete') return 'sporty';
  if (theme.id === 'artist' || theme.id === 'musician') return 'creative';
  if (theme.id === 'science' || theme.id === 'reader' || theme.id === 'coder') return 'scholar';
  return 'classic';
}

/**
 * Theme, palette and skin tone are read off the index like digits of a mixed-radix number, which
 * guarantees all 100 combinations are different. Hair, accessory and badge then advance on their own
 * strides so neighbouring ids still look clearly distinct rather than merely being distinct.
 */
function configForIndex(index: number): AvatarConfig {
  const themeCount = avatarThemes.length;
  const paletteCount = avatarPalettes.length;
  return {
    archetype: index % themeCount,
    palette: Math.floor(index / themeCount) % paletteCount,
    skinTone: Math.floor(index / (themeCount * paletteCount)) % skinTones.length,
    hair: Math.floor(index / 3) % hairStyles.length,
    accessory: Math.floor(index / 5) % avatarAccessories.length,
    badge: Math.floor(index / 7) % 6
  };
}

export const avatarCatalog: CatalogAvatar[] = Array.from({ length: AVATAR_CATALOG_SIZE }, (_, index) => {
  const config = configForIndex(index);
  const theme = avatarThemes[config.archetype]!;
  const hair = hairStyles[config.hair]!;
  const accessory = avatarAccessories[config.accessory]!;
  return {
    id: `avatar_${String(index + 1).padStart(3, '0')}`,
    index,
    name: `${theme.name} ${index + 1}`,
    category: categoryFor(config, theme),
    config,
    theme,
    keywords: [theme.name, hair.name, accessory.name, theme.id, hair.id, accessory.id]
  };
});

const byId = new Map(avatarCatalog.map((avatar) => [avatar.id, avatar]));

export function isValidAvatarId(avatarId: string | null | undefined): boolean {
  return Boolean(avatarId && byId.has(avatarId));
}

export function avatarById(avatarId: string | null | undefined): CatalogAvatar | null {
  if (!avatarId) return null;
  return byId.get(avatarId) ?? null;
}

/** Resolves whatever a record carries into a config, or null when initials should be shown. */
export function configForAvatarId(avatarId: string | null | undefined): AvatarConfig | null {
  return avatarById(avatarId)?.config ?? null;
}

/** Fallback used whenever an avatar id is missing or no longer in the catalogue. */
export function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`;
}

export function searchAvatars(query: string, category: AvatarCategory | 'all' = 'all'): CatalogAvatar[] {
  const needle = query.trim().toLowerCase();
  return avatarCatalog.filter((avatar) => {
    if (category !== 'all' && avatar.category !== category) return false;
    if (!needle) return true;
    return avatar.id.includes(needle)
      || avatar.name.toLowerCase().includes(needle)
      || avatar.keywords.some((keyword) => keyword.toLowerCase().includes(needle));
  });
}
