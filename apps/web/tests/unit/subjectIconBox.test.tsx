import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubjectIcon } from '../../src/features/subjects/SubjectIcon';
import { subjectIconKeys, subjectIconLabels } from '../../src/data/subjectCatalog';

afterEach(cleanup);

/*
 * The icons sit in square frames that centre their contents — a 46px medallion, a 42px card tile, a
 * 13px calendar chip — so an icon whose drawing is not centred on the grid sits visibly off-centre
 * in every one of them. Several of the old set were: the mask's ribbons ran to x=3.6 and x=21.4,
 * the note's tail to y=19.6, and the heart hung a fifth of its height below the middle.
 *
 * The exact rendered box of all 22 was measured in a real browser (getBoundingClientRect per shape,
 * transforms and strokes included, read back into the 24-unit grid): every one now lies inside
 * x,y ∈ [4.0, 20.0] with its centre within 0.6 of (12, 12).
 *
 * jsdom has no geometry, so what is pinned here is what can be checked without it: the shapes whose
 * box is written down literally, and the palette. That covers the two ways the set drifted before —
 * a shape drawn outside the agreed box, and a colour that does not follow the subject.
 */
const BOX = { min: 3.8, max: 20.2 };

function shapesOf(key: string) {
  const { container } = render(<SubjectIcon iconKey={key} size={24} />);
  const svg = container.querySelector('svg')!;
  return { svg, shapes: [...svg.querySelectorAll('rect,circle,ellipse')] };
}

describe('the subject icon set', () => {
  it('draws every subject on the same 24-unit grid', () => {
    for (const key of subjectIconKeys) {
      const { svg } = shapesOf(key);
      expect(svg.getAttribute('viewBox'), key).toBe('0 0 24 24');
      expect(svg.querySelectorAll('path,rect,circle,ellipse').length, key).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('keeps every rectangle, circle and ellipse inside the box', () => {
    for (const key of subjectIconKeys) {
      const { shapes } = shapesOf(key);
      for (const shape of shapes) {
        const n = (name: string) => Number(shape.getAttribute(name) ?? 0);
        // A rotated shape is measured from its centre, so the radius bounds it on both axes.
        const rotated = (shape.getAttribute('transform') ?? '').includes('rotate');
        let box: [number, number, number, number];
        if (shape.tagName === 'rect') {
          const reach = rotated ? Math.max(n('width'), n('height')) / 2 : 0;
          const cx = n('x') + n('width') / 2, cy = n('y') + n('height') / 2;
          box = rotated
            ? [cx - reach, cy - reach, cx + reach, cy + reach]
            : [n('x'), n('y'), n('x') + n('width'), n('y') + n('height')];
        } else {
          const rx = shape.tagName === 'circle' ? n('r') : Math.max(n('rx'), n('ry'));
          const stroke = shape.getAttribute('stroke') && shape.getAttribute('stroke') !== 'none'
            ? Number(shape.getAttribute('stroke-width') ?? 0) / 2 : 0;
          box = [n('cx') - rx - stroke, n('cy') - rx - stroke, n('cx') + rx + stroke, n('cy') + rx + stroke];
        }
        const where = `${key} <${shape.tagName}> ${box.map((v) => v.toFixed(2)).join(',')}`;
        expect(Math.min(box[0], box[1]), where).toBeGreaterThanOrEqual(BOX.min);
        expect(Math.max(box[2], box[3]), where).toBeLessThanOrEqual(BOX.max);
      }
      cleanup();
    }
  });

  it('paints from the subject colour and the two product accents, and nothing else', () => {
    // `currentColor` is the subject's own colour, set by the tile above the icon; the soft tone is
    // mixed against the page so it lightens on a light theme and darkens on a dark one. A stray hex
    // here would be one subject drawn in another subject's colour.
    const allowed = new Set(['currentColor', '#f7c948', '#31d6c4', 'none']);
    for (const key of subjectIconKeys) {
      const { svg } = shapesOf(key);
      for (const shape of svg.querySelectorAll('path,rect,circle,ellipse,g')) {
        for (const attribute of ['fill', 'stroke']) {
          const value = shape.getAttribute(attribute);
          if (!value) continue;
          const ok = allowed.has(value) || value.startsWith('color-mix(') || value.startsWith('var(');
          expect(ok, `${key} ${attribute}="${value}"`).toBe(true);
        }
      }
      cleanup();
    }
  });

  it('names the drawing for a reader who asks for one, and hides it when it does not', () => {
    const withTitle = render(<SubjectIcon iconKey="science" size={24} title={subjectIconLabels.science} />);
    expect(withTitle.container.querySelector('svg')?.getAttribute('aria-hidden')).toBeNull();
    expect(withTitle.container.querySelector('title')?.textContent).toBe('วิทยาศาสตร์');
    cleanup();
    // Beside a visible subject name — which is everywhere it normally appears — it is decoration.
    const plain = render(<SubjectIcon iconKey="science" size={24} />);
    expect(plain.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to the label rather than to nothing', () => {
    const unknown = render(<SubjectIcon iconKey="not-a-real-key" size={24} />).container.innerHTML;
    cleanup();
    const fallback = render(<SubjectIcon iconKey="default" size={24} />).container.innerHTML;
    expect(unknown).toBe(fallback);
  });

  it('draws a different picture for every key', () => {
    /*
     * A registry with two keys drawing the same thing is a registry with a key missing, and the
     * `default:` label the switch used to end with hid exactly that: a key added to the list with no
     * case of its own silently rendered the fallback and looked like a subject nobody had styled.
     * The label is gone and the function is annotated, so the compiler catches an absent case; this
     * catches the other half — a case that was copied and never changed.
     */
    const seen = new Map<string, string>();
    for (const key of subjectIconKeys) {
      const markup = render(<SubjectIcon iconKey={key} size={24} />).container.innerHTML;
      const twin = seen.get(markup);
      expect(twin, `${key} draws the same picture as ${twin}`).toBeUndefined();
      seen.set(markup, key);
      cleanup();
    }
  });

  it('reads the subject name when nothing is stored, and never over a stored choice', () => {
    // Six of nine subjects in the live school were saved as `default` by a form with no picker, so
    // the name is the last chance to draw the right thing. It is only ever the last chance: ทั่วไป
    // chosen deliberately is a decision, and a decision outranks a guess.
    const guessed = render(<SubjectIcon subject="วิทยาศาสตร์" size={24} />).container.innerHTML;
    cleanup();
    const flask = render(<SubjectIcon iconKey="science" size={24} />).container.innerHTML;
    expect(guessed).toBe(flask);
    cleanup();

    const stored = render(<SubjectIcon iconKey="default" subject="วิทยาศาสตร์" size={24} />).container.innerHTML;
    cleanup();
    const fallback = render(<SubjectIcon iconKey="default" size={24} />).container.innerHTML;
    expect(stored).toBe(fallback);
  });
});
