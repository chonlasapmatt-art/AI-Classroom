import { layerOrder, type AvatarConfigV2, type LayerType } from './avatarSchema';
import { baseOf, wornOf } from './avatarFigureParts';

/**
 * What makes one avatar a different avatar from another.
 *
 * ── The problem ──
 * A catalogue built by combining parts will happily produce two entries that differ by a colour and
 * nothing else. A child scrolling a picker reads those as the same character listed twice, and the
 * second one is worse than useless: it takes a slot that could have held something they had not
 * seen. Recolours are not variety, and a count that includes them is a count of nothing.
 *
 * ── The signature ──
 * An avatar's identity is the *structure* it is built from: the body it stands on, the shape of its
 * head, the cut of its hair and the cut of its clothes. Colour is deliberately not in it — two
 * children in the same uniform with different hair colour are two different children, and the same
 * figure in two palettes is one figure.
 *
 * The signature is a set of strings rather than one string, because the question asked of it is not
 * "are these equal" but "how much do these share": two presets that differ only in their shoes
 * overlap by nearly everything, and that is the case worth refusing.
 */
export interface AvatarSignature {
  /** The structural groups, as `group:value`. Order-independent; membership is what counts. */
  parts: Set<string>;
  /** A short stable digest of the same, for storing and comparing at a glance. */
  hash: string;
}

/** The layers that decide what an avatar *is*, as opposed to what it is wearing today. */
const structuralLayers: LayerType[] = [
  'body_base', 'hair_headpiece', 'face_features', 'top_clothing', 'bottom_clothing',
  'back_accessory', 'front_accessory'
];

/** The anchor groups a re-roll has to move, named so the rule below can say "at least two of these". */
export const anchorGroups = ['body', 'head', 'hair', 'outfit', 'gear'] as const;
export type AnchorGroup = (typeof anchorGroups)[number];

const groupOfLayer: Partial<Record<LayerType, AnchorGroup>> = {
  body_base: 'body',
  face_features: 'head',
  hair_headpiece: 'hair',
  top_clothing: 'outfit',
  bottom_clothing: 'outfit',
  back_accessory: 'gear',
  front_accessory: 'gear'
};

/**
 * A 32-bit FNV-1a, rendered as eight hex characters.
 *
 * Not a cryptographic hash and not trying to be: this is an identity for a drawing, compared against
 * other drawings in the same list. What it has to be is *stable* — the same avatar must hash the
 * same on every device and every build, which rules out anything that walks an object's keys in
 * insertion order.
 */
function digest(values: string[]): string {
  let hash = 0x811c9dc5;
  for (const value of [...values].sort()) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c; // a separator, so ['ab','c'] and ['a','bc'] are different signatures
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function signatureOf(config: AvatarConfigV2): AvatarSignature {
  const parts = new Set<string>();
  parts.add(`race:${config.race ?? 'human'}`);
  /*
   * A body only counts when there is one.
   *
   * Recording "unset" as a member made every avatar that predates the figure share a structural
   * part with every other one — and most saved avatars predate it. Two of them scored 40% alike on
   * the strength of both having no body recorded, which is not a resemblance; it is an absence.
   */
  if (config.bodyArchetype) parts.add(`body:${config.bodyArchetype}`);

  for (const layer of structuralLayers) {
    const id = config.layers?.[layer];
    if (!id) continue;
    /*
     * The base and the worn half are separate members of the set.
     *
     * A composed trait names two things — a haircut and a hat — and two avatars that share the hat
     * but not the cut are not the same avatar. Counting the joined id as one member would make them
     * either fully equal or fully different, which is the distinction this whole file exists to
     * avoid making badly.
     */
    parts.add(`${layer}:${baseOf(id)}`);
    const worn = wornOf(id);
    if (worn) parts.add(`${layer}+:${worn}`);
  }
  return { parts, hash: digest([...parts]) };
}

/**
 * How much two avatars have in common, as a fraction of the larger of the two.
 *
 * The larger, not the union: an avatar wearing three things and another wearing those same three
 * plus a cape is a recolour of the first with an accessory, and dividing by the union would score it
 * as different enough to keep. What matters is whether one is contained in the other.
 */
export function signatureOverlap(left: AvatarSignature, right: AvatarSignature): number {
  const larger = Math.max(left.parts.size, right.parts.size);
  if (larger === 0) return 1;
  let shared = 0;
  for (const part of left.parts) if (right.parts.has(part)) shared += 1;
  return shared / larger;
}

/** Above this, two avatars read as the same character listed twice. */
export const DUPLICATE_THRESHOLD = 0.35;

export function isTooSimilar(left: AvatarSignature, right: AvatarSignature): boolean {
  return signatureOverlap(left, right) > DUPLICATE_THRESHOLD;
}

/** Which anchor groups two configurations differ in — what a re-roll has actually changed. */
export function changedAnchorGroups(before: AvatarConfigV2, after: AvatarConfigV2): Set<AnchorGroup> {
  const changed = new Set<AnchorGroup>();
  if ((before.race ?? 'human') !== (after.race ?? 'human')) changed.add('body');
  if (before.bodyArchetype !== after.bodyArchetype) changed.add('body');
  for (const layer of layerOrder) {
    const group = groupOfLayer[layer];
    if (!group) continue;
    if (before.layers?.[layer] !== after.layers?.[layer]) changed.add(group);
  }
  return changed;
}

/** A re-roll counts when it has moved at least two of the structural anchor groups. */
export const MINIMUM_REROLL_GROUPS = 2;

export function isAcceptableReroll(before: AvatarConfigV2, after: AvatarConfigV2): boolean {
  return changedAnchorGroups(before, after).size >= MINIMUM_REROLL_GROUPS;
}

/**
 * Picks a configuration that is not one of the ones already taken.
 *
 * `propose` is called with the attempt number so a caller can walk a list, take a random draw, or
 * anything else; this only decides whether to accept what comes back. It gives up after a bounded
 * number of tries and returns the best it saw rather than looping: a catalogue small enough to
 * exhaust is a real thing, and an avatar picker that hangs is worse than one with a near-duplicate
 * in it.
 */
export function distinctFrom(
  taken: ReadonlyArray<AvatarSignature>,
  propose: (attempt: number) => AvatarConfigV2,
  attempts = 12
): { config: AvatarConfigV2; signature: AvatarSignature; rerolls: number } {
  let best: { config: AvatarConfigV2; signature: AvatarSignature; overlap: number } | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const config = propose(attempt);
    const signature = signatureOf(config);
    const overlap = taken.reduce((worst, other) => Math.max(worst, signatureOverlap(signature, other)), 0);
    if (!best || overlap < best.overlap) best = { config, signature, overlap };
    if (overlap <= DUPLICATE_THRESHOLD) {
      return { config, signature, rerolls: attempt };
    }
  }
  return { config: best!.config, signature: best!.signature, rerolls: attempts };
}
