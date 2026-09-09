import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

/*
 * jsdom ships no `matchMedia`, and screens that answer to width now ask for one.
 *
 * The stub answers `(min-width: Npx)` and `(max-width: Npx)` from `window.innerWidth`, so a test
 * that wants the wide shape of a screen says so by setting the width — which is the same sentence a
 * reader of the test would write anyway — instead of by mocking a hook.
 */
const listeners = new Set<() => void>();

window.matchMedia = ((query: string) => {
  const evaluate = () => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    if (min) return window.innerWidth >= Number(min[1]);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    if (max) return window.innerWidth <= Number(max[1]);
    return false;
  };
  const list = {
    get matches() { return evaluate(); },
    media: query,
    onchange: null,
    addEventListener: (_: string, handler: () => void) => { listeners.add(handler); },
    removeEventListener: (_: string, handler: () => void) => { listeners.delete(handler); },
    addListener: (handler: () => void) => { listeners.add(handler); },
    removeListener: (handler: () => void) => { listeners.delete(handler); },
    dispatchEvent: () => false
  };
  return list as unknown as MediaQueryList;
}) as typeof window.matchMedia;

/** Sets the viewport width and tells everything watching, the way a real resize would. */
export function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  for (const handler of listeners) handler();
}
