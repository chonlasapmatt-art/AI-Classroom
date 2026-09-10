import { useEffect, useState } from 'react';
import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { configForAvatarId, initialsFor } from './avatarCatalog';
import { bodyArchetypeFor } from './avatarFullBody';
import { figureSlotsFor, hasFigureChoices } from './avatarFigureParts';
import { FullBodyAvatar, type FullBodyFraming } from './FullBodyAvatar';
import { isConfigV2, migrateConfig, type AvatarConfigV2 } from './avatarSchema';
import { ThemedAvatar } from './ThemedAvatar';

/*
 * Below this there is no room for legs.
 *
 * There is one avatar now — the figure the child built, which is also what the customiser previews
 * and what the picker grid shows — and the only thing that changes with size is how much of it is
 * in frame. A profile card gets the whole person standing on their shadow; a 36-pixel row in a
 * class list gets the head and shoulders of the same drawing, because at that size legs are two
 * dark pixels and the face is what anybody is actually looking for.
 *
 * The bust sprite is no longer the source of anything: it renders only for a record that has no
 * avatar at all, which is a record with nothing to draw.
 */
const FIGURE_MIN_SIZE = 96;

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

  /*
   * The clothes follow the person, not the drawing they picked.
   *
   * An avatar chosen from the catalogue brings its whole look with it, which would throw away the
   * outfit the student chose the moment they changed avatar. The outfit is the one part of a saved
   * configuration that outlives that choice, so it is laid over the catalogue's own.
   */
  const chosen = configForAvatarId(avatarId);
  const base = chosen ?? avatarConfig ?? null;
  const config = base && avatarConfig?.outfit ? { ...base, outfit: avatarConfig.outfit } : base;

  /*
   * What the child built, drawn whole, wherever there is room for it.
   *
   * A catalogue avatar is six integers with no race and no figure recorded, so it used to fall back
   * to the bust here — meaning a child who picked from the thousand saw a portrait on their profile
   * while a child who used the customiser saw a person. `migrateConfig` answers both questions from
   * the integers: it derives the race the theme was always drawing, and the six colours from the
   * palette, so a catalogue avatar arrives with a figure and its own colours rather than defaults.
   */
  const built = config ? (isConfigV2(config) ? (config as AvatarConfigV2) : migrateConfig(config)) : null;
  const body = bodyArchetypeFor(built);
  const framing: FullBodyFraming = size >= FIGURE_MIN_SIZE ? 'full' : 'bust';
  if (built && body) {
    return (
      <FullBodyAvatar
        archetype={body}
        {...(hasFigureChoices(built) ? { slots: figureSlotsFor(built) } : {})}
        framing={framing}
        animation={animation}
        tints={built.tints}
        size={size}
        label={displayName}
      />
    );
  }

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
