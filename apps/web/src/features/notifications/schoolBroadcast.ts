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
 */
export const SCHOOL_BROADCAST_KEY = 'school_broadcast';

export type BroadcastTone = 'info' | 'warning' | 'danger';

export interface SchoolBroadcast {
  title: string;
  body: string;
  tone: BroadcastTone;
  /**
   * When this notice was raised. It is also the identity a dismissal is recorded against, so
   * replacing the text brings the notice back to somebody who had already closed the last one —
   * without it, the first urgent notice of the day would silence every one after it.
   */
  raisedAt: string;
  raisedBy: string;
}

const tones: BroadcastTone[] = ['info', 'warning', 'danger'];

function toneOf(value: unknown): BroadcastTone {
  return tones.includes(value as BroadcastTone) ? value as BroadcastTone : 'info';
}

/**
 * The notice currently being broadcast, or `null` when there is none.
 *
 * A cleared broadcast is stored as an empty title rather than deleted, because the row carries the
 * history of who raised the last one and when it was taken down.
 */
export function schoolBroadcastFrom(settings: Setting[]): SchoolBroadcast | null {
  const stored = settings.find((item) => item.key === SCHOOL_BROADCAST_KEY)?.valueJson;
  if (!stored) return null;
  const title = typeof stored.title === 'string' ? stored.title.trim() : '';
  if (title === '') return null;
  return {
    title,
    body: typeof stored.body === 'string' ? stored.body.trim() : '',
    tone: toneOf(stored.tone),
    raisedAt: typeof stored.raisedAt === 'string' ? stored.raisedAt : '',
    raisedBy: typeof stored.raisedBy === 'string' ? stored.raisedBy : ''
  };
}

export const broadcastToneLabels: Record<BroadcastTone, string> = {
  info: 'ข่าวสาร',
  warning: 'ต้องระวัง',
  danger: 'ระบบมีปัญหา'
};
