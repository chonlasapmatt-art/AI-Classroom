import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION, readLastCheckedAt, shouldCheckNow, UPDATE_CHECK_INTERVAL_MS, writeLastCheckedAt } from './appUpdate';

/**
 * Shows the "a new version is ready" banner and applies it on the user's word.
 *
 * A classroom device may stay open all day, so the tab re-checks on an interval, when the browser
 * comes back online, and whenever the tab becomes visible again — but it never reloads by itself.
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);

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
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh && !offlineReady) return null;
  if (dismissed && !offlineReady) return null;

  if (needRefresh) {
    return (
      <div className="update-banner" role="status">
        <div>
          <strong>มีเวอร์ชันใหม่พร้อมใช้งาน</strong>
          <span>เวอร์ชันที่ใช้อยู่ {APP_VERSION} · ข้อมูลที่ยังไม่ซิงก์จะไม่หายเมื่ออัปเดต</span>
        </div>
        <div className="update-actions">
          <button className="text-button" onClick={() => { setNeedRefresh(false); setDismissed(true); }}>ภายหลัง</button>
          <button className="primary-button" onClick={() => void updateServiceWorker(true)}>อัปเดตตอนนี้</button>
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
