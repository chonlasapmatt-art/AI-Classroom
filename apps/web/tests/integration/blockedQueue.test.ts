import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/database';
import {
  discardBlockedMutation, listBlockedMutations, retryBlockedMutation
} from '../../src/features/operations/blockedMutations';
import type { SyncQueueItem } from '../../src/domain/types';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const now = new Date().toISOString();

function queued(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    queueId: crypto.randomUUID(), schoolId: SCHOOL, entityType: 'student',
    entityId: crypto.randomUUID(), operation: 'upsert', payload: {},
    baseVersion: 0, idempotencyKey: crypto.randomUUID(), requestHash: 'x'.repeat(64),
    attemptCount: 3, nextRetryAt: now, lastError: null, status: 'blocked', createdAt: now,
    ...overrides
  };
}

async function student(id: string, version: number, displayName: string) {
  await db.students.put({
    id, schoolId: SCHOOL, studentCode: 'S-1', displayName, firstName: displayName, lastName: '',
    avatarIndex: 0, avatarId: null, avatarConfig: null, avatarAnimationSet: 'standard',
    status: 'active', version, createdAt: now, updatedAt: now, deletedAt: null
  } as never);
}

describe('the changes the server would not take', () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
    await db.students.clear();
  });

  it('names the record and the reason, newest first', async () => {
    const older = queued({
      entityId: crypto.randomUUID(), createdAt: '2026-09-01T00:00:00.000Z',
      payload: { displayName: 'ก่อนหน้า' }, lastError: 'FORBIDDEN'
    });
    const newer = queued({
      payload: { displayName: 'สมชาย ใจดี', studentCode: '00123' },
      lastError: 'MUTATION_ERROR: duplicate key value violates unique constraint "students_school_id_student_code_key"'
    });
    await db.syncQueue.bulkAdd([older, newer]);

    const rows = await listBlockedMutations(SCHOOL);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe('สมชาย ใจดี');
    expect(rows[0]!.entityLabel).toBe('นักเรียน');
    expect(rows[0]!.reason).toBe('เลขประจำตัวนักเรียนนี้มีอยู่แล้วในโรงเรียน');
    expect(rows[1]!.name).toBe('ก่อนหน้า');
  });

  it('leaves the pending queue alone', async () => {
    await db.syncQueue.add(queued({ status: 'pending' }));
    expect(await listBlockedMutations(SCHOOL)).toHaveLength(0);
  });

  it('puts a change back in the queue to be tried again', async () => {
    const item = queued({ lastError: 'DEVICE_REVOKED' });
    await db.syncQueue.add(item);

    await retryBlockedMutation(item.queueId);

    const after = await db.syncQueue.get(item.queueId);
    expect(after?.status).toBe('pending');
    expect(after?.attemptCount).toBe(0);
    expect(after?.lastError).toBeNull();
  });

  it('drops the record too when the server never accepted it', async () => {
    const entityId = crypto.randomUUID();
    await student(entityId, 0, 'ซ้ำจากการนำเข้า');
    const item = queued({ entityId, payload: { displayName: 'ซ้ำจากการนำเข้า' }, lastError: 'duplicate key value' });
    await db.syncQueue.add(item);

    const [row] = await listBlockedMutations(SCHOOL);
    expect(row?.removesLocalRecord).toBe(true);

    await discardBlockedMutation(item.queueId);
    expect(await db.syncQueue.get(item.queueId)).toBeUndefined();
    expect(await db.students.get(entityId)).toBeUndefined();
  });

  it('keeps a record the server already holds, and drops only the change', async () => {
    const entityId = crypto.randomUUID();
    await student(entityId, 4, 'มีอยู่บนเซิร์ฟเวอร์แล้ว');
    const item = queued({ entityId, payload: { displayName: 'มีอยู่บนเซิร์ฟเวอร์แล้ว' }, lastError: 'SYNC_CONFLICT' });
    await db.syncQueue.add(item);

    const [row] = await listBlockedMutations(SCHOOL);
    expect(row?.removesLocalRecord).toBe(false);

    await discardBlockedMutation(item.queueId);
    expect(await db.syncQueue.get(item.queueId)).toBeUndefined();
    expect(await db.students.get(entityId)).toBeDefined();
  });
});
