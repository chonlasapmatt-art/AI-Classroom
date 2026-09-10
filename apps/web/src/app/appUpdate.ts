/**
 * Application update rules.
 *
 * The service worker ships with `registerType: 'prompt'`, so a new build never swaps itself in
 * mid-lesson: the running app keeps working, notices the new version, and asks before reloading.
 * The helpers here are pure so the timing rules can be tested without a browser.
 */
import type { ReleaseChange, ReleaseNote } from './releaseNotes';

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

/**
 * Whether asking the server for a newer worker right now is worth doing — and legal.
 *
 * Pulled out of the component because both of its rules were learnt the hard way and neither is
 * obvious from the call site:
 *
 *   * **installing** — `registration.update()` on a worker that has not finished installing throws
 *     `InvalidStateError`. The first thing the app did on every fresh load was call it, so the one
 *     check somebody explicitly asked for by opening the page was the one guaranteed to fail. A
 *     worker that just installed is the current build anyway; there is nothing to ask about.
 *   * **force** — the thirty-minute throttle is right for a tab left open all day and wrong for a
 *     load: opening the page is somebody asking for the current version, and answering "you asked
 *     eleven minutes ago" is answering the wrong question.
 */
export function shouldRequestUpdate(
  { online, installing, force, lastCheckedAt, now }:
  { online: boolean; installing: boolean; force: boolean; lastCheckedAt: string | null; now?: Date }
): boolean {
  if (!online) return false;
  if (installing) return false;
  if (force) return true;
  return shouldCheckNow(lastCheckedAt, now ?? new Date());
}

export function readLastCheckedAt(): string | null {
  try { return window.localStorage.getItem(LAST_CHECK_KEY); } catch { return null; }
}

export function writeLastCheckedAt(value = new Date().toISOString()): void {
  try { window.localStorage.setItem(LAST_CHECK_KEY, value); } catch { /* best effort only */ }
}

/*
 * The version this device was last told about.
 *
 * Kept beside the other update bookkeeping rather than in the component that reads it, because it
 * is the same kind of fact as "when did this tab last check" — one line of device state, written
 * best-effort, and worth nothing if a private window refuses to store it.
 */
const SEEN_VERSION_KEY = 'smart-classroom-seen-version';

/*
 * Somebody pressed the update button, and this is the load that came back.
 *
 * The notice works out that there is something to report by comparing the version this device was
 * last told about with the one now running. That comparison is one localStorage entry away from
 * being wrong for ever: a mount that stamps the version and is then torn down — by a reload
 * arriving a moment later, a crash, a shell that remounts — leaves the device marked as having read
 * notes it never saw, and no later load will offer them again. So a deliberate update leaves a flag
 * as well, and the flag is enough on its own: the next load reports what changed whatever the
 * comparison says. It is read once and cleared.
 */
const UPDATE_APPLIED_KEY = 'smart-classroom-update-applied';

export function readSeenVersion(): string | null {
  try { return window.localStorage.getItem(SEEN_VERSION_KEY); } catch { return null; }
}

export function writeSeenVersion(version = APP_VERSION): void {
  try { window.localStorage.setItem(SEEN_VERSION_KEY, version); } catch { /* best effort only */ }
}

/** Records that this device is reloading because somebody asked it to update. */
export function markUpdateApplied(): void {
  try { window.localStorage.setItem(UPDATE_APPLIED_KEY, new Date().toISOString()); } catch { /* best effort only */ }
}

/** Reads the flag and clears it, so an update is reported once rather than on every load after it. */
export function takeUpdateApplied(): boolean {
  try {
    const stamped = window.localStorage.getItem(UPDATE_APPLIED_KEY);
    if (!stamped) return false;
    window.localStorage.removeItem(UPDATE_APPLIED_KEY);
    return true;
  } catch {
    return false;
  }
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
  // A worker that is still installing is already the newest build, and asking it to update throws
  // `InvalidStateError` — which reached the settings screen as "ตรวจหาอัปเดตไม่สำเร็จ" on exactly
  // the load where the app had just fetched everything it needed.
  if (registration.installing) return true;
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
export interface IncomingRelease {
  version: string;
  /** What the waiting build says it changed. Empty when it is older than release notes. */
  notes: ReleaseNote[];
}

export async function fetchIncomingRelease(): Promise<IncomingRelease | null> {
  try {
    const response = await fetch(`/version.json?at=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json() as { version?: unknown; notes?: unknown };
    if (typeof body.version !== 'string') return null;
    return { version: body.version, notes: readNotes(body.notes) };
  } catch {
    return null;
  }
}

/**
 * The notes out of a file this tab did not build.
 *
 * Anything unrecognisable is dropped rather than rendered: a build old enough to predate release
 * notes has no `notes` key at all, and the banner has to keep working for it — it simply says less.
 */
function readNotes(value: unknown): ReleaseNote[] {
  if (!Array.isArray(value)) return [];
  const notes: ReleaseNote[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const note = entry as Partial<ReleaseNote>;
    if (typeof note.version !== 'string' || !Array.isArray(note.changes)) continue;
    const changes = note.changes.filter((change): change is ReleaseChange =>
      typeof change === 'object' && change !== null
      && typeof (change as ReleaseChange).text === 'string'
      && ((change as ReleaseChange).kind === 'feature' || (change as ReleaseChange).kind === 'fix'));
    if (changes.length === 0) continue;
    notes.push({
      version: note.version,
      date: typeof note.date === 'string' ? note.date : '',
      headline: typeof note.headline === 'string' ? note.headline : '',
      changes
    });
  }
  return notes;
}
