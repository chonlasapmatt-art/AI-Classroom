// Every dialog in the product behaves like one.
//
// Six screens had built their own: a div with `role="dialog"` and a backdrop, and none of a
// dialog's actual behaviour. Tab walked straight out of them into the page underneath, which was
// still covered by a backdrop swallowing every click — so a keyboard user landed in a form they
// could not see and could not click out of, which reads as the application having frozen. Escape
// did nothing. Focus never came back to whatever opened them. One of the six was the confirmation
// for deleting a classroom.
//
// The shared Modal has all four, and it is the only thing in the product that opens one now.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

async function openWorkForm() {
  enablePreviewMode();
  render(<MemoryRouter initialEntries={['/assignments']}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: '+ สร้างงานใหม่' }));
  return screen.findByRole('dialog');
}

describe('dialogs', () => {
  it('are opened through the shared component and nowhere else', () => {
    const root = resolve(fileURLToPath(import.meta.url), '../../../src');
    const offenders = sourceFiles(root)
      .filter((file) => readFileSync(file, 'utf8').includes('className="modal-backdrop"'))
      .map((file) => file.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it('close on Escape, wherever the key was pressed', async () => {
    await openWorkForm();
    // Fired at the window, because that is where the key lands when focus is still on the button
    // that opened the dialog — the case every hand-built one missed.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keep Tab inside themselves', async () => {
    const dialog = await openWorkForm();
    // No `offsetParent` filter here: jsdom performs no layout, so it reports null for every node.
    // The component applies that filter to skip genuinely hidden controls in a browser; the
    // property under test is the wrap, which is measurable either way.
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )];
    expect(focusable.length).toBeGreaterThan(1);

    focusable[focusable.length - 1]!.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // Wrapped round rather than out into the page behind a backdrop that is still catching clicks.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    focusable[0]!.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('give focus back to whatever opened them', async () => {
    enablePreviewMode();
    render(<MemoryRouter initialEntries={['/assignments']}><App /></MemoryRouter>);
    const opener = await screen.findByRole('button', { name: '+ สร้างงานใหม่' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');

    fireEvent.keyDown(window, { key: 'Escape' });
    // Otherwise a keyboard user resumes at the top of the document, having lost their place.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('freeze the page underneath, and let go afterwards', async () => {
    const dialog = await openWorkForm();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });
});
