import { useEffect, useState } from 'react';
import { Button } from '../ui/components';
import { UpdateMark } from './UpdateMark';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from '../db/database';
import {
  APP_VERSION, fetchIncomingRelease, markUpdateApplied, prepareForUpdate, readLastCheckedAt,
  shouldRequestUpdate, UPDATE_CHECK_INTERVAL_MS, updateCopy, updateKindFor, writeLastCheckedAt
} from './appUpdate';
import { changesIn, notesBetween } from './releaseNotes';
import type { ReleaseNote } from './releaseNotes';

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
  const [incomingNotes, setIncomingNotes] = useState<ReleaseNote[]>([]);

  /*
   * A new worker can now take charge without being asked, so the banner has to notice that too.
   *
   * `skipWaiting` and `clientsClaim` mean the installed worker activates and claims this page on its
   * own; the page keeps running the JavaScript it already has, which is what stops a lesson being
   * interrupted, but it is now one refresh away from a different build and the person should be told
   * rather than left to find out.
   *
   * The guard matters: `controllerchange` also fires the first time a worker ever takes control of a
   * page, on a fresh install where there is nothing to update. Only a handover *from* an existing
   * controller is news.
   */
  const [handedOver, setHandedOver] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onChange = () => { if (hadController) setHandedOver(true); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);

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
      /*
       * Two things this has to survive, both of which it did not.
       *
       *   * **A worker that is still installing.** `update()` on a registration whose worker has not
       *     finished installing throws `InvalidStateError`, and the very first thing this did on
       *     every fresh load was call it — so the one check a person explicitly asked for by opening
       *     the page was the one guaranteed to fail. Waiting for the install to settle costs
       *     nothing: a worker that just installed is by definition the current build.
       *   * **A rejection nobody caught.** `void promise.then(...)` with no `catch` turns a failed
       *     check into an unhandled rejection in the console and leaves `writeLastCheckedAt` unrun,
       *     so the throttle never advances and the next check fires immediately. A check that fails
       *     is a check that failed; it is not an error worth showing anybody, and it must not stop
       *     the schedule.
       */
      const check = (force = false) => {
        const allowed = shouldRequestUpdate({
          online: navigator.onLine,
          installing: Boolean(registration.installing),
          force,
          lastCheckedAt: readLastCheckedAt()
        });
        if (!allowed) return;
        void registration.update().then(() => writeLastCheckedAt()).catch(() => { /* try again later */ });
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
  /** A newer build is on this device, whether it announced itself or simply took over. */
  const updateReady = needRefresh || handedOver;

  useEffect(() => {
    if (!updateReady) return;
    setDismissed(false);
    setPreparationError(null);
    let active = true;
    void fetchIncomingRelease().then((release) => {
      if (!active || !release) return;
      setIncomingVersion(release.version);
      // Only what this device has not already got. A tab three versions behind is offered all three,
      // and a tab that is current is offered nothing rather than a list it has been running for a
      // fortnight.
      setIncomingNotes(notesBetween(APP_VERSION, release.version, release.notes));
    });
    return () => { active = false; };
  }, [updateReady]);

  const kind = updateKindFor(APP_VERSION, incomingVersion);
  const highlights = changesIn(incomingNotes);
  const shown = highlights.slice(0, 4);

  /**
   * Flush what can be flushed, then update — rather than refusing to.
   *
   * This used to stop dead whenever anything was left in the outbox, on the stated grounds of
   * preventing data loss. There is no data loss to prevent: `syncQueue` is a Dexie table in
   * IndexedDB, so it survives a reload by construction — that is the entire point of a durable
   * queue, and the app already relies on it every time a tab is closed mid-lesson. What the refusal
   * actually did was make the update unreachable for exactly the devices that most need it: one row
   * stuck pending — a spotty connection, a mutation the server keeps rejecting, a tablet that has
   * been offline since Friday — and "อัปเดตตอนนี้" printed a red line and did nothing, for ever.
   *
   * So the outbox is reported, not obeyed. Syncing first is still worth doing, because sending the
   * work now is better than sending it after a reload; failing to is not a reason to strand somebody
   * on an old build.
   */
  const applyUpdateSafely = async () => {
    if (preparing) return;
    setPreparing(true);
    setPreparationError(null);
    try {
      // A preparation that throws is a preparation that did not happen, which is a thing to mention
      // rather than a thing to stop for.
      const result = await prepareForUpdate().catch(() => null);
      const queued = await db.syncQueue.where('status').anyOf('pending', 'processing').count().catch(() => 0);
      if (queued > 0) {
        setPreparationError(`มีข้อมูลรอซิงก์ ${queued} รายการ · ระบบเก็บไว้ในเครื่องและจะส่งให้เองหลังอัปเดต`);
      } else if (result && !result.ready) {
        setPreparationError(result.message);
      }
      markUpdateApplied();
      await updateServiceWorker(true);

      /*
       * And if the reload does not happen, do it here.
       *
       * `updateServiceWorker(true)` tells the waiting worker to take over and reloads when it does.
       * A worker that was collected, or a browser that never fires `controllerchange`, leaves the
       * page sitting on the old build with the button spent — the failure this whole function exists
       * to avoid. Two and a half seconds is longer than the handover ever takes.
       */
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (reason) {
      setPreparationError(reason instanceof Error ? reason.message : 'อัปเดตไม่สำเร็จ กรุณาลองใหม่');
      setPreparing(false);
    }
  };

  if (!updateReady && !offlineReady) return null;
  if (dismissed && !offlineReady) return null;

  if (updateReady) {
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
          {/*
            What the waiting build actually changed.
            "มีเวอร์ชันใหม่" asks a teacher to interrupt a lesson for an unnamed benefit. Four lines
            is the most that can sit in a banner without becoming a page, so the rest is counted
            rather than dropped — and the whole list is on the screen that follows the reload.
          */}
          {shown.length > 0 && (
            <ul className="update-changes">
              {shown.map((change) => (
                <li key={change.text} data-kind={change.kind}>
                  <span className="update-change-tag">{change.kind === 'fix' ? 'แก้ไข' : 'ของใหม่'}</span>
                  <span>{change.text}</span>
                </li>
              ))}
              {highlights.length > shown.length && (
                <li className="update-changes-more">และอีก {highlights.length - shown.length} รายการ</li>
              )}
            </ul>
          )}
          {preparationError && <span className="update-error" role="alert">{preparationError}</span>}
        </div>
        <div className="update-actions">
          <Button
            variant="ghost"
            disabled={preparing}
            onClick={() => { setNeedRefresh(false); setHandedOver(false); setDismissed(true); }}
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
