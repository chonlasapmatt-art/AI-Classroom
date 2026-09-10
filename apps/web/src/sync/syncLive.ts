// Telling the other devices, now, that the server has something new.
//
// Sync is a minute's timer. That is the right cadence for a device that has been asleep and the
// wrong one for a room full of people working together: a teacher enters a mark and the child
// watching the same screen waits up to a minute to see it, a second teacher of the same room longer
// still, and the administrator's dashboard is a minute behind the school it is meant to describe.
//
// So a device that has just landed a write says so on a Realtime channel for the school, and every
// other device that hears it pulls immediately. The message carries no data — only "there is
// something to pull" — which keeps the channel free of anything a listener is not already allowed
// to read: the pull itself goes through RLS exactly as it always did, so a student who hears about a
// mark in another room simply pulls nothing.
//
// Realtime is the optimisation and never the source of truth. Connections drop, phones sleep, tabs
// are discarded. The minute timer stays underneath as the floor, so a missed message costs one
// interval rather than the update.

import { requireSupabase } from '../services/supabase';

function channelName(schoolId: string): string {
  return `school-sync:${schoolId}`;
}

/**
 * Says "the server has changed" to the school. Best effort on purpose: the write it follows has
 * already succeeded, and a failure here costs one sync interval, so it never throws back into a
 * screen that has just saved something.
 */
export function announceSchoolWrite(schoolId: string, deviceId: string): void {
  try {
    void requireSupabase().channel(channelName(schoolId)).send({
      type: 'broadcast', event: 'changed', payload: { deviceId, at: Date.now() }
    });
  } catch {
    // Ignored deliberately. See above.
  }
}

/**
 * Listens for a write landed by any other device in the school. Returns a function that stops
 * listening.
 *
 * The device's own announcements are dropped: it already pulled as part of the sync that sent them.
 * Safe to call with no cloud client — preview mode has no server to hear from, and a caller should
 * not have to know which of those it is in.
 */
export function subscribeToSchoolWrites(
  schoolId: string, deviceId: string, onRemoteWrite: () => void
): () => void {
  let channel: ReturnType<ReturnType<typeof requireSupabase>['channel']> | null = null;
  try {
    channel = requireSupabase().channel(channelName(schoolId), { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'changed' }, (message) => {
        const sender = (message.payload as { deviceId?: unknown } | undefined)?.deviceId;
        if (typeof sender === 'string' && sender === deviceId) return;
        onRemoteWrite();
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
