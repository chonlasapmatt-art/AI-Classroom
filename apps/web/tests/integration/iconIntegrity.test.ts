import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Icons are drawings from one set, not characters.
 *
 * A character stands in for an icon at whatever size, weight and colour the device's font decides,
 * and on a Thai system font several of the ones this product used arrived as an empty box. Emoji are
 * worse again: full colour on one device, monochrome on the next, missing on the third — including
 * on the badge screen, whose whole job is to make a child feel recognised.
 */

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(sourceRoot).map((path) => ({ path, source: readFileSync(path, 'utf8') }));

/**
 * Symbols and emoji. Ordinary punctuation and the arrows inside sentences are left alone.
 *
 * Written as escapes rather than the characters themselves: a variation selector inside a character
 * class is a combining mark sitting next to a range, which reads to a linter — and to a reader — as
 * a mistake, so it is matched on its own.
 */
const pictograph = /[←-⇿─-➿⬀-⯿☀-⛿]|️|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;

describe('icons are drawings, not characters', () => {
  it('never renders a symbol as the whole content of an element', () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/>\s*([^\s<>{}]{1,3})\s*</g)) {
        if (pictograph.test(match[1]!)) offenders.push(`${path.split('src')[1]}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every badge a drawing from the icon set', () => {
    const catalogue = files.find((file) => file.path.endsWith('achievementCatalog.ts'))!.source;
    expect(pictograph.test(catalogue)).toBe(false);
    for (const match of catalogue.matchAll(/icon: '([^']+)'/g)) {
      expect(match[1]).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('draws something visible when a name has no icon behind it', () => {
    const icon = files.find((file) => file.path.endsWith(join('ui', 'Icon.tsx')))!.source;
    // The old failure mode was an empty <svg>: right size, right place, nothing in it.
    expect(icon).not.toContain('__html: icons[name]');
    expect(icon).toContain('UNKNOWN_ICON');
    expect(icon).toContain('ui-icon-unknown');
  });
});
