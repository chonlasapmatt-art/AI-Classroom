export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemePreset = 'violet' | 'sky' | 'mint' | 'sunny' | 'berry' | 'ocean' | 'forest' | 'graphite';
export type ThemeDensity = 'comfortable' | 'compact' | 'spacious';
export type ThemeMotion = 'full' | 'reduced';

export const themeModes: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'ตามระบบ' },
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' }
];

export const themePresets: { value: ThemePreset; label: string; description: string; swatch: string }[] = [
  { value: 'violet', label: 'Smart Violet', description: 'เอกลักษณ์เดิมของระบบ', swatch: '#5b3df5' },
  { value: 'sky', label: 'Sky Classroom', description: 'โปร่ง สบายตา', swatch: '#2563eb' },
  { value: 'mint', label: 'Mint Learning', description: 'สดชื่น เป็นมิตร', swatch: '#059669' },
  { value: 'sunny', label: 'Sunny School', description: 'อบอุ่น มีพลัง', swatch: '#ea580c' },
  { value: 'berry', label: 'Berry Fun', description: 'สนุก มีสีสัน', swatch: '#db2777' },
  { value: 'ocean', label: 'Ocean Focus', description: 'นิ่งและมีสมาธิ', swatch: '#0891b2' },
  { value: 'forest', label: 'Forest Calm', description: 'ธรรมชาติ ผ่อนคลาย', swatch: '#15803d' },
  { value: 'graphite', label: 'Graphite Pro', description: 'เรียบ เท่ มืออาชีพ', swatch: '#475569' }
];

export const themeDensities: { value: ThemeDensity; label: string; description: string }[] = [
  { value: 'compact', label: 'กระชับ', description: 'เห็นข้อมูลได้มากขึ้น' },
  { value: 'comfortable', label: 'พอดี', description: 'สมดุลสำหรับทุกหน้าจอ' },
  { value: 'spacious', label: 'โปร่ง', description: 'อ่านง่าย เหมาะกับแท็บเล็ต' }
];

export const themeMotions: { value: ThemeMotion; label: string; description: string }[] = [
  { value: 'full', label: 'มีลูกเล่น', description: 'แอนิเมชันนุ่มนวล' },
  { value: 'reduced', label: 'ลดการเคลื่อนไหว', description: 'เหมาะกับผู้ที่ไวต่อ motion' }
];

export const THEME_MODE_KEY = 'theme-mode';
export const THEME_PRESET_KEY = 'theme-preset';
export const THEME_DENSITY_KEY = 'theme-density';
export const THEME_MOTION_KEY = 'theme-motion';

const modes = ['system', 'light', 'dark'] as const;
const presets = ['violet', 'sky', 'mint', 'sunny', 'berry', 'ocean', 'forest', 'graphite'] as const;
const densities = ['comfortable', 'compact', 'spacious'] as const;
const motions = ['full', 'reduced'] as const;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return allowed.includes(stored as T) ? stored as T : fallback;
  } catch {
    // A browser with site data blocked still gets a working app, just not a remembered choice.
    return fallback;
  }
}

export function storedMode(): ThemeMode { return read(THEME_MODE_KEY, modes, 'system'); }
export function storedPreset(): ThemePreset { return read(THEME_PRESET_KEY, presets, 'violet'); }
export function storedDensity(): ThemeDensity { return read(THEME_DENSITY_KEY, densities, 'comfortable'); }
export function storedMotion(): ThemeMotion { return read(THEME_MOTION_KEY, motions, 'full'); }

export function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* remembering is a convenience, not a requirement */ }
}

/**
 * Applies the chosen look to the document root, where the token layer reads it.
 *
 * `system` deliberately stamps nothing: with no `data-theme` the stylesheet falls through to the
 * viewer's own `prefers-color-scheme`, which is what "follow my device" has to mean.
 */
export function applyTheme(mode: ThemeMode, preset: ThemePreset, density: ThemeDensity = 'comfortable', motion: ThemeMotion = 'full'): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  if (preset === 'violet') root.removeAttribute('data-preset');
  else root.setAttribute('data-preset', preset);
  if (density === 'comfortable') root.removeAttribute('data-density');
  else root.setAttribute('data-density', density);
  if (motion === 'full') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', motion);
}

/**
 * Runs from the application entry, before React renders anything, so the first painted frame is
 * already in the right theme. The page's Content-Security-Policy allows no inline script, so this
 * is the earliest honest place to do it.
 */
export function applyStoredTheme(): void {
  applyTheme(storedMode(), storedPreset(), storedDensity(), storedMotion());
}
