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
