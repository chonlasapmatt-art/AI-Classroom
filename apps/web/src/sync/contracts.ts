import type { SyncQueueItem } from '../domain/types';

export const SYNC_PROTOCOL_VERSION = Number(import.meta.env.VITE_SYNC_PROTOCOL_VERSION ?? '1');
export interface PushEnvelope { requestId: string; deviceId: string; schoolId: string; clientVersion: string; localSchemaVersion: number; syncProtocolVersion: number; mutations: SyncQueueItem[]; }
export type MutationResult = { idempotencyKey: string; entityId: string; status: 'accepted'; version: number; revision: number } | { idempotencyKey: string; entityId: string; status: 'conflict' | 'rejected_authorization' | 'validation_error' | 'retryable_error' | 'client_update_required'; code: string; message: string; };
export interface PushResponse { requestId: string; results: MutationResult[]; serverTime: string; }
export interface PullChange { revision: number; entityType: string; entityId: string; operation: 'upsert' | 'delete'; version: number; record: Record<string, unknown> | null; }
export interface PullResponse { changes: PullChange[]; nextRevision: number; serverTime: string; minimumSupportedProtocol: number; }
