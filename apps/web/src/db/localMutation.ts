import type { Table } from 'dexie';
import { db } from './database';
import type { SyncEntityType, SyncOperation, SyncQueueItem, SyncRecord } from '../domain/types';

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The local table each sync entity lives in. One map, shared by the queue, the sync engine and the
 * operations screens, so a new entity type cannot be known to one of them and not the others.
 */
export const localTableForEntity: Record<SyncEntityType, string> = {
  student: 'students', enrollment: 'enrollments', assignment: 'assignments', submission: 'submissions',
  activity: 'activities', activity_score: 'activityScores', test: 'tests', test_score: 'testScores',
  attendance: 'attendance', setting: 'settings', timetable_entry: 'timetable', achievement: 'achievements',
  score_event: 'scoreEvents', rubric: 'rubrics', rubric_score: 'rubricScores',
  submission_version: 'submissionVersions', deadline_extension: 'deadlineExtensions',
  notification_preference: 'notificationPreferences', classroom_notification: 'notifications',
  academic_audit: 'academicAudit'
};

export function tableFor<T extends SyncRecord>(entityType: SyncEntityType): Table<T, string> {
  return db.table<T, string>(localTableForEntity[entityType]);
}

const SYNC_CHANNEL_NAME = 'smart-classroom-sync';
let syncChannel: BroadcastChannel | null | undefined;

function getSyncChannel(): BroadcastChannel | null {
  if (syncChannel !== undefined) return syncChannel;
  syncChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;
  return syncChannel;
}

/** Wakes every open app tab after a local or server-backed write. */
export function announceLocalMutation(schoolId: string, source: 'local' | 'server' = 'local'): void {
  if (typeof window === 'undefined') return;
  const detail = { schoolId, source, at: Date.now() };
  window.dispatchEvent(new CustomEvent('smart-classroom:local-mutation', { detail }));
  getSyncChannel()?.postMessage(detail);
}

let lastSequence = 0;
/**
 * Strictly increasing on this page, even for two writes inside one millisecond. The queue is pushed
 * in this order, which is what keeps a student ahead of the enrollment that names them.
 */
function nextSequence(): number {
  lastSequence = Math.max(lastSequence + 1, Date.now() * 1000);
  return lastSequence;
}

/** One record on its way to the server: the entity it is, the row to keep, and what happened to it. */
export interface LocalMutationEntry<T extends SyncRecord = SyncRecord> {
  entityType: SyncEntityType;
  record: T;
  operation?: SyncOperation;
}

async function queueItemFor(entry: LocalMutationEntry): Promise<SyncQueueItem> {
  const operation = entry.operation ?? 'upsert';
  const payload = structuredClone(entry.record) as unknown as Record<string, unknown>;
  const idempotencyKey = crypto.randomUUID();
  const requestHash = await sha256(JSON.stringify({ entityType: entry.entityType, entityId: entry.record.id, operation, payload, baseVersion: entry.record.version }));
  const now = new Date().toISOString();
  return {
    queueId: crypto.randomUUID(), schoolId: entry.record.schoolId, entityType: entry.entityType, entityId: entry.record.id, operation, payload,
    baseVersion: entry.record.version, idempotencyKey, requestHash, attemptCount: 0, nextRetryAt: now,
    lastError: null, status: 'pending', createdAt: now, sequence: nextSequence()
  };
}

/**
 * Writes several records and their queue rows in one local transaction: all of them, or none.
 *
 * Publishing work is one assignment, a submission row per student and a notice per student; a
 * promotion closes one enrollment and opens another for every student in the cohort. Committing
 * those one row at a time left half a cohort promoted when the browser was closed mid-way, with no
 * way to tell which half. The hashes are computed before the transaction opens, because a
 * transaction that awaits anything outside the database commits early.
 */
export async function commitLocalMutations(entries: LocalMutationEntry[]): Promise<SyncQueueItem[]> {
  if (entries.length === 0) return [];
  const items: SyncQueueItem[] = [];
  for (const entry of entries) items.push(await queueItemFor(entry));
  const tables = [...new Set(entries.map((entry) => localTableForEntity[entry.entityType]))]
    .map((name) => db.table<SyncRecord, string>(name));
  await db.transaction('rw', [...tables, db.syncQueue], async () => {
    for (const [index, entry] of entries.entries()) {
      await tableFor(entry.entityType).put(entry.record);
      await db.syncQueue.add(items[index]!);
    }
  });
  announceLocalMutation(entries[0]!.record.schoolId);
  return items;
}

export async function commitLocalMutation<T extends SyncRecord>(entityType: SyncEntityType, record: T, operation: SyncOperation = 'upsert'): Promise<SyncQueueItem> {
  const [item] = await commitLocalMutations([{ entityType, record, operation }]);
  return item!;
}

export async function softDeleteLocal<T extends SyncRecord>(entityType: SyncEntityType, record: T): Promise<SyncQueueItem> {
  const deleted = { ...record, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return commitLocalMutation(entityType, deleted, 'delete');
}
