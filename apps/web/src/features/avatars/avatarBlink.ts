/**
 * One blink schedule for the whole page.
 *
 * A leaderboard draws forty avatars, a classroom board thirty, and each of them wants to blink on
 * its own irregular rhythm — which, done the obvious way, is forty `setTimeout` chains firing forty
 * React renders at forty different moments. That is the shape of thing that makes a mid-range
 * tablet stutter, and none of it is visible: nobody can tell whether two avatars blinked a hundred
 * milliseconds apart.
 *
 * So there is one timer. It picks a next-blink moment between three and five seconds away, wakes
 * once, tells every subscriber to close their eyes, wakes again 140 ms later to open them, and
 * sleeps. Subscribers are a Set; the timer stops entirely when the last one leaves, so a page with
 * no avatars on it runs nothing at all.
 *
 * The jitter is per-tick rather than per-avatar, which means every avatar on screen blinks together.
 * That is deliberate and it reads better than it sounds: a room of faces blinking in unison looks
 * like a moment passing, while forty independent blinks look like forty things going wrong.
 */
type Listener = (closed: boolean) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Closed for this long. Two frames at 8-bit speed, which is as long as an eye may be shut. */
const CLOSED_MS = 140;
const MIN_GAP_MS = 3000;
const MAX_GAP_MS = 5000;

function announce(closed: boolean) {
  for (const listener of listeners) listener(closed);
}

function schedule() {
  if (listeners.size === 0) { timer = null; return; }
  const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
  timer = setTimeout(() => {
    announce(true);
    timer = setTimeout(() => {
      announce(false);
      schedule();
    }, CLOSED_MS);
  }, gap);
}

/**
 * Subscribe to the blink. Returns the unsubscribe, which stops the shared timer when it was the
 * last subscriber — an interval left running behind a closed page is a battery, not a feature.
 */
export function onBlink(listener: Listener): () => void {
  listeners.add(listener);
  if (timer === null) schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** For tests: the schedule, without waiting three seconds for it. */
export const blinkTiming = { CLOSED_MS, MIN_GAP_MS, MAX_GAP_MS };

export function blinkListenerCount(): number {
  return listeners.size;
}
