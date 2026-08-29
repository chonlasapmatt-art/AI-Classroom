# SMART CLASSROOM v3.1 — COMPLETE ONE-SHOT MASTER BUILD v5.0

**Document Type:** Single-file self-contained production implementation package  
**Version:** 5.0  
**Build Mode:** One-shot continuous end-to-end production build  
**Primary UI Language:** Thai  
**Code / identifiers / comments:** English  
**Primary Target:** Interactive Board (Android/Chromium) + Admin / Teacher / Student / Parent Web/PWA  
**Purpose:** Give this ONE FILE to Codex or another capable coding agent and build the real Smart Classroom system without requiring separate specification files.

---

# A. HOW TO USE THIS SINGLE FILE

This file contains, in one place:

1. The original `README.md`
2. Smart Classroom Master Specification v3.1
3. Approved Architecture Decisions
4. Database Specification
5. RLS / Authorization Matrix
6. Local IndexedDB Specification
7. Sync Protocol Specification
8. Offline Authentication Policy
9. Security Specification
10. API & Mutation Boundary
11. Production Implementation Roadmap
12. Production Acceptance Test Plan
13. AI Development Controller
14. One-Shot End-to-End Production Build Master Prompt v4.0

**You do not need separate copies of those files when this v5.0 package is supplied.**
Treat each embedded section below as if it were the original file at the path shown in its heading.

The authoritative hierarchy is unchanged:

`01_Smart_Classroom_Master_Spec_v3.1.md` is the Single Source of Truth (SSOT).

If an embedded secondary document conflicts with the Master Specification, the Master Specification wins unless the Product Owner has explicitly approved a Change Request / ADR.

---

# B. OWNER EXECUTION OVERRIDE FOR THIS BUILD

The Product Owner explicitly authorizes a **continuous one-shot implementation run**.

The original `12_AI_Development_Controller.md` contains a bounded-task workflow that normally instructs the implementation agent to stop after each task and wait for approval.

**For this specific build only, that stop-after-each-normal-task workflow is overridden by the Product Owner.**

This override applies ONLY to execution cadence.

It does **NOT** override or weaken:

- the Master Specification v3.1
- approved architecture
- database integrity rules
- RLS / authorization
- local-first guarantees
- offline authentication policy
- sync protocol
- idempotency
- conflict policy
- tombstones
- audit requirements
- security requirements
- production acceptance gates

Execution behavior for this build:

`Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8`

Proceed continuously when each phase gate passes.

When a build, typecheck, lint, migration, unit test, integration test, security test, or E2E test fails:

`inspect → identify root cause → fix → rerun → regression test → continue when green`

Stop and request Product Owner input only when:

1. a required external production credential / secret is unavailable and the specific live integration cannot be completed;
2. an irreversible production action requires confirmation;
3. authoritative requirements genuinely conflict;
4. a proposed change would alter approved architecture, security boundary, authorization model, offline policy, or sync contract;
5. a destructive database decision cannot be made safely.

Missing third-party credentials must not stop unrelated development. Complete the code, tests/mocks, environment-variable contract, and setup documentation for that integration, and clearly report the remaining external blocker.

---

# C. CRITICAL SINGLE-FILE INSTRUCTION TO THE BUILDING AGENT

Do NOT stop because paths like `README.md` or `docs/01...12` are not physically present in the repository yet.

Their complete authoritative contents are embedded below.

At the beginning of implementation:

1. Read this entire file.
2. Treat the embedded `README.md` and `docs/01...12` sections as authoritative source documents.
3. Materialize/copy them into the repository at their canonical paths if useful for long-term maintainability.
4. Preserve `docs/01_Smart_Classroom_Master_Spec_v3.1.md` as SSOT.
5. Create an ADR / Change Request for the Owner-approved Animated Student Avatar enhancement if it extends the original data contract.
6. Build the complete production-capable system continuously.
7. Do not create a fake UI-only demo.
8. Do not fabricate test results.
9. Do not claim Production Ready until the acceptance gates actually pass.

---

# D. EMBEDDED AUTHORITATIVE SOURCE DOCUMENTS



---

# EMBEDDED SOURCE 1: `README.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Production Development Blueprint

## Current Baseline
**Smart Classroom Master Specification v3.1**

Status: **Approved Development Baseline / Single Source of Truth**

This package is intended for Product Owner, Software Architect, Antigravity/Codex, Human Developers, QA, Security Reviewers, and DevOps.

## Source of Truth Hierarchy

1. `docs/01_Smart_Classroom_Master_Spec_v3.1.md` — SSOT
2. `docs/02_Architecture_Decisions.md` — approved ADRs
3. `docs/03_Database_Specification.md`
4. `docs/04_RLS_Authorization_Matrix.md`
5. `docs/05_Local_IndexedDB_Specification.md`
6. `docs/06_Sync_Protocol_Specification.md`
7. `docs/07_Offline_Authentication_Policy.md`
8. `docs/08_Security_Specification.md`
9. `docs/09_API_Mutation_Boundary.md`
10. `docs/10_Implementation_Roadmap.md`
11. `docs/11_Acceptance_Test_Plan.md`
12. `docs/12_AI_Development_Controller.md`

If implementation conflicts with the Master Specification, stop and resolve the conflict. Do not silently modify the specification to match the code.

## Approved Stack
- React + TypeScript + Vite
- PWA: Manifest + Service Worker
- Local DB: Dexie + IndexedDB
- Cloud: Supabase
- DB: PostgreSQL
- Auth: Supabase Auth
- Authorization: PostgreSQL Grants + RLS
- Server: PostgreSQL RPC + Supabase Edge Functions
- Notifications: LINE Messaging API / LINE OA
- Tests: Vitest + Playwright
- CI/CD: GitHub Actions

## Core Rules
- Local-first for classroom-critical workflows
- Local DB is an authorized offline projection, not a cloud mirror
- Critical mutations must not bypass the sync queue
- Sync pull uses server monotonic revision, not client clock
- Persistent server idempotency is mandatory
- Critical conflicts must not be silently overwritten
- Synced deletes use tombstones
- Critical audit is created in a trusted server/database layer
- Parent link codes use keyed HMAC/pepper, not plain hash
- Notifications use transactional outbox
- First login requires online authentication
- Trusted Teacher Board may use Offline Unlock under policy
- No production demo data
- No secrets in client or repository

## How to Start with Antigravity
1. Open this repository/project.
2. Ask Antigravity to read `README.md` and all `docs/` files in numeric order.
3. Treat `docs/01_Smart_Classroom_Master_Spec_v3.1.md` as SSOT.
4. Follow `docs/12_AI_Development_Controller.md`.
5. First run is analysis and Phase 0 planning only.
6. Do not allow implementation until Owner review.

Recommended first message:

> Read README.md and all documents under docs/ in numeric order. Treat docs/01_Smart_Classroom_Master_Spec_v3.1.md as the Single Source of Truth. Follow docs/12_AI_Development_Controller.md. For this first run, perform architecture review and Phase 0 planning only. Do not install packages, create source code, create databases, run migrations, or modify project files. Return the required reports and stop for Owner approval.

## Repository Target Structure
```text
smart-classroom/
├── README.md
├── apps/
├── supabase/
├── docs/
├── tests/
├── scripts/
├── .env.example
├── .gitignore
└── package.json
```

## Quality Priority
1. Data Integrity
2. Security
3. Offline Reliability
4. Authorization
5. Maintainability
6. Performance
7. UX
8. Visual Polish


---

# EMBEDDED SOURCE 2: `docs/01_Smart_Classroom_Master_Spec_v3.1.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

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


---

# EMBEDDED SOURCE 3: `docs/02_Architecture_Decisions.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

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


---

# EMBEDDED SOURCE 4: `docs/03_Database_Specification.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Database Specification v1.0

## Conventions
- PostgreSQL on Supabase
- UUID PKs
- timestamptz
- server-authoritative version/timestamps/security fields
- school_id tenant scoping
- versioned immutable migrations
- soft delete for sync-capable entities

## Core Tables
### schools
id, name, code, timezone(default Asia/Bangkok), status, created_at, updated_at, deleted_at.

### user_profiles
id = auth.users.id, display_name, global_status, created_at, updated_at.

### school_memberships
id, school_id, profile_id, role, status, active_from, active_until, timestamps.

### academic_terms
id, school_id, academic_year, term, starts_on, ends_on, status.

### teachers
id, school_id, profile_id, teacher_code, display_name, status, timestamps, deleted_at.

### classes
id, school_id, academic_term_id, name, grade_level, status, timestamps, deleted_at.

### class_teachers
id, school_id, class_id, teacher_id, role_in_class, active_from, active_until, created_at.

### students
id, school_id, profile_id nullable, student_code, display_name, avatar_index, status, timestamps, deleted_at.
Do not use authoritative class_id.

### student_class_enrollments
id, school_id, student_id, class_id, academic_term_id, status, enrolled_at, left_at, timestamps, deleted_at.

### parents
id, school_id, profile_id, display_name, phone nullable, line_user_id nullable, line_linked_at nullable, status, timestamps.

### parent_student_links
id, school_id, parent_id, student_id, relationship, status, consent_id, linked_at, revoked_at, timestamps.

### parent_link_invitations
id, school_id, student_id, code_hash, expires_at, max_attempts, attempt_count, used_at, revoked_at, created_by, created_at.
Never store reusable plaintext code.

### assignments
id, school_id, class_id, title, description, assigned_at, due_at, max_score, status, timestamps, version, deleted_at.

### submissions
id, school_id, assignment_id, student_id, submitted_at, status, score, is_late, teacher_note, timestamps, version, deleted_at.
Unique active: assignment_id + student_id.

### activities
id, school_id, class_id, title, activity_date, max_score, status, timestamps, version, deleted_at.

### activity_scores
id, school_id, activity_id, student_id, score, note, timestamps, version, deleted_at.
Unique active: activity_id + student_id.

### tests
id, school_id, class_id, title, test_date, max_score, status, timestamps, version, deleted_at.

### test_scores
id, school_id, test_id, student_id, score, published_at, timestamps, version, deleted_at.
Unique active: test_id + student_id.

### attendance
id, school_id, class_id, student_id, attendance_date, status, note, timestamps, version, deleted_at.
Unique active: class_id + student_id + attendance_date.

### settings
id, school_id, scope_type, scope_id, key, value_json, timestamps.

### consents
id, school_id, parent_id, student_id, consent_type, policy_version, accepted_at, revoked_at, ip_hash, user_agent_summary, created_at.

### audit_log
append-only: id, school_id, actor_profile_id, action, entity_type, entity_id, target_student_id, before_json, after_json, metadata_json, occurred_at.

### notification_preferences
id, school_id, parent_id, event toggles, quiet_period, locale, updated_at.

### notification_outbox
id, school_id, event_type, parent_id, student_id, aggregate_id, payload_json, idempotency_key, status, retry_count, next_retry_at, created_at, processed_at.
Unique: school_id + idempotency_key.

### notifications_log
id, school_id, parent_id, student_id, type, channel, status, provider_message_id, error_code, created_at, sent_at.

### devices
id, school_id, device_name, device_type, status, last_seen_at, last_successful_sync_at, last_ack_revision, revoked_at, timestamps.

### sync_changes
revision bigint monotonic, school_id, entity_type, entity_id, operation, version, changed_at.

### sync_idempotency
id, school_id, device_id, idempotency_key, request_hash, response_json, processed_at.
Unique: school_id + device_id + idempotency_key.

## Index Strategy
Index common filter/relationship columns:
school_id, academic_term_id, class_id, student_id, teacher_id, parent_id, status, deleted_at, attendance_date, due_at, sync revision.

## Migration Rules
Every schema change is a versioned SQL migration.
Never modify a production-deployed migration.
Destructive changes require backup, staging verification, compatibility and rollback/forward-fix plans.


---

# EMBEDDED SOURCE 5: `docs/04_RLS_Authorization_Matrix.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — RLS & Authorization Matrix

## Principle
Frontend guards are UX only.
RLS / PostgreSQL grants / trusted server checks are security boundaries.

## Authorization Inputs
- auth.users.id
- user_profiles
- school_memberships
- class_teachers
- student/profile mapping
- parent_student_links
- consents
- device status for critical sync

## Role Summary
### Admin
Own-school management, school-wide reporting, authorized audit access. No cross-school access.

### Teacher
Assigned classes only; classroom students, learning records, attendance, scores, parent invitations by policy.

### Student
Self data only: profile, own class assignments, own submissions, own scores, own attendance.

### Parent
Linked child only and only with active link + active consent.

## Entity Matrix
| Entity | Admin | Teacher | Student | Parent |
|---|---|---|---|---|
| schools | own school | limited read | limited | limited |
| user_profiles | scoped | self/limited | self | self |
| school_memberships | manage own school | self read | self read | self read |
| academic_terms | manage | assigned context read | own context | linked context |
| teachers | manage | self/allowed peers | no | no |
| classes | own school | assigned | own class limited | linked child class limited |
| students | own school | assigned class | self | linked child |
| enrollments | own school | assigned class | own | linked child |
| assignments | manage | assigned class CRUD | own class read | linked child read |
| submissions | manage | assigned class | own | linked child read |
| activities/tests | manage | assigned class CRUD | own results | linked child results |
| attendance | manage | assigned class CRUD | own | linked child |
| settings | manage | allowed scope | own prefs | own prefs |
| parent links | manage | assigned student policy | no | own |
| consents | policy view | limited | no | own |
| audit_log | authorized | limited policy | no | no |

## Recommended Trusted Helpers
- is_active_member(profile_id, school_id)
- has_school_role(profile_id, school_id, role)
- teacher_has_class_access(profile_id, class_id)
- student_owns_student_record(profile_id, student_id)
- parent_has_active_link(profile_id, student_id)
- parent_has_active_consent(profile_id, student_id)

## Required Negative Tests
1. School A cannot read School B
2. Teacher cannot access unassigned class
3. Teacher cannot mutate student outside assigned class
4. Student cannot read another student
5. Parent cannot read unlinked child
6. Parent linked but consent revoked is denied
7. Suspended membership denied
8. Local role tampering denied by server
9. Revoked device denied for critical sync

## Service Role
Never in browser. Trusted server only. Service-role operations must still perform explicit authorization.

## RPC Security
Each RPC documents purpose, caller, school scope, required role, grants, invoker/definer mode, and transaction semantics.
SECURITY DEFINER requires safe search_path, explicit auth checks, minimal privilege, restricted EXECUTE.


---

# EMBEDDED SOURCE 6: `docs/05_Local_IndexedDB_Specification.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

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


---

# EMBEDDED SOURCE 7: `docs/06_Sync_Protocol_Specification.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

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


---

# EMBEDDED SOURCE 8: `docs/07_Offline_Authentication_Policy.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Offline Authentication Policy

## Principle
Offline access is Trusted Device Offline Unlock, not offline Supabase password authentication.

## Eligibility
Baseline v3.1: Teacher Board only.

## Enrollment
1. Teacher logs in online
2. Server validates user
3. Validate school membership
4. Register/validate device
5. Optional local PIN setup
6. Store protected PIN verifier only
7. Establish offline grace metadata

## Offline Unlock
No internet:
- choose cached authorized teacher profile
- enter PIN
- verify locally
- check grace period
- unlock cached authorized workspace

No new cloud session is created.

## Default Grace
24 hours, configurable within security policy.

## Offline Allowed
- open cached class
- view local students
- attendance
- activity score
- supported classroom score workflows
- local backup
- sync diagnostics

## Offline Forbidden
- create admin
- change role
- membership administration
- credential reset
- device trust management
- final parent linking
- security settings
- privileged consent administration
- destructive school-wide operations

## Reconnect
Before push:
- validate auth/session
- validate account active
- validate membership active
- validate device active

If revoked, block cloud sync and enter restricted recovery state.

## PIN Security
Never store raw PIN.
Use modern PIN/password verifier, attempt limits, local lockout/backoff, and no plaintext logs.

## Logout
Clear sensitive in-memory state, close workspace, prevent previous teacher exposure, preserve unsynced protected data per policy.


---

# EMBEDDED SOURCE 9: `docs/08_Security_Specification.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Security Specification v1.0

## Objectives
1. Student data confidentiality
2. Data integrity
3. Correct authorization
4. Auditability
5. Availability
6. Recoverability

## Secrets
Never expose in client:
- Supabase service role
- LINE channel secret
- LINE access token
- HMAC/pepper secret
- private service credentials

Never commit secrets to Git.

## Authentication
Use Supabase Auth.
Support session refresh, logout, suspended account denial, membership enforcement.
Admin MFA is recommended as production requirement.

## RLS
RLS ON for exposed business tables.
Automated negative tests required.

## Validation
Critical input validated on both client and server.
Client validation is not security boundary.

## XSS
Avoid unsafe HTML injection. Any rich text requires approved sanitization strategy.

## Headers
Production:
- CSP
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- HTTPS
- clickjacking protection as appropriate

## CORS
Explicit allowed origins. Avoid wildcard for privileged endpoints.

## Rate Limits
Apply to sensitive auth flows, parent link attempts, webhooks/abuse boundaries, export, privileged endpoints.

## Parent Link
6-digit code uses keyed HMAC/pepper with expiry, single use, attempt limit, rate limit, revoke, failed-attempt audit.

## Audit
Append-only, trusted-layer creation.
Never log passwords, full tokens, or secrets.

## Devices
Device ID is not a credential.
Revoked device critical sync is rejected.

## Backup
PII backup requires encryption, integrity check, schema validation, school scope validation.

## Dependency Security
CI includes dependency vulnerability scan and secret scan.
Critical/High unresolved defects block production release.

## File Upload
If submission attachments are added: validate type/size, private storage, authorization, no public bucket by default.

## Security Tests
- cross-school read
- teacher cross-class
- student cross-student
- parent unlinked child
- revoked consent
- suspended account
- modified client role
- revoked device
- idempotency abuse
- parent brute-force
- export scope bypass


---

# EMBEDDED SOURCE 10: `docs/09_API_Mutation_Boundary.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — API & Mutation Boundary Specification v1.0

## Purpose
Defines boundaries between UI, Dexie, Sync Engine, PostgREST, PostgreSQL RPC, Edge Functions, and external services.

## Principles
- Reads and writes may use different paths
- Standard reads use PostgREST + RLS
- Critical local-first mutations never write cloud directly from UI
- Critical mutations go through sync mutation boundary
- External providers go through trusted server
- Service-role key never in client
- Authorization checked server-side
- Audit generated by trusted mutation layer
- Client school_id/role are not authoritative

## Logical Layers
UI → Application/Domain Services → Read Repository / Local Mutation Repository → Dexie → sync_queue → Sync Engine → syncPush/syncPull → trusted mutation/read boundaries → PostgreSQL.

## Standard Reads
React → Supabase Client → PostgREST → PostgreSQL RLS.
Examples: own school profile, assigned classes, authorized student lists, assignment metadata, linked-child data, self data.

## Critical Local-first Mutations
Examples:
- attendance
- activity score
- test score
- grading
- offline-enabled assignment updates

Flow:
User Action → Local validation → Dexie transaction (projection + queue) → commit → Local Saved → syncPush → trusted cloud mutation boundary.

UI must not directly `upsert` critical tables via PostgREST.

## Server Mutation Processing
1. JWT
2. profile
3. membership
4. device
5. protocol
6. validation
7. authorized scope
8. idempotency
9. base version
10. conflict
11. domain mutation
12. audit
13. sync_changes
14. notification_outbox if needed
15. commit
16. idempotent response
17. authoritative version/revision

## RPC
Use for atomic domain mutation, version checks, enrollment transfer, score/attendance mutation, audit/change-journal/outbox creation.
Document allowed caller, school scope, input/output, EXECUTE grants, transaction semantics.

SECURITY DEFINER requires safe search_path, explicit auth and membership checks, minimal privilege, restricted EXECUTE.

## Edge Functions
Use for:
- LINE API
- webhooks
- parent-link secure code
- account/device privileged operations
- bulk import/export orchestration
- secret-bound external services

Prefer caller context/RLS where appropriate; service privilege only where required.

## Parent Link API
Teacher creates invitation → server generates code → plaintext returned once → HMAC stored → parent authenticates → rate-limited verification → student confirmation → consent → link active → invitation invalidated.

## LINE
Client never calls LINE directly.
Domain transaction → notification_outbox → dispatcher → Edge Function → LINE.

## Attendance Mutation
Validate teacher assignment, academic context, student active enrollment, unique class/student/date, version, audit, sync journal.

## Score Mutation
Validate teacher class access, item/class relationship, student eligibility, score bounds, version conflict, audit.

## Enrollment Transfer
Close active enrollment + create new enrollment + preserve history + audit + sync_changes in one atomic transaction.

## Delete
Client operation=delete → server sets deleted_at, increments version, audits, appends tombstone change. No physical delete in normal sync path.

## Standard Error Codes
AUTH_REQUIRED, SESSION_EXPIRED, FORBIDDEN, MEMBERSHIP_INACTIVE, DEVICE_REVOKED, VALIDATION_ERROR, NOT_FOUND, CONFLICT, SYNC_CONFLICT, RATE_LIMITED, CLIENT_UPDATE_REQUIRED, PROVIDER_ERROR, INTERNAL_ERROR.

## Boundary Matrix
| Operation | Dexie | PostgREST | RPC | Edge |
|---|---:|---:|---:|---:|
| Standard read | cache/projection | yes | optional | no |
| Attendance write | yes | no direct | yes | optional |
| Score write | yes | no direct | yes | normally no |
| Class read | yes/cache | yes | optional | no |
| Parent link verify | no final auth | no | optional | yes |
| LINE notify | no | no | outbox state | yes |
| CSV import | preview | no direct bulk | helper | orchestration |
| Export | limited | possible | possible | privileged |
| Audit write | no direct | no | yes | trusted process |


---

# EMBEDDED SOURCE 11: `docs/10_Implementation_Roadmap.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Production Implementation Roadmap v1.0

## Development Order
Architecture → Data Integrity → Authorization → Local-first Foundation → Domain Features → Sync Hardening → Production QA.

## Phase 0 — Foundation
Tasks:
0.1 Repository foundation  
0.2 React/Vite app shell  
0.3 Design system foundation  
0.4 PWA foundation  
0.5 Environment foundation  
0.6 Supabase foundation  
0.7 Identity/core schema: schools, user_profiles, school_memberships, teachers, academic_terms, classes, class_teachers, students, enrollments  
0.8 Authorization/RLS foundation  
0.9 Device foundation  
0.10 Dexie foundation  
0.11 Local transaction invariant  
0.12 Sync contract  
0.13 Server monotonic revision foundation  
0.14 Idempotency foundation  
0.15 Test infrastructure  
0.16 CI

Phase 0 Exit:
- build/typecheck/lint pass
- RLS negative tests pass
- local persistence works
- transaction+queue invariant passes
- monotonic revision passes
- idempotency contract passes
- PWA install smoke passes
- CI green

## Phase 1 — School/Class/Student Core
- school settings
- academic terms
- teacher management
- class management
- class-teacher assignments
- student CRUD
- enrollment/transfer
- CSV import
- avatar
- board navigation
- Admin/Teacher UI

Exit: teacher isolation, enrollment history, avatar persistence, CSV validation, no production demo data.

## Phase 2 — Learning Records
- assignments
- submissions
- activities
- tests
- scores
- missing-category policy
- penalties
- grade
- leaderboard
- audit integration

Exit: deterministic score, no NaN, correct category rules, conflict-safe scores, audit, portal/leaderboard consistency.

## Phase 3 — Attendance
- attendance domain/UI
- Present All
- overrides
- monthly/term stats
- penalties
- audit
- local-first workflow

Exit: offline attendance survives restart and sync.

## Phase 4 — Sync Hardening
- batching
- pull cursor
- retry/backoff
- idempotency hardening
- conflicts
- needs_review
- tombstones
- stale device protection
- device acknowledgement
- purge eligibility
- diagnostics
- old protocol compatibility

## Phase 5 — Parent / PDPA / LINE
- parent accounts
- secure link invitations
- HMAC code
- rate limits
- consent
- revoke
- LINE linking/webhook signature
- preferences
- outbox
- dispatcher
- retry/logging

## Phase 6 — Reports / Backup / Operations
- student/class/attendance/score/grade/missing/risk reports
- CSV/PDF
- local encrypted backup/restore
- diagnostics
- runbooks

## Phase 7 — Production QA
- security suite
- real board
- staging UAT
- role workflows
- storage/quota
- reconnect/offline
- migration compatibility

## Phase 8 — Production Release
1. freeze candidate
2. backup verification
3. staging migration
4. staging smoke
5. production migration
6. frontend deploy
7. edge functions deploy
8. production smoke
9. monitor
10. sign-off

## AI Development Rule
One bounded task at a time.
Antigravity/Codex must inspect → plan → implement bounded task → test → report.
Do not let multiple coding agents modify same branch concurrently without explicit coordination.


---

# EMBEDDED SOURCE 12: `docs/11_Acceptance_Test_Plan.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Production Acceptance Test Plan v1.0

## Phase 0
- React/Vite/TS build
- TypeScript strict
- lint
- PWA installable
- Dexie schema initialized
- local migration tests
- Supabase connectivity
- Auth foundation
- RLS foundation
- queue invariant
- sync contract
- CI green

## Authentication
- all roles online login
- invalid password
- suspended account denied
- expired membership denied
- logout
- session refresh

## Offline Board
- first login offline denied
- trusted teacher offline unlock
- wrong PIN denied
- grace expiry restricted
- logout prevents prior workspace access
- reconnect revalidates auth/membership/device

## Isolation
- School A vs School B denied
- assigned/unassigned teacher
- student self/other
- parent linked/unlinked
- revoked consent/link denied

## Enrollment History
- enroll Class A
- transfer to B
- history A remains
- reports preserve historical class reference

## Offline Data
Load online → disconnect → attendance/activity score → close app → reopen → data survives.

## Queue
Offline mutation survives reload and pushes on reconnect.

## Idempotency
Repeated same mutation creates one logical record.

## Conflict
Two devices edit same critical record; no silent overwrite; audit preserved; needs_review if applicable.

## Tombstone
One device offline, another deletes, stale device reconnects; deleted record does not resurrect.

## Attendance
Present All, late/absent/leave, duplicate prevention, audit, stats.

## Scores
Default weights, missing-category normalization, student-missing-item policy, max_score=0 handling, penalties, clamp, rounding, no NaN/Infinity.

## Grade
80=A, 70=B, 60=C, 50=D, below 50=F including boundaries.

## Avatar
Unique in class, stable across rename/refresh/logout/sync, leaderboard consistency.

## Parent Link
Plaintext not stored, valid/invalid/expiry/single-use/revoke/rate-limit.

## Consent
Accept/revoke, policy version, access removal, audit.

## LINE
Secure linking, invalid webhook denied, preferences respected, provider failure does not rollback classroom data, retry and dedupe work.

## Outbox
Educational transaction commits independently of provider; outbox retries.

## CSV
Valid, invalid header, duplicate code, encoding, row errors, preview, no silent partial import.

## Export
Authorized scopes only, audit, generated time/filter context.

## Backup
Encrypted PII, no secrets/tokens, checksum, preview, schema and school validation, transactional restore.

## Storage
Persistence status checked, denial handled, quota reported, low-space warning, unsynced queue never auto-deleted.

## PWA
Install, standalone, offline restart, safe service-worker update with unsynced data.

## Real Device
Touch, typography, stylus, fullscreen, offline/restart, IndexedDB, quota.

## Security
RLS negative suite, secret scan, dependency scan, CSP, CORS, XSS, parent brute-force, export scope, revoked device, client-role tampering.

## Migration/Recovery
Staging migration, local schema migration, queue preservation, old client compatibility, restore drill.

## Production Sign-off
Requires Product Owner, Technical Owner, QA, Security Review acknowledgement, Deployment Owner.
No known Critical/High release-blocking defect.


---

# EMBEDDED SOURCE 13: `docs/12_AI_Development_Controller.md`

> **Source preservation note:** The content below is embedded from the original uploaded source and should be treated as that source document.

# Smart Classroom — Antigravity Development Controller v1.0

You are the implementation agent for the production Smart Classroom / Classroom Management system.

## Source of Truth
Before doing any work:
1. Read `README.md`.
2. Read every file under `docs/` in numeric order.
3. Treat `docs/01_Smart_Classroom_Master_Spec_v3.1.md` as the Single Source of Truth.
4. Treat `docs/02_Architecture_Decisions.md` as approved architecture.
5. Do not change architecture, data model, authorization boundary, sync protocol, or offline policy without Owner approval and an ADR/Change Request.

## Absolute Rules
Never:
- reduce requirements without approval
- disable RLS to make a feature work
- hardcode credentials
- commit secrets
- create production demo data
- bypass local sync queue for critical local-first mutations
- silently overwrite critical conflicts
- hard-delete synced entities in normal sync path
- let client authoritatively set role or school scope
- modify a production-deployed migration
- claim Production Ready before release gates pass

## Approved Stack
- React + TypeScript + Vite
- CSS Modules / structured design system
- PWA Manifest + Service Worker
- Dexie + IndexedDB
- Supabase PostgreSQL
- Supabase Auth
- PostgreSQL Grants + RLS
- PostgreSQL RPC + Supabase Edge Functions
- LINE Messaging API
- Vitest + Playwright
- GitHub Actions

## Local-first Rule
User Action → Local Validation → Dexie transaction → domain update + sync_queue → commit → Local Saved → background sync.

## Critical Mutation Boundary
sync_queue → authenticated push → membership/device/authz → idempotency → base_version/conflict → transaction → domain mutation + audit + sync_changes + notification_outbox → commit → authoritative version/revision → queue acknowledge.

## Current Authorized Phase
PHASE 0 — FOUNDATION only.

Do not implement full Attendance, Score, Assignment, Parent Portal, LINE, or Reports during Phase 0 except foundation contracts required by the spec.

## FIRST RUN — ANALYSIS ONLY
For the first run:

DO NOT WRITE SOURCE CODE.  
DO NOT INSTALL PACKAGES.  
DO NOT CREATE DATABASES.  
DO NOT RUN MIGRATIONS.  
DO NOT MODIFY PROJECT FILES.

Perform only:

A. Specification Understanding  
B. Repository Assessment  
C. Conflict / Ambiguity Report  
D. Database Architecture Validation  
E. RLS / Authorization Validation  
F. Local IndexedDB Projection Validation  
G. Sync Architecture Validation  
H. API / Mutation Boundary Validation  
I. Phase 0 Implementation Plan  
J. Proposed File / Folder Plan  
K. Phase 0 Test Plan  
L. Risk Register  
M. Decisions Requiring Owner Approval  

Then STOP and wait for Owner approval.

## AFTER OWNER APPROVAL
Work one bounded task at a time.

For each task:
1. Inspect relevant files.
2. Confirm applicable spec/ADR requirements.
3. Implement the minimal correct change.
4. Run typecheck.
5. Run lint.
6. Run relevant tests.
7. Inspect failures.
8. Fix root cause, not symptoms.
9. Re-run checks.
10. Review security and spec compliance.
11. Report files created/modified.
12. Report tests and results.
13. Report remaining risks.
14. STOP unless explicitly authorized for the next task.

## Conflict Behavior
If a requirement conflict is found:
- stop the affected task
- document the conflict
- explain impact
- propose options
- wait for Owner decision

Do not invent architecture.

## Quality Priority
1. Data Integrity
2. Security
3. Offline Reliability
4. Authorization
5. Maintainability
6. Performance
7. UX
8. Visual Polish

## Primary Goal
Do not build a UI that only looks functional.
Build a system whose data does not disappear, whose authorization does not leak, whose offline mode works, whose sync is deterministic, whose audits are trustworthy, and which can be deployed to real schools.


---

# E. EMBEDDED ONE-SHOT END-TO-END PRODUCTION BUILD MASTER PROMPT v4.0

> This execution prompt is embedded in full. Where it says to read separate `README.md` or `docs/` files, use the embedded authoritative source sections above. The Owner Execution Override in Section B governs execution cadence for this v5.0 single-file package.

# SMART CLASSROOM v3.1
# ONE-SHOT END-TO-END PRODUCTION BUILD MASTER PROMPT

Prompt Version: 4.0
Product: Smart Classroom / Classroom Management
Build Mode: Continuous End-to-End Production Build
Target: Real deployable production-capable system
Primary UI Language: Thai
Code / identifiers / types / comments: English
Primary Devices:
- Interactive Board (Android / Chromium)
- Desktop Web
- Tablet Web
- Mobile Web
- Installable PWA

IMPORTANT:
This is NOT a demo.
This is NOT a mockup.
This is NOT a UI-only prototype.
This is NOT a disposable MVP.

Build a real, modular, secure, offline-capable Smart Classroom
that can be deployed, configured for a school, used immediately,
and extended in future versions.


# ============================================================
# 1. YOUR ROLE
# ============================================================

You are the complete implementation team for this project.

Act simultaneously as:

- Senior Full-Stack Engineer
- Software Architect
- React / TypeScript Engineer
- PostgreSQL Database Architect
- Supabase Engineer
- RLS / Authorization Engineer
- Security Engineer
- Offline-first Application Engineer
- Sync Engine Engineer
- PWA Engineer
- QA Automation Engineer
- DevOps Engineer
- Accessibility Engineer
- Interactive Board UX Engineer

Your job is to implement the entire Smart Classroom system,
test it, fix failures, document it, and bring the repository
to the highest production-ready state possible.


# ============================================================
# 2. PRODUCT OWNER AUTHORIZATION
# ============================================================

The Product Owner explicitly authorizes CONTINUOUS IMPLEMENTATION.

You are authorized to execute:

Phase 0
→ Phase 1
→ Phase 2
→ Phase 3
→ Phase 4
→ Phase 5
→ Phase 6
→ Phase 7
→ Phase 8

continuously.

DO NOT stop after each normal task or phase merely to ask:

"Should I continue?"

When a phase Exit Gate passes:

record results
→ continue automatically to the next phase.

When something fails:

inspect
→ identify root cause
→ fix
→ rerun
→ regression test
→ continue when green.

You may stop and request Owner input ONLY when:

1. A required external production secret or credential does not exist.
2. An irreversible production action requires confirmation.
3. Two authoritative requirements genuinely conflict.
4. A proposed solution changes the approved architecture.
5. A proposed solution weakens Security / RLS / Authorization.
6. A proposed solution changes Offline Authentication policy.
7. A proposed solution changes the Sync security boundary.
8. A destructive database operation cannot be safely resolved.
9. A third-party account action must be completed manually by Owner.

Missing credentials must NOT stop unrelated implementation.

Implement integrations fully using environment variables
and leave only configuration values for the Owner.


# ============================================================
# 3. SOURCE OF TRUTH
# ============================================================

Before writing implementation code:

Read:

README.md

docs/01_Smart_Classroom_Master_Spec_v3.1.md
docs/02_Architecture_Decisions.md
docs/03_Database_Specification.md
docs/04_RLS_Authorization_Matrix.md
docs/05_Local_IndexedDB_Specification.md
docs/06_Sync_Protocol_Specification.md
docs/07_Offline_Authentication_Policy.md
docs/08_Security_Specification.md
docs/09_API_Mutation_Boundary.md
docs/10_Implementation_Roadmap.md
docs/11_Acceptance_Test_Plan.md
docs/12_AI_Development_Controller.md

Authority order:

01 Master Specification v3.1
→ 02 Architecture Decisions
→ 03 Database Specification
→ 04 RLS / Authorization
→ 05 IndexedDB
→ 06 Sync Protocol
→ 07 Offline Authentication
→ 08 Security
→ 09 API Mutation Boundary
→ 10 Roadmap
→ 11 Acceptance
→ 12 AI Controller

Master Specification v3.1 is the Single Source of Truth.

If implementation conflicts with the specification:

STOP the affected implementation only,
document the conflict,
do NOT silently alter the specification.


# ============================================================
# 4. OWNER-APPROVED ADDITION — ANIMATED STUDENT AVATAR
# ============================================================

The Product Owner explicitly approves adding an enhanced
Animated Student Avatar system beyond the minimum v3.1 avatar requirement.

This enhancement must preserve backward compatibility.

Before changing the database contract for the avatar enhancement:

create an ADR / Change Request documenting:

- reason
- affected modules
- database impact
- sync impact
- migration impact
- test impact
- backward compatibility

Do NOT remove the existing avatar_index identity concept.

Extend it safely.


# ============================================================
# 5. ABSOLUTE NON-NEGOTIABLE RULES
# ============================================================

NEVER:

- reduce requirements without approval
- disable RLS
- weaken authorization to make a feature work
- hardcode credentials
- commit secrets
- expose service-role key in browser
- expose LINE secrets in browser
- use frontend guards as the security boundary
- allow client role/school scope to be authoritative
- bypass sync_queue for critical local-first mutations
- silently overwrite critical conflicts
- hard-delete normal synchronized entities
- destroy unsynced local mutations
- modify production-deployed migrations
- seed fake school/student/teacher/class/score into production
- claim Production Ready while Critical/High blockers remain
- fabricate test results
- remove failing security tests to obtain green CI
- turn TypeScript strict mode off
- replace real backend operations with fake local data

Quality priority:

1. Data Integrity
2. Security
3. Offline Reliability
4. Authorization
5. Maintainability
6. Performance
7. UX
8. Visual Polish


# ============================================================
# 6. LOCKED TECHNOLOGY STACK
# ============================================================

Frontend:
React + TypeScript + Vite

TypeScript:
strict = true

Styling:
CSS Modules
Design Tokens
Structured Component System

PWA:
Web App Manifest
Service Worker

Local Database:
Dexie.js + IndexedDB

Cloud Platform:
Supabase

Cloud Database:
PostgreSQL

Authentication:
Supabase Auth

Authorization:
PostgreSQL Grants + RLS

Transactional Domain Mutations:
PostgreSQL RPC

Privileged / Secret Operations:
Supabase Edge Functions

Storage:
Supabase Storage where required

Notifications:
LINE Messaging API / LINE OA

Tests:
Vitest
Playwright

Source Control:
Git / GitHub

CI/CD:
GitHub Actions

Do NOT introduce a second backend or database
unless explicitly approved through Change Request.


# ============================================================
# 7. HIGH LEVEL ARCHITECTURE
# ============================================================

Interactive Board / Desktop / Tablet / Mobile
                 │
                 ▼
          React + TypeScript
                 │
       ┌─────────┴─────────┐
       │                   │
 Local Projection       Online Reads
       │                   │
 Dexie / IndexedDB    Supabase Client
       │                   │
  sync_queue           PostgREST + RLS
       │                   │
       └──── Sync Engine ──┘
                 │
                 ▼
             Supabase
     ┌───────────┼────────────┐
     │           │            │
PostgreSQL      RPC      Edge Functions
 + RLS           │            │
     │           │            │
     └─ audit / sync / outbox ┘
                              │
                              ▼
                           LINE OA


# ============================================================
# 8. PRODUCT TARGET
# ============================================================

The finished application must provide:

- Authentication
- Role Management
- School Management
- Academic Terms
- Teacher Management
- Class Management
- Student Management
- Student Enrollment History
- Teacher/Class Assignment
- Assignment Management
- Student Submission
- Classroom Activities
- Tests
- Scores
- Grades
- Attendance
- Animated Student Avatar
- Leaderboard
- Student Portal
- Parent Portal
- Parent Linking
- Consent / PDPA
- LINE OA Notifications
- CSV Import
- CSV Export
- PDF Export
- Reports
- Offline Classroom
- Local Persistence
- Two-way Sync
- Persistent Idempotency
- Conflict Handling
- Tombstones
- Device Management
- Sync Diagnostics
- Audit Log
- Backup / Restore
- PWA Installation
- Production Security
- Staging / Production Deployment Support


# ============================================================
# 9. USERS AND ROLES
# ============================================================

Required roles:

admin
teacher
student
parent

Identity architecture:

user_profiles
= global user identity

school_memberships
= school + role + status + active period

A user may hold multiple roles.

Examples:

Teacher + Parent
Admin + Teacher

Client role is UX state only.

Server is authoritative.


# ============================================================
# 10. AUTHENTICATION
# ============================================================

Implement:

- Online Login
- Session Verification
- Session Refresh
- Logout
- Invalid Credential
- Expired Session
- Suspended Account Rejection
- Inactive Membership Rejection
- School Context Resolution
- Multiple Role Resolution
- Device Validation

Required UI states:

- loading
- invalid credentials
- suspended account
- inactive membership
- session expired
- network error
- offline state
- permission denied


# ============================================================
# 11. OFFLINE TEACHER BOARD AUTHENTICATION
# ============================================================

Offline access is:

Trusted Device Offline Unlock

NOT offline Supabase password authentication.

Eligibility baseline:

Teacher Board only.

First setup:

Teacher Online Login
→ verify user
→ verify school membership
→ register / validate device
→ optional local PIN setup
→ store protected PIN verifier
→ establish grace metadata

Offline:

No Network
→ select cached authorized teacher
→ enter PIN
→ verify locally
→ validate grace
→ unlock cached authorized workspace

Default grace:

24 hours

Never store raw PIN.

Reconnect before critical push:

verify auth
verify user status
verify membership
verify device

If device revoked:

block cloud sync
and enter restricted recovery state.


# ============================================================
# 12. FIRST SCHOOL SETUP
# ============================================================

Production must NOT rely on fake demo records.

Implement a first real school setup process.

Required setup:

- School
- Academic Year
- Academic Term
- First Admin
- Default School Settings
- Score Settings
- Privacy Policy Version
- Consent Policy Version
- Optional LINE Configuration

After that Admin can create/import:

- Teachers
- Classes
- Students
- Teacher Assignments
- Enrollments

Synthetic fixtures may exist only under:

- development
- automated test
- E2E test

Never production seed.


# ============================================================
# 13. REQUIRED DATABASE ENTITIES
# ============================================================

Cloud:

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

Also create local-only metadata stores as necessary for:

- authorized offline session metadata
- trusted device metadata
- avatar projection metadata


# ============================================================
# 14. DATABASE CONVENTIONS
# ============================================================

Use:

UUID Primary Keys
timestamptz
explicit school_id scoping
server-authoritative timestamps
server-authoritative version
versioned migrations
soft delete for syncable entities

Appropriate syncable entities should support:

id
school_id
created_at
updated_at
server_updated_at
version
created_by
updated_by
deleted_at

Server owns:

- authoritative version
- security scope
- audit actor
- authoritative timestamps
- sync revision


# ============================================================
# 15. ACADEMIC STRUCTURE
# ============================================================

Use:

academic_terms

Fields include:

school_id
academic_year
term
starts_on
ends_on
status

classes references:

academic_term_id

Do NOT use students.class_id as authoritative class membership.

Use:

student_class_enrollments

Student transfer:

close active enrollment
→ preserve historical enrollment
→ create new enrollment

Historical reports must remain correct.


# ============================================================
# 16. ADMIN PORTAL
# ============================================================

Create a real Thai Admin Portal.

Recommended navigation:

แดชบอร์ด
โรงเรียน
ปีการศึกษา
ภาคเรียน
ครู
บัญชีผู้ใช้
ห้องเรียน
การมอบหมายครู
นักเรียน
ประวัติการลงทะเบียน
การย้ายห้อง
งาน
กิจกรรม
แบบทดสอบ
การส่งงาน
คะแนน
เกรด
การเข้าเรียน
ผู้ปกครอง
การเชื่อมผู้ปกครอง
ความยินยอม
LINE
การแจ้งเตือน
รายงาน
นำเข้า CSV
ส่งออก CSV/PDF
Audit Log
อุปกรณ์
สถานะการซิงก์
Backup / Restore
ตั้งค่า
สถานะระบบ

Admin scope:

own school only.

No cross-school access.


# ============================================================
# 17. TEACHER PORTAL
# ============================================================

Required:

แดชบอร์ดครู
ห้องเรียนของฉัน
รายชื่อนักเรียน
เช็กชื่อ
งาน
กิจกรรม
แบบทดสอบ
การส่งงาน
คะแนน
เกรด
Leaderboard
Student Avatars
Parent Invitation
รายงาน
สถานะ Sync
Backup

Teacher only sees assigned classes.


# ============================================================
# 18. STUDENT PORTAL
# ============================================================

Required:

หน้าแรก
โปรไฟล์
Animated Student Avatar
งานของฉัน
ส่งงาน
สถานะการส่งงาน
กิจกรรม
แบบทดสอบ
คะแนน
เกรด
การเข้าเรียน
Leaderboard
อันดับของฉัน
ความสำเร็จ

Student must see self data only.


# ============================================================
# 19. PARENT PORTAL
# ============================================================

Required:

หน้าแรก
บุตรหลานของฉัน
งาน
งานที่ยังไม่ส่ง
คะแนน
เกรด
การเข้าเรียน
การเชื่อมบัญชี
Consent / PDPA
LINE
Notification Preferences

Parent access requires:

active parent_student_link
+
active consent


# ============================================================
# 20. ASSIGNMENT SYSTEM
# ============================================================

Teacher can:

Create
Edit
Publish
Close
Archive

Assignment fields:

id
school_id
class_id
title
description
assigned_at
due_at
max_score
status
version
deleted_at

Student can:

- view assignment
- submit work
- view submission status
- view teacher note
- view published score

Submission must enforce:

one active logical submission
per assignment + student


# ============================================================
# 21. ACTIVITY SYSTEM
# ============================================================

Implement:

- create activity
- activity date
- max score
- status
- student scoring
- teacher notes
- offline scoring
- audit
- sync


# ============================================================
# 22. TEST SYSTEM
# ============================================================

Implement:

- create test
- test date
- max score
- status
- student scores
- published score
- audit
- synchronization


# ============================================================
# 23. SCORE ENGINE
# ============================================================

Default:

Assignment = 60%
Activity   = 30%
Test       = 10%

Passing Score = 60%

Late Penalty Baseline = 10%

Category percent:

SUM(score) / SUM(applicable max score) × 100

Missing Category:

If the WHOLE CLASS has no eligible/published item
in a category:

temporarily remove category
→ re-normalize remaining weights

If a category exists but one student is missing an item:

apply missing-item policy.

Do NOT redistribute category weight only for that student.


# ============================================================
# 24. SCORE SAFETY
# ============================================================

Implement:

- clamp 0–100
- deterministic rounding
- max_score=0 policy
- missing item policy
- excused item policy
- published/unpublished policy
- penalties

Never allow UI output:

NaN
Infinity
-Infinity


# ============================================================
# 25. GRADE SYSTEM
# ============================================================

Default:

80–100     = A
70–79.99   = B
60–69.99   = C
50–59.99   = D
Below 50   = F

Test boundaries explicitly.


# ============================================================
# 26. ATTENDANCE
# ============================================================

Statuses:

present = มาเรียน
late    = สาย
absent  = ขาด
leave   = ลา

Teacher Board must include:

"มาเรียนทั้งหมด"

Teacher can override individual students.

Unique logical record:

class
+
student
+
attendance_date

Missing attendance is NOT automatically absent
unless school policy explicitly enables this.

Every attendance modification is audited.


# ============================================================
# 27. ANIMATED STUDENT AVATAR — CORE FEATURE
# ============================================================

Implement a proprietary Smart Classroom Student Avatar system.

Do NOT copy characters from another product.

Reference direction only:

pixel-inspired student character
+
modern educational game
+
cute polished appearance
+
school-friendly
+
cool
+
clean
+
not overly fantasy
+
not childish

The Student Avatar is not decorative only.

It is a persistent student identity.


# ============================================================
# 28. AVATAR USAGE
# ============================================================

The SAME student avatar must appear consistently in:

- Student Profile
- Teacher Student List
- Classroom UI
- Leaderboard
- Total Score Board
- Achievement UI
- Student Summary Card

Never randomly regenerate Avatar during render.


# ============================================================
# 29. AVATAR ARCHETYPES
# ============================================================

Start with at least 18 original education-oriented archetypes:

01 สายวิทยาศาสตร์
02 สายเทคโนโลยี
03 โปรแกรมเมอร์
04 นักอ่าน
05 นักคิด
06 นักคณิตศาสตร์
07 นักสำรวจ
08 นักธรรมชาติ
09 สายศิลปะ
10 นักดนตรี
11 สายกีฬา
12 ผู้นำห้องเรียน
13 นักประดิษฐ์
14 นักออกแบบ
15 นักสื่อสาร
16 นักทดลอง
17 นักสร้างสรรค์
18 นักแก้ปัญหา

Create at least:

8 palette variants per archetype.

Minimum initial combinations:

18 × 8 = 144


# ============================================================
# 30. AVATAR DESIGN RULES
# ============================================================

Characters should feel like students.

Allowed:

- school clothing
- hoodie
- cardigan
- backpack
- notebook
- tablet
- headphones
- books
- simple science equipment
- paint palette
- sports item
- learning accessory
- badge
- small educational prop

Avoid:

- combat weapons
- blood
- violent weapons
- horror
- dark fantasy
- heavy armor
- excessive particle effects
- gambling-style reward visuals
- humiliating animations


# ============================================================
# 31. AVATAR DATA
# ============================================================

Preserve:

students.avatar_index

for base deterministic identity / compatibility.

Create an additive backward-compatible avatar enhancement.

Example logical configuration:

avatar_index
avatar_config
avatar_animation_set

avatar_config may support:

archetype
palette
skinTone
hair
hairColor
outfit
accentColor
accessory
badge

Do not make name determine avatar identity.


# ============================================================
# 32. AVATAR PERSISTENCE
# ============================================================

Avatar must remain unchanged after:

- page refresh
- logout
- login
- PWA restart
- sync
- rename
- device change
- class transfer

Profile Avatar
=
Student List Avatar
=
Leaderboard Avatar
=
Board Avatar


# ============================================================
# 33. AVATAR ANIMATION
# ============================================================

Minimum animations:

idle
blink
wave
study
celebrate

Recommended:

thinking
achievement
levelUp
attention
happy

Preferred implementation:

Inline SVG
+
CSS animation

or another lightweight approach compatible with v3.1.

Avoid:

large GIF
large video
heavy per-avatar runtime

Respect:

prefers-reduced-motion

Provide static fallback.


# ============================================================
# 34. AVATAR IDLE BEHAVIOR
# ============================================================

Idle should be subtle:

- small breathing movement
- light body bob
- occasional blink
- small head movement
- small accessory movement

Do not create distracting constant motion.


# ============================================================
# 35. LEADERBOARD AVATAR BEHAVIOR
# ============================================================

Rank 1:

subtle celebrate
gold accent
small sparkle

Rank 2:

wave / happy idle

Rank 3:

happy idle

Other students:

standard idle

Rank increases:

brief celebrate

Rank decreases:

neutral / thinking

NEVER:

cry
shame
humiliate
punish visually


# ============================================================
# 36. STUDENT PROFILE CARD
# ============================================================

Show:

Animated Avatar
Student Name
Class
Student Number
Avatar Theme
Total Score
Grade
Class Rank
Attendance Summary
Learning Streak
Achievements


# ============================================================
# 37. CLASS TOTAL SCORE BOARD
# ============================================================

Interactive Board leaderboard should support:

Rank
Animated Avatar
Student Name
Total Score
Grade
Rank Change

Top 3 may use:

Gold
Silver
Bronze

Board typography must be readable from classroom distance.

Do not visually shame students at lower ranks.

Provide classroom display policy controls if appropriate.


# ============================================================
# 38. LOCAL DATABASE
# ============================================================

Dexie should contain only authorized offline projection.

Typical local stores:

classes
academic_terms
students
student_class_enrollments
assignments
submissions
activities
activity_scores
tests
test_scores
attendance
settings
minimal profile data
avatar data

sync_queue
sync_state
local_session_metadata
device_metadata

Do NOT replicate by default:

school-wide audit logs
full parent directory
all notification logs
unrelated classes
global admin/security records


# ============================================================
# 39. LOCAL-FIRST MUTATION CONTRACT
# ============================================================

Critical classroom action:

User Action
→ Local Validation
→ Dexie Transaction
     Domain Record
     +
     sync_queue
→ Commit
→ UI shows "บันทึกในเครื่องแล้ว"
→ Background Sync

Never display "saved" before transaction commits.

Domain mutation and queue append should be atomic.

Forbidden:

domain write success
+
missing sync queue entry


# ============================================================
# 40. SYNC QUEUE
# ============================================================

Each queued mutation should contain appropriate:

queue_id
entity_type
entity_id
operation
payload
base_version
idempotency_key
attempt_count
next_retry_at
last_error
created_at

Queue must survive:

- refresh
- application restart
- network failure
- PWA restart

Schema migration must preserve unsynced queue.


# ============================================================
# 41. SYNC PUSH
# ============================================================

Server flow:

Verify JWT
→ Resolve Profile
→ Verify Active Membership
→ Verify Device
→ Verify Sync Protocol
→ Validate Payload
→ Verify Authorization
→ Check Idempotency
→ Load Current Version
→ Evaluate Conflict
→ Apply Domain Mutation
→ Append Audit
→ Append sync_changes
→ Create notification_outbox event when required
→ Commit
→ Persist Idempotent Response
→ Return Authoritative Version + Revision


# ============================================================
# 42. SYNC PULL
# ============================================================

Use:

last_pull_revision

Logical pull:

revision > last_pull_revision
ORDER BY revision

Return:

- changed records
- tombstones
- next_revision
- server_time
- minimum_supported_protocol

NEVER use client clock as pull authority.


# ============================================================
# 43. SYNC PROTOCOL VERSIONING
# ============================================================

Every sync request should carry:

clientVersion
localSchemaVersion
syncProtocolVersion

Server may respond:

CLIENT_UPDATE_REQUIRED

But must NEVER destroy local unsynced data.


# ============================================================
# 44. PERSISTENT IDEMPOTENCY
# ============================================================

Server must persist:

school_id
device_id
idempotency_key
request_hash
response_json
processed_at

Unique:

school_id
+
device_id
+
idempotency_key

Same key + same request hash:

return stored result.

Same key + different request hash:

reject integrity/security error.

Retry must not create duplicates.


# ============================================================
# 45. CONFLICT POLICY
# ============================================================

Critical data may NEVER silently overwrite.

Examples:

score
attendance
consent
parent link
membership/security

Allowed outcomes:

reject
needs_review
deterministic trusted server rule
manual review

Create Teacher/Admin conflict review UI.

Conflict resolution must be audited.


# ============================================================
# 46. TOMBSTONE
# ============================================================

Synced delete flow:

set deleted_at
→ queue delete
→ server tombstone
→ increment version
→ append sync_changes
→ other devices pull tombstone
→ hide locally
→ eventual purge under retention / acknowledgement policy

Do not perform normal physical deletion.


# ============================================================
# 47. RETRY
# ============================================================

Use backoff approximately:

5s
15s
45s
2m
5m
15m
cap

Retry:

network error
5xx
429
retryable_error

Do not endlessly retry:

validation error
authorization failure
revoked device
incompatible old protocol


# ============================================================
# 48. DEVICE MANAGEMENT
# ============================================================

Device should support:

id
school_id
device_name
device_type
status
last_seen_at
last_successful_sync_at
last_ack_revision
revoked_at

device_id is NOT authentication.

Revoked device must fail critical sync.


# ============================================================
# 49. SYNC STATUS UI
# ============================================================

Always expose appropriate sync state.

Thai text:

กำลังซิงก์...
ซิงค์แล้ว
ออฟไลน์ — เก็บในเครื่อง
ซิงค์มีปัญหา

Also show:

Pending Count
Last Sync
Error Summary
Device Status
Sync Now
Protocol Version
Local Schema Version


# ============================================================
# 50. PARENT LINK
# ============================================================

Teacher creates invitation.

Server generates 6-digit code.

Store only secure keyed HMAC/pepper representation.

Never store reusable plaintext code.

Require:

- short expiry
- single use
- max attempts
- rate limiting
- revoke
- failed-attempt audit

Parent flow:

Login
→ enter code
→ verify
→ confirm student
→ consent
→ link becomes active
→ invitation invalidated


# ============================================================
# 51. CONSENT / PDPA
# ============================================================

Store:

school_id
parent_id
student_id
consent_type
policy_version
accepted_at
revoked_at
ip_hash
user_agent_summary
created_at

Parent may access student data only when:

link active
+
consent active

Revocation must remove access according to policy.

Audit important consent events.


# ============================================================
# 52. LINE OA
# ============================================================

Secrets:

LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET

Server environment only.

Never frontend.

Events may include:

assignment_new
due_soon
missing
late
score_published
absent
at_risk


# ============================================================
# 53. NOTIFICATION OUTBOX
# ============================================================

Do not call LINE inside the core educational transaction.

Use:

Domain Mutation
+
notification_outbox
→ COMMIT

Then asynchronously:

dispatcher
→ Edge Function
→ LINE
→ notifications_log

LINE failure must NOT roll back:

attendance
score
assignment
submission
or other classroom records.


# ============================================================
# 54. NOTIFICATION PREFERENCES
# ============================================================

Parent can configure appropriate:

assignment_new
due_soon
missing
late
score_published
absent
at_risk

Also support:

quiet period
locale


# ============================================================
# 55. CSV STUDENT IMPORT
# ============================================================

Required:

UTF-8
UTF-8 BOM support
header validation
duplicate student_code inside file
duplicate against database
preview
row number errors
confirmation
transactional import
audit

Default:

all-or-nothing per import

No silent partial import.


# ============================================================
# 56. REPORTING
# ============================================================

Implement at minimum:

Student Report
Class Report
Attendance Report
Score Report
Grade Report
Missing Assignment Report
At-Risk Report

Export:

CSV
PDF

Every export:

- respects authorization
- respects school/class scope
- contains generated time
- contains filter context where appropriate
- is audited


# ============================================================
# 57. LOCAL BACKUP
# ============================================================

Backup should contain:

format
schema_version
exported_at
device_id
school_id
authorized domain tables
sync_metadata
checksum / integrity
encryption metadata

Support encryption for PII.

Never export:

password
access token
refresh token
service role
LINE secret
credentials


# ============================================================
# 58. RESTORE
# ============================================================

Implement:

format validation
encryption validation
schema validation
school scope validation
preview
confirmation
transactional import
sync queue rebuild policy
audit


# ============================================================
# 59. AUDIT
# ============================================================

audit_log must be append-only.

Trusted server/database layer generates critical audit.

Audit at minimum:

student mutation
score change
attendance change
consent
parent link
role/membership
export
backup import
privileged admin action

Never log:

password
complete tokens
service role
LINE secrets


# ============================================================
# 60. RLS / AUTHORIZATION
# ============================================================

Frontend guards are UX only.

Real boundaries:

PostgreSQL Grants
RLS
trusted RPC/server checks

Minimum negative tests:

School A cannot read School B
Teacher cannot read unassigned class
Teacher cannot mutate student outside assigned class
Student cannot access another student
Parent cannot access unlinked student
Parent with revoked consent denied
Suspended membership denied
Modified client role denied
Revoked device denied for critical sync


# ============================================================
# 61. RPC SECURITY
# ============================================================

Each RPC documents:

purpose
caller
school scope
required role
input
output
transaction behavior
grants

If SECURITY DEFINER is used:

require:

safe search_path
explicit auth check
explicit membership check
minimal privilege
restricted EXECUTE


# ============================================================
# 62. SECURITY
# ============================================================

Implement appropriate:

RLS
CSP
CORS
HTTPS
XSS protection
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
clickjacking protection
rate limits
dependency scan
secret scan

No wildcard privileged CORS.

No unsafe HTML without sanitization.

Critical/High unresolved security blockers:

block Production Ready.


# ============================================================
# 63. USER INTERFACE DIRECTION
# ============================================================

Overall application:

Modern
Professional
Educational
Friendly
Thai-first
Clean
Responsive
Interactive Board friendly
Slightly playful

Do NOT make whole application look like:

- a fantasy game
- a casino
- an old ERP
- a children-only cartoon toy

Avatar / Leaderboard areas may be more playful.

Business/Admin sections remain professional.


# ============================================================
# 64. DESIGN TOKENS
# ============================================================

Create a centralized design-token system.

Suggested starting palette:

brand-primary: purple/violet family
surface: white/light neutral
info: blue
success: green
warning: amber
danger: red
accent: pink/teal as appropriate

Use consistent:

radius
spacing
typography
shadow
motion
breakpoints

Thai font must work offline.

Prefer self-hosting if font files are legally available,
with system font fallbacks.


# ============================================================
# 65. INTERACTIVE BOARD UX
# ============================================================

Primary targets:

≥ 56px

Secondary:

≥ 48px

No essential hover interaction.

Use large readable typography.

Classroom tasks should minimize taps.

Attendance should support:

มาเรียนทั้งหมด

then individual overrides.

Sync status stays visible.

Important actions should respond locally immediately.


# ============================================================
# 66. MOBILE UX
# ============================================================

Use:

Drawer navigation
Summary cards before detail
Responsive layout
Wide tables → cards where appropriate

Avoid unnecessary horizontal scrolling.


# ============================================================
# 67. ACCESSIBILITY
# ============================================================

Require:

Keyboard usability on desktop
Visible focus
Semantic labels
Sufficient contrast

Error messages describe:

what happened
+
what user can do

Do not use color alone for state.

Respect reduced motion.


# ============================================================
# 68. REQUIRED FEATURE STATES
# ============================================================

Each appropriate feature must implement:

loading
empty
success
error
offline
syncing
permission denied
conflict
retry


# ============================================================
# 69. PWA
# ============================================================

Manifest:

name
short_name
start_url
display: standalone
theme_color
background_color
icons
maskable icons

Support:

PWA Install
Standalone Mode
Offline Restart
App Shell
Offline Fallback
Safe Update


# ============================================================
# 70. SERVICE WORKER
# ============================================================

Use Service Worker for:

app shell
revisioned static assets
offline fallback

Do NOT use Service Worker cache
as a replacement for IndexedDB domain storage.


# ============================================================
# 71. SAFE UPDATE
# ============================================================

New application version:

detect
→ notify user
→ inspect unsynced critical mutations
→ update at safe point

Never force reload while unsynced critical mutations exist.


# ============================================================
# 72. STORAGE DURABILITY
# ============================================================

Use:

navigator.storage.persisted()
navigator.storage.persist()
navigator.storage.estimate()

Provide:

Storage Status
Persistence Status
Storage Quota
Low Storage Warning
Backup option

Never auto-delete unsynced queue to free space.


# ============================================================
# 73. TARGET REPOSITORY STRUCTURE
# ============================================================

Use modular structure similar to:

smart-classroom/
│
├── README.md
├── package.json
├── .env.example
├── .gitignore
│
├── apps/
│   └── web/
│       ├── public/
│       │   ├── icons/
│       │   └── manifest.webmanifest
│       │
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── design-system/
│       │   ├── layouts/
│       │   │
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── schools/
│       │   │   ├── teachers/
│       │   │   ├── classes/
│       │   │   ├── students/
│       │   │   ├── enrollments/
│       │   │   ├── parents/
│       │   │   ├── assignments/
│       │   │   ├── submissions/
│       │   │   ├── activities/
│       │   │   ├── tests/
│       │   │   ├── attendance/
│       │   │   ├── scores/
│       │   │   ├── leaderboard/
│       │   │   ├── avatars/
│       │   │   ├── notifications/
│       │   │   ├── reports/
│       │   │   ├── backup/
│       │   │   └── settings/
│       │   │
│       │   ├── db/
│       │   │   ├── dexie.ts
│       │   │   ├── schema/
│       │   │   └── migrations/
│       │   │
│       │   ├── sync/
│       │   │   ├── queue.ts
│       │   │   ├── push.ts
│       │   │   ├── pull.ts
│       │   │   ├── conflicts.ts
│       │   │   ├── retry.ts
│       │   │   └── diagnostics.ts
│       │   │
│       │   ├── services/
│       │   ├── security/
│       │   ├── utils/
│       │   └── main.tsx
│       │
│       └── tests/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── parent-link/
│   │   ├── line-link/
│   │   ├── line-notify/
│   │   ├── report-export/
│   │   └── privileged-operations/
│   └── config.toml
│
├── tests/
│   ├── integration/
│   ├── security/
│   └── e2e/
│
├── docs/
└── scripts/

Do not build giant monolithic source files.


# ============================================================
# 74. AVATAR MODULE STRUCTURE
# ============================================================

Create:

features/avatars/

Suggested modules:

AvatarRenderer.tsx
AvatarMini.tsx
AvatarProfile.tsx
AvatarLeaderboard.tsx
AvatarAnimation.tsx
avatarCatalog.ts
avatarConfig.ts
avatarPalette.ts
avatarAnimations.ts
useStudentAvatar.ts

Keep avatar rendering separate from:

score engine
leaderboard calculation
student repository


# ============================================================
# 75. ENVIRONMENTS
# ============================================================

Prepare:

development
staging
production

Never run development automated tests against production.

Never put production secrets into local tracked files.


# ============================================================
# 76. ENVIRONMENT VARIABLES
# ============================================================

Provide complete:

.env.example

Examples:

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

APP_ENV=
APP_BASE_URL=

Server secret examples:

SUPABASE_SERVICE_ROLE_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
PARENT_LINK_HMAC_SECRET=

Never prefix server secrets with VITE_.

Never commit actual values.


# ============================================================
# 77. TESTING — UNIT
# ============================================================

At minimum test:

Score Formula
Grade Boundaries
formatScore
Late Penalty
Attendance Penalty
Missing Category Logic
Avatar Mapping
Avatar Persistence
Avatar Configuration
Parent Code Logic
Retry Logic
Conflict Logic
Tombstone Logic


# ============================================================
# 78. TESTING — INTEGRATION
# ============================================================

At minimum:

Auth
School Membership
RLS
School Isolation
Teacher Class Isolation
Student Self Isolation
Parent Link + Consent
Sync Push
Sync Pull
Idempotency
CSV Import
Device Revocation


# ============================================================
# 79. TESTING — E2E
# ============================================================

Required flows:

Admin initial setup
Create academic term
Create teacher
Create class
Assign teacher
Create/import student
Enroll student
Teacher login
Teacher assigned class access
Assignment creation
Student login
Student assignment view
Student submission
Teacher grading
Score calculation
Leaderboard
Avatar consistency
Offline Attendance
Offline Activity Score
Close / reopen PWA
Reconnect
Sync
Parent account
Parent Link
Consent
Parent Portal
LINE staging integration when credentials exist
Reports
CSV Export
PDF Export
Backup
Restore


# ============================================================
# 80. AVATAR ACCEPTANCE
# ============================================================

Verify:

Avatar persists after refresh
Avatar persists after logout/login
Avatar persists after PWA restart
Avatar persists after sync
Avatar persists after rename
Avatar persists after transfer

Student Profile Avatar
=
Teacher Student List Avatar
=
Leaderboard Avatar
=
Board Avatar

idle works
blink works
wave works
study works
celebrate works
reduced-motion works

Rendering a normal classroom-sized list
does not cause unacceptable board performance.


# ============================================================
# 81. SYNC ACCEPTANCE
# ============================================================

Must pass:

1. Offline create → reconnect → exactly one logical cloud record
2. Duplicate push → no duplicate
3. Offline delete → reconnect → no resurrection
4. Two devices edit same critical record → conflict policy
5. App closes with queued mutation → queue survives
6. Dexie migration → local data and queue survive
7. Revoked device → critical sync rejected
8. Old protocol → safe CLIENT_UPDATE_REQUIRED behavior


# ============================================================
# 82. SECURITY ACCEPTANCE
# ============================================================

Must pass:

School A → School B denied
Teacher → unassigned class denied
Teacher → student outside assigned class denied
Student A → Student B denied
Parent → unlinked student denied
Parent → revoked consent denied
Suspended membership denied
Modified frontend role denied
Revoked device denied
Parent link brute-force protected
Export scope bypass denied
No secrets in client bundle


# ============================================================
# 83. REAL DEVICE ACCEPTANCE
# ============================================================

Where hardware/environment is available, test:

PWA Install
Touch
Large Touch Targets
Thai Typography
Standalone Mode
Fullscreen
Offline
Restart
IndexedDB Persistence
Reconnect
Sync
Storage / Quota
Avatar Animation Performance


# ============================================================
# 84. CI/CD
# ============================================================

GitHub Actions should run applicable:

dependency install
typecheck
lint
unit tests
integration tests
build
secret scan
dependency vulnerability scan

Playwright in suitable E2E workflow.


# ============================================================
# 85. FAILURE LOOP
# ============================================================

Whenever:

typecheck fails
lint fails
unit test fails
integration test fails
E2E fails
migration fails
build fails
security test fails

DO NOT merely report and stop.

Perform:

1. Inspect actual failure output.
2. Determine root cause.
3. Fix root cause.
4. Rerun targeted check.
5. Rerun regression checks.
6. Continue when green.

Forbidden:

disable test
delete failing test
weaken RLS
disable strict mode
skip validation
hardcode role
fake success
replace production backend with fake data


# ============================================================
# 86. PERFORMANCE TARGETS
# ============================================================

Interactive Board:

Local touch feedback target:
≤ approximately 100ms where hardware allows.

Normal local save perceived:
approximately 300ms.

Cloud network must not block permitted local classroom flow.

Bulk attendance must NOT perform one network round-trip per student.

Avatar animations should prefer:

transform
opacity

Avoid layout thrashing.


# ============================================================
# 87. PHASE 0 — FOUNDATION
# ============================================================

Build:

Repository Foundation
React / Vite / TypeScript
TypeScript Strict
Design System
PWA Foundation
Environment Foundation
Supabase Foundation
Identity Schema
Schools
User Profiles
School Memberships
Teachers
Academic Terms
Classes
Class Teachers
Students
Student Enrollments
Authorization / RLS Foundation
Device Foundation
Dexie Foundation
Local Transaction Invariant
Sync Contract
Server Monotonic Revision
Persistent Idempotency Foundation
Test Infrastructure
CI

Exit Gate:

build passes
typecheck passes
lint passes
RLS foundation tests pass
local persistence works
transaction + queue invariant works
revision foundation works
idempotency foundation works
PWA smoke works
CI green

Then continue automatically.


# ============================================================
# 88. PHASE 1 — SCHOOL / CLASS / STUDENT CORE
# ============================================================

Build:

School Settings
Academic Terms
Teacher Management
Class Management
Teacher Assignment
Student CRUD
Enrollment
Student Transfer
CSV Import
Avatar Foundation
Board Navigation
Admin Portal Core
Teacher Portal Core

Exit Gate:

Teacher isolation passes
Enrollment history passes
Student transfer history correct
Avatar persistence passes
CSV validation passes
No production demo data

Then continue automatically.


# ============================================================
# 89. PHASE 2 — LEARNING RECORDS
# ============================================================

Build:

Assignments
Submissions
Activities
Tests
Scores
Grade
Missing Category Policy
Late Penalty
Student Portal
Leaderboard
Full Animated Avatar System
Achievements foundation
Audit integration

Exit Gate:

Score deterministic
Grade correct
No NaN / Infinity
Score mutation audited
Critical score conflict-safe
Student avatar consistent across UI
Leaderboard correct

Then continue automatically.


# ============================================================
# 90. PHASE 3 — ATTENDANCE
# ============================================================

Build:

Attendance Domain
Board Attendance UI
มาเรียนทั้งหมด
Individual Overrides
Monthly Stats
Term Stats
Attendance Penalty
Audit
Offline Attendance

Exit Gate:

Offline attendance survives restart
Reconnect sync succeeds
No duplicate attendance
Audit correct

Then continue automatically.


# ============================================================
# 91. PHASE 4 — SYNC HARDENING
# ============================================================

Build:

Batching
Server Pull Revision
Retry / Backoff
Persistent Idempotency
Conflict Handling
needs_review
Tombstones
Stale Device Protection
Device Acknowledgement
Purge Eligibility
Diagnostics
Old Protocol Handling

Exit Gate:

All Sync Acceptance scenarios pass.

Then continue automatically.


# ============================================================
# 92. PHASE 5 — PARENT / PDPA / LINE
# ============================================================

Build:

Parent Accounts
Parent Invitation
HMAC Parent Code
Rate Limits
Consent
Consent Revocation
Parent Student Link
LINE Linking
Webhook Signature / State Verification
Notification Preferences
notification_outbox
Dispatcher
notifications_log
Parent Portal

Exit Gate:

Parent isolation passes
Parent Link passes
Consent passes
Consent revocation passes
LINE staging test passes when credentials are available

If LINE credentials are missing:

complete integration code,
tests/mocks,
configuration guide,
and mark only live provider test as external blocker.

Continue automatically.


# ============================================================
# 93. PHASE 6 — REPORTS / BACKUP / OPERATIONS
# ============================================================

Build:

Student Reports
Class Reports
Attendance Reports
Score Reports
Grade Reports
Missing Work Reports
At-Risk Reports
CSV Export
PDF Export
Encrypted Local Backup
Restore
Operational Diagnostics
System Status
Runbooks

Exit Gate:

Export scopes secure
Backup passes
Restore passes
Audit passes
Diagnostics usable

Then continue automatically.


# ============================================================
# 94. PHASE 7 — PRODUCTION QA
# ============================================================

Run:

Security Suite
Staging UAT
Role Workflows
Real/Representative Board Tests
Storage / Quota Tests
Offline / Restart Tests
Reconnect Tests
Migration Compatibility
Accessibility
Performance
Avatar Animation Performance

Fix all fixable Critical / High defects.

Do not merely list fixable bugs.


# ============================================================
# 95. PHASE 8 — PRODUCTION RELEASE PREPARATION
# ============================================================

Prepare:

Release Candidate
Production Migration Plan
Migration Order
Frontend Deployment
Edge Functions Deployment
Production Environment Checklist
Smoke Tests
Monitoring
Rollback / Forward-Fix Plan
Documentation
Release Notes
First School Setup Guide
Interactive Board Installation Guide

Do not perform an irreversible unknown production deploy
without required Owner credentials.

But make the repository production-deployable.


# ============================================================
# 96. REQUIRED DELIVERABLES
# ============================================================

Deliver:

1. Full Repository
2. React PWA
3. Design System
4. Admin Portal
5. Teacher Portal
6. Student Portal
7. Parent Portal
8. Animated Student Avatar
9. Leaderboard
10. Local IndexedDB / Dexie
11. Local Migrations
12. Sync Engine
13. Supabase PostgreSQL Migrations
14. RLS Policies
15. PostgreSQL RPCs
16. Edge Functions
17. Parent Link Security
18. Consent / PDPA
19. LINE OA Integration
20. Notification Outbox
21. CSV Import
22. CSV Export
23. PDF Export
24. Reports
25. Backup / Restore
26. Unit Tests
27. Integration Tests
28. Security Tests
29. Playwright E2E
30. GitHub Actions
31. .env.example
32. Installation Guide
33. Supabase Setup Guide
34. LINE OA Setup Guide
35. Interactive Board Guide
36. Deployment Guide
37. Backup / Restore Guide
38. Security Checklist
39. Operational Runbooks
40. Acceptance Checklist
41. Release Notes
42. Production Readiness Report


# ============================================================
# 97. NO FAKE FINAL IMPLEMENTATION
# ============================================================

Production-critical code must NOT finish with placeholders like:

TODO implement sync later
TODO add RLS later
mock login
fake current user
fake class
fake student
fake scores
fake attendance
hardcoded leaderboard
fake parent link
fake persistence
temporary security bypass
placeholder DB implementation

Test fixtures are allowed only in test/development environments.


# ============================================================
# 98. PRODUCTION DEFINITION OF DONE
# ============================================================

The system is Production Ready only when:

PWA installs
Offline classroom core works
Local data survives restart
Sync works
Idempotency works
Conflict handling works
Tombstone works
RLS isolation works
Admin works
Teacher works
Student works
Parent works
Academic terms work
Enrollment history works
Assignment works
Submission works
Activity works
Tests work
Scores work
Grade works
Attendance works
Animated Avatar works
Leaderboard works
Parent Link works
Consent works
Reports work
CSV works
PDF works
Backup works
Restore works
Audit works
Security checks pass
No production demo records exist
No secrets are committed
No known Critical/High release blocker remains
Build is green
CI is green
Required production documentation exists


# ============================================================
# 99. REAL SCHOOL END-TO-END WORKFLOW
# ============================================================

The finished system must support:

Deploy Smart Classroom
→ Configure Supabase
→ Create School
→ Create First Admin
→ Create Academic Term
→ Configure Settings
→ Create Teachers
→ Create Classes
→ Assign Teachers
→ Create / Import Students
→ Enroll Students
→ Teacher Login
→ Teacher Opens Assigned Class
→ Student Animated Avatars Appear
→ Teacher Takes Attendance
→ Teacher Creates Assignment
→ Student Login
→ Student Views Assignment
→ Student Submits Work
→ Teacher Grades Submission
→ Score Engine Calculates
→ Grade Calculates
→ Leaderboard Updates
→ Student Avatar Reacts
→ Parent Creates Account
→ Parent Link
→ Consent
→ Parent Views Child Data
→ LINE Notification
→ Network Disconnects
→ Teacher Continues Classroom Operations
→ Data Stored Locally
→ Application Can Restart
→ Local Data Still Exists
→ Network Returns
→ Sync Runs
→ No Duplicate Records
→ No Lost Records
→ Conflicts Are Handled
→ Reports Generated
→ CSV/PDF Export
→ Backup
→ Restore
→ Audit Available


# ============================================================
# 100. FUTURE DEVELOPMENT REQUIREMENT
# ============================================================

This application will continue development after first release.

Design accordingly.

Use:

modular features
typed domain models
versioned PostgreSQL migrations
versioned Dexie migrations
versioned sync protocol
design tokens
reusable components
configuration-driven policies
backward-compatible migrations
documented extension points
clear service boundaries

Do NOT build a disposable MVP architecture.

The first version must be a stable foundation
for future Smart Classroom development.


# ============================================================
# 101. FINAL REPORT FORMAT
# ============================================================

When implementation reaches the highest possible state,
return exactly a structured report:

# SMART CLASSROOM v3.1 — PRODUCTION READINESS REPORT

## 1. Overall Status
## 2. Completed Modules
## 3. Repository Architecture
## 4. Frontend
## 5. Admin Portal
## 6. Teacher Portal
## 7. Student Portal
## 8. Parent Portal
## 9. Animated Student Avatar
## 10. Leaderboard
## 11. PostgreSQL Schema
## 12. Database Migrations
## 13. RLS / Authorization
## 14. RPC Functions
## 15. Edge Functions
## 16. Dexie / IndexedDB
## 17. Sync Engine
## 18. Offline Operation
## 19. Parent / Consent
## 20. LINE OA
## 21. Reports
## 22. Backup / Restore
## 23. Unit Tests
## 24. Integration Tests
## 25. E2E Tests
## 26. Security Test Results
## 27. Build Results
## 28. CI Status
## 29. Real Device / Board Testing
## 30. Performance
## 31. Required External Configuration
## 32. Known Limitations
## 33. Remaining Blockers
## 34. Deployment Steps
## 35. First School Setup
## 36. Production Ready

YES / NO

If NO:

state exact blockers.

Do NOT say a test passed unless it was actually executed.


# ============================================================
# 102. START COMMAND
# ============================================================

START NOW.

Perform:

1. Read README.md.
2. Read docs/01 through docs/12 in numeric order.
3. Inspect the entire repository.
4. Map requirements to implementation modules.
5. Identify conflicts / missing foundation.
6. Create any necessary Owner-approved Avatar ADR / Change Request.
7. Begin Phase 0.
8. Run Phase 0 Exit Gate.
9. Fix failures.
10. Continue automatically to Phase 1.
11. Continue through all phases.
12. Run tests continuously.
13. Fix root causes.
14. Preserve Data Integrity.
15. Preserve Security.
16. Preserve RLS.
17. Preserve Offline-first guarantees.
18. Preserve Sync guarantees.
19. Do not create production demo data.
20. Do not stop merely to ask whether to continue.
21. Reach the highest deployable production state possible.
22. Produce the final Production Readiness Report.

DO NOT BUILD ONLY A DEMO.
DO NOT BUILD ONLY A UI.
DO NOT STOP AFTER AN ORDINARY PHASE.
DO NOT BYPASS SECURITY.
DO NOT FAKE TEST RESULTS.
DO NOT CLAIM PRODUCTION READY WITHOUT EVIDENCE.

BUILD THE REAL SMART CLASSROOM SYSTEM END-TO-END.

# ============================================================
# END OF SMART CLASSROOM v3.1
# ONE-SHOT END-TO-END PRODUCTION BUILD MASTER PROMPT v4.0
# ============================================================

---

# F. FINAL SINGLE-FILE START DIRECTIVE

You now have all required project authority, architecture, data, security, offline, sync, roadmap, acceptance, AI-controller, and one-shot build instructions in this single file.

**START THE COMPLETE IMPLEMENTATION NOW.**

Mandatory outcome:

- build the real Smart Classroom system end-to-end;
- preserve the v3.1 SSOT;
- preserve Data Integrity, Security, Offline Reliability, Authorization, and Sync guarantees;
- implement the Owner-approved Animated Student Avatar and Leaderboard integration as an additive, backward-compatible enhancement;
- run and fix tests continuously;
- proceed through Phase 0 to Phase 8 without stopping after ordinary successful phase gates;
- stop only for genuine owner-decision blockers defined above;
- provide a factual Production Readiness Report at the end.

**END OF SMART CLASSROOM v3.1 — COMPLETE ONE-SHOT MASTER BUILD v5.0**
