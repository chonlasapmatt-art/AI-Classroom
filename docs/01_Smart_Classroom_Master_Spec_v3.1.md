# Smart Classroom — Master Specification v3.1

**Document Type:** Production Master Specification / Single Source of Truth  
**System Name:** Smart Classroom / Classroom Management  
**Version:** 3.1  
**Status:** Approved Development Baseline  
**Primary Target:** Interactive Board (Android/Chromium) + Teacher/Admin/Student/Parent Web  
**Architecture:** Local-first PWA + PostgreSQL Cloud Backend

## 0. Document Authority
This document is the Single Source of Truth (SSOT) for design, implementation, testing, deployment, and handover. It supersedes v3.0 and approved hardening decisions. Architecture changes require an ADR or Change Request.

## 1. Product Vision
Smart Classroom is a production-grade classroom management platform centered on Interactive Boards, with web/mobile access for Admin, Teacher, Student, and Parent.

Core values:
1. Fast in Classroom
2. Offline-capable core classroom workflows
3. Safe and deterministic synchronization
4. Strong authorization
5. Data integrity
6. Auditability
7. PDPA-aware handling
8. Multi-class / multi-teacher school-scale operation

## 2. Scope
In scope:
- School, academic term, teacher, class, student management
- Student enrollment history
- Assignment, submission, activity, test
- Attendance
- Scores, grade, penalties
- Pixel avatar and leaderboard
- Student portal
- Parent portal
- Parent–student linking and consent
- LINE OA notifications
- Local-first storage and two-way sync
- Backup/restore
- CSV/PDF export
- Audit logging
- Monitoring, deployment, rollback

Out of scope v3.1:
- Video conference
- SCORM/xAPI authoring suite
- Payments/subscriptions
- AI auto-grading
- Face recognition / biometrics
- Native Android/iOS as primary client
- Multi-school billing SaaS

## 3. Approved Technology Stack
- Frontend: React + TypeScript + Vite
- TypeScript: strict mode
- Styling: CSS Modules / structured design system
- PWA: Web App Manifest + Service Worker
- Local DB: IndexedDB via Dexie.js
- Cloud: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Authorization: PostgreSQL Grants + RLS
- Server: PostgreSQL RPC + Supabase Edge Functions
- Storage: Supabase Storage where required
- Notification: LINE Messaging API / LINE OA
- Tests: Vitest + Playwright
- Source control: Git / GitHub
- CI/CD: GitHub Actions

## 4. Architectural Principles
1. Local-first
2. Server-authoritative authorization
3. Explicit school ownership
4. Idempotent mutation
5. Deterministic conflict behavior
6. Soft delete before purge
7. Server-controlled monotonic revision
8. Trusted-layer audit
9. No secrets in client
10. No direct critical mutation bypass
11. Local DB is an authorized offline projection, not a cloud mirror
12. Production behavior must be testable

## 5. Identity and Roles
`user_profiles` stores global identity:
- id = auth.users.id
- display_name
- global_status
- created_at
- updated_at

`school_memberships` stores:
- id
- school_id
- profile_id
- role: admin|teacher|student|parent
- status
- active_from
- active_until
- created_at
- updated_at

A user may have multiple roles, e.g. Teacher + Parent, Admin + Teacher. Client must not authoritatively modify role, membership, school scope, or status.

## 6. Multi-Tenancy
Baseline: Shared Supabase Platform + strict school isolation.
School A must not access School B regardless of client tampering.

## 7. Academic Structure
`academic_terms`:
- id
- school_id
- academic_year
- term
- starts_on
- ends_on
- status

Classes reference `academic_term_id`.

## 8. Student Enrollment
Do not use `students.class_id` as source of truth.
Use `student_class_enrollments`:
- id
- school_id
- student_id
- class_id
- academic_term_id
- status
- enrolled_at
- left_at
- created_at
- updated_at
- deleted_at

Student transfers must retain historical enrollment.

## 9. Mandatory Cloud Entities
1. schools
2. user_profiles
3. school_memberships
4. teachers
5. academic_terms
6. classes
7. class_teachers
8. students
9. student_class_enrollments
10. parents
11. parent_student_links
12. parent_link_invitations
13. assignments
14. submissions
15. activities
16. activity_scores
17. tests
18. test_scores
19. attendance
20. settings
21. consents
22. audit_log
23. notification_preferences
24. notification_outbox
25. notifications_log
26. devices
27. sync_changes
28. sync_idempotency

Local-only:
29. sync_queue
30. sync_state

## 10. Common Sync Fields
Sync-capable entities should use as appropriate:
- id
- school_id
- created_at
- updated_at
- server_updated_at
- version
- created_by
- updated_by
- deleted_at

Server controls authoritative version, timestamps, audit actor, school scope, and sync revision.

## 11. Local DB Boundary
IndexedDB must not mirror PostgreSQL wholesale. It stores only authorized data needed by device/user for offline operations.

Typical Teacher Board projection:
- assigned classes
- active students
- enrollments
- relevant assignments, activities, tests
- attendance
- necessary scores
- classroom settings
- avatar info
- sync_queue
- sync_state

Do not replicate by default:
- school-wide audit logs
- all parents
- all notification logs
- unrelated classes
- admin/security records

## 12. Local Mutation Rule
User Action → Local Validation → Dexie transaction → domain update + sync_queue → commit → UI reports Local Saved → background sync.
UI must not report saved before local transaction succeeds.

## 13. Golden Cloud Mutation Pattern
Client Queue → Authenticated Sync Push → Authorization → Membership/School validation → Device validation → Idempotency → Base Version → Conflict Policy → DB transaction containing Domain Mutation + Audit + sync_changes + notification_outbox (if applicable) → Commit → Return Version/Revision → Local queue acknowledge.

## 14. Cloud Access Boundary
Standard reads: Supabase Client/PostgREST + RLS.
Critical local-first mutations: unified transactional sync mutation boundary.
RPC: transactional mutations and server-side checks.
Edge Functions: LINE, webhooks, parent-link secure validation, account/device privileged operations, imports/exports, external providers, secret-bound operations.

## 15. Sync Revision
Do not use client timestamp as pull cursor.
`sync_changes` uses server-generated monotonic `revision`.
Pull: `revision > last_pull_revision ORDER BY revision`.

## 16. Idempotency
Server table `sync_idempotency` stores:
- school_id
- device_id
- idempotency_key
- request_hash
- response_json
- processed_at

Unique: school_id + device_id + idempotency_key.
Duplicate push must not duplicate attendance, score, assignment, submission, or notifications.

## 17. Conflict Policy
General records may use server-managed ordering where safe.
Critical records must not silently overwrite:
- score
- attendance
- consent
- parent link
- security membership

Possible outcomes: reject conflict, preserve history, mark `needs_review`.

## 18. Tombstones
Synced deletes use `deleted_at`, sync tombstone, pull to other clients, hide from normal UI, purge later under retention and device-ack policy.
Devices should maintain:
- last_ack_revision
- last_successful_sync_at
- revoked_at

## 19. Device Security
`device_id` is not a credential.
Authorization requires Auth + Membership + RLS/server authorization.
Devices support registration, last seen, last sync, active/revoked state.

## 20. Offline Authentication
First login requires online authentication.
Teacher Board may use Trusted Device Offline Unlock:
- teacher logs in online first
- trusted board may configure local PIN
- PIN unlocks cached authorized workspace only
- default offline grace period: 24 hours
- privileged/security operations remain online-only
- reconnect must revalidate account, membership, and device before cloud push
- never store raw PIN

## 21. Parent Link Security
6-digit codes must use keyed HMAC/pepper, not plain hash.
Required:
- short expiry
- single use
- max attempts
- rate limits
- revoke
- failed-attempt audit
- no reusable plaintext storage

## 22. Consent
Parent can view student data only when parent_student_link is active and consent is active for the policy version.

## 23. LINE OA
LINE secrets remain server-side.
LINE linking uses authenticated parent + one-time state/nonce + verified callback/webhook + signature/state validation + audit.
LINE failure must not rollback classroom data.

## 24. Notification Outbox
Core educational transaction writes outbox event transactionally, commits, then async dispatcher sends LINE.
Outbox requires idempotency, retry classification, throttling, and failure logging.

## 25. Score Engine
Defaults:
- Assignment 60%
- Activity 30%
- Test 10%
- Passing score 60%
- Late penalty baseline 10%

Category percentage = SUM(score) / SUM(applicable max score) × 100.

Missing category rule:
If the whole class has no eligible/published item in a category, exclude that category temporarily and normalize remaining weights.
If a category exists but a student is missing an item, use missing-item policy (e.g. zero/excused); do not redistribute weight specifically for that student.

## 26. Score Quality
- clamp 0–100
- no NaN/Infinity
- deterministic rounding
- explicit max_score=0 policy
- explicit missing/excused policy
- published/unpublished policy
- every score update audited

## 27. Attendance
Statuses:
- present
- late
- absent
- leave

Unique active record: class + student + date.
Missing attendance is not absent unless school policy says so.
Attendance changes are audited.

## 28. Pixel Avatar
At least 14 archetypes and >100 palette variants.
Inline SVG + CSS only.
Persistent `avatar_index`, unique within active class context.
Rename/refresh/logout/sync must not change avatar.
Leaderboard and Student Portal use same avatar.

## 29. PWA
Manifest includes name, short_name, start_url, display, theme/background colors, icons.
Service Worker handles app shell/static assets/offline fallback.
Do not use Service Worker cache as domain database.

## 30. Storage Durability
Use:
- `navigator.storage.persisted()`
- `navigator.storage.persist()`
- `navigator.storage.estimate()`

Handle denied persistence.
Provide low-space warning, backup flow, diagnostics.
Never auto-delete unsynced queue to free storage.

## 31. PWA Updates
Detect new version, notify user, inspect unsynced critical mutations, avoid unsafe forced reload, update at safe point.

## 32. Backup
Local backup includes:
- backup/schema version
- timestamp
- device id
- school scope
- allowed domain data
- required sync metadata
- integrity metadata

Must not include credentials or secrets.
PII backup supports encryption policy such as Web Crypto AES-GCM.
Import validates format, encryption, schema, school scope, preview, transactional import, queue rebuild, audit.

## 33. RLS
RLS enabled on exposed business tables.
Minimum negative tests:
- School A vs B
- assigned vs unassigned teacher
- student self vs other
- parent linked vs unlinked
- suspended membership
- revoked device for critical sync

## 34. Audit
Append-only.
Critical audit originates from trusted layer.
Critical events include student mutation, score, attendance, consent, parent link, role/membership, export, backup import, privileged admin action.

## 35. Security
No service-role key, LINE secret, hardcoded credentials, full-token logging, or secrets in Git.
Require validation, XSS safety, CSP, secure CORS, HTTPS, security headers, rate limits, dependency scan, secret scan.
Admin MFA should be required in production.

## 36. CSV Import
Validate → Preview → Row Errors → Confirm → Transactional Import.
Default: no silent partial import.
Use batch ID + audit.

## 37. Export
CSV/PDF must respect authorization, scope, audit, generated time, and filters.

## 38. Environments
Separate development, staging, production.
No automated development tests against production.
No production secrets in local dev.

## 39. System Seed
Allowed: schema metadata, settings keys, default scoring config.
Database enums belong in migrations.
No fake school/teacher/student/class/score in production seed.

## 40. Testing
Unit: score, grade, formatScore, penalties, avatar, parent code, retry, tombstone, conflicts.
Integration: Auth, RLS, school/teacher/student/parent isolation, sync, idempotency, CSV.
E2E: admin setup, teacher classroom, offline attendance, reconnect, parent link, consent, LINE, portals, report, backup.
Real device: PWA install, touch, fullscreen, IndexedDB persistence, offline restart, reconnect, quota behavior.

## 41. Performance
Targets:
- Board touch feedback ≤100ms for local interaction
- Normal local save perceived ~300ms
- cloud network must not block allowed local classroom flow
- bulk attendance must not perform one network round-trip per student

## 42. Development Roadmap
Phase 0 Foundation
Phase 1 School/Class/Student Core
Phase 2 Learning Records
Phase 3 Attendance
Phase 4 Sync Hardening
Phase 5 Parent/PDPA/LINE
Phase 6 Reports/Backup/Operations
Phase 7 Production QA
Phase 8 Production Release

## 43. Definition of Done
Feature is Done only when requirements, security, local/cloud/sync behavior, empty/loading/error/offline states, tests, audit/notification implications, documentation, and defect criteria are satisfied.

## 44. Development Rules
Do not reduce requirements, disable RLS, bypass queue, hard-delete sync entities, create production demo data, hardcode secrets, silently overwrite critical conflicts, allow clients to control security fields, alter deployed migrations, or claim Production Ready before acceptance gates pass.

## 45. Final Production Definition
Production complete when:
- real Interactive Board works
- core classroom works offline
- local data survives restart
- sync is deterministic and idempotent
- conflicts and tombstones pass multi-device tests
- role/school isolation is correct
- parent consent/linking works
- LINE works
- score/attendance are correct
- enrollment history retained
- avatar consistent
- backup/restore tested
- audit/PDPA controls functional
- no known Critical/High release blockers
- runbooks and documentation complete

**END OF SMART CLASSROOM MASTER SPECIFICATION v3.1**
