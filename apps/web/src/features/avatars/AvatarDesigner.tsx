import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { AvatarAnimation } from '../../domain/types';
import { Badge, Button, Modal } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import {
  AVATAR_CATALOG_SIZE, avatarCategoryLabels, searchAvatars, type AvatarCategory, type CatalogAvatar
} from './avatarCatalog';
import { levelFromPoints } from './avatarLevels';
import {
  defaultTints, elementLabels, layerLabels, migrateConfig, raceLabels, tintVariables,
  type AvatarConfigV2, type AvatarRace, type AvatarTints, type LayerType
} from './avatarSchema';
import { defaultBodyFor, traitCounts, traitsForLayer, type Trait } from './avatarTraits';
import { avatarOutfits, canWearOutfit, defaultOutfit, outfitPrice } from './avatarOutfits';
import { avatarPalettes, skinTones } from './avatarThemes';
import { FullBodyAvatar } from './FullBodyAvatar';
import { archetypeForRace, bodyForCategory, fullBodyArchetypeList } from './avatarFullBody';
import { ThemedAvatar } from './ThemedAvatar';

/**
 * เลือก Avatar ขั้นสูง — one screen for both ways of choosing.
 *
 * There were two, and neither was enough on its own. The picker offered finished avatars and no way
 * to change one; the studio offered parts and no way to see what anybody else had made. A child who
 * wanted "that dragon, but green" had to give up on one screen and start again on the other.
 *
 * So: the catalogue is the front door, because most people want a character rather than a
 * construction kit, and the drawers are one press away down the left-hand side. Opening a drawer
 * does not throw away the avatar on screen — it starts from it, which is the whole point.
 *
 * ── What saving means ──
 * Two different things, and the difference is which of them the record can hold. Picking from the
 * catalogue stores an id, the way it always has. Changing anything in a drawer produces a
 * combination that no id names, so it is saved as a config — and only where something can save one.
 * A teacher dressing a pupil can; a student can when the app gives them `onSaveConfig`. Without it
 * the drawers are read-only and say so, rather than accepting edits and losing them.
 */
export interface AvatarDesignerProps {
  displayName: string;
  currentAvatarId: string | null;
  /** What they are wearing now, when it is a custom build rather than a catalogue id. */
  currentConfig?: AvatarConfigV2 | null;
  currentOutfit?: string | null;
  /** What the child has to spend. Absent when nobody is shopping — a teacher dressing a pupil. */
  points?: number;
  unlocked?: ReadonlySet<string>;
  /** Exchanging points for a priced outfit. Absent when nobody is shopping. */
  onRedeem?(outfitId: string): Promise<void>;
  onSave(avatarId: string, outfit: string | null): Promise<void> | void;
  /** Saves a combination no catalogue id names. Absent means the drawers cannot be committed. */
  onSaveConfig?(config: AvatarConfigV2): Promise<void> | void;
  onClose(): void;
}

/** How many tiles are mounted at once. The catalogue is a thousand; a phone is not. */
const PAGE_SIZE = 60;

type Drawer = LayerType | 'tints' | 'outfit';
type Pane = 'catalogue' | Drawer;

const drawerRows: Array<{ pane: Drawer; label: string; countOf?: LayerType }> = [
  { pane: 'hair_headpiece', label: 'ทรงผม/เขา', countOf: 'hair_headpiece' },
  { pane: 'face_features', label: 'หน้ากาก/ตา', countOf: 'face_features' },
  { pane: 'top_clothing', label: 'เสื้อ', countOf: 'top_clothing' },
  { pane: 'bottom_clothing', label: 'กางเกง/กระโปรง', countOf: 'bottom_clothing' },
  { pane: 'tints', label: 'สีเสื้อ/ไอเทม' },
  { pane: 'outfit', label: 'ตู้เสื้อผ้า (ใช้แต้ม)' },
  { pane: 'back_accessory', label: 'ปีก/หาง/ผ้าคลุม', countOf: 'back_accessory' },
  { pane: 'front_accessory', label: 'ของถือ/สัตว์เลี้ยง', countOf: 'front_accessory' },
  { pane: 'back_aura', label: 'ออร่า', countOf: 'back_aura' },
  { pane: 'front_fx', label: 'เอฟเฟกต์', countOf: 'front_fx' }
];

const poses: Array<{ value: AvatarAnimation; label: string }> = [
  { value: 'idle', label: 'ยืน' },
  { value: 'walk', label: 'เดิน' },
  { value: 'run', label: 'วิ่ง' },
  { value: 'cast', label: 'ร่ายเวทย์' },
  { value: 'attack', label: 'โจมตี' },
  { value: 'jump', label: 'กระโดด' },
  { value: 'cheer', label: 'เชียร์' }
];

/**
 * The four colours the stage offers without opening a drawer.
 *
 * All six tints live in the colour drawer and always have. These four are the ones a person changes
 * while watching a pose -- hair, the main garment, the boots and trim, and the magic -- so they are
 * on the stage beside the figure rather than three taps away behind a tab.
 */
const stageTints: Array<{ key: keyof AvatarTints; label: string; swatches: string[] }> = [
  { key: 'hair', label: 'สีผม', swatches: ['#2f2a44', '#4a2f22', '#1f1b2e', '#7b3f22', '#243b6b', '#be185d'] },
  { key: 'primary', label: 'ชุดหลัก', swatches: avatarPalettes.slice(0, 6).map((palette) => palette.primary) },
  { key: 'accent', label: 'ขอบ/รองเท้า', swatches: avatarPalettes.slice(0, 6).map((palette) => palette.accent) },
  { key: 'magic', label: 'ออร่าเวทมนตร์', swatches: ['#a855f7', '#22d3ee', '#f472b6', '#f59e0b', '#34d399', '#60a5fa'] }
];

const tintRows: Array<{ key: keyof AvatarTints; label: string; swatches: string[] }> = [
  { key: 'skin', label: 'สีผิว', swatches: [...skinTones] },
  { key: 'hair', label: 'สีผม', swatches: ['#2f2a44', '#4a2f22', '#1f1b2e', '#7b3f22', '#3b2a1d', '#243b6b', '#b45309', '#0f766e', '#be185d', '#0369a1'] },
  { key: 'primary', label: 'สีเสื้อ', swatches: avatarPalettes.map((palette) => palette.primary) },
  { key: 'secondary', label: 'สีรอง', swatches: ['#0f766e', '#4930d1', '#9c4a08', '#0369a1', '#be185d', '#456d0d', '#44403c', '#b91c1c'] },
  { key: 'accent', label: 'สีเน้น', swatches: avatarPalettes.map((palette) => palette.accent) },
  { key: 'magic', label: 'สีเวทมนตร์', swatches: ['#a855f7', '#22d3ee', '#f472b6', '#f59e0b', '#34d399', '#60a5fa', '#f87171', '#c4b5fd'] }
];

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];

const categories: Array<{ value: AvatarCategory | 'all'; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  ...(Object.keys(avatarCategoryLabels) as AvatarCategory[])
    .map((key) => ({ value: key, label: avatarCategoryLabels[key] }))
];

/**
 * The starting draft: what they are wearing, whichever way it is stored.
 *
 * A flat config has no layers, and the compositor draws exactly what it is given — which for a
 * migrated config is a body and a face and nothing else. That is correct and it looks like a bug:
 * the preview opens on a bald figure in no clothes. So a config with nothing layered is dressed in
 * the plainest thing in each drawer, which is also what a new student should see first.
 */
const plainClothes = {
  hair_headpiece: 'hair_short',
  face_features: 'face_neutral',
  top_clothing: 'top_uniform',
  bottom_clothing: 'bottom_trousers'
} as const;

function startingConfig(currentConfig: AvatarConfigV2 | null | undefined, catalogue: CatalogAvatar | null): AvatarConfigV2 {
  if (currentConfig) return currentConfig;
  if (catalogue) return catalogue.config as AvatarConfigV2;
  // Nobody has chosen anything yet, so the figure is dressed in the plainest thing in each drawer.
  return { ...migrateConfig({ archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0 }), layers: { ...plainClothes } };
}

export function AvatarDesigner({
  displayName, currentAvatarId, currentConfig, currentOutfit, points, unlocked,
  onRedeem, onSave, onSaveConfig, onClose
}: AvatarDesignerProps) {
  const opening = useRef(searchAvatars('', 'all').find((avatar) => avatar.id === currentAvatarId) ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(currentAvatarId);
  const [draft, setDraft] = useState<AvatarConfigV2>(() => startingConfig(currentConfig, opening.current));
  const original = useRef(draft);

  const [pane, setPane] = useState<Pane>('catalogue');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [category, setCategory] = useState<AvatarCategory | 'all'>('all');
  const [pose, setPose] = useState<AvatarAnimation>('idle');
  /*
   * Which of the two bodies the stage is showing.
   *
   * The bust is what the app draws everywhere else and what a saved config addresses, so it stays
   * the default and the thing being edited. The full body is the same six colours on a figure that
   * has legs to walk on -- which is the only way to see what a pose actually does.
   */

  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [outfit, setOutfit] = useState<string>(currentOutfit ?? defaultOutfit.id);
  const [buying, setBuying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  /*
   * The search waits for the typing to stop.
   *
   * Every keystroke otherwise re-filters a thousand entries and re-mounts a screenful of animated
   * figures, which on a tablet is felt as the keyboard lagging behind the fingers.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed), 180);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => setVisible(PAGE_SIZE), [query, category, pane]);

  const counts = useMemo(() => traitCounts(), []);
  const shopping = typeof points === 'number';
  const owned = unlocked ?? new Set<string>();

  const results = useMemo(() => searchAvatars(query, category), [query, category]);
  const drawerTraits = useMemo(
    () => (pane === 'catalogue' || pane === 'tints' || pane === 'outfit' ? [] : traitsForLayer(pane, draft.race)),
    [pane, draft.race]
  );

  const gridItems: Array<CatalogAvatar | Trait> = pane === 'catalogue' ? results : drawerTraits;
  const shown = gridItems.slice(0, visible);

  /** A priced trait a student has not unlocked cannot be worn yet. Teachers are not shopping. */
  const locked = (trait: Trait) => shopping && Boolean(trait.price) && !owned.has(trait.id);

  const custom = selectedId === null;

  function editLayer(layer: LayerType, traitId: string) {
    /*
     * The first drawer edit on a flat avatar dresses it.
     *
     * A version-1 config has no layers, and the compositor draws exactly what it is given — so
     * changing only the hat on one would produce a bare figure in a hat. Seeding the plain set first
     * keeps the person looking like a person while they change one thing.
     */
    setDraft((current) => {
      const base = current.layers ?? { ...plainClothes, body_base: defaultBodyFor(current.race ?? 'human') };
      return { ...migrateConfig(current), ...current, v: 2, layers: { ...base, [layer]: traitId } };
    });
    // A drawer edit is a build of one's own; it is no longer the catalogue entry it started from.
    setSelectedId(null);
    setError(null);
  }

  function editTint(key: keyof AvatarTints, value: string) {
    setDraft((current) => ({ ...current, v: 2, tints: { ...(current.tints ?? {}), [key]: value } }));
    setSelectedId(null);
    setError(null);
  }

  function chooseRace(race: AvatarRace) {
    setDraft((current) => ({
      ...current, v: 2, race,
      layers: { ...(current.layers ?? {}), body_base: defaultBodyFor(race) }
    }));
    setSelectedId(null);
  }

  function pickCatalogue(avatar: CatalogAvatar) {
    setSelectedId(avatar.id);
    setDraft(startingConfig(null, avatar));
    setError(null);
  }

  /** สุ่ม — a whole character at once, from the catalogue, because a random pile of parts is not one. */
  function randomise() {
    const pool = results.length > 0 ? results : searchAvatars('', 'all');
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    pickCatalogue(pick);
  }

  function reset() {
    setDraft(original.current);
    setSelectedId(currentAvatarId);
    setError(null);
  }

  async function commit() {
    setSaving(true);
    setError(null);
    try {
      if (!custom && selectedId) {
        await onSave(selectedId, currentOutfit !== undefined ? outfit : null);
      } else if (onSaveConfig) {
        await onSaveConfig(draft);
      } else {
        setError('บันทึกแบบแก้เองไม่ได้ในหน้านี้ · เลือกจากรายการแทน');
        return;
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  /** One tab stop for the grid; the arrows do the rest, across whatever is mounted. */
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const columns = 4;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    const step = moves[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const options = [...(grid.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const active = options.findIndex((node) => node === document.activeElement);
    const from = active >= 0 ? active : 0;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : Math.min(options.length - 1, Math.max(0, from + step!));
    options[next]?.focus();
    options[next]?.click();
  }

  /* The wardrobe dresses the figure as the app has always drawn it, so its previews use the flat
     half of the draft rather than the layered one. */
  const legacyDraft = {
    archetype: draft.archetype, palette: draft.palette, skinTone: draft.skinTone,
    hair: draft.hair, accessory: draft.accessory, badge: draft.badge
  };

  const balance = points ?? 0;
  const level = levelFromPoints(balance);
  const race = draft.race ?? 'human';
  // The body a child picked, or the one their race has always drawn if they have not picked yet.
  const body = draft.bodyArchetype ?? archetypeForRace[race] ?? 'student';

  return (
    <Modal
      wide
      title="เลือก Avatar ขั้นสูง"
      description={`เลือกได้ ${AVATAR_CATALOG_SIZE} แบบ · แก้ไขได้ละเอียด`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={saving} onClick={() => void commit()}>บันทึกและใช้</Button>
        </>
      }
    >
      <div className="designer">
        <aside className="designer-side">
          <div className="designer-preview">
            <span className="designer-chip">คัดแยก {AVATAR_CATALOG_SIZE} แบบ · รายละเอียดขั้นสูง</span>
            <div className="designer-stage">
              <FullBodyAvatar
                archetype={body}
                animation={pose}
                tints={draft.tints}
                size={176}
                label={displayName}
                paused={!playing}
              />
            </div>

            {/*
              * One body, and it is the one that gets saved.
              *
              * The customiser used to draw a bust and offer the figure as a preview toggle, so the
              * shape a child spent their time on was not the shape the app kept: the switch was a
              * way to look at something the save could not carry. The figure is now the avatar --
              * chosen here, written with the traits, and drawn on the profile the same way.
              */}
            <>
                <div className="designer-chips" role="group" aria-label="แบบตัวละคร">
                  {fullBodyArchetypeList.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`designer-catchip ${body === option.id ? 'active' : ''}`}
                      aria-pressed={body === option.id}
                      title={option.description}
                      onClick={() => setDraft((current) => ({ ...current, v: 2, bodyArchetype: option.id }))}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
                {/* The four colours worth changing while a pose is playing, on the stage itself. */}
                <div className="designer-stage-tints">
                  {stageTints.map((row) => (
                    <div key={row.key} className="designer-stage-tint">
                      <span>{row.label}</span>
                      <div role="group" aria-label={row.label}>
                        {row.swatches.map((colour) => {
                          const chosen = (draft.tints?.[row.key] ?? defaultTints[row.key]) === colour;
                          return (
                            <button
                              key={colour}
                              type="button"
                              className={`designer-swatch ${chosen ? 'active' : ''}`}
                              style={{ background: colour }}
                              aria-label={`${row.label} ${colour}`}
                              aria-pressed={chosen}
                              onClick={() => setDraft((current) => ({
                                ...current, tints: { ...current.tints, [row.key]: colour }
                              }))}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
            </>
            <div className="designer-identity">
              <strong>{displayName}</strong>
              <div className="designer-tags">
                <Badge tone="info">{raceLabels[race]}</Badge>
                {draft.element && draft.element !== 'none' && <Badge tone="neutral">{elementLabels[draft.element]}</Badge>}
                {shopping && <Badge tone="success">เลเวล {level.level}</Badge>}
              </div>
              {shopping && <small>{balance} แต้ม · อีก {level.needed - level.into} แต้มขึ้นเลเวล</small>}
              {custom && <small className="designer-custom">แบบที่แก้เอง</small>}
            </div>
          </div>

          <nav className="designer-rows" aria-label="แก้ไขละเอียด">
            <button
              type="button"
              className={`designer-row ${pane === 'catalogue' ? 'active' : ''}`}
              aria-current={pane === 'catalogue' ? 'true' : undefined}
              onClick={() => setPane('catalogue')}
            >
              <span>รายการทั้งหมด</span>
              <small>{AVATAR_CATALOG_SIZE} แบบ</small>
            </button>
            {drawerRows.map((row) => (
              <button
                key={row.pane}
                type="button"
                className={`designer-row ${pane === row.pane ? 'active' : ''}`}
                aria-current={pane === row.pane ? 'true' : undefined}
                onClick={() => setPane(row.pane)}
              >
                <span>{row.label}</span>
                <small>{row.countOf ? `${counts[row.countOf]} แบบ` : `${tintRows.length} ชุดสี`}</small>
              </button>
            ))}
          </nav>

          <div className="designer-races" role="group" aria-label="เผ่า">
            {races.map((option) => (
              <button
                key={option}
                type="button"
                className={`designer-race ${race === option ? 'active' : ''}`}
                aria-pressed={race === option}
                onClick={() => chooseRace(option)}
              >
                {raceLabels[option]}
              </button>
            ))}
          </div>
        </aside>

        <section className="designer-main">
          <div className="designer-toolbar">
            <label className="designer-search">
              <span className="ui-visually-hidden">ค้นหา</span>
              <Icon name="search" size={16} />
              <input
                type="search"
                value={typed}
                placeholder="ค้นหา เช่น มังกร ไฟ นักเวทย์"
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
            <div className="designer-poses" role="group" aria-label="ท่าทางในพรีวิว">
              <button
                type="button"
                className={`designer-pose ${playing ? 'active' : ''}`}
                aria-pressed={playing}
                title={playing ? 'หยุดเล่น' : 'เล่นท่าทาง'}
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              {poses.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`designer-pose ${pose === option.value ? 'active' : ''}`}
                  aria-pressed={pose === option.value}
                  title={option.label}
                  onClick={() => { setPose(option.value); setPlaying(true); }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {pane === 'catalogue' && (
            <div className="designer-chips" role="group" aria-label="หมวด">
              {categories.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  className={`designer-catchip ${category === chip.value ? 'active' : ''}`}
                  aria-pressed={category === chip.value}
                  onClick={() => setCategory(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {pane === 'outfit' ? (
            /*
             * The wardrobe, which is the one part of this screen that spends anything.
             *
             * It applies to the avatar as the app has always drawn it, and it is where the points a
             * child earns by turning up actually go. Kept here rather than on a second screen,
             * because "change my avatar" and "wear the thing I saved up for" were two doors to the
             * same wardrobe and nobody found the second one.
             */
            <div className="designer-grid" role="listbox" aria-label="ตู้เสื้อผ้า">
              {avatarOutfits.map((item) => {
                const price = outfitPrice(item.id);
                const wearable = canWearOutfit(item.id, owned) || !shopping;
                const affordable = balance >= price;
                return (
                  <button
                    key={item.id}
                    role="option"
                    type="button"
                    aria-selected={outfit === item.id}
                    className={`designer-tile ${outfit === item.id ? 'selected' : ''} ${wearable ? '' : 'locked'}`}
                    title={item.name}
                    onClick={() => {
                      if (wearable) { setOutfit(item.id); setError(null); return; }
                      if (!onRedeem || !affordable) {
                        setError(`${item.name} ต้องใช้ ${price} แต้ม · มีอยู่ ${balance} แต้ม`);
                        return;
                      }
                      setBuying(item.id);
                      void onRedeem(item.id)
                        .then(() => { setOutfit(item.id); setError(null); })
                        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'แลกไม่สำเร็จ'))
                        .finally(() => setBuying(null));
                    }}
                  >
                    <span className="designer-tile-figure">
                      <ThemedAvatar
                        avatarIndex={0}
                        config={{ ...legacyDraft, outfit: item.id }}
                        size={56}
                        animation="idle"
                      />
                    </span>
                    <span className="designer-tile-name">{item.name}</span>
                    {!wearable && (
                      <span className="designer-tile-price">
                        {buying === item.id ? 'กำลังแลก…' : `${price} แต้ม`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : pane === 'tints' ? (
            <div className="designer-tints">
              {tintRows.map((row) => (
                <div key={row.key} className="designer-tintrow">
                  <span className="ui-field-label">{row.label}</span>
                  <div className="designer-swatches" role="radiogroup" aria-label={row.label}>
                    {row.swatches.map((colour) => {
                      const active = (draft.tints?.[row.key] ?? defaultTints[row.key]) === colour;
                      return (
                        <button
                          key={colour}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={`${row.label} ${colour}`}
                          className={`designer-swatch ${active ? 'active' : ''}`}
                          style={{ '--swatch': colour } as CSSProperties}
                          onClick={() => editTint(row.key, colour)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="ui-field-hint" role="status">
                {pane === 'catalogue'
                  ? `พบ ${results.length} แบบ${shown.length < results.length ? ` · แสดง ${shown.length}` : ''}`
                  : `${drawerTraits.length} แบบใน${layerLabels[pane]}`}
              </p>

              <div
                className="designer-grid"
                role="listbox"
                aria-label={pane === 'catalogue' ? 'รายการ avatar' : layerLabels[pane]}
                ref={grid}
                onKeyDown={navigate}
              >
                {shown.map((item, index) => {
                  if (pane === 'catalogue') {
                    const avatar = item as CatalogAvatar;
                    const chosen = selectedId === avatar.id;
                    return (
                      <button
                        key={avatar.id}
                        role="option"
                        type="button"
                        aria-selected={chosen}
                        tabIndex={index === 0 ? 0 : -1}
                        className={`designer-tile ${chosen ? 'selected' : ''}`}
                        title={`${avatar.name} (${avatar.id})`}
                        onClick={() => pickCatalogue(avatar)}
                      >
                        <span className="designer-tile-figure">
                          {/* The thumbnail is the figure, in the colours being edited and held on its first frame:
                              a page of forty looping avatars is a fairground, and a page of forty
                              busts was the reason the catalogue read as one avatar repeated. */}
                          <FullBodyAvatar
                            archetype={bodyForCategory(avatar.category, avatar.index)}
                            tints={draft.tints}
                            size={64}
                            label={avatar.name}
                            paused
                          />
                        </span>
                        <span className="designer-tile-name">{avatar.name}</span>
                      </button>
                    );
                  }
                  const trait = item as Trait;
                  const chosen = draft.layers?.[pane as LayerType] === trait.id;
                  const shut = locked(trait);
                  return (
                    <button
                      key={trait.id}
                      role="option"
                      type="button"
                      aria-selected={chosen}
                      aria-disabled={shut}
                      tabIndex={index === 0 ? 0 : -1}
                      className={`designer-tile ${chosen ? 'selected' : ''} ${shut ? 'locked' : ''}`}
                      title={trait.name}
                      onClick={() => {
                        if (shut) { setError(`${trait.name} ยังไม่ปลดล็อก · ใช้ ${trait.price} แต้ม`); return; }
                        editLayer(pane as LayerType, trait.id);
                      }}
                    >
                      <span className="designer-tile-figure">
                        {/* The trait is drawn in the colours it will actually be worn in: every
                            sprite reads var(--av-…), so without the palette on the element a hat
                            previews as a black shape and a person picks by silhouette alone. */}
                        <svg
                          viewBox="0 0 24 24" width={56} height={56}
                          className="designer-swatchicon" aria-hidden="true"
                          style={tintVariables(draft.tints) as CSSProperties}
                        >
                          {trait.draw()}
                        </svg>
                      </span>
                      <span className="designer-tile-name">{trait.name}</span>
                      {shut && <span className="designer-tile-price">ล็อก · {trait.price} แต้ม</span>}
                    </button>
                  );
                })}
              </div>

              {shown.length < gridItems.length && (
                <div className="ui-page-actions">
                  <Button variant="secondary" type="button" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                    ดูเพิ่มอีก {Math.min(PAGE_SIZE, gridItems.length - shown.length)} แบบ
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="designer-actions">
            <Button variant="secondary" type="button" onClick={randomise}>สุ่ม</Button>
            <Button variant="ghost" type="button" onClick={reset}>คืนค่าเดิม</Button>
          </div>

          {!onSaveConfig && custom && (
            <p className="ui-field-hint">หน้านี้บันทึกได้เฉพาะแบบที่เลือกจากรายการ</p>
          )}
          {error && <p className="ui-field-message" role="alert">{error}</p>}
        </section>
      </div>
    </Modal>
  );
}
