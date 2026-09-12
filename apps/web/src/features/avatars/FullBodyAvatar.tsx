import { cloneElement, type CSSProperties, type ReactElement } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { defaultTints, tintVariables, type AvatarTints } from './avatarSchema';
import { cropViewBox, detailForSize, type AvatarCropMode, type AvatarDetail } from './avatarGeometry';
import { directionRig, type AvatarDirection } from './avatarDirection';
import {
  bodySlotOrder, fullBodyArchetypes, overlayForPose,
  type BodySlot, type FullBodyArchetype
} from './avatarFullBody';
import { rigFor, rigVariables } from './avatarRig';
import styles from './FullBodyAvatar.module.css';

/**
 * The compositor for the full-body figure.
 *
 * Everything here is arrangement rather than art. It decides which nine slots are drawn, in which
 * order, and with which six colours; the drawings live in `avatarFullBody.tsx` and know nothing
 * about each other or about the poses.
 *
 * ── Order is not a preference ──
 * A wing goes behind a body, a hat in front of hair, a held staff in front of both, and the shadow
 * under everything. `bodySlotOrder` fixes that and nothing may pass its own place; a costume that
 * needs to cover another slot leaves that slot empty rather than drawing over it, because an
 * occluded drawing still costs a paint and forty of them on a leaderboard is where frames go.
 *
 * ── How a pose reaches a limb ──
 * The stylesheet addresses parts by class, so the compositor puts a class on the group each part
 * announces itself as through `data-part`. That indirection is deliberate: a drawing says what it
 * is, the stylesheet says how that thing moves, and adding an arm to a new costume needs no change
 * here or in the CSS.
 */

/**
 * How much of the figure is in frame.
 *
 * One drawing, two crops. 'full' is the whole 48-grid — the figure standing on its shadow, which is
 * what a customiser stage and a profile card have room for. 'bust' moves the viewBox in to the head
 * and shoulders, so a 36-pixel row in a class list shows a face rather than a two-pixel person.
 * Nothing is redrawn and nothing is a second sprite: below a certain size the legs are noise, so the
 * frame excludes them.
 */
/** The crop names, kept on this module because every caller already imports them from here. */
export type FullBodyFraming = AvatarCropMode;

/**
 * Which way the figure faces.
 *
 * Stated rather than derived, and never animated. A run cycle that flips its own subject reads as
 * the character turning round twice a second, which is the complaint; the mirror belongs to a state
 * somebody set, so it is a prop with one default and no keyframe anywhere may touch it.
 */
export type FullBodyFacing = 'default' | 'left' | 'right';

export interface FullBodyAvatarProps {
  archetype: FullBodyArchetype;
  /**
   * The figure as the child assembled it: one drawing per slot, overriding the costume's own.
   *
   * A costume is a starting point — a preset somebody picked off the grid — and this is what they
   * did to it afterwards. Passed slot by slot rather than as a whole figure so a choice in one
   * drawer cannot silently drop the rest: no hat means the costume's hat, not a bare head.
   */
  slots?: Partial<Record<BodySlot, ReactElement>>;
  framing?: FullBodyFraming;
  animation?: AvatarAnimation;
  tints?: Partial<AvatarTints> | undefined;
  size?: number;
  label?: string | undefined;
  backdrop?: string | undefined;
  /** Held on its first frame — for a picker grid, where forty looping figures is a fairground. */
  paused?: boolean;
  facing?: FullBodyFacing;
  /**
   * Which way the figure is turned.
   *
   * Six states, and every one of them is a re-composition rather than a mirror: the face moves the
   * width of the turn, the ears slide behind the skull, the near limb changes which side it is, and
   * the back view has no face at all. `front` is the default everywhere, and nothing animates it.
   */
  direction?: AvatarDirection;
  /**
   * Lets a pose's effect paint outside the frame.
   *
   * Off by default, and that default is the fix for the avatar escaping its container: an SVG with
   * `overflow: visible` paints everything authored outside its viewBox onto whatever is beside it,
   * so a raised arm landed in the next row of a class list. A stage that has room for a spell can
   * turn it back on for itself.
   */
  allowOverflowEffect?: boolean;
  /**
   * How much of the drawing is worth paying for at this size.
   *
   * Derived from `size` unless it is stated, and the derivation is the point: a leaderboard puts
   * forty avatars on a page at 32 pixels each, and at 32 pixels a trailing stardust effect is two
   * translucent squares nobody can see that still cost a compositing layer and an animation frame
   * apiece. `compact` drops the background particles, the auras and the drop-shadow filters, and
   * keeps every part of the figure a child would recognise.
   */
  detail?: AvatarDetail;
}

/** Poses this body is choreographed for. Anything else is drawn standing. */
const posed: AvatarAnimation[] = ['idle', 'walk', 'run', 'wave', 'cast', 'attack', 'jump', 'cheer'];

/**
 * Puts the stylesheet's class on the group that says it is that part.
 *
 * A CSS module hashes its class names, so a drawing cannot name one; and a drawing should not want
 * to, because `data-part="frontArm"` is a fact about anatomy while `.frontArm_a3f9` is a fact about
 * this build. The mapping happens once, here, at the boundary between the two.
 */
function withPartClasses(node: ReactElement, key?: string): ReactElement {
  const element = node as ReactElement<{
    'data-part'?: string; className?: string; children?: unknown; key?: string;
  }>;
  const part = element.props['data-part'];
  const partClass = part ? styles[part] : undefined;

  const children = element.props.children;
  const mapped = Array.isArray(children)
    ? children.map((child, index) => (
      isElement(child) ? withPartClasses(child, `${key ?? 'part'}-${index}`) : child))
    : isElement(children) ? withPartClasses(children) : children;

  return cloneElement(element, {
    ...(key === undefined ? {} : { key }),
    ...(partClass ? { className: [element.props.className, partClass].filter(Boolean).join(' ') } : {}),
    ...(children === undefined ? {} : { children: mapped })
  } as never);
}

function isElement(value: unknown): value is ReactElement {
  return typeof value === 'object' && value !== null && 'props' in value && 'type' in value;
}

/**
 * Which stance band a slot belongs to.
 *
 * The posture has to be *between* the costume and the pose: a scholar's forward neck is not part of
 * the drawing (a keyframe would overwrite it) and not part of the pose (every pose would have to
 * name every character). So each slot is wrapped in the group that carries its band's posture, and
 * the pose animates the part inside it.
 *
 * The head band is five slots rather than one because a head is five slots — skull, face, side hair,
 * fringe, hat — and a neck that carried only the skull forward would leave the face behind it.
 */
const stanceBand: Partial<Record<BodySlot, string>> = {
  torso_body: 'stanceTorso',
  back_arm: 'stanceArmFar',
  front_arm_weapon: 'stanceArmNear'
};

/**
 * Everything that is part of a head, and therefore everything that turns when one does.
 *
 * ── The bug this is the fix for ──
 * A pose that tilted the head addressed `.head`, which is the class on the group the *skull* draws
 * itself into. The hair, the fringe, the side wrap and the hat are separate slots — they have to be,
 * because half of them are painted before the face and half after — so a wave tilted a bare skull
 * three degrees and left the hair standing exactly where it was. At rest the two line up and
 * everything looks right; the moment anything moves, the hair stops fitting the head, which is
 * precisely the complaint.
 *
 * Six slots rather than five: `hair_back` is in here too. It hangs behind the torso, nowhere near
 * the others in the paint order, and it is still rooted in the same skull — a plait that keeps still
 * while the head it grows out of turns is the same fault seen from behind.
 *
 * ── Why a second wrapper ──
 * `stanceHead` already carries the character's own posture, and an animation on an element replaces
 * whatever transform that element had. So the posture stays on the outer group and the pose animates
 * an inner one; the two compose instead of the second silently dropping the first. Every slot gets
 * its own pair, and because they all run the same keyframes at the same duration with no delay they
 * stay in lockstep — a head is one thing however many layers it takes to draw.
 */
const headBand = new Set<BodySlot>([
  'hair_back', 'head_neck', 'face', 'hair_side', 'hair_headwear', 'headwear'
]);

export function FullBodyAvatar({
  archetype, slots, animation = 'idle', tints, size = 176, label, backdrop, paused,
  framing = 'full', facing = 'default', direction = 'front', allowOverflowEffect = false, detail
}: FullBodyAvatarProps) {
  const definition = fullBodyArchetypes[archetype] ?? fullBodyArchetypes.student;
  /*
   * The direction, resolved once and handed to whatever draws.
   *
   * It is a prop with a default and no keyframe touches it — that is the run cycle no longer
   * turning the character round twice a second. The costume is built *for* this direction rather
   * than mirrored into it: a head that has turned is a different arrangement of the same parts, not
   * the same arrangement flipped, and a flip would swap the parting in the hair and put the near
   * hand behind the chest.
   */
  const rig = directionRig(direction);
  const drawn: Partial<Record<BodySlot, ReactElement>> = { ...definition.slots(rig), ...(slots ?? {}) };
  const pose = posed.includes(animation) ? animation : 'idle';
  /*
   * The six colours and the eleven bones, on one element.
   *
   * Both are custom properties for the same reason: a CSS module hashes its class names and a
   * stylesheet cannot read a TypeScript record, so anything the rules need to know has to arrive as
   * a value they can resolve. The bones go on before the tints so a tint can never be shadowed by a
   * bone that happened to be spelled the same.
   */
  const style = {
    ...rigVariables(rigFor(archetype)),
    ...tintVariables({ ...defaultTints, ...(tints ?? {}) })
  } as CSSProperties;
  const level = detail ?? detailForSize(size);

  /*
   * The pose's own effect, drawn over whatever standing overlay the costume carries. A rune circle
   * belongs to casting rather than to being a mage, and speed lines behind somebody standing still
   * are a bug rather than a flourish.
   */
  const poseOverlay = overlayForPose(pose);

  return (
    <svg
      className={[
        styles.avatar,
        styles[pose],
        paused ? styles.paused : '',
        allowOverflowEffect ? styles.spill : '',
        level === 'compact' ? styles.compact : ''
      ].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={cropViewBox[framing]}
      data-facing={facing}
      data-direction={direction}
      data-detail={level}
      style={style}
      role="img"
      aria-label={label ? `อวตาร ${label}` : `อวตาร${definition.name}`}
    >
      <title>{label ?? definition.name}</title>
      {backdrop ? <rect x="0" y="0" width="48" height="48" rx="8" fill={backdrop} /> : null}
      {/*
        * The mirror, applied once and outside every keyframe.
        *
        * Around x 24, which is the figure's own centre line rather than the viewBox's — the crops
        * are off-centre and mirroring about the frame would walk the figure sideways as well as
        * turn it.
        */}
      <g transform={facing === 'left' ? 'translate(48,0) scale(-1,1)' : undefined}>
      {/*
        * The stance, outside the pose.
        *
        * A figure that hovers floats whatever it is doing, so the lift belongs to a group the poses
        * do not animate. Putting it on `.figure` itself would mean every keyframe that sets a
        * transform — which is all of them — silently dropping it, and a fairy would walk on the
        * floor for the length of a stride and then jump back into the air.
        */}
      <g className={styles.stance}>
      <g className={styles.figure}>
        {bodySlotOrder.map((slot: BodySlot) => {
          const drawing = drawn[slot];
          if (!drawing) return null;
          if (headBand.has(slot)) {
            return (
              <g key={slot} data-slot={slot} className={styles.stanceHead}>
                <g className={styles.headRig}>{withPartClasses(drawing)}</g>
              </g>
            );
          }
          const band = stanceBand[slot];
          return (
            <g key={slot} data-slot={slot} {...(band ? { className: styles[band] } : {})}>
              {withPartClasses(drawing)}
            </g>
          );
        })}
        {poseOverlay ? <g data-slot="pose_fx">{withPartClasses(poseOverlay)}</g> : null}
      </g>
      </g>
      </g>
    </svg>
  );
}
