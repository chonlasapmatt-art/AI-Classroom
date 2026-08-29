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
