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

/**
 * Two kinds of update, told apart by the version that is waiting.
 *
 * A school reads "มีเวอร์ชันใหม่" the same way whether the change is a fixed button or a whole new
 * screen, and the first of those is not worth interrupting a lesson for while the second is worth
 * pressing today. Semantic versioning already carries the distinction — a patch bump is a fix, a
 * minor or major bump is new work — so the prompt reads it rather than asking anybody to decide.
 *
 * The shape of the prompt is deliberately identical for both: same card, same buttons, same place.
 * Only the words before the button change, because that is the only thing that actually differs.
 */
export type UpdateKind = 'patch' | 'feature' | 'unknown';

export interface UpdateCopy {
  eyebrow: string;
  title: string;
  body: string;
  action: string;
}

const versionPattern = /^(\d+)\.(\d+)\.(\d+)/;

function parseVersion(value: string): [number, number, number] | null {
  const match = versionPattern.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Which kind of update is waiting.
 *
 * 'unknown' is returned rather than guessed whenever the two versions cannot be compared — an
 * unreadable string, or a build that is not actually newer — because a prompt that says "a fix" for
 * something that added a screen is worse than one that says only "a new version".
 */
export function updateKindFor(current: string, next: string | null): UpdateKind {
  if (!next) return 'unknown';
  const from = parseVersion(current);
  const to = parseVersion(next);
  if (!from || !to) return 'unknown';
  if (to[0] !== from[0] || to[1] !== from[1]) {
    return to[0] > from[0] || (to[0] === from[0] && to[1] > from[1]) ? 'feature' : 'unknown';
  }
  if (to[2] > from[2]) return 'patch';
  return 'unknown';
}

export const updateCopy: Record<UpdateKind, UpdateCopy> = {
  patch: {
    eyebrow: 'อัปเดตแพตช์',
    title: 'มีแพตช์แก้ไขพร้อมติดตั้ง',
    body: 'เป็นการแก้ไขจุดเล็ก ๆ ไม่มีการเปลี่ยนวิธีใช้งาน · ใช้เวลาไม่กี่วินาที',
    action: 'ติดตั้งแพตช์'
  },
  feature: {
    eyebrow: 'อัปเดตเวอร์ชันใหม่',
    title: 'มีเวอร์ชันใหม่พร้อมใช้งาน',
    body: 'มีของใหม่หรือหน้าจอที่ปรับปรุงแล้ว · ระบบจะซิงก์ข้อมูลให้ก่อนรีโหลด',
    action: 'อัปเดตตอนนี้'
  },
  unknown: {
    eyebrow: 'อัปเดตแอป',
    title: 'มีเวอร์ชันใหม่พร้อมใช้งาน',
    body: 'ระบบจะซิงก์ข้อมูลให้ก่อนรีโหลด เพื่อไม่ให้ข้อมูลที่ค้างอยู่หาย',
    action: 'อัปเดตตอนนี้'
  }
};

/**
 * The version waiting on the server, or `null` when it cannot be read.
 *
 * `cache: 'no-store'` because the whole point is to read past the copy this tab already has, and a
 * failure is answered with null rather than a throw: not knowing which kind of update is waiting is
 * a reason to word the prompt more generally, never a reason to withhold it.
 */
export async function fetchIncomingVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?at=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json() as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}
