// Per-device conveniences: the chosen membership, a collapsed sidebar group, a picked avatar.
//
// None of it is data. Every value here is a preference this browser happens to remember, and the app
// has to work without any of it — a private window, a browser with site data blocked, a school
// laptop with a locked-down profile. In those browsers `localStorage` does not return null, it
// throws on the property access itself, which is why a bare `localStorage.getItem(...)` in a React
// component body is not a small risk: it throws during render and takes the whole screen with it.
//
// So every read and write goes through here, and a browser that refuses to remember anything simply
// gets the defaults.

/** The stored value, or null when there is none and when this browser refuses to store anything. */
export function recall(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/** Remembers a value if the browser allows it. Never throws; forgetting is an acceptable outcome. */
export function remember(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* remembering is a convenience */ }
}

/** Forgets a value. Used at sign-out, where failing to forget must not block signing out. */
export function forget(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* nothing was remembered anyway */ }
}

/**
 * A remembered JSON object, or the fallback.
 *
 * The fallback covers three separate failures on purpose — nothing stored, storage refused, and a
 * value that is no longer the shape this version of the app writes. A half-upgraded record is not
 * worth a crash for a remembered sidebar state.
 */
export function recallRecord<T>(key: string, fallback: T): T {
  const stored = recall(key);
  if (stored === null) return fallback;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as T : fallback;
  } catch { return fallback; }
}

/** Remembers a JSON object. */
export function rememberRecord(key: string, value: unknown): void {
  try { remember(key, JSON.stringify(value)); } catch { /* unserialisable state is not worth storing */ }
}
