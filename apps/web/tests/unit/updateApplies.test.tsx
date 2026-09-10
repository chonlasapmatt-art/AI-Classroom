import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  markUpdateApplied, shouldRequestUpdate, takeUpdateApplied, UPDATE_CHECK_INTERVAL_MS
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
