// What the live quiz channel is allowed to carry.
//
// The room used to poll every two seconds. Realtime replaces that, and the tempting way to do it is
// a Postgres-changes subscription on `quiz_rounds` and `quiz_answers` — which would mean granting a
// subscription to tables that are revoked from `authenticated` precisely because their rows carry
// the answer key. A subscription is a read; granting one grants the read.
//
// So the channel carries a nudge and no rows, and every client re-fetches through the same
// security-definer RPC it already used. These assertions keep it that way, and keep the polling
// floor underneath it — Realtime drops, phones sleep, tabs get backgrounded, and a classroom that
// stops updating because a socket died is worse than one that updates a few seconds late.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const live = read('apps/web/src/features/quiz/quizLive.ts');
const board = read('apps/web/src/features/quiz/QuizChallengePage.tsx');
const panel = read('apps/web/src/features/quiz/StudentQuizPanel.tsx');

describe('the live quiz channel', () => {
  it('is a broadcast channel and never a table subscription', () => {
    // `postgres_changes` is the only way to subscribe to a table, and subscribing to any quiz
    // table would be a grant on rows holding answer keys. Asserted on the mechanism rather than
    // on table names, which a comment explaining this very choice would trip.
    expect(live).not.toContain('postgres_changes');
    const listeners = [...live.matchAll(/\.on\(\s*'([a-z_]+)'/g)].map((match) => match[1]);
    expect(listeners.length).toBeGreaterThan(0);
    expect(listeners.every((event) => event === 'broadcast')).toBe(true);
  });

  it('carries a nudge rather than any of the round', () => {
    // The whole payload is which kind of change happened. No question, no choice, no answer, no
    // score, no student.
    expect(live).toContain("payload: { kind }");
    expect(live).not.toMatch(/payload: \{[^}]*(question|answer|score|student)/i);
  });

  it('gives each round its own channel so two classrooms never hear each other', () => {
    expect(live).toContain('`quiz-room:${sessionId}`');
  });

  it('never lets a failed nudge break the change that already landed', () => {
    const nudge = live.slice(live.indexOf('export function nudgeRoom'));
    expect(nudge).toContain('try {');
    expect(nudge).toContain('catch {');
    // The board is nudged after the command succeeded, not before.
    const command = board.slice(board.indexOf('async function command'));
    expect(command.indexOf('await controlQuiz')).toBeLessThan(command.indexOf('nudgeRoom(sessionId)'));
  });

  it('keeps a polling floor under both surfaces', () => {
    expect(board).toContain('window.setInterval(() => void tick(), 10_000)');
    expect(panel).toContain('window.setInterval(() => void poll(), 10_000)');
    // And both still subscribe, or the interval would be the only mechanism again.
    expect(board).toContain('subscribeToRoom(sessionId');
    expect(panel).toContain('subscribeToRoom(sessionId');
  });

  it('re-reads through the authorised call rather than trusting what arrived', () => {
    // The nudge says "ask again". What a student may see is still decided by the RPC, in the
    // database, exactly as it was when this was a poll.
    expect(board).toContain('subscribeToRoom(sessionId, () => void tick())');
    expect(panel).toContain('void poll();');
    expect(panel).toContain('quizView(sessionId)');
  });

  it('does not make a student re-read because another student answered', () => {
    expect(panel).toContain("if (kind === 'answers') return;");
  });

  it('survives having no cloud client at all', () => {
    // Preview mode has no Supabase client and no classroom to be live with. Callers should not have
    // to know which of those they are in.
    const subscribe = live.slice(live.indexOf('export function subscribeToRoom'), live.indexOf('export function nudgeRoom'));
    expect(subscribe).toContain('catch {');
    expect(subscribe).toContain('return () => undefined;');
  });
});
