# Smart Classroom — Architecture Decisions v1.0

Status: Approved for Master Specification v3.1

- ADR-001: React + TypeScript + Vite for frontend.
- ADR-002: PWA is primary client; native APK is future packaging, not baseline.
- ADR-003: Dexie + IndexedDB for local-first persistence.
- ADR-004: Local DB is authorized offline projection, not a cloud mirror.
- ADR-005: Supabase PostgreSQL is cloud database.
- ADR-006: Supabase Auth for authentication; user_profiles for global identity; school_memberships for roles/school scope.
- ADR-007: student_class_enrollments is source of truth for class membership; students.class_id is not.
- ADR-008: Security boundary is PostgreSQL Grants + RLS + trusted mutation validation.
- ADR-009: Standard reads use Supabase Client/PostgREST + RLS.
- ADR-010: Critical local-first writes use unified sync mutation boundary and must not bypass queue.
- ADR-011: Hybrid server architecture: PostgreSQL RPC for atomic domain mutations; Edge Functions for LINE/webhooks/secrets/privileged orchestration.
- ADR-012: Sync pull cursor uses server monotonic revision.
- ADR-013: Persistent server idempotency is mandatory.
- ADR-014: Critical records cannot silently LWW; use explicit conflict policy / needs_review.
- ADR-015: Synced deletions use tombstones.
- ADR-016: device_id is not authentication; device may be revoked.
- ADR-017: First login online; trusted Teacher Board may use Offline Unlock, default 24h grace.
- ADR-018: Parent link code uses keyed HMAC/pepper, not plain hash.
- ADR-019: LINE notifications use transactional outbox.
- ADR-020: Critical audit is created in trusted server/database layer.
- ADR-021: Missing score category uses dynamic re-weight only when entire class has no eligible items in that category.
- ADR-022: Storage durability uses persisted()/persist()/estimate(); persist() is not assumed guaranteed.
- ADR-023: PWA must not force reload while unsynced critical mutations exist.
- ADR-024: Backup containing PII supports encryption and excludes secrets.
- ADR-025: Multi-tenancy is shared Supabase platform + strict school isolation.
- ADR-026: Production SQL migrations are immutable; fix with new migrations.
- ADR-027: Phase 0 must establish Auth/RLS/Dexie/Queue/Sync contract before broad feature work.
- ADR-028: AI agents may not change architecture without ADR/Change Request and Owner approval.
- ADR-029: Quality priority: Data Integrity > Security > Offline Reliability > Authorization > Maintainability > Performance > UX > Visual Polish.
- ADR-030: Master Spec v3.1 is SSOT. If code conflicts with spec, investigate and correct; do not silently change spec.
