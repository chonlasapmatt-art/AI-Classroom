import { db, LOCAL_SCHEMA_VERSION } from '../db/database';
import { requireSupabase } from '../services/supabase';
import type { SyncQueueItem } from '../domain/types';
import { isRetryableStatus, nextRetryDelay } from './retry';
import { SYNC_PROTOCOL_VERSION, type PullResponse, type PushEnvelope, type PushResponse } from './contracts';

const CLIENT_VERSION = '3.1.0';

export async function pushPending(schoolId: string, deviceId: string): Promise<{ accepted: number; blocked: number }> {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('AUTH_REQUIRED');
  const now = new Date().toISOString();
  const mutations = await db.syncQueue.where({ schoolId, status: 'pending' }).filter((item) => item.nextRetryAt <= now).limit(100).toArray();
  if (mutations.length === 0) return { accepted: 0, blocked: 0 };
  const envelope: PushEnvelope = { requestId: crypto.randomUUID(), deviceId, schoolId, clientVersion: CLIENT_VERSION, localSchemaVersion: LOCAL_SCHEMA_VERSION, syncProtocolVersion: SYNC_PROTOCOL_VERSION, mutations };
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-push`;
  let response: Response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) }); }
  catch (reason) { await scheduleRetry(mutations, reason instanceof Error ? reason.message : 'NETWORK_ERROR'); throw reason; }
  if (!response.ok) { const message = await response.text(); if (isRetryableStatus(response.status)) await scheduleRetry(mutations, message); else await block(mutations, message); throw new Error(`SYNC_PUSH_${response.status}`); }
  const payload = await response.json() as PushResponse;
  let accepted = 0; let blockedCount = 0;
  await db.transaction('rw', db.syncQueue, async () => {
    for (const result of payload.results) {
      const item = mutations.find((candidate) => candidate.idempotencyKey === result.idempotencyKey);
      if (!item) continue;
      if (result.status === 'accepted') { await db.syncQueue.delete(item.queueId); accepted += 1; }
      else if (result.status === 'retryable_error') { await reschedule(item, result.message); }
      else { await db.syncQueue.update(item.queueId, { status: 'blocked', lastError: `${result.code}: ${result.message}` }); blockedCount += 1; }
    }
  });
  return { accepted, blocked: blockedCount };
}

const cloudTables: Record<string, string> = { student:'students', enrollment:'student_class_enrollments', assignment:'assignments', submission:'submissions', activity:'activities', activity_score:'activity_scores', test:'tests', test_score:'test_scores', attendance:'attendance', setting:'settings', timetable_entry:'timetable_entries', achievement:'student_achievements', score_event:'score_events' };
const localTables: Record<string, string> = { student:'students', enrollment:'enrollments', assignment:'assignments', submission:'submissions', activity:'activities', activity_score:'activityScores', test:'tests', test_score:'testScores', attendance:'attendance', setting:'settings', timetable_entry:'timetable', achievement:'achievements', score_event:'scoreEvents' };
function camel(key: string): string { return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()); }
function fromCloud(row: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key,value])=>[camel(key),value])); }

// Fields the local schema carries that an older server build may not return yet. Keeping the local
// value when the pulled row omits it stops a pull from wiping data the client already holds.
const LOCAL_ONLY_FIELDS = ['subjectId', 'instructions', 'studentNote'] as const;
function mergeLocal(existing: Record<string, unknown> | undefined, incoming: Record<string, unknown>): Record<string, unknown> {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const field of LOCAL_ONLY_FIELDS) {
    if (merged[field] === undefined || merged[field] === null) {
      if (existing[field] !== undefined) merged[field] = existing[field];
    }
  }
  return merged;
}

export async function registerAndSync(schoolId: string, deviceId: string, deviceName: string, deviceType: 'board'|'desktop'|'tablet'|'mobile') {
  const client=requireSupabase(); const {error}=await client.rpc('register_device',{p_school_id:schoolId,p_device_id:deviceId,p_device_name:deviceName,p_device_type:deviceType}); if(error) throw error;
  const pushed=await pushPending(schoolId,deviceId); const pulled=await pullChanges(schoolId,deviceId);
  const structure=await pullStructure(schoolId);
  return {...pushed,pulled,structure};
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

  const mirror = async (cloudTable: string, localTable: string, columns = '*') => {
    const { data, error } = await client.from(cloudTable).select(columns).eq('school_id', schoolId);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const table = db.table<Record<string, unknown>, string>(localTable);
    for (const row of rows) {
      const incoming = fromCloud(row);
      const current = await table.get(String(incoming.id));
      await table.put({ ...mergeLocal(current, incoming), deletedAt: incoming.deletedAt ?? null });
      applied += 1;
    }
  };

  await mirror('academic_terms', 'academicTerms');
  await mirror('classes', 'classes');
  await mirror('subjects', 'subjects');
  await mirror('teachers', 'teachers');
  await mirror('class_teachers', 'classTeachers');
  applied += await pullParentLinks(schoolId);
  return applied;
}

interface ParentLinkRow {
  id: string; student_id: string; relationship: string; status: string; linked_at: string | null;
  revoked_at: string | null; version: number | null; created_at: string; updated_at: string; deleted_at: string | null;
  parents: { display_name?: string; phone?: string | null; line_user_id?: string | null } | null;
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
    .select('id, student_id, relationship, status, linked_at, revoked_at, version, created_at, updated_at, deleted_at, parents(display_name, phone, line_user_id)')
    .eq('school_id', schoolId);
  if (error) throw error;
  let applied = 0;
  for (const row of (data ?? []) as unknown as ParentLinkRow[]) {
    const current = await db.parentLinks.get(row.id);
    await db.parentLinks.put({
      id: row.id, schoolId, version: row.version ?? 1,
      createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
      studentId: row.student_id,
      avatarId: current?.avatarId ?? null, avatarPhotoId: current?.avatarPhotoId ?? null,
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

export async function pullChanges(schoolId: string, deviceId: string): Promise<number> {
  const client=requireSupabase(); const key=`${schoolId}:${deviceId}`; const state=await db.syncState.get(key); const after=state?.lastPullRevision ?? 0;
  const {data,error}=await client.rpc('sync_pull',{p_school_id:schoolId,p_after_revision:after,p_limit:500}); if(error) throw error;
  const response=data as unknown as PullResponse; if(response.minimumSupportedProtocol>SYNC_PROTOCOL_VERSION) throw new Error('CLIENT_UPDATE_REQUIRED');
  let applied=0;
  for(const change of response.changes){const cloud=cloudTables[change.entityType];const local=localTables[change.entityType];if(!cloud||!local)continue;const table=db.table<Record<string,unknown>,string>(local);if(change.operation==='delete'){const existing=await table.get(change.entityId);if(existing)await table.put({...existing,deletedAt:new Date().toISOString(),version:change.version,id:change.entityId});applied+=1;continue;}const {data:rows,error:readError}=await client.from(cloud).select('*').eq('id',change.entityId).limit(1);if(readError)throw readError;if(rows?.[0]){const current=await table.get(change.entityId);await table.put(mergeLocal(current,fromCloud(rows[0] as Record<string,unknown>)));applied+=1;}}
  await db.syncState.put({key,deviceId,schoolId,lastPullRevision:response.nextRevision,lastSuccessfulSyncAt:new Date().toISOString(),localSchemaVersion:LOCAL_SCHEMA_VERSION,syncProtocolVersion:SYNC_PROTOCOL_VERSION}); return applied;
}

async function reschedule(item: SyncQueueItem, error: string) { const attemptCount = item.attemptCount + 1; await db.syncQueue.update(item.queueId, { attemptCount, lastError: error, nextRetryAt: new Date(Date.now() + nextRetryDelay(attemptCount)).toISOString() }); }
async function scheduleRetry(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await reschedule(item, error); }); }
async function block(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await db.syncQueue.update(item.queueId, { status: 'blocked', lastError: error }); }); }
