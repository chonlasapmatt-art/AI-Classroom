import type { AvatarConfigV2, AvatarElement, AvatarRace } from './avatarSchema';
import { traitsForLayer, type Trait } from './avatarTraits';
import { avatarPalettes, avatarThemes, skinTones } from './avatarThemes';

/**
 * The avatars nobody had to assemble.
 *
 * A trait drawer is the right tool for somebody who knows what they want. It is the wrong first
 * screen for a ten-year-old who wants to be a dragon: nine drawers, each a hundred deep, and no
 * answer to "what does a dragon look like". So the catalogue is finished characters — pick one,
 * press save, done — and the drawers are underneath for whoever keeps going.
 *
 * ── They are generated, and that is the point ──
 * Eight hundred and forty hand-written entries would be eight hundred and forty chances to pair a
 * wizard hat with a spacesuit, and a table nobody would ever finish reading. These come from the
 * same trait tables the drawers do, walked with different strides so that neighbours differ in more
 * than one place, and filtered so that what comes out is a character rather than a collision:
 * a mage carries a staff, a dragon has wings, and a robot is not wearing a kimono.
 *
 * ── Deterministic, because ids are stored ──
 * `avatar_384` is written into a student record, and it has to mean the same thing next term and on
 * every device. Nothing here reads a clock or a random seed: entry *n* is a pure function of *n* and
 * of the order of the tables. Appending to a table is safe; reordering one is not, which is the same
 * rule the legacy indexes have always had.
 */
export interface GeneratedAvatar {
  index: number;
  name: string;
  category: GeneratedCategory;
  config: AvatarConfigV2;
  keywords: string[];
}

export type GeneratedCategory =
  | 'mage' | 'dragon' | 'demon' | 'animal' | 'techwear' | 'steampunk' | 'spirit' | 'robot' | 'classic';

/** How many finished characters the catalogue offers beyond the original 160. */
export const GENERATED_COUNT = 840;

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];
const elements: AvatarElement[] = ['fire', 'ice', 'lightning', 'shadow', 'nature', 'star', 'cyber', 'none'];

/* The tables, read once. Filtering nine layers eight hundred times is the difference between a
   module that loads in a frame and one a person waits for. */
const hairs = traitsForLayer('hair_headpiece');
const faces = traitsForLayer('face_features');
const tops = traitsForLayer('top_clothing');
const bottoms = traitsForLayer('bottom_clothing');
const backs = traitsForLayer('back_accessory');
const fronts = traitsForLayer('front_accessory');
const auraList = traitsForLayer('back_aura');
const fxList = traitsForLayer('front_fx');

const at = <T,>(items: T[], index: number): T => items[((index % items.length) + items.length) % items.length]!;

/**
 * A mixed number, because a stride is not the same thing as a spread.
 *
 * Picking with `index * 5` looks like variety and is not: against a table of twenty-five it only
 * ever reaches five of them — every multiple of five and nothing else — so twenty of the twenty-five
 * tops, the mage robe among them, could never be worn by anybody. The chip labelled "นักเวทย์" came
 * out empty, which is how the arithmetic gave itself away.
 *
 * A bit-mixing hash has no such relationship with the length of the table it indexes: it spreads
 * across whatever it is given, and it is still a pure function of the index, which is what the ids
 * depend on.
 */
function mix(seed: number, salt: number): number {
  let value = (Math.imul(seed, 0x9e3779b1) + Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d) >>> 0;
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}
const has = (trait: Trait, tag: string) => trait.tags.includes(tag);

/**
 * What each race is likely to be wearing.
 *
 * Not a hard rule — a dragon in a lab coat is a fine joke and the drawers allow it — but a generated
 * set has to read as characters rather than as a shuffle, so the pool each race draws from is
 * narrowed to what makes it recognisable. A dragon that comes out with no horns and no wings is
 * simply a person, and the catalogue is where somebody goes to find a dragon.
 */
function poolFor(race: AvatarRace) {
  switch (race) {
    case 'dragonkin':
      return {
        hair: hairs.filter((trait) => has(trait, 'horn') || has(trait, 'dragon')),
        back: backs.filter((trait) => has(trait, 'wing') || has(trait, 'tail')),
        top: tops.filter((trait) => !has(trait, 'lab') && !has(trait, 'chef'))
      };
    case 'demon':
      return {
        hair: hairs.filter((trait) => has(trait, 'horn') || has(trait, 'demon')),
        back: backs.filter((trait) => has(trait, 'tail') || has(trait, 'wing') || has(trait, 'cape')),
        top: tops.filter((trait) => !has(trait, 'chef'))
      };
    case 'beastfolk':
      return {
        hair: hairs.filter((trait) => has(trait, 'beast')),
        back: backs.filter((trait) => has(trait, 'tail')),
        top: tops
      };
    case 'spirit':
      return {
        hair: hairs.filter((trait) => has(trait, 'halo') || !has(trait, 'horn')),
        // A ghost has no legs to hang a cape from; it wears light instead.
        back: backs.filter((trait) => has(trait, 'none') || has(trait, 'wing') || has(trait, 'book')),
        top: tops.filter((trait) => !has(trait, 'armor'))
      };
    case 'robot':
      return {
        hair: hairs.filter((trait) => !has(trait, 'horn') && !has(trait, 'beast')),
        back: backs.filter((trait) => has(trait, 'tech') || has(trait, 'jetpack') || has(trait, 'none') || has(trait, 'bag')),
        top: tops.filter((trait) => !has(trait, 'kimono') && !has(trait, 'druid'))
      };
    case 'human':
    default:
      return { hair: hairs, back: backs, top: tops };
  }
}

const pools = new Map(races.map((race) => [race, poolFor(race)]));

/* ── the words a character is named with ── */
const raceWords: Record<AvatarRace, string> = {
  human: '', dragonkin: 'มังกร', demon: 'ปีศาจ', beastfolk: 'สัตว์', spirit: 'วิญญาณ', robot: 'หุ่นยนต์'
};

const elementWords: Record<AvatarElement, string> = {
  fire: 'ไฟ', ice: 'น้ำแข็ง', lightning: 'สายฟ้า', shadow: 'เงา',
  nature: 'ป่า', star: 'แสงดาว', cyber: 'ไซเบอร์', none: ''
};

/** The class a character reads as, taken from what it is wearing rather than stored separately. */
function classWordFor(top: Trait, front: Trait): string {
  if (has(top, 'mage') || has(front, 'mage')) return 'จอมเวทย์';
  if (has(top, 'armor') || has(front, 'warrior')) return 'นักรบ';
  if (has(top, 'ninja')) return 'นินจา';
  if (has(top, 'pirate')) return 'กัปตัน';
  if (has(top, 'space')) return 'นักบิน';
  if (has(top, 'lab') || has(front, 'science')) return 'นักวิทย์';
  if (has(top, 'chef')) return 'เชฟ';
  if (has(top, 'steampunk')) return 'ช่างกล';
  if (has(top, 'techwear') || has(top, 'cyber')) return 'นักเจาะระบบ';
  if (has(top, 'ศิลปะ') || has(front, 'art')) return 'ศิลปิน';
  if (has(top, 'music') || has(top, 'ดนตรี')) return 'นักดนตรี';
  if (has(top, 'nature') || has(top, 'ธรรมชาติ')) return 'ผู้พิทักษ์ป่า';
  if (has(top, 'กีฬา') || has(front, 'sport')) return 'นักกีฬา';
  return 'นักเรียน';
}

/** Which beast, when the race is one. The muzzle is the same; the tail is what names it. */
function beastWord(back: Trait): string {
  if (has(back, 'kitsune')) return 'จิ้งจอกเก้าหาง';
  if (has(back, 'wolf')) return 'หมาป่า';
  return 'สัตว์';
}

/**
 * Which chip a character sits behind.
 *
 * The costume wins over the race for the two chips that *are* a costume. A dragon in full wizard
 * robes with a staff is what somebody opening "นักเวทย์" is looking for, and filing it under "มังกร"
 * because of its horns left that chip with eleven entries out of a thousand — the arithmetic is
 * simple once written down: mages could only be human, humans are a sixth of the set, and two of the
 * twenty-five tops are robes.
 *
 * Everything else is the race, because that is the thing a person recognises first.
 */
const categoryFor = (race: AvatarRace, top: Trait, front: Trait, element: AvatarElement): GeneratedCategory => {
  // Read the same way the name is: a character called จอมเวทย์ because of the staff it carries must
  // not be filed under คลาสสิก, or the chip and the label under the tile disagree in front of a child.
  if (has(top, 'mage') || has(front, 'mage')) return 'mage';
  if (has(top, 'steampunk')) return 'steampunk';
  if (race === 'dragonkin') return 'dragon';
  if (race === 'demon') return 'demon';
  if (race === 'spirit') return 'spirit';
  if (race === 'robot') return 'robot';
  if (race === 'beastfolk') return 'animal';
  if (has(top, 'techwear') || has(top, 'cyber') || element === 'cyber') return 'techwear';
  return 'classic';
};

/**
 * The signature of a look.
 *
 * Two entries that resolve to the same layers and the same six colours are the same avatar wearing
 * two ids, which is the one thing a catalogue of a thousand must not contain — a person scrolling
 * past the same face four times stops believing there are a thousand.
 */
export function lookSignature(config: AvatarConfigV2): string {
  const layers = Object.entries(config.layers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const tints = Object.entries(config.tints ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${config.race}|${layers.map(([k, v]) => `${k}=${v}`).join(',')}|${tints.map(([k, v]) => `${k}=${v}`).join(',')}`;
}

/**
 * One character, built from an index.
 *
 * The strides are coprime-ish rather than sequential so that `avatar_400` and `avatar_401` differ in
 * hair, face, clothes and colour at once. Walking one axis at a time produces a hundred avatars in a
 * row wearing the same shirt, which reads as a bug in the generator even when it is not.
 */
function buildAt(index: number, salt: number): { name: string; category: GeneratedCategory; config: AvatarConfigV2; keywords: string[] } {
  const step = index + salt * 977;
  const race = at(races, step);
  const element = at(elements, Math.floor(step / 6) + salt);
  const pool = pools.get(race)!;

  const hair = at(pool.hair.length > 0 ? pool.hair : hairs, mix(step, salt + 1));
  const face = at(faces, mix(step, salt + 2));
  const top = at(pool.top.length > 0 ? pool.top : tops, mix(step, salt + 3));
  const bottom = at(bottoms, mix(step, salt + 4));
  const back = at(pool.back.length > 0 ? pool.back : backs, mix(step, salt + 5));
  const front = at(fronts, mix(step, salt + 6));
  // An aura and an effect only when the character has an element to show, so a plain student is not
  // standing in a cloud of sparks.
  const aura = element === 'none' ? at(auraList, 0) : at(auraList.filter((trait) => !trait.element || trait.element === element), mix(step, salt + 7));
  const fx = element === 'none' ? at(fxList, 0) : at(fxList.filter((trait) => !trait.element || trait.element === element), mix(step, salt + 8));

  const palette = at([...avatarPalettes], mix(step, salt + 9));
  const theme = at(avatarThemes, mix(step, salt + 10));
  const config: AvatarConfigV2 = {
    // The legacy fields still resolve a backdrop and remain readable by an older build.
    archetype: avatarThemes.indexOf(theme),
    palette: avatarPalettes.indexOf(palette),
    skinTone: mix(step, salt + 14) % skinTones.length,
    hair: mix(step, salt + 15) % 6,
    accessory: 0,
    badge: 0,
    v: 2,
    race,
    element,
    animationSet: 'standard',
    layers: {
      hair_headpiece: hair.id,
      face_features: face.id,
      top_clothing: top.id,
      bottom_clothing: bottom.id,
      back_accessory: back.id,
      front_accessory: front.id,
      back_aura: aura.id,
      front_fx: fx.id
    },
    tints: {
      skin: at([...skinTones], mix(step, salt + 11)),
      hair: at(['#2f2a44', '#4a2f22', '#1f1b2e', '#7b3f22', '#3b2a1d', '#243b6b', '#b45309', '#0f766e'], mix(step, salt + 12)),
      primary: palette.primary,
      secondary: theme.primary,
      accent: palette.accent,
      magic: theme.accent
    }
  };

  const classWord = classWordFor(top, front);
  const raceWord = race === 'beastfolk' ? beastWord(back) : raceWords[race];
  const elementWord = elementWords[element];
  const templates = [
    `${classWord}${raceWord}${elementWord}`,
    `${raceWord || classWord}${elementWord}`,
    `${raceWord}${classWord}` || classWord,
    `${classWord}${elementWord}`
  ];
  const name = (at(templates, mix(step, salt + 13)) || classWord).trim();

  return {
    name,
    category: categoryFor(race, top, front, element),
    config,
    keywords: [...new Set([race, element, ...hair.tags, ...face.tags, ...top.tags, ...back.tags, ...front.tags])]
  };
}

/**
 * The generated half of the catalogue.
 *
 * Built once at module load — eight hundred small objects, no drawing — and de-duplicated as it
 * goes: when a look repeats, the salt advances and the entry is built again, so the result is both
 * unique and still a pure function of the index.
 */
export const generatedAvatars: GeneratedAvatar[] = (() => {
  const seen = new Set<string>();
  const names = new Map<string, number>();
  const out: GeneratedAvatar[] = [];

  for (let index = 0; index < GENERATED_COUNT; index += 1) {
    let built = buildAt(index, 0);
    let salt = 1;
    while (seen.has(lookSignature(built.config)) && salt < 40) {
      built = buildAt(index, salt);
      salt += 1;
    }
    seen.add(lookSignature(built.config));

    // A repeated name is not a repeated avatar, but four "จอมเวทย์ไฟ" in a grid look like a mistake.
    const used = names.get(built.name) ?? 0;
    names.set(built.name, used + 1);
    const name = used === 0 ? built.name : `${built.name} ${used + 1}`;

    out.push({ index, name, category: built.category, config: built.config, keywords: built.keywords });
  }
  return out;
})();
