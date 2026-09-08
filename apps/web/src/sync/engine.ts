import { db, LOCAL_SCHEMA_VERSION } from '../db/database';
import { commitLocalMutation, localTableForEntity } from '../db/localMutation';
import { recall, remember } from '../app/deviceMemory';
import { requireSupabase } from '../services/supabase';
import type { SyncEntityType, SyncQueueItem, SyncRecord } from '../domain/types';
import { isRetryableStatus, nextRetryDelay } from './retry';
import { SYNC_PROTOCOL_VERSION, type MutationResult, type PullChange, type PullResponse, type PushEnvelope, type PushResponse } from './contracts';

const CLIENT_VERSION = '3.2.0';
/** The server accepts at most this many mutations per request. */
const PUSH_BATCH = 100;
/** Journal rows asked for per pull; the server caps the page at 1000. */
const PULL_PAGE = 500;
/** Ids fetched per read while applying a page of changes. */
const READ_BATCH = 100;
/** Pages a single sync will drain before handing back to the caller. */
const MAX_PULL_PAGES = 200;

type LocalRow = SyncRecord & Record<string, unknown>;

/** The order a change was made in. Rows queued by an older build carry only their timestamp. */
function queueOrder(item: SyncQueueItem): number {
  return item.sequence ?? Date.parse(item.createdAt);
}

export async function pushPending(schoolId: string, deviceId: string): Promise<{ accepted: number; blocked: number }> {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('AUTH_REQUIRED');
  const now = new Date().toISOString();
  // A previous tab can be closed while an older build has marked a row as processing. It is safe to
  // put those rows back into the durable pending queue: idempotencyKey protects the server from a
  // duplicate write, while leaving them hidden would make them impossible to deliver ever again.
  await db.syncQueue.where({ schoolId, status: 'processing' }).modify({ status: 'pending', lastError: 'กู้คืนคิวที่ค้างจากการปิดแอป' });
  // In the order the changes were made. The queue's index orders rows by their random id, so a
  // batch that simply took the first hundred could carry an enrollment without the student it
  // belongs to, and the server refused the orphan for a constraint the person never saw.
  const eligible = (await db.syncQueue.where({ schoolId, status: 'pending' }).filter((item) => item.nextRetryAt <= now).toArray())
    .sort((left, right) => queueOrder(left) - queueOrder(right));
  const mutations = eligible.slice(0, PUSH_BATCH);
  if (mutations.length === 0) return { accepted: 0, blocked: 0 };
  const envelope: PushEnvelope = { requestId: crypto.randomUUID(), deviceId, schoolId, clientVersion: CLIENT_VERSION, localSchemaVersion: LOCAL_SCHEMA_VERSION, syncProtocolVersion: SYNC_PROTOCOL_VERSION, mutations };
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-push`;
  let response: Response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) }); }
  catch (reason) { await scheduleRetry(mutations, reason instanceof Error ? reason.message : 'NETWORK_ERROR'); throw reason; }
  if (!response.ok) {
    const message = await response.text();
    if (isRetryableStatus(response.status)) await scheduleRetry(mutations, message);
    else await block(mutations, message);
    throw new Error(`SYNC_PUSH_${response.status}${message ? `: ${message.slice(0, 180)}` : ''}`);
  }
  const payload = await response.json() as PushResponse;
  let accepted = 0; let blockedCount = 0;
  for (const result of payload.results) {
    const item = mutations.find((candidate) => candidate.idempotencyKey === result.idempotencyKey);
    if (!item) continue;
    if (result.status === 'accepted') { await acceptResult(item, result); accepted += 1; }
    else if (result.status === 'retryable_error') { await reschedule(item, result.message); }
    else { await blockResult(item, result); blockedCount += 1; }
  }
  return { accepted, blocked: blockedCount };
}

/**
 * The server took the change.
 *
 * When it answers with a different id, the record already existed under its natural key — a badge
 * with this dedupe key, a mark on this criterion, this student's submission on this work — created
 * by another device first. This device's copy moves under the id everybody else reads, and any
 * later change still queued against the old id follows it.
 */
async function acceptResult(item: SyncQueueItem, result: Extract<MutationResult, { status: 'accepted' }>): Promise<void> {
  const table = db.table<LocalRow, string>(localTableForEntity[item.entityType]);
  await db.transaction('rw', table, db.syncQueue, async () => {
    await db.syncQueue.delete(item.queueId);
    const serverId = result.entityId || item.entityId;
    if (serverId === item.entityId) {
      const local = await table.get(item.entityId);
      if (local && typeof result.version === 'number' && result.version > (local.version ?? 0)) {
        await table.put({ ...local, version: result.version });
      }
      return;
    }
    const local = await table.get(item.entityId);
    if (local) {
      const existing = await table.get(serverId);
      await table.delete(item.entityId);
      await table.put({ ...(existing ?? {}), ...local, id: serverId, version: result.version });
    }
    await db.syncQueue.where('entityId').equals(item.entityId)
      .filter((row) => row.schoolId === item.schoolId)
      .modify((row) => {
        row.entityId = serverId;
        row.payload = { ...row.payload, id: serverId };
      });
  });
}

/**
 * The server refused the change, in a way retrying will not fix.
 *
 * A conflict answered with a different id means another device created this record first and this
 * device's version disagrees with it. The row every device reads is the server's; this copy stays
 * inside the blocked change, where the conflict screen shows both sides to the person who decides.
 */
async function blockResult(item: SyncQueueItem, result: Exclude<MutationResult, { status: 'accepted' }>): Promise<void> {
  await db.syncQueue.update(item.queueId, { status: 'blocked', lastError: `${result.code}: ${result.message}` });
  if (result.status !== 'conflict' || !result.entityId || result.entityId === item.entityId) return;
  const table = db.table<LocalRow, string>(localTableForEntity[item.entityType]);
  const local = await table.get(item.entityId);
  if (local && !local.deletedAt) await table.put({ ...local, deletedAt: new Date().toISOString() });
}

const cloudTables: Record<string, string> = {
  student: 'students', enrollment: 'student_class_enrollments', assignment: 'assignments', submission: 'submissions',
  activity: 'activities', activity_score: 'activity_scores', test: 'tests', test_score: 'test_scores', attendance: 'attendance',
  setting: 'settings', timetable_entry: 'timetable_entries', achievement: 'student_achievements', score_event: 'score_events',
  announcement: 'announcements', rubric: 'rubrics', rubric_score: 'rubric_scores', submission_version: 'submission_versions',
  deadline_extension: 'deadline_extensions', notification_preference: 'notification_settings',
  classroom_notification: 'classroom_notifications', academic_audit: 'audit_log'
};
const localTables: Record<string, string> = { ...localTableForEntity, announcement: 'announcements' };
function camel(key: string): string { return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()); }
function fromCloud(row: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key,value])=>[camel(key),value])); }

// Fields the local schema carries that the server may return as null: either because an older server
// build has no column for them, or because the column is null until the authoring device sends the
// value. Keeping the local value when the pulled row has none stops a pull from wiping data the
// client already holds. `instructions` and `studentNote` are stored as null on the server until a
// device that holds the text pushes it, so a row from before that push never overwrites the text.
//
// `avatarPhotoId` is here for a stronger reason than version skew: no server table has the column
// at all, because an uploaded photo is an attachment that stays on the device that holds it. Every
// pulled row therefore omits it, and without this the first sync after somebody set a photo threw
// that photo away. `pullParentLinks` already carried the value across by hand; the generic path
// that students and teachers travel did not.
const LOCAL_ONLY_FIELDS = ['subjectId', 'instructions', 'studentNote', 'driveUrl', 'avatarPhotoId'] as const;
export function mergeLocal(existing: Record<string, unknown> | undefined, incoming: Record<string, unknown>): Record<string, unknown> {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const field of LOCAL_ONLY_FIELDS) {
    if (merged[field] === undefined || merged[field] === null) {
      if (existing[field] !== undefined) merged[field] = existing[field];
    }
  }
  return merged;
}

/**
 * A pulled row in the shape the local record has.
 *
 * Most tables line up column for column once snake_case becomes camelCase. The audit trail does
 * not: it is read from audit_log, whose columns describe a generic audit row, and the local mirror
 * keeps the academic reading of it.
 */
export function shapeIncoming(entityType: string, row: Record<string, unknown>): Record<string, unknown> {
  if (entityType === 'academic_audit') {
    const occurredAt = String(row.occurredAt ?? row.createdAt ?? new Date().toISOString());
    const before = (row.beforeJson ?? {}) as Record<string, unknown>;
    const after = (row.afterJson ?? {}) as Record<string, unknown>;
    const metadata = (row.metadataJson ?? {}) as Record<string, unknown>;
    return {
      id: row.id, schoolId: row.schoolId, version: 1, createdAt: occurredAt, updatedAt: occurredAt, deletedAt: null,
      action: row.action, actorProfileId: row.actorProfileId ?? '',
      assignmentId: row.entityId ?? null, studentId: row.targetStudentId ?? null,
      oldValue: before.value ?? '', newValue: after.value ?? '', reason: metadata.reason ?? '', occurredAt
    };
  }
  return row;
}

/** Nulls the server is allowed to hold for text the local record always has. Applied after the merge, so a null never wins over local text. */
function finalizeIncoming(entityType: string, row: Record<string, unknown>): Record<string, unknown> {
  if (entityType === 'assignment') return { ...row, instructions: row.instructions ?? '' };
  if (entityType === 'submission') return { ...row, studentNote: row.studentNote ?? '', driveUrl: row.driveUrl ?? null };
  return row;
}

export async function registerAndSync(schoolId: string, deviceId: string, deviceName: string, deviceType: 'board'|'desktop'|'tablet'|'mobile') {
  const client=requireSupabase();
  const {error}=await client.rpc('register_device',{p_school_id:schoolId,p_device_id:deviceId,p_device_name:deviceName,p_device_type:deviceType,p_client_version:CLIENT_VERSION,p_protocol_version:SYNC_PROTOCOL_VERSION});
  if(error) throw error;
  await enqueueUnsyncedRecords(schoolId);
  let pushed = { accepted: 0, blocked: 0 };
  // Drain every currently eligible batch. A single click should not leave batch 2..N waiting for
  // the background timer, while the hard cap still prevents a pathological queue from monopolising
  // the browser forever.
  for (let batch = 0; batch < 100; batch += 1) {
    const next = await pushPending(schoolId, deviceId);
    pushed = { accepted: pushed.accepted + next.accepted, blocked: pushed.blocked + next.blocked };
    if (next.accepted === 0) break;
  }
  const pulled=await pullChanges(schoolId,deviceId);
  const structure=await pullStructure(schoolId);
  return {...pushed,pulled,structure};
}

/** The entity types that were written locally and nowhere else before the queue carried them. */
const BACKFILLED_ENTITIES: SyncEntityType[] = [
  'rubric', 'rubric_score', 'submission_version', 'deadline_extension', 'notification_preference',
  'classroom_notification', 'academic_audit'
];

/**
 * Queues the academic records an older build left on this device.
 *
 * Until schema 14 a rubric, an extension, a submission version, a rubric mark, a delivery preference,
 * a student's notice and an audit entry were written to the local database and never to the queue.
 * Version 0 with no queue row is the signature of such a record: the server has never heard of it.
 * Each one is queued exactly as it stands, once per device.
 */
export async function enqueueUnsyncedRecords(schoolId: string): Promise<number> {
  const marker = `sync-backfill-14:${schoolId}`;
  if (recall(marker)) return 0;
  const queued = new Set((await db.syncQueue.where('schoolId').equals(schoolId).toArray()).map((item) => item.entityId));
  let count = 0;
  for (const entityType of BACKFILLED_ENTITIES) {
    const table = db.table<LocalRow, string>(localTableForEntity[entityType]);
    const rows = await table.where('schoolId').equals(schoolId)
      .filter((row) => (row.version ?? 0) === 0 && !row.deletedAt && !queued.has(row.id))
      .toArray();
    for (const row of rows) {
      await commitLocalMutation(entityType, row);
      count += 1;
    }
  }
  remember(marker, new Date().toISOString());
  return count;
}

/**
 * School structure — terms, classes, subjects, teachers, class assignments and parent links — is
 * owned by the server and changed through security-definer functions, so it never enters the
 * mutation journal that `pullChanges` reads. Without this pass a second device would sign in to an
 * empty school: it has the sync entities but nothing to hang them on. Reads go through RLS, so a
 * device only ever mirrors what its user is already allowed to see.
 */
export async function pullStructure(schoolId: string): Promise<number> {
  const client = requireSupabase();
  let applied = 0;

  const mirror = async (
    cloudTable: string, localTable: string, columns = '*',
    shape: (row: Record<string, unknown>) => Record<string, unknown> = (row) => row
  ) => {
    const { data, error } = await client.from(cloudTable).select(columns).eq('school_id', schoolId);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const table = db.table<Record<string, unknown>, string>(localTable);
    for (const row of rows) {
      const incoming = shape(fromCloud(row));
      const current = await table.get(String(incoming.id));
      await table.put({ ...mergeLocal(current, incoming), deletedAt: incoming.deletedAt ?? null });
      applied += 1;
    }
  };

  await mirror('academic_terms', 'academicTerms');
  await mirror('classes', 'classes');
  await mirror('subjects', 'subjects');
  await mirror('teachers', 'teachers');
  // The server column is role_in_class; the local record calls it role. Left untranslated the field
  // arrived as roleInClass and every room card lost the difference between the homeroom teacher and
  // a subject teacher — they all read as the same person.
  await mirror('class_teachers', 'classTeachers', '*', (row) => {
    const { roleInClass, ...rest } = row;
    return { ...rest, role: roleInClass === 'assistant' ? 'assistant' : 'primary' };
  });
  await mirror('announcements', 'announcements');
  applied += await pullParentLinks(schoolId);
  return applied;
}

interface ParentLinkRow {
  id: string; student_id: string; relationship: string; status: string; linked_at: string | null;
  revoked_at: string | null; version: number | null; created_at: string; updated_at: string; deleted_at: string | null;
  parents: { profile_id?: string | null; avatar_id?: string | null; display_name?: string; phone?: string | null; line_user_id?: string | null } | null;
}

const parentLinkStatus: Record<string, 'invited' | 'linked' | 'revoked'> = {
  pending: 'invited', invited: 'invited', linked: 'linked', revoked: 'revoked'
};

/**
 * The server keeps a parent identity and a link row; the local projection keeps one flattened
 * record per link. Contact details already held locally are preserved when the server has none.
 */
async function pullParentLinks(schoolId: string): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.from('parent_student_links')
    .select('id, student_id, relationship, status, linked_at, revoked_at, version, created_at, updated_at, deleted_at, parents(profile_id, avatar_id, display_name, phone, line_user_id)')
    .eq('school_id', schoolId);
  if (error) throw error;
  let applied = 0;
  for (const row of (data ?? []) as unknown as ParentLinkRow[]) {
    const current = await db.parentLinks.get(row.id);
    await db.parentLinks.put({
      id: row.id, schoolId, version: row.version ?? 1,
      createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
      studentId: row.student_id,
      profileId: row.parents?.profile_id ?? current?.profileId ?? null,
      avatarId: row.parents?.avatar_id ?? current?.avatarId ?? null, avatarPhotoId: current?.avatarPhotoId ?? null,
      parentName: row.parents?.display_name ?? current?.parentName ?? 'ผู้ปกครอง',
      relationship: row.relationship, contact: row.parents?.phone ?? current?.contact ?? '',
      lineUserId: row.parents?.line_user_id ?? current?.lineUserId ?? null,
      status: parentLinkStatus[row.status] ?? 'invited',
      // The one-time code is never returned by the server; only the device that minted it holds it.
      invitationCode: current?.invitationCode ?? null,
      consentVersion: current?.consentVersion ?? null,
      consentGrantedAt: row.linked_at ?? current?.consentGrantedAt ?? null
    });
    applied += 1;
  }
  return applied;
}

/**
 * Reads the journal from where this device left off until it is drained.
 *
 * One page used to be one sync: a device that had been away long enough to fall more than a page
 * behind caught up one page per minute. The cursor moves after every page, so an interrupted pull
 * resumes rather than restarts.
 */
export async function pullChanges(schoolId: string, deviceId: string): Promise<number> {
  const client = requireSupabase();
  const key = `${schoolId}:${deviceId}`;
  let after = (await db.syncState.get(key))?.lastPullRevision ?? 0;
  let applied = 0;
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const { data, error } = await client.rpc('sync_pull', { p_school_id: schoolId, p_after_revision: after, p_limit: PULL_PAGE });
    if (error) throw error;
    const response = data as unknown as PullResponse;
    if (response.minimumSupportedProtocol > SYNC_PROTOCOL_VERSION) throw new Error('CLIENT_UPDATE_REQUIRED');
    applied += await applyChanges(schoolId, response.changes);
    await db.syncState.put({ key, deviceId, schoolId, lastPullRevision: response.nextRevision, lastSuccessfulSyncAt: new Date().toISOString(), localSchemaVersion: LOCAL_SCHEMA_VERSION, syncProtocolVersion: SYNC_PROTOCOL_VERSION });
    // The page is a window of journal rows, not of visible changes: a page with nothing visible in
    // it still moves the cursor. Only a cursor that stopped moving means the journal is drained.
    if (response.nextRevision <= after) break;
    after = response.nextRevision;
  }
  return applied;
}

/**
 * Applies one page of journal changes to the local projection.
 *
 * A record with a change still waiting in this device's queue is left alone: what this device holds
 * is newer than anything the server has for it, and the push that follows will carry it up. Rows
 * are read in batches by id rather than one request per change.
 */
export async function applyChanges(schoolId: string, changes: PullChange[]): Promise<number> {
  const client = requireSupabase();
  const pending = new Set((await db.syncQueue.where({ schoolId, status: 'pending' }).toArray()).map((item) => item.entityId));
  // The last change for a record in the page is the one that stands.
  const latest = new Map<string, PullChange>();
  for (const change of changes) {
    if (!cloudTables[change.entityType] || !localTables[change.entityType]) continue;
    latest.set(`${change.entityType}:${change.entityId}`, change);
  }
  let applied = 0;
  const toRead = new Map<string, PullChange[]>();
  for (const change of latest.values()) {
    if (pending.has(change.entityId)) continue;
    const table = db.table<LocalRow, string>(localTables[change.entityType]!);
    if (change.operation === 'delete') {
      const existing = await table.get(change.entityId);
      if (existing) await table.put({ ...existing, deletedAt: existing.deletedAt ?? new Date().toISOString(), version: change.version });
      applied += 1;
      continue;
    }
    const group = toRead.get(change.entityType) ?? [];
    group.push(change);
    toRead.set(change.entityType, group);
  }
  for (const [entityType, group] of toRead) {
    const cloud = cloudTables[entityType]!;
    const table = db.table<LocalRow, string>(localTables[entityType]!);
    for (let offset = 0; offset < group.length; offset += READ_BATCH) {
      const ids = group.slice(offset, offset + READ_BATCH).map((change) => change.entityId);
      const { data: rows, error } = await client.from(cloud).select('*').in('id', ids);
      if (error) throw error;
      for (const row of (rows ?? []) as Record<string, unknown>[]) {
        const incoming = shapeIncoming(entityType, fromCloud(row));
        const current = await table.get(String(incoming.id));
        await table.put(finalizeIncoming(entityType, mergeLocal(current, incoming)) as LocalRow);
        applied += 1;
      }
    }
  }
  return applied;
}

async function reschedule(item: SyncQueueItem, error: string) { const attemptCount = item.attemptCount + 1; await db.syncQueue.update(item.queueId, { attemptCount, lastError: error, nextRetryAt: new Date(Date.now() + nextRetryDelay(attemptCount)).toISOString() }); }
async function scheduleRetry(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await reschedule(item, error); }); }
async function block(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await db.syncQueue.update(item.queueId, { status: 'blocked', lastError: error }); }); }
