/**
 * Application update rules.
 *
 * The service worker ships with `registerType: 'prompt'`, so a new build never swaps itself in
 * mid-lesson: the running app keeps working, notices the new version, and asks before reloading.
 * The helpers here are pure so the timing rules can be tested without a browser.
 */
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_TIME: string = __BUILD_TIME__;

/** How often a running tab asks the server whether a newer build exists. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export interface UpdatePreparationResult {
  ready: boolean;
  pending: number;
  message: string;
}

type UpdatePreparation = () => Promise<UpdatePreparationResult>;
let updatePreparation: UpdatePreparation | null = null;

/**
 * Lets the active cloud session flush its durable mutation queue before a PWA reload.
 * The registration is deliberately process-local: it never stores credentials or application
 * data, and a fresh tab can safely register its own session again.
 */
export function registerUpdatePreparation(preparation: UpdatePreparation): () => void {
  updatePreparation = preparation;
  return () => {
    if (updatePreparation === preparation) updatePreparation = null;
  };
}

export async function prepareForUpdate(): Promise<UpdatePreparationResult> {
  if (!updatePreparation) {
    return { ready: true, pending: 0, message: 'ไม่มีเซสชันที่ต้องซิงก์ก่อนอัปเดต' };
  }
  return updatePreparation();
}

const LAST_CHECK_KEY = 'smart-classroom-update-checked-at';

export function shouldCheckNow(lastCheckedAt: string | null, now = new Date(), intervalMs = UPDATE_CHECK_INTERVAL_MS): boolean {
  if (!lastCheckedAt) return true;
  const last = Date.parse(lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalMs;
}

export function readLastCheckedAt(): string | null {
  try { return window.localStorage.getItem(LAST_CHECK_KEY); } catch { return null; }
}

export function writeLastCheckedAt(value = new Date().toISOString()): void {
  try { window.localStorage.setItem(LAST_CHECK_KEY, value); } catch { /* best effort only */ }
}

export function formatBuildTime(isoDate = BUILD_TIME): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return 'ไม่ทราบเวลา';
  return new Date(parsed).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Asks the browser to re-fetch the service worker, ignoring the HTTP cache. */
export async function checkForUpdateNow(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  await registration.update();
  writeLastCheckedAt();
  return true;
}
