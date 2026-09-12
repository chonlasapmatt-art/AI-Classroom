import type { ReactElement } from 'react';
import { directionRig, type DirectionRig } from './avatarDirection';
import {
  ACCENT, MAGIC, MAGIC_HIGHLIGHT, OUTLINE, PRIMARY, PRIMARY_HIGHLIGHT, PRIMARY_SHADOW,
  SECONDARY, SECONDARY_SHADOW, WHITE, px
} from './avatarSprites';

/**
 * The animals, as animals.
 *
 * ── What was wrong ──
 * "น้องแมว" was a child with cat ears and a tail: the same skull, the same two arms, the same pair of
 * trousers, plus two triangles on top. Every beast in the set was that, which is why the school
 * looked at nine animals and saw one person in nine hats — and why a cat could not be told from a
 * fox at the size a class list draws them.
 *
 * These are a different animal entirely, in the literal sense. A creature has a head on a barrel, an
 * animal's four legs, and a tail that belongs to its species; it has no shoulders, no waist, and
 * nothing to put trousers on. What it does have is a skull in the same place a human one is, which
 * is the one compatibility that matters: every hat, headpiece, collar, cape, aura and held item in
 * the wardrobe still fits, so a creature is dressable without a second wardrobe existing.
 *
 * ── One drawing per species, not one drawing tinted nine ways ──
 * The complaint this exists to answer is that a category read as one figure in different colours, so
 * nothing here is decided by colour. A species names its skull, its ears, its muzzle, its build, its
 * tail and its markings, and each of those is a different set of rectangles — a bear's broad head and
 * a penguin's beak are not the same head with a different fill.
 *
 * ── Colour is still the child's ──
 * The fur is the primary tint, markings are the secondary, and the nose, pads and inner ear are the
 * accent, so every creature recolours from the same four swatches the rest of the customiser uses.
 * A species is its shape; the palette stays the part a child owns.
 */

export type CreatureSkull = 'round' | 'broad' | 'long' | 'blocky';
export type CreatureEar = 'triangle' | 'floppy' | 'round' | 'tuft' | 'horn' | 'tiny';
export type CreatureMuzzle = 'short' | 'snout' | 'long' | 'flat' | 'beak';
export type CreatureBuild = 'slim' | 'stocky' | 'round' | 'tall';
export type CreatureTail = 'curl' | 'long' | 'tuft' | 'plume' | 'stub' | 'spike';

export interface CreatureSpec {
  skull: CreatureSkull;
  ear: CreatureEar;
  muzzle: CreatureMuzzle;
  build: CreatureBuild;
  tail: CreatureTail;
  /** A ring of longer fur round the head. The lion is the reason this exists. */
  mane?: boolean;
  stripes?: boolean;
  spots?: boolean;
  /** A paler front, from the chin to between the forelegs. */
  belly?: boolean;
  horns?: 'cow' | 'dragon';
  wings?: boolean;
  /** Two small tusks at the corners of the mouth. */
  tusks?: boolean;
  /** The eye colour, when the species wants one of its own rather than the outline. */
  eye?: string;
}

/* The ground line every creature stands on, and the line its belly hangs from. */
const FLOOR = 45;

/* ────────────────────────────────────────────────────────────────────────────
 * The head
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How wide and how tall a skull is, which is most of what tells two animals apart at 40 pixels.
 *
 * The four differ by more than a unit or two on purpose. A round skull is a cat or a lion: as tall
 * as it is wide, and the eyes sit high in it. A broad one is a cow or a pig — wide, shallow, and
 * mostly cheek. A long one is a dog or a dragon, narrow with the length going forward into the
 * muzzle rather than up into the brow. A blocky one is a bear: square, heavy, and flat across the
 * top. Those are different outlines before a single colour is chosen, which is the whole brief.
 */
const skullBox: Record<CreatureSkull, { x: number; width: number; y: number; height: number }> = {
  round: { x: 14, width: 20, height: 15, y: 4 },
  broad: { x: 11, width: 26, height: 13, y: 6 },
  long: { x: 16, width: 16, height: 15, y: 4 },
  blocky: { x: 12, width: 24, height: 16, y: 3 }
};

/**
 * How far the muzzle hangs below the skull, and how wide it is.
 *
 * Drawn as a block that *leaves* the skull rather than as a patch painted on it. That is the whole
 * difference between a dog and a cat at this size: both have a pale mouth area, and only one of them
 * has a nose that sticks out past the line of the face.
 */
const muzzleBox: Record<CreatureMuzzle, { width: number; height: number; drop: number }> = {
  short: { width: 9, height: 5, drop: 1 },
  snout: { width: 10, height: 6, drop: 3.5 },
  long: { width: 8, height: 8, drop: 5 },
  flat: { width: 13, height: 5, drop: 1.5 },
  beak: { width: 8, height: 6, drop: 2 }
};

/**
 * The ears, which carry the species from across a room.
 *
 * They are painted before the skull so their roots disappear behind it, and they sit in their own
 * group so the stylesheet's ear twitch reaches them — an animal whose ears never move is a statue.
 */
function creatureEars(spec: CreatureSpec, turn: DirectionRig): ReactElement | null {
  const box = skullBox[spec.skull];
  const left = box.x + 1;
  const right = box.x + box.width - 5;
  const shift = Math.round(turn.yaw * 2 * 2) / 2;
  const inner = 'var(--av-accent, #f59e0b)';

  if (spec.ear === 'tiny') return null;
  return (
    <g data-part="ears">
      {spec.ear === 'triangle' && (
        <>
          <polygon points={`${left + shift},${box.y + 4} ${left + 1.5 + shift},${box.y - 4} ${left + 6 + shift},${box.y + 2}`} fill={PRIMARY} />
          <polygon points={`${right + shift + 4},${box.y + 4} ${right + 2.5 + shift},${box.y - 4} ${right - 2 + shift},${box.y + 2}`} fill={PRIMARY} />
          <polygon points={`${left + 1.5 + shift},${box.y + 2.5} ${left + 2.2 + shift},${box.y - 1.5} ${left + 4 + shift},${box.y + 2}`} fill={inner} />
          <polygon points={`${right + 2.5 + shift},${box.y + 2.5} ${right + 1.8 + shift},${box.y - 1.5} ${right + shift},${box.y + 2}`} fill={inner} />
        </>
      )}
      {/* A floppy ear hangs off the side of the head and widens as it falls, which is the shape that
          separates a spaniel from a bar of fur stuck to a temple. */}
      {spec.ear === 'floppy' && (
        <>
          <polygon
            points={`${box.x - 1 + shift},${box.y + 1} ${box.x + 4 + shift},${box.y + 1} ${box.x + 2.5 + shift},${box.y + 11} ${box.x - 3 + shift},${box.y + 9}`}
            fill={PRIMARY_SHADOW}
          />
          <polygon
            points={`${box.x + box.width + 1 + shift},${box.y + 1} ${box.x + box.width - 4 + shift},${box.y + 1} ${box.x + box.width - 2.5 + shift},${box.y + 11} ${box.x + box.width + 3 + shift},${box.y + 9}`}
            fill={PRIMARY_SHADOW}
          />
          {px(box.x - 0.5 + shift, box.y + 2, 3, 6, inner)}
          {px(box.x + box.width - 2.5 + shift, box.y + 2, 3, 6, inner)}
        </>
      )}
      {spec.ear === 'round' && (
        <>
          <circle cx={left + 2 + shift} cy={box.y + 0.5} r="3.4" fill={PRIMARY} />
          <circle cx={right + 3 + shift} cy={box.y + 0.5} r="3.4" fill={PRIMARY} />
          <circle cx={left + 2 + shift} cy={box.y + 0.8} r="1.7" fill={inner} />
          <circle cx={right + 3 + shift} cy={box.y + 0.8} r="1.7" fill={inner} />
        </>
      )}
      {spec.ear === 'tuft' && (
        <>
          <polygon points={`${left + shift},${box.y + 3} ${left + 2 + shift},${box.y - 5} ${left + 5 + shift},${box.y + 1.5}`} fill={PRIMARY} />
          <polygon points={`${right + 4 + shift},${box.y + 3} ${right + 2 + shift},${box.y - 5} ${right - 1 + shift},${box.y + 1.5}`} fill={PRIMARY} />
          {/* The lynx tuft: the thing that makes an ear read as wild rather than as a pet. */}
          {px(left + 1.5 + shift, Math.max(0, box.y - 5.5), 1, 2, SECONDARY)}
          {px(right + 2 + shift, Math.max(0, box.y - 5.5), 1, 2, SECONDARY)}
        </>
      )}
      {spec.ear === 'horn' && (
        <>
          {px(left + 1 + shift, box.y - 1, 3, 4, PRIMARY_SHADOW)}
          {px(right + 2 + shift, box.y - 1, 3, 4, PRIMARY_SHADOW)}
        </>
      )}
    </g>
  );
}

/** Horns, which are not ears: they grow out of the skull and never twitch. */
function creatureHorns(spec: CreatureSpec, turn: DirectionRig): ReactElement | null {
  if (!spec.horns) return null;
  const box = skullBox[spec.skull];
  const shift = Math.round(turn.yaw * 2 * 2) / 2;
  const bone = 'var(--av-primary-highlight)';
  if (spec.horns === 'cow') {
    return (
      <g data-part="horns">
        {px(box.x - 2 + shift, box.y + 1, 4, 2, bone)}
        {px(box.x + box.width - 2 + shift, box.y + 1, 4, 2, bone)}
        {px(box.x - 3 + shift, box.y - 0.5, 2, 2.5, bone)}
        {px(box.x + box.width + 1 + shift, box.y - 0.5, 2, 2.5, bone)}
      </g>
    );
  }
  return (
    <g data-part="horns">
      <polygon
        points={`${box.x + 3 + shift},${box.y + 2} ${box.x + 0.5 + shift},${Math.max(0.5, box.y - 4)} ${box.x + 6 + shift},${box.y - 0.5}`}
        fill={SECONDARY}
      />
      <polygon
        points={`${box.x + box.width - 3 + shift},${box.y + 2} ${box.x + box.width - 0.5 + shift},${Math.max(0.5, box.y - 4)} ${box.x + box.width - 6 + shift},${box.y - 0.5}`}
        fill={SECONDARY}
      />
    </g>
  );
}

/**
 * The skull, the muzzle and the markings on them.
 *
 * The muzzle is part of the head rather than a feature drawn on it, which is what lets a long-nosed
 * animal keep its profile when the head turns: the whole block slides with the yaw instead of the
 * nose sliding across a face that stayed put.
 */
export function creatureHead(spec: CreatureSpec, rig?: DirectionRig): ReactElement {
  const turn = rig ?? directionRig('front');
  const box = skullBox[spec.skull];
  const shift = Math.round(turn.yaw * 3 * 2) / 2;
  const snout = muzzleBox[spec.muzzle];
  const muzzleWidth = snout.width;
  const muzzleHeight = snout.height;
  const muzzleX = 24 - muzzleWidth / 2 + shift;
  /* The muzzle starts inside the skull and ends below it, so it reads as attached and protruding. */
  const muzzleY = box.y + box.height - muzzleHeight + snout.drop;

  return (
    <g data-part="head">
      {creatureEars(spec, turn)}
      {creatureHorns(spec, turn)}

      {/* A mane sits between the ears and the skull: behind the face, over the neck. */}
      {/*
        * A mane is a ring of longer fur around the face, and the first cut drew it as a filled disc
        * the size of the head — which is a lion wearing a dinner plate. Spikes around the rim read as
        * fur and leave the face clear, which is where the animal actually is.
        */}
      {spec.mane && (
        <g data-part="mane">
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2;
            const cx = 24 + Math.cos(angle) * (box.width / 2 + 1);
            const cy = box.y + box.height / 2 + Math.sin(angle) * (box.height / 2 + 1);
            return (
              <polygon
                key={index}
                points={`${cx - 3},${cy - 3} ${cx + 4.5},${cy} ${cx - 3},${cy + 3}`}
                transform={`rotate(${(angle * 180) / Math.PI} ${cx} ${cy})`}
                fill={index % 2 === 0 ? SECONDARY : SECONDARY_SHADOW}
              />
            );
          })}
        </g>
      )}

      {/* The skull, lit from above, with the far cheek in shadow so a round head reads as round. */}
      {px(box.x, box.y, box.width, box.height, PRIMARY)}
      {px(box.x, box.y, box.width, 1.5, PRIMARY_HIGHLIGHT)}
      {px(turn.yaw > 0.2 ? box.x + 1 : box.x + box.width - 3, box.y + 2, 2, box.height - 4, PRIMARY_SHADOW)}

      {/* Markings. Stripes run across the brow and down the cheeks; spots are irregular patches. */}
      {spec.stripes && (
        <g opacity="0.85">
          {px(box.x + 3 + shift, box.y + 1.5, 1.5, 4, SECONDARY)}
          {px(box.x + 7 + shift, box.y + 0.5, 1.5, 3, SECONDARY)}
          {px(box.x + box.width - 4.5 + shift, box.y + 1.5, 1.5, 4, SECONDARY)}
          {px(box.x + box.width - 8.5 + shift, box.y + 0.5, 1.5, 3, SECONDARY)}
        </g>
      )}
      {spec.spots && (
        <g opacity="0.9">
          {px(box.x + 1.5 + shift, box.y + 3, 5, 4.5, SECONDARY)}
          {px(box.x + box.width - 5 + shift, box.y + 7, 4, 3.5, SECONDARY)}
        </g>
      )}

      {/*
        * The muzzle, and the jaw it grows out of.
        *
        * The jaw is the part that was missing: without it the pale block hung below the chin like a
        * plate somebody had stuck there, because nothing in the animal's own colour connected it to
        * the head. The jaw is fur, drawn first and slightly wider, so the muzzle sits *in* a face.
        */}
      {spec.muzzle !== 'beak' && (
        <>
          {px(muzzleX - 1.5, muzzleY - 2, muzzleWidth + 3, muzzleHeight + 1, PRIMARY)}
          {px(muzzleX, muzzleY, muzzleWidth, muzzleHeight, spec.belly ? WHITE : PRIMARY_HIGHLIGHT)}
          {px(muzzleX, muzzleY + muzzleHeight - 1, muzzleWidth, 1, PRIMARY_SHADOW)}
        </>
      )}
      {spec.muzzle === 'beak' && (
        <>
          <polygon
            points={`${20 + shift},${muzzleY} ${28 + shift},${muzzleY} ${24 + shift},${muzzleY + 6}`}
            fill={ACCENT}
          />
          <polygon
            points={`${20 + shift},${muzzleY} ${28 + shift},${muzzleY} ${24 + shift},${muzzleY + 2.5}`}
            fill={MAGIC_HIGHLIGHT}
            opacity="0.45"
          />
        </>
      )}

      {spec.tusks && (
        <>
          {px(muzzleX + 0.5, muzzleY + muzzleHeight - 1, 1.5, 2.5, WHITE)}
          {px(muzzleX + muzzleWidth - 2, muzzleY + muzzleHeight - 1, 1.5, 2.5, WHITE)}
        </>
      )}
    </g>
  );
}

/**
 * The face, which is where the animal stops being an outline and starts being somebody.
 *
 * Drawn after the skull and never on the back view, exactly like the human face — the compositor
 * treats both the same, so a blink keyframe written once reaches a bear as well as a child.
 */
export function creatureFace(spec: CreatureSpec, rig?: DirectionRig): ReactElement {
  const turn = rig ?? directionRig('front');
  if (turn.faceHidden) return <g data-part="face" />;
  const box = skullBox[spec.skull];
  const shift = Math.round(turn.yaw * 3 * 2) / 2;
  const eye = spec.eye ?? OUTLINE;
  const eyeY = box.y + box.height / 2 - 3;
  const nearEye = 24 - 5.5 + shift;
  const farEye = 24 + 1.5 + shift;
  const muzzleHeight = spec.muzzle === 'long' ? 7 : spec.muzzle === 'flat' ? 4 : 5.5;
  const noseY = box.y + box.height - muzzleHeight + 1.5;

  return (
    <g data-part="face">
      <g data-part="eyes">
        {/* Round pupils with two glints: the cheapest pair of rectangles that read as alive. */}
        {px(nearEye, eyeY, 4, 4.5, WHITE)}
        {px(farEye, eyeY, 4, 4.5, WHITE)}
        {px(nearEye + 0.75, eyeY + 0.75, 2.5, 3, eye)}
        {px(farEye + 0.75, eyeY + 0.75, 2.5, 3, eye)}
        {px(nearEye + 1.25, eyeY + 1.25, 1, 1, WHITE)}
        {px(farEye + 1.25, eyeY + 1.25, 1, 1, WHITE)}
        {px(nearEye, eyeY - 0.75, 4, 0.75, OUTLINE)}
        {px(farEye, eyeY - 0.75, 4, 0.75, OUTLINE)}
      </g>

      {/* The nose, and the mouth under it. A beak has neither: it is both already. */}
      {spec.muzzle !== 'beak' && (
        <>
          {spec.muzzle === 'snout' || spec.muzzle === 'flat' ? (
            <>
              {px(21.5 + shift, noseY, 5, 3, ACCENT)}
              {px(22.5 + shift, noseY + 0.75, 1, 1.5, OUTLINE)}
              {px(24.5 + shift, noseY + 0.75, 1, 1.5, OUTLINE)}
            </>
          ) : (
            <>
              <polygon
                points={`${22 + shift},${noseY} ${26 + shift},${noseY} ${24 + shift},${noseY + 2.2}`}
                fill={OUTLINE}
              />
              {px(23.5 + shift, noseY + 2.2, 1, 1.5, OUTLINE)}
              {px(21 + shift, noseY + 3.2, 2.5, 0.75, OUTLINE)}
              {px(24.5 + shift, noseY + 3.2, 2.5, 0.75, OUTLINE)}
            </>
          )}
        </>
      )}

      {/* Whiskers on the cats, and a blush on everything: this is a pet, not a wildlife plate. */}
      <g opacity="0.65">
        {px(box.x - 1 + shift, noseY - 0.5, 4, 0.5, PRIMARY_SHADOW)}
        {px(box.x + box.width - 3 + shift, noseY - 0.5, 4, 0.5, PRIMARY_SHADOW)}
      </g>
      <g opacity="0.6">
        {px(box.x + 1.5 + shift, eyeY + 5, 3, 1.5, 'var(--av-blush, #ff97ae)')}
        {px(box.x + box.width - 4.5 + shift, eyeY + 5, 3, 1.5, 'var(--av-blush, #ff97ae)')}
      </g>
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The body, the legs and the tail
 * ──────────────────────────────────────────────────────────────────────────── */

/*
 * The barrel, which is wide and short because an animal's body is.
 *
 * The first cut made it 13 units tall and 20 wide — a human torso stood on end — and every creature
 * came out a small person: head on top, body below, two legs under that. A four-legged body is the
 * other way round: it is wider than it is tall, it hangs *between* the legs rather than sitting on
 * them, and the head is in front of it rather than above. Those three facts are the whole difference
 * between a cat and a child in a cat suit.
 *
 * `tall` is the exception and it is a bird: a penguin stands upright, which is why a penguin is the
 * one animal a child will accept drawn like a person.
 */
const buildBox: Record<CreatureBuild, { x: number; width: number; y: number; height: number }> = {
  slim: { x: 11, width: 26, y: 24, height: 11 },
  stocky: { x: 8, width: 32, y: 23, height: 13 },
  round: { x: 9, width: 30, y: 22, height: 15 },
  tall: { x: 15, width: 18, y: 21, height: 18 }
};


/**
 * The barrel, and the neck that carries the head off the front of it.
 *
 * Corners are cut rather than square: four rectangles with their corners knocked off read as a body
 * with weight in it, and a plain rectangle reads as a crate. The underside carries the shadow
 * because the light in this whole product falls from above, and the belly — where a species has a
 * pale one — is the lower front rather than the whole flank, which is where the pale fur actually is
 * on an animal.
 */
export function creatureBody(spec: CreatureSpec): ReactElement {
  const box = buildBox[spec.build];
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  /*
   * The bird, drawn as a bird.
   *
   * Every other creature here is a barrel between four legs, and running a penguin through that
   * produced a small person in a waistcoat. A penguin is one shape from the shoulders down — a
   * teardrop, wider at the bottom — with two flippers hanging off it and a pale front that reaches
   * up to the chin. None of that is a variation on a barrel, so it is its own drawing.
   */
  if (spec.build === 'tall') {
    return (
      <g data-part="torso">
        {px(19, box.y - 6, 10, 8, PRIMARY_SHADOW)}
        {px(box.x + 1, box.y, box.width - 2, box.height, PRIMARY)}
        {px(box.x, box.y + 2, box.width, box.height - 4, PRIMARY)}
        {px(box.x - 1, box.y + 6, box.width + 2, box.height - 9, PRIMARY)}
        {px(box.x + 2, box.y, box.width - 4, 1.5, PRIMARY_HIGHLIGHT)}
        {/* The white front, reaching up between the flippers to just under the beak. */}
        {px(box.x + 3, box.y + 1, box.width - 6, box.height - 3, WHITE)}
        {/* Flippers: narrow at the shoulder, wide at the tip, held a little away from the body. */}
        <polygon points={`${box.x - 1},${box.y + 2} ${box.x + 2},${box.y + 2} ${box.x + 1},${box.y + 14} ${box.x - 3},${box.y + 11}`} fill={PRIMARY_SHADOW} />
        <polygon points={`${right + 1},${box.y + 2} ${right - 2},${box.y + 2} ${right - 1},${box.y + 14} ${right + 3},${box.y + 11}`} fill={PRIMARY_SHADOW} />
      </g>
    );
  }

  return (
    <g data-part="torso">
      {/*
        * The neck, which has to overlap both ends.
        *
        * Four units of column between a chin and a chest is a gap, and a head over a gap reads as a
        * head balanced on a body rather than joined to it. This starts inside the skull and ends
        * inside the barrel, and it is the animal's own fur in shadow — a neck is not a post.
        */}
      {px(19, box.y - 7, 10, 9, PRIMARY_SHADOW)}

      {px(box.x + 1.5, box.y, box.width - 3, box.height, PRIMARY)}
      {px(box.x, box.y + 1.5, box.width, box.height - 3, PRIMARY)}
      {px(box.x + 2, box.y, box.width - 4, 1.5, PRIMARY_HIGHLIGHT)}
      {px(box.x + 2, bottom - 1.5, box.width - 4, 1.5, PRIMARY_SHADOW)}

      {/* The pale underside, low and inset and not quite white: a full-strength white panel across a
          flank reads as a label stuck to the animal, which is what the first cut looked like. */}
      {spec.belly && (
        <g opacity="0.55">
          {px(box.x + 5, box.y + box.height / 2 + 0.5, box.width - 10, box.height / 2 - 1, WHITE)}
        </g>
      )}

      {/* Stripes wrap the flank, so they are taller than they are wide and lean with the body. */}
      {spec.stripes && (
        <g opacity="0.9">
          {px(box.x + 5, box.y + 1, 2, box.height - 2, SECONDARY)}
          {px(box.x + 10, box.y, 2, box.height - 3, SECONDARY)}
          {px(right - 9, box.y + 1, 2, box.height - 2, SECONDARY)}
          {px(right - 5, box.y, 2, box.height - 4, SECONDARY)}
        </g>
      )}

      {/* Spots are patches of different sizes; three identical rectangles read as a pattern swatch. */}
      {spec.spots && (
        <g opacity="0.95">
          {px(box.x + 3, box.y + 2, 7, 6, SECONDARY)}
          {px(right - 10, box.y + 5, 6, 5, SECONDARY)}
          {px(box.x + 12, bottom - 5, 4, 3.5, SECONDARY)}
        </g>
      )}
    </g>
  );
}

/**
 * A pair of legs, near or far.
 *
 * Two groups rather than four legs in one, because the compositor already animates a near pair and a
 * far pair — which is what makes a creature walk with the same keyframes a person does, with the far
 * pair a beat behind. The far pair is drawn in shadow so the body reads as having depth rather than
 * as four legs side by side.
 */
/**
 * A pair of legs — one foreleg and one hind leg — on the near side of the body or the far side.
 *
 * ── Why the forelegs are called arms ──
 * The pose system moves four parts: two arms and two legs, swinging in opposite pairs. On an animal
 * those four parts are the four legs, and the diagonal pairing that falls out of it — near foreleg
 * with far hind leg — is exactly a trot, which is how a four-legged animal actually moves. So a
 * creature's forelegs take the arm classes and its hind legs take the leg ones: every pose written
 * for a person now animates an animal correctly, and a walk reads as a trot without a single new
 * keyframe.
 *
 * It is also what the compositor requires. A figure with no arm groups has two of its four moving
 * parts missing, and half of every pose lands on nothing.
 */
export function creatureLegs(spec: CreatureSpec, side: 'near' | 'far'): ReactElement {
  const box = buildBox[spec.build];
  const top = box.y + box.height - 1.5;
  const fur = side === 'near' ? PRIMARY : PRIMARY_SHADOW;
  const pad = side === 'near' ? ACCENT : 'var(--av-accent-shadow)';
  const width = spec.build === 'stocky' || spec.build === 'round' ? 6 : 5;
  const height = FLOOR - top - (side === 'near' ? 0 : 1);

  /*
   * The far pair stands *inside* the near pair and a little short of the floor.
   *
   * Offsetting them upwards alone — which the first cut did — hides them behind the near pair
   * completely, and a four-legged animal with two visible legs is a biped. Inset and dimmed, the far
   * pair reads as the other side of the body, which is the only thing that makes the barrel look
   * like it has depth rather than being a flat card.
   */
  const inset = side === 'near' ? 0 : 4.5;
  /* Hard against the corners: legs gathered under the middle of a body read as one thick column with
     a notch in it, which is what a cat looked like before this. */
  const front = box.x + 0.5 + inset;
  const back = box.x + box.width - width - 0.5 - inset;

  const foreName = side === 'near' ? 'frontArm' : 'backArm';
  const hindName = side === 'near' ? 'frontLeg' : 'backLeg';

  if (spec.build === 'tall') {
    /*
     * A bird stands on two flat feet, and they are the wrong colour to be fur.
     *
     * Webbed feet are the accent — the same orange as the beak, which is what a penguin's feet
     * actually are — and they splay outwards past the body. A penguin has no forelegs on the floor,
     * so the group that would hold one holds its flipper instead: something for a wave to move.
     */
    const footWidth = side === 'near' ? 8 : 7;
    const footX = side === 'near' ? 16 : 25;
    const webbing = side === 'near' ? ACCENT : 'var(--av-accent-shadow)';
    return (
      <g {...(side === 'near' ? { 'data-part': 'legs' } : {})}>
        <g data-part={hindName}>
          {px(footX + 1.5, FLOOR - 4.5, 4, 3, webbing)}
          {px(footX, FLOOR - 2, footWidth, 2, webbing)}
        </g>
        <g data-part={foreName} />
      </g>
    );
  }

  /** One leg: a column, a paw wider than it, and a pad under that. */
  const leg = (x: number) => (
    <>
      {px(x, top, width, height, fur)}
      {px(x - 0.5, top + height - 2.5, width + 1, 2.5, fur)}
      {px(x + 0.5, top + height - 1.25, width - 1, 1.25, pad)}
    </>
  );

  return (
    <g {...(side === 'near' ? { 'data-part': 'legs' } : {})}>
      {/* The foreleg carries the arm class, so a pose that swings an arm swings a front leg. */}
      <g data-part={foreName}>{leg(front)}</g>
      <g data-part={hindName}>{leg(back)}</g>
    </g>
  );
}

/** The tail, in its own group so the stylesheet can swing it. */
export function creatureTail(spec: CreatureSpec): ReactElement {
  const box = buildBox[spec.build];
  /* The rump, not the ribs: a tail rooted halfway along a flank reads as a tail worn on a belt. */
  const root = box.x + box.width - 2;
  const rootY = box.y + 1;
  return (
    <g data-part="tail">
      {spec.tail === 'long' && (
        <>
          {px(root, rootY + 2, 6, 3, PRIMARY)}
          {px(root + 5, rootY - 3, 3, 6, PRIMARY)}
          {px(root + 5, rootY - 5, 3, 2.5, WHITE)}
        </>
      )}
      {spec.tail === 'curl' && (
        <>
          {px(root, rootY + 1, 4, 3, PRIMARY)}
          {px(root + 3, rootY - 2, 3, 4, PRIMARY)}
          {px(root, rootY - 4, 4, 3, PRIMARY)}
        </>
      )}
      {spec.tail === 'tuft' && (
        <>
          {px(root, rootY + 2, 4, 3, PRIMARY)}
          <circle cx={root + 6} cy={rootY + 3} r="3.2" fill={SECONDARY} />
        </>
      )}
      {spec.tail === 'plume' && (
        <>
          {px(root, rootY, 4, 4, PRIMARY)}
          {px(root + 3, rootY - 5, 5, 9, SECONDARY)}
          {px(root + 4, rootY - 3, 3, 5, SECONDARY_SHADOW)}
        </>
      )}
      {spec.tail === 'stub' && <circle cx={root + 2} cy={rootY + 3} r="2.6" fill={WHITE} />}
      {spec.tail === 'spike' && (
        <>
          {px(root, rootY + 1, 7, 3, PRIMARY)}
          <polygon
            points={`${root + 6},${rootY - 1} ${root + 12},${rootY + 2.5} ${root + 6},${rootY + 6}`}
            fill={SECONDARY}
          />
        </>
      )}
    </g>
  );
}

/** Wings, for the one creature that has them. Rooted at the shoulder blades and drawn behind. */
/**
 * Wings, for the one creature that has them.
 *
 * Rooted on the shoulders of the barrel rather than floating beside the head — the first cut had
 * them level with the ears and a hand's width clear of the body, which reads as two leaves blowing
 * past. Each is a swept membrane with two finger bones in it, because a flat triangle is a fin.
 */
export function creatureWings(): ReactElement {
  return (
    <g data-part="wing">
      <polygon points="13,26 2,14 1,27 9,31" fill={SECONDARY} />
      <polygon points="35,26 46,14 47,27 39,31" fill={SECONDARY} />
      <polygon points="12,26 4,17 3,25" fill={MAGIC} opacity="0.5" />
      <polygon points="36,26 44,17 45,25" fill={MAGIC} opacity="0.5" />
      {px(4, 15, 1, 11, SECONDARY_SHADOW)}
      {px(43, 15, 1, 11, SECONDARY_SHADOW)}
    </g>
  );
}

/** The shadow on the floor, wider than a person's because four feet cover more ground. */
export function creatureShadow(spec: CreatureSpec): ReactElement {
  const box = buildBox[spec.build];
  return (
    <g data-part="shadow">
      {/* Under the feet and inside the frame: a shadow drawn past y 48 is a shadow that leaks into
          whatever is in the next row of a class list. */}
      <ellipse cx="24" cy={FLOOR + 0.5} rx={box.width / 2 + 2} ry="2" fill={OUTLINE} opacity="0.18" />
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The species
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Nine animals, and no two of them share a silhouette.
 *
 * Read the table as shapes rather than as names: round-triangle-short-slim is a different outline
 * from broad-round-flat-stocky before either of them is coloured in, which is the whole point — the
 * complaint was that a category read as one figure with the palette changed, and a palette cannot
 * fix that. Every row differs from every other in at least three of the six shape fields.
 */
export const creatureSpecs = {
  cat: {
    skull: 'round', ear: 'triangle', muzzle: 'short', build: 'slim', tail: 'long',
    belly: true, eye: MAGIC
  },
  dog: {
    skull: 'long', ear: 'floppy', muzzle: 'snout', build: 'stocky', tail: 'curl', belly: true
  },
  /* 'tall' is the bird's build and it drew the dragon as one: a penguin with wings on. A dragon is
     a long low lizard, so it takes the slim barrel and gets its height from the horns instead. */
  dragon: {
    skull: 'long', ear: 'horn', muzzle: 'long', build: 'slim', tail: 'spike',
    horns: 'dragon', wings: true, eye: MAGIC
  },
  pig: {
    skull: 'broad', ear: 'floppy', muzzle: 'flat', build: 'round', tail: 'curl'
  },
  cow: {
    skull: 'broad', ear: 'round', muzzle: 'snout', build: 'stocky', tail: 'tuft',
    spots: true, horns: 'cow', belly: true
  },
  lion: {
    skull: 'round', ear: 'round', muzzle: 'short', build: 'stocky', tail: 'tuft', mane: true
  },
  tiger: {
    skull: 'broad', ear: 'round', muzzle: 'short', build: 'slim', tail: 'long',
    stripes: true, belly: true, eye: ACCENT
  },
  bear: {
    skull: 'blocky', ear: 'round', muzzle: 'snout', build: 'round', tail: 'stub', tusks: true
  },
  penguin: {
    skull: 'round', ear: 'tiny', muzzle: 'beak', build: 'tall', tail: 'plume', belly: true
  }
} satisfies Record<string, CreatureSpec>;

export type CreatureId = keyof typeof creatureSpecs;

/**
 * Every slot a creature fills, ready for the compositor.
 *
 * The map is deliberately the same shape a costume returns: the creature is not a special case in
 * the pipeline, it is a body that happens to have four legs. Anything the wardrobe puts on a head, a
 * neck, a back or a paw is layered over this without either side knowing about the other.
 */
export function creatureSlots(id: CreatureId, rig?: DirectionRig) {
  const spec = creatureSpecs[id] as CreatureSpec;
  const turn = rig ?? directionRig('front');
  return {
    shadow: creatureShadow(spec),
    back_gear: (
      <g>
        {spec.wings ? creatureWings() : null}
        {creatureTail(spec)}
      </g>
    ),
    back_arm: creatureLegs(spec, 'far'),
    legs_feet: creatureLegs(spec, 'near'),
    torso_body: creatureBody(spec),
    head_neck: creatureHead(spec, turn),
    face: creatureFace(spec, turn)
  };
}

/**
 * The back of a creature, when something is worn on it.
 *
 * A cape and a tail are both back gear, and the wardrobe hands over one slot — so a chosen cape used
 * to take the tail off the animal wearing it. Both are drawn here instead: whatever was chosen goes
 * behind, the creature's own tail and wings in front of it, which is also the true order for a cape
 * over a tail.
 */
export function creatureBackSlot(id: CreatureId, worn?: ReactElement): ReactElement {
  const spec = creatureSpecs[id] as CreatureSpec;
  return (
    <g>
      {worn ?? null}
      {spec.wings ? creatureWings() : null}
      {creatureTail(spec)}
    </g>
  );
}

/**
 * Where a creature carries a thing.
 *
 * Held items are drawn for a hand at the end of a human arm, and an animal has neither — but it does
 * have a mouth, which is where a dog carries a stick and a cat carries whatever it has stolen. The
 * item is moved to the muzzle and tipped a little, so a staff reads as carried rather than as
 * floating beside a shoulder that is not there.
 */
export function creatureHeldSlot(worn: ReactElement): ReactElement {
  return <g data-part="held" transform="translate(7.5 -8) rotate(-12 24 22) scale(0.86)">{worn}</g>;
}

/**
 * Which creature a character is, if it is one at all.
 *
 * The wardrobe asks this before it tries to dress anybody, and the answer is a fact about the
 * character rather than about the saved race: a child who picked น้องแมว and left the race field
 * alone is still a cat, and a child who picked a person is not one however their race reads.
 */
export function creatureIdOfArchetype(archetype: string | null | undefined): CreatureId | null {
  if (!archetype || !archetype.endsWith('Beast')) return null;
  const species = archetype.slice(0, -'Beast'.length) as CreatureId;
  return species in creatureSpecs ? species : null;
}
