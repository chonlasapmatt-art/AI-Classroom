// Getting the notice on every screen in the school in the time it takes to read it.
//
// The notice is stored in `settings`, and settings reach other devices through the ordinary sync —
// which runs on a minute's timer. A minute is the right cadence for a timetable change and the
// wrong one for "the fire drill is now": by the time it arrived, the ten seconds the notice holds
// the screen for would be spent on something that already happened.
//
// So the notice travels twice. It is written to the settings row, which is the record and what a
// device that was asleep will find; and it is sent down a Realtime channel, which is what puts it
// in front of the people who are looking at the app right now. The channel carries the notice
// itself rather than a nudge, because unlike the quiz there is nothing secret in it — every member
// of the school is the intended audience, and the payload is what the settings row would have said.
//
// Realtime is the optimisation and never the source of truth: it drops connections, a phone sleeps,
// a tab is backgrounded. Sync underneath is the floor, and a notice that misses the channel simply
// arrives with the next pull instead of instantly.

import { requireSupabase } from '../../services/supabase';
import { broadcastFrom, type SchoolBroadcast } from './schoolBroadcast';

function channelName(schoolId: string): string {
  return `school-broadcast:${schoolId}`;
}

/**
 * Listens for a notice raised anywhere in the school. Returns a function that stops listening.
 *
 * Safe to call with no cloud client: preview mode has no server to hear from, and a caller should
 * not have to know which of those it is in.
 */
export function subscribeToSchoolBroadcast(
  schoolId: string, onBroadcast: (broadcast: SchoolBroadcast) => void
): () => void {
  let channel: ReturnType<ReturnType<typeof requireSupabase>['channel']> | null = null;
  try {
    channel = requireSupabase().channel(channelName(schoolId), { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'notice' }, (message) => {
        const broadcast = broadcastFrom((message.payload as { broadcast?: unknown } | undefined)?.broadcast);
        if (broadcast) onBroadcast(broadcast);
      })
      .subscribe();
  } catch {
    return () => undefined;
  }

  return () => {
    if (!channel) return;
    try { void requireSupabase().removeChannel(channel); } catch { /* the client is already gone */ }
  };
}

/**
 * Says the notice out loud. Best effort on purpose.
 *
 * The administrator's write to `settings` is the part that had to succeed, and it already has by
 * the time this is called. A failure here costs the school one sync interval, so it never throws
 * back into a composer that has just announced something successfully.
 */
export function publishSchoolBroadcast(schoolId: string, broadcast: SchoolBroadcast): void {
  try {
    void requireSupabase().channel(channelName(schoolId)).send({
      type: 'broadcast', event: 'notice', payload: { broadcast }
    });
  } catch {
    // Ignored deliberately. See above.
  }
}
