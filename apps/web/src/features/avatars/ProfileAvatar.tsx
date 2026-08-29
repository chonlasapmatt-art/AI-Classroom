import { useEffect, useState } from 'react';
import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { configForAvatarId, initialsFor } from './avatarCatalog';
import { ThemedAvatar } from './ThemedAvatar';

interface Props {
  displayName: string;
  avatarId?: string | null;
  /** Attachment id of an uploaded photo; it wins over the drawn avatar. */
  avatarPhotoId?: string | null;
  /** Legacy fields kept so records created before the catalogue still render. */
  avatarIndex?: number;
  avatarConfig?: AvatarConfig | null;
  size?: number;
  animation?: AvatarAnimation;
}

/**
 * One avatar for every person in the product.
 *
 * Order of preference: an uploaded photo, then the avatar the person chose, then whatever their
 * record already carried, then their initials. The photo is read through the repository, so it works
 * from the local database offline and downloads from shared storage when it came from another device.
 */
export function ProfileAvatar({ displayName, avatarId, avatarPhotoId, avatarIndex, avatarConfig, size = 44, animation = 'idle' }: Props) {
  const repository = useRepository();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarPhotoId) { setPhotoUrl(null); return; }
    let active = true;
    let url: string | null = null;
    void repository.openAttachment(avatarPhotoId)
      .then((blob) => {
        if (!active || !blob) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch(() => { if (active) setPhotoUrl(null); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [repository, avatarPhotoId]);

  if (photoUrl) {
    return (
      <img
        className="ui-avatar-photo"
        src={photoUrl}
        alt={displayName}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }

  const chosen = configForAvatarId(avatarId);
  const config = chosen ?? avatarConfig ?? null;

  if (!config && avatarIndex === undefined) {
    return (
      <span
        className="ui-avatar-initials"
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.36) }}
        aria-label={displayName}
        role="img"
      >
        {initialsFor(displayName)}
      </span>
    );
  }

  return (
    <ThemedAvatar
      avatarIndex={avatarIndex ?? 0}
      config={config}
      size={size}
      animation={animation}
      label={displayName}
    />
  );
}
