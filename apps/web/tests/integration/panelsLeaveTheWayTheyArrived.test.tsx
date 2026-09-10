import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../src/ui/components';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const components = read('apps/web/src/design-system/components.css');
const global = read('apps/web/src/design-system/global.css');

afterEach(() => { cleanup(); document.documentElement.removeAttribute('data-motion'); vi.useRealTimers(); });

/**
 * A panel leaving the way it arrived.
 *
 * A dialog here opened on a keyframe and was then removed from the tree, so it faded up over a
 * fifth of a second and disappeared between two frames. That asymmetry is what people mean when
 * they call an interface abrupt: the eye is given a path in and nothing to follow out, so the page
 * appears to jump rather than to change.
 *
 * These exist because the first version of the fix shipped broken in a way nothing would have
 * caught. The class was assembled with `.replace(/s+/g, ' ')` — a backslash lost in transit — so
 * `is-closing` was rewritten to `i -clo ing` and no exit ever ran, while every dialog still opened,
 * closed and passed its own tests. Only a browser showed it.
 */
describe('a dialog on its way out', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });

  function open(onClose: () => void) {
    return render(<Modal title="ยืนยัน" onClose={onClose}><p>เนื้อหา</p></Modal>);
  }

  it('marks itself as closing rather than vanishing', () => {
    const onClose = vi.fn();
    const { container } = open(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));

    // Still on the page, and saying so in the one class the stylesheet animates.
    expect(container.querySelector('.ui-modal.is-closing')).not.toBeNull();
    expect(container.querySelector('.ui-modal-backdrop.is-closing')).not.toBeNull();
    // The caller has not been told yet, so its state, its focus restoration and its scroll lock
    // all still happen — a beat later.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tells the caller once the exit is over', () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    act(() => { vi.advanceTimersByTime(400); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the panel\'s own exit and not on some chip finishing inside it', () => {
    const onClose = vi.fn();
    const { container } = open(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));

    // A spinner, a field message, an arriving badge: a dialog is full of other animations, and any
    // of them finishing must not close it out from under the person using it.
    fireEvent.animationEnd(screen.getByText('เนื้อหา'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.animationEnd(container.querySelector('.ui-modal')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes every route out through the same exit', () => {
    for (const dismiss of [
      () => fireEvent.click(screen.getByRole('button', { name: 'ปิด' })),
      () => fireEvent.keyDown(window, { key: 'Escape' }),
      () => fireEvent.mouseDown(document.querySelector('.ui-modal-backdrop')!)
    ]) {
      const onClose = vi.fn();
      const { container } = open(onClose);
      dismiss();
      expect(container.querySelector('.ui-modal.is-closing')).not.toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('closes at once for somebody who asked for less motion', () => {
    // Waiting 160ms to do nothing visible is a delay they did not ask for. The setting is read from
    // the root element, which is where the theme writes it and where the stylesheet reads it, so
    // the script and the stylesheet cannot disagree about it.
    document.documentElement.dataset.motion = 'reduced';
    const onClose = vi.fn();
    const { container } = open(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.is-closing')).toBeNull();
  });

  it('will not tell the caller twice, however many times it is dismissed', () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(600); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * The timing, as a contract rather than as taste.
 *
 * Each of these was measured wrong in a browser before it was written down here.
 */
describe('how the interface moves', () => {
  /** The milliseconds an animation or transition shorthand asks for. */
  const ms = (declaration: string) => Number(/(\d+)ms/.exec(declaration)?.[1] ?? NaN);

  /**
   * The body of one rule, read by counting braces from the start of its selector.
   *
   * A `[^}]*` match would stop at the first closing brace it met, which inside a rule carrying a
   * comment or a nested block is not the end of the rule. The selector is matched at the start of a
   * line so that `.ui-modal` does not find `.ui-modal-backdrop` first.
   */
  const rule = (css: string, selector: string) => {
    const start = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm').exec(css);
    if (!start) return '';
    let depth = 0;
    for (let index = css.indexOf('{', start.index); index < css.length; index += 1) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') {
        depth -= 1;
        if (depth === 0) return css.slice(start.index, index + 1);
      }
    }
    return '';
  };

  it('lets every covering panel leave, not only the toast', () => {
    for (const selector of ['.ui-modal.is-closing', '.ui-modal-backdrop.is-closing', '.ui-drawer.is-closing']) {
      expect(rule(components, selector), `${selector} has no exit`).toContain('animation:');
    }
  });

  it('leaves faster than it arrives', () => {
    // An entrance is shown to somebody who has not seen the thing yet; an exit is shown to somebody
    // who has already decided to be rid of it and must get out of the way.
    const pairs: Array<[string, string]> = [
      ['.ui-modal', '.ui-modal.is-closing'],
      ['.ui-drawer', '.ui-drawer.is-closing']
    ];
    for (const [enter, exit] of pairs) {
      const entering = ms(/animation:[^;]+;/.exec(rule(components, enter))?.[0] ?? '');
      const leaving = ms(/animation:[^;]+;/.exec(rule(components, exit))?.[0] ?? '');
      expect(entering, `${enter} duration`).toBeGreaterThan(0);
      expect(leaving, `${exit} duration`).toBeGreaterThan(0);
      expect(leaving, `${exit} is not quicker than its entrance`).toBeLessThan(entering);
    }
  });

  it('keeps a dialog inside the time a dialog belongs in', () => {
    // It ran for 420ms on a curve that overshoots, so every dialog arrived with a small bounce and
    // took the better part of half a second to do it.
    const declaration = /animation:[^;]+;/.exec(rule(components, '.ui-modal'))?.[0] ?? '';
    expect(ms(declaration)).toBeLessThanOrEqual(300);
    // The declaration rather than the rule: the comment above it names the curve it used to use.
    expect(declaration).not.toContain('--ease-spring');
  });

  it('makes nothing on its way out accept a click', () => {
    // A panel leaving still occupies the page, and a click landing on a button inside it in that
    // time does something nobody asked for.
    for (const selector of ['.ui-modal.is-closing', '.ui-modal-backdrop.is-closing', '.ui-drawer.is-closing']) {
      expect(rule(components, selector), selector).toContain('pointer-events: none');
    }
  });

  it('never animates a blur across a whole page of content', () => {
    // `page-enter` animated filter: blur(2px) to zero on every direct child of every screen. A blur
    // is not composited: the browser rasterises the element and re-blurs it on every frame, for
    // every band, on every navigation. It was the most expensive thing in the interface.
    const enter = /@keyframes page-enter \{[^}]*\}[^}]*\}/.exec(global)?.[0]
      ?? /@keyframes page-enter [\s\S]*?\n\n/.exec(global)?.[0] ?? '';
    expect(enter).not.toContain('blur');
    expect(global).toContain('@keyframes page-enter');
  });

  it('moves a travelling selection on a symmetrical curve', () => {
    // A decelerate-only curve put the segmented pill 95% of the way across in its first 60ms, so it
    // appeared to jump and then creep. Measured in a browser: 662 → 782 → 912 → 937px.
    expect(rule(components, '.ui-segmented-pill')).toContain('var(--ease-move)');
    expect(read('apps/web/src/design-system/tokens.css')).toContain('--ease-move:cubic-bezier(.4,0,.2,1)');
  });
});
