import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { avatarArchetypes, avatarIdentity, avatarPalettes } from './avatarCatalog';
import styles from './AvatarRenderer.module.css';

interface Props { avatarIndex: number; config?: AvatarConfig | null; animation?: AvatarAnimation; size?: number; label?: string; }

export function AvatarRenderer({ avatarIndex, config, animation = 'idle', size = 112, label }: Props) {
  const identity = avatarIdentity(avatarIndex);
  const archetype = config?.archetype ?? identity.archetype;
  const paletteIndex = config?.palette ?? identity.palette;
  const palette = avatarPalettes[Math.abs(paletteIndex) % avatarPalettes.length]!;
  const title = label ?? avatarArchetypes[Math.abs(archetype) % avatarArchetypes.length]!;
  const accessory = Math.abs(config?.accessory ?? archetype) % 4;
  return (
    <svg className={`${styles.avatar} ${styles[animation]}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`อวตาร ${title}`}>
      <title>{title}</title>
      <circle cx="60" cy="60" r="56" fill={palette[1]} opacity=".22" />
      <g className={styles.body}>
        <path d="M35 108V83c0-12 10-21 22-21h6c12 0 22 9 22 21v25" fill={palette[0]} />
        <path d="M45 68c4 8 26 8 30 0l-4 22H49l-4-22Z" fill="#fff" opacity=".9" />
        <circle cx="60" cy="47" r="24" fill="#eabf9f" />
        <path d="M38 44c1-23 13-29 25-27 14 1 22 10 22 29-8-11-27-15-47-2Z" fill="#302b45" />
        <g className={styles.eyes}><circle cx="51" cy="48" r="2.2" fill="#27233a" /><circle cx="69" cy="48" r="2.2" fill="#27233a" /></g>
        <path d="M54 57c4 3 8 3 12 0" stroke="#a85454" strokeWidth="2" fill="none" strokeLinecap="round" />
        {accessory === 0 && <path d="M84 58l12-8v28H84Z" fill={palette[0]} />}
        {accessory === 1 && <g fill="none" stroke={palette[0]} strokeWidth="3"><rect x="42" y="43" width="14" height="10" rx="4"/><rect x="64" y="43" width="14" height="10" rx="4"/><path d="M56 48h8"/></g>}
        {accessory === 2 && <path d="M84 68h17v27H84z" fill="#fff" stroke={palette[0]} strokeWidth="3"/>}
        {accessory === 3 && <path d="M91 62l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#fbbf24"/>}
      </g>
    </svg>
  );
}
