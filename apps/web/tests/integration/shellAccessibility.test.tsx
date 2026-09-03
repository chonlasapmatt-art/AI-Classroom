// The shell's promises to somebody who is not using a mouse on a desktop.
//
// Each of these was a real hole rather than a hypothetical one. The drawer's scrim existed in the
// stylesheet and was never rendered, so on a phone the menu opened with no way back. The dialog
// listened for Escape on an element that only receives keys once something inside already has
// focus, so a dialog opened by a click ignored it. And the top bar named neither the school nor the
// page, which is exactly the width where the sidebar that did name them is off screen.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path = '/') {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

/* `enablePreviewMode()` already puts the app inside the shell; this only waits for it to mount. */
async function enterPreview() {
  await screen.findByRole('navigation', { name: 'เมนูหลัก' });
}

describe('the navigation drawer', () => {
  it('puts a scrim over the page and closes when it is tapped', async () => {
    renderApp();
    await enterPreview();

    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    const scrim = document.querySelector('.sidebar-overlay');
    expect(scrim).not.toBeNull();

    fireEvent.click(scrim!);
    // A drawer with no way out except the button underneath the scrim is a trap on a phone.
    await waitFor(() => expect(document.querySelector('.sidebar-overlay')).toBeNull());
  });

  it('closes on Escape from anywhere, not only from inside itself', async () => {
    renderApp();
    await enterPreview();

    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    expect(document.querySelector('.sidebar-overlay')).not.toBeNull();

    // Fired at the window, because that is where the key lands when focus is still on the button
    // that opened the drawer.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.sidebar-overlay')).toBeNull());
  });

  it('freezes the page underneath while it is open, and lets go afterwards', async () => {
    renderApp();
    await enterPreview();

    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });

  it('announces whether it is open, and swaps the button to a close', async () => {
    renderApp();
    await enterPreview();

    const button = screen.getByRole('button', { name: 'เปิดเมนู' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'ปิดเมนู' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('the top bar', () => {
  it('names the school and the page at every width', async () => {
    renderApp();
    await enterPreview();

    const bar = document.querySelector('.topbar');
    expect(bar).not.toBeNull();
    // The sidebar is off screen on a phone; this strip is not, so it is the one that has to answer
    // "which school" and "which page".
    expect(bar!.querySelector('.topbar-school')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(bar!.querySelector('.topbar-crumbs strong')?.textContent).toContain('ภาพรวม');
  });

  it('follows the reader to another page', async () => {
    renderApp();
    await enterPreview();

    const menu = within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    fireEvent.click(menu.getByRole('link', { name: /ประกาศรวม/ }));
    await waitFor(() =>
      expect(document.querySelector('.topbar-crumbs strong')?.textContent).toContain('ประกาศรวม')
    );
  });

  it('states the role rather than leaving it to be inferred from the buttons on screen', async () => {
    renderApp();
    await enterPreview();
    expect(document.querySelector('.topbar-role')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

describe('the phone shortcut bar', () => {
  it('is a second navigation with its own name, so the two are told apart', async () => {
    renderApp();
    await enterPreview();

    const quick = screen.getByRole('navigation', { name: 'เมนูลัด' });
    expect(quick).not.toBe(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
  });

  it('offers only destinations the full menu also offers', async () => {
    renderApp();
    await enterPreview();

    const menuLinks = new Set(
      [...screen.getByRole('navigation', { name: 'เมนูหลัก' }).querySelectorAll('a')]
        .map((link) => link.getAttribute('href'))
    );
    const quickLinks = [...screen.getByRole('navigation', { name: 'เมนูลัด' }).querySelectorAll('a')]
      .map((link) => link.getAttribute('href'));

    expect(quickLinks.length).toBeGreaterThan(0);
    // A shortcut to somewhere the menu does not go would be a route only reachable on a phone.
    for (const href of quickLinks) expect(menuLinks).toContain(href);
    // Five is the ceiling: a sixth target on a 360px screen is narrower than a thumb.
    expect(quickLinks.length).toBeLessThanOrEqual(5);
  });
});
