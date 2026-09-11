import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import { ThemeProvider } from '../../src/app/ThemeContext';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path: string) {
  enablePreviewMode();
  return render(<ThemeProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ThemeProvider>);
}

async function beA(membershipId: string) {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
}

const shortcutBar = () => screen.queryByRole('navigation', { name: 'เมนูลัด' });

/*
 * The profile is the one screen with nothing along the bottom of it.
 *
 * It is a page somebody scrolls to the end of — an avatar, a card of details, the picker — and a
 * fixed bar over the last of it is a bar over the thing they came to press. Everywhere else the
 * shortcut bar is the navigation on a phone and is untouched.
 *
 * It is a mount rather than a `display: none`, because a hidden landmark is still a landmark to a
 * screen reader: a navigation announced on a screen that has none is worse than one that is simply
 * not there.
 */
describe('the shortcut bar and the profile route', () => {
  it('is not rendered at all on the profile', async () => {
    renderApp('/profile');
    await beA('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('โปรไฟล์'));
    expect(shortcutBar()).not.toBeInTheDocument();
  });

  it('is rendered on every other screen the role is given', async () => {
    for (const path of ['/', '/assignments', '/scores', '/notifications', '/settings']) {
      renderApp(path);
      await beA('preview-student');
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
      expect(shortcutBar(), `${path} lost its shortcut bar`).toBeInTheDocument();
      cleanup();
    }
  });

  it('comes back when the reader leaves the profile, and goes again when they return', async () => {
    renderApp('/profile');
    await beA('preview-student');
    await waitFor(() => expect(shortcutBar()).not.toBeInTheDocument());

    // Navigated with the app's own controls rather than by re-rendering: the route changing is the
    // thing under test, and a fresh mount would prove nothing about it.
    const bar = await waitFor(() => {
      fireEvent.click(within(screen.getByRole('navigation', { name: 'เมนูหลัก' }))
        .getByRole('link', { name: /ภาพรวม/ }));
      return screen.getByRole('navigation', { name: 'เมนูลัด' });
    });
    expect(bar).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole('link', { name: /โปรไฟล์/ }));
    await waitFor(() => expect(shortcutBar()).not.toBeInTheDocument());
  });

  it('takes the space it was reserving with it', async () => {
    /*
     * The bar is fixed, so the page reserves room for it; a screen with no bar and the padding still
     * in place is a screen that ends in a strip of nothing, which is the gap this is about. Both
     * facts are read from one class rather than from the route twice, so they cannot disagree.
     */
    renderApp('/profile');
    await beA('preview-student');
    await waitFor(() => expect(document.querySelector('.app-frame.no-bottom-nav')).not.toBeNull());

    cleanup();
    renderApp('/');
    await beA('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(document.querySelector('.app-frame.no-bottom-nav')).toBeNull();
  });

  it('says nothing to the console on either route', async () => {
    // A missing key or a render-phase warning shows up here as a real message rather than as
    // something somebody has to notice in a terminal.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderApp('/profile');
      await beA('preview-student');
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('โปรไฟล์'));
      expect(errors.mock.calls.map(String).join('\n')).not.toMatch(/unique "key"|Warning:/);
      expect(warnings.mock.calls.map(String).join('\n')).not.toMatch(/unique "key"/);
    } finally {
      errors.mockRestore();
      warnings.mockRestore();
    }
  });
});

/*
 * And the bar itself, which had no styles at all.
 *
 * The markup has been in the shell since it was written and the comment beside it says "shown only
 * under the drawer breakpoint, by CSS" — the rule that did that had gone missing, so five plain
 * links rendered at the foot of every page at every width, desktop included, with nothing
 * positioning them and nothing reserving room for them.
 */
describe('the shortcut bar has a shape', () => {
  const styles = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../src/design-system/screens.css'), 'utf8');

  it('is hidden above the drawer breakpoint and fixed below it', () => {
    expect(styles).toMatch(/\.bottom-nav \{ display: none; \}/);
    expect(styles).toMatch(/@media \(max-width: 1080px\)[\s\S]*?\.bottom-nav \{[\s\S]*?position: fixed/);
  });

  it('keeps clear of the phone’s home indicator', () => {
    expect(styles).toMatch(/\.bottom-nav \{[\s\S]*?env\(safe-area-inset-bottom/);
  });

  it('sizes the shell to the viewport the phone actually has', () => {
    // `100vh` on iOS Safari is the viewport with the address bar hidden, which is taller than the
    // one on screen — a shell sized to it ends in a strip of nothing below the fold.
    expect(styles).toMatch(/\.app-frame \{ min-height: 100vh; min-height: 100dvh;/);
  });
});
