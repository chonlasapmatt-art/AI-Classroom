import { useEffect, useState, type CSSProperties } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import {
  defaultTints, tintVariables,
  type AvatarConfigV2, type AvatarTints
} from './avatarSchema';
import { onBlink } from './avatarBlink';
import { resolveLayers, traitById } from './avatarTraits';
import styles from './ThemedAvatar.module.css';

/**
 * The compositor: a stack of independent drawings, back to front, on one grid.
 *
 * Everything here is arrangement rather than art. It decides what is drawn, in what order, and with
 * which six colours; the drawings themselves live in `avatarTraits.tsx` and know nothing about each
 * other. That separation is the point of the rewrite — a new pair of wings is a row in a table, not
 * a change to a component that also draws faces.
 *
 * ── Order is not a preference ──
 * Wings go behind a body, a hat goes in front of hair, a held staff goes in front of both. The order
 * is fixed in `layerOrder` and nothing may pass its own; a trait that needs to cover another says so
 * with `hides`, which suppresses that layer entirely rather than drawing over it — an occluded
 * drawing still costs a paint, and forty of them on a leaderboard is where the frames go.
 *
 * ── Colour ──
 * No sprite names a colour. Every rectangle reads `var(--av-…)`, and this sets those properties on
 * the <svg> from the config's six tints, deriving each one's shadow, highlight and outline. Changing
 * a shirt from green to red is six string assignments and no redraw at all.
 */
export interface EnhancedPixelAvatarProps {
  config: AvatarConfigV2;
  animation?: AvatarAnimation;
  size?: number;
  /** 24 for the app, 32 for the large customiser preview where there is room for more detail. */
  grid?: 24 | 32;
  label?: string | undefined;
  backdrop?: string | undefined;
}

export function EnhancedPixelAvatar({
  config, animation = 'idle', size = 96, grid = 24, label, backdrop
}: EnhancedPixelAvatarProps) {
  const tints: Partial<AvatarTints> = { ...defaultTints, ...(config.tints ?? {}) };
  const layers = resolveLayers(config);
  const style = tintVariables(tints) as CSSProperties;

  /*
   * The blink comes from the shared schedule rather than from a keyframe on this element, so a
   * leaderboard of forty avatars costs one timer instead of forty. `idle` is the only pose that
   * blinks: an avatar mid-cast has something else to be doing, and an avatar the customiser is
   * showing as `blink` is being demonstrated rather than living.
   */
  const [closed, setClosed] = useState(false);
  const blinks = animation === 'idle';
  useEffect(() => {
    if (!blinks) { setClosed(false); return; }
    return onBlink(setClosed);
  }, [blinks]);

  /*
   * A 32-unit grid is the same drawing with more room around it, not a second set of sprites.
   * The traits are authored on 24 and the viewBox is widened symmetrically, so a trait drawn once
   * is correct at both sizes and nothing has to be maintained twice.
   */
  const pad = grid === 32 ? 4 : 0;
  const viewBox = `${-pad} ${-pad} ${24 + pad * 2} ${24 + pad * 2}`;

  return (
    <svg
      className={[
        styles.avatar,
        styles[animation] ?? styles.idle,
        closed ? styles.blinking : '',
        config.race ? styles[config.race] ?? '' : ''
      ].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={viewBox}
      style={style}
      role="img"
      aria-label={label ? `อวตาร ${label}` : 'อวตาร'}
    >
      {label && <title>{label}</title>}
      {backdrop && <rect x={-pad} y={-pad} width={24 + pad * 2} height={24 + pad * 2} rx="6" fill={backdrop} />}
      <g className={styles.figure}>
        {layers.map(([layer, id]) => {
          const trait = traitById(id)!;
          return <g key={layer} data-layer={layer} data-trait={id}>{trait.draw()}</g>;
        })}
      </g>
    </svg>
  );
}
