import { readFileSync, writeFileSync } from 'node:fs';
function editFile(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  for (const [from, to] of pairs) {
    if (!src.includes(from)) { console.error('MISS in ' + file + ': ' + from.slice(0, 70)); process.exit(1); }
    src = src.replace(from, to);
  }
  writeFileSync(file, crlf ? src.replace(/\n/g, '\r\n') : src);
  console.log('patched ' + file);
}

editFile('apps/web/src/features/avatars/AvatarPicker.tsx', [
[`import { avatarPalettes, hairStyles, skinTones } from './avatarThemes';`,
`import { avatarOutfits, defaultOutfit } from './avatarOutfits';
import { avatarPalettes, hairStyles, skinTones } from './avatarThemes';`],
[`interface Props {
  displayName: string;
  currentAvatarId: string | null;
  onSave(avatarId: string): Promise<void> | void;
  onClose(): void;
}`,
`interface Props {
  displayName: string;
  currentAvatarId: string | null;
  /**
   * The clothes this person is wearing, when they are somebody who has clothes.
   *
   * Only a student record carries an outfit, so the wardrobe appears only when an outfit is passed:
   * a teacher or a guardian picking their avatar sees the picker exactly as it was.
   */
  currentOutfit?: string | null;
  onSave(avatarId: string, outfit: string | null): Promise<void> | void;
  onClose(): void;
}`],
[`export function AvatarPicker({ displayName, currentAvatarId, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAvatarId);`,
`export function AvatarPicker({ displayName, currentAvatarId, currentOutfit, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAvatarId);
  const wardrobe = currentOutfit !== undefined;
  const [outfit, setOutfit] = useState<string>(currentOutfit ?? defaultOutfit.id);`],
[`      await onSave(selected);`,
`      await onSave(selected, wardrobe ? outfit : null);`],
[`              <ProfileAvatar displayName={displayName} avatarId={selected} size={148} animation={pose} />`,
`              <ProfileAvatar
                displayName={displayName}
                avatarId={selected}
                size={148}
                animation={pose}
                {...(wardrobe ? { avatarConfig: { archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, outfit } } : {})}
              />`],
[`          <div className="avatar-pose-picker">`,
`          {/* The clothes, beside the poses: both are things you try on the drawing in front of you
              rather than search for, and both take effect on the preview as they are pressed. */}
          {wardrobe && (
            <div className="avatar-pose-picker">
              <span className="ui-field-label" id="avatar-outfit-label">ชุดเสื้อผ้า</span>
              <div className="avatar-pose-options" role="group" aria-labelledby="avatar-outfit-label">
                {avatarOutfits.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={\`avatar-pose \${outfit === option.id ? 'selected' : ''}\`}
                    aria-pressed={outfit === option.id}
                    title={option.description}
                    onClick={() => setOutfit(option.id)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="avatar-pose-picker">`],
[`                <span className="avatar-option-figure">
                  <ThemedAvatar avatarIndex={avatar.index} config={avatar.config} size={64} animation="idle" />
                </span>`,
`                <span className="avatar-option-figure">
                  <ThemedAvatar
                    avatarIndex={avatar.index}
                    config={wardrobe ? { ...avatar.config, outfit } : avatar.config}
                    size={64}
                    animation="idle"
                  />
                </span>`]
]);

editFile('apps/web/src/features/profile/ProfilePage.tsx', [
[`  async function saveAvatar(nextAvatarId: string) {`,
`  async function saveAvatar(nextAvatarId: string, nextOutfit: string | null) {`],
[`    remember(avatarStorageKey(membership.profileId), nextAvatarId);
    setLocalAvatarId(nextAvatarId);
    window.dispatchEvent(new Event('smart-classroom:avatar-changed'));
    toast('บันทึก avatar แล้ว');`,
`    // The clothes are a student's own record and are saved through their own route, so a school
    // that lets a student choose an avatar has not thereby let them write anything else.
    if (student && nextOutfit && nextOutfit !== (student.avatarConfig?.outfit ?? null)) {
      await repository.saveOwnOutfit(membership.profileId, nextOutfit);
    }
    remember(avatarStorageKey(membership.profileId), nextAvatarId);
    setLocalAvatarId(nextAvatarId);
    window.dispatchEvent(new Event('smart-classroom:avatar-changed'));
    toast('บันทึก avatar แล้ว');`],
[`          currentAvatarId={avatarId}
          onSave={saveAvatar}`,
`          currentAvatarId={avatarId}
          {...(student ? { currentOutfit: student.avatarConfig?.outfit ?? null } : {})}
          onSave={saveAvatar}`]
]);
