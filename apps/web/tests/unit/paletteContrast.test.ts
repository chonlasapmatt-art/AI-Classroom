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
