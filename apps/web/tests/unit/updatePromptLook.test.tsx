import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpdateMark } from '../../src/app/UpdateMark';
import { BrandMark } from '../../src/ui/BrandMark';

/*
 * The card that offers an update, and the mark the product signs itself with.
 *
 * Both were reported by eye — "the icon is not in the middle of its frame" and "nothing moves when
 * it appears" — and both had a cause a screenshot could not show. The emblem was off-centre because
 * `.update-banner span` is a class and an element, which outranks the bare class the frame was
 * written as, so `display: grid` never applied and the drawing sat in a corner of its own tile.
 */

function sheet(name: string): string {
  const path = [`apps/web/src/design-system/${name}`, `src/design-system/${name}`]
    .map((candidate) => resolve(candidate))
    .find((candidate) => existsSync(candidate));
  expect(path, name).toBeTruthy();
  return readFileSync(path!, 'utf8');
}

const screens = sheet('screens.css');

describe('the update card', () => {
  it('centres the emblem with a rule that outranks the one that broke it', () => {
    /*
     * The bare `.update-mark` is one class; `.update-banner span` is a class and an element and
     * therefore wins. Any future rewrite that drops the qualifier puts the emblem back in the
     * corner, which is the regression this line exists to catch.
     */
    expect(screens).toContain('.update-banner .update-mark {');
    const rule = /\.update-banner \.update-mark \{([^}]*)\}/.exec(screens)?.[1] ?? '';
    expect(rule).toContain('display: grid');
    expect(rule).toContain('place-items: center');
  });

  it('assembles itself rather than appearing whole', () => {
    // The card, the accent band, the emblem, the lines and the buttons each arrive, in that order,
    // and the whole sequence is over inside half a second.
    for (const animation of ['update-banner-in', 'update-band-draw', 'update-mark-in', 'update-line-in']) {
      expect(screens, animation).toContain(`@keyframes ${animation}`);
    }
    const delays = [...screens.matchAll(/\.update-copy > \*:nth-child\([^)]*\) \{ animation-delay: ([\d.]+)s/g)]
      .map((match) => Number(match[1]));
    expect(delays.length, 'the lines are not staggered').toBeGreaterThan(3);
    expect(Math.max(...delays), 'the last line waits too long').toBeLessThanOrEqual(0.3);
  });

  it('moves the emblem itself, not only the tile it sits in', () => {
    // An arrow that lifts through its plate is the whole sentence "something arrived", said in the
    // half second before anybody has read the heading.
    const markup = renderToStaticMarkup(<UpdateMark kind="feature" size={40} />);
    expect(markup).toContain('data-update-part="lift"');
    expect((markup.match(/data-update-part="spark"/g) ?? []).length).toBe(2);
    expect(screens).toContain('@keyframes update-arrow-lift');
    expect(screens).toContain('@keyframes update-spark-in');
  });

  it('draws a patch as its own shape, not the same arrow in another colour', () => {
    // The two kinds are told apart in greyscale, which is what the eyebrow above them says in words.
    const patch = renderToStaticMarkup(<UpdateMark kind="patch" size={40} />);
    const feature = renderToStaticMarkup(<UpdateMark kind="feature" size={40} />);
    expect(patch).not.toBe(feature);
    expect(patch).toContain('rotate(-38 20 20)');
  });
});

describe('the product mark', () => {
  it('keeps every shape inside the corner radius that clips it', () => {
    /*
     * The mark is almost always in a rounded tile, and a radius eats the corners of the box: drawn
     * to the edges of the viewBox the tassel touched the right side and the star was trimmed at
     * small sizes. Six units of margin on a 64-unit grid is what that costs.
     */
    const markup = renderToStaticMarkup(<BrandMark size={64} />);
    /*
     * Checked on the shapes that actually reach the edges — the board's two far corners, the tassel's
     * bob and the star — rather than on every number in the file. Path data is full of relative
     * offsets and radii that are not coordinates, and a test that treats them as coordinates fails
     * on a curve nobody moved.
     */
    const board = /d="M32 13\.5 ([\d.]+) [\d.]+ 32 36\.1 ([\d.]+) [\d.]+z"/.exec(markup);
    expect(board, 'the board is not where this test thinks it is').toBeTruthy();
    expect(Number(board![1]), 'the board reaches the right edge').toBeLessThanOrEqual(59);
    expect(Number(board![2]), 'the board reaches the left edge').toBeGreaterThanOrEqual(5);

    const bob = /d="M([\d.]+) [\d.]+a3\.8 3\.8 0 1 1 0 7\.6/.exec(markup);
    expect(bob, 'the tassel has no bob').toBeTruthy();
    expect(Number(bob![1]) + 3.8, 'the tassel bob reaches the right edge').toBeLessThanOrEqual(59);

    const star = /d="M([\d.]+) ([\d.]+) /.exec(markup.slice(markup.indexOf('#f7c948') - 400));
    expect(star, 'the star is not where this test thinks it is').toBeTruthy();
    expect(Number(star![1]), 'the star sits too far left').toBeGreaterThanOrEqual(5);
    expect(Number(star![2]), 'the star sits too low').toBeLessThanOrEqual(59);
  });

  it('separates the board from the head under it', () => {
    // Two white shapes touching read as one white blob at 32 pixels, which is what the first drawing
    // did. The head is the same ink at a lower opacity, so it darkens on every brand ground.
    const markup = renderToStaticMarkup(<BrandMark size={64} />);
    expect(markup).toContain('rgba(255,255,255,.62)');
    expect(markup).toContain('#31d6c4');
    expect(markup).toContain('#f7c948');
  });

  it('stays decorative unless it is given a name', () => {
    expect(renderToStaticMarkup(<BrandMark size={44} />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<BrandMark size={44} title="Smart Classroom" />);
    expect(named).toContain('<title>Smart Classroom</title>');
    expect(named).toContain('role="img"');
  });
});
