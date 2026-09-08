// Colour pairs that have to stay readable.
//
// Every one of these was measured failing in a browser at some point, and not one of them looked
// wrong: 4.39 against a 4.5 requirement is a shade nobody catches by eye, on a chip nobody thinks to
// check, in a palette that reads as perfectly cheerful. The arithmetic is the only honest reviewer,
// so it runs in the suite rather than in an occasional sweep.
//
// The rule is WCAG 2.2 1.4.3: 4.5:1 for body text, 3:1 for large text. Everything here is chip and
// label sized, so everything here needs 4.5.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { subjectColors } from '../../src/data/subjectCatalog';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(resolve(here, '../../src/design-system/tokens.css'), 'utf8');

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** WCAG 2.2 contrast ratio, rounded down to two places so a borderline pair cannot round into a pass. */
export function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.floor(((lighter! + 0.05) / (darker! + 0.05)) * 100) / 100;
}

/** Reads one custom property out of a block of the stylesheet. */
function token(name: string, from = 0): string {
  const match = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(tokens.slice(from));
  if (!match?.[1]) throw new Error(`no --${name} in tokens.css`);
  return match[1].toLowerCase();
}

// Dark mode is declared twice — once behind the media query for people who never chose, and once
// under [data-theme="dark"] for people who did. Measuring from the first covers both, and a value
// that appeared in only one of them would be a bug of its own.
const darkBlockStart = tokens.indexOf('@media (prefers-color-scheme: dark)');

describe('subject colours', () => {
  it('read on their own soft background, which is how an unselected chip is drawn', () => {
    for (const [index, pair] of subjectColors.entries()) {
      expect(
        contrast(pair.solid, pair.soft),
        `subject ${index} ${pair.solid} on ${pair.soft}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('read as white on the fill, which is how a selected chip is drawn', () => {
    for (const [index, pair] of subjectColors.entries()) {
      expect(
        contrast('#ffffff', pair.solid),
        `subject ${index} white on ${pair.solid}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** Reads a custom property out of one preset's block, so a preset is measured on its own values. */
function presetToken(preset: string, name: string): string {
  const start = tokens.indexOf(`:root[data-preset="${preset}"]`);
  if (start < 0) throw new Error(`no [data-preset="${preset}"] block in tokens.css`);
  const block = tokens.slice(start, tokens.indexOf('}', start));
  const match = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  if (!match?.[1]) throw new Error(`no --${name} in the ${preset} preset`);
  return match[1].toLowerCase();
}

/** srgb color-mix, which is how dark mode derives the brand ramp from the preset's own hues. */
function mix(top: string, bottom: string, share: number): string {
  const parts = [1, 3, 5].map((index) => {
    const a = parseInt(top.slice(index, index + 2), 16);
    const b = parseInt(bottom.slice(index, index + 2), 16);
    return Math.round(a * share + b * (1 - share)).toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

describe('Paper White', () => {
  // The one preset that moves the page as well as the brand, so it is the one preset whose own
  // surfaces have to be measured. Every pair below is a real place in the product: the selected
  // menu entry, a primary button, a field hint, a stat's caption.
  const brand600 = presetToken('paper', 'brand-600');
  const brand700 = presetToken('paper', 'brand-700');
  const brand500 = presetToken('paper', 'brand-500');
  const brand400 = presetToken('paper', 'brand-400');
  const brand50 = presetToken('paper', 'brand-50');
  const brand100 = presetToken('paper', 'brand-100');
  const muted = '#6b6584'; // --ink-400, unchanged by the preset

  it('reads brand ink on its own soft tiles', () => {
    expect(contrast(brand600, brand50), 'brand-600 on brand-50').toBeGreaterThanOrEqual(4.5);
    expect(contrast(brand600, brand100), 'brand-600 on brand-100').toBeGreaterThanOrEqual(4.5);
    expect(contrast(brand700, brand50), 'brand-700 on brand-50').toBeGreaterThanOrEqual(4.5);
  });

  it('carries white on both fills, in light and in dark', () => {
    // --brand-solid is brand-600 in light and brand-500 in dark, so both have to hold white.
    expect(contrast('#ffffff', brand600), 'white on brand-600').toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', brand500), 'white on brand-500').toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted ink readable on all three warm surfaces', () => {
    for (const surface of ['canvas', 'surface-muted', 'surface-sunken']) {
      expect(
        contrast(muted, presetToken('paper', surface)),
        `--ink-400 on --${surface}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('still reads once dark mode derives the ramp from these hues', () => {
    const darkGround = '#17142e';
    expect(
      contrast(mix(brand400, '#ffffff', 0.72), mix(brand500, darkGround, 0.18)),
      'derived brand-600 on derived brand-50'
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(mix(brand400, '#ffffff', 0.72), mix(brand500, darkGround, 0.26)),
      'derived brand-600 on derived brand-100'
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('accent colours', () => {
  const accents = ['cyan', 'mint', 'green', 'gold', 'violet'];

  it('read as ink on their own soft in light mode', () => {
    for (const name of accents) {
      expect(
        contrast(token(`accent-${name}`), token(`accent-${name}-soft`)),
        `--accent-${name} on --accent-${name}-soft (light)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('read as ink on their own soft in dark mode', () => {
    // Dark mode redefines both halves, so the pair has to be measured again rather than assumed.
    for (const name of accents) {
      expect(
        contrast(token(`accent-${name}`, darkBlockStart), token(`accent-${name}-soft`, darkBlockStart)),
        `--accent-${name} on --accent-${name}-soft (dark)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
