import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { Badge, Button, Field, Modal, Segmented } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import {
  AVATAR_CATALOG_SIZE, avatarCategoryLabels, searchAvatars, type AvatarCategory
} from './avatarCatalog';
import { avatarPalettes, hairStyles, skinTones } from './avatarThemes';
import { ProfileAvatar } from './ProfileAvatar';
import { ThemedAvatar } from './ThemedAvatar';

interface Props {
  displayName: string;
  currentAvatarId: string | null;
  onSave(avatarId: string): Promise<void> | void;
  onClose(): void;
}

const categories: Array<{ value: AvatarCategory | 'all'; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  ...(Object.keys(avatarCategoryLabels) as AvatarCategory[]).map((key) => ({ value: key, label: avatarCategoryLabels[key] }))
];

/**
 * The poses the preview can strike.
 *
 * The drawings already know how to move — the app plays these on dashboards and on the board at the
 * front of a classroom — but the picker showed one waving figure and nothing else, so nobody choosing
 * an avatar ever saw the thing they were choosing do anything. Trying a pose is the point of the
 * panel now, and it costs nothing: the animations are CSS on drawings that are already on screen.
 */
const poses: Array<{ value: AvatarAnimation; label: string }> = [
  { value: 'wave', label: 'ทักทาย' },
  { value: 'study', label: 'ตั้งใจเรียน' },
  { value: 'celebrate', label: 'ดีใจ' },
  { value: 'idle', label: 'อยู่เฉย ๆ' }
];

/** Self-service avatar picker: preview a pose, search, filter, choose, save. */
export function AvatarPicker({ displayName, currentAvatarId, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAvatarId);
  const [pose, setPose] = useState<AvatarAnimation>('wave');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AvatarCategory | 'all'>('all');
  const [hairFilter, setHairFilter] = useState('all');
  const [skinFilter, setSkinFilter] = useState('all');
  const [clothesFilter, setClothesFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchAvatars(query, category).filter((avatar) =>
    (hairFilter === 'all' || avatar.config.hair === Number(hairFilter))
    && (skinFilter === 'all' || avatar.config.skinTone === Number(skinFilter))
    && (clothesFilter === 'all' || avatar.config.palette === Number(clothesFilter))
  ), [clothesFilter, hairFilter, query, category, skinFilter]);

  const chosen = results.find((avatar) => avatar.id === selected)
    ?? searchAvatars('', 'all').find((avatar) => avatar.id === selected)
    ?? null;

  // Filtering can leave the chosen avatar off screen. Keeping the roving focus on something that
  // exists is what stops the arrow keys landing on nothing.
  const focusIndex = Math.max(0, results.findIndex((avatar) => avatar.id === selected));

  useEffect(() => {
    if (!selected) return;
    const option = grid.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    // Not every environment that renders this has a scroller — jsdom does not implement it at all —
    // and bringing a tile into view is a courtesy, never something worth throwing over.
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, results.length]);

  /**
   * Arrow keys move through the drawings.
   *
   * A listbox that can only be reached one option at a time by Tab is a listbox nobody keyboards
   * through: 160 avatars is 160 stops. One tab stop, arrows to move, Home and End for the ends.
   */
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const columns = 4;
    const moves: Record<string, number> = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns
    };
    const step = moves[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? results.length - 1
        : Math.min(results.length - 1, Math.max(0, focusIndex + step!));
    const target = results[next];
    if (!target) return;
    setSelected(target.id);
    grid.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  }

  async function save() {
    if (!selected) { setError('เลือก avatar ก่อนบันทึก'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title="เลือก Avatar"
      description={`เลือกได้ ${AVATAR_CATALOG_SIZE} แบบ · เปลี่ยนได้เฉพาะ avatar ของตัวเอง`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>บันทึก</Button>
        </>
      }
    >
      <div className="avatar-picker">
        <aside className="avatar-picker-preview">
          <div className="avatar-stage">
            <span className="avatar-stage-glow" aria-hidden="true" />
            {/* Keyed on the choice so the drawing plays its entrance again each time one is picked:
                the answer to "did that do anything?" arrives before anybody has to ask. */}
            <div className="avatar-stage-figure" key={`${selected ?? 'none'}-${pose}`}>
              <ProfileAvatar displayName={displayName} avatarId={selected} size={148} animation={pose} />
            </div>
          </div>
          <strong>{displayName}</strong>
          <Badge tone={selected ? 'brand' : 'neutral'}>{chosen?.name ?? 'ยังไม่ได้เลือก'}</Badge>
          <div className="avatar-pose-picker">
            <span className="ui-field-label" id="avatar-pose-label">ลองท่าทาง</span>
            <div className="avatar-pose-options" role="group" aria-labelledby="avatar-pose-label">
              {poses.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`avatar-pose ${pose === option.value ? 'selected' : ''}`}
                  aria-pressed={pose === option.value}
                  onClick={() => setPose(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="avatar-picker-body">
          <div className="avatar-picker-filters">
            <Field label="ค้นหา" hint="พิมพ์ชื่อ รหัส หรือคำ เช่น แว่น, กีฬา">
              <input
                type="search"
                value={query}
                placeholder="avatar_012 · นักอ่าน · ใส่แว่น"
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <Segmented
              ariaLabel="หมวดหมู่ avatar"
              value={category}
              onChange={setCategory}
              options={categories}
            />
            {/* Three dropdowns of parts is a wardrobe, not a first question. They stay one press
                away for somebody hunting a particular look and out of everybody else's way. */}
            <details className="avatar-detail-filters">
              <summary>ตัวกรองละเอียด · ทรงผม สีผิว ชุด</summary>
              <div className="avatar-part-filters">
                <Field label="ทรงผม">
                  <select value={hairFilter} onChange={(event) => setHairFilter(event.target.value)}>
                    <option value="all">ทุกทรงผม</option>
                    {hairStyles.map((hair, index) => <option key={hair.id} value={index}>{hair.name}</option>)}
                  </select>
                </Field>
                <Field label="สีผิว">
                  <select value={skinFilter} onChange={(event) => setSkinFilter(event.target.value)}>
                    <option value="all">ทุกสีผิว</option>
                    {skinTones.map((tone, index) => <option key={tone} value={index}>โทนที่ {index + 1}</option>)}
                  </select>
                </Field>
                <Field label="เสื้อผ้า/สีหลัก">
                  <select value={clothesFilter} onChange={(event) => setClothesFilter(event.target.value)}>
                    <option value="all">ทุกสี</option>
                    {avatarPalettes.map((palette, index) => <option key={palette.primary} value={index}>ชุดสีที่ {index + 1}</option>)}
                  </select>
                </Field>
              </div>
            </details>
          </div>

          <p className="ui-field-hint" role="status">พบ {results.length} แบบ</p>

          <div
            className="avatar-grid"
            role="listbox"
            aria-label="รายการ avatar"
            ref={grid}
            onKeyDown={navigate}
          >
            {results.map((avatar, index) => (
              <button
                key={avatar.id}
                role="option"
                type="button"
                aria-selected={selected === avatar.id}
                // One tab stop for the whole gallery; the arrows do the rest.
                tabIndex={index === focusIndex ? 0 : -1}
                className={`avatar-option ${selected === avatar.id ? 'selected' : ''}`}
                style={{ '--enter': index } as React.CSSProperties}
                onClick={() => setSelected(avatar.id)}
                title={`${avatar.name} (${avatar.id})`}
              >
                <span className="avatar-option-figure">
                  <ThemedAvatar avatarIndex={avatar.index} config={avatar.config} size={64} animation="idle" />
                </span>
                <span className="avatar-option-name">{avatar.name}</span>
                <span className="avatar-option-check" aria-hidden="true"><Icon name="check" size={13} /></span>
              </button>
            ))}
          </div>

          {results.length === 0 && (
            <p className="ui-field-hint">ไม่พบ avatar ที่ตรงกับที่ค้นหา · ลองล้างตัวกรองละเอียดหรือพิมพ์คำสั้นลง</p>
          )}
          {error && <p className="ui-field-message" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
