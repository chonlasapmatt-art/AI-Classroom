import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_VERSION, BUILD_TIME, formatBuildTime, prepareForUpdate, readLastCheckedAt, registerUpdatePreparation, shouldCheckNow, UPDATE_CHECK_INTERVAL_MS, writeLastCheckedAt
} from '../../src/app/appUpdate';

describe('application update rules', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('exposes the build identity injected at compile time', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isNaN(Date.parse(BUILD_TIME))).toBe(false);
  });

  it('checks immediately when it has never checked before', () => {
    expect(shouldCheckNow(null)).toBe(true);
    expect(shouldCheckNow('not-a-date')).toBe(true);
  });

  it('waits out the interval between checks', () => {
    const now = new Date('2026-08-29T10:00:00.000Z');
    const justChecked = new Date(now.getTime() - 60_000).toISOString();
    const longAgo = new Date(now.getTime() - UPDATE_CHECK_INTERVAL_MS - 1).toISOString();
    expect(shouldCheckNow(justChecked, now)).toBe(false);
    expect(shouldCheckNow(longAgo, now)).toBe(true);
  });

  it('remembers the last check across reads', () => {
    expect(readLastCheckedAt()).toBeNull();
    writeLastCheckedAt('2026-08-29T09:00:00.000Z');
    expect(readLastCheckedAt()).toBe('2026-08-29T09:00:00.000Z');
    expect(shouldCheckNow(readLastCheckedAt(), new Date('2026-08-29T09:05:00.000Z'))).toBe(false);
  });

  it('formats the build time and survives a broken value', () => {
    expect(formatBuildTime('2026-08-29T03:00:00.000Z')).not.toBe('ไม่ทราบเวลา');
    expect(formatBuildTime('nonsense')).toBe('ไม่ทราบเวลา');
  });

  it('runs the active session preparation before allowing a reload', async () => {
    let called = 0;
    const unregister = registerUpdatePreparation(async () => {
      called += 1;
      return { ready: true, pending: 0, message: 'พร้อมอัปเดต' };
    });
    await expect(prepareForUpdate()).resolves.toEqual({ ready: true, pending: 0, message: 'พร้อมอัปเดต' });
    expect(called).toBe(1);
    unregister();
  });
});
