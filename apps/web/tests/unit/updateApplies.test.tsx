import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clearUpdateSnooze, markUpdateApplied, nextSnoozeMs, readSnoozedUntil, shouldRequestUpdate,
  snoozeRemainingMs, snoozeUpdate, takeUpdateApplied, UPDATE_CHECK_INTERVAL_MS,
  UPDATE_SNOOZE_MAX_MS, UPDATE_SNOOZE_MIN_MS
} from '../../src/app/appUpdate';

/*
 * Two ways the update stopped working, both of them silent.
 *
 * The first: `registration.update()` throws `InvalidStateError` when the worker is still installing,
 * and the app called it as the very first thing on every fresh load. So the one check somebody
 * explicitly asks for — by opening the page — was the one that could not succeed, and because the
 * rejection was never caught it also left the throttle unwritten.
 *
 * The second is in the component and is the one a school actually felt: the update refused to apply
 * while anything sat in the outbox, on the stated grounds of preventing data loss. There is no data
 * loss to prevent — `syncQueue` is a Dexie table in IndexedDB and survives a reload by construction,
 * which is the entire point of a durable queue. What it did instead was make the update unreachable
 * for exactly the devices that need it most: one row stuck pending and "อัปเดตตอนนี้" printed a red
 * line and did nothing, for ever.
 */
const base = {
  online: true, installing: false, force: false,
  lastCheckedAt: null as string | null, now: new Date('2026-09-09T10:00:00Z')
};

describe('when the app asks the server for a newer build', () => {
  it('never asks a worker that is still installing', () => {
    // This is the whole of the first bug: an install in progress is already the newest build, and
    // asking it to update throws rather than returning.
    expect(shouldRequestUpdate({ ...base, installing: true, force: true })).toBe(false);
    expect(shouldRequestUpdate({ ...base, installing: true })).toBe(false);
  });

  it('asks every time the page is opened, throttle or no throttle', () => {
    // Opening the page is somebody asking for the current version. "You asked eleven minutes ago" is
    // an answer to a different question.
    const recent = new Date(base.now.getTime() - 60_000).toISOString();
    expect(shouldRequestUpdate({ ...base, force: true, lastCheckedAt: recent })).toBe(true);
  });

  it('leaves a tab that has been open all day on its schedule', () => {
    const recent = new Date(base.now.getTime() - 60_000).toISOString();
    const stale = new Date(base.now.getTime() - UPDATE_CHECK_INTERVAL_MS - 1000).toISOString();
    expect(shouldRequestUpdate({ ...base, lastCheckedAt: recent })).toBe(false);
    expect(shouldRequestUpdate({ ...base, lastCheckedAt: stale })).toBe(true);
  });

  it('does not ask while offline', () => {
    expect(shouldRequestUpdate({ ...base, online: false, force: true })).toBe(false);
  });

  it('asks when it has never asked before', () => {
    expect(shouldRequestUpdate({ ...base })).toBe(true);
  });
});

/*
 * The third way it stopped working, and this one was loud: it updated itself.
 *
 * The service worker was registered with 'autoUpdate', which reloads the page the moment the new
 * worker takes control. So the card with "อัปเดตตอนนี้" never appeared — there was nothing left to
 * ask — and the panel that reports what changed was wiped a few frames after opening, because the
 * reload landed after the new build had already stamped this device as having seen that version.
 * Shown for no time at all, and then considered read.
 *
 * The worker still activates by itself. That is what keeps a device from being stranded behind one
 * button, and it is not what was wrong: reloading without asking was.
 */
describe('how the service worker is registered', () => {
  const config = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../vite.config.ts'), 'utf8');

  it('hands the new build to the app to announce, rather than reloading the page itself', () => {
    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
  });

  it('still lets the worker take over on its own, so no device is stranded behind one button', () => {
    expect(config).toContain('skipWaiting: true');
    expect(config).toContain('clientsClaim: true');
  });
});

/*
 * What a pressed update leaves behind.
 *
 * The comparison the notice normally uses is one localStorage entry away from being wrong for ever:
 * stamp the version, get torn down before anybody reads the panel, and the device is marked as
 * having read notes it never saw. The flag is the second, deliberate signal, and it is read once.
 */
describe('the flag a pressed update leaves', () => {
  it('reports one update and then stops', () => {
    window.localStorage.clear();
    expect(takeUpdateApplied()).toBe(false);
    markUpdateApplied();
    expect(takeUpdateApplied()).toBe(true);
    expect(takeUpdateApplied()).toBe(false);
  });
});

/*
 * "ภายหลัง", which used to mean "never".
 *
 * Pressing it cleared the flag that said an update was waiting, and nothing brought the banner back
 * until the page was loaded again. A classroom tablet with the app permanently open is never loaded
 * again, so one press left the device on an old build with nothing left to tell it so — the same
 * silence as having no update at all. Postponing is a time now, and the time comes back round.
 */
describe('postponing an update', () => {
  it('comes back between two and three hours later, never sooner and never later', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const ms = nextSnoozeMs(() => roll);
      expect(ms).toBeGreaterThanOrEqual(UPDATE_SNOOZE_MIN_MS);
      expect(ms).toBeLessThanOrEqual(UPDATE_SNOOZE_MAX_MS);
    }
    // Spread across the hour rather than fixed, so a staff room that dismissed the same banner in
    // the same minute is not interrupted again in the same minute.
    expect(nextSnoozeMs(() => 0)).not.toBe(nextSnoozeMs(() => 0.9));
  });

  it('stores when to ask again, and forgets it once asked', () => {
    window.localStorage.clear();
    expect(readSnoozedUntil()).toBeNull();
    const now = Date.parse('2026-09-11T08:00:00Z');
    const until = snoozeUpdate(now, UPDATE_SNOOZE_MIN_MS);
    expect(readSnoozedUntil()).toBe(until);
    expect(Date.parse(until)).toBe(now + UPDATE_SNOOZE_MIN_MS);
    clearUpdateSnooze();
    expect(readSnoozedUntil()).toBeNull();
  });

  it('asks again the moment the postponement is up', () => {
    const now = Date.parse('2026-09-11T08:00:00Z');
    const until = new Date(now + 60_000).toISOString();
    expect(snoozeRemainingMs(until, now)).toBe(60_000);
    expect(snoozeRemainingMs(until, now + 60_000)).toBe(0);
    expect(snoozeRemainingMs(until, now + 60_001)).toBe(0);
  });

  it('treats nothing stored, and anything unreadable, as "ask now"', () => {
    // A private window that refuses storage, or a value written by a build that stored something
    // else, must not be able to silence the prompt.
    expect(snoozeRemainingMs(null)).toBe(0);
    expect(snoozeRemainingMs('พรุ่งนี้')).toBe(0);
  });

  it('cannot be silenced for a decade by a wrong clock', () => {
    /*
     * The stored value is an absolute time. A tablet that lost its battery and came back believing
     * it is 2035 would write one ten years out, and every later load would read a postponement that
     * never expires. Three hours is the longest this is ever allowed to mean.
     */
    const now = Date.parse('2026-09-11T08:00:00Z');
    const absurd = new Date(now + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(snoozeRemainingMs(absurd, now)).toBe(UPDATE_SNOOZE_MAX_MS);
  });
});

/*
 * And the fault this whole change is about: the app restarted by itself.
 *
 * A new worker taking charge used to reload the page on the spot. The reasoning was real — a page
 * claimed mid-session cannot fetch a lazily imported chunk whose name the deployment retired — but
 * the cure arrived while somebody was marking a register, for every device in the school at once,
 * with nothing to press. The card and its two buttons are the point of `registerType: 'prompt'`,
 * and a reload that happens anyway makes them decoration.
 */
describe('what a handover does to a page somebody is using', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../src/app/swHandover.ts'), 'utf8'
  );

  it('does not reload because a new build exists', () => {
    const handler = source.slice(source.indexOf("addEventListener('controllerchange'"));
    const body = handler.slice(0, handler.indexOf('});'));
    expect(body).not.toContain('location.reload');
  });

  it('reloads only when the page has actually failed to load part of itself', () => {
    // `vite:preloadError` is fired for exactly one thing: a lazily imported chunk that could not be
    // fetched. At that point the page is already broken and the reload is the recovery, not an
    // interruption.
    expect(source).toContain("window.addEventListener('vite:preloadError', recover)");
    expect(source).toContain('if (!tookOver || reloading) return;');
  });

  it('recovers once per session, so a genuinely missing chunk cannot loop the tab', () => {
    expect(source).toContain('sessionStorage');
    expect(source).toContain('alreadyTried');
  });
});

/*
 * The banner keeps the one fact it needs to come back.
 */
describe('the update banner', () => {
  const prompt = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../src/app/UpdatePrompt.tsx'), 'utf8'
  );

  it('never throws away the knowledge that an update is waiting', () => {
    // `setNeedRefresh(false)` was how "ภายหลัง" hid the banner, and it deleted the only record that
    // there was anything to come back to.
    expect(prompt).not.toContain('setNeedRefresh(false)');
    expect(prompt).toContain('setSnoozedUntil(snoozeUpdate())');
  });

  it('reloads in one place, and only after the button was pressed', () => {
    const reloads = prompt.match(/location\.reload\(\)/g) ?? [];
    expect(reloads.length).toBe(1);
    expect(prompt.slice(0, prompt.indexOf('location.reload()'))).toContain('markUpdateApplied()');
  });
});
