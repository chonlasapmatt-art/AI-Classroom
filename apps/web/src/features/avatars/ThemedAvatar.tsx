import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { resolveAvatar, type AvatarAccessory, type AvatarAnimal, type AvatarProp, type AvatarTheme, type HairStyle } from './avatarThemes';
import styles from './ThemedAvatar.module.css';

interface Props {
  avatarIndex: number;
  config?: AvatarConfig | null;
  animation?: AvatarAnimation;
  size?: number;
  label?: string;
}

function Hair({ hair, skinTone }: { hair: HairStyle; skinTone: string }) {
  switch (hair.shape) {
    case 'bob':
      return (
        <g>
          <rect x="6" y="4.4" width="12" height="4" fill={hair.color} />
          <rect x="5.6" y="6" width="2" height="7" fill={hair.color} />
          <rect x="16.4" y="6" width="2" height="7" fill={hair.color} />
        </g>
      );
    case 'long':
      return (
        <g>
          <rect x="6" y="4.2" width="12" height="4" fill={hair.color} />
          <rect x="5.4" y="6" width="2" height="12" fill={hair.color} />
          <rect x="16.6" y="6" width="2" height="12" fill={hair.color} />
        </g>
      );
    case 'bun':
      return (
        <g>
          <rect x="10.4" y="1.6" width="3.2" height="3" fill={hair.color} />
          <rect x="6.2" y="4.4" width="11.6" height="3.4" fill={hair.color} />
          <rect x="6.2" y="7" width="1.6" height="3" fill={hair.color} />
          <rect x="16.2" y="7" width="1.6" height="3" fill={hair.color} />
        </g>
      );
    case 'curly':
      return (
        <g>
          <rect x="5.6" y="3.4" width="3" height="3" fill={hair.color} />
          <rect x="9" y="2.8" width="3" height="3" fill={hair.color} />
          <rect x="12.4" y="2.8" width="3" height="3" fill={hair.color} />
          <rect x="15.4" y="3.4" width="3" height="3" fill={hair.color} />
          <rect x="6" y="5.4" width="12" height="2.6" fill={hair.color} />
        </g>
      );
    case 'cap':
      return (
        <g>
          <rect x="6" y="3.6" width="12" height="3.4" fill={hair.color} />
          <rect x="4.4" y="6.4" width="15" height="1.4" fill={hair.color} />
          <rect x="7.4" y="7.8" width="9" height="1" fill={skinTone} />
        </g>
      );
    case 'short':
    default:
      return (
        <g>
          <rect x="6.4" y="4.6" width="11.2" height="3.4" fill={hair.color} />
          <rect x="6.4" y="7" width="1.6" height="3" fill={hair.color} />
          <rect x="16" y="7" width="1.6" height="3" fill={hair.color} />
        </g>
      );
  }
}

function Accessory({ accessory, theme, accent }: { accessory: AvatarAccessory; theme: AvatarTheme; accent: string }) {
  switch (accessory.kind) {
    case 'glasses':
      return (
        <g fill="none" stroke={theme.primary} strokeWidth="0.55">
          <rect x="8.6" y="9.4" width="3" height="2.6" />
          <rect x="12.4" y="9.4" width="3" height="2.6" />
          <path d="M11.6 10.7h0.8" />
        </g>
      );
    case 'roundGlasses':
      return (
        <g fill="none" stroke={theme.primary} strokeWidth="0.55">
          <circle cx="10.1" cy="10.7" r="1.5" />
          <circle cx="13.9" cy="10.7" r="1.5" />
          <path d="M11.6 10.7h0.8" />
        </g>
      );
    case 'headband':
      return <rect x="6.4" y="7.6" width="11.2" height="1.1" fill={accent} />;
    case 'scarf':
      return (
        <g>
          <rect x="8" y="15.6" width="8" height="1.8" fill={accent} />
          <rect x="9.4" y="17" width="2" height="3" fill={accent} />
        </g>
      );
    case 'earbuds':
      return (
        <g fill={theme.primary}>
          <rect x="6.2" y="9.6" width="1.2" height="2.4" rx="0.4" />
          <rect x="16.6" y="9.6" width="1.2" height="2.4" rx="0.4" />
          <rect x="6.2" y="7.4" width="11.6" height="0.9" rx="0.4" />
        </g>
      );
    case 'flower':
      return (
        <g fill={accent}>
          <rect x="16.2" y="5" width="1.2" height="1.2" />
          <rect x="17.4" y="6.2" width="1.2" height="1.2" />
          <rect x="16.2" y="7.4" width="1.2" height="1.2" />
          <rect x="15" y="6.2" width="1.2" height="1.2" />
        </g>
      );
    case 'mask':
      return (
        <g>
          <rect x="8.4" y="12" width="7.2" height="3.4" fill="#f8fafc" />
          <rect x="8.4" y="12" width="7.2" height="0.8" fill="#cbd5f5" />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

function AnimalFigure({ animal, shirt, accent, skinTone, theme, accessory }: {
  animal: AvatarAnimal; shirt: string; accent: string; skinTone: string; theme: AvatarTheme; accessory: AvatarAccessory;
}) {
  const face = animal === 'panda' ? '#f8fafc' : theme.primary;
  const ear = animal === 'penguin' ? '#1e293b' : theme.primary;
  return (
    <>
      <rect x="6" y="17" width="12" height="6" fill={shirt} />
      <rect x="4.4" y="16.2" width="2" height="4.2" fill={shirt} />
      <rect x="17.6" y="16.2" width="2" height="4.2" fill={shirt} />
      {animal === 'bunny' ? <>
        <rect x="7.2" y="1.8" width="3" height="6" fill={ear} />
        <rect x="13.8" y="1.8" width="3" height="6" fill={ear} />
        <rect x="8" y="3" width="1.2" height="3.5" fill={accent} />
        <rect x="14.8" y="3" width="1.2" height="3.5" fill={accent} />
      </> : <>
        <polygon points="6,7 7,3.5 10,6" fill={ear} />
        <polygon points="14,6 17,3.5 18,7" fill={ear} />
      </>}
      <rect x="6" y="6" width="12" height="10" rx="2" fill={face} />
      {animal === 'panda' && <><rect x="7.2" y="8.2" width="3.2" height="3" rx="1" fill="#1e293b" /><rect x="13.6" y="8.2" width="3.2" height="3" rx="1" fill="#1e293b" /></>}
      {animal === 'penguin' && <polygon points="12,8 16,14 8,14" fill={skinTone} />}
      <rect x="9" y="10" width="1.4" height="1.5" fill="#172033" />
      <rect x="13.6" y="10" width="1.4" height="1.5" fill="#172033" />
      <rect x="11.2" y="12.6" width="1.6" height="1.1" fill={accent} />
      <Accessory accessory={accessory} theme={theme} accent={accent} />
    </>
  );
}

function Prop({ prop, primary, accent }: { prop: AvatarProp; primary: string; accent: string }) {
  switch (prop) {
    case 'flask':
      return (
        <g>
          <rect x="16" y="13" width="4" height="1.6" fill="#ffffff" />
          <rect x="16.5" y="14.6" width="3" height="5" fill={accent} />
          <rect x="16.5" y="17.6" width="3" height="2" fill={primary} />
        </g>
      );
    case 'laptop':
      return (
        <g>
          <rect x="15" y="14" width="6" height="4" fill="#ffffff" />
          <rect x="15.6" y="14.6" width="4.8" height="2.8" fill={primary} />
          <rect x="14" y="18" width="8" height="1.4" fill={accent} />
        </g>
      );
    case 'book':
      return (
        <g>
          <rect x="14" y="15" width="8" height="5" fill={primary} />
          <rect x="15" y="16" width="3" height="3" fill="#ffffff" />
          <rect x="18.4" y="16" width="3" height="3" fill="#fff7e8" />
        </g>
      );
    case 'ball':
      return (
        <g>
          <rect x="16" y="15" width="5" height="5" fill="#ffffff" />
          <rect x="17" y="14" width="3" height="7" fill="#ffffff" />
          <rect x="18" y="16" width="1" height="3" fill={primary} />
        </g>
      );
    case 'palette':
      return (
        <g>
          <rect x="15" y="15" width="6" height="5" fill="#ffffff" />
          <rect x="16" y="16" width="1.4" height="1.4" fill="#ef4444" />
          <rect x="18" y="16" width="1.4" height="1.4" fill="#3b82f6" />
          <rect x="16" y="18" width="1.4" height="1.4" fill="#facc15" />
          <rect x="18" y="18" width="1.4" height="1.4" fill={primary} />
        </g>
      );
    case 'note':
      return (
        <g fill={primary}>
          <rect x="17.4" y="13.4" width="1.2" height="5.2" />
          <rect x="18.6" y="13.4" width="2.6" height="1.2" />
          <rect x="15.8" y="17.6" width="2.8" height="2.2" rx="1" />
        </g>
      );
    case 'compass':
    default:
      return (
        <g>
          <rect x="15.6" y="14.6" width="5.4" height="5.4" fill="#ffffff" />
          <rect x="17.2" y="16" width="2.2" height="2.6" fill={primary} />
          <rect x="18" y="15.2" width="0.9" height="4.2" fill={accent} />
        </g>
      );
  }
}

/**
 * Pixel-inspired classroom avatar. Everything is inline SVG plus CSS so a whole roster renders
 * cheaply, and the stylesheet honours prefers-reduced-motion.
 */
export function ThemedAvatar({ avatarIndex, config, animation = 'idle', size = 96, label }: Props) {
  const identity = resolveAvatar(avatarIndex, config);
  const { theme, palette, skinTone, hair, accessory, badge } = identity;
  const shirt = palette.primary;
  const accent = palette.accent;
  const title = label ?? `${theme.name} · ${hair.name}`;

  return (
    <svg
      className={`${styles.avatar} ${styles[animation] ?? styles.idle}`}
      width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`อวตาร ${title}`}
    >
      <title>{title}</title>
      <rect x="0" y="0" width="24" height="24" rx="6" fill={theme.soft} />
      <g className={styles.sparkle}>
        <rect x="4" y="3" width="1.4" height="1.4" fill={theme.accent} />
        <rect x="18.6" y="4" width="1.4" height="1.4" fill={theme.accent} />
      </g>
      <g className={styles.figure}>
        {theme.kind === 'animal' ? <AnimalFigure
          animal={theme.animal ?? 'cat'} shirt={shirt} accent={accent} skinTone={skinTone} theme={theme} accessory={accessory}
        /> : <>
          <rect x="6" y="17" width="12" height="6" fill={shirt} />
          <rect x="10.5" y="17" width="3" height="2.4" fill={accent} />
          <g className={styles.arm}>
            <rect x="4.4" y="16.4" width="1.8" height="5" fill={shirt} />
            <rect x="4.2" y="15" width="2.2" height="2" fill={skinTone} />
          </g>
          <rect x="7" y="6" width="10" height="10" fill={skinTone} />
          <Hair hair={hair} skinTone={skinTone} />
          <g className={styles.eyes}>
            <rect x="9.4" y="10" width="1.4" height="1.6" fill="#241f33" />
            <rect x="13.2" y="10" width="1.4" height="1.6" fill="#241f33" />
          </g>
          <rect x="11" y="13" width="2" height="1" fill="#a8555f" />
          <rect x="8.6" y="12" width="1.4" height="1" fill={theme.accent} opacity="0.5" />
          <rect x="14" y="12" width="1.4" height="1" fill={theme.accent} opacity="0.5" />
          <Accessory accessory={accessory} theme={theme} accent={accent} />
        </>}
        {badge.glyph && (
          <text x="7.6" y="21.4" fontSize="2.6" fill={badge.color} aria-hidden="true">{badge.glyph}</text>
        )}
      </g>
      <g className={styles.prop}><Prop prop={theme.prop} primary={theme.primary} accent={theme.accent} /></g>
    </svg>
  );
}
