import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/avatars/AvatarDesigner.tsx';

/* ── imports ── */
const importOld = `import { EnhancedPixelAvatar } from './EnhancedPixelAvatar';`;
const importNew = `import { EnhancedPixelAvatar } from './EnhancedPixelAvatar';
import { FullBodyAvatar } from './FullBodyAvatar';
import { fullBodyArchetypeList, type FullBodyArchetype } from './avatarFullBody';`;

/* ── the archetype a race opens on, and the four colours the stage offers ── */
const posesOld = `const tintRows: Array<{ key: keyof AvatarTints; label: string; swatches: string[] }> = [`;
const posesNew = `/**
 * Which full-body figure a race opens on.
 *
 * A dragonkin should not have to hunt for the dragon knight, and a human should not open on one.
 * It is a starting point rather than a rule: the chips below the stage change it, because the two
 * archetypes the brief asks to be previewable are worth being able to try on any avatar.
 */
const archetypeForRace: Record<AvatarRace, FullBodyArchetype> = {
  human: 'student',
  dragonkin: 'dragonKnight',
  demon: 'demon',
  beastfolk: 'athlete',
  spirit: 'arcaneMage',
  robot: 'student'
};

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

const tintRows: Array<{ key: keyof AvatarTints; label: string; swatches: string[] }> = [`;

/* ── state ── */
const stateOld = `  const [pose, setPose] = useState<AvatarAnimation>('idle');`;
const stateNew = `  const [pose, setPose] = useState<AvatarAnimation>('idle');
  /*
   * Which of the two bodies the stage is showing.
   *
   * The bust is what the app draws everywhere else and what a saved config addresses, so it stays
   * the default and the thing being edited. The full body is the same six colours on a figure that
   * has legs to walk on -- which is the only way to see what a pose actually does.
   */
  const [fullBody, setFullBody] = useState(false);
  const [archetype, setArchetype] = useState<FullBodyArchetype | null>(null);`;

patch(file, [[importOld, importNew], [posesOld, posesNew], [stateOld, stateNew]]);
console.log('designer imports, archetype map and stage state');
