import { cloneElement, type CSSProperties, type ReactElement } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { defaultTints, tintVariables, type AvatarTints } from './avatarSchema';
import {
  bodySlotOrder, fullBodyArchetypes, overlayForPose,
  type BodySlot, type FullBodyArchetype
} from './avatarFullBody';
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
export type FullBodyFraming = 'full' | 'bust';

/** The bust crop: head and upper torso, centred on the figure's own centre line. */
const framingViewBox: Record<FullBodyFraming, string> = {
  full: '0 0 48 48',
  bust: '9 1 30 30'
};

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

export function FullBodyAvatar({
  archetype, slots, animation = 'idle', tints, size = 176, label, backdrop, paused, framing = 'full'
}: FullBodyAvatarProps) {
  const definition = fullBodyArchetypes[archetype] ?? fullBodyArchetypes.student;
  const drawn: Partial<Record<BodySlot, ReactElement>> = { ...definition.slots, ...(slots ?? {}) };
  const pose = posed.includes(animation) ? animation : 'idle';
  const style = tintVariables({ ...defaultTints, ...(tints ?? {}) }) as CSSProperties;

  /*
   * The pose's own effect, drawn over whatever standing overlay the costume carries. A rune circle
   * belongs to casting rather than to being a mage, and speed lines behind somebody standing still
   * are a bug rather than a flourish.
   */
  const poseOverlay = overlayForPose(pose);

  return (
    <svg
      className={[styles.avatar, styles[pose], paused ? styles.paused : ''].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={framingViewBox[framing]}
      style={style}
      role="img"
      aria-label={label ? `อวตาร ${label}` : `อวตาร${definition.name}`}
    >
      <title>{label ?? definition.name}</title>
      {backdrop ? <rect x="0" y="0" width="48" height="48" rx="8" fill={backdrop} /> : null}
      <g className={styles.figure}>
        {bodySlotOrder.map((slot: BodySlot) => {
          const drawing = drawn[slot];
          if (!drawing) return null;
          return (
            <g key={slot} data-slot={slot}>
              {withPartClasses(drawing)}
            </g>
          );
        })}
        {poseOverlay ? <g data-slot="pose_fx">{withPartClasses(poseOverlay)}</g> : null}
      </g>
    </svg>
  );
}
