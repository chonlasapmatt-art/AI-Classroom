import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './ThemeContext';

/**
 * Whether this visit gets the moving version of the interface.
 *
 * Two switches, either of which is a no: the operating system's own reduced-motion setting, and the
 * app's motion toggle in the theme panel. The system one is watched rather than read once, because
 * somebody who turns it on mid-visit — often because something on screen is making them ill — should
 * not have to reload the page to be listened to.
 */
export function useAnimationAllowed() {
  const { motion } = useTheme();
  const [systemReduced, setSystemReduced] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return motion === 'full' && !systemReduced;
}

/**
 * Carries one screen into the next instead of replacing it.
 *
 * Going from Home to a sign-in form is a step further into one place, not a jump to a different
 * one, and a hard swap makes a person re-find everything: where the product's mark went, whether
 * this is still the same site. The browser's own view transition answers that by animating between
 * the two rendered states, so the mark visibly travels to its new position rather than vanishing
 * from one corner and appearing in another.
 *
 * Every reason to skip it is checked before the click is intercepted, and skipping means doing
 * nothing at all: the Link underneath navigates the way it always has. That covers a browser
 * without the API, somebody who asked for less motion, and — the one that would actually anger a
 * person — a middle-click or a ctrl-click, which are asking for a new tab, not for this page to
 * animate anywhere.
 */
type Direction = 'forward' | 'back';

export function usePageTransition(allowed: boolean) {
  const navigate = useNavigate();

  return function transitionTo(event: MouseEvent<HTMLAnchorElement>, to: string, direction: Direction = 'forward') {
    if (!allowed || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof document.startViewTransition !== 'function') return;

    event.preventDefault();
    const root = document.documentElement;
    root.dataset.nav = direction;
    /*
     * flushSync is the whole trick: the browser snapshots the page the moment this callback
     * returns, so the route has to have finished rendering by then. Left to React's own scheduling
     * the navigation would commit after the snapshot, and the transition would animate the old
     * screen into a copy of itself.
     */
    const transition = document.startViewTransition(() => {
      flushSync(() => { navigate(to); });
    });
    /*
     * A skipped transition is not a failure and must not be reported as one.
     *
     * The browser skips one whenever a second starts on top of it or the tab stops being visible
     * partway through, and it says so by rejecting these promises. The navigation still happened —
     * only the animation was dropped — so both are answered here: `ready` because a rejection with
     * no handler is an uncaught error in everybody's console, and `finished` with the same function
     * on both arms because the direction flag has to come off either way, or the next journey
     * inherits the last one's direction.
     */
    const settle = () => { delete root.dataset.nav; };
    transition.ready.catch(() => {});
    transition.finished.then(settle, settle);
  };
}
