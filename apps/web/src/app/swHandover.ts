/**
 * When a new service worker takes charge, the page must reload — immediately, before it can break.
 *
 * The previous release let a freshly installed worker activate and claim pages that were already
 * open, so that a device no longer needed somebody to press a button to reach a new version. That
 * part was right and is kept. What it missed is what happens to the page it claimed.
 *
 * A running page holds the JavaScript of the build it loaded, and asks for the rest of that build
 * lazily — a route it has not visited, a chunk it has not needed yet. Those files are named by
 * content hash, and after a deployment the old names are gone: the host answers 404, and the new
 * worker's precache has been pruned of them too. So a page claimed mid-session keeps running until
 * the moment it needs one more file, and then fails to load it. That is not a stale page; that is a
 * broken app, and it broke while somebody was using it.
 *
 * There is no version of "keep the old page running" that survives this. The old files do not exist
 * anywhere any more. The only safe response to a handover is to start again on the build that is
 * now in charge, which costs a reload and is over in well under a second — the app is local-first,
 * so the data is in IndexedDB and the outbox with it.
 *
 * Two guards:
 *   * a first install is not a handover. `controllerchange` fires the first time any worker takes
 *     control of a page that had none, where there is nothing to reload for.
 *   * once is enough. A flag stops a reload loop if anything else on the page also reacts to the
 *     same event.
 *
 * This lives outside React and runs before the first render, because a page that has already failed
 * to load a chunk may have no React left to run it.
 */
export function reloadOnWorkerHandover(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /*
   * `hadController` has to be a running total, not a snapshot.
   *
   * On a first visit the page loads uncontrolled, the worker installs, and `clientsClaim` makes it
   * take charge — which fires `controllerchange` once, for a page that has nothing to reload for.
   * Reading the flag once at startup and never again meant that first claim was skipped correctly
   * and every real handover afterwards was skipped too, because the variable still said this page
   * had never had a controller. The result looked exactly like the bug it was meant to fix: a new
   * build claimed the page, and the page carried on with the old one until it asked for a file that
   * was no longer there.
   */
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
