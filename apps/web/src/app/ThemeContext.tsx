import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme, remember, storedMode, storedPreset, THEME_MODE_KEY, THEME_PRESET_KEY,
  type ThemeMode, type ThemePreset
} from './theme';

interface ThemeState {
  mode: ThemeMode;
  preset: ThemePreset;
  setMode(mode: ThemeMode): void;
  setPreset(preset: ThemePreset): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Holds the viewer's own look: light or dark, and which colour the school prefers. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [preset, setPresetState] = useState<ThemePreset>(storedPreset);

  useEffect(() => { applyTheme(mode, preset); }, [mode, preset]);

  const setMode = useCallback((next: ThemeMode) => { setModeState(next); remember(THEME_MODE_KEY, next); }, []);
  const setPreset = useCallback((next: ThemePreset) => { setPresetState(next); remember(THEME_PRESET_KEY, next); }, []);

  const value = useMemo(() => ({ mode, preset, setMode, setPreset }), [mode, preset, setMode, setPreset]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// The hook lives with its provider so the two cannot drift apart.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
