import type { AvatarAnimation, AvatarConfig } from '../../domain/types';

/**
 * Avatar catalogue. An avatar is a combination of theme, palette, skin tone, hair, accessory and
 * badge, which is what makes thousands of distinct looks out of a small amount of drawing code.
 * A student either keeps the deterministic look derived from their avatarIndex, or picks their own
 * combination in the Avatar Studio, which is stored in `students.avatarConfig`.
 */
export type AvatarThemeId = 'science' | 'coder' | 'reader' | 'athlete' | 'artist' | 'leader' | 'musician' | 'explorer' | 'cat' | 'fox' | 'panda' | 'bunny' | 'penguin';
export type AvatarProp = 'flask' | 'laptop' | 'book' | 'ball' | 'palette' | 'badge' | 'note' | 'compass';
export type AvatarAnimal = 'cat' | 'fox' | 'panda' | 'bunny' | 'penguin';

export interface AvatarTheme {
  id: AvatarThemeId;
  name: string;
  description: string;
  primary: string;
  soft: string;
  accent: string;
  prop: AvatarProp;
  kind: 'person' | 'animal';
  animal?: AvatarAnimal;
}

export const avatarThemes: AvatarTheme[] = [
  { id: 'science', name: 'สายวิทยาศาสตร์', description: 'ชอบตั้งคำถามและทดลอง', primary: '#0f766e', soft: '#ccfbef', accent: '#22d3ee', prop: 'flask', kind: 'person' },
  { id: 'coder', name: 'โปรแกรมเมอร์', description: 'สนุกกับการเขียนโค้ดและแก้บั๊ก', primary: '#4930d1', soft: '#e8e1ff', accent: '#a5b4fc', prop: 'laptop', kind: 'person' },
  { id: 'reader', name: 'นักอ่าน', description: 'อ่านจบเล่มแล้วเล่าให้เพื่อนฟัง', primary: '#b45309', soft: '#fef1d6', accent: '#fbbf24', prop: 'book', kind: 'person' },
  { id: 'athlete', name: 'นักกีฬา', description: 'พลังงานเต็มร้อยทุกคาบพละ', primary: '#c2410c', soft: '#ffe6d5', accent: '#fb923c', prop: 'ball', kind: 'person' },
  { id: 'artist', name: 'สายศิลปะ', description: 'มองโลกเป็นสีสันเสมอ', primary: '#be185d', soft: '#ffe4f0', accent: '#f9a8d4', prop: 'palette', kind: 'person' },
  { id: 'leader', name: 'ผู้นำห้องเรียน', description: 'ดูแลเพื่อนและช่วยครูเสมอ', primary: '#2765d7', soft: '#dbe9ff', accent: '#93c5fd', prop: 'badge', kind: 'person' },
  { id: 'musician', name: 'นักดนตรี', description: 'มีจังหวะอยู่ในหัวตลอดเวลา', primary: '#7c3aed', soft: '#efe6ff', accent: '#c4b5fd', prop: 'note', kind: 'person' },
  { id: 'explorer', name: 'นักสำรวจ', description: 'อยากรู้ว่าอีกฝั่งของแผนที่มีอะไร', primary: '#4d7c0f', soft: '#e8f7cf', accent: '#a3e635', prop: 'compass', kind: 'person' },
  { id: 'cat', name: 'แมวขี้เล่น', description: 'น่ารัก คล่องแคล่ว และชอบค้นพบสิ่งใหม่', primary: '#f59e0b', soft: '#fff4cf', accent: '#fb7185', prop: 'ball', kind: 'animal', animal: 'cat' },
  { id: 'fox', name: 'จิ้งจอกนักผจญภัย', description: 'ฉลาด เท่ และพร้อมออกสำรวจ', primary: '#ea580c', soft: '#ffeadf', accent: '#fbbf24', prop: 'compass', kind: 'animal', animal: 'fox' },
  { id: 'panda', name: 'แพนด้านุ่มนิ่ม', description: 'ใจดี มีสมาธิ และรักการเรียนรู้', primary: '#334155', soft: '#e8edf4', accent: '#94a3b8', prop: 'book', kind: 'animal', animal: 'panda' },
  { id: 'bunny', name: 'กระต่ายสายครีเอทีฟ', description: 'สดใส อ่อนโยน และชอบสร้างสรรค์', primary: '#db2777', soft: '#ffe4f1', accent: '#f9a8d4', prop: 'palette', kind: 'animal', animal: 'bunny' },
  { id: 'penguin', name: 'เพนกวินสุดคูล', description: 'เป็นมิตร มั่นใจ และไม่กลัวความหนาว', primary: '#2563eb', soft: '#dcecff', accent: '#67e8f9', prop: 'note', kind: 'animal', animal: 'penguin' }
];

/** Extra shirt palettes, applied on top of the theme colour. */
export const avatarPalettes = [
  { primary: '#5b3df5', accent: '#c4b5fd' },
  { primary: '#0f766e', accent: '#5eead4' },
  { primary: '#c2410c', accent: '#fdba74' },
  { primary: '#be185d', accent: '#f9a8d4' },
  { primary: '#1d4ed8', accent: '#93c5fd' },
  { primary: '#15803d', accent: '#86efac' },
  { primary: '#a16207', accent: '#fde047' },
  { primary: '#334155', accent: '#cbd5f5' }
] as const;

export const skinTones = ['#f6ddc3', '#f2d0b3', '#e3b591', '#c98f68', '#a06a45', '#7d4f31'] as const;

export interface HairStyle { id: string; name: string; color: string; shape: 'short' | 'bob' | 'long' | 'bun' | 'curly' | 'cap' }

export const hairStyles: HairStyle[] = [
  { id: 'short-dark', name: 'ผมสั้นสีเข้ม', color: '#2f2a44', shape: 'short' },
  { id: 'bob-brown', name: 'ผมบ๊อบสีน้ำตาล', color: '#4a2f22', shape: 'bob' },
  { id: 'long-black', name: 'ผมยาวสีดำ', color: '#1f1b2e', shape: 'long' },
  { id: 'bun-auburn', name: 'มัดจุกสีน้ำตาลแดง', color: '#7b3f22', shape: 'bun' },
  { id: 'curly-warm', name: 'ผมหยิกฟู', color: '#3b2a1d', shape: 'curly' },
  { id: 'cap-sport', name: 'หมวกแก๊ป', color: '#243b6b', shape: 'cap' }
];

export interface AvatarAccessory { id: string; name: string; kind: 'none' | 'glasses' | 'roundGlasses' | 'headband' | 'scarf' | 'earbuds' | 'flower' | 'mask' }

export const avatarAccessories: AvatarAccessory[] = [
  { id: 'none', name: 'ไม่ใส่', kind: 'none' },
  { id: 'glasses', name: 'แว่นสี่เหลี่ยม', kind: 'glasses' },
  { id: 'round', name: 'แว่นกลม', kind: 'roundGlasses' },
  { id: 'headband', name: 'ผ้าคาดผม', kind: 'headband' },
  { id: 'scarf', name: 'ผ้าพันคอ', kind: 'scarf' },
  { id: 'earbuds', name: 'หูฟัง', kind: 'earbuds' },
  { id: 'flower', name: 'ดอกไม้ติดผม', kind: 'flower' },
  { id: 'mask', name: 'หน้ากากอนามัย', kind: 'mask' }
];

export interface AvatarBadge { id: string; name: string; glyph: string; color: string }

export const avatarBadges: AvatarBadge[] = [
  { id: 'none', name: 'ไม่มีเข็ม', glyph: '', color: '#000000' },
  { id: 'star', name: 'ดาวเรียนดี', glyph: '★', color: '#f59e0b' },
  { id: 'heart', name: 'หัวใจจิตอาสา', glyph: '♥', color: '#e11d48' },
  { id: 'leaf', name: 'ใบไม้รักษ์โลก', glyph: '❦', color: '#16a34a' },
  { id: 'note', name: 'โน้ตดนตรี', glyph: '♪', color: '#7c3aed' },
  { id: 'medal', name: 'เหรียญกีฬา', glyph: '◉', color: '#0ea5e9' }
];

/** Total distinct looks a student can choose from. */
export const AVATAR_VARIANT_COUNT =
  avatarThemes.length * avatarPalettes.length * skinTones.length * hairStyles.length * avatarAccessories.length * avatarBadges.length;

export interface AvatarIdentity {
  theme: AvatarTheme;
  palette: (typeof avatarPalettes)[number];
  skinTone: string;
  hair: HairStyle;
  accessory: AvatarAccessory;
  badge: AvatarBadge;
  config: AvatarConfig;
}

function pick<T>(items: readonly T[], index: number): T {
  const size = items.length;
  return items[((Math.trunc(index) % size) + size) % size]!;
}

/** Deterministic look derived from avatarIndex, used until a student customises their avatar. */
export function configFromIndex(avatarIndex: number): AvatarConfig {
  const value = Math.abs(Math.trunc(avatarIndex));
  return {
    archetype: value % avatarThemes.length,
    palette: Math.floor(value / avatarThemes.length) % avatarPalettes.length,
    skinTone: Math.floor(value / 3) % skinTones.length,
    hair: Math.floor(value / 5) % hairStyles.length,
    accessory: Math.floor(value / 7) % avatarAccessories.length,
    badge: Math.floor(value / 11) % avatarBadges.length
  };
}

export function resolveAvatar(avatarIndex: number, config?: AvatarConfig | null): AvatarIdentity {
  const resolved = config ?? configFromIndex(avatarIndex);
  return {
    theme: pick(avatarThemes, resolved.archetype),
    palette: pick(avatarPalettes, resolved.palette),
    skinTone: pick(skinTones, resolved.skinTone),
    hair: pick(hairStyles, resolved.hair),
    accessory: pick(avatarAccessories, resolved.accessory),
    badge: pick(avatarBadges, resolved.badge),
    config: resolved
  };
}

export function themeById(id: AvatarThemeId): AvatarTheme {
  return avatarThemes.find((theme) => theme.id === id) ?? avatarThemes[0]!;
}

export const avatarAnimations: AvatarAnimation[] = ['idle', 'blink', 'wave', 'study', 'celebrate'];

export const animationLabels: Record<AvatarAnimation, string> = {
  idle: 'ยืนปกติ', blink: 'กะพริบตา', wave: 'โบกมือ', study: 'ตั้งใจเรียน', celebrate: 'ดีใจ', thinking: 'กำลังคิด'
};
