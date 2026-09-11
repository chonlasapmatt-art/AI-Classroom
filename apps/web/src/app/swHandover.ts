/**
 * What happens when a new service worker takes charge while somebody is using the page.
 *
 * ── What this used to do, and why it no longer does it ──
 * It reloaded. Immediately, on `controllerchange`, without asking. The reasoning was sound as far as
 * it went: a running page holds the JavaScript of the build it loaded and asks for the rest lazily —
 * a route nobody has visited, a chunk nobody has needed yet — and those files are named by content
 * hash, so after a deployment the old names are gone and the new worker's precache has been pruned
 * of them. A page claimed mid-session keeps working until it needs one more file, and then cannot
 * load it.
 *
 * But the cure was worse than the disease it was insuring against. The reload arrived while somebody
 * was marking a register, and it arrived for every device in the school at once, a few minutes after
 * a deployment, with no warning and nothing to press. "The app restarts by itself" is the fault
 * being fixed here; the update card and its two buttons are the whole point of `registerType:
 * 'prompt'`, and a reload that happens anyway makes them decoration.
 *
 * ── What replaces it ──
 * Nothing, until the page actually breaks. The handover is now silent: the new worker takes over,
 * the running page keeps its own JavaScript, and `UpdatePrompt` raises the card. Somebody presses
 * "อัปเดตตอนนี้" and the reload happens then, or presses "ภายหลัง" and is asked again in a couple of
 * hours.
 *
 * The one case that cannot wait is the one the old code was really about: the page asks for a chunk
 * that no longer exists. Vite fires `vite:preloadError` for exactly that, and at that point the page
 * is already broken — reloading is not an interruption, it is the recovery. So the reload is kept,
 * narrowed from "a new build exists" to "this page just failed to load part of itself".
 *
 * Three guards, because a reload that can loop is worse than the fault it recovers from:
 *   * a first install is not a handover — `controllerchange` fires the first time any worker takes
 *     control of a page that had none, and there is nothing to recover from there;
 *   * only after a handover. A preload failure with no new build behind it is an ordinary network
 *     error, and reloading will not fetch a file the server does not have either;
 *   * once per page, and once per session. `sessionStorage` carries the flag across the reload, so a
 *     build that is genuinely missing a chunk cannot put the tab in a refresh loop.
 *
 * This lives outside React and runs before the first render, because a page that has already failed
 * to load a chunk may have no React left to run it.
 */

const RECOVERED_KEY = 'smart-classroom-chunk-recovered';

export function reloadOnWorkerHandover(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /*
   * `hadController` has to be a running total, not a snapshot.
   *
   * On a first visit the page loads uncontrolled, the worker installs, and `clientsClaim` makes it
   * take charge — which fires `controllerchange` once, for a page that has nothing to recover from.
   * Reading the flag once at startup and never again meant that first claim was skipped correctly
   * and every real handover afterwards was skipped too, because the variable still said this page
   * had never had a controller.
   */
  let hadController = Boolean(navigator.serviceWorker.controller);
  let tookOver = false;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    // Noted, and nothing more. The banner asks; this file does not.
    tookOver = true;
  });

  const recover = () => {
    if (!tookOver || reloading) return;
    let alreadyTried = false;
    try { alreadyTried = window.sessionStorage.getItem(RECOVERED_KEY) === '1'; } catch { /* private window */ }
    if (alreadyTried) return;
    try { window.sessionStorage.setItem(RECOVERED_KEY, '1'); } catch { /* best effort only */ }
    reloading = true;
    window.location.reload();
  };

  // Vite's own signal for "a lazily imported chunk could not be fetched", which is precisely the
  // failure a deployment causes and nothing else fires it.
  window.addEventListener('vite:preloadError', recover);
}

/**
 * Clears the one-reload-per-session guard.
 *
 * Called after a deliberate update, because the reload that just happened was asked for: a device
 * that recovers from a missing chunk in the morning should still be able to recover from a different
 * one in the afternoon.
 */
export function clearChunkRecovery(): void {
  try { window.sessionStorage.removeItem(RECOVERED_KEY); } catch { /* best effort only */ }
}
