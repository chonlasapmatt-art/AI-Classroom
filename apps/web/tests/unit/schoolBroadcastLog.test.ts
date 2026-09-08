import { describe, expect, it } from 'vitest';
import type { Setting } from '../../src/domain/types';
import {
  BROADCAST_LIVE_WINDOW_MS, broadcastIsLive, broadcastLogFrom, SCHOOL_BROADCAST_LOG_KEY,
  withBroadcastLogged, withBroadcastRemoved, type SchoolBroadcast
} from '../../src/features/notifications/schoolBroadcast';

const base = {
  id: 'setting-log', schoolId: 'school-1', version: 1,
  createdAt: '', updatedAt: '', deletedAt: null,
  scopeType: 'school', scopeId: null
};

const notice = (over: Partial<SchoolBroadcast>): SchoolBroadcast => ({
  id: 'notice-1', title: 'ซ้อมหนีไฟ', body: 'ลงมาที่สนามหน้าเสาธง', tone: 'warning',
  raisedAt: '2026-09-09T02:00:00.000Z', raisedBy: 'ครูสมชาย', ...over
});

const logSetting = (entries: unknown[]): Setting => ({
  ...base, key: SCHOOL_BROADCAST_LOG_KEY, valueJson: { entries }
});

describe('the record of what the school has been told', () => {
  it('reads the log back newest first', () => {
    const log = broadcastLogFrom([logSetting([
      notice({ id: 'a', raisedAt: '2026-09-09T01:00:00.000Z' }),
      notice({ id: 'b', raisedAt: '2026-09-09T03:00:00.000Z' })
    ])]);
    expect(log.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('ignores entries that are no longer notices', () => {
    // A title is what makes a notice a notice; a row without one was cleared, not announced.
    const log = broadcastLogFrom([logSetting([notice({ id: 'a' }), { title: '  ' }, null, 'ประกาศ'])]);
    expect(log).toHaveLength(1);
  });

  it('has no log at all when nothing has been announced', () => {
    expect(broadcastLogFrom([])).toEqual([]);
  });

  it('puts a new notice at the top and keeps the log to its limit', () => {
    const existing = [notice({ id: 'a', raisedAt: '2026-09-09T01:00:00.000Z' })];
    const next = withBroadcastLogged(existing, notice({ id: 'b', raisedAt: '2026-09-09T02:00:00.000Z' }), 1);
    expect(next.map((entry) => entry.id)).toEqual(['b']);
  });

  it('never keeps two copies of the same notice', () => {
    const entry = notice({ id: 'a' });
    const next = withBroadcastLogged([entry], { ...entry, title: 'ซ้อมหนีไฟ (แก้ไข)' });
    expect(next).toHaveLength(1);
    expect(next[0]?.title).toBe('ซ้อมหนีไฟ (แก้ไข)');
  });

  it('removes one entry and leaves the rest', () => {
    const log = [notice({ id: 'a' }), notice({ id: 'b' })];
    expect(withBroadcastRemoved(log, 'a').map((entry) => entry.id)).toEqual(['b']);
  });
});

describe('whether a notice still interrupts', () => {
  const now = Date.parse('2026-09-09T03:00:00.000Z');

  it('interrupts for a notice raised moments ago', () => {
    expect(broadcastIsLive(notice({ raisedAt: '2026-09-09T02:59:30.000Z' }), now)).toBe(true);
  });

  it('stops interrupting once it is older than the live window', () => {
    const stale = new Date(now - BROADCAST_LIVE_WINDOW_MS - 1000).toISOString();
    expect(broadcastIsLive(notice({ raisedAt: stale }), now)).toBe(false);
  });

  it('does not interrupt for a notice with no time on it', () => {
    // Those came from a version that recorded none, which means they are not from the last minutes.
    expect(broadcastIsLive(notice({ raisedAt: '' }), now)).toBe(false);
  });

  it('tolerates a device clock that is slightly behind the school server', () => {
    const nearFuture = new Date(now + 30_000).toISOString();
    expect(broadcastIsLive(notice({ raisedAt: nearFuture }), now)).toBe(true);
  });
});
