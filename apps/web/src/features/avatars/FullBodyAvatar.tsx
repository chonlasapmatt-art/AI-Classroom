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

export interface FullBodyAvatarProps {
  archetype: FullBodyArchetype;
  animation?: AvatarAnimation;
  tints?: Partial<AvatarTints> | undefined;
  size?: number;
  label?: string | undefined;
  backdrop?: string | undefined;
  /** Held on its first frame — for a picker grid, where forty looping figures is a fairground. */
  paused?: boolean;
}

/** Poses this body is choreographed for. Anything else is drawn standing. */
const posed: AvatarAnimation[] = ['idle', 'walk', 'run', 'cast', 'attack', 'jump', 'cheer'];

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
  archetype, animation = 'idle', tints, size = 176, label, backdrop, paused
}: FullBodyAvatarProps) {
  const definition = fullBodyArchetypes[archetype] ?? fullBodyArchetypes.student;
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
      viewBox="0 0 48 48"
      style={style}
      role="img"
      aria-label={label ? `อวตาร ${label}` : `อวตาร${definition.name}`}
    >
      <title>{label ?? definition.name}</title>
      {backdrop ? <rect x="0" y="0" width="48" height="48" rx="8" fill={backdrop} /> : null}
      <g className={styles.figure}>
        {bodySlotOrder.map((slot: BodySlot) => {
          const drawing = definition.slots[slot];
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
