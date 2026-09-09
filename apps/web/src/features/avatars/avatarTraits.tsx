import type { ReactElement } from 'react';
import { layerOrder, type AvatarConfigV2, type AvatarRace, type LayerType, type TraitOption } from './avatarSchema';

/**
 * The trait tables: one row of data, one drawing function, per thing an avatar can wear.
 *
 * Adding a trait is deliberately two edits in one file — a `TraitOption` describing what it is, and
 * a draw function saying what it looks like — with nothing to register elsewhere. The compositor
 * reads the table; the picker reads the table; the search index reads the table. Anything that has
 * to be kept in step with the table lives in the table.
 *
 * ── The 8-bit rules every drawing follows ──
 *   * whole or half units on a 24×24 grid, and `shape-rendering: crispEdges` above, so nothing is
 *     ever drawn between two pixels;
 *   * colour comes from `var(--av-…)` and never from a literal, because the palette is swapped
 *     rather than redrawn — a trait that hard-codes a colour cannot be tinted, and every colour
 *     picker in the customiser silently stops working on it;
 *   * at most six shades per material: base, shadow, highlight, outline and two accents. The first
 *     four are derived in `avatarSchema.ts`; a fifth invented shade is what makes a pixel set look
 *     like several people drew it.
 */
export type TraitDraw = () => ReactElement;

export interface Trait extends TraitOption {
  draw: TraitDraw;
}

/** A pixel. Named because `<rect x y width height fill>` five hundred times reads as noise. */
function px(x: number, y: number, w: number, h: number, fill: string, key?: string) {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;
}

const SKIN = 'var(--av-skin)';
const SKIN_SHADOW = 'var(--av-skin-shadow)';
const PRIMARY = 'var(--av-primary)';
const SECONDARY = 'var(--av-secondary)';
const ACCENT = 'var(--av-accent)';
const MAGIC = 'var(--av-magic)';
const OUTLINE = 'var(--av-outline)';

/*
 * ── body_base ──
 * One silhouette per race, and they are silhouettes rather than costumes: everything a body says
 * about who this is — a snout, a visor, a wisp instead of legs — has to survive at 24 pixels beside
 * thirty-nine others on a leaderboard. Clothes go on top and must not have to know which body they
 * are covering, so every one of these keeps the same torso box (x 6–18, y 17–23) and the same head
 * box (x 7–17, y 6–16) that the legacy figure has always used.
 */
const bodies: Trait[] = [
  {
    id: 'body_human', layer: 'body_base', name: 'มนุษย์', race: ['human'],
    tags: ['human', 'มนุษย์'], tintable: ['skin'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {px(10.5, 16, 3, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_dragonkin', layer: 'body_base', name: 'มังกร', race: ['dragonkin'],
    tags: ['dragon', 'มังกร', 'scale'], tintable: ['skin', 'secondary'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {/* the snout, which is the whole difference at 24 pixels */}
        {px(9.5, 12, 6, 3, SKIN_SHADOW)}
        {px(9.5, 12, 6, 1, SKIN)}
        {px(10, 13.5, 1, 1, OUTLINE)}
        {px(14, 13.5, 1, 1, OUTLINE)}
        {/* scales down the cheek */}
        {px(7, 8, 1, 1, SECONDARY)}
        {px(7, 10, 1, 1, SECONDARY)}
        {px(16, 8, 1, 1, SECONDARY)}
        {px(16, 10, 1, 1, SECONDARY)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_demon', layer: 'body_base', name: 'ปีศาจ', race: ['demon'],
    tags: ['demon', 'tiefling', 'ปีศาจ'], tintable: ['skin', 'magic'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {/* pointed ears, the quiet half of a tiefling; the horns are a headpiece */}
        {px(5.5, 9, 1.5, 3, SKIN)}
        {px(17, 9, 1.5, 3, SKIN)}
        {px(5.5, 9, 1.5, 1, SKIN_SHADOW)}
        {px(17, 9, 1.5, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_beastfolk', layer: 'body_base', name: 'สัตว์', race: ['beastfolk'],
    tags: ['beast', 'สัตว์', 'fox', 'wolf', 'cat'], tintable: ['skin', 'secondary'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SKIN)}
        {px(9, 12, 6, 3.5, SECONDARY)}
        {px(10.5, 12.5, 3, 1.5, SKIN)}
        {px(11.5, 12.5, 1.5, 1, OUTLINE)}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(4.5, 16.5, 1.5, 5, SKIN)}
        {px(18, 16.5, 1.5, 5, SKIN)}
      </g>
    )
  },
  {
    id: 'body_spirit', layer: 'body_base', name: 'วิญญาณ', race: ['spirit'],
    tags: ['spirit', 'ghost', 'วิญญาณ'], tintable: ['magic', 'skin'],
    draw: () => (
      <g opacity="0.82">
        {px(7, 6, 10, 10, SKIN)}
        {px(7, 15, 10, 1, SKIN_SHADOW)}
        {px(6, 17, 12, 4, MAGIC)}
        {/* no legs: the body frays into three tails, which is the one thing a ghost must not have */}
        {px(6.5, 21, 3, 2, MAGIC)}
        {px(10.5, 21, 3, 2.5, MAGIC)}
        {px(14.5, 21, 3, 2, MAGIC)}
        {px(4.5, 16.5, 1.5, 4, MAGIC)}
        {px(18, 16.5, 1.5, 4, MAGIC)}
      </g>
    )
  },
  {
    id: 'body_robot', layer: 'body_base', name: 'หุ่นยนต์', race: ['robot'],
    tags: ['robot', 'หุ่นยนต์', 'tech'], tintable: ['secondary', 'accent'],
    draw: () => (
      <g>
        {px(7, 6, 10, 10, SECONDARY)}
        {px(7, 6, 10, 1, 'var(--av-secondary-highlight)')}
        {px(7, 15, 10, 1, 'var(--av-secondary-shadow)')}
        {/* the seam and the vent, which is what stops a square head reading as a box */}
        {px(7, 11, 10, 0.5, OUTLINE)}
        {px(9, 15.5, 6, 1, 'var(--av-secondary-shadow)')}
        {px(6, 17, 12, 6, PRIMARY)}
        {px(9.5, 18.5, 5, 2, ACCENT)}
        {px(4.5, 16.5, 1.5, 5, SECONDARY)}
        {px(18, 16.5, 1.5, 5, SECONDARY)}
      </g>
    )
  }
];

/*
 * ── face_features ──
 * Two pixels of eye carry more of an avatar's character than anything else on it, so these are the
 * traits worth having many of. The mouth is drawn with them rather than separately: an expression is
 * eyes and mouth agreeing, and splitting them into two drawers produces avatars that are smiling
 * with frightened eyes.
 */
const faces: Trait[] = [
  {
    id: 'face_neutral', layer: 'face_features', name: 'สายตาปกติ',
    tags: ['neutral', 'ปกติ'], tintable: [],
    draw: () => (
      <g>
        {px(9.5, 10, 1.5, 1.5, OUTLINE)}
        {px(13, 10, 1.5, 1.5, OUTLINE)}
        {px(11, 13, 2, 1, 'var(--av-skin-shadow)')}
      </g>
    )
  },
  {
    id: 'face_smile', layer: 'face_features', name: 'ยิ้ม',
    tags: ['smile', 'ยิ้ม'], tintable: [],
    draw: () => (
      <g>
        {px(9.5, 10, 1.5, 1.5, OUTLINE)}
        {px(13, 10, 1.5, 1.5, OUTLINE)}
        {px(10.5, 13, 3, 1, 'var(--av-skin-shadow)')}
        {px(10, 12.5, 1, 1, 'var(--av-skin-shadow)')}
        {px(13, 12.5, 1, 1, 'var(--av-skin-shadow)')}
      </g>
    )
  },
  {
    id: 'face_focused', layer: 'face_features', name: 'ตั้งใจ',
    tags: ['focused', 'ตั้งใจ'], tintable: [],
    draw: () => (
      <g>
        {px(9, 9.5, 2, 0.5, OUTLINE)}
        {px(13, 9.5, 2, 0.5, OUTLINE)}
        {px(9.5, 10.5, 1.5, 1, OUTLINE)}
        {px(13, 10.5, 1.5, 1, OUTLINE)}
        {px(11, 13, 2, 0.5, 'var(--av-skin-shadow)')}
      </g>
    )
  },
  {
    id: 'face_glow', layer: 'face_features', name: 'ตาเรืองแสง', element: 'shadow',
    tags: ['glow', 'เรืองแสง', 'demon'], tintable: ['magic'],
    draw: () => (
      <g>
        {px(9, 10, 2, 2, MAGIC)}
        {px(13, 10, 2, 2, MAGIC)}
        {px(9.5, 10.5, 1, 1, 'var(--av-magic-highlight)')}
        {px(13.5, 10.5, 1, 1, 'var(--av-magic-highlight)')}
        {px(11, 13, 2, 1, 'var(--av-skin-shadow)')}
      </g>
    )
  },
  {
    id: 'face_fangs', layer: 'face_features', name: 'ยิ้มเขี้ยว',
    tags: ['fang', 'เขี้ยว', 'grin'], tintable: [],
    draw: () => (
      <g>
        {px(9.5, 10, 1.5, 1.5, OUTLINE)}
        {px(13, 10, 1.5, 1.5, OUTLINE)}
        {px(10, 13, 4, 1, OUTLINE)}
        {px(10.5, 13, 1, 1, '#ffffff')}
        {px(12.5, 13, 1, 1, '#ffffff')}
      </g>
    )
  },
  {
    id: 'face_visor', layer: 'face_features', name: 'ตาไซเบอร์', race: ['robot'], element: 'cyber',
    tags: ['visor', 'cyber', 'ไซเบอร์'], tintable: ['accent'],
    draw: () => (
      <g>
        {px(8, 9.5, 8, 2.5, OUTLINE)}
        {px(8.5, 10, 3, 1.5, ACCENT)}
        {px(12.5, 10, 3, 1.5, ACCENT)}
        {px(9, 15, 6, 0.5, 'var(--av-secondary-shadow)')}
      </g>
    )
  }
];

export const traits: Trait[] = [...bodies, ...faces];

const traitIndex = new Map(traits.map((trait) => [trait.id, trait]));

export function traitById(id: string | undefined | null): Trait | null {
  return id ? traitIndex.get(id) ?? null : null;
}

export function traitsForLayer(layer: LayerType, race?: AvatarRace): Trait[] {
  return traits.filter((trait) => trait.layer === layer
    && (!race || !trait.race || trait.race.includes(race)));
}

/** The body a race falls back to when a config names no layer at all. */
export function defaultBodyFor(race: AvatarRace): string {
  return bodies.find((body) => body.race?.includes(race))?.id ?? 'body_human';
}

/** Which trait fills each layer, once `hides` has had its say. */
export function resolveLayers(config: AvatarConfigV2): Array<[LayerType, string]> {
  const race = config.race ?? 'human';
  const chosen: Partial<Record<LayerType, string>> = {
    body_base: defaultBodyFor(race),
    face_features: 'face_neutral',
    ...(config.layers ?? {})
  };

  const hidden = new Set<LayerType>();
  for (const id of Object.values(chosen)) {
    for (const layer of traitById(id)?.hides ?? []) hidden.add(layer);
  }

  const resolved: Array<[LayerType, string]> = [];
  for (const layer of layerOrder) {
    const id = chosen[layer];
    if (!id || hidden.has(layer)) continue;
    if (!traitById(id)) continue;
    resolved.push([layer, id]);
  }
  return resolved;
}
