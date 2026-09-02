import { afterEach, describe, expect, it } from 'vitest';
import { applyStoredTheme, applyTheme, storedDensity, storedMode, storedMotion, storedPreset, THEME_DENSITY_KEY, THEME_MODE_KEY, THEME_MOTION_KEY, THEME_PRESET_KEY } from '../../src/app/theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-preset');
  document.documentElement.removeAttribute('data-density');
  document.documentElement.removeAttribute('data-motion');
});

describe('theme selection', () => {
  it('stamps nothing for system, so the viewer\'s own setting decides', () => {
    applyTheme('system', 'violet');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-preset')).toBe(false);
  });

  it('stamps an explicit choice in both directions', () => {
    applyTheme('dark', 'mint', 'compact', 'reduced');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-preset')).toBe('mint');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
    applyTheme('light', 'violet');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.hasAttribute('data-preset')).toBe(false);
    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  it('falls back to the default when nothing is stored or the value is unknown', () => {
    expect(storedMode()).toBe('system');
    expect(storedPreset()).toBe('violet');
    expect(storedDensity()).toBe('comfortable');
    expect(storedMotion()).toBe('full');
    localStorage.setItem(THEME_MODE_KEY, 'neon');
    localStorage.setItem(THEME_PRESET_KEY, 'chartreuse');
    localStorage.setItem(THEME_DENSITY_KEY, 'wide');
    localStorage.setItem(THEME_MOTION_KEY, 'bouncy');
    expect(storedMode()).toBe('system');
    expect(storedPreset()).toBe('violet');
    expect(storedDensity()).toBe('comfortable');
    expect(storedMotion()).toBe('full');
  });

  it('restores a remembered choice before the first render', () => {
    localStorage.setItem(THEME_MODE_KEY, 'dark');
    localStorage.setItem(THEME_PRESET_KEY, 'berry');
    localStorage.setItem(THEME_DENSITY_KEY, 'spacious');
    localStorage.setItem(THEME_MOTION_KEY, 'reduced');
    applyStoredTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-preset')).toBe('berry');
    expect(document.documentElement.getAttribute('data-density')).toBe('spacious');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });
});
