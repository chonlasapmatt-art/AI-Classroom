# Smart Classroom — Local IndexedDB Specification

## Purpose
Dexie/IndexedDB supports offline classroom operation, local-first writes, persistent sync queue, local authorized projection, and restart resilience.

## Principle
Local DB is an authorized offline projection, not a cloud mirror.

## Typical Local Projection
- classes
- academic_terms
- students
- student_class_enrollments
- assignments
- submissions
- activities
- activity_scores
- tests
- test_scores
- attendance
- settings
- minimal profile data
- avatar data

Local system:
- sync_queue
- sync_state
- local_session_metadata
- device_metadata

## Data Not Replicated by Default
- school-wide audit logs
- full parent directory
- all notification logs
- unrelated classes
- global admin/security records

## sync_queue
- queue_id
- entity_type
- entity_id
- operation upsert|delete
- payload
- base_version
- idempotency_key
- attempt_count
- next_retry_at
- last_error
- created_at

## sync_state
- device_id
- school_id
- last_pull_revision
- last_successful_sync_at
- local_schema_version
- sync_protocol_version

## Transaction Invariant
Critical domain write + queue append must be in the same Dexie transaction whenever possible.
Never allow domain write success with missing queue entry.

## Schema Versioning
Dexie migrations must preserve local data and unsynced queue, be tested, and fail safely.

## Local Partitioning
Partition by school_id, authorized session/user, and device_id.
Shared Board logout must prevent previous teacher workspace exposure.

## Storage Durability
Use:
- navigator.storage.persisted()
- navigator.storage.persist()
- navigator.storage.estimate()

Handle persistence denial.
Provide low-storage warning and backup.
Never auto-delete unsynced mutations.

## Backup
Include schema version, timestamp, device, school scope, allowed domain data, needed sync metadata, checksum/integrity, and encryption metadata.
Never export credentials or secrets.
