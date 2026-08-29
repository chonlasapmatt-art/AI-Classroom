import { useState } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { animationLabels, avatarAnimations, avatarThemes, AVATAR_VARIANT_COUNT, configFromIndex } from './avatarThemes';
import { ThemedAvatar } from './ThemedAvatar';

/** Development-only gallery: every shipped theme against every animation state. */
export function AvatarGalleryPage() {
  const [animation, setAnimation] = useState<AvatarAnimation>('idle');
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Preview / Development Only</span>
          <h1>Avatar Gallery</h1>
          <p>{avatarThemes.length} บุคลิก · รวมกันได้ {AVATAR_VARIANT_COUNT.toLocaleString('th-TH')} แบบ</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>สถานะแอนิเมชัน</h2>
          <div className="segmented">
            {avatarAnimations.map((state) => (
              <button key={state} className={state === animation ? 'active present' : ''} onClick={() => setAnimation(state)}>
                {animationLabels[state]}
              </button>
            ))}
          </div>
        </div>
        <div className="avatar-gallery">
          {avatarThemes.map((theme, index) => (
            <article key={theme.id} className="avatar-card">
              <ThemedAvatar avatarIndex={index} config={{ ...configFromIndex(index), archetype: index }} animation={animation} size={132} />
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>ทุกสถานะของธีมเดียว</h2></div>
        <div className="avatar-gallery">
          {avatarAnimations.map((state) => (
            <article key={state} className="avatar-card">
              <ThemedAvatar avatarIndex={0} animation={state} size={110} />
              <strong>{animationLabels[state]}</strong>
              <span>{state}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
