import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UpdateMark } from '../../src/app/UpdateMark';

afterEach(cleanup);

/*
 * The emblem on the update prompt.
 *
 * Two things about it are load-bearing rather than decorative taste. The first is that the patch and
 * the version update are different drawings and not the same drawing in two colours: the card is
 * read on a projector, in a corridor, by somebody colour-blind, and colour on its own is not allowed
 * to be the only thing carrying which kind of update this is. The second is that every fill comes
 * from `--update-accent` — the app ships eight brand themes and two modes, and a second hardcoded
 * palette in here would be sixteen chances to look wrong.
 */
describe('the update emblem', () => {
  const markup = (kind: 'patch' | 'feature' | 'unknown') =>
    render(<UpdateMark kind={kind} />).container.innerHTML;

  it('draws a different shape for a patch than for a new version', () => {
    const patch = markup('patch');
    cleanup();
    const feature = markup('feature');
    expect(patch).not.toBe(feature);
    // The plaster is set at an angle; the arrow is not.
    expect(patch).toContain('rotate(-38 20 20)');
    expect(feature).not.toContain('rotate(');
  });

  it('treats an unrecognised update as a version update rather than drawing nothing', () => {
    // `unknown` is what the prompt falls back to when `version.json` cannot be read, and it still
    // has to appear: knowing less about an update is never a reason to hide it.
    expect(markup('unknown')).toContain('<svg');
  });

  it('paints only from the card accent, so every brand theme carries it', () => {
    for (const kind of ['patch', 'feature'] as const) {
      const html = markup(kind);
      expect(html, kind).toContain('var(--update-accent)');
      // No literal colours: a hex here would survive one theme and break the other seven.
      expect(html, kind).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(html, kind).not.toMatch(/\b(?:rgb|hsl)a?\(/i);
      cleanup();
    }
  });

  it('stays out of the accessibility tree, because the heading beside it says the same thing', () => {
    const { container } = render(<UpdateMark kind="feature" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
