import { afterEach, describe, expect, it } from 'vitest';
import { applyStoredTheme, applyTheme, storedMode, storedPreset, THEME_MODE_KEY, THEME_PRESET_KEY } from '../../src/app/theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-preset');
});

describe('theme selection', () => {
  it('stamps nothing for system, so the viewer\'s own setting decides', () => {
    applyTheme('system', 'violet');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-preset')).toBe(false);
  });

  it('stamps an explicit choice in both directions', () => {
    applyTheme('dark', 'mint');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-preset')).toBe('mint');
    applyTheme('light', 'violet');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.hasAttribute('data-preset')).toBe(false);
  });

  it('falls back to the default when nothing is stored or the value is unknown', () => {
    expect(storedMode()).toBe('system');
    expect(storedPreset()).toBe('violet');
    localStorage.setItem(THEME_MODE_KEY, 'neon');
    localStorage.setItem(THEME_PRESET_KEY, 'chartreuse');
    expect(storedMode()).toBe('system');
    expect(storedPreset()).toBe('violet');
  });

  it('restores a remembered choice before the first render', () => {
    localStorage.setItem(THEME_MODE_KEY, 'dark');
    localStorage.setItem(THEME_PRESET_KEY, 'berry');
    applyStoredTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-preset')).toBe('berry');
  });
});
