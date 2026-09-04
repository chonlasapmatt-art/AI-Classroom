// One place that says a thing was saved.
//
// `ToastProvider` shipped with the component set and was never mounted, so `useToast` threw and
// twenty screens each grew their own `<div className="toast">`: twenty stacking contexts, none of
// which dismissed itself, and every one of them at a z-index below the dialog backdrop — so a
// message raised from inside a dialog was painted underneath it and never seen. Which corner a
// message appeared in, and whether it went away on its own, depended on which screen you were on.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderAt(path: string) {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('the confirmation a screen raises', () => {
  /** Marking the whole register is the confirmation reachable without a server behind it. */
  async function raiseOne() {
    fireEvent.click(await screen.findByRole('button', { name: 'มาเรียนทั้งหมด' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกมาเรียนทั้งหมด' }));
  }

  it('lands in the one shared surface, wherever it was raised from', async () => {
    renderAt('/attendance');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    // Nothing is announced before anything happens: an empty live region is not a message.
    expect(document.querySelectorAll('.ui-toast')).toHaveLength(0);

    await raiseOne();
    await waitFor(() => expect(document.querySelectorAll('.ui-toast')).toHaveLength(1));
    // One container for the whole app rather than one per screen, and it outlives the dialog the
    // message was raised from — which the old per-screen surfaces, painted under the backdrop, did
    // not.
    expect(document.querySelectorAll('.ui-toast-container')).toHaveLength(1);
  });

  it('is announced politely and can be dismissed by hand', async () => {
    renderAt('/attendance');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    await raiseOne();
    await waitFor(() => expect(document.querySelector('.ui-toast')).not.toBeNull());

    // A message is a status, not an alert: somebody halfway through a text field should learn that
    // the save landed without being interrupted to hear it.
    expect(document.querySelector('.ui-toast')).toHaveAttribute('role', 'status');
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    await waitFor(() => expect(document.querySelectorAll('.ui-toast')).toHaveLength(0));
  });

  it('is not raised twice by two screens rendering their own surface', () => {
    // The property the sweep established, held where it can be broken: a screen that grows its own
    // toast again reintroduces the corner that changes per page and the z-index below the dialog.
    const root = resolve(process.cwd(), 'src');
    const offenders = sourceFiles(root)
      .filter((file) => readFileSync(file, 'utf8').includes('<div className="toast"'))
      .map((file) => file.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});

describe('a message that has had its time', () => {
  it('leaves the document rather than fading and staying in it', async () => {
    renderAt('/attendance');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'มาเรียนทั้งหมด' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกมาเรียนทั้งหมด' }));
    await waitFor(() => expect(document.querySelectorAll('.ui-toast')).toHaveLength(1));

    // Fading it was all the provider ever did. Every message a session raised stayed in the
    // document — invisible, but still a role="status" node in the live region, and a container that
    // grew for as long as the tab was open.
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    await waitFor(() => expect(document.querySelectorAll('.ui-toast')).toHaveLength(0), { timeout: 3000 });
    expect(document.querySelector('.ui-toast-container')?.children).toHaveLength(0);
  });
});
