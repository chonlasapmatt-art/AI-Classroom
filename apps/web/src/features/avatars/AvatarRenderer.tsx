import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { ThemedAvatar } from './ThemedAvatar';

interface Props { avatarIndex: number; config?: AvatarConfig | null; animation?: AvatarAnimation; size?: number; label?: string }

/**
 * Shared entry point used by student profiles, rosters, attendance and the leaderboard so one
 * student keeps one identity everywhere. A saved `avatarConfig` always wins over the deterministic
 * look derived from `avatarIndex`.
 */
export function AvatarRenderer({ avatarIndex, config, animation = 'idle', size = 96, label }: Props) {
  return (
    <ThemedAvatar
      avatarIndex={avatarIndex}
      config={config ?? null}
      animation={animation}
      size={size}
      {...(label ? { label } : {})}
    />
  );
}
