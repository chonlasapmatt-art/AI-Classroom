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

const cloudTables: Record<string, string> = { student:'students', enrollment:'student_class_enrollments', assignment:'assignments', submission:'submissions', activity:'activities', activity_score:'activity_scores', test:'tests', test_score:'test_scores', attendance:'attendance', setting:'settings' };
const localTables: Record<string, string> = { student:'students', enrollment:'enrollments', assignment:'assignments', submission:'submissions', activity:'activities', activity_score:'activityScores', test:'tests', test_score:'testScores', attendance:'attendance', setting:'settings' };
function camel(key: string): string { return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()); }
function fromCloud(row: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key,value])=>[camel(key),value])); }

export async function registerAndSync(schoolId: string, deviceId: string, deviceName: string, deviceType: 'board'|'desktop'|'tablet'|'mobile') {
  const client=requireSupabase(); const {error}=await client.rpc('register_device',{p_school_id:schoolId,p_device_id:deviceId,p_device_name:deviceName,p_device_type:deviceType}); if(error) throw error;
  const pushed=await pushPending(schoolId,deviceId); const pulled=await pullChanges(schoolId,deviceId); return {...pushed,pulled};
}

export async function pullChanges(schoolId: string, deviceId: string): Promise<number> {
  const client=requireSupabase(); const key=`${schoolId}:${deviceId}`; const state=await db.syncState.get(key); const after=state?.lastPullRevision ?? 0;
  const {data,error}=await client.rpc('sync_pull',{p_school_id:schoolId,p_after_revision:after,p_limit:500}); if(error) throw error;
  const response=data as unknown as PullResponse; if(response.minimumSupportedProtocol>SYNC_PROTOCOL_VERSION) throw new Error('CLIENT_UPDATE_REQUIRED');
  let applied=0;
  for(const change of response.changes){const cloud=cloudTables[change.entityType];const local=localTables[change.entityType];if(!cloud||!local)continue;const table=db.table<Record<string,unknown>,string>(local);if(change.operation==='delete'){const existing=await table.get(change.entityId);if(existing)await table.put({...existing,deletedAt:new Date().toISOString(),version:change.version,id:change.entityId});applied+=1;continue;}const {data:rows,error:readError}=await client.from(cloud).select('*').eq('id',change.entityId).limit(1);if(readError)throw readError;if(rows?.[0]){await table.put(fromCloud(rows[0] as Record<string,unknown>));applied+=1;}}
  await db.syncState.put({key,deviceId,schoolId,lastPullRevision:response.nextRevision,lastSuccessfulSyncAt:new Date().toISOString(),localSchemaVersion:LOCAL_SCHEMA_VERSION,syncProtocolVersion:SYNC_PROTOCOL_VERSION}); return applied;
}

async function reschedule(item: SyncQueueItem, error: string) { const attemptCount = item.attemptCount + 1; await db.syncQueue.update(item.queueId, { attemptCount, lastError: error, nextRetryAt: new Date(Date.now() + nextRetryDelay(attemptCount)).toISOString() }); }
async function scheduleRetry(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await reschedule(item, error); }); }
async function block(items: SyncQueueItem[], error: string) { await db.transaction('rw', db.syncQueue, async () => { for (const item of items) await db.syncQueue.update(item.queueId, { status: 'blocked', lastError: error }); }); }
