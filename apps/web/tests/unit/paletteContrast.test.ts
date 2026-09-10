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

/*
 * The dark theme's own two jobs: text that can be read, and grounds that can be told apart.
 *
 * The first is the same arithmetic as everything above. The second is not a contrast rule at all --
 * a card does not need 4.5:1 against the page -- but it is the thing that was actually wrong: four
 * grounds inside four percent of luminance, so a card did not sit on the page, a well did not sink
 * into the card, and the only separation left was a black drop shadow, which occludes nothing when
 * there is no light behind the object.
 */
describe('the dark theme', () => {
  const dark = (name: string) => token(name, darkBlockStart);

  it('keeps body and secondary text readable on the card they are drawn on', () => {
    for (const name of ['ink-900', 'ink-800', 'ink-700', 'ink-600']) {
      expect(
        contrast(dark(name), dark('surface')),
        `--${name} on --surface (dark)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the two hint tiers readable as well, which is where the ramp used to collapse', () => {
    // --ink-500 was #a49fc6 and --ink-400 was #a29bc6: two points of red apart, so hint text and
    // secondary text were drawn in the same colour whatever the markup asked for.
    for (const name of ['ink-500', 'ink-400']) {
      expect(
        contrast(dark(name), dark('surface')),
        `--${name} on --surface (dark)`
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(dark('ink-500')).not.toBe(dark('ink-400'));
  });

  it('reads on the sunken well and the raised strip too, not only on the card', () => {
    for (const ground of ['canvas', 'surface-sunken', 'surface-muted']) {
      expect(
        contrast(dark('ink-700'), dark(ground)),
        `--ink-700 on --${ground} (dark)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('separates each ground from the one it sits on, so elevation is visible without a shadow', () => {
    /*
     * Measured in sRGB steps rather than in contrast ratio. A WCAG ratio is the right tool for text
     * and the wrong one here: at this end of the scale it compresses so hard that #0f0e18 and
     * #23222f -- plainly two different greys on any screen -- come out at 1.22, which says nothing
     * about whether a person can see the edge between them.
     *
     * The ladder runs page, well, card, raised strip, hover. Each rung has to be a real step; the
     * old four were #131126, #161331, #1b1834 and #201d3d, three points of green apart at the
     * widest, which is why a card did not sit on the page.
     */
    const green = (name: string) => parseInt(dark(name).slice(3, 5), 16);
    const ladder = ['canvas', 'surface-sunken', 'surface', 'surface-muted'].map(green);
    for (const [index, rung] of ladder.slice(1).entries()) {
      expect(rung - ladder[index]!, `step ${index} of the dark ground ladder`).toBeGreaterThanOrEqual(5);
    }
    // And the page is the darkest thing on it, the navigation darker still.
    expect(green('nav-surface')).toBeLessThan(ladder[0]!);
  });

  it('draws its greys close to neutral, so a school that picked ocean does not get a violet app', () => {
    for (const name of ['canvas', 'surface', 'surface-muted', 'surface-sunken']) {
      const hex = dark(name);
      const [red, green, blue] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
      // The old grounds ran to 22 points of blue over red. A trace of cool cast is wanted; a hue is
      // not, because the brand ramp is the only thing on the page that should be strongly coloured.
      expect(blue! - red!, `--${name} blue over red`).toBeLessThanOrEqual(16);
      expect(Math.abs(red! - green!), `--${name} red against green`).toBeLessThanOrEqual(6);
    }
  });
});
