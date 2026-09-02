import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../db/database';
import { registerAndSync } from './engine';

export type SyncPhase = 'idle' | 'offline' | 'syncing' | 'synced' | 'attention' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** Plain Thai wording for people who are not thinking about a sync protocol. */
  label: string;
  detail: string;
  lastSyncedAt: string | null;
  syncNow(): Promise<SyncResult | null>;
}

export interface SyncResult { accepted: number; blocked: number; pulled: number; structure: number; }

const INTERVAL_MS = 60_000;
const MUTATION_DEBOUNCE_MS = 350;

/** One stable device id per browser profile, reused by every sync from this device. */
export function deviceId(): string {
  const existing = localStorage.getItem('device-id');
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem('device-id', created);
  return created;
}

function deviceType(): 'board' | 'desktop' | 'tablet' | 'mobile' {
  if (/Android|iPad|Tablet/i.test(navigator.userAgent)) return 'tablet';
  if (/iPhone|Mobile/i.test(navigator.userAgent)) return 'mobile';
  return window.innerWidth >= 1600 ? 'board' : 'desktop';
}

/**
 * Keeps the local database and the server in step without anybody pressing a button: once on entry,
 * again whenever the connection comes back, and quietly on a timer. Work is never lost while
 * offline — it stays in the queue — so a failure here only delays delivery, it does not drop it.
 */
export function useBackgroundSync(schoolId: string, enabled: boolean): SyncStatus {
  const [phase, setPhase] = useState<SyncPhase>(navigator.onLine ? 'idle' : 'offline');
  const [detail, setDetail] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const running = useRef(false);
  const mutationTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    if (!enabled || running.current) return null;
    if (!navigator.onLine) { setPhase('offline'); setDetail('บันทึกในเครื่องแล้ว รอเชื่อมต่ออินเทอร์เน็ต'); return null; }
    running.current = true;
    setPhase('syncing');
    try {
      const result = await registerAndSync(schoolId, deviceId(), navigator.userAgent.slice(0, 80), deviceType());
      setLastSyncedAt(new Date().toISOString());
      if (result.blocked > 0) {
        setPhase('attention');
        setDetail(`มี ${result.blocked} รายการที่ต้องตรวจสอบก่อนซิงก์`);
      } else {
        setPhase('synced');
        setDetail(result.accepted + result.pulled > 0 ? `ส่ง ${result.accepted} · รับ ${result.pulled}` : 'ข้อมูลตรงกับเซิร์ฟเวอร์แล้ว');
      }
      return result;
    } catch (reason) {
      setPhase(navigator.onLine ? 'error' : 'offline');
      setDetail(syncErrorMessage(reason));
      // The queue already calculated an exponential backoff. Wake at its next eligible time so a
      // transient failure is retried promptly without hammering Supabase or waiting a full minute.
      const pending = await db.syncQueue.where({ schoolId, status: 'pending' }).toArray().catch(() => []);
      const nextAt = pending.reduce<number | null>((soonest, item) => {
        const time = Date.parse(item.nextRetryAt);
        return Number.isFinite(time) && (soonest === null || time < soonest) ? time : soonest;
      }, null);
      if (nextAt !== null && retryTimer.current === null) {
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null;
          void syncNow();
        }, Math.max(1_000, nextAt - Date.now()));
      }
      return null;
    } finally {
      running.current = false;
    }
  }, [enabled, schoolId]);

  useEffect(() => {
    if (!enabled) return;
    void db.syncState.get(`${schoolId}:${deviceId()}`).then((state) => {
      if (state?.lastSuccessfulSyncAt) setLastSyncedAt(state.lastSuccessfulSyncAt);
    }).catch(() => undefined);
    void syncNow();
    const timer = window.setInterval(() => { void syncNow(); }, INTERVAL_MS);
    const localMutation = (event: Event) => {
      const mutation = (event as CustomEvent<{ schoolId?: string }>).detail;
      if (mutation?.schoolId !== schoolId) return;
      if (mutationTimer.current !== null) window.clearTimeout(mutationTimer.current);
      // Coalesce a multi-row action (publish, import, attendance sheet) into one push, then send it
      // shortly after the local transaction commits so the UI stays instant without racing itself.
      mutationTimer.current = window.setTimeout(() => { mutationTimer.current = null; void syncNow(); }, MUTATION_DEBOUNCE_MS);
    };
    const online = () => { void syncNow(); };
    const offline = () => { setPhase('offline'); setDetail('บันทึกในเครื่องแล้ว รอเชื่อมต่ออินเทอร์เน็ต'); };
    const focus = () => { void syncNow(); };
    const visible = () => { if (document.visibilityState === 'visible') void syncNow(); };
    const pageShow = () => { void syncNow(); };
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('smart-classroom-sync') : null;
    const channelMessage = (event: MessageEvent<{ schoolId?: string }>) => {
      if (event.data?.schoolId === schoolId) void syncNow();
    };
    channel?.addEventListener('message', channelMessage);
    window.addEventListener('smart-classroom:local-mutation', localMutation);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', pageShow);
    return () => {
      window.clearInterval(timer);
      if (mutationTimer.current !== null) window.clearTimeout(mutationTimer.current);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      channel?.removeEventListener('message', channelMessage);
      channel?.close();
      window.removeEventListener('smart-classroom:local-mutation', localMutation);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [enabled, schoolId, syncNow]);

  const label = phase === 'syncing' ? 'กำลังซิงก์'
    : phase === 'synced' ? 'ซิงก์เรียบร้อย'
      : phase === 'offline' ? 'ทำงานออฟไลน์'
        : phase === 'attention' ? 'ต้องตรวจสอบข้อมูล'
          : phase === 'error' ? 'ซิงก์ไม่สำเร็จ' : 'พร้อมใช้งาน';

  return { phase, label, detail, lastSyncedAt, syncNow };
}

function syncErrorMessage(reason: unknown): string {
  const raw = reason instanceof Error
    ? reason.message
    : typeof reason === 'object' && reason !== null
      ? (typeof (reason as { message?: unknown }).message === 'string'
        ? (reason as { message: string }).message
        : JSON.stringify(reason) ?? String(reason))
      : String(reason ?? '');
  if (raw.includes('AUTH_REQUIRED') || raw.includes('401')) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ แล้วข้อมูลในเครื่องยังคงอยู่';
  if (raw.includes('FORBIDDEN') || raw.includes('403')) return 'บัญชีนี้ยังไม่มีสิทธิ์ซิงก์โรงเรียนนี้ ระบบเก็บข้อมูลไว้ในเครื่องและจะลองใหม่';
  if (raw.includes('CLIENT_UPDATE_REQUIRED')) return 'แอปเวอร์ชันนี้เก่าเกินไป กรุณารีเฟรชหน้าเพื่ออัปเดต แล้วลองซิงก์อีกครั้ง';
  if (raw.includes('SYNC_PUSH_')) return `ส่งข้อมูลขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (${raw.replace(/^.*SYNC_PUSH_/, 'HTTP ')})`;
  return raw || 'ซิงก์ไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ';
}
