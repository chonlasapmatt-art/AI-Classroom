import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether this panel gets an exit, asked of the document rather than of a provider.
 *
 * `useAnimationAllowed` is the same question and would have been the obvious thing to call, but it
 * reads the theme context — and a dialog is a leaf component that any screen may raise, including
 * from a test that renders it on its own. Making a dialog throw without a ThemeProvider, in order
 * to decide something purely cosmetic, is a provider requirement spreading through the app for no
 * benefit to anybody looking at it.
 *
 * The theme writes its motion setting onto the root element and the stylesheet keys off the same
 * attribute, so reading it here means the script and the stylesheet cannot disagree — which two
 * independent readings of the same state eventually would. Absent means "full", which is what
 * `applyTheme` means by removing it.
 */
function exitAllowed(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'reduced') return false;
  return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/**
 * Letting a panel leave the way it arrived.
 *
 * A dialog in this app opens on a keyframe and then, when it closes, is simply removed from the
 * tree — so it fades up over a fifth of a second and disappears between two frames. That asymmetry
 * is the thing people mean by an interface feeling abrupt: the eye is given a path in and nothing to
 * follow out, so the page appears to jump rather than to change. The toast has always had both
 * halves; the modal and the drawer never did, because nothing kept them mounted long enough.
 *
 * This does exactly that and nothing more. `dismiss()` marks the panel as closing, which is what the
 * stylesheet animates, and calls `onClose` when the animation is over — so the caller's state, the
 * focus restoration and the scroll lock all still run, just a beat later.
 *
 * ── Why the animation event rather than a timer ──
 * `animationend` fires when the animation the stylesheet actually ran has finished, which keeps the
 * duration in the stylesheet where the rest of the timing lives instead of being written twice and
 * drifting apart. The timer behind it is a backstop for the cases where that event never comes: a
 * panel unmounted by its parent mid-exit, or a tab backgrounded partway through.
 *
 * ── Reduced motion is not a shorter animation ──
 * When motion is off — the system setting or the app's own switch — there is no exit to wait for,
 * so `dismiss()` closes immediately. Waiting 160ms to do nothing visible is a delay somebody who
 * asked for less motion did not ask for.
 */
export function useDismissAnimation(onClose: () => void, exitMs = 200) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    onClose();
  }, [onClose]);

  const dismiss = useCallback(() => {
    if (done.current) return;
    // Asked at the moment of dismissal rather than at render, so somebody who changes the setting
    // while a dialog is open is answered by the next thing they do rather than by the next mount.
    if (!exitAllowed()) { finish(); return; }
    setClosing(true);
    // The backstop: a little past the exit so a normally-finishing animation reports itself first.
    timer.current = window.setTimeout(finish, exitMs + 60);
  }, [exitMs, finish]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  /*
   * Only the panel's own exit counts.
   *
   * A dialog holds other animated things -- a spinner, a chip arriving, a field's message -- and any
   * of them finishing would otherwise close the dialog out from under the person using it.
   */
  const onAnimationEnd = useCallback((event: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
    if (!closing) return;
    if (event.target !== event.currentTarget) return;
    finish();
  }, [closing, finish]);

  return { closing, dismiss, onAnimationEnd };
}
