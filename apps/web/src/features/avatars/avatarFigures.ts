import { avatarPalettes, skinTones } from './avatarThemes';
import { traitPiecePrice } from './avatarTraits';
import { bodyArchetypeFor, type FullBodyArchetype } from './avatarFullBody';
import type { AvatarConfigV2, AvatarRace, AvatarTints, LayerType } from './avatarSchema';

/**
 * The figures, as characters rather than as parts.
 *
 * ── Why a second catalogue at all ──
 * The thousand-entry catalogue is a thousand *portraits*: six integers each, drawn as a bust, made
 * before the figure existed. It stays exactly as it is, because ids are a promise and `avatar_042`
 * has to keep meaning what it meant last term. What it cannot do is describe a whole person — it has
 * no slots, so a child picking from it gets a costume the customiser cannot then take apart.
 *
 * These are the other thing: complete builds in the vocabulary the customiser and the server both
 * speak already — a race, a layer per slot, six colours. Picking one and pressing save stores a
 * config, so every drawer stays open afterwards and every piece stays changeable. Nothing here is a
 * new kind of record.
 *
 * ── Where the two hundred come from ──
 * Sixteen blueprints, one per kind of character the school asked for, each with three or four
 * costume variants, crossed with four palettes. That is arithmetic, and arithmetic on its own makes
 * near-duplicates — so the variants differ in at least three slots from each other rather than in
 * one, and the palette changes skin, hair and all four garment colours together. Two figures from
 * the same blueprint are a knight in green with a shield and a knight in violet with wings; they are
 * not the same figure twice.
 *
 * ── Deterministic, because a name is a thing people say to each other ──
 * The list is built at module load from fixed tables in a fixed order, so "ยอดนักรบมังกร 3" is the
 * same figure on every device and every build. No randomness anywhere.
 */

export type FigureCategory =
  | 'student' | 'scientist' | 'coder' | 'scholar' | 'athlete' | 'explorer'
  | 'mage' | 'warrior' | 'dragon' | 'demon' | 'animal' | 'robot' | 'spirit' | 'fantasy' | 'scifi';

export const figureCategoryLabels: Record<FigureCategory, string> = {
  student: 'นักเรียน',
  scientist: 'นักวิทยาศาสตร์',
  coder: 'นักคอมพิวเตอร์',
  scholar: 'นักวิชาการ',
  athlete: 'นักกีฬา',
  explorer: 'นักสำรวจ',
  mage: 'นักเวท',
  warrior: 'นักรบ',
  dragon: 'มังกร',
  demon: 'ปีศาจ',
  animal: 'สัตว์',
  robot: 'หุ่นยนต์',
  spirit: 'วิญญาณ',
  fantasy: 'แฟนตาซี',
  scifi: 'ไซไฟ'
};

export interface FigurePreset {
  id: string;
  /** Thai, because it is read by the child choosing it. */
  name: string;
  category: FigureCategory;
  /** Searchable keywords. Thai for what a child would type, English for what a teacher might. */
  tags: string[];
  /** The build itself, in the vocabulary the server validates and the figure renders. */
  config: AvatarConfigV2;
  /** The figure this build stands on, so a grid can draw it without composing first. */
  body: FullBodyArchetype;
  /** Points the pieces in it cost, summed. Zero for a build anybody can wear today. */
  price: number;
}

type SlotSet = Partial<Record<LayerType, string>>;

interface Blueprint {
  key: string;
  category: FigureCategory;
  /** Thai stem: the variants are numbered after it. */
  name: string;
  race: AvatarRace;
  tags: string[];
  /** Three or four costumes, each differing from the others in at least three slots. */
  variants: SlotSet[];
}

/*
 * The palettes.
 *
 * Four, and they move every colour at once: a figure in the second palette has different skin, hair
 * and garments from the same figure in the first, which is what stops the cross-product reading as
 * one figure printed in four inks. The names are what a child sees after the blueprint's own.
 */
const palettes: Array<{ name: string; tints: AvatarTints }> = [
  {
    name: 'ฟ้าเข้ม',
    tints: {
      skin: skinTones[1]!, hair: '#2f2a44',
      primary: avatarPalettes[0]!.primary, secondary: '#1f2a44',
      accent: avatarPalettes[0]!.accent, magic: '#7c4dff'
    }
  },
  {
    name: 'เขียวมิ้นต์',
    tints: {
      skin: skinTones[3]!, hair: '#4a2f22',
      primary: avatarPalettes[2]!.primary, secondary: '#134e4a',
      accent: avatarPalettes[2]!.accent, magic: '#22d3ee'
    }
  },
  {
    name: 'ชมพูหวาน',
    tints: {
      skin: skinTones[0]!, hair: '#be185d',
      primary: avatarPalettes[4]!.primary, secondary: '#831843',
      accent: avatarPalettes[4]!.accent, magic: '#f472b6'
    }
  },
  {
    name: 'ทองอำพัน',
    tints: {
      skin: skinTones[5] ?? skinTones[2]!, hair: '#7b3f22',
      primary: avatarPalettes[6]?.primary ?? avatarPalettes[1]!.primary, secondary: '#78350f',
      accent: avatarPalettes[6]?.accent ?? avatarPalettes[1]!.accent, magic: '#f59e0b'
    }
  }
];

/*
 * The blueprints.
 *
 * One per kind of character the school asked for, and the list is the answer to "what can I be":
 * a scientist, a programmer, a reader, an athlete, an explorer, a mage, a warrior, a dragon, a
 * demon, four animals, a robot, a spirit, and the two open-ended ones — fantasy and science
 * fiction — that exist so a child who wants something the list does not name still has a door.
 *
 * Adding a character type is adding a row here. Nothing else in the app has to know.
 */
const blueprints: Blueprint[] = [
  {
    key: 'student', category: 'student', name: 'นักเรียน', race: 'human',
    tags: ['นักเรียน', 'student', 'school', 'โรงเรียน'],
    variants: [
      { hair_headpiece: 'hair_short', face_features: 'face_smile', top_clothing: 'top_uniform', bottom_clothing: 'bottom_trousers' },
      { hair_headpiece: 'hair_bob', face_features: 'face_neutral', top_clothing: 'top_collar', bottom_clothing: 'bottom_skirt', front_accessory: 'front_book' },
      { hair_headpiece: 'hair_ponytail', face_features: 'face_wink', top_clothing: 'top_sweater', bottom_clothing: 'bottom_trousers', back_accessory: 'back_backpack' },
      { hair_headpiece: 'hair_buzz', face_features: 'face_focused', top_clothing: 'top_hoodie', bottom_clothing: 'bottom_shorts' }
    ]
  },
  {
    key: 'scientist', category: 'scientist', name: 'นักวิทยาศาสตร์', race: 'human',
    tags: ['วิทยาศาสตร์', 'scientist', 'lab', 'ห้องแล็บ'],
    variants: [
      { hair_headpiece: 'hair_curly', face_features: 'face_focused__goggles', top_clothing: 'top_labcoat', bottom_clothing: 'bottom_trousers', front_accessory: 'front_flask' },
      { hair_headpiece: 'hair_bun', face_features: 'face_neutral__surgical', top_clothing: 'top_chefcoat', bottom_clothing: 'bottom_skirt', front_accessory: 'front_flask', front_fx: 'fx_smokepuff' },
      { hair_headpiece: 'hair_wavy', face_features: 'face_wide__square', top_clothing: 'top_labcoat', bottom_clothing: 'bottom_techpants', back_accessory: 'back_backpack', front_fx: 'fx_motes' },
      { hair_headpiece: 'hair_mohawk', face_features: 'face_fierce__goggles', top_clothing: 'top_steamvest', bottom_clothing: 'bottom_greaves', front_accessory: 'front_lantern', back_aura: 'aura_lightning' }
    ]
  },
  {
    key: 'coder', category: 'coder', name: 'นักคอมพิวเตอร์', race: 'human',
    tags: ['โปรแกรมเมอร์', 'coder', 'programmer', 'คอมพิวเตอร์'],
    variants: [
      { hair_headpiece: 'hair_short', face_features: 'face_cyber__visor', top_clothing: 'top_hoodie', bottom_clothing: 'bottom_techpants', front_accessory: 'front_laptop' },
      { hair_headpiece: 'hair_twintail', face_features: 'face_calm__round', top_clothing: 'top_streetwear', bottom_clothing: 'bottom_shorts', front_accessory: 'front_laptop', front_fx: 'fx_gridline' },
      { hair_headpiece: 'hair_braid', face_features: 'face_glow__square', top_clothing: 'top_techwear', bottom_clothing: 'bottom_techpants', back_aura: 'aura_cyber', front_fx: 'fx_arc' },
      { hair_headpiece: 'hair_afro', face_features: 'face_smile', top_clothing: 'top_sweater', bottom_clothing: 'bottom_trousers', front_accessory: 'front_laptop', back_accessory: 'back_backpack' }
    ]
  },
  {
    key: 'scholar', category: 'scholar', name: 'นักวิชาการ', race: 'human',
    tags: ['นักอ่าน', 'scholar', 'reader', 'ห้องสมุด'],
    variants: [
      { hair_headpiece: 'hair_bun', face_features: 'face_calm__round', top_clothing: 'top_blazer', bottom_clothing: 'bottom_skirt', front_accessory: 'front_book' },
      { hair_headpiece: 'hair_long', face_features: 'face_neutral__monocle', top_clothing: 'top_scarfcoat', bottom_clothing: 'bottom_trousers', back_accessory: 'back_tome' },
      { hair_headpiece: 'hair_short', face_features: 'face_sleepy__square', top_clothing: 'top_sweater', bottom_clothing: 'bottom_trousers', front_accessory: 'front_book', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_wavy', face_features: 'face_focused__round', top_clothing: 'top_apron', bottom_clothing: 'bottom_skirt', front_accessory: 'front_palette' }
    ]
  },
  {
    key: 'athlete', category: 'athlete', name: 'นักกีฬา', race: 'human',
    tags: ['กีฬา', 'athlete', 'sport', 'วิ่ง'],
    variants: [
      { hair_headpiece: 'hair_buzz', face_features: 'face_fierce', top_clothing: 'top_jersey', bottom_clothing: 'bottom_shorts', front_accessory: 'front_ball' },
      { hair_headpiece: 'hair_ponytail', face_features: 'face_smile', top_clothing: 'top_tanktop', bottom_clothing: 'bottom_shorts', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_mohawk', face_features: 'face_focused', top_clothing: 'top_jersey', bottom_clothing: 'bottom_techpants', back_accessory: 'back_banner' },
      { hair_headpiece: 'hair_curly', face_features: 'face_wink', top_clothing: 'top_bandmember', bottom_clothing: 'bottom_shorts', front_accessory: 'front_ball', back_aura: 'aura_fire' }
    ]
  },
  {
    key: 'explorer', category: 'explorer', name: 'นักสำรวจ', race: 'human',
    tags: ['สำรวจ', 'explorer', 'adventure', 'ผจญภัย'],
    variants: [
      { hair_headpiece: 'hair_short', face_features: 'face_focused', top_clothing: 'top_poncho', bottom_clothing: 'bottom_trousers', front_accessory: 'front_compass', back_accessory: 'back_backpack' },
      { hair_headpiece: 'hair_braid', face_features: 'face_smile__goggles', top_clothing: 'top_raincoat', bottom_clothing: 'bottom_techpants', front_accessory: 'front_lantern' },
      { hair_headpiece: 'hair_wavy', face_features: 'face_wide', top_clothing: 'top_pirate', bottom_clothing: 'bottom_shorts', front_accessory: 'front_compass', front_fx: 'fx_leaffall' },
      { hair_headpiece: 'hair_bun', face_features: 'face_calm__monocle', top_clothing: 'top_druidwrap', bottom_clothing: 'bottom_robehem', back_aura: 'aura_nature', front_accessory: 'front_petbird' }
    ]
  },
  {
    key: 'mage', category: 'mage', name: 'นักเวท', race: 'spirit',
    tags: ['เวทมนตร์', 'mage', 'wizard', 'จอมเวทย์'],
    variants: [
      { hair_headpiece: 'hair_long__wizardhat', face_features: 'face_glow', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', front_accessory: 'front_staff', back_aura: 'aura_star' },
      { hair_headpiece: 'hair_bob__hornscurved', face_features: 'face_star', top_clothing: 'top_runichood', bottom_clothing: 'bottom_robehem', front_accessory: 'front_orb', front_fx: 'fx_motes' },
      { hair_headpiece: 'hair_curly__halo', face_features: 'face_calm', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', back_accessory: 'back_tome', back_aura: 'aura_ice' },
      { hair_headpiece: 'hair_braid__wizardhat', face_features: 'face_glow__monocle', top_clothing: 'top_druidwrap', bottom_clothing: 'bottom_robehem', front_accessory: 'front_lantern', front_fx: 'fx_flameorb' }
    ]
  },
  {
    key: 'warrior', category: 'warrior', name: 'นักรบ', race: 'human',
    tags: ['นักรบ', 'warrior', 'knight', 'อัศวิน'],
    variants: [
      { hair_headpiece: 'hair_short', face_features: 'face_fierce', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', front_accessory: 'front_sword', back_accessory: 'back_shield' },
      { hair_headpiece: 'hair_ponytail', face_features: 'face_focused__eyepatch', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', front_accessory: 'front_sword', back_accessory: 'back_cape' },
      { hair_headpiece: 'hair_mohawk', face_features: 'face_fangs', top_clothing: 'top_ninjagi', bottom_clothing: 'bottom_techpants', front_accessory: 'front_sword', front_fx: 'fx_arc' },
      { hair_headpiece: 'hair_long__hornsdragon', face_features: 'face_fierce', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', back_accessory: 'back_banner', back_aura: 'aura_fire' }
    ]
  },
  {
    key: 'dragon', category: 'dragon', name: 'มังกร', race: 'dragonkin',
    tags: ['มังกร', 'dragon', 'wings', 'ปีก'],
    variants: [
      { hair_headpiece: 'hair_short__hornsdragon', face_features: 'face_fierce', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', back_accessory: 'back_dragonwings', front_accessory: 'front_sword' },
      { hair_headpiece: 'hair_buzz__hornscurved', face_features: 'face_glow', top_clothing: 'top_techwear', bottom_clothing: 'bottom_techpants', back_accessory: 'back_dragontail', back_aura: 'aura_lightning' },
      { hair_headpiece: 'hair_wavy__hornsdragon', face_features: 'face_fangs', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', back_accessory: 'back_dragonwings', back_aura: 'aura_fire', front_fx: 'fx_flameorb' },
      { hair_headpiece: 'hair_curly__hornscurved', face_features: 'face_star', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', back_accessory: 'back_dragontail', front_accessory: 'front_orb' }
    ]
  },
  {
    key: 'demon', category: 'demon', name: 'ปีศาจ', race: 'demon',
    tags: ['ปีศาจ', 'demon', 'dark', 'มืด'],
    variants: [
      { hair_headpiece: 'hair_short__hornscurved', face_features: 'face_fangs', top_clothing: 'top_runichood', bottom_clothing: 'bottom_greaves', back_accessory: 'back_batwings', back_aura: 'aura_shadow' },
      { hair_headpiece: 'hair_long__hornsdragon', face_features: 'face_fierce', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', back_accessory: 'back_spadetail', front_accessory: 'front_sword' },
      { hair_headpiece: 'hair_mohawk__hornscurved', face_features: 'face_glow__cybermask', top_clothing: 'top_ninjagi', bottom_clothing: 'bottom_techpants', back_accessory: 'back_batwings', front_fx: 'fx_arc' },
      { hair_headpiece: 'hair_bob__hornscurved', face_features: 'face_wink', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', back_accessory: 'back_spadetail', back_aura: 'aura_fire' }
    ]
  },
  {
    key: 'cat', category: 'animal', name: 'น้องแมว', race: 'beastfolk',
    tags: ['แมว', 'cat', 'สัตว์', 'animal'],
    variants: [
      { hair_headpiece: 'hair_short__beastears', face_features: 'face_smile', top_clothing: 'top_hoodie', bottom_clothing: 'bottom_shorts' },
      { hair_headpiece: 'hair_bob__beastears', face_features: 'face_wink', top_clothing: 'top_sweater', bottom_clothing: 'bottom_skirt', front_accessory: 'front_petbird' },
      { hair_headpiece: 'hair_curly__beastears', face_features: 'face_star', top_clothing: 'top_streetwear', bottom_clothing: 'bottom_techpants', back_accessory: 'back_wolftail', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_twintail__beastears', face_features: 'face_fangs', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', back_aura: 'aura_star' }
    ]
  },
  {
    key: 'fox', category: 'animal', name: 'น้องจิ้งจอก', race: 'beastfolk',
    tags: ['จิ้งจอก', 'fox', 'สัตว์', 'animal'],
    variants: [
      { hair_headpiece: 'hair_ponytail__beastears', face_features: 'face_focused', top_clothing: 'top_poncho', bottom_clothing: 'bottom_trousers', back_accessory: 'back_foxtails' },
      { hair_headpiece: 'hair_wavy__beastears', face_features: 'face_glow', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', back_accessory: 'back_foxtails', back_aura: 'aura_nature' },
      { hair_headpiece: 'hair_short__beastears', face_features: 'face_fangs', top_clothing: 'top_ninjagi', bottom_clothing: 'bottom_techpants', back_accessory: 'back_wolftail', front_accessory: 'front_sword' },
      { hair_headpiece: 'hair_braid__beastears', face_features: 'face_smile', top_clothing: 'top_druidwrap', bottom_clothing: 'bottom_skirt', front_accessory: 'front_lantern', front_fx: 'fx_leaffall' }
    ]
  },
  {
    key: 'panda', category: 'animal', name: 'น้องแพนด้า', race: 'beastfolk',
    tags: ['แพนด้า', 'panda', 'สัตว์', 'animal'],
    variants: [
      { hair_headpiece: 'hair_buzz__beastears', face_features: 'face_sleepy', top_clothing: 'top_tanktop', bottom_clothing: 'bottom_shorts', front_accessory: 'front_ball' },
      { hair_headpiece: 'hair_afro__beastears', face_features: 'face_smile', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', front_fx: 'fx_leaffall' },
      { hair_headpiece: 'hair_short__beastears', face_features: 'face_calm', top_clothing: 'top_apron', bottom_clothing: 'bottom_trousers', front_accessory: 'front_flask' },
      { hair_headpiece: 'hair_curly__beastears', face_features: 'face_wide', top_clothing: 'top_sweater', bottom_clothing: 'bottom_skirt', back_accessory: 'back_backpack' }
    ]
  },
  {
    key: 'rabbit', category: 'animal', name: 'น้องกระต่าย', race: 'beastfolk',
    tags: ['กระต่าย', 'rabbit', 'สัตว์', 'animal'],
    variants: [
      { hair_headpiece: 'hair_long__beastears', face_features: 'face_wink', top_clothing: 'top_sweater', bottom_clothing: 'bottom_skirt', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_bun__beastears', face_features: 'face_star', top_clothing: 'top_streetwear', bottom_clothing: 'bottom_shorts', back_accessory: 'back_wolftail' },
      { hair_headpiece: 'hair_twintail__beastears', face_features: 'face_smile', top_clothing: 'top_hoodie', bottom_clothing: 'bottom_techpants', front_accessory: 'front_petcat' },
      { hair_headpiece: 'hair_short__beastears', face_features: 'face_sleepy', top_clothing: 'top_poncho', bottom_clothing: 'bottom_robehem', back_aura: 'aura_nature' }
    ]
  },
  {
    key: 'dog', category: 'animal', name: 'น้องหมา', race: 'beastfolk',
    tags: ['สุนัข', 'หมา', 'dog', 'สัตว์'],
    variants: [
      { hair_headpiece: 'hair_short__beastears', face_features: 'face_smile', top_clothing: 'top_jersey', bottom_clothing: 'bottom_shorts', front_accessory: 'front_ball' },
      { hair_headpiece: 'hair_curly__beastears', face_features: 'face_fangs', top_clothing: 'top_bandmember', bottom_clothing: 'bottom_techpants', back_accessory: 'back_wolftail' },
      { hair_headpiece: 'hair_wavy__beastears', face_features: 'face_focused', top_clothing: 'top_raincoat', bottom_clothing: 'bottom_trousers', front_accessory: 'front_compass' },
      { hair_headpiece: 'hair_mohawk__beastears', face_features: 'face_wide', top_clothing: 'top_techwear', bottom_clothing: 'bottom_techpants', back_aura: 'aura_lightning', front_fx: 'fx_arc' }
    ]
  },
  {
    key: 'robot', category: 'robot', name: 'หุ่นยนต์', race: 'robot',
    tags: ['หุ่นยนต์', 'robot', 'เทค', 'tech'],
    variants: [
      { hair_headpiece: 'hair_buzz', face_features: 'face_cyber__visor', top_clothing: 'top_techwear', bottom_clothing: 'bottom_techpants', back_accessory: 'back_jetpack' },
      { hair_headpiece: 'hair_short', face_features: 'face_glow__cybermask', top_clothing: 'top_spacesuit', bottom_clothing: 'bottom_techpants', front_fx: 'fx_gridline' },
      { hair_headpiece: 'hair_mohawk', face_features: 'face_cyber', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', back_aura: 'aura_cyber', front_accessory: 'front_orb' },
      { hair_headpiece: 'hair_bob', face_features: 'face_wide__goggles', top_clothing: 'top_steamvest', bottom_clothing: 'bottom_greaves', front_accessory: 'front_lantern', front_fx: 'fx_smokepuff' }
    ]
  },
  {
    key: 'spirit', category: 'spirit', name: 'วิญญาณ', race: 'spirit',
    tags: ['วิญญาณ', 'spirit', 'ghost', 'ผี'],
    variants: [
      { hair_headpiece: 'hair_long__halo', face_features: 'face_glow', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', back_accessory: 'back_angelwings', back_aura: 'aura_star' },
      { hair_headpiece: 'hair_wavy', face_features: 'face_calm', top_clothing: 'top_runichood', bottom_clothing: 'bottom_robehem', back_aura: 'aura_shadow', front_fx: 'fx_motes' },
      { hair_headpiece: 'hair_bob__halo', face_features: 'face_star', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', front_accessory: 'front_lantern', back_aura: 'aura_ice' },
      { hair_headpiece: 'hair_curly', face_features: 'face_sleepy', top_clothing: 'top_druidwrap', bottom_clothing: 'bottom_robehem', back_accessory: 'back_cape', front_fx: 'fx_leaffall' }
    ]
  },
  {
    key: 'fantasy', category: 'fantasy', name: 'แฟนตาซี', race: 'spirit',
    tags: ['แฟนตาซี', 'fantasy', 'เวท', 'magic'],
    variants: [
      { hair_headpiece: 'hair_long__wizardhat', face_features: 'face_star', top_clothing: 'top_kimono', bottom_clothing: 'bottom_robehem', back_accessory: 'back_angelwings', front_accessory: 'front_orb' },
      { hair_headpiece: 'hair_braid__hornscurved', face_features: 'face_glow', top_clothing: 'top_druidwrap', bottom_clothing: 'bottom_robehem', back_accessory: 'back_foxtails', back_aura: 'aura_nature' },
      { hair_headpiece: 'hair_afro__halo', face_features: 'face_calm', top_clothing: 'top_poncho', bottom_clothing: 'bottom_skirt', front_accessory: 'front_petbird', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_bun__wizardhat', face_features: 'face_wink', top_clothing: 'top_magerobe', bottom_clothing: 'bottom_robehem', back_accessory: 'back_tome', front_fx: 'fx_flameorb' }
    ]
  },
  {
    key: 'scifi', category: 'scifi', name: 'ไซไฟ', race: 'robot',
    tags: ['ไซไฟ', 'scifi', 'อวกาศ', 'space'],
    variants: [
      { hair_headpiece: 'hair_short', face_features: 'face_cyber__visor', top_clothing: 'top_spacesuit', bottom_clothing: 'bottom_techpants', back_accessory: 'back_jetpack', front_fx: 'fx_gridline' },
      { hair_headpiece: 'hair_twintail', face_features: 'face_glow__goggles', top_clothing: 'top_techwear', bottom_clothing: 'bottom_techpants', back_aura: 'aura_cyber', front_accessory: 'front_laptop' },
      { hair_headpiece: 'hair_buzz', face_features: 'face_fierce__cybermask', top_clothing: 'top_chestplate', bottom_clothing: 'bottom_greaves', front_accessory: 'front_sword', back_aura: 'aura_lightning' },
      { hair_headpiece: 'hair_wavy', face_features: 'face_wide', top_clothing: 'top_raincoat', bottom_clothing: 'bottom_techpants', front_accessory: 'front_compass', front_fx: 'fx_arc' }
    ]
  },
  {
    key: 'penguin', category: 'animal', name: 'น้องเพนกวิน', race: 'beastfolk',
    tags: ['เพนกวิน', 'penguin', 'สัตว์', 'animal'],
    variants: [
      { hair_headpiece: 'hair_buzz', face_features: 'face_smile', top_clothing: 'top_tanktop', bottom_clothing: 'bottom_shorts' },
      { hair_headpiece: 'hair_short', face_features: 'face_wide', top_clothing: 'top_scarfcoat', bottom_clothing: 'bottom_trousers', front_fx: 'fx_sparkle' },
      { hair_headpiece: 'hair_bob', face_features: 'face_sleepy', top_clothing: 'top_raincoat', bottom_clothing: 'bottom_shorts', front_accessory: 'front_ball' },
      { hair_headpiece: 'hair_curly', face_features: 'face_star', top_clothing: 'top_apron', bottom_clothing: 'bottom_skirt', back_aura: 'aura_ice' }
    ]
  }
];

/** Every priced piece a build uses, so a tile can say what it costs before anybody presses it. */
function priceOf(layers: SlotSet): number {
  return Object.values(layers).reduce((total, traitId) => {
    if (!traitId) return total;
    const [base, worn] = traitId.split('__');
    return total
      + (base ? traitPiecePrice(base) : 0)
      + (worn ? traitPiecePrice(worn) : 0);
  }, 0);
}

function buildFigures(): FigurePreset[] {
  const figures: FigurePreset[] = [];
  for (const blueprint of blueprints) {
    blueprint.variants.forEach((layers, variantIndex) => {
      palettes.forEach((palette, paletteIndex) => {
        const ordinal = variantIndex * palettes.length + paletteIndex + 1;
        const config: AvatarConfigV2 = {
          // The legacy half stays present and inert: a v2 config is a v1 config with more on it, and
          // every reader written before layers existed still finds the six integers it expects.
          archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
          v: 2,
          race: blueprint.race,
          element: 'none',
          animationSet: 'standard',
          layers: { ...layers },
          tints: { ...palette.tints }
        };
        figures.push({
          id: `figure_${blueprint.key}_${String(ordinal).padStart(2, '0')}`,
          name: `${blueprint.name} ${ordinal} · ${palette.name}`,
          category: blueprint.category,
          tags: [...blueprint.tags, palette.name],
          config,
          body: bodyArchetypeFor(config) ?? 'student',
          price: priceOf(layers)
        });
      });
    });
  }
  return figures;
}

/**
 * The whole list, built once.
 *
 * Sixteen blueprints × four costumes × four palettes, which is what makes the number the brief asks
 * for without any of it being the same figure renamed: every entry differs from every other in at
 * least one slot or in all six colours, and the test beside this file is what holds that true.
 */
export const avatarFigures: FigurePreset[] = buildFigures();

export const AVATAR_FIGURE_COUNT = avatarFigures.length;

const figureIndex = new Map(avatarFigures.map((figure) => [figure.id, figure]));

export function figureById(id: string | null | undefined): FigurePreset | null {
  return id ? figureIndex.get(id) ?? null : null;
}

/** How many figures each category holds, for the chips above the grid. */
export function figureCountsByCategory(): Record<FigureCategory, number> {
  const counts = Object.fromEntries(
    (Object.keys(figureCategoryLabels) as FigureCategory[]).map((key) => [key, 0])
  ) as Record<FigureCategory, number>;
  for (const figure of avatarFigures) counts[figure.category] += 1;
  return counts;
}

/**
 * Search, by anything somebody would actually type.
 *
 * The name, the category's own word, and the tags — which carry both the Thai a child types and the
 * English a teacher might. An empty query is not a failed search; it is the whole list.
 */
export function searchFigures(query: string, category: FigureCategory | 'all' = 'all'): FigurePreset[] {
  const needle = query.trim().toLowerCase();
  return avatarFigures.filter((figure) => {
    if (category !== 'all' && figure.category !== category) return false;
    if (!needle) return true;
    const haystack = [figure.name, figureCategoryLabels[figure.category], ...figure.tags]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/*
 * What a build is, as a string, so two builds can be compared.
 *
 * Both halves matter and the first version used only the first. Four figures from one blueprint
 * share their layers exactly and differ only in the six colours, so matching on layers alone
 * reported all four as the same figure: pressing the violet knight marked the blue one as worn.
 * Slot order is fixed here rather than trusted, because object key order is a property of how a
 * config was built and two identical builds must produce one signature.
 */
function signatureOf(config: AvatarConfigV2): string {
  const layers = Object.entries(config.layers ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slot, traitId]) => `${slot}=${traitId}`)
    .join('|');
  const tints = Object.entries(config.tints ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([channel, colour]) => `${channel}=${String(colour).toLowerCase()}`)
    .join('|');
  return `${layers}#${tints}`;
}

const signatureIndex = new Map(avatarFigures.map((figure) => [signatureOf(figure.config), figure]));

/** What a saved build matches in this list, so the picker can show what is already worn. */
export function figureMatching(config: AvatarConfigV2 | null | undefined): FigurePreset | null {
  if (!config?.layers) return null;
  return signatureIndex.get(signatureOf(config)) ?? null;
}
