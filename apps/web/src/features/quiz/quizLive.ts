// Telling a classroom that the board moved, without telling it anything else.
//
// The quiz room polled every two seconds. That is correct for one classroom and wrong for a hundred:
// thirty devices in a room asking a question nobody has answered differently, all day, is a load
// that grows with enrolment and a two-second lag that everybody in the room can see.
//
// The obvious fix — subscribing to Postgres changes on `quiz_rounds` and `quiz_answers` — is not
// available here, and the reason is a rule worth keeping. Realtime authorises a table subscription
// the way any other read is authorised, and every `quiz_*` table is revoked from `authenticated`
// outright, precisely because those rows carry the answer key. Granting a subscription would be
// granting the read, which is exactly what the revoke exists to prevent.
//
// So the channel carries no rows. It carries a nudge: "the board changed, ask again". Every client
// that hears it re-fetches through the same security-definer RPC it already used, which decides for
// itself what that particular student may see — and a student's payload still arrives without the
// answer key, because that decision is made in the same place it always was.
//
// The nudge is an optimisation, never the source of truth. Realtime drops connections, a phone
// sleeps, a tab is backgrounded. Every caller keeps a slow poll underneath as the floor, and the
// nudge only makes it feel immediate.

import { requireSupabase } from '../../services/supabase';

/** Broadcast channels are named per round, so two classrooms never hear each other. */
function channelName(sessionId: string): string {
  return `quiz-room:${sessionId}`;
}

export type QuizNudge = 'board' | 'answers';

/**
 * Listens for changes to one round.
 *
 * Returns a function that stops listening. Safe to call when the cloud is not configured — preview
 * mode has no Supabase client and no classroom to be live with, and callers should not have to know
 * which of those they are in.
 */
export function subscribeToRoom(sessionId: string, onNudge: (kind: QuizNudge) => void): () => void {
  let channel: ReturnType<ReturnType<typeof requireSupabase>['channel']> | null = null;
  try {
    channel = requireSupabase().channel(channelName(sessionId), {
      config: { broadcast: { self: false } }
    });
    channel
      .on('broadcast', { event: 'nudge' }, (message) => {
        const kind = (message.payload as { kind?: unknown } | undefined)?.kind;
        onNudge(kind === 'answers' ? 'answers' : 'board');
      })
      .subscribe();
  } catch {
    // No cloud client: nothing to subscribe to, and the caller's poll is already the floor.
    return () => undefined;
  }

  return () => {
    if (!channel) return;
    void requireSupabase().removeChannel(channel);
  };
}

/**
 * Says the board moved. Best effort on purpose.
 *
 * A nudge that fails to send costs a room one polling interval and nothing else, so this never
 * throws into a caller that has just successfully changed the round — the change already landed in
 * the database, which is the part that had to succeed.
 */
export function nudgeRoom(sessionId: string, kind: QuizNudge = 'board'): void {
  try {
    void requireSupabase().channel(channelName(sessionId)).send({
      type: 'broadcast', event: 'nudge', payload: { kind }
    });
  } catch {
    // Ignored deliberately. See above.
  }
}
