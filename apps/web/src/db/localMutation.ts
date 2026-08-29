import type { Table } from 'dexie';
import { db } from './database';
import type { SyncEntityType, SyncOperation, SyncQueueItem, SyncRecord } from '../domain/types';

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tableFor<T extends SyncRecord>(entityType: SyncEntityType): Table<T, string> {
  const names: Record<SyncEntityType, string> = {
    student: 'students', enrollment: 'enrollments', assignment: 'assignments', submission: 'submissions',
    activity: 'activities', activity_score: 'activityScores', test: 'tests', test_score: 'testScores', attendance: 'attendance', setting: 'settings'
  };
  return db.table<T, string>(names[entityType]);
}

export async function commitLocalMutation<T extends SyncRecord>(entityType: SyncEntityType, record: T, operation: SyncOperation = 'upsert'): Promise<SyncQueueItem> {
  const table = tableFor<T>(entityType);
  const payload = structuredClone(record) as unknown as Record<string, unknown>;
  const idempotencyKey = crypto.randomUUID();
  const requestHash = await sha256(JSON.stringify({ entityType, entityId: record.id, operation, payload, baseVersion: record.version }));
  const item: SyncQueueItem = {
    queueId: crypto.randomUUID(), schoolId: record.schoolId, entityType, entityId: record.id, operation, payload,
    baseVersion: record.version, idempotencyKey, requestHash, attemptCount: 0, nextRetryAt: new Date().toISOString(),
    lastError: null, status: 'pending', createdAt: new Date().toISOString()
  };

  await db.transaction('rw', table, db.syncQueue, async () => {
    await table.put(record);
    await db.syncQueue.add(item);
  });
  return item;
}

export async function softDeleteLocal<T extends SyncRecord>(entityType: SyncEntityType, record: T): Promise<SyncQueueItem> {
  const deleted = { ...record, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return commitLocalMutation(entityType, deleted, 'delete');
}
