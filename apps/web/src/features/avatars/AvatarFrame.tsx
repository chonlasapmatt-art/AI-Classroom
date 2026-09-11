import type { CSSProperties, ReactNode } from 'react';
import styles from './AvatarFrame.module.css';

/**
 * One frame for every avatar in the product.
 *
 * ── Why this exists ──
 * An avatar appeared in fourteen places and was framed in fourteen ways: a hero card put a
 * four-pixel white border on `> svg`, a student page put a different one on `> svg`, a class list
 * put none, and a leaderboard let the drawing size itself. So "the avatar is out of its frame" was
 * never one bug — it was the absence of a frame, reported once per screen. Every one of those
 * sibling selectors is a place where adding an element between the container and the drawing
 * silently removes the border, and where nothing clips a pose that translates.
 *
 * This is the container those rules were describing. It clips, it rounds, it decides how much of
 * the figure is in shot, and it is the only thing in the product that does any of the three.
 */

export type AvatarFrameShape = 'circle' | 'rounded' | 'square' | 'card';
export type AvatarFrameBackground = 'plain' | 'sunken' | 'surface' | 'brand';

export interface AvatarFrameProps {
  size: number;
  shape?: AvatarFrameShape;
  background?: AvatarFrameBackground;
  showBorder?: boolean;
  showShadow?: boolean;
  /** Drawn over the frame's corner, outside the clip: it describes the person, not the picture. */
  statusBadge?: ReactNode;
  /** Lets the drawing paint past the frame. For a stage with room, never for a row in a list. */
  allowOverflowEffect?: boolean;
  className?: string;
  /** Forwarded to the wrapper, for a caller that needs to hang a tooltip or a test id on it. */
  title?: string;
  children: ReactNode;
}

export function AvatarFrame({
  size, shape = 'circle', background = 'sunken', showBorder = false, showShadow = false,
  statusBadge, allowOverflowEffect = false, className, title, children
}: AvatarFrameProps) {
  const box: CSSProperties = { width: size, height: size };

  const frame = (
    <span
      className={[
        styles.frame,
        styles[shape],
        styles[background],
        showBorder ? styles.bordered : '',
        showShadow ? styles.elevated : '',
        allowOverflowEffect ? styles.spill : '',
        className ?? ''
      ].filter(Boolean).join(' ')}
      style={box}
      title={title}
    >
      <span className={styles.figure}>{children}</span>
    </span>
  );

  if (!statusBadge) return frame;

  /*
   * The badge sits outside the clip, so it is a sibling of the frame rather than a child.
   *
   * Putting it inside was the first arrangement and it half worked: a badge on the corner of a
   * circular frame is cut into a crescent by the frame's own border radius, which reads as a
   * rendering fault rather than as a design.
   */
  return (
    <span className={styles.badged} style={box}>
      {frame}
      <span className={styles.badge} data-avatar-badge="">{statusBadge}</span>
    </span>
  );
}

/** The initials fallback, framed the same way as everything else. */
export function AvatarInitials({ initials, size }: { initials: string; size: number }) {
  return (
    <span className={styles.initials} style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}>
      {initials}
    </span>
  );
}

/** An uploaded photograph, cropped to where a face actually is in one. */
export function AvatarPhoto({ src, alt }: { src: string; alt: string }) {
  return <img className={styles.photo} src={src} alt={alt} />;
}
