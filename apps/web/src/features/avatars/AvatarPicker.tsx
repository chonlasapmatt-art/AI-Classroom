import { useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, Segmented } from '../../ui/components';
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

/** Self-service avatar picker: preview, search, filter, choose, save. */
export function AvatarPicker({ displayName, currentAvatarId, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAvatarId);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AvatarCategory | 'all'>('all');
  const [hairFilter, setHairFilter] = useState('all');
  const [skinFilter, setSkinFilter] = useState('all');
  const [clothesFilter, setClothesFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => searchAvatars(query, category).filter((avatar) =>
    (hairFilter === 'all' || avatar.config.hair === Number(hairFilter))
    && (skinFilter === 'all' || avatar.config.skinTone === Number(skinFilter))
    && (clothesFilter === 'all' || avatar.config.palette === Number(clothesFilter))
  ), [clothesFilter, hairFilter, query, category, skinFilter]);

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
          <ProfileAvatar displayName={displayName} avatarId={selected} size={148} animation="wave" />
          <strong>{displayName}</strong>
          <Badge tone={selected ? 'brand' : 'neutral'}>{selected ?? 'ยังไม่ได้เลือก'}</Badge>
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
          </div>

          <p className="ui-field-hint">พบ {results.length} แบบ</p>

          <div className="avatar-grid" role="listbox" aria-label="รายการ avatar">
            {results.map((avatar) => (
              <button
                key={avatar.id}
                role="option"
                aria-selected={selected === avatar.id}
                className={`avatar-option ${selected === avatar.id ? 'selected' : ''}`}
                onClick={() => setSelected(avatar.id)}
                title={`${avatar.name} (${avatar.id})`}
              >
                <ThemedAvatar avatarIndex={avatar.index} config={avatar.config} size={64} animation="idle" />
                <span>{avatar.id.replace('avatar_', '#')}</span>
              </button>
            ))}
          </div>

          {error && <p className="ui-field-message" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
