import { avatarAccessories, avatarPalettes, avatarThemes, hairStyles, skinTones, type AvatarTheme } from './avatarThemes';
import type { AvatarConfig } from '../../domain/types';
import { generatedAvatars, lookSignature, GENERATED_COUNT } from './avatarGenerated';
import type { AvatarConfigV2 } from './avatarSchema';

/**
 * The avatars anyone can pick for themselves, in two halves.
 *
 * Every entry is a deterministic combination of drawing parts, so a catalogue avatar renders through
 * exactly the same component as everything else: no image files to ship, no remote URLs to break,
 * and the same look on every device. An id is the only thing stored on a record, which makes it a
 * promise — `avatar_042` has to mean the same drawing next term and on every device, so the list is
 * only ever appended to.
 *
 * The first hundred and sixty are the original flat configs. Everything after them is a layered
 * config built from the trait tables in `avatarGenerated.ts`.
 */

/**
 * The original hundred and sixty, which keep their ids and their looks for ever.
 *
 * These are the entries children are already wearing. Their indexes address arrays in
 * `avatarThemes.ts` by position, so the list may be appended to and must never be reordered.
 */
export const LEGACY_CATALOG_SIZE = 160;

/** Everything a person can pick without opening a single drawer: the old set plus the new one. */
export const AVATAR_CATALOG_SIZE = LEGACY_CATALOG_SIZE + GENERATED_COUNT;

export type AvatarCategory =
  | 'classic' | 'glasses' | 'sporty' | 'creative' | 'scholar' | 'animal'
  | 'mage' | 'dragon' | 'demon' | 'techwear' | 'steampunk' | 'spirit' | 'robot';

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
  classic: 'คลาสสิก', glasses: 'ใส่แว่น', sporty: 'สายกีฬา', creative: 'สายสร้างสรรค์',
  scholar: 'สายวิชาการ', animal: 'สัตว์', mage: 'นักเวทย์', dragon: 'มังกร', demon: 'ปีศาจ',
  techwear: 'เทคแวร์', steampunk: 'สตีมพังก์', spirit: 'วิญญาณ', robot: 'หุ่นยนต์'
};

/** Accessory indexes that read as "wearing glasses" in the renderer. */
const glassesAccessories = new Set([1, 2]);

function categoryFor(config: AvatarConfig, theme: AvatarTheme): AvatarCategory {
  if (theme.kind === 'animal') return 'animal';
  if (glassesAccessories.has(config.accessory)) return 'glasses';
  if (theme.id === 'athlete') return 'sporty';
  if (theme.id === 'artist' || theme.id === 'musician') return 'creative';
  if (theme.id === 'science' || theme.id === 'reader' || theme.id === 'coder') return 'scholar';
  return 'classic';
}

/**
 * Theme, palette and skin tone are read off the index like digits of a mixed-radix number, which
 * guarantees all 160 combinations are different. Hair, accessory and badge then advance on their own
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

const legacyAvatars: CatalogAvatar[] = Array.from({ length: LEGACY_CATALOG_SIZE }, (_, index) => {
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

/**
 * The finished characters, numbered on from where the originals stop.
 *
 * `avatar_161` onwards are layered configs built from the trait tables — a dragon with horns and
 * wings, a mage with a staff, a fox with three tails — and they are appended rather than mixed in,
 * so every id that already exists still points at the same drawing. The id is a record's only
 * memory of what a child chose.
 */
const generatedCatalog: CatalogAvatar[] = generatedAvatars.map((avatar) => {
  const index = LEGACY_CATALOG_SIZE + avatar.index;
  return {
    id: `avatar_${String(index + 1).padStart(3, '0')}`,
    index,
    name: avatar.name,
    category: avatar.category,
    config: avatar.config,
    theme: avatarThemes[avatar.config.archetype % avatarThemes.length]!,
    keywords: [avatar.name, ...avatar.keywords]
  };
});

export const avatarCatalog: CatalogAvatar[] = [...legacyAvatars, ...generatedCatalog];

/**
 * What makes two catalogue entries the same avatar.
 *
 * One definition, shared by the generator that avoids collisions and by the test that proves there
 * are none — two of them would drift, and the drift would show up as a person scrolling past the
 * same face four times and concluding there are not really a thousand.
 *
 * A flat config is its six indexes and its outfit; a layered one is its race, its layers and its
 * six colours. Comparing whole objects would not do: `JSON.stringify` orders keys by insertion, so
 * two identical looks written in a different order would read as different.
 */
export function catalogSignature(avatar: CatalogAvatar): string {
  const config = avatar.config as AvatarConfigV2;
  if (config.layers) return lookSignature(config);
  return ['v1', config.archetype, config.palette, config.skinTone, config.hair,
    config.accessory, config.badge, config.outfit ?? ''].join('-');
}

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
  /*
   * Only the parts that are actually name-shaped.
   *
   * A parenthetical or any punctuation-led token is not a name, and taking its first character
   * produced avatars reading "ผ(" for "ผู้ดูแลระบบ (Preview)" — which is what a support operator
   * and every Preview session saw in the top bar.
   */
  const parts = displayName.trim().split(/\s+/).filter((part) => /^[\p{L}\p{N}]/u.test(part));
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
