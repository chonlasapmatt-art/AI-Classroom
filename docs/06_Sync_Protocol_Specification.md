# Smart Classroom — Sync Protocol Specification v1.0

## Guarantees
- queue survives restart
- duplicate pushes do not duplicate logical records
- deleted data does not resurrect
- pull ordering is server deterministic
- critical conflicts are not silently overwritten
- client clock is not pull authority
- network failure does not lose local data

## Local Mutation Flow
User Action → Validate → Dexie transaction → Domain record + sync_queue → Commit → UI Local Saved → Background Push.

## Push Envelope
Request:
- requestId
- deviceId
- schoolId
- clientVersion
- localSchemaVersion
- syncProtocolVersion
- mutations[]

Mutation:
- idempotencyKey
- entityType
- entityId
- operation
- payload
- baseVersion
- clientMutationTime (metadata only)

## Server Push Processing
1. Verify JWT
2. Resolve profile
3. Verify active membership
4. Verify device status
5. Verify protocol compatibility
6. Validate payload
7. Check idempotency
8. Load current version
9. Evaluate conflict
10. Apply domain mutation
11. Append audit
12. Append sync_changes
13. Create notification_outbox event if applicable
14. Commit
15. Persist idempotent response
16. Return authoritative version + revision

## Results
- accepted
- conflict
- rejected_authorization
- validation_error
- retryable_error
- client_update_required

## Pull
Input: last_pull_revision
Returns changed records, tombstones, next_revision, server_time, minimum_supported_protocol.
Logical query: revision > last_pull_revision ORDER BY revision.

## Conflict Policy
General records: server-managed ordering where safe.
Critical records: score, attendance, consent, parent link, membership/security — never silent overwrite.
May reject, create review state, use deterministic server rule, or require manual review.

## Retry
Example backoff:
5s → 15s → 45s → 2m → 5m → 15m → cap.
Retry network/5xx/rate-limit where appropriate.
Do not endlessly retry authorization/validation/revoked device.

## Idempotency
Same key + same request hash returns stored result.
Same key + different request hash is rejected as integrity/security error.

## Tombstone
Set deleted_at → queue delete → cloud tombstone → sync_changes delete event → other devices pull → hide local record.
Purge only after retention + device acknowledgement policy.

## Device Acknowledgement
devices stores last_ack_revision and last_successful_sync_at.

## Protocol Versioning
Each sync includes clientVersion, localSchemaVersion, syncProtocolVersion.
Server may return CLIENT_UPDATE_REQUIRED but must not destroy unsynced local data.

## Diagnostics
UI shows syncing, synced, offline-local-saved, sync-problem, pending count, last sync, Sync Now.

## Required Scenarios
1. offline create → reconnect → exactly once
2. duplicate push → no duplicate
3. offline delete → reconnect → no resurrection
4. two devices edit → conflict policy
5. app closes with queue → survives
6. schema migration → queue preserved
7. revoked board → sync rejected
8. old protocol → safe update required
