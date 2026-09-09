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
  { id: 'druidwrap', name: 'ชุดผ้าป่า', tags: ['nature', 'ธรรมชาติ'], price: 60, draw: () => (<g>{torso(SECONDARY)}{px(8, 17, 3, 3.5, ACCENT)}{px(6, 19.5, 12, 1, PRIMARY_SHADOW)}</g>) }
];

export const bottoms: Sprite[] = [
  { id: 'trousers', name: 'กางเกงขายาว', tags: ['trousers'], draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(13, 20.5, 4.5, 3, SECONDARY_SHADOW)}</g>) },
  { id: 'skirt', name: 'กระโปรง', tags: ['skirt'], draw: () => (<g>{px(6, 20.5, 12, 2.5, SECONDARY)}{px(6, 20.5, 12, 0.5, SECONDARY_SHADOW)}</g>) },
  { id: 'shorts', name: 'กางเกงขาสั้น', tags: ['shorts', 'กีฬา'], draw: () => (<g>{px(6.5, 20.5, 4.5, 2, PRIMARY_SHADOW)}{px(13, 20.5, 4.5, 2, PRIMARY_SHADOW)}</g>) },
  { id: 'robehem', name: 'ชายเสื้อคลุม', tags: ['robe', 'mage'], price: 40, draw: () => (<g>{px(5.5, 20.5, 13, 3, MAGIC)}{px(5.5, 22.5, 13, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'greaves', name: 'สนับแข้ง', tags: ['armor', 'เกราะ'], price: 80, draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY)}{px(13, 20.5, 4.5, 3, SECONDARY)}{px(6.5, 20.5, 4.5, 0.5, ACCENT)}{px(13, 20.5, 4.5, 0.5, ACCENT)}</g>) },
  { id: 'techpants', name: 'กางเกงเทคแวร์', tags: ['techwear', 'cyber'], price: 60, draw: () => (<g>{px(6.5, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(13, 20.5, 4.5, 3, SECONDARY_SHADOW)}{px(9.5, 21, 1.5, 0.5, ACCENT)}{px(13, 21, 1.5, 0.5, ACCENT)}</g>) }
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
  { id: 'jetpack', name: 'เจ็ตแพ็ก', tags: ['tech', 'jetpack'], price: 130, draw: () => (<g>{px(2.5, 16, 3.5, 5, SECONDARY)}{px(3, 21, 2.5, 1.5, ACCENT)}{px(2.5, 16, 3.5, 0.5, WHITE)}</g>) }
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
  { id: 'compass', name: 'เข็มทิศ', tags: ['compass', 'explorer'], draw: () => (<g>{px(18, 16.5, 4, 4, WHITE)}{px(19, 17.5, 2, 2, PRIMARY)}{px(19.5, 17, 1, 3, ACCENT)}</g>) }
];

export const auras: Sprite[] = [
  { id: 'none', name: 'ไม่มีออร่า', tags: ['none'], draw: () => <g /> },
  { id: 'fire', name: 'ออร่าไฟ', tags: ['fire', 'ไฟ'], price: 100, draw: () => (<g opacity="0.75">{px(3.5, 18, 2, 4, ACCENT)}{px(18.5, 18, 2, 4, ACCENT)}{px(4, 15.5, 1, 2, MAGIC)}{px(19, 15.5, 1, 2, MAGIC)}</g>) },
  { id: 'ice', name: 'ออร่าน้ำแข็ง', tags: ['ice', 'น้ำแข็ง'], price: 100, draw: () => (<g opacity="0.75">{px(3, 12, 1.5, 1.5, ACCENT)}{px(19.5, 14, 1.5, 1.5, ACCENT)}{px(4.5, 17, 1, 1, WHITE)}{px(18.5, 10, 1, 1, WHITE)}</g>) },
  { id: 'shadow', name: 'ออร่าเงา', tags: ['shadow', 'เงา'], price: 110, draw: () => (<g opacity="0.7">{px(3, 16, 3, 6, MAGIC)}{px(18, 16, 3, 6, MAGIC)}{px(4, 13, 1.5, 2, MAGIC)}{px(19.5, 13, 1.5, 2, MAGIC)}</g>) },
  { id: 'nature', name: 'ออร่าธรรมชาติ', tags: ['nature', 'ธรรมชาติ'], price: 90, draw: () => (<g opacity="0.8">{px(3.5, 11, 1.5, 1.5, SECONDARY)}{px(19, 13, 1.5, 1.5, SECONDARY)}{px(4.5, 15, 1, 1, ACCENT)}{px(18.5, 17, 1, 1, ACCENT)}</g>) },
  { id: 'star', name: 'ออร่าดวงดาว', tags: ['star', 'ดาว'], price: 90, draw: () => (<g opacity="0.85">{px(3, 9, 1, 1, ACCENT)}{px(20, 11, 1, 1, ACCENT)}{px(4.5, 13.5, 1.5, 1.5, WHITE)}{px(18.5, 8, 1.5, 1.5, WHITE)}</g>) },
  { id: 'cyber', name: 'กริดไซเบอร์', tags: ['cyber', 'grid'], price: 120, draw: () => (<g opacity="0.6">{px(2, 10, 20, 0.5, ACCENT)}{px(2, 16, 20, 0.5, ACCENT)}{px(2, 22, 20, 0.5, ACCENT)}</g>) },
  { id: 'lightning', name: 'ออร่าสายฟ้า', tags: ['lightning', 'สายฟ้า'], price: 110, draw: () => (<g opacity="0.8">{px(3.5, 12, 1, 3, ACCENT)}{px(2.5, 15, 1, 2.5, ACCENT)}{px(20, 10, 1, 3, ACCENT)}{px(21, 13, 1, 2.5, ACCENT)}</g>) }
];

export const effects: Sprite[] = [
  { id: 'none', name: 'ไม่มีเอฟเฟกต์', tags: ['none'], draw: () => <g /> },
  { id: 'sparkle', name: 'ประกาย', tags: ['sparkle', 'ประกาย'], price: 40, draw: () => (<g>{px(5, 5, 1, 1, ACCENT)}{px(18.5, 6.5, 1, 1, ACCENT)}{px(16.5, 3, 1.5, 1.5, WHITE)}</g>) },
  { id: 'flameorb', name: 'ลูกไฟลอย', tags: ['fire', 'ไฟ'], price: 90, draw: () => (<g>{px(19, 9, 2.5, 2.5, ACCENT)}{px(19.5, 9.5, 1.5, 1.5, WHITE)}</g>) },
  { id: 'smokepuff', name: 'ควัน', tags: ['smoke', 'dragon'], price: 50, draw: () => (<g opacity="0.7">{px(16.5, 13.5, 2, 1.5, WHITE)}{px(18.5, 12.5, 1.5, 1.5, WHITE)}</g>) },
  { id: 'leaffall', name: 'ใบไม้ร่วง', tags: ['nature', 'ใบไม้'], price: 60, draw: () => (<g>{px(4, 7, 1.5, 1, SECONDARY)}{px(19, 12, 1.5, 1, SECONDARY)}{px(6, 14, 1, 1, ACCENT)}</g>) },
  { id: 'motes', name: 'ผงเวทมนตร์', tags: ['mage', 'mote'], price: 80, draw: () => (<g>{px(4.5, 10, 1, 1, MAGIC)}{px(19, 15, 1, 1, MAGIC)}{px(6, 8, 1, 1, MAGIC_HIGHLIGHT)}{px(17.5, 19, 1, 1, MAGIC_HIGHLIGHT)}</g>) },
  { id: 'arc', name: 'ประกายไฟฟ้า', tags: ['lightning', 'arc'], price: 100, draw: () => (<g>{px(18, 6, 1, 2, ACCENT)}{px(17, 8, 1, 1.5, ACCENT)}{px(18, 9.5, 1, 1.5, ACCENT)}</g>) },
  { id: 'gridline', name: 'เส้นดิจิทัล', tags: ['cyber', 'digital'], price: 70, draw: () => (<g opacity="0.8">{px(6, 3, 12, 0.5, ACCENT)}{px(8, 1.5, 8, 0.5, ACCENT)}</g>) }
];
