export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemePreset = 'violet' | 'sky' | 'mint' | 'sunny' | 'berry';

export const themeModes: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'ตามระบบ' },
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' }
];

export const themePresets: { value: ThemePreset; label: string; swatch: string }[] = [
  { value: 'violet', label: 'Smart Violet', swatch: '#5b3df5' },
  { value: 'sky', label: 'Sky Classroom', swatch: '#2563eb' },
  { value: 'mint', label: 'Mint Learning', swatch: '#059669' },
  { value: 'sunny', label: 'Sunny School', swatch: '#ea580c' },
  { value: 'berry', label: 'Berry Fun', swatch: '#db2777' }
];

export const THEME_MODE_KEY = 'theme-mode';
export const THEME_PRESET_KEY = 'theme-preset';

const modes = ['system', 'light', 'dark'] as const;
const presets = ['violet', 'sky', 'mint', 'sunny', 'berry'] as const;

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

export function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* remembering is a convenience, not a requirement */ }
}

/**
 * Applies the chosen look to the document root, where the token layer reads it.
 *
 * `system` deliberately stamps nothing: with no `data-theme` the stylesheet falls through to the
 * viewer's own `prefers-color-scheme`, which is what "follow my device" has to mean.
 */
export function applyTheme(mode: ThemeMode, preset: ThemePreset): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  if (preset === 'violet') root.removeAttribute('data-preset');
  else root.setAttribute('data-preset', preset);
}

/**
 * Runs from the application entry, before React renders anything, so the first painted frame is
 * already in the right theme. The page's Content-Security-Policy allows no inline script, so this
 * is the earliest honest place to do it.
 */
export function applyStoredTheme(): void {
  applyTheme(storedMode(), storedPreset());
}
