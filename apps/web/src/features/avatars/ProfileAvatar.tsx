import { useEffect, useState } from 'react';
import type { AvatarAnimation, AvatarConfig } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { configForAvatarId, initialsFor } from './avatarCatalog';
import { bodyArchetypeFor } from './avatarFullBody';
import { figureSlotsFor, hasFigureChoices } from './avatarFigureParts';
import { FullBodyAvatar } from './FullBodyAvatar';
import { AvatarFrame, AvatarInitials, AvatarPhoto, type AvatarFrameShape } from './AvatarFrame';
import { cropForSize } from './avatarGeometry';
import { isConfigV2, migrateConfig, type AvatarConfigV2 } from './avatarSchema';
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
  shape?: AvatarFrameShape;
  showBorder?: boolean;
  showShadow?: boolean;
}

/**
 * One avatar for every person in the product.
 *
 * Order of preference: an uploaded photo, then the avatar the person chose, then whatever their
 * record already carried, then their initials. The photo is read through the repository, so it works
 * from the local database offline and downloads from shared storage when it came from another device.
 *
 * ── What changed, and why the frame is not optional ──
 * Every one of those four used to be returned bare — an `<img>`, an `<svg>`, a `<span>` — each sized
 * by an inline style and clipped by nothing. Each screen then wrote its own rule to round the corner
 * and hold the shape, so the four cases looked different from each other on the same page and the
 * figure escaped whatever was around it whenever a pose moved. There is one frame now and every case
 * goes through it, which is also what makes "the avatar overflows in X" a fix in one file.
 */
export function ProfileAvatar({
  displayName, avatarId, avatarPhotoId, avatarIndex, avatarConfig, size = 44,
  animation = 'idle', shape = 'circle', showBorder = false, showShadow = false
}: Props) {
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

  /*
   * `ui-avatar` is the handle the screens keep.
   *
   * The module's own class is hashed per build, so a screen that wants to put a ring round the
   * avatar in its hero card cannot name it. This one is stable, and it is on the frame rather than
   * on the drawing — which is the difference between a border that survives the drawing changing
   * from a photograph to a figure and one that does not.
   */
  const frame = (children: React.ReactNode) => (
    <AvatarFrame
      size={size}
      shape={shape}
      background={photoUrl ? 'plain' : 'sunken'}
      showBorder={showBorder}
      showShadow={showShadow}
      className="ui-avatar"
    >
      {children}
    </AvatarFrame>
  );

  if (photoUrl) return frame(<AvatarPhoto src={photoUrl} alt={displayName} />);

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
   * What the child built, drawn whole, cropped to the room there is for it.
   *
   * A catalogue avatar is six integers with no race and no figure recorded, so it used to fall back
   * to the bust here — meaning a child who picked from the thousand saw a portrait on their profile
   * while a child who used the customiser saw a person. `migrateConfig` answers both questions from
   * the integers: it derives the race the theme was always drawing, and the six colours from the
   * palette, so a catalogue avatar arrives with a figure and its own colours rather than defaults.
   */
  const built = config ? (isConfigV2(config) ? (config as AvatarConfigV2) : migrateConfig(config)) : null;
  const body = bodyArchetypeFor(built);
  if (built && body) {
    return frame(
      <FullBodyAvatar
        archetype={body}
        {...(hasFigureChoices(built) ? { slots: figureSlotsFor(built) } : {})}
        framing={cropForSize(size)}
        animation={animation}
        tints={built.tints}
        size={size}
        label={displayName}
      />
    );
  }

  if (!config && avatarIndex === undefined) {
    return frame(<AvatarInitials initials={initialsFor(displayName)} size={size} />);
  }

  return frame(
    <ThemedAvatar
      avatarIndex={avatarIndex ?? 0}
      config={config}
      size={size}
      animation={animation}
      label={displayName}
    />
  );
}
