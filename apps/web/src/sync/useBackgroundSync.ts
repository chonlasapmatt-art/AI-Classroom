import { useCallback, useEffect, useRef, useState } from 'react';
import { registerAndSync } from './engine';

export type SyncPhase = 'idle' | 'offline' | 'syncing' | 'synced' | 'attention' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** Plain Thai wording for people who are not thinking about a sync protocol. */
  label: string;
  detail: string;
  lastSyncedAt: string | null;
  syncNow(): Promise<void>;
}

const INTERVAL_MS = 60_000;

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

  const syncNow = useCallback(async () => {
    if (!enabled || running.current) return;
    if (!navigator.onLine) { setPhase('offline'); setDetail('บันทึกในเครื่องแล้ว รอเชื่อมต่ออินเทอร์เน็ต'); return; }
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
    } catch (reason) {
      setPhase(navigator.onLine ? 'error' : 'offline');
      setDetail(reason instanceof Error ? reason.message : 'ซิงก์ไม่สำเร็จ');
    } finally {
      running.current = false;
    }
  }, [enabled, schoolId]);

  useEffect(() => {
    if (!enabled) return;
    void syncNow();
    const timer = window.setInterval(() => { void syncNow(); }, INTERVAL_MS);
    const online = () => { void syncNow(); };
    const offline = () => { setPhase('offline'); setDetail('บันทึกในเครื่องแล้ว รอเชื่อมต่ออินเทอร์เน็ต'); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [enabled, syncNow]);

  const label = phase === 'syncing' ? 'กำลังซิงก์'
    : phase === 'synced' ? 'ซิงก์เรียบร้อย'
      : phase === 'offline' ? 'ทำงานออฟไลน์'
        : phase === 'attention' ? 'ต้องตรวจสอบข้อมูล'
          : phase === 'error' ? 'ซิงก์ไม่สำเร็จ' : 'พร้อมใช้งาน';

  return { phase, label, detail, lastSyncedAt, syncNow };
}
