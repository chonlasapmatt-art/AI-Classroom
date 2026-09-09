/**
 * What an avatar wears.
 *
 * Everything else about an avatar — the person, the hair, the skin tone, the accessory — was already
 * a choice; the clothes were one shirt in eight colours. An outfit is its own catalogue now, and one
 * entry here plus one branch in the drawing is the whole cost of adding another. The id is a string
 * rather than an index into this array on purpose: indexes shift the day somebody inserts an outfit
 * in the middle, and a saved record must never quietly become a different set of clothes.
 *
 * Nothing stored before this existed carries an outfit at all, which is the point of `defaultOutfit`
 * — an avatar with no clothes chosen wears the uniform shirt it has always been drawn in.
 */

/** The drawings the renderer knows. Adding one means a new value here and a new case beside it. */
export type AvatarOutfitShape =
  | 'uniform' | 'collar' | 'hoodie' | 'blazer' | 'jersey' | 'labcoat' | 'apron' | 'dungarees';

export interface AvatarOutfit {
  id: string;
  name: string;
  description: string;
  shape: AvatarOutfitShape;
  /**
   * What it costs, in the points a child earns by turning up and by being given them.
   *
   * Left out, the outfit is free and always has been. Half the wardrobe stays that way on purpose:
   * a shop where everything is locked is a shop that tells a new child they are dressed wrong, and
   * the point of the priced half is something to work towards rather than something withheld.
   */
  price?: number;
  /**
   * Clothes normally take the avatar's own palette, so a school that themes its avatars keeps its
   * colours. An outfit only names a colour when the colour is the outfit: a lab coat that is not
   * white is not a lab coat.
   */
  primary?: string;
  accent?: string;
}

export const avatarOutfits: AvatarOutfit[] = [
  { id: 'uniform', name: 'ชุดนักเรียน', description: 'ชุดพื้นฐานของโรงเรียน', shape: 'uniform' },
  { id: 'collar', name: 'เสื้อคอปก', description: 'เรียบร้อย ใส่ได้ทุกวัน', shape: 'collar' },
  { id: 'hoodie', name: 'เสื้อฮู้ด', description: 'สบาย ๆ สไตล์วันสบายวัน', shape: 'hoodie' },
  { id: 'jersey', name: 'ชุดกีฬา', description: 'พร้อมลงสนามทุกเมื่อ', shape: 'jersey' },
  // Roughly a fortnight of turning up, a month, and half a term: near enough to reach, far enough
  // to be worth reaching.
  { id: 'blazer', name: 'เสื้อสูทนักเรียน', description: 'สำหรับวันพิธีการและการนำเสนอ', shape: 'blazer', price: 20 },
  { id: 'apron', name: 'ผ้ากันเปื้อนศิลปะ', description: 'เลอะได้เต็มที่ในคาบศิลปะ', shape: 'apron', price: 40 },
  { id: 'dungarees', name: 'ชุดเอี๊ยม', description: 'สายงานประดิษฐ์และงานช่าง', shape: 'dungarees', price: 60 },
  { id: 'labcoat', name: 'เสื้อกาวน์', description: 'สำหรับห้องทดลอง', shape: 'labcoat', primary: '#f4f6fb', accent: '#94a3b8', price: 100 }
];

export const defaultOutfit: AvatarOutfit = avatarOutfits[0]!;

/** A saved id that no longer exists — a removed outfit, a typo, an older record — wears the default. */
export function outfitById(id?: string | null): AvatarOutfit {
  if (!id) return defaultOutfit;
  return avatarOutfits.find((outfit) => outfit.id === id) ?? defaultOutfit;
}

export const outfitIds = avatarOutfits.map((outfit) => outfit.id);

/** Whether a stored id names an outfit this build knows. The repositories refuse anything else. */
export function isValidOutfitId(id: string | null | undefined): boolean {
  return typeof id === 'string' && avatarOutfits.some((outfit) => outfit.id === id);
}

/** What an outfit costs. Zero for the ones that were never locked. */
export function outfitPrice(id: string): number {
  return avatarOutfits.find((outfit) => outfit.id === id)?.price ?? 0;
}

/**
 * Whether this child may put this on.
 *
 * A free outfit is always wearable. A priced one is wearable once it has been bought, and buying is
 * the only way in -- having enough points is not the same as having spent them, or a child would
 * "own" the whole wardrobe on the day they could afford one of it.
 */
export function canWearOutfit(id: string, unlocked: ReadonlySet<string>): boolean {
  return outfitPrice(id) === 0 || unlocked.has(id);
}
