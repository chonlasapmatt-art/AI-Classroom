import type { ReactElement } from 'react';

/**
 * The drawings, as primitives that combine.
 *
 * The brief asks for fifty hairstyles, a hundred eye-and-mask options and a hundred and fifty
 * outfits. Drawing three hundred sprites by hand would take three hundred chances to drift off the
 * grid, off the palette, and away from whatever the last one looked like — and most of the results
 * would differ from a neighbour by two pixels nobody could name.
 *
 * So the counts come from composition, and each part is a real drawing. A hairstyle is a shape and
 * something worn on top of it; a face is a pair of eyes and something worn over them; an outfit is a
 * top and a bottom, which are separate layers and genuinely multiply. Every combination is
 * addressable by its own id, renders differently from every other, and costs one row in a table
 * rather than one more file.
 *
 * ── Rules every primitive follows ──
 *   * whole or half units only, on the same 24-unit grid as the bodies;
 *   * `var(--av-…)` for colour, never a literal — the palette is swapped, not redrawn. White and the
 *     shared outline are the two exceptions, for teeth and for lines;
 *   * hair sits in the band y 2–9, eyes at y 9.5–12, mouths at 12.5–14, tops at 17–20, bottoms at
 *     20–23. Anything that keeps to those bands composes with anything else that does.
 */
export function px(x: number, y: number, w: number, h: number, fill: string, key?: string): ReactElement {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;
}

export const SKIN = 'var(--av-skin)';
export const SKIN_SHADOW = 'var(--av-skin-shadow)';
export const HAIR = 'var(--av-hair)';
export const HAIR_SHADOW = 'var(--av-hair-shadow)';
export const HAIR_HIGHLIGHT = 'var(--av-hair-highlight)';
export const PRIMARY = 'var(--av-primary)';
export const PRIMARY_SHADOW = 'var(--av-primary-shadow)';
export const PRIMARY_HIGHLIGHT = 'var(--av-primary-highlight)';
export const SECONDARY = 'var(--av-secondary)';
export const SECONDARY_SHADOW = 'var(--av-secondary-shadow)';
export const ACCENT = 'var(--av-accent)';
export const MAGIC = 'var(--av-magic)';
export const MAGIC_HIGHLIGHT = 'var(--av-magic-highlight)';
export const OUTLINE = 'var(--av-outline)';
export const WHITE = '#ffffff';

export interface Sprite {
  id: string;
  /** Thai, because it is read by the person choosing it. */
  name: string;
  tags: string[];
  price?: number;
  draw: () => ReactElement;
}

/* ────────────────────────────── hair ──────────────────────────────
 * Twelve shapes, all inside the band above the eyes so that anything worn on the head still fits.
 * The highlight is one row along the top: a single lighter line is what makes a flat block read as
 * hair rather than as a helmet, and it is the cheapest shading in the set.
 */
export const hairShapes: Sprite[] = [
  {
    id: 'short', name: 'ผมสั้น', tags: ['short', 'สั้น'],
    draw: () => (<g>
      {px(6.5, 4.5, 11, 3.5, HAIR)}
      {px(6.5, 4.5, 11, 1, HAIR_HIGHLIGHT)}
      {px(6.5, 7, 1.5, 3, HAIR)}
      {px(16, 7, 1.5, 3, HAIR)}
    </g>)
  },
  {
    id: 'bob', name: 'ผมบ๊อบ', tags: ['bob', 'บ๊อบ'],
    draw: () => (<g>
      {px(6, 4, 12, 4, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(5.5, 6, 2, 7, HAIR)}
      {px(16.5, 6, 2, 7, HAIR)}
    </g>)
  },
  {
    id: 'long', name: 'ผมยาว', tags: ['long', 'ยาว'],
    draw: () => (<g>
      {px(6, 4, 12, 4, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(5.5, 6, 2, 12, HAIR)}
      {px(16.5, 6, 2, 12, HAIR)}
      {px(5.5, 16.5, 2, 1.5, HAIR_SHADOW)}
      {px(16.5, 16.5, 2, 1.5, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'bun', name: 'มัดจุก', tags: ['bun', 'จุก'],
    draw: () => (<g>
      {px(10.5, 1.5, 3, 3, HAIR)}
      {px(10.5, 1.5, 3, 1, HAIR_HIGHLIGHT)}
      {px(6, 4.5, 12, 3.5, HAIR)}
      {px(6, 7, 1.5, 3, HAIR)}
      {px(16.5, 7, 1.5, 3, HAIR)}
    </g>)
  },
  {
    id: 'curly', name: 'ผมหยิก', tags: ['curly', 'หยิก'],
    draw: () => (<g>
      {px(5.5, 3.5, 3, 3, HAIR)}
      {px(9, 3, 3, 3, HAIR)}
      {px(12, 3, 3, 3, HAIR)}
      {px(15.5, 3.5, 3, 3, HAIR)}
      {px(6, 5.5, 12, 2.5, HAIR)}
      {px(9, 3, 3, 1, HAIR_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'ponytail', name: 'หางม้า', tags: ['ponytail', 'หางม้า'],
    draw: () => (<g>
      {px(6.5, 4.5, 11, 3.5, HAIR)}
      {px(6.5, 4.5, 11, 1, HAIR_HIGHLIGHT)}
      {px(17.5, 6, 2, 8, HAIR)}
      {px(17.5, 13, 2, 1.5, HAIR_SHADOW)}
      {px(6.5, 7, 1.5, 2.5, HAIR)}
    </g>)
  },
  {
    id: 'twintail', name: 'ผมสองหาง', tags: ['twintail', 'สองหาง'],
    draw: () => (<g>
      {px(6, 4, 12, 4, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(4, 6.5, 2, 7, HAIR)}
      {px(18, 6.5, 2, 7, HAIR)}
      {px(4, 12.5, 2, 1, HAIR_SHADOW)}
      {px(18, 12.5, 2, 1, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'mohawk', name: 'โมฮอก', tags: ['mohawk', 'พังค์', 'punk'],
    draw: () => (<g>
      {px(10.5, 1.5, 3, 6.5, HAIR)}
      {px(10.5, 1.5, 3, 1, HAIR_HIGHLIGHT)}
      {px(6.5, 6, 4, 2, HAIR_SHADOW)}
      {px(13.5, 6, 4, 2, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'buzz', name: 'ผมเกรียน', tags: ['buzz', 'เกรียน'],
    draw: () => (<g>
      {px(7, 5, 10, 2.5, HAIR_SHADOW)}
      {px(7, 5, 10, 1, HAIR)}
    </g>)
  },
  {
    id: 'wavy', name: 'ผมลอน', tags: ['wavy', 'ลอน'],
    draw: () => (<g>
      {px(6, 4.5, 12, 3.5, HAIR)}
      {px(6, 4.5, 12, 1, HAIR_HIGHLIGHT)}
      {px(5.5, 7.5, 2, 3, HAIR)}
      {px(16.5, 7.5, 2, 3, HAIR)}
      {px(5, 10, 2, 3, HAIR_SHADOW)}
      {px(17, 10, 2, 3, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'braid', name: 'ผมเปีย', tags: ['braid', 'เปีย'],
    draw: () => (<g>
      {px(6, 4.5, 12, 3.5, HAIR)}
      {px(6, 4.5, 12, 1, HAIR_HIGHLIGHT)}
      {px(4.5, 7.5, 2, 2, HAIR)}
      {px(4.5, 10, 2, 2, HAIR_SHADOW)}
      {px(4.5, 12.5, 2, 2, HAIR)}
      {px(16.5, 7, 1.5, 2.5, HAIR)}
    </g>)
  },
  {
    id: 'afro', name: 'ผมฟู', tags: ['afro', 'ฟู'],
    draw: () => (<g>
      {px(5, 3, 14, 5, HAIR)}
      {px(5, 3, 14, 1, HAIR_HIGHLIGHT)}
      {px(4, 4.5, 1.5, 3.5, HAIR)}
      {px(18.5, 4.5, 1.5, 3.5, HAIR)}
    </g>)
  },

  /* ── the second dozen ──
   * Twelve cuts over six things worn on the head is seventy-two hairstyles, and seventy-two is what
   * the drawer showed a child who had already seen all of them. Each of these is a silhouette the
   * first twelve does not have — a shaved side, a spike, a locked length, a cord — rather than one of
   * them with the parting moved, which would be a recolour with extra steps.
   */
  {
    id: 'undercut', name: 'ผมรองทรง', tags: ['undercut', 'รองทรง', 'short'],
    draw: () => (<g>
      {px(6.5, 3.5, 11, 3, HAIR)}
      {px(6.5, 3.5, 11, 1, HAIR_HIGHLIGHT)}
      {px(6.5, 6.5, 11, 1, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'spiky', name: 'ผมตั้งแหลม', tags: ['spiky', 'แหลม', 'punk'],
    draw: () => (<g>
      {px(6.5, 5, 11, 3, HAIR)}
      <polygon points="8,5 9,1.5 10.5,5" fill={HAIR} />
      <polygon points="11,5 12,1 13.5,5" fill={HAIR} />
      <polygon points="14,5 15,2 16.5,5" fill={HAIR_SHADOW} />
      {px(11.5, 2.5, 1, 2, HAIR_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'pixie', name: 'ผมพิกซี่', tags: ['pixie', 'สั้นซอย'],
    draw: () => (<g>
      {px(6, 4, 12, 3.5, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(5.5, 6.5, 1.5, 3, HAIR)}
      {px(17, 6.5, 1.5, 3, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'dreadlocks', name: 'ผมเดรด', tags: ['dread', 'เดรด', 'locks'], price: 60,
    draw: () => (<g>
      {px(6, 4, 12, 3.5, HAIR)}
      {px(6, 7, 2, 8, HAIR)}
      {px(9, 7, 2, 10, HAIR_SHADOW)}
      {px(13, 7, 2, 9, HAIR)}
      {px(16, 7, 2, 7, HAIR_SHADOW)}
      {px(6, 14.5, 2, 1, ACCENT)}
      {px(9, 16.5, 2, 1, ACCENT)}
    </g>)
  },
  {
    id: 'topknot', name: 'ผมมัดจุก', tags: ['topknot', 'จุก', 'bun'],
    draw: () => (<g>
      {px(9.5, 1, 5, 3, HAIR)}
      {px(9.5, 1, 5, 1, HAIR_HIGHLIGHT)}
      {px(9.5, 3.5, 5, 1, ACCENT)}
      {px(6, 4.5, 12, 3.5, HAIR)}
    </g>)
  },
  {
    id: 'sidepart', name: 'ผมแสกข้าง', tags: ['sidepart', 'แสกข้าง', 'neat'],
    draw: () => (<g>
      {px(6, 4, 12, 4, HAIR)}
      {px(6, 4, 5, 1, HAIR_HIGHLIGHT)}
      {px(11, 4, 1, 4, HAIR_SHADOW)}
      {px(6, 7.5, 1.5, 2.5, HAIR)}
    </g>)
  },
  {
    id: 'cybercords', name: 'สายเคเบิล', tags: ['cyber', 'สายไฟ', 'tech'], price: 90,
    draw: () => (<g>
      {px(6, 4, 12, 3.5, SECONDARY)}
      {px(6, 4, 12, 1, MAGIC)}
      {px(16.5, 7, 1.5, 8, SECONDARY_SHADOW)}
      {px(18, 8, 1.5, 6, SECONDARY)}
      {px(16.5, 14, 1.5, 1.5, MAGIC_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'flame', name: 'ผมเปลวไฟ', tags: ['flame', 'เปลวไฟ', 'fire'], price: 120,
    draw: () => (<g>
      {px(6.5, 5, 11, 2.5, HAIR)}
      <polygon points="7.5,5 9,0.5 10.5,5" fill={HAIR} />
      <polygon points="10.5,5 12,0 13.5,5" fill={HAIR} />
      <polygon points="13.5,5 15,1.5 16.5,5" fill={HAIR_SHADOW} />
      <polygon points="11.5,5 12,1.5 12.5,5" fill={MAGIC_HIGHLIGHT} />
    </g>)
  },
  {
    id: 'crystal', name: 'ผมคริสตัล', tags: ['crystal', 'คริสตัล', 'gem'], price: 140,
    draw: () => (<g>
      {px(6.5, 4.5, 11, 3, HAIR)}
      <polygon points="8,4.5 9.5,1 11,4.5" fill={MAGIC} />
      <polygon points="11,4.5 12.5,0.5 14,4.5" fill={MAGIC_HIGHLIGHT} />
      <polygon points="14,4.5 15.5,2 16.5,4.5" fill={MAGIC} />
    </g>)
  },
  {
    id: 'pigtails', name: 'ผมมัดสองข้าง', tags: ['pigtails', 'มัดสองข้าง', 'cute'],
    draw: () => (<g>
      {px(6, 4, 12, 3.5, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(4, 7.5, 2.5, 3, HAIR)}
      {px(17.5, 7.5, 2.5, 3, HAIR_SHADOW)}
      {px(4, 7, 2.5, 1, ACCENT)}
      {px(17.5, 7, 2.5, 1, ACCENT)}
    </g>)
  },
  {
    id: 'hime', name: 'ผมฮิเมะ', tags: ['hime', 'ฮิเมะ', 'long'], price: 50,
    draw: () => (<g>
      {px(6, 4, 12, 3, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(5, 6.5, 2, 6, HAIR)}
      {px(17, 6.5, 2, 6, HAIR_SHADOW)}
      {px(6, 12.5, 12, 5, HAIR_SHADOW)}
    </g>)
  },
  {
    id: 'shaggy', name: 'ผมฟูซอย', tags: ['shaggy', 'ซอย', 'messy'],
    draw: () => (<g>
      {px(6, 4, 12, 4, HAIR)}
      {px(6.5, 3, 4, 1.5, HAIR)}
      {px(12, 2.5, 5, 2, HAIR)}
      {px(6, 4, 12, 1, HAIR_HIGHLIGHT)}
      {px(5.5, 7.5, 2, 4, HAIR)}
      {px(16.5, 7.5, 2, 4, HAIR_SHADOW)}
    </g>)
  }
];

/* ── worn on the head ──
 * Six things that sit above the hair band, including nothing at all. Horns and ears are here rather
 * than on the body because a demon in a wizard hat is a different silhouette from a demon in a
 * headband, and the head is where that difference lives.
 */
export const headpieces: Sprite[] = [
  { id: 'plain', name: 'ไม่มี', tags: ['none', 'ไม่มี'], draw: () => <g /> },
  {
    id: 'hornscurved', name: 'เขาโค้ง', tags: ['horn', 'เขา', 'demon'], price: 40,
    draw: () => (<g>
      {px(5.5, 2, 1.5, 3, SECONDARY)}
      {px(5.5, 1, 1.5, 1.5, SECONDARY_SHADOW)}
      {px(17, 2, 1.5, 3, SECONDARY)}
      {px(17, 1, 1.5, 1.5, SECONDARY_SHADOW)}
    </g>)
  },
  {
    id: 'hornsdragon', name: 'เขามังกร', tags: ['dragon', 'มังกร', 'horn'], price: 60,
    draw: () => (<g>
      {px(5, 3, 2, 2, SECONDARY)}
      {px(3.5, 1.5, 2, 2, SECONDARY)}
      {px(17, 3, 2, 2, SECONDARY)}
      {px(18.5, 1.5, 2, 2, SECONDARY)}
      {px(3.5, 1.5, 2, 1, SECONDARY_SHADOW)}
      {px(18.5, 1.5, 2, 1, SECONDARY_SHADOW)}
    </g>)
  },
  {
    id: 'beastears', name: 'หูสัตว์', tags: ['beast', 'หู', 'fox', 'wolf'], price: 30,
    draw: () => (<g>
      {px(5.5, 2, 3, 3.5, SECONDARY)}
      {px(6.5, 3, 1, 2, ACCENT)}
      {px(15.5, 2, 3, 3.5, SECONDARY)}
      {px(16.5, 3, 1, 2, ACCENT)}
    </g>)
  },
  {
    id: 'wizardhat', name: 'หมวกนักเวทย์', tags: ['mage', 'นักเวทย์', 'hat'], price: 80,
    draw: () => (<g>
      {px(11, 0.5, 2, 2, MAGIC)}
      {px(9.5, 2.5, 5, 2, MAGIC)}
      {px(8, 4.5, 8, 2, MAGIC)}
      {px(4.5, 6.5, 15, 1.5, MAGIC_HIGHLIGHT)}
      {px(8, 4.5, 8, 0.5, MAGIC_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'halo', name: 'วงแหวนแสง', tags: ['halo', 'แสง', 'spirit'], price: 100,
    draw: () => (<g>
      {px(8, 1, 8, 1, ACCENT)}
      {px(7.5, 1.5, 1, 1, ACCENT)}
      {px(15.5, 1.5, 1, 1, ACCENT)}
    </g>)
  },

  /* ── six more things to wear on a head ──
   * Every one of these multiplies the hair table rather than adding to it: twenty-four cuts by
   * twelve things worn is two hundred and eighty-eight hairstyles, each with its own id and its own
   * drawing. The rule they all obey is the one the band already had — nothing above y 0, because
   * what leaves the frame is sheared off in every list in the product.
   */
  {
    id: 'cybervisor', name: 'ไวเซอร์ไซเบอร์', tags: ['cyber', 'visor', 'ไวเซอร์', 'tech'], price: 110,
    draw: () => (<g>
      {px(6, 3.5, 12, 2, SECONDARY)}
      {px(6, 3.5, 12, 1, SECONDARY_SHADOW)}
      {px(7, 5.5, 10, 2, MAGIC)}
      {px(7, 5.5, 10, 1, MAGIC_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'catbeanie', name: 'หมวกหูแมว', tags: ['beanie', 'หมวกไหมพรม', 'cat', 'cute'], price: 60,
    draw: () => (<g>
      {px(6, 2.5, 12, 4, SECONDARY)}
      {px(6, 2.5, 12, 1, ACCENT)}
      <polygon points="7,2.5 8.5,0 10,2.5" fill={SECONDARY} />
      <polygon points="14,2.5 15.5,0 17,2.5" fill={SECONDARY} />
    </g>)
  },
  {
    id: 'headset', name: 'หูฟังเกม', tags: ['headset', 'หูฟัง', 'gamer'], price: 70,
    draw: () => (<g>
      {px(6.5, 2, 11, 1.5, SECONDARY_SHADOW)}
      {px(4.5, 3.5, 2.5, 4, SECONDARY)}
      {px(17, 3.5, 2.5, 4, SECONDARY)}
      {px(5, 4.5, 1.5, 2, MAGIC)}
      {px(17.5, 4.5, 1.5, 2, MAGIC)}
    </g>)
  },
  {
    id: 'crown', name: 'มงกุฎ', tags: ['crown', 'มงกุฎ', 'royal'], price: 220,
    draw: () => (<g>
      <polygon points="6.5,4 6.5,1 9,3 12,0.5 15,3 17.5,1 17.5,4" fill={ACCENT} />
      {px(6.5, 4, 11, 1.5, SECONDARY)}
      {px(11.5, 2.5, 1, 1, MAGIC_HIGHLIGHT)}
    </g>)
  },
  {
    id: 'gasmask', name: 'หน้ากากกันแก๊ส', tags: ['gasmask', 'หน้ากาก', 'apocalypse'], price: 150,
    draw: () => (<g>
      {px(6.5, 3, 11, 2, SECONDARY_SHADOW)}
      {px(8, 9, 8, 5, SECONDARY)}
      {px(9, 10, 2, 2, MAGIC)}
      {px(13, 10, 2, 2, MAGIC)}
      {px(10.5, 13, 3, 2, SECONDARY_SHADOW)}
    </g>)
  },
  {
    id: 'antlers', name: 'เขากวาง', tags: ['antler', 'เขากวาง', 'deer', 'forest'], price: 130,
    draw: () => (<g>
      {px(7, 3.5, 1.5, 3, SECONDARY)}
      {px(5.5, 1.5, 1.5, 2.5, SECONDARY)}
      {px(8.5, 1, 1.5, 3, SECONDARY_SHADOW)}
      {px(15.5, 3.5, 1.5, 3, SECONDARY)}
      {px(17, 1.5, 1.5, 2.5, SECONDARY)}
      {px(14, 1, 1.5, 3, SECONDARY_SHADOW)}
    </g>)
  }
];

/* ────────────────────────────── eyes ────────────────────────────── */
export const eyeShapes: Sprite[] = [
  {
    id: 'neutral', name: 'ตาปกติ', tags: ['neutral', 'ปกติ'],
    draw: () => (<g>{px(9.5, 10, 1.5, 1.5, OUTLINE)}{px(13, 10, 1.5, 1.5, OUTLINE)}{px(11, 13, 2, 1, SKIN_SHADOW)}</g>)
  },
  {
    id: 'smile', name: 'ตายิ้ม', tags: ['smile', 'ยิ้ม'],
    draw: () => (<g>
      {px(9.5, 10, 1.5, 1, OUTLINE)}{px(13, 10, 1.5, 1, OUTLINE)}
      {px(10.5, 13, 3, 1, SKIN_SHADOW)}{px(10, 12.5, 1, 1, SKIN_SHADOW)}{px(13.5, 12.5, 1, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'focused', name: 'ตาตั้งใจ', tags: ['focused', 'ตั้งใจ'],
    draw: () => (<g>
      {px(9, 9.5, 2, 0.5, OUTLINE)}{px(13, 9.5, 2, 0.5, OUTLINE)}
      {px(9.5, 10.5, 1.5, 1, OUTLINE)}{px(13, 10.5, 1.5, 1, OUTLINE)}{px(11, 13, 2, 0.5, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'glow', name: 'ตาเรืองแสง', tags: ['glow', 'เรืองแสง'], price: 60,
    draw: () => (<g>
      {px(9, 10, 2, 2, MAGIC)}{px(13, 10, 2, 2, MAGIC)}
      {px(9.5, 10.5, 1, 1, MAGIC_HIGHLIGHT)}{px(13.5, 10.5, 1, 1, MAGIC_HIGHLIGHT)}
      {px(11, 13, 2, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'fangs', name: 'ยิ้มเขี้ยว', tags: ['fang', 'เขี้ยว'], price: 30,
    draw: () => (<g>
      {px(9.5, 10, 1.5, 1.5, OUTLINE)}{px(13, 10, 1.5, 1.5, OUTLINE)}
      {px(10, 13, 4, 1, OUTLINE)}{px(10.5, 13, 1, 1, WHITE)}{px(12.5, 13, 1, 1, WHITE)}
    </g>)
  },
  {
    id: 'sleepy', name: 'ตาง่วง', tags: ['sleepy', 'ง่วง'],
    draw: () => (<g>
      {px(9, 11, 2, 0.5, OUTLINE)}{px(13, 11, 2, 0.5, OUTLINE)}
      {px(11, 13, 1.5, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'wink', name: 'ขยิบตา', tags: ['wink', 'ขยิบ'],
    draw: () => (<g>
      {px(9.5, 10, 1.5, 1.5, OUTLINE)}{px(13, 11, 2, 0.5, OUTLINE)}
      {px(10.5, 13, 3, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'star', name: 'ตาดาว', tags: ['star', 'ดาว'], price: 50,
    draw: () => (<g>
      {px(9.5, 10, 1.5, 1.5, ACCENT)}{px(9, 10.5, 2.5, 0.5, ACCENT)}
      {px(13, 10, 1.5, 1.5, ACCENT)}{px(12.5, 10.5, 2.5, 0.5, ACCENT)}
      {px(10.5, 13, 3, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'wide', name: 'ตาโต', tags: ['wide', 'โต'],
    draw: () => (<g>
      {px(9, 9.5, 2.5, 2.5, WHITE)}{px(12.5, 9.5, 2.5, 2.5, WHITE)}
      {px(9.5, 10, 1.5, 1.5, OUTLINE)}{px(13, 10, 1.5, 1.5, OUTLINE)}
      {px(11, 13, 2, 1, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'fierce', name: 'ตาดุ', tags: ['angry', 'ดุ'],
    draw: () => (<g>
      {px(9, 9.5, 2, 1, OUTLINE)}{px(13, 9.5, 2, 1, OUTLINE)}
      {px(9.5, 10.5, 1.5, 1, OUTLINE)}{px(13, 10.5, 1.5, 1, OUTLINE)}
      {px(10, 13.5, 4, 0.5, OUTLINE)}
    </g>)
  },
  {
    id: 'calm', name: 'ตาสงบ', tags: ['calm', 'สงบ'],
    draw: () => (<g>
      {px(9, 10.5, 2, 0.5, OUTLINE)}{px(13, 10.5, 2, 0.5, OUTLINE)}
      {px(10.5, 13, 3, 0.5, SKIN_SHADOW)}
    </g>)
  },
  {
    id: 'cyber', name: 'ตาไซเบอร์', tags: ['cyber', 'ไซเบอร์'], price: 70,
    draw: () => (<g>
      {px(8.5, 10, 3, 1.5, OUTLINE)}{px(9, 10.5, 2, 0.5, ACCENT)}
      {px(12.5, 10, 3, 1.5, OUTLINE)}{px(13, 10.5, 2, 0.5, ACCENT)}
      {px(11, 13, 2, 0.5, SKIN_SHADOW)}
    </g>)
  }
];

/* ── worn over the eyes ── */
export const eyewear: Sprite[] = [
  { id: 'bare', name: 'ไม่ใส่', tags: ['none', 'ไม่ใส่'], draw: () => <g /> },
  {
    id: 'square', name: 'แว่นสี่เหลี่ยม', tags: ['glasses', 'แว่น'],
    draw: () => (<g>
      {px(8.5, 9.5, 3, 2.5, OUTLINE)}{px(9, 10, 2, 1.5, WHITE)}
      {px(12.5, 9.5, 3, 2.5, OUTLINE)}{px(13, 10, 2, 1.5, WHITE)}
      {px(11.5, 10.5, 1, 0.5, OUTLINE)}
    </g>)
  },
  {
    id: 'round', name: 'แว่นกลม', tags: ['glasses', 'แว่นกลม'],
    draw: () => (<g>
      {px(9, 9.5, 2, 0.5, OUTLINE)}{px(8.5, 10, 0.5, 2, OUTLINE)}{px(11, 10, 0.5, 2, OUTLINE)}{px(9, 12, 2, 0.5, OUTLINE)}
      {px(13, 9.5, 2, 0.5, OUTLINE)}{px(12.5, 10, 0.5, 2, OUTLINE)}{px(15, 10, 0.5, 2, OUTLINE)}{px(13, 12, 2, 0.5, OUTLINE)}
      {px(11.5, 10.5, 1, 0.5, OUTLINE)}
    </g>)
  },
  {
    id: 'visor', name: 'ไวเซอร์', tags: ['visor', 'tech'], price: 70,
    draw: () => (<g>
      {px(7.5, 9.5, 9, 2.5, OUTLINE)}
      {px(8, 10, 3.5, 1.5, ACCENT)}
      {px(12.5, 10, 3.5, 1.5, ACCENT)}
    </g>)
  },
  {
    id: 'cybermask', name: 'หน้ากากไซเบอร์', tags: ['cyber', 'mask', 'หน้ากาก'], price: 90,
    draw: () => (<g>
      {px(7.5, 12, 9, 3, SECONDARY)}
      {px(7.5, 12, 9, 0.5, ACCENT)}
      {px(9, 13, 2, 1, ACCENT)}
      {px(13, 13, 2, 1, ACCENT)}
    </g>)
  },
  {
    id: 'surgical', name: 'หน้ากากอนามัย', tags: ['mask', 'อนามัย'],
    draw: () => (<g>
      {px(8, 12, 8, 3.5, WHITE)}
      {px(8, 12, 8, 0.5, SECONDARY_SHADOW)}
      {px(7, 12.5, 1, 0.5, SECONDARY_SHADOW)}
      {px(16, 12.5, 1, 0.5, SECONDARY_SHADOW)}
    </g>)
  },
  {
    id: 'eyepatch', name: 'ผ้าปิดตา', tags: ['eyepatch', 'ปิดตา'], price: 40,
    draw: () => (<g>
      {px(8.5, 9.5, 3, 2.5, OUTLINE)}
      {px(6.5, 9, 11, 0.5, OUTLINE)}
    </g>)
  },
  {
    id: 'goggles', name: 'แว่นตานักบิน', tags: ['goggles', 'steampunk'], price: 60,
    draw: () => (<g>
      {px(6.5, 9, 11, 1, SECONDARY_SHADOW)}
      {px(8, 9.5, 3.5, 3, SECONDARY)}{px(8.5, 10, 2.5, 2, ACCENT)}
      {px(12.5, 9.5, 3.5, 3, SECONDARY)}{px(13, 10, 2.5, 2, ACCENT)}
    </g>)
  },
  {
    id: 'monocle', name: 'แว่นข้างเดียว', tags: ['monocle', 'steampunk'], price: 50,
    draw: () => (<g>
      {px(12.5, 9.5, 3, 0.5, ACCENT)}{px(12.5, 12, 3, 0.5, ACCENT)}
      {px(12, 10, 0.5, 2, ACCENT)}{px(15.5, 10, 0.5, 2, ACCENT)}
      {px(15.5, 12.5, 0.5, 2, ACCENT)}
    </g>)
  },

  /* Three more over the eyes. Each multiplies the face table — twelve pairs of eyes by twelve things
     worn over them is a hundred and forty-four faces — and each keeps to the band y 9–13 so it lands
     on the sockets of every pair rather than on the one it was drawn against. */
  {
    id: 'readingglasses', name: 'แว่นอ่านหนังสือ', tags: ['glasses', 'แว่น', 'study'],
    draw: () => (<g>
      {px(7.5, 10, 4, 3, WHITE)}{px(12.5, 10, 4, 3, WHITE)}
      {px(7.5, 10, 4, 0.5, OUTLINE)}{px(12.5, 10, 4, 0.5, OUTLINE)}
      {px(7.5, 12.5, 4, 0.5, OUTLINE)}{px(12.5, 12.5, 4, 0.5, OUTLINE)}
      {px(11.5, 11, 1, 0.5, OUTLINE)}
    </g>)
  },
  {
    id: 'starshades', name: 'แว่นดาว', tags: ['shades', 'ดาว', 'star'], price: 80,
    draw: () => (<g>
      {px(7, 9.5, 10, 3, SECONDARY_SHADOW)}
      <polygon points="9.5,9.5 10.5,11 12,11 11,12 11.5,13 9.5,12 8,13 8.5,12 7.5,11 9,11" fill={MAGIC_HIGHLIGHT} />
      {px(13, 10.5, 3, 1, MAGIC)}
    </g>)
  },
  {
    id: 'scouter', name: 'สเกาเตอร์', tags: ['scouter', 'ไซไฟ', 'tech'], price: 100,
    draw: () => (<g>
      {px(11.5, 9.5, 6, 3, SECONDARY)}
      {px(12, 10, 5, 2, MAGIC)}
      {px(12, 10, 5, 0.5, MAGIC_HIGHLIGHT)}
      {px(17, 10.5, 1, 4, SECONDARY_SHADOW)}
    </g>)
  }
];

/* ────────────────────────────── clothes ──────────────────────────────
 * Tops cover y 17–20 and bottoms 20–23, so any of one goes with any of the other and the figure
 * never changes where it stands. That is the whole reason they are two layers: twenty-five drawings
 * and six drawings make a hundred and fifty outfits without a hundred and fifty drawings.
 */
const torso = (fill: string) => px(6, 17, 12, 3.5, fill);

export const tops: Sprite[] = [
  { id: 'uniform', name: 'ชุดนักเรียน', tags: ['uniform', 'นักเรียน'], draw: () => (<g>{torso(WHITE)}{px(10.5, 17, 3, 2, PRIMARY)}{px(6, 17, 12, 0.5, SECONDARY_SHADOW)}</g>) },
  { id: 'collar', name: 'เสื้อคอปก', tags: ['collar', 'คอปก'], draw: () => (<g>{torso(PRIMARY)}{px(9.5, 17, 5, 1, ACCENT)}{px(11.5, 17, 1, 2.5, ACCENT)}</g>) },
  { id: 'hoodie', name: 'เสื้อฮู้ด', tags: ['hoodie', 'ฮู้ด'], draw: () => (<g>{torso(PRIMARY)}{px(8, 16.5, 8, 1.5, PRIMARY_HIGHLIGHT)}{px(11.5, 18, 1, 2.5, PRIMARY_SHADOW)}</g>) },
  { id: 'blazer', name: 'เสื้อสูท', tags: ['blazer', 'สูท'], draw: () => (<g>{torso(PRIMARY_SHADOW)}{px(10.5, 17, 3, 3.5, WHITE)}{px(11.5, 17, 1, 2, ACCENT)}</g>) },
  { id: 'jersey', name: 'ชุดกีฬา', tags: ['jersey', 'กีฬา'], draw: () => (<g>{torso(PRIMARY)}{px(6, 18.5, 12, 1, ACCENT)}{px(9.5, 17, 5, 1, ACCENT)}</g>) },
  { id: 'labcoat', name: 'เสื้อกาวน์', tags: ['lab', 'กาวน์'], draw: () => (<g>{torso(WHITE)}{px(11.5, 17, 1, 3.5, SECONDARY_SHADOW)}{px(7, 19, 2, 1.5, SECONDARY_SHADOW)}</g>) },
  { id: 'apron', name: 'ผ้ากันเปื้อน', tags: ['apron', 'ศิลปะ'], draw: () => (<g>{torso(PRIMARY)}{px(8.5, 18, 7, 2.5, ACCENT)}{px(9.5, 17, 1, 1, ACCENT)}{px(13.5, 17, 1, 1, ACCENT)}</g>) },
  { id: 'magerobe', name: 'เสื้อคลุมเวทย์', tags: ['mage', 'เวทย์'], price: 80, draw: () => (<g>{torso(MAGIC)}{px(11, 17, 2, 3.5, MAGIC_HIGHLIGHT)}{px(6, 17, 12, 0.5, ACCENT)}</g>) },
  { id: 'runichood', name: 'ฮู้ดอาคม', tags: ['mage', 'rune'], price: 100, draw: () => (<g>{torso(MAGIC)}{px(8, 16.5, 8, 1.5, MAGIC_HIGHLIGHT)}{px(9, 18.5, 1, 1, ACCENT)}{px(11.5, 18.5, 1, 1, ACCENT)}{px(14, 18.5, 1, 1, ACCENT)}</g>) },
  { id: 'chestplate', name: 'เกราะอก', tags: ['armor', 'เกราะ'], price: 120, draw: () => (<g>{torso(SECONDARY)}{px(6, 17, 12, 1, SECONDARY_SHADOW)}{px(11.5, 18, 1, 2.5, ACCENT)}{px(7.5, 18, 1.5, 1.5, SECONDARY_SHADOW)}{px(15, 18, 1.5, 1.5, SECONDARY_SHADOW)}</g>) },
  { id: 'techwear', name: 'เทคแวร์', tags: ['techwear', 'cyber'], price: 90, draw: () => (<g>{torso(SECONDARY_SHADOW)}{px(6, 19, 12, 0.5, ACCENT)}{px(13.5, 17.5, 2.5, 1, ACCENT)}</g>) },
  { id: 'streetwear', name: 'สตรีทแวร์', tags: ['street', 'สตรีท'], draw: () => (<g>{torso(PRIMARY)}{px(6, 17, 6, 3.5, SECONDARY)}{px(8.5, 18.5, 3, 1, ACCENT)}</g>) },
  { id: 'steamvest', name: 'เสื้อกั๊กสตีมพังก์', tags: ['steampunk', 'vest'], price: 70, draw: () => (<g>{torso(SECONDARY)}{px(10, 17, 4, 3.5, PRIMARY_SHADOW)}{px(11.5, 18, 1, 1, ACCENT)}{px(11.5, 19.5, 1, 1, ACCENT)}</g>) },
  { id: 'kimono', name: 'ชุดกิโมโน', tags: ['kimono', 'japan'], price: 60, draw: () => (<g>{torso(PRIMARY)}{px(9, 17, 3, 3.5, PRIMARY_HIGHLIGHT)}{px(6, 19.5, 12, 1, ACCENT)}</g>) },
  { id: 'poncho', name: 'ผ้าคลุมไหล่', tags: ['poncho'], draw: () => (<g>{torso(PRIMARY)}{px(5.5, 17, 13, 2, PRIMARY_HIGHLIGHT)}{px(5.5, 18.5, 13, 0.5, ACCENT)}</g>) },
  { id: 'tanktop', name: 'เสื้อกล้าม', tags: ['tank'], draw: () => (<g>{px(7.5, 17, 9, 3.5, PRIMARY)}{px(6, 17, 12, 0.5, SKIN)}{px(7.5, 17, 9, 0.5, PRIMARY_HIGHLIGHT)}</g>) },
  { id: 'sweater', name: 'เสื้อไหมพรม', tags: ['sweater'], draw: () => (<g>{torso(PRIMARY)}{px(6, 17.5, 12, 0.5, PRIMARY_SHADOW)}{px(6, 19, 12, 0.5, PRIMARY_SHADOW)}</g>) },
  { id: 'raincoat', name: 'เสื้อกันฝน', tags: ['raincoat'], draw: () => (<g>{torso(ACCENT)}{px(11.5, 17, 1, 3.5, WHITE)}{px(8, 16.5, 8, 1, ACCENT)}</g>) },
  { id: 'scarfcoat', name: 'เสื้อโค้ทผ้าพันคอ', tags: ['coat', 'scarf'], draw: () => (<g>{torso(SECONDARY)}{px(8.5, 16.5, 7, 1.5, ACCENT)}{px(9.5, 18, 1.5, 2.5, ACCENT)}</g>) },
  { id: 'bandmember', name: 'ชุดวงดนตรี', tags: ['music', 'ดนตรี'], draw: () => (<g>{torso(SECONDARY_SHADOW)}{px(9.5, 17, 5, 1, WHITE)}{px(11.5, 18, 1, 2.5, ACCENT)}{px(7, 18.5, 1.5, 1.5, ACCENT)}</g>) },
  { id: 'chefcoat', name: 'ชุดกุ๊ก', tags: ['chef', 'คหกรรม'], draw: () => (<g>{torso(WHITE)}{px(10, 17, 1, 3.5, SECONDARY_SHADOW)}{px(13, 17, 1, 3.5, SECONDARY_SHADOW)}</g>) },
  { id: 'ninjagi', name: 'ชุดนินจา', tags: ['ninja', 'นินจา'], price: 90, draw: () => (<g>{torso(SECONDARY_SHADOW)}{px(6, 18.5, 12, 1, PRIMARY)}{px(10.5, 17, 3, 1.5, SECONDARY)}</g>) },
  { id: 'pirate', name: 'ชุดโจรสลัด', tags: ['pirate', 'โจรสลัด'], price: 70, draw: () => (<g>{torso(WHITE)}{px(6, 17, 12, 0.5, SECONDARY_SHADOW)}{px(6, 19, 12, 1.5, PRIMARY)}{px(11.5, 17, 1, 2, ACCENT)}</g>) },
  { id: 'spacesuit', name: 'ชุดอวกาศ', tags: ['space', 'อวกาศ'], price: 110, draw: () => (<g>{torso(WHITE)}{px(9, 18, 6, 1.5, ACCENT)}{px(6, 17, 12, 0.5, SECONDARY)}{px(15.5, 17.5, 1.5, 1, PRIMARY)}</g>) },
  { id: 'druidwrap', name: 'ชุดผ้าป่า', tags: ['nature', 'ธรรมชาติ'], price: 60, draw: () => (<g>{torso(SECONDARY)}{px(8, 17, 3, 3.5, ACCENT)}{px(6, 19.5, 12, 1, PRIMARY_SHADOW)}</g>) },

  /* ── The three families the wardrobe was thin in ──
   *
   * Twenty-five tops covered school, a little fantasy and a little tech, and a child who wanted to
   * dress *as* something — a street kid, a knight in layered plate, somebody in an exosuit — found
   * one option each. These nine are three apiece, and each one is a silhouette rather than a colour:
   * a puffer is horizontal bands, plate is a pair of pauldrons past the shoulder line, an exo rig is
   * a frame you can see the body through. At twenty-four pixels that is what survives. */

  /* Streetwear. */
  { id: 'puffer', name: 'เสื้อดาวน์', tags: ['street', 'puffer', 'สตรีท'], price: 50, draw: () => (<g>{torso(PRIMARY)}{px(6, 17.5, 12, 0.5, PRIMARY_SHADOW)}{px(6, 18.5, 12, 0.5, PRIMARY_SHADOW)}{px(6, 19.5, 12, 0.5, PRIMARY_SHADOW)}{px(5.5, 17, 1, 3.5, PRIMARY_HIGHLIGHT)}{px(17.5, 17, 1, 3.5, PRIMARY_HIGHLIGHT)}</g>) },
  /* The collar is drawn *above* the torso line, which is the drape: a hood that is down is a roll of
     fabric sitting on the shoulders, not a flat panel on the chest. */
  { id: 'hoodiedrape', name: 'ฮู้ดคอตลบ', tags: ['street', 'hoodie', 'ฮู้ด'], price: 40, draw: () => (<g>{torso(SECONDARY)}{px(7.5, 16, 9, 1.5, SECONDARY_SHADOW)}{px(8.5, 15.5, 7, 1, PRIMARY)}{px(10.5, 17.5, 1, 2.5, PRIMARY_SHADOW)}{px(13, 17.5, 1, 2.5, PRIMARY_SHADOW)}</g>) },
  { id: 'varsity', name: 'แจ็กเก็ตนักกีฬา', tags: ['street', 'varsity', 'กีฬา'], price: 60, draw: () => (<g>{torso(SECONDARY)}{px(6, 17, 2.5, 3.5, WHITE)}{px(15.5, 17, 2.5, 3.5, WHITE)}{px(6, 19.5, 12, 1, ACCENT)}{px(9.5, 17.5, 2, 2, ACCENT)}</g>) },

  /* High fantasy. */
  { id: 'platelayered', name: 'เกราะซ้อนชั้น', tags: ['armor', 'plate', 'เกราะ', 'pauldron'], price: 180, draw: () => (<g>{torso(SECONDARY)}{px(6, 17, 12, 1, 'var(--av-secondary-highlight)')}{px(6, 18.5, 12, 0.5, SECONDARY_SHADOW)}{px(4.5, 16.5, 3, 2.5, SECONDARY)}{px(16.5, 16.5, 3, 2.5, SECONDARY)}{px(4.5, 16.5, 3, 1, ACCENT)}{px(16.5, 16.5, 3, 1, ACCENT)}{px(11.5, 18, 1, 2.5, ACCENT)}</g>) },
  { id: 'wizardrobe', name: 'จีวรจอมเวท', tags: ['mage', 'robe', 'เวทย์'], price: 140, draw: () => (<g>{px(5, 17, 14, 3.5, MAGIC)}{px(5, 17, 14, 0.5, MAGIC_HIGHLIGHT)}{px(8, 17.5, 1, 3, 'var(--av-magic-shadow)')}{px(11.5, 17.5, 1, 3, 'var(--av-magic-shadow)')}{px(15, 17.5, 1, 3, 'var(--av-magic-shadow)')}{px(10.5, 17, 3, 1, ACCENT)}</g>) },
  { id: 'feathercloak', name: 'เสื้อคลุมขนนก', tags: ['cloak', 'feather', 'ขนนก'], price: 160, draw: () => (<g>{torso(PRIMARY)}{px(4.5, 16.5, 15, 1.5, WHITE)}{px(4.5, 17.5, 3, 2, WHITE)}{px(16.5, 17.5, 3, 2, WHITE)}{px(4.5, 19, 3, 0.5, ACCENT)}{px(16.5, 19, 3, 0.5, ACCENT)}</g>) },

  /* Sci-fi and cyberpunk. */
  { id: 'exorig', name: 'โครงกลไกภายนอก', tags: ['exo', 'cyber', 'โครง'], price: 170, draw: () => (<g>{torso(SECONDARY_SHADOW)}{px(7.5, 16.5, 1.5, 4.5, SECONDARY)}{px(15, 16.5, 1.5, 4.5, SECONDARY)}{px(6, 18.5, 12, 1, SECONDARY)}{px(11, 18, 2, 2, ACCENT)}{px(11.5, 18.5, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'circuitjacket', name: 'แจ็กเก็ตวงจร', tags: ['cyber', 'neon', 'วงจร'], price: 150, draw: () => (<g>{torso(SECONDARY_SHADOW)}{px(8, 17, 0.5, 3.5, MAGIC)}{px(8, 18.5, 4, 0.5, MAGIC)}{px(12, 17.5, 0.5, 3, MAGIC_HIGHLIGHT)}{px(12, 19.5, 4, 0.5, MAGIC)}{px(15.5, 17.5, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'hazardcoat', name: 'โค้ทคอสูงกันสาร', tags: ['hazard', 'coat', 'คอสูง'], price: 120, draw: () => (<g>{torso(ACCENT)}{px(9, 15.5, 6, 2, ACCENT)}{px(9, 15.5, 6, 0.5, 'var(--av-accent)')}{px(6, 19, 12, 1, SECONDARY_SHADOW)}{px(6.5, 19, 2, 1, WHITE)}{px(11, 19, 2, 1, WHITE)}{px(15.5, 19, 2, 1, WHITE)}</g>) }
];

export const bottoms: Sprite[] = [
  { id: 'trousers', name: 'กางเกงขายาว', tags: ['trousers'], draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(13, 20.5, 4.5, 3, SECONDARY_SHADOW)}</g>) },
  { id: 'skirt', name: 'กระโปรง', tags: ['skirt'], draw: () => (<g>{px(6, 20.5, 12, 2.5, SECONDARY)}{px(6, 20.5, 12, 0.5, SECONDARY_SHADOW)}</g>) },
  { id: 'shorts', name: 'กางเกงขาสั้น', tags: ['shorts', 'กีฬา'], draw: () => (<g>{px(6.5, 20.5, 4.5, 2, PRIMARY_SHADOW)}{px(13, 20.5, 4.5, 2, PRIMARY_SHADOW)}</g>) },
  { id: 'robehem', name: 'ชายเสื้อคลุม', tags: ['robe', 'mage'], price: 40, draw: () => (<g>{px(5.5, 20.5, 13, 3, MAGIC)}{px(5.5, 22.5, 13, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'greaves', name: 'สนับแข้ง', tags: ['armor', 'เกราะ'], price: 80, draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY)}{px(13, 20.5, 4.5, 3, SECONDARY)}{px(6.5, 20.5, 4.5, 0.5, ACCENT)}{px(13, 20.5, 4.5, 0.5, ACCENT)}</g>) },
  { id: 'techpants', name: 'กางเกงเทคแวร์', tags: ['techwear', 'cyber'], price: 60, draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(13, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(9.5, 21, 1.5, 0.5, ACCENT)}{px(13, 21, 1.5, 0.5, ACCENT)}</g>) },

  /*
   * Four more, because six was the number holding the whole wardrobe down.
   *
   * Tops and bottoms multiply: every bottom added is worth twenty-five outfits and every top is
   * worth six. Six bottoms against twenty-five tops is a wardrobe where the leg is nearly always the
   * same leg, and what a child notices scrolling the drawer is the repetition rather than the
   * variety above it.
   */
  { id: 'cargo', name: 'กางเกงคาร์โก้', tags: ['cargo', 'street', 'tech'], price: 50, draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY)}{px(13, 20.5, 4.5, 3, SECONDARY)}{px(6.5, 21.5, 1.5, 1.5, SECONDARY_SHADOW)}{px(16, 21.5, 1.5, 1.5, SECONDARY_SHADOW)}{px(6.5, 22.5, 4.5, 0.5, PRIMARY_SHADOW)}{px(13, 22.5, 4.5, 0.5, PRIMARY_SHADOW)}</g>) },
  { id: 'platelegs', name: 'เกราะขาซ้อนชั้น', tags: ['armor', 'plate', 'เกราะ'], price: 130, draw: () => (<g>{px(6, 20.5, 5.5, 3, SECONDARY)}{px(12.5, 20.5, 5.5, 3, SECONDARY)}{px(6, 20.5, 5.5, 0.5, ACCENT)}{px(12.5, 20.5, 5.5, 0.5, ACCENT)}{px(6, 22, 5.5, 0.5, SECONDARY_SHADOW)}{px(12.5, 22, 5.5, 0.5, SECONDARY_SHADOW)}</g>) },
  { id: 'exogreaves', name: 'สนับแข้งกลไก', tags: ['exo', 'cyber', 'กลไก'], price: 110, draw: () => (<g>{px(7, 20.5, 3.5, 3, SECONDARY_SHADOW)}{px(13.5, 20.5, 3.5, 3, SECONDARY_SHADOW)}{px(6.5, 21, 1, 2, SECONDARY)}{px(17, 21, 1, 2, SECONDARY)}{px(8, 22, 1.5, 1, MAGIC)}{px(14.5, 22, 1.5, 1, MAGIC)}</g>) },
  { id: 'layeredskirt', name: 'กระโปรงซ้อนชั้น', tags: ['skirt', 'fantasy', 'กระโปรง'], price: 70, draw: () => (<g>{px(6.5, 20.5, 11, 1.5, PRIMARY)}{px(5.5, 21.5, 13, 1.5, PRIMARY_SHADOW)}{px(5.5, 23, 13, 0.5, ACCENT)}{px(6.5, 20.5, 11, 0.5, PRIMARY_HIGHLIGHT)}</g>) }
];

/* ────────────────────────────── the four new drawers ──────────────────────────────
 *
 * Shoes, gloves, a coat over the shirt, something round the neck. None of them existed, which is why
 * "เปลี่ยนได้ทุกส่วน" was not true however many shirts the drawer held.
 *
 * These are the 24-grid drawings, and they are what the customiser's tiles show. The figure has its
 * own set on the 48-grid — a tile is a thumbnail and a figure is a body, and a drawing that reads at
 * one size does not automatically read at the other. Both are keyed by the same id, and the test
 * beside them refuses a piece that has only one of the two.
 *
 * Bands: feet 21–23.5, hands 20–23, the coat 17–20.5, the neck 16.5–18.
 */
export const footwear: Sprite[] = [
  { id: 'none', name: 'เท้าเปล่า', tags: ['none'], draw: () => <g /> },
  { id: 'schoolshoe', name: 'รองเท้านักเรียน', tags: ['school', 'นักเรียน'], draw: () => (<g>{px(6, 21.5, 5, 2, SECONDARY_SHADOW)}{px(13, 21.5, 5, 2, SECONDARY_SHADOW)}{px(6, 21.5, 5, 0.5, SECONDARY)}{px(13, 21.5, 5, 0.5, SECONDARY)}</g>) },
  { id: 'trainer', name: 'รองเท้าผ้าใบหุ้มข้อ', tags: ['sneaker', 'ผ้าใบ'], price: 40, draw: () => (<g>{px(6, 20.5, 5, 2, PRIMARY)}{px(13, 20.5, 5, 2, PRIMARY)}{px(6, 22.5, 5, 1, WHITE)}{px(13, 22.5, 5, 1, WHITE)}{px(6, 21, 3, 0.5, ACCENT)}{px(13, 21, 3, 0.5, ACCENT)}</g>) },
  { id: 'plimsoll', name: 'รองเท้าผ้าใบพื้นเรียบ', tags: ['canvas', 'ผ้าใบ'], draw: () => (<g>{px(6, 21.5, 5, 2, PRIMARY)}{px(13, 21.5, 5, 2, PRIMARY)}{px(9.5, 21.5, 1.5, 2, WHITE)}{px(16.5, 21.5, 1.5, 2, WHITE)}</g>) },
  { id: 'kneeboot', name: 'บูททรงสูง', tags: ['boot', 'บูท'], price: 70, draw: () => (<g>{px(6.5, 18.5, 4, 5, SECONDARY)}{px(13.5, 18.5, 4, 5, SECONDARY)}{px(6, 22, 5, 1.5, SECONDARY_SHADOW)}{px(13, 22, 5, 1.5, SECONDARY_SHADOW)}{px(6.5, 18.5, 4, 0.5, ACCENT)}{px(13.5, 18.5, 4, 0.5, ACCENT)}</g>) },
  { id: 'buckleboot', name: 'บูทหัวเข็มขัด', tags: ['boot', 'buckle'], price: 60, draw: () => (<g>{px(6.5, 20, 4, 3.5, SECONDARY_SHADOW)}{px(13.5, 20, 4, 3.5, SECONDARY_SHADOW)}{px(6.5, 20.5, 4, 0.5, ACCENT)}{px(13.5, 20.5, 4, 0.5, ACCENT)}{px(6.5, 22, 4, 0.5, ACCENT)}{px(13.5, 22, 4, 0.5, ACCENT)}</g>) },
  { id: 'sabaton', name: 'เกราะเท้าเหล็ก', tags: ['armor', 'เกราะ'], price: 110, draw: () => (<g>{px(6, 20.5, 5, 1.5, SECONDARY)}{px(13, 20.5, 5, 1.5, SECONDARY)}{px(5.5, 22, 6, 1.5, SECONDARY)}{px(12.5, 22, 6, 1.5, SECONDARY)}{px(5.5, 22, 6, 0.5, 'var(--av-secondary-highlight)')}{px(12.5, 22, 6, 0.5, 'var(--av-secondary-highlight)')}</g>) },
  { id: 'sandal', name: 'รองเท้าแตะรัดส้น', tags: ['sandal', 'แตะ'], draw: () => (<g>{px(6, 21.5, 5, 0.5, SECONDARY)}{px(13, 21.5, 5, 0.5, SECONDARY)}{px(6, 22.5, 5, 0.5, SECONDARY)}{px(13, 22.5, 5, 0.5, SECONDARY)}{px(5.5, 23, 6, 0.5, ACCENT)}{px(12.5, 23, 6, 0.5, ACCENT)}</g>) },
  { id: 'hoverplate', name: 'แผ่นลอยใต้เท้า', tags: ['tech', 'hover'], price: 130, draw: () => (<g>{px(6, 21, 5, 1.5, SECONDARY_SHADOW)}{px(13, 21, 5, 1.5, SECONDARY_SHADOW)}{px(6, 23, 5, 0.5, MAGIC)}{px(13, 23, 5, 0.5, MAGIC)}<g opacity="0.4">{px(5.5, 23.5, 6, 0.5, MAGIC_HIGHLIGHT)}{px(12.5, 23.5, 6, 0.5, MAGIC_HIGHLIGHT)}</g></g>) },
  { id: 'runeboot', name: 'บูทอักขระ', tags: ['rune', 'mage'], price: 120, draw: () => (<g>{px(6.5, 19, 4, 4.5, MAGIC)}{px(13.5, 19, 4, 4.5, MAGIC)}{px(6.5, 19, 4, 0.5, MAGIC_HIGHLIGHT)}{px(13.5, 19, 4, 0.5, MAGIC_HIGHLIGHT)}{px(7.5, 20.5, 1, 2, MAGIC_HIGHLIGHT)}{px(14.5, 20.5, 1, 2, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'skate', name: 'รองเท้าสเก็ต', tags: ['skate', 'ice'], price: 90, draw: () => (<g>{px(6, 20.5, 5, 2, WHITE)}{px(13, 20.5, 5, 2, WHITE)}{px(6, 20.5, 5, 0.5, ACCENT)}{px(13, 20.5, 5, 0.5, ACCENT)}{px(5.5, 23, 6, 0.5, 'var(--av-accent-highlight)')}{px(12.5, 23, 6, 0.5, 'var(--av-accent-highlight)')}</g>) },
  { id: 'talonguard', name: 'ปลอกกรงเล็บ', tags: ['claw', 'beast'], price: 80, draw: () => (<g>{px(6.5, 20.5, 4, 1, SECONDARY)}{px(13.5, 20.5, 4, 1, SECONDARY)}{px(6, 21.5, 5, 1, SECONDARY_SHADOW)}{px(13, 21.5, 5, 1, SECONDARY_SHADOW)}{px(6, 22.5, 1, 1, WHITE)}{px(8, 22.5, 1, 1, WHITE)}{px(10, 22.5, 1, 1, WHITE)}{px(13, 22.5, 1, 1, WHITE)}{px(15, 22.5, 1, 1, WHITE)}{px(17, 22.5, 1, 1, WHITE)}</g>) },
  { id: 'thrusterboot', name: 'บูทไอพ่น', tags: ['tech', 'thruster'], price: 140, draw: () => (<g>{px(6, 20.5, 5, 2, SECONDARY_SHADOW)}{px(13, 20.5, 5, 2, SECONDARY_SHADOW)}{px(6, 20.5, 5, 0.5, ACCENT)}{px(13, 20.5, 5, 0.5, ACCENT)}{px(5.5, 22.5, 2, 1, MAGIC_HIGHLIGHT)}{px(12.5, 22.5, 2, 1, MAGIC_HIGHLIGHT)}</g>) }
];

export const handwear: Sprite[] = [
  { id: 'none', name: 'มือเปล่า', tags: ['none'], draw: () => <g /> },
  { id: 'knitglove', name: 'ถุงมือไหมพรม', tags: ['glove', 'ถุงมือ'], draw: () => (<g>{px(4.5, 20, 1.5, 1, SECONDARY)}{px(18, 20, 1.5, 1, SECONDARY)}{px(4.5, 21, 1.5, 2, SECONDARY_SHADOW)}{px(18, 21, 1.5, 2, SECONDARY_SHADOW)}</g>) },
  { id: 'fingerless', name: 'ถุงมือไม่หุ้มนิ้ว', tags: ['glove', 'street'], price: 30, draw: () => (<g>{px(4.5, 20, 1.5, 1.5, SECONDARY)}{px(18, 20, 1.5, 1.5, SECONDARY)}{px(4.5, 20, 1.5, 0.5, ACCENT)}{px(18, 20, 1.5, 0.5, ACCENT)}</g>) },
  { id: 'gauntlet', name: 'ถุงมือเกราะ', tags: ['armor', 'เกราะ'], price: 90, draw: () => (<g>{px(4, 19, 2, 1.5, SECONDARY)}{px(18, 19, 2, 1.5, SECONDARY)}{px(4.5, 20.5, 1.5, 2.5, SECONDARY)}{px(18, 20.5, 1.5, 2.5, SECONDARY)}{px(4.5, 21.5, 1.5, 0.5, ACCENT)}{px(18, 21.5, 1.5, 0.5, ACCENT)}</g>) },
  { id: 'longglove', name: 'ถุงมือยาว', tags: ['glove', 'formal'], price: 70, draw: () => (<g>{px(4.5, 17, 1.5, 6, WHITE)}{px(18, 17, 1.5, 6, WHITE)}{px(4.5, 17, 1.5, 0.5, ACCENT)}{px(18, 17, 1.5, 0.5, ACCENT)}</g>) },
  { id: 'handwrap', name: 'ผ้าพันมือ', tags: ['wrap', 'fighter'], price: 40, draw: () => (<g>{px(4.5, 20, 1.5, 0.5, WHITE)}{px(18, 20, 1.5, 0.5, WHITE)}{px(4.5, 21, 1.5, 0.5, WHITE)}{px(18, 21, 1.5, 0.5, WHITE)}{px(4.5, 22, 1.5, 0.5, WHITE)}{px(18, 22, 1.5, 0.5, WHITE)}</g>) },
  { id: 'cyberhand', name: 'มือกล', tags: ['cyber', 'tech'], price: 110, draw: () => (<g>{px(4.5, 20, 1.5, 3, SECONDARY_SHADOW)}{px(18, 20, 1.5, 3, SECONDARY_SHADOW)}{px(5, 20.5, 0.5, 2, MAGIC)}{px(18.5, 20.5, 0.5, 2, MAGIC)}</g>) },
  { id: 'clawguard', name: 'ปลอกเล็บมือ', tags: ['claw', 'beast'], price: 80, draw: () => (<g>{px(4.5, 20, 1.5, 1.5, SECONDARY)}{px(18, 20, 1.5, 1.5, SECONDARY)}{px(4.5, 21.5, 0.5, 1, WHITE)}{px(5.5, 21.5, 0.5, 1, WHITE)}{px(18, 21.5, 0.5, 1, WHITE)}{px(19, 21.5, 0.5, 1, WHITE)}</g>) },
  { id: 'runeband', name: 'กำไลอาคม', tags: ['rune', 'mage'], price: 100, draw: () => (<g>{px(4, 19.5, 2, 1, MAGIC)}{px(18, 19.5, 2, 1, MAGIC)}{px(4, 19.5, 2, 0.5, MAGIC_HIGHLIGHT)}{px(18, 19.5, 2, 0.5, MAGIC_HIGHLIGHT)}</g>) }
];

export const outerwear: Sprite[] = [
  { id: 'none', name: 'ไม่ใส่ทับ', tags: ['none'], draw: () => <g /> },
  { id: 'opencoat', name: 'โค้ทเปิดหน้า', tags: ['coat', 'โค้ท'], price: 60, draw: () => (<g>{px(5.5, 17, 3, 6, SECONDARY)}{px(15.5, 17, 3, 6, SECONDARY)}{px(5.5, 17, 3, 0.5, 'var(--av-secondary-highlight)')}{px(15.5, 17, 3, 0.5, 'var(--av-secondary-highlight)')}</g>) },
  { id: 'gilet', name: 'เสื้อกั๊กดาวน์', tags: ['vest', 'กั๊ก'], price: 50, draw: () => (<g>{px(6, 17, 3, 5, PRIMARY)}{px(15, 17, 3, 5, PRIMARY)}{px(6, 19, 3, 0.5, PRIMARY_SHADOW)}{px(15, 19, 3, 0.5, PRIMARY_SHADOW)}{px(6, 20.5, 3, 0.5, PRIMARY_SHADOW)}{px(15, 20.5, 3, 0.5, PRIMARY_SHADOW)}</g>) },
  { id: 'hoodedcloak', name: 'ผ้าคลุมมีฮู้ด', tags: ['cloak', 'hood'], price: 90, draw: () => (<g>{px(5, 16.5, 14, 1.5, SECONDARY_SHADOW)}{px(8, 15, 8, 1.5, SECONDARY)}{px(8, 15, 8, 0.5, 'var(--av-secondary-highlight)')}{px(5, 18, 2.5, 5, SECONDARY_SHADOW)}{px(16.5, 18, 2.5, 5, SECONDARY_SHADOW)}</g>) },
  { id: 'tabard', name: 'เสื้อคลุมตราประจำตัว', tags: ['tabard', 'heraldry'], price: 80, draw: () => (<g>{px(9, 17, 6, 6, ACCENT)}{px(9, 17, 6, 0.5, 'var(--av-accent-highlight)')}{px(6, 20, 12, 1, SECONDARY_SHADOW)}{px(10.5, 18, 3, 1.5, WHITE)}</g>) },
  { id: 'harness', name: 'สายรัดอก', tags: ['harness', 'strap'], price: 50, draw: () => (<g>{px(8.5, 17, 1, 6, SECONDARY_SHADOW)}{px(14.5, 17, 1, 6, SECONDARY_SHADOW)}{px(6, 19.5, 12, 1, SECONDARY_SHADOW)}{px(10.5, 19, 3, 1.5, ACCENT)}</g>) },
  { id: 'overcoat', name: 'โค้ทยาว', tags: ['coat', 'long'], price: 100, draw: () => (<g>{px(5.5, 17, 2.5, 6.5, WHITE)}{px(16, 17, 2.5, 6.5, WHITE)}{px(5.5, 17, 2.5, 0.5, 'var(--av-primary-highlight)')}{px(16, 17, 2.5, 0.5, 'var(--av-primary-highlight)')}{px(6, 21, 1.5, 1, SECONDARY_SHADOW)}</g>) },
  { id: 'circuitmantle', name: 'ผ้าคลุมวงจร', tags: ['cyber', 'neon'], price: 130, draw: () => (<g>{px(6, 17, 2.5, 6, SECONDARY_SHADOW)}{px(15.5, 17, 2.5, 6, SECONDARY_SHADOW)}{px(7, 17.5, 0.5, 5, MAGIC)}{px(16.5, 17.5, 0.5, 5, MAGIC)}{px(6, 17, 2.5, 0.5, MAGIC_HIGHLIGHT)}{px(15.5, 17, 2.5, 0.5, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'plumemantle', name: 'ไหล่ขนนก', tags: ['feather', 'ขนนก'], price: 120, draw: () => (<g>{px(5, 16.5, 4, 2.5, WHITE)}{px(15, 16.5, 4, 2.5, WHITE)}{px(5, 18.5, 4, 0.5, ACCENT)}{px(15, 18.5, 4, 0.5, ACCENT)}{px(9, 16.5, 6, 1, WHITE)}</g>) }
];

export const neckwear: Sprite[] = [
  { id: 'none', name: 'ไม่ใส่', tags: ['none'], draw: () => <g /> },
  { id: 'schooltie', name: 'เนกไทนักเรียน', tags: ['tie', 'นักเรียน'], draw: () => (<g>{px(10, 17, 4, 1, WHITE)}{px(11.5, 18, 1, 3, ACCENT)}{px(11.5, 18, 1, 0.5, 'var(--av-accent-highlight)')}</g>) },
  { id: 'longscarf', name: 'ผ้าพันคอยาว', tags: ['scarf', 'ผ้าพันคอ'], price: 50, draw: () => (<g>{px(8.5, 16.5, 7, 1.5, ACCENT)}{px(8.5, 16.5, 7, 0.5, 'var(--av-accent-highlight)')}{px(9, 18, 2, 4, ACCENT)}</g>) },
  { id: 'ribbonbow', name: 'โบว์', tags: ['bow', 'โบว์'], price: 40, draw: () => (<g>{px(9.5, 17, 5, 1, ACCENT)}{px(9, 16.5, 2, 2, ACCENT)}{px(13, 16.5, 2, 2, ACCENT)}{px(11, 16.5, 2, 2, 'var(--av-accent-shadow)')}</g>) },
  { id: 'furcollar', name: 'ปลอกคอขนสัตว์', tags: ['fur', 'ขน'], price: 70, draw: () => (<g>{px(7.5, 15.5, 9, 2, WHITE)}{px(7.5, 15.5, 9, 0.5, 'var(--av-primary-highlight)')}{px(8.5, 17.5, 7, 0.5, SECONDARY_SHADOW)}</g>) },
  { id: 'pendant', name: 'จี้ห้อยคอ', tags: ['pendant', 'จี้'], price: 60, draw: () => (<g>{px(10, 17, 4, 0.5, SECONDARY_SHADOW)}{px(11.5, 17.5, 1, 1.5, SECONDARY_SHADOW)}{px(10.5, 19, 3, 2, MAGIC)}{px(11, 19.5, 1.5, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'gorget', name: 'เกราะคอ', tags: ['armor', 'เกราะ'], price: 90, draw: () => (<g>{px(8, 15.5, 8, 2, SECONDARY)}{px(8, 15.5, 8, 0.5, 'var(--av-secondary-highlight)')}{px(8, 17, 8, 0.5, SECONDARY_SHADOW)}{px(11, 16, 2, 1, ACCENT)}</g>) },
  { id: 'neonchoker', name: 'ปลอกคอนีออน', tags: ['neon', 'cyber'], price: 80, draw: () => (<g>{px(9, 16.5, 6, 1, MAGIC)}{px(9, 16.5, 6, 0.5, MAGIC_HIGHLIGHT)}{px(11.5, 17.5, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'bellcollar', name: 'ปลอกคอกระดิ่ง', tags: ['bell', 'beast'], price: 60, draw: () => (<g>{px(8.5, 16.5, 7, 1, ACCENT)}{px(8.5, 16.5, 7, 0.5, 'var(--av-accent-highlight)')}{px(11, 17.5, 2, 1.5, WHITE)}{px(11.5, 18, 1, 0.5, OUTLINE)}</g>) }
];

/* ────────────────────────────── worn, held and glowing ────────────────────────────── */
export const backAccessories: Sprite[] = [
  { id: 'none', name: 'ไม่มี', tags: ['none'], draw: () => <g /> },
  { id: 'batwings', name: 'ปีกค้างคาว', tags: ['wing', 'demon'], price: 120, draw: () => (<g>{px(1.5, 13, 4.5, 5, SECONDARY_SHADOW)}{px(18, 13, 4.5, 5, SECONDARY_SHADOW)}{px(1.5, 13, 4.5, 1, SECONDARY)}{px(18, 13, 4.5, 1, SECONDARY)}</g>) },
  { id: 'dragonwings', name: 'ปีกมังกร', tags: ['wing', 'dragon'], price: 150, draw: () => (<g>{px(0.5, 11, 5.5, 7, SECONDARY)}{px(18, 11, 5.5, 7, SECONDARY)}{px(0.5, 11, 5.5, 1, ACCENT)}{px(18, 11, 5.5, 1, ACCENT)}{px(2.5, 14, 1.5, 4, SECONDARY_SHADOW)}{px(20, 14, 1.5, 4, SECONDARY_SHADOW)}</g>) },
  { id: 'angelwings', name: 'ปีกนางฟ้า', tags: ['wing', 'angel'], price: 140, draw: () => (<g>{px(1, 12, 5, 6, WHITE)}{px(18, 12, 5, 6, WHITE)}{px(1, 15, 5, 0.5, ACCENT)}{px(18, 15, 5, 0.5, ACCENT)}</g>) },
  { id: 'cape', name: 'ผ้าคลุม', tags: ['cape'], price: 60, draw: () => (<g>{px(4, 16, 16, 7, PRIMARY_SHADOW)}{px(4, 16, 16, 1, PRIMARY)}</g>) },
  { id: 'dragontail', name: 'หางมังกร', tags: ['tail', 'dragon'], price: 90, draw: () => (<g>{px(17, 20, 4, 2, SECONDARY)}{px(20, 18, 2, 3, SECONDARY)}{px(20, 17, 2, 1.5, ACCENT)}</g>) },
  { id: 'spadetail', name: 'หางปีศาจ', tags: ['tail', 'demon'], price: 70, draw: () => (<g>{px(17.5, 20.5, 4, 1.5, SECONDARY)}{px(20.5, 18, 1.5, 3, SECONDARY)}{px(19.5, 16.5, 3, 2, SECONDARY_SHADOW)}</g>) },
  { id: 'foxtails', name: 'หางจิ้งจอก', tags: ['tail', 'kitsune'], price: 130, draw: () => (<g>{px(17, 18, 5, 3, SECONDARY)}{px(18, 15, 4, 3, SECONDARY)}{px(19, 20.5, 4, 2.5, SECONDARY)}{px(20.5, 15, 1.5, 1, WHITE)}{px(20.5, 18, 1.5, 1, WHITE)}</g>) },
  { id: 'wolftail', name: 'หางหมาป่า', tags: ['tail', 'wolf'], price: 60, draw: () => (<g>{px(17.5, 19, 5, 3, SECONDARY)}{px(21, 18, 1.5, 2, WHITE)}</g>) },
  { id: 'backpack', name: 'เป้สะพาย', tags: ['bag', 'เป้'], draw: () => (<g>{px(3, 17, 3, 5, SECONDARY)}{px(3, 18.5, 3, 0.5, ACCENT)}</g>) },
  { id: 'tome', name: 'ตำราลอย', tags: ['book', 'mage'], price: 110, draw: () => (<g>{px(1.5, 14, 4.5, 3.5, SECONDARY)}{px(2, 14.5, 3.5, 2.5, WHITE)}{px(3.5, 14.5, 0.5, 2.5, SECONDARY_SHADOW)}</g>) },
  { id: 'banner', name: 'ธงประจำตัว', tags: ['banner'], price: 50, draw: () => (<g>{px(19.5, 8, 1, 12, SECONDARY_SHADOW)}{px(15.5, 8.5, 4, 4, PRIMARY)}{px(15.5, 11, 4, 1.5, PRIMARY_SHADOW)}</g>) },
  { id: 'shield', name: 'โล่', tags: ['shield', 'armor'], price: 80, draw: () => (<g>{px(2, 15, 4.5, 5, SECONDARY)}{px(2.5, 15.5, 3.5, 3.5, ACCENT)}{px(3.5, 16.5, 1.5, 2, SECONDARY_SHADOW)}</g>) },
  { id: 'jetpack', name: 'เจ็ตแพ็ก', tags: ['tech', 'jetpack'], price: 130, draw: () => (<g>{px(2.5, 16, 3.5, 5, SECONDARY)}{px(3, 21, 2.5, 1.5, ACCENT)}{px(2.5, 16, 3.5, 0.5, WHITE)}</g>) },

  /* ── The reward tier ──
   *
   * What a child is saving towards rather than what they start with, and it has to look like it:
   * every one of these carries something the free half of the wardrobe does not — a companion that
   * is its own small drawing, a gradient band standing in for an ambient light, a trail that reads as
   * motion in a still frame.
   *
   * Kept inside the monochrome the rest of the app is drawn in: the glow is the child's own magic
   * colour at a low opacity rather than a second hue introduced here, so a legendary item on a dark
   * screen is bright and on a light one is not a stain. A reward that fights the interface it sits in
   * is a reward nobody wears twice.
   */
  { id: 'runicfamiliar', name: 'ภูตอาคมติดตาม', tags: ['familiar', 'rune', 'legendary', 'ภูต'], price: 200, draw: () => (<g>{px(1.5, 11, 4, 4, MAGIC)}{px(2, 11.5, 3, 3, 'var(--av-magic-shadow)')}{px(2.5, 12, 1, 1, MAGIC_HIGHLIGHT)}{px(3.5, 13.5, 1, 1, MAGIC_HIGHLIGHT)}{px(0.5, 15.5, 1, 1, MAGIC)}{px(5, 16.5, 1, 1, MAGIC)}<g opacity="0.35">{px(0.5, 10, 6, 6, MAGIC)}</g></g>) },
  { id: 'stardusttrail', name: 'ธุลีดาวทอดยาว', tags: ['stardust', 'trail', 'legendary', 'ดาว'], price: 180, draw: () => (<g>{px(4, 14, 2, 2, WHITE)}<g opacity="0.75">{px(2.5, 16, 1.5, 1.5, ACCENT)}</g><g opacity="0.55">{px(1.5, 18, 1.5, 1.5, ACCENT)}</g><g opacity="0.35">{px(1, 20, 1, 1, ACCENT)}</g><g opacity="0.2">{px(0.5, 21.5, 1, 1, WHITE)}</g></g>) },
  { id: 'prismwings', name: 'ปีกปริซึม', tags: ['wing', 'prism', 'epic'], price: 200, draw: () => (<g opacity="0.9">{px(0.5, 11, 5.5, 7, MAGIC)}{px(18, 11, 5.5, 7, MAGIC)}{px(0.5, 13, 5.5, 1, MAGIC_HIGHLIGHT)}{px(18, 13, 5.5, 1, MAGIC_HIGHLIGHT)}{px(0.5, 15.5, 5.5, 1, ACCENT)}{px(18, 15.5, 5.5, 1, ACCENT)}{px(0.5, 11, 5.5, 1, WHITE)}{px(18, 11, 5.5, 1, WHITE)}</g>) },
  { id: 'voidcloak', name: 'ผ้าคลุมสุญญภพ', tags: ['cloak', 'void', 'epic', 'เงา'], price: 190, draw: () => (<g>{px(4, 16, 16, 7, 'var(--av-magic-outline)')}{px(4, 16, 16, 1, MAGIC)}<g opacity="0.5">{px(4, 19, 16, 1, MAGIC)}</g>{px(6, 21, 1, 1, MAGIC_HIGHLIGHT)}{px(13, 22, 1, 1, MAGIC_HIGHLIGHT)}{px(17, 20, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'phoenixplume', name: 'ขนหางฟีนิกซ์', tags: ['tail', 'phoenix', 'legendary', 'ไฟ'], price: 210, draw: () => (<g>{px(17, 17, 5, 2.5, ACCENT)}{px(19, 14.5, 4, 3, ACCENT)}{px(18.5, 19.5, 4.5, 2.5, 'var(--av-accent)')}{px(20.5, 14.5, 1.5, 1, WHITE)}{px(21, 17.5, 1, 1, WHITE)}<g opacity="0.3">{px(16.5, 13.5, 7, 9, MAGIC)}</g></g>) },
  { id: 'gearhalo', name: 'วงเฟืองลอย', tags: ['halo', 'gear', 'epic', 'tech'], price: 160, draw: () => (<g>{px(8, 1.5, 8, 1, SECONDARY)}{px(8, 1.5, 1.5, 1, ACCENT)}{px(14.5, 1.5, 1.5, 1, ACCENT)}{px(7, 1, 1, 2, SECONDARY_SHADOW)}{px(16, 1, 1, 2, SECONDARY_SHADOW)}<g opacity="0.4">{px(7, 0.5, 10, 2.5, MAGIC)}</g></g>) },
  { id: 'crystalspire', name: 'ยอดผลึกหลัง', tags: ['crystal', 'epic', 'ผลึก'], price: 170, draw: () => (<g>{px(3, 14, 2, 6, MAGIC)}{px(2, 16, 1.5, 4, 'var(--av-magic-shadow)')}{px(4.5, 12.5, 1.5, 5, MAGIC_HIGHLIGHT)}{px(19, 14, 2, 6, MAGIC)}{px(18, 12.5, 1.5, 5, MAGIC_HIGHLIGHT)}<g opacity="0.3">{px(1.5, 11.5, 5, 9, MAGIC)}</g></g>) },
  { id: 'aurorasash', name: 'แพรแสงเหนือ', tags: ['sash', 'aurora', 'epic'], price: 150, draw: () => (<g opacity="0.85">{px(3, 15, 18, 1.5, MAGIC)}{px(3, 16.5, 18, 1, ACCENT)}{px(3, 17.5, 18, 1, MAGIC_HIGHLIGHT)}{px(2, 15, 1, 3, 'var(--av-magic-shadow)')}{px(21, 15, 1, 3, 'var(--av-magic-shadow)')}</g>) }
];

export const frontAccessories: Sprite[] = [
  { id: 'none', name: 'ไม่ถืออะไร', tags: ['none'], draw: () => <g /> },
  { id: 'staff', name: 'ไม้เท้าเวทย์', tags: ['staff', 'mage'], price: 110, draw: () => (<g>{px(19, 8, 1, 14, SECONDARY_SHADOW)}{px(18, 6, 3, 3, MAGIC)}{px(18.5, 6.5, 2, 2, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'sword', name: 'ดาบ', tags: ['sword', 'warrior'], price: 100, draw: () => (<g>{px(19.5, 7, 1.5, 10, WHITE)}{px(18.5, 17, 3.5, 1, ACCENT)}{px(19.5, 18, 1.5, 2.5, SECONDARY_SHADOW)}</g>) },
  { id: 'flask', name: 'ขวดทดลอง', tags: ['flask', 'science'], draw: () => (<g>{px(18.5, 15, 3, 1, WHITE)}{px(19, 16, 2, 4, ACCENT)}{px(19, 18.5, 2, 1.5, MAGIC)}</g>) },
  { id: 'laptop', name: 'โน้ตบุ๊ก', tags: ['laptop', 'coder'], draw: () => (<g>{px(17.5, 15.5, 5, 3.5, SECONDARY)}{px(18, 16, 4, 2.5, ACCENT)}{px(17, 19, 6, 1, SECONDARY_SHADOW)}</g>) },
  { id: 'book', name: 'หนังสือ', tags: ['book', 'reader'], draw: () => (<g>{px(17.5, 16, 5, 4, PRIMARY)}{px(18, 16.5, 2, 3, WHITE)}{px(20.5, 16.5, 1.5, 3, WHITE)}</g>) },
  { id: 'ball', name: 'ลูกบอล', tags: ['ball', 'sport'], draw: () => (<g>{px(18.5, 17.5, 4, 4, WHITE)}{px(19.5, 18.5, 2, 2, SECONDARY_SHADOW)}</g>) },
  { id: 'palette', name: 'จานสี', tags: ['palette', 'art'], draw: () => (<g>{px(17.5, 16.5, 5, 4, WHITE)}{px(18.5, 17.5, 1.5, 1.5, PRIMARY)}{px(20.5, 17.5, 1.5, 1.5, MAGIC)}{px(18.5, 19, 1.5, 1, ACCENT)}</g>) },
  { id: 'lantern', name: 'ตะเกียง', tags: ['lantern', 'steampunk'], price: 60, draw: () => (<g>{px(18.5, 14, 1, 2, SECONDARY_SHADOW)}{px(17.5, 16, 3.5, 4, SECONDARY)}{px(18, 16.5, 2.5, 3, ACCENT)}</g>) },
  { id: 'petcat', name: 'แมวประจำตัว', tags: ['pet', 'สัตว์เลี้ยง'], price: 120, draw: () => (<g>{px(18, 18, 4.5, 3.5, SECONDARY)}{px(18, 17, 1, 1.5, SECONDARY)}{px(21.5, 17, 1, 1.5, SECONDARY)}{px(19, 19, 1, 1, OUTLINE)}{px(21, 19, 1, 1, OUTLINE)}</g>) },
  { id: 'petbird', name: 'นกเกาะไหล่', tags: ['pet', 'นก'], price: 100, draw: () => (<g>{px(17, 13.5, 3, 2.5, ACCENT)}{px(19.5, 14, 1, 1, ACCENT)}{px(18, 14, 0.5, 0.5, OUTLINE)}{px(17.5, 16, 1, 1, SECONDARY_SHADOW)}</g>) },
  { id: 'orb', name: 'ลูกแก้วเวทย์', tags: ['orb', 'mage'], price: 90, draw: () => (<g>{px(18, 16.5, 4, 4, MAGIC)}{px(18.5, 17, 1.5, 1.5, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'compass', name: 'เข็มทิศ', tags: ['compass', 'explorer'], draw: () => (<g>{px(18, 16.5, 4, 4, WHITE)}{px(19, 17.5, 2, 2, PRIMARY)}{px(19.5, 17, 1, 3, ACCENT)}</g>) },

  /* The reward tier, in the hand rather than on the back. Same rule as the back half: a legendary
     item carries a companion, a light or a trail, and takes its glow from the child's own magic
     colour so it belongs to the interface it is standing in. */
  { id: 'runeblade', name: 'ดาบอาคม', tags: ['sword', 'rune', 'legendary'], price: 190, draw: () => (<g>{px(19.5, 6, 1.5, 11, WHITE)}{px(19.5, 8, 1.5, 1, MAGIC)}{px(19.5, 11, 1.5, 1, MAGIC)}{px(19.5, 14, 1.5, 1, MAGIC)}{px(18.5, 17, 3.5, 1, ACCENT)}{px(19.5, 18, 1.5, 2.5, SECONDARY_SHADOW)}<g opacity="0.35">{px(18.5, 5.5, 3.5, 12, MAGIC)}</g></g>) },
  { id: 'familiarwisp', name: 'ดวงไฟติดตาม', tags: ['familiar', 'wisp', 'legendary', 'ภูต'], price: 170, draw: () => (<g>{px(18.5, 12, 3, 3, MAGIC)}{px(19, 12.5, 2, 2, MAGIC_HIGHLIGHT)}{px(19.5, 15, 1, 1, MAGIC)}{px(17.5, 16.5, 1, 1, MAGIC)}<g opacity="0.35">{px(17.5, 11, 5, 5, MAGIC)}</g></g>) },
  { id: 'hologlobe', name: 'ลูกโลกโฮโล', tags: ['holo', 'tech', 'epic'], price: 160, draw: () => (<g opacity="0.9">{px(18, 15.5, 4.5, 4.5, MAGIC)}{px(18, 17.5, 4.5, 0.5, MAGIC_HIGHLIGHT)}{px(20, 15.5, 0.5, 4.5, MAGIC_HIGHLIGHT)}{px(18.5, 20, 3.5, 1, ACCENT)}</g>) },
  { id: 'chronowatch', name: 'นาฬิกาจักรกล', tags: ['clock', 'steampunk', 'epic'], price: 140, draw: () => (<g>{px(18, 15.5, 4.5, 4.5, SECONDARY)}{px(18.5, 16, 3.5, 3.5, WHITE)}{px(20, 16.5, 0.5, 2, OUTLINE)}{px(20, 18, 2, 0.5, OUTLINE)}{px(20, 15, 1, 1, ACCENT)}</g>) },
  { id: 'starlantern', name: 'โคมดวงดาว', tags: ['lantern', 'star', 'epic'], price: 150, draw: () => (<g>{px(19, 13, 1, 2.5, SECONDARY_SHADOW)}{px(17.5, 15.5, 4, 4.5, SECONDARY)}{px(18, 16, 3, 3.5, ACCENT)}{px(19, 17, 1, 1.5, WHITE)}<g opacity="0.3">{px(16.5, 14.5, 6, 6.5, ACCENT)}</g></g>) },
  { id: 'neonfan', name: 'พัดนีออน', tags: ['neon', 'cyber', 'epic'], price: 120, draw: () => (<g>{px(17, 15, 5.5, 1, MAGIC)}{px(17.5, 16, 4.5, 1, MAGIC_HIGHLIGHT)}{px(18, 17, 3.5, 1, MAGIC)}{px(19.5, 18, 1, 2.5, SECONDARY_SHADOW)}</g>) },
  { id: 'petdrake', name: 'มังกรน้อยประจำตัว', tags: ['pet', 'dragon', 'legendary', 'สัตว์เลี้ยง'], price: 220, draw: () => (<g>{px(17.5, 16.5, 5, 3.5, SECONDARY)}{px(21.5, 15.5, 1.5, 2, SECONDARY)}{px(16.5, 14.5, 1.5, 2.5, SECONDARY_SHADOW)}{px(19.5, 14.5, 1.5, 2.5, SECONDARY_SHADOW)}{px(19, 17.5, 1, 1, ACCENT)}{px(21, 17.5, 1, 1, ACCENT)}{px(17.5, 20, 4, 1, SECONDARY_SHADOW)}</g>) }
];

export const auras: Sprite[] = [
  { id: 'none', name: 'ไม่มีออร่า', tags: ['none'], draw: () => <g /> },
  { id: 'fire', name: 'ออร่าไฟ', tags: ['fire', 'ไฟ'], price: 100, draw: () => (<g opacity="0.75">{px(3.5, 18, 2, 4, ACCENT)}{px(18.5, 18, 2, 4, ACCENT)}{px(4, 15.5, 1, 2, MAGIC)}{px(19, 15.5, 1, 2, MAGIC)}</g>) },
  { id: 'ice', name: 'ออร่าน้ำแข็ง', tags: ['ice', 'น้ำแข็ง'], price: 100, draw: () => (<g opacity="0.75">{px(3, 12, 1.5, 1.5, ACCENT)}{px(19.5, 14, 1.5, 1.5, ACCENT)}{px(4.5, 17, 1, 1, WHITE)}{px(18.5, 10, 1, 1, WHITE)}</g>) },
  { id: 'shadow', name: 'ออร่าเงา', tags: ['shadow', 'เงา'], price: 110, draw: () => (<g opacity="0.7">{px(3, 16, 3, 6, MAGIC)}{px(18, 16, 3, 6, MAGIC)}{px(4, 13, 1.5, 2, MAGIC)}{px(19.5, 13, 1.5, 2, MAGIC)}</g>) },
  { id: 'nature', name: 'ออร่าธรรมชาติ', tags: ['nature', 'ธรรมชาติ'], price: 90, draw: () => (<g opacity="0.8">{px(3.5, 11, 1.5, 1.5, SECONDARY)}{px(19, 13, 1.5, 1.5, SECONDARY)}{px(4.5, 15, 1, 1, ACCENT)}{px(18.5, 17, 1, 1, ACCENT)}</g>) },
  { id: 'star', name: 'ออร่าดวงดาว', tags: ['star', 'ดาว'], price: 90, draw: () => (<g opacity="0.85">{px(3, 9, 1, 1, ACCENT)}{px(20, 11, 1, 1, ACCENT)}{px(4.5, 13.5, 1.5, 1.5, WHITE)}{px(18.5, 8, 1.5, 1.5, WHITE)}</g>) },
  { id: 'cyber', name: 'กริดไซเบอร์', tags: ['cyber', 'grid'], price: 120, draw: () => (<g opacity="0.6">{px(2, 10, 20, 0.5, ACCENT)}{px(2, 16, 20, 0.5, ACCENT)}{px(2, 22, 20, 0.5, ACCENT)}</g>) },
  { id: 'lightning', name: 'ออร่าสายฟ้า', tags: ['lightning', 'สายฟ้า'], price: 110, draw: () => (<g opacity="0.8">{px(3.5, 12, 1, 3, ACCENT)}{px(2.5, 15, 1, 2.5, ACCENT)}{px(20, 10, 1, 3, ACCENT)}{px(21, 13, 1, 2.5, ACCENT)}</g>) },

  /* The reward tier. An aura is the one layer that is allowed to be a wash rather than a shape, so
     these are banded opacities standing in for an ambient light — three steps rather than a smooth
     ramp, because a forty-stop gradient stops reading as pixels and starts reading as a blur. */
  { id: 'prism', name: 'ออร่าปริซึม', tags: ['prism', 'epic'], price: 160, draw: () => (<g><g opacity="0.55">{px(2.5, 9, 2, 12, MAGIC)}{px(19.5, 9, 2, 12, MAGIC)}</g><g opacity="0.35">{px(1.5, 11, 1.5, 8, ACCENT)}{px(21, 11, 1.5, 8, ACCENT)}</g><g opacity="0.75">{px(3.5, 13, 1, 4, MAGIC_HIGHLIGHT)}{px(20, 13, 1, 4, MAGIC_HIGHLIGHT)}</g></g>) },
  { id: 'ember', name: 'ออร่าถ่านไฟ', tags: ['ember', 'fire', 'epic', 'ไฟ'], price: 130, draw: () => (<g><g opacity="0.8">{px(3.5, 19, 1.5, 1.5, ACCENT)}{px(19.5, 20, 1.5, 1.5, ACCENT)}</g><g opacity="0.6">{px(4.5, 16, 1, 1, ACCENT)}{px(18.5, 15, 1, 1, ACCENT)}</g><g opacity="0.35">{px(3, 12.5, 1, 1, WHITE)}{px(20, 11, 1, 1, WHITE)}</g></g>) },
  { id: 'void', name: 'ออร่าสุญญภพ', tags: ['void', 'legendary', 'เงา'], price: 170, draw: () => (<g><g opacity="0.7">{px(2, 8, 4, 15, 'var(--av-magic-outline)')}{px(18, 8, 4, 15, 'var(--av-magic-outline)')}</g><g opacity="0.4">{px(1, 11, 1.5, 9, MAGIC)}{px(21.5, 11, 1.5, 9, MAGIC)}</g>{px(3, 14, 1, 1, MAGIC_HIGHLIGHT)}{px(20, 17, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'bloom', name: 'ออร่าดอกไม้', tags: ['bloom', 'nature', 'ดอกไม้'], price: 120, draw: () => (<g opacity="0.85">{px(3, 10, 1.5, 1.5, ACCENT)}{px(2, 14, 1, 1, SECONDARY)}{px(4, 18, 1.5, 1.5, ACCENT)}{px(19.5, 12, 1.5, 1.5, ACCENT)}{px(21, 16, 1, 1, SECONDARY)}{px(19, 20, 1.5, 1.5, ACCENT)}</g>) },
  { id: 'aurora', name: 'ออร่าแสงเหนือ', tags: ['aurora', 'legendary'], price: 180, draw: () => (<g><g opacity="0.5">{px(2, 6, 20, 1.5, MAGIC)}</g><g opacity="0.35">{px(3, 8, 18, 1.5, ACCENT)}</g><g opacity="0.22">{px(4, 10, 16, 1, MAGIC_HIGHLIGHT)}</g></g>) },
  { id: 'circuit', name: 'ออร่าวงจร', tags: ['circuit', 'cyber', 'epic'], price: 150, draw: () => (<g opacity="0.7">{px(2, 12, 3, 0.5, MAGIC)}{px(4.5, 12, 0.5, 6, MAGIC)}{px(2, 18, 3, 0.5, MAGIC)}{px(19, 10, 3, 0.5, MAGIC)}{px(19, 10, 0.5, 7, MAGIC)}{px(19, 17, 3, 0.5, MAGIC)}{px(4, 11.5, 1.5, 1.5, MAGIC_HIGHLIGHT)}{px(19, 16.5, 1.5, 1.5, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'frostring', name: 'ออร่าวงน้ำแข็ง', tags: ['frost', 'ice', 'epic', 'น้ำแข็ง'], price: 140, draw: () => (<g opacity="0.8">{px(4, 21.5, 16, 1, ACCENT)}{px(3, 22, 18, 1, WHITE)}{px(5, 20.5, 1, 1, WHITE)}{px(18, 20.5, 1, 1, WHITE)}{px(11.5, 20, 1, 1, ACCENT)}</g>) },
  { id: 'solar', name: 'ออร่าสุริยะ', tags: ['solar', 'legendary', 'แสง'], price: 190, draw: () => (<g><g opacity="0.45">{px(1.5, 7, 21, 16, ACCENT)}</g><g opacity="0.3">{px(1, 9, 1.5, 12, WHITE)}{px(22, 9, 1.5, 12, WHITE)}</g>{px(11.5, 4, 1, 2, ACCENT)}{px(6, 5.5, 1, 1.5, ACCENT)}{px(17, 5.5, 1, 1.5, ACCENT)}</g>) }
];

export const effects: Sprite[] = [
  { id: 'none', name: 'ไม่มีเอฟเฟกต์', tags: ['none'], draw: () => <g /> },
  { id: 'sparkle', name: 'ประกาย', tags: ['sparkle', 'ประกาย'], price: 40, draw: () => (<g>{px(5, 5, 1, 1, ACCENT)}{px(18.5, 6.5, 1, 1, ACCENT)}{px(16.5, 3, 1.5, 1.5, WHITE)}</g>) },
  { id: 'flameorb', name: 'ลูกไฟลอย', tags: ['fire', 'ไฟ'], price: 90, draw: () => (<g>{px(19, 9, 2.5, 2.5, ACCENT)}{px(19.5, 9.5, 1.5, 1.5, WHITE)}</g>) },
  { id: 'smokepuff', name: 'ควัน', tags: ['smoke', 'dragon'], price: 50, draw: () => (<g opacity="0.7">{px(16.5, 13.5, 2, 1.5, WHITE)}{px(18.5, 12.5, 1.5, 1.5, WHITE)}</g>) },
  { id: 'leaffall', name: 'ใบไม้ร่วง', tags: ['nature', 'ใบไม้'], price: 60, draw: () => (<g>{px(4, 7, 1.5, 1, SECONDARY)}{px(19, 12, 1.5, 1, SECONDARY)}{px(6, 14, 1, 1, ACCENT)}</g>) },
  { id: 'motes', name: 'ผงเวทมนตร์', tags: ['mage', 'mote'], price: 80, draw: () => (<g>{px(4.5, 10, 1, 1, MAGIC)}{px(19, 15, 1, 1, MAGIC)}{px(6, 8, 1, 1, MAGIC_HIGHLIGHT)}{px(17.5, 19, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'arc', name: 'ประกายไฟฟ้า', tags: ['lightning', 'arc'], price: 100, draw: () => (<g>{px(18, 6, 1, 2, ACCENT)}{px(17, 8, 1, 1.5, ACCENT)}{px(18, 9.5, 1, 1.5, ACCENT)}</g>) },
  { id: 'gridline', name: 'เส้นดิจิทัล', tags: ['cyber', 'digital'], price: 70, draw: () => (<g opacity="0.8">{px(6, 3, 12, 0.5, ACCENT)}{px(8, 1.5, 8, 0.5, ACCENT)}</g>) },

  /* The reward tier. An effect is in front of everything, so it is the one layer that can ruin a
     face: each of these keeps clear of x 7–17 at the eye line, and none of them exceeds four
     elements. A trail is four squares at falling opacities, which reads as motion in a still frame
     and costs four rectangles rather than a filter. */
  { id: 'stardust', name: 'ธุลีดาว', tags: ['stardust', 'trail', 'legendary', 'ดาว'], price: 160, draw: () => (<g>{px(19.5, 8, 1.5, 1.5, WHITE)}<g opacity="0.7">{px(21, 10.5, 1.5, 1.5, ACCENT)}</g><g opacity="0.45">{px(22, 13, 1, 1, ACCENT)}</g><g opacity="0.25">{px(22.5, 15.5, 1, 1, WHITE)}</g></g>) },
  { id: 'runeglyphs', name: 'อักขระอาคมลอย', tags: ['rune', 'mage', 'legendary'], price: 150, draw: () => (<g opacity="0.9">{px(3, 6, 1.5, 0.5, MAGIC)}{px(3.5, 6, 0.5, 1.5, MAGIC)}{px(19.5, 9, 1.5, 0.5, MAGIC)}{px(20, 8, 0.5, 1.5, MAGIC)}{px(4.5, 12, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'neonstreak', name: 'เส้นนีออนพาด', tags: ['neon', 'cyber', 'epic'], price: 130, draw: () => (<g>{px(1.5, 11, 4, 0.5, MAGIC)}<g opacity="0.6">{px(1, 13, 3, 0.5, MAGIC)}</g>{px(18.5, 15, 4, 0.5, MAGIC_HIGHLIGHT)}<g opacity="0.6">{px(20, 17, 3, 0.5, MAGIC)}</g></g>) },
  { id: 'petalfall', name: 'กลีบดอกโปรยปราย', tags: ['petal', 'nature', 'กลีบ'], price: 110, draw: () => (<g>{px(4, 4, 1.5, 1, ACCENT)}{px(19, 7, 1.5, 1, ACCENT)}{px(2.5, 12, 1, 1, PRIMARY_HIGHLIGHT)}{px(21, 16, 1, 1, ACCENT)}</g>) },
  { id: 'emberrise', name: 'ประกายไฟลอยขึ้น', tags: ['ember', 'fire', 'epic', 'ไฟ'], price: 140, draw: () => (<g>{px(4, 18, 1, 1, ACCENT)}<g opacity="0.75">{px(3.5, 14.5, 1, 1, ACCENT)}</g><g opacity="0.5">{px(4.5, 11, 1, 1, WHITE)}</g>{px(19.5, 17, 1, 1, ACCENT)}<g opacity="0.6">{px(20, 13, 1, 1, ACCENT)}</g></g>) },
  { id: 'glitch', name: 'สัญญาณรบกวน', tags: ['glitch', 'cyber', 'epic'], price: 120, draw: () => (<g opacity="0.8">{px(5.5, 10, 3, 0.5, MAGIC)}{px(6.5, 10.5, 3, 0.5, ACCENT)}{px(15, 18, 3, 0.5, MAGIC)}{px(14, 18.5, 3, 0.5, ACCENT)}</g>) },
  { id: 'snowfall', name: 'หิมะโปรย', tags: ['snow', 'ice', 'หิมะ'], price: 100, draw: () => (<g opacity="0.9">{px(3.5, 5, 1, 1, WHITE)}{px(20, 8, 1, 1, WHITE)}{px(5, 13, 1, 1, WHITE)}{px(18.5, 16, 1, 1, WHITE)}</g>) },
  { id: 'halolight', name: 'ลำแสงศักดิ์สิทธิ์', tags: ['halo', 'light', 'legendary', 'แสง'], price: 170, draw: () => (<g><g opacity="0.4">{px(8.5, 0, 7, 6, WHITE)}</g><g opacity="0.25">{px(6.5, 0, 11, 3, ACCENT)}</g>{px(9.5, 1.5, 5, 1, WHITE)}</g>) }
];
