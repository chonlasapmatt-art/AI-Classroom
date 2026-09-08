import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db/database';
import { commitLocalMutation } from '../../src/db/localMutation';
import type { Enrollment, Student, StudentAchievement, SyncQueueItem } from '../../src/domain/types';

// The engine is exercised against a fake Supabase client and a fake sync-push endpoint. What is
// tested is the contract the real server keeps: the order changes arrive in, the id it answers
// with, and what the device does about both.

const schoolId = '44444444-4444-4444-8444-444444444444';
const deviceId = '55555555-5555-4555-8555-555555555555';

interface FakeRpc { (name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: null | { message: string } }> }

const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
const readCalls: Array<{ table: string; ids: string[] }> = [];
let pullPages: Array<{ changes: Array<Record<string, unknown>>; nextRevision: number }> = [];
let cloudRows: Record<string, Record<string, unknown>[]> = {};
const rpcImpl: FakeRpc = async (name, params) => {
  rpcCalls.push({ name, params });
  if (name === 'sync_pull') {
    const page = pullPages.shift() ?? { changes: [], nextRevision: Number(params.p_after_revision) };
    return { data: { ...page, serverTime: new Date().toISOString(), minimumSupportedProtocol: 1 }, error: null };
  }
  return { data: null, error: null };
};

function query(table: string) {
  const state = { ids: [] as string[] };
  const result = {
    select: () => result,
    eq: async () => ({ data: [], error: null }),
    in: async (_column: string, ids: string[]) => {
      readCalls.push({ table, ids });
      return { data: (cloudRows[table] ?? []).filter((row) => ids.includes(String(row.id))), error: null };
    },
    limit: async () => ({ data: [], error: null }),
    state
  };
  return result;
}

const fakeClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  rpc: (name: string, params: Record<string, unknown>) => rpcImpl(name, params),
  from: (table: string) => query(table)
};

vi.mock('../../src/services/supabase', () => ({
  isCloudConfigured: true,
  supabase: fakeClient,
  requireSupabase: () => fakeClient
}));

const { pushPending, pullChanges, applyChanges, enqueueUnsyncedRecords } = await import('../../src/sync/engine');

type PushHandler = (envelope: { mutations: SyncQueueItem[] }) => Response | Promise<Response>;
let pushHandler: PushHandler = (envelope) => json({ requestId: 'r', serverTime: new Date().toISOString(), results: envelope.mutations.map((mutation) => ({
  idempotencyKey: mutation.idempotencyKey, entityId: mutation.entityId, status: 'accepted', version: mutation.baseVersion + 1, revision: 1
})) });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const stamp = '2026-06-01T00:00:00.000Z';
function student(id: string): Student {
  return { id, schoolId, version: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null, profileId: null, studentCode: id, displayName: id, avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' };
}
function enrollment(id: string, studentId: string): Enrollment {
  return { id, schoolId, version: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null, studentId, classId: 'class-1', academicTermId: 'term-1', status: 'active', enrolledAt: stamp, leftAt: null };
}
function badge(id: string, dedupeKey: string): StudentAchievement {
  return { id, schoolId, version: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null, studentId: 'student-1', achievementKey: 'reader', dedupeKey, note: '', awardedBy: null, awardedAt: stamp };
}

describe('pushing the queue', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    rpcCalls.length = 0; readCalls.length = 0; pullPages = []; cloudRows = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => pushHandler(JSON.parse(String(init.body)) as { mutations: SyncQueueItem[] })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends changes in the order they were made, whatever the queue ids are', async () => {
    const seen: string[][] = [];
    pushHandler = (envelope) => { seen.push(envelope.mutations.map((item) => item.entityType)); return json({ requestId: 'r', serverTime: stamp, results: envelope.mutations.map((item) => ({ idempotencyKey: item.idempotencyKey, entityId: item.entityId, status: 'accepted', version: 1, revision: 1 })) }); };
    for (let index = 0; index < 8; index += 1) {
      await commitLocalMutation('student', student(`student-${index}`));
      await commitLocalMutation('enrollment', enrollment(`enrollment-${index}`, `student-${index}`));
    }
    // Queue ids are random; the index the queue is read through orders by them.
    const result = await pushPending(schoolId, deviceId);
    expect(result.accepted).toBe(16);
    const order = seen[0]!;
    for (let index = 0; index < 8; index += 1) {
      expect(order.indexOf('student')).toBeLessThan(order.indexOf('enrollment'));
      expect(order[index * 2]).toBe('student');
      expect(order[index * 2 + 1]).toBe('enrollment');
    }
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('moves a record under the id the server wrote when another device created it first', async () => {
    pushHandler = (envelope) => json({ requestId: 'r', serverTime: stamp, results: envelope.mutations.map((item) => ({
      idempotencyKey: item.idempotencyKey, entityId: 'server-badge', status: 'accepted', version: 3, revision: 9
    })) });
    await commitLocalMutation('achievement', badge('local-badge', 'student-1:reader'));
    // A later change queued against the local id has to follow the record.
    await commitLocalMutation('achievement', { ...badge('local-badge', 'student-1:reader'), note: 'ยอดเยี่ยม' });
    const queue = await db.syncQueue.toArray();
    await db.syncQueue.update(queue[1]!.queueId, { nextRetryAt: new Date(Date.now() + 60_000).toISOString() });

    await pushPending(schoolId, deviceId);

    expect(await db.achievements.get('local-badge')).toBeUndefined();
    const moved = await db.achievements.get('server-badge');
    expect(moved?.dedupeKey).toBe('student-1:reader');
    expect(moved?.version).toBe(3);
    const remaining = await db.syncQueue.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.entityId).toBe('server-badge');
    expect(remaining[0]?.payload.id).toBe('server-badge');
  });

  it('keeps a conflicting copy inside the blocked change and shows the server row instead', async () => {
    pushHandler = (envelope) => json({ requestId: 'r', serverTime: stamp, results: envelope.mutations.map((item) => ({
      idempotencyKey: item.idempotencyKey, entityId: 'server-score', status: 'conflict', code: 'SYNC_CONFLICT', message: 'Critical record version changed'
    })) });
    await commitLocalMutation('test_score', { id: 'local-score', schoolId, version: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null, testId: 'test-1', studentId: 'student-1', score: 18, publishedAt: null });

    const result = await pushPending(schoolId, deviceId);

    expect(result.blocked).toBe(1);
    const [item] = await db.syncQueue.toArray();
    expect(item?.status).toBe('blocked');
    expect(item?.payload.score).toBe(18);
    expect((await db.testScores.get('local-score'))?.deletedAt).not.toBeNull();
  });

  it('retries rather than blocks when the server asks for a newer build', async () => {
    pushHandler = () => json({ code: 'CLIENT_UPDATE_REQUIRED', minimumSupportedProtocol: 2 }, 409);
    await commitLocalMutation('student', student('student-x'));
    await expect(pushPending(schoolId, deviceId)).rejects.toThrow('SYNC_PUSH_409');
    const [item] = await db.syncQueue.toArray();
    expect(item?.status).toBe('pending');
    expect(item?.attemptCount).toBe(1);
  });
});

describe('pulling the journal', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    rpcCalls.length = 0; readCalls.length = 0; pullPages = []; cloudRows = {};
  });

  it('pages until the cursor stops moving and reads rows in batches by id', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `student-${index}`);
    cloudRows = { students: ids.map((id) => ({ id, school_id: schoolId, student_code: id, display_name: id, avatar_index: 0, avatar_config: null, status: 'active', version: 2, created_at: stamp, updated_at: stamp, deleted_at: null })) };
    pullPages = [
      { changes: ids.slice(0, 100).map((id, index) => ({ revision: index + 1, entityType: 'student', entityId: id, operation: 'upsert', version: 2 })), nextRevision: 100 },
      // A page whose rows were all invisible to this device still moves the cursor.
      { changes: [], nextRevision: 200 },
      { changes: ids.slice(100).map((id, index) => ({ revision: 201 + index, entityType: 'student', entityId: id, operation: 'upsert', version: 2 })), nextRevision: 250 },
      { changes: [], nextRevision: 250 }
    ];

    const applied = await pullChanges(schoolId, deviceId);

    expect(applied).toBe(150);
    expect(rpcCalls.filter((call) => call.name === 'sync_pull').map((call) => call.params.p_after_revision)).toEqual([0, 100, 200, 250]);
    expect(readCalls.length).toBe(2);
    expect(readCalls.every((call) => call.ids.length <= 100)).toBe(true);
    expect(await db.students.count()).toBe(150);
    expect((await db.syncState.get(`${schoolId}:${deviceId}`))?.lastPullRevision).toBe(250);
  });

  it('leaves a record alone while this device still has a change to push for it, and keeps local text a null cannot replace', async () => {
    await commitLocalMutation('student', { ...student('student-edited'), displayName: 'แก้ในเครื่อง' });
    await db.assignments.put({ id: 'work-1', schoolId, version: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null, classId: 'class-1', subjectId: null, workType: 'assignment', title: 'เดิม', description: '', instructions: 'ทำในสมุด', assignedAt: stamp, startAt: null, dueAt: null, maxScore: 10, rubricId: null, reminderOffsets: [0], status: 'published', publishedAt: stamp, cancelledAt: null });
    cloudRows = {
      students: [{ id: 'student-edited', school_id: schoolId, student_code: 'x', display_name: 'จากเซิร์ฟเวอร์', avatar_index: 0, avatar_config: null, status: 'active', version: 5, created_at: stamp, updated_at: stamp, deleted_at: null }],
      assignments: [{ id: 'work-1', school_id: schoolId, class_id: 'class-1', subject_id: null, work_type: 'assignment', title: 'ใหม่', description: '', instructions: null, assigned_at: stamp, start_at: null, due_at: null, max_score: 10, rubric_id: null, reminder_offsets: [0], status: 'published', published_at: stamp, cancelled_at: null, version: 2, created_at: stamp, updated_at: stamp, deleted_at: null }]
    };

    await applyChanges(schoolId, [
      { revision: 1, entityType: 'student', entityId: 'student-edited', operation: 'upsert', version: 5, record: null },
      { revision: 2, entityType: 'assignment', entityId: 'work-1', operation: 'upsert', version: 2, record: null }
    ]);

    expect((await db.students.get('student-edited'))?.displayName).toBe('แก้ในเครื่อง');
    const work = await db.assignments.get('work-1');
    expect(work?.title).toBe('ใหม่');
    expect(work?.instructions).toBe('ทำในสมุด');
  });

  it('mirrors an academic audit entry from the generic audit row', async () => {
    cloudRows = { audit_log: [{ id: 'audit-1', school_id: schoolId, actor_profile_id: 'profile-teacher', action: 'SCORE_CHANGED', entity_type: 'assignment', entity_id: 'work-1', target_student_id: 'student-1', before_json: { value: '12' }, after_json: { value: '15' }, metadata_json: { reason: 'ตรวจใหม่' }, occurred_at: stamp }] };
    await applyChanges(schoolId, [{ revision: 3, entityType: 'academic_audit', entityId: 'audit-1', operation: 'upsert', version: 1, record: null }]);
    const entry = await db.academicAudit.get('audit-1');
    expect(entry).toMatchObject({ action: 'SCORE_CHANGED', assignmentId: 'work-1', studentId: 'student-1', oldValue: '12', newValue: '15', reason: 'ตรวจใหม่', actorProfileId: 'profile-teacher' });
  });

  it('queues the records an older build left on the device, once', async () => {
    window.localStorage.removeItem(`sync-backfill-14:${schoolId}`);
    await db.rubrics.put({ id: 'rubric-old', schoolId, version: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null, title: 'เก่า', subjectId: null, criteria: [{ id: 'c1', label: 'x', maxScore: 1, description: '' }], status: 'active' });
    await db.rubrics.put({ id: 'rubric-synced', schoolId, version: 2, createdAt: stamp, updatedAt: stamp, deletedAt: null, title: 'ซิงก์แล้ว', subjectId: null, criteria: [], status: 'active' });
    expect(await enqueueUnsyncedRecords(schoolId)).toBe(1);
    expect((await db.syncQueue.toArray()).map((item) => item.entityId)).toEqual(['rubric-old']);
    expect(await enqueueUnsyncedRecords(schoolId)).toBe(0);
  });
});
