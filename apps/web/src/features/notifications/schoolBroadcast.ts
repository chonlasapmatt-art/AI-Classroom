import type { Setting } from '../../domain/types';

/**
 * The one notice the whole school sees at once.
 *
 * Every other message in the product is addressed: an announcement belongs to a class, a
 * notification to a person, an alert to whoever can act on it. This is the exception, and it exists
 * because the exception keeps happening — the administrator reads something in the notification log
 * that everybody needs to know in the next five minutes, and there is no shape in the product that
 * says it to everybody at once. So they tell one class, or they tell nobody.
 *
 * It lives in `settings` rather than in a table of its own, and that is the whole design. Settings
 * are school-scoped, already carried by sync, readable by every active member of the school and
 * writable only by an administrator — which is exactly the audience and exactly the authority this
 * needs, enforced by the database rather than by the screens that happen to render it.
 *
 * A notice is an interruption, not a state. It shows itself in the middle of the screen, holds the
 * reader for ten seconds and takes itself down; what survives is the entry in the log, which is
 * where an administrator goes to see what the school has been told.
 */
export const SCHOOL_BROADCAST_KEY = 'school_broadcast';

/** The record of everything that has been announced, newest first. */
export const SCHOOL_BROADCAST_LOG_KEY = 'school_broadcast_log';

/** How long a notice holds the screen before taking itself down. */
export const BROADCAST_VISIBLE_MS = 10_000;

/**
 * How late a device may arrive and still be interrupted by a notice.
 *
 * A notice that takes itself down after ten seconds is about the next few minutes, so showing one
 * from yesterday to a tablet that has just woken up is an interruption about nothing. Past the
 * window the notice is still readable in the log; it simply stops jumping in front of people.
 */
export const BROADCAST_LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** The log keeps a working history, not an archive: enough to answer "what did we say today?". */
export const BROADCAST_LOG_LIMIT = 40;

export type BroadcastTone = 'info' | 'warning' | 'danger';

export interface SchoolBroadcast {
  /** Identity of this notice, so a dismissal, a log entry and a live delivery name the same thing. */
  id: string;
  title: string;
  body: string;
  tone: BroadcastTone;
  /**
   * When this notice was raised. It is also what decides whether a device that arrives late is
   * still interrupted, and — with the id — what a dismissal is recorded against, so replacing the
   * text brings the notice back to somebody who had already closed the last one.
   */
  raisedAt: string;
  raisedBy: string;
}

const tones: BroadcastTone[] = ['info', 'warning', 'danger'];

function toneOf(value: unknown): BroadcastTone {
  return tones.includes(value as BroadcastTone) ? value as BroadcastTone : 'info';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * One stored notice, or `null` when the value is not one.
 *
 * The id falls back to the timestamp because notices raised before ids existed are still in the
 * settings row and in the log, and they identify themselves perfectly well by when they were said.
 */
export function broadcastFrom(stored: unknown): SchoolBroadcast | null {
  if (!stored || typeof stored !== 'object') return null;
  const value = stored as Record<string, unknown>;
  const title = text(value.title);
  if (title === '') return null;
  const raisedAt = text(value.raisedAt);
  return {
    id: text(value.id) || raisedAt,
    title,
    body: text(value.body),
    tone: toneOf(value.tone),
    raisedAt,
    raisedBy: text(value.raisedBy)
  };
}

/**
 * The notice currently being broadcast, or `null` when there is none.
 *
 * A cleared broadcast is stored as an empty title rather than deleted, because the row carries the
 * history of who raised the last one and when it was taken down.
 */
export function schoolBroadcastFrom(settings: Setting[]): SchoolBroadcast | null {
  return broadcastFrom(settings.find((item) => item.key === SCHOOL_BROADCAST_KEY)?.valueJson);
}

/** Everything the school has been told, newest first, ignoring entries that no longer parse. */
export function broadcastLogFrom(settings: Setting[]): SchoolBroadcast[] {
  const stored = settings.find((item) => item.key === SCHOOL_BROADCAST_LOG_KEY)?.valueJson;
  const entries = stored && Array.isArray(stored.entries) ? stored.entries : [];
  return entries
    .map((entry) => broadcastFrom(entry))
    .filter((entry): entry is SchoolBroadcast => entry !== null)
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

/**
 * The log with one more notice in it.
 *
 * Two devices raising a notice at the same moment each write the log they can see, and the later
 * write wins — the settings row is one value, not a stream. Keeping the merge here at least means
 * the loser's own notice is never the one dropped, and the notice itself still reached every screen
 * live regardless of what the log ended up holding.
 */
export function withBroadcastLogged(
  existing: SchoolBroadcast[], entry: SchoolBroadcast, limit = BROADCAST_LOG_LIMIT
): SchoolBroadcast[] {
  return [entry, ...existing.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
    .slice(0, limit);
}

/** The log without one entry, for an administrator taking back something said by mistake. */
export function withBroadcastRemoved(existing: SchoolBroadcast[], id: string): SchoolBroadcast[] {
  return existing.filter((item) => item.id !== id);
}

/**
 * Whether a notice should still interrupt a person, rather than only be readable in the log.
 *
 * A notice with no timestamp at all is treated as too old to interrupt: it came from a version that
 * did not record one, which means it is not from the last few minutes.
 */
export function broadcastIsLive(broadcast: SchoolBroadcast, now = Date.now()): boolean {
  const raised = Date.parse(broadcast.raisedAt);
  if (!Number.isFinite(raised)) return false;
  return raised <= now + 60_000 && now - raised < BROADCAST_LIVE_WINDOW_MS;
}

export const broadcastToneLabels: Record<BroadcastTone, string> = {
  info: 'ข่าวสาร',
  warning: 'ต้องระวัง',
  danger: 'ระบบมีปัญหา'
};
