import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { cleanup(); vi.resetModules(); vi.doUnmock('../../src/preview/previewMode'); });

/*
 * `/preview` on a deployment that does not carry the demo data.
 *
 * The route is answered above every provider in `AppRoot`, before a session exists — so the screen
 * it falls back to may not read one. It used to render `ForbiddenPage`, which names the signed-in
 * role, and in production that threw `useSession must be used inside SessionProvider` and rendered
 * nothing: a public URL serving a white page, found by loading the deployed site rather than by any
 * test.
 *
 * Nobody is forbidden here either. A school deployment simply has nothing at this address.
 */
async function renderEntry(available: boolean) {
  vi.doMock('../../src/preview/previewMode', () => ({
    isPreviewModeAvailable: available,
    isPreviewActive: () => false,
    enablePreviewMode: () => {},
    disablePreviewMode: () => {}
  }));
  const { PreviewEntryPage } = await import('../../src/preview/PreviewEntryPage');
  return render(
    <MemoryRouter initialEntries={['/preview']}>
      <Routes>
        <Route path="/preview" element={<PreviewEntryPage onEnter={() => {}} />} />
        <Route path="/welcome" element={<h1>หน้าแรก</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the preview entrance', () => {
  it('sends somebody to the front page when the deployment carries no demo data', async () => {
    await renderEntry(false);
    expect(screen.getByRole('heading', { name: 'หน้าแรก' })).toBeTruthy();
  });

  it('renders nothing that needs a signed-in session', async () => {
    // The actual production failure: the fallback screen read the session, and there is none this
    // far up the tree. A throw here is the regression.
    await expect(renderEntry(false)).resolves.toBeTruthy();
  });

  it('offers the way in where the demo data exists', async () => {
    await renderEntry(true);
    expect(screen.getByRole('button', { name: 'เข้าสู่โหมดตัวอย่าง' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'โหมดตัวอย่าง' })).toBeTruthy();
  });
});
