import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme, remember, storedMode, storedPreset, THEME_MODE_KEY, THEME_PRESET_KEY,
  storedDensity, storedMotion, THEME_DENSITY_KEY, THEME_MOTION_KEY,
  type ThemeDensity, type ThemeMode, type ThemeMotion, type ThemePreset
} from './theme';

interface ThemeState {
  mode: ThemeMode;
  preset: ThemePreset;
  density: ThemeDensity;
  motion: ThemeMotion;
  setMode(mode: ThemeMode): void;
  setPreset(preset: ThemePreset): void;
  setDensity(density: ThemeDensity): void;
  setMotion(motion: ThemeMotion): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Holds the viewer's own look: light or dark, and which colour the school prefers. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [preset, setPresetState] = useState<ThemePreset>(storedPreset);
  const [density, setDensityState] = useState<ThemeDensity>(storedDensity);
  const [motion, setMotionState] = useState<ThemeMotion>(storedMotion);

  useEffect(() => { applyTheme(mode, preset, density, motion); }, [mode, preset, density, motion]);

  const setMode = useCallback((next: ThemeMode) => { setModeState(next); remember(THEME_MODE_KEY, next); }, []);
  const setPreset = useCallback((next: ThemePreset) => { setPresetState(next); remember(THEME_PRESET_KEY, next); }, []);
  const setDensity = useCallback((next: ThemeDensity) => { setDensityState(next); remember(THEME_DENSITY_KEY, next); }, []);
  const setMotion = useCallback((next: ThemeMotion) => { setMotionState(next); remember(THEME_MOTION_KEY, next); }, []);

  const value = useMemo(() => ({ mode, preset, density, motion, setMode, setPreset, setDensity, setMotion }),
    [mode, preset, density, motion, setMode, setPreset, setDensity, setMotion]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// The hook lives with its provider so the two cannot drift apart.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
