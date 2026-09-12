import type { AvatarConfig } from '../../domain/types';
import type { FullBodyArchetype } from './avatarFullBody';
import { avatarPalettes, avatarThemes, hairStyles, skinTones } from './avatarThemes';

/**
 * The shape of an avatar, version 2.
 *
 * ── Why a second version rather than a replacement ──
 * `students.avatar_config` is JSONB holding a flat object of small integers, and every one of them
 * is a choice a child made and recognises as themselves. There is no migration that can ask them
 * again. So version 1 is not converted, deprecated or re-indexed: it stays exactly what it was, the
 * renderer keeps drawing it the way it always did, and everything new is an optional field beside
 * it. A record written today is still readable by a build from last month, which matters because a
 * tablet in a classroom updates when somebody presses the button and not before.
 *
 * The practical rule for anybody adding to this: append, never reorder. The index arrays in
 * `avatarThemes.ts` are addressed by position from saved records, so inserting a hair style at the
 * front would silently restyle every child in the school.
 *
 * ── Layers ──
 * A version 2 avatar is a stack of independent drawings, back to front, each addressed by trait id.
 * Nothing about the order is stylistic: wings have to be behind a body, a hat has to be in front of
 * hair, and a held staff has to be in front of both. `hides` lets a trait suppress a layer it would
 * clash with — a full wizard hat covers the hair it would otherwise poke through.
 */
/**
 * The slots an avatar is assembled from.
 *
 * ── The four that were missing ──
 * A child could choose a shirt, a pair of trousers, a haircut and something to carry, and that was
 * the whole of getting dressed. No shoes: every figure in the school wore whatever boot its trousers
 * happened to draw. No gloves, no coat over the shirt, nothing round the neck. "Change every part"
 * was not true, and the gap was structural rather than a matter of adding more shirts.
 *
 * `footwear`, `handwear`, `outerwear` and `neckwear` close it. None of them is a new compositing
 * step — see the note on `BodySlot` — because a shoe belongs to a foot and a foot swings through a
 * stride. A shoe painted as its own layer stands still while the leg walks out from under it, which
 * is the same fault as hair that does not follow a head.
 */
export type LayerType =
  | 'back_aura'
  | 'back_accessory'
  | 'body_base'
  | 'footwear'
  | 'bottom_clothing'
  | 'top_clothing'
  | 'outerwear'
  | 'neckwear'
  | 'handwear'
  | 'face_features'
  | 'hair_headpiece'
  | 'front_accessory'
  | 'front_fx';

/**
 * Back to front. The compositor draws in exactly this order and nothing else decides it.
 *
 * The four new slots sit where the garment they belong with sits: a shoe under the trouser that
 * covers its ankle, a coat over the shirt it is worn on top of, a scarf over the coat, and gloves
 * last because a cuff is drawn over a sleeve and never under one.
 */
export const layerOrder: LayerType[] = [
  'back_aura', 'back_accessory', 'body_base', 'footwear', 'bottom_clothing', 'top_clothing',
  'outerwear', 'neckwear', 'handwear', 'face_features', 'hair_headpiece',
  'front_accessory', 'front_fx'
];

export const layerLabels: Record<LayerType, string> = {
  back_aura: 'ออร่า',
  back_accessory: 'ปีก/หาง/ผ้าคลุม',
  body_base: 'ร่างกาย',
  footwear: 'รองเท้า',
  bottom_clothing: 'กางเกง/กระโปรง',
  top_clothing: 'เสื้อ',
  outerwear: 'เสื้อคลุมนอก',
  neckwear: 'ผ้าพันคอ/ปลอกคอ',
  handwear: 'ถุงมือ',
  face_features: 'ตา/ปาก',
  hair_headpiece: 'ทรงผม/เขา',
  front_accessory: 'ของถือ/แว่น',
  front_fx: 'เอฟเฟกต์'
};

export type AvatarRace = 'human' | 'dragonkin' | 'demon' | 'beastfolk' | 'spirit' | 'robot';

export const raceLabels: Record<AvatarRace, string> = {
  human: 'มนุษย์', dragonkin: 'มังกร', demon: 'ปีศาจ', beastfolk: 'สัตว์', spirit: 'วิญญาณ', robot: 'หุ่นยนต์'
};

export type AvatarElement = 'fire' | 'ice' | 'lightning' | 'shadow' | 'nature' | 'star' | 'cyber' | 'none';

export const elementLabels: Record<AvatarElement, string> = {
  fire: 'ไฟ', ice: 'น้ำแข็ง', lightning: 'สายฟ้า', shadow: 'เงา',
  nature: 'ธรรมชาติ', star: 'ดวงดาว', cyber: 'ไซเบอร์', none: 'ไม่มีธาตุ'
};

/**
 * The six colours a drawing may be tinted with.
 *
 * Six, not seven, and not one per garment: every rectangle in every sprite reads one of these
 * through a CSS custom property, so a new colour is a value change rather than a redraw. The
 * shadow and highlight of each are derived rather than stored — a palette of eighteen hand-picked
 * colours is eighteen chances for two of them to disagree about which light source the avatar is
 * standing in.
 */
export interface AvatarTints {
  skin: string;
  hair: string;
  primary: string;
  secondary: string;
  accent: string;
  magic: string;
}

export const tintLabels: Record<keyof AvatarTints, string> = {
  skin: 'สีผิว', hair: 'สีผม', primary: 'สีหลัก', secondary: 'สีรอง', accent: 'สีเน้น', magic: 'สีเวทมนตร์'
};

export interface TraitOption {
  id: string;
  layer: LayerType;
  /** Thai, because it is read by the person choosing it. */
  name: string;
  description?: string;
  /** Which races this fits. Undefined means any — most clothes do not care what wears them. */
  race?: AvatarRace[];
  element?: AvatarElement;
  /** Searchable keywords. English is allowed here; the name is not. */
  tags: string[];
  /** Points, through the same purse the outfits already use. Absent means free. */
  price?: number;
  /*
   * The pieces that have to be owned before this can be worn, and the ids the till sells.
   *
   * A trait can name two things at once — a haircut and a hat — and charging for the pair would
   * mean buying the same hat again for every haircut it goes with. So the unit of ownership is the
   * piece: the base half and the worn half are bought separately, each then wearable with anything.
   * Absent, or empty, means nothing to buy.
   */
  unlockKeys?: string[];
  /** Layers this trait covers, so the compositor never draws one thing through another. */
  hides?: LayerType[];
  /** Which of the six tints this trait actually reads, for the colour drawer to offer. */
  tintable: Array<keyof AvatarTints>;
}

export interface AvatarConfigV2 extends AvatarConfig {
  /** Present only on configs written by this version or later. Its absence is the version-1 test. */
  v?: 2;
  race?: AvatarRace;
  element?: AvatarElement;
  layers?: Partial<Record<LayerType, string>>;
  tints?: Partial<AvatarTints>;
  animationSet?: 'standard' | 'mage' | 'warrior' | 'beast' | 'spirit';
  /**
   * The figure the traits are arranged on. Absent on a record written before bodies existed, which
   * reads as "whichever body this race draws" rather than as an error.
   */
  bodyArchetype?: FullBodyArchetype;
}

/** True when a config carries version-2 work. A legacy config is not "invalid"; it is complete. */
export function isConfigV2(config: AvatarConfig | AvatarConfigV2 | null | undefined): config is AvatarConfigV2 {
  if (!config) return false;
  const candidate = config as AvatarConfigV2;
  return candidate.v === 2 || Boolean(candidate.layers) || Boolean(candidate.tints);
}

function pick<T>(items: readonly T[], index: number): T {
  const size = items.length;
  return items[((Math.trunc(index) % size) + size) % size]!;
}

/**
 * The race a legacy avatar was always drawing, made explicit.
 *
 * The old catalogue had no notion of race — it had thirteen themes, five of which happened to draw
 * an animal. Reading that back out is not a guess: the theme's own `kind` says so.
 */
export function raceForArchetype(archetype: number): AvatarRace {
  return pick(avatarThemes, archetype).kind === 'animal' ? 'beastfolk' : 'human';
}

/**
 * A version-1 config read as version 2, without changing what it draws.
 *
 * This never adds layers. It fills in the facts the old shape implied — which race it was already
 * drawing, and which six colours it was already made of — so the customiser has something to open,
 * and leaves the drawing to the legacy renderer until somebody actually changes a layer. That is
 * the whole reason the two can coexist: migrating is describing, not repainting.
 */
export function migrateConfig(legacy: AvatarConfig): AvatarConfigV2 {
  const theme = pick(avatarThemes, legacy.archetype);
  const palette = pick(avatarPalettes, legacy.palette);
  const hair = pick(hairStyles, legacy.hair);
  return {
    ...legacy,
    v: 2,
    race: raceForArchetype(legacy.archetype),
    element: 'none',
    tints: {
      skin: pick(skinTones, legacy.skinTone),
      hair: hair.color,
      primary: palette.primary,
      secondary: theme.primary,
      accent: palette.accent,
      magic: theme.accent
    },
    animationSet: 'standard'
  };
}

/**
 * The object that goes into JSONB.
 *
 * Undefined keys are dropped rather than serialised as null, because a null in `avatar_config` is a
 * value a reader has to interpret while a missing key is simply the default — and the column is
 * merged into by an RPC that a student is allowed to call, so the fewer shapes it can hold the
 * fewer there are to validate.
 */
export function configToJson(config: AvatarConfigV2): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = Object.fromEntries(Object.entries(value).filter(([, inner]) => inner !== undefined));
      if (Object.keys(nested).length > 0) json[key] = nested;
      continue;
    }
    json[key] = value;
  }
  return json;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shades
 *
 * Six per material, and five of them derived. A sprite names one colour; the shadow, the highlight
 * and the outline come from it by moving lightness in fixed steps, which is what keeps two hundred
 * traits drawn by different hands looking like they are lit by the same lamp. The steps are coarse
 * on purpose — this is an 8-bit drawing, and a ramp with forty stops in it stops reading as pixels.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Hsl { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = (p: number, q: number, t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  let r = l; let g = l; let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Lightness snapped to twentieths, so the whole app draws from the same twenty steps. */
const snap = (value: number) => Math.round(Math.min(0.98, Math.max(0.04, value)) * 20) / 20;

export function shadeOf(hex: string, steps: number): string {
  const { h, s, l } = hexToHsl(hex);
  // Saturation rises a little into shadow and falls into light, which is what stops a darkened
  // colour reading as grey and a lightened one as chalk.
  const saturation = Math.min(1, Math.max(0, s + (steps < 0 ? 0.06 : -0.05) * Math.abs(steps)));
  return hslToHex({ h, s: saturation, l: snap(l + steps * 0.09) });
}

/** The six shades a material is allowed: outline, shadow, base, highlight, and two accents. */
export interface MaterialShades {
  outline: string;
  shadow: string;
  base: string;
  highlight: string;
}

export function shadesFor(hex: string): MaterialShades {
  return {
    outline: shadeOf(hex, -3),
    shadow: shadeOf(hex, -1),
    base: hex,
    highlight: shadeOf(hex, 1)
  };
}

/** The one dark line every sprite is outlined with, so the set reads as one drawing. */
export const PIXEL_OUTLINE = '#1a1030';

export const defaultTints: AvatarTints = {
  skin: skinTones[0],
  hair: hairStyles[0]!.color,
  primary: avatarPalettes[0].primary,
  secondary: avatarThemes[0]!.primary,
  accent: avatarPalettes[0].accent,
  magic: avatarThemes[0]!.accent
};

/**
 * The custom properties a sprite reads.
 *
 * Every `<rect fill="var(--av-primary)">` in every layer resolves through this one object, which is
 * what makes recolouring a change of six strings rather than a redraw of two hundred drawings.
 */
export function tintVariables(tints: Partial<AvatarTints> | undefined): Record<string, string> {
  const resolved: AvatarTints = { ...defaultTints, ...(tints ?? {}) };
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolved)) {
    const shades = shadesFor(value);
    variables[`--av-${key}`] = shades.base;
    variables[`--av-${key}-shadow`] = shades.shadow;
    variables[`--av-${key}-highlight`] = shades.highlight;
    variables[`--av-${key}-outline`] = shades.outline;
  }
  variables['--av-outline'] = PIXEL_OUTLINE;
  return variables;
}
