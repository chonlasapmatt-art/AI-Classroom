import { useState } from 'react';
import type { AvatarConfig } from '../../domain/types';
import {
  AVATAR_VARIANT_COUNT, avatarAccessories, avatarBadges, avatarPalettes, avatarThemes, configFromIndex,
  hairStyles, resolveAvatar, skinTones
} from './avatarThemes';
import { ThemedAvatar } from './ThemedAvatar';
import { Button, Modal } from '../../ui/components';

interface Props {
  avatarIndex: number;
  config: AvatarConfig | null;
  studentName: string;
  onSave(config: AvatarConfig): void;
  onClose(): void;
}

type Part = keyof AvatarConfig;

function randomConfig(): AvatarConfig {
  const roll = (size: number) => Math.floor(Math.random() * size);
  return {
    archetype: roll(avatarThemes.length), palette: roll(avatarPalettes.length), skinTone: roll(skinTones.length),
    hair: roll(hairStyles.length), accessory: roll(avatarAccessories.length), badge: roll(avatarBadges.length)
  };
}

/** Lets a student (or their teacher) compose an avatar from every available part. */
export function AvatarStudio({ avatarIndex, config, studentName, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(config ?? configFromIndex(avatarIndex));
  const identity = resolveAvatar(avatarIndex, draft);
  const set = (part: Part, value: number) => setDraft((current) => ({ ...current, [part]: value }));

  return (
    <Modal
      wide
      title={`ปรับแต่งอวตารของ ${studentName}`}
      description="เลือกส่วนประกอบทีละอย่าง ตัวอย่างด้านซ้ายอัปเดตทันที"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>บันทึกอวตาร</Button>
        </>
      }
    >
      <div className="avatar-studio">
        <div className="studio-layout">
          <aside className="studio-preview">
            <ThemedAvatar avatarIndex={avatarIndex} config={draft} animation="wave" size={180} />
            <strong>{identity.theme.name}</strong>
            <span>{identity.theme.description}</span>
            <span className="variant-count">เลือกได้ {AVATAR_VARIANT_COUNT.toLocaleString('th-TH')} แบบ</span>
            <div className="studio-preview-actions">
              <Button variant="secondary" onClick={() => setDraft(randomConfig())}>สุ่มแบบใหม่</Button>
              <button className="text-button" onClick={() => setDraft(configFromIndex(avatarIndex))}>คืนค่าเริ่มต้น</button>
            </div>
          </aside>

          <div className="studio-parts">
            <fieldset>
              <legend>บุคลิก</legend>
              <div className="chip-grid">
                {avatarThemes.map((theme, index) => (
                  <button
                    key={theme.id}
                    className={`part-chip ${draft.archetype === index ? 'selected' : ''}`}
                    onClick={() => set('archetype', index)}
                  >
                    <ThemedAvatar avatarIndex={0} config={{ ...draft, archetype: index }} size={44} animation="idle" />
                    {theme.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>สีชุด</legend>
              <div className="swatch-row">
                {avatarPalettes.map((palette, index) => (
                  <button
                    key={palette.primary}
                    className={`swatch ${draft.palette === index ? 'selected' : ''}`}
                    style={{ background: palette.primary }}
                    onClick={() => set('palette', index)}
                    aria-label={`สีชุดแบบที่ ${index + 1}`}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>สีผิว</legend>
              <div className="swatch-row">
                {skinTones.map((tone, index) => (
                  <button
                    key={tone}
                    className={`swatch ${draft.skinTone === index ? 'selected' : ''}`}
                    style={{ background: tone }}
                    onClick={() => set('skinTone', index)}
                    aria-label={`สีผิวแบบที่ ${index + 1}`}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>ทรงผม</legend>
              <div className="chip-grid">
                {hairStyles.map((hair, index) => (
                  <button key={hair.id} className={`part-chip ${draft.hair === index ? 'selected' : ''}`} onClick={() => set('hair', index)}>
                    <ThemedAvatar avatarIndex={0} config={{ ...draft, hair: index }} size={44} animation="idle" />
                    {hair.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>ของประดับ</legend>
              <div className="chip-grid">
                {avatarAccessories.map((accessory, index) => (
                  <button key={accessory.id} className={`part-chip ${draft.accessory === index ? 'selected' : ''}`} onClick={() => set('accessory', index)}>
                    <ThemedAvatar avatarIndex={0} config={{ ...draft, accessory: index }} size={44} animation="idle" />
                    {accessory.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>เข็มกลัด</legend>
              <div className="chip-grid">
                {avatarBadges.map((badge, index) => (
                  <button key={badge.id} className={`part-chip ${draft.badge === index ? 'selected' : ''}`} onClick={() => set('badge', index)}>
                    <span className="badge-glyph" style={{ color: badge.color }}>{badge.glyph || '—'}</span>
                    {badge.name}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </Modal>
  );
}
