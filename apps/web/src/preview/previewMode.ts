/**
 * Development Preview Mode gate.
 *
 * Preview Mode is only reachable when the bundle is a development build, or when the operator has
 * explicitly opted in with VITE_ENABLE_PREVIEW_MODE=true. A production build without that flag
 * cannot enter preview at all: the entry point is not rendered and the stored flag is ignored.
 */
export const isPreviewModeAvailable: boolean =
  import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_PREVIEW_MODE === 'true';

const STORAGE_KEY = 'smart-classroom-preview-mode';

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function isPreviewActive(): boolean {
  if (!isPreviewModeAvailable) return false;
  try { return storage()?.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
}

export function enablePreviewMode(): void {
  if (!isPreviewModeAvailable) return;
  try { storage()?.setItem(STORAGE_KEY, 'on'); } catch { /* preview flag is best-effort */ }
}

export function disablePreviewMode(): void {
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* preview flag is best-effort */ }
}
