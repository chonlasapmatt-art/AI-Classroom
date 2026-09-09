import { useEffect, useState } from 'react';
import { Button } from '../ui/components';
import { UpdateMark } from './UpdateMark';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from '../db/database';
import {
  APP_VERSION, fetchIncomingVersion, prepareForUpdate, readLastCheckedAt, shouldCheckNow,
  UPDATE_CHECK_INTERVAL_MS, updateCopy, updateKindFor, writeLastCheckedAt
} from './appUpdate';

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
  const [incomingVersion, setIncomingVersion] = useState<string | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      /*
       * `force` is what separates opening the app from leaving it open.
       *
       * The interval exists so a tab left running all day does not ask the server every minute, and
       * it is remembered across loads. That is correct for the timer and wrong for a fresh load: a
       * teacher who reloads because the app looked stale was, until this, told to wait out the rest
       * of a thirty-minute window and served the same old build again. Opening the page is the one
       * moment somebody is explicitly asking for the current version, so it never gets throttled.
       */
      const check = (force = false) => {
        if (!navigator.onLine) return;
        if (!force && !shouldCheckNow(readLastCheckedAt())) return;
        void registration.update().then(() => writeLastCheckedAt());
      };

      check(true);
      const timer = window.setInterval(() => check(), UPDATE_CHECK_INTERVAL_MS);
      const onVisible = () => { if (document.visibilityState === 'visible') check(); };
      // Wrapped rather than passed directly: an event listener hands the handler an Event, which as
      // a first argument would read as `force` and turn every one of these into an unthrottled hit.
      const onOnline = () => check();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      window.addEventListener('beforeunload', () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
      });
    }
  });

  /*
   * Which version is waiting, and therefore which of the two prompts this is.
   *
   * The service worker only says "something newer exists"; the build writes its version into
   * `version.json`, which is read here once the prompt is about to appear. A read that fails leaves
   * the kind unknown, and the prompt words itself generally rather than not appearing — knowing
   * less about an update is never a reason to hide it.
   */
  useEffect(() => {
    if (!needRefresh) return;
    setDismissed(false);
    setPreparationError(null);
    let active = true;
    void fetchIncomingVersion().then((version) => { if (active) setIncomingVersion(version); });
    return () => { active = false; };
  }, [needRefresh]);

  const kind = updateKindFor(APP_VERSION, incomingVersion);

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
    const copy = updateCopy[kind];
    return (
      <div className="update-banner" data-kind={kind} role="status">
        <span className="update-mark" aria-hidden="true">
          <UpdateMark kind={kind} size={40} />
        </span>
        <div className="update-copy">
          <span className="update-eyebrow">{copy.eyebrow}</span>
          <strong>{copy.title}</strong>
          <span className="update-versions">
            {incomingVersion ? `${APP_VERSION} → ${incomingVersion}` : `เวอร์ชันที่ใช้อยู่ ${APP_VERSION}`}
          </span>
          <span>{copy.body}</span>
          {preparationError && <span className="update-error" role="alert">{preparationError}</span>}
        </div>
        <div className="update-actions">
          <Button
            variant="ghost"
            disabled={preparing}
            onClick={() => { setNeedRefresh(false); setDismissed(true); }}
          >
            ภายหลัง
          </Button>
          <Button variant="primary" loading={preparing} onClick={() => void applyUpdateSafely()}>
            {copy.action}
          </Button>
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
