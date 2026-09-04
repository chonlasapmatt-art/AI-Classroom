import { useState } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { animationLabels, avatarAnimations, avatarThemes, AVATAR_VARIANT_COUNT, configFromIndex } from './avatarThemes';
import { ThemedAvatar } from './ThemedAvatar';
import { Badge, Card, CardHeader, PageHeader, Segmented } from '../../ui/components';

/** Development-only gallery: every shipped theme against every animation state. */
export function AvatarGalleryPage() {
  const [animation, setAnimation] = useState<AvatarAnimation>('idle');
  return (
    <>
      <PageHeader
        eyebrow="สำหรับนักพัฒนาเท่านั้น"
        title="คลังตัวละคร"
        description={`${avatarThemes.length} บุคลิก · รวมกันได้ ${AVATAR_VARIANT_COUNT.toLocaleString('th-TH')} แบบ`}
        action={<Badge tone="warning">DEVELOPMENT ONLY</Badge>}
      />

      <Card>
        <CardHeader
          title="สถานะแอนิเมชัน"
          description="เลือกสถานะแล้วดูว่าทุกบุคลิกแสดงผลอย่างไรในสถานะเดียวกัน"
          action={(
            // Was three hand-built buttons whose selected state reused the attendance "present"
            // green, so the chosen state looked like a student had been marked in.
            <Segmented
              ariaLabel="สถานะแอนิเมชันของตัวละคร"
              value={animation}
              onChange={setAnimation}
              options={avatarAnimations.map((state) => ({ value: state, label: animationLabels[state] }))}
            />
          )}
        />
        <div className="avatar-gallery">
          {avatarThemes.map((theme, index) => (
            <article key={theme.id} className="avatar-card">
              <ThemedAvatar avatarIndex={index} config={{ ...configFromIndex(index), archetype: index }} animation={animation} size={132} />
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="ทุกสถานะของธีมเดียว" description="บุคลิกแรก แสดงครบทุกสถานะพร้อมกัน" />
        <div className="avatar-gallery">
          {avatarAnimations.map((state) => (
            <article key={state} className="avatar-card">
              <ThemedAvatar avatarIndex={0} animation={state} size={110} />
              <strong>{animationLabels[state]}</strong>
              <span>{state}</span>
            </article>
          ))}
        </div>
      </Card>
    </>
  );
}
