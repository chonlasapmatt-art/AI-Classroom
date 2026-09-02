import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from '../db/database';
import { APP_VERSION, prepareForUpdate, readLastCheckedAt, shouldCheckNow, UPDATE_CHECK_INTERVAL_MS, writeLastCheckedAt } from './appUpdate';

/**
 * Shows the "a new version is ready" banner and applies it on the user's word.
 *
 * A classroom device may stay open all day, so the tab re-checks on an interval, when the browser
 * comes back online, and whenever the tab becomes visible again — but it never reloads by itself.
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const check = () => {
        if (!navigator.onLine) return;
        if (!shouldCheckNow(readLastCheckedAt())) return;
        void registration.update().then(() => writeLastCheckedAt());
      };

      check();
      const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      const onVisible = () => { if (document.visibilityState === 'visible') check(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', check);
      window.addEventListener('beforeunload', () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', check);
      });
    }
  });

  useEffect(() => {
    if (needRefresh) {
      setDismissed(false);
      setPreparationError(null);
    }
  }, [needRefresh]);

  const applyUpdateSafely = async () => {
    if (preparing) return;
    setPreparing(true);
    setPreparationError(null);
    try {
      const result = await prepareForUpdate();
      const queued = await db.syncQueue.where('status').anyOf('pending', 'processing').count().catch(() => 0);
      if (!result.ready || queued > 0) {
        setPreparationError(!result.ready ? result.message : `มีข้อมูลรอซิงก์ ${queued} รายการ ระบบยังไม่รีโหลดเพื่อป้องกันข้อมูลหาย`);
        return;
      }
      await updateServiceWorker(true);
    } catch (reason) {
      setPreparationError(reason instanceof Error ? reason.message : 'เตรียมข้อมูลก่อนอัปเดตไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setPreparing(false);
    }
  };

  if (!needRefresh && !offlineReady) return null;
  if (dismissed && !offlineReady) return null;

  if (needRefresh) {
    return (
      <div className="update-banner" role="status">
        <div>
          <strong>มีเวอร์ชันใหม่พร้อมใช้งาน</strong>
          <span>เวอร์ชันที่ใช้อยู่ {APP_VERSION} · ระบบจะซิงก์ข้อมูลก่อนรีโหลด เพื่อไม่ให้ข้อมูลหาย</span>
          {preparationError && <span className="update-error" role="alert">{preparationError}</span>}
        </div>
        <div className="update-actions">
          <button className="text-button" disabled={preparing} onClick={() => { setNeedRefresh(false); setDismissed(true); }}>ภายหลัง</button>
          <button className="primary-button" disabled={preparing} onClick={() => void applyUpdateSafely()}>{preparing ? 'กำลังซิงก์...' : 'อัปเดตตอนนี้'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="update-banner offline" role="status">
      <div>
        <strong>พร้อมใช้งานแบบออฟไลน์แล้ว</strong>
        <span>เปิดแอปได้แม้อินเทอร์เน็ตสะดุด</span>
      </div>
      <button className="text-button" onClick={() => setOfflineReady(false)}>ปิด</button>
    </div>
  );
}
