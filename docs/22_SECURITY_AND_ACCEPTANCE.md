# Security and Acceptance Checklist

## Release-blocking security

- RLS is enabled on every exposed business table.
- Cross-school, unassigned-teacher, cross-student, unlinked-parent, revoked-consent, suspended-membership and revoked-device tests pass.
- Critical writes use local transaction + queue + authenticated RPC; UI/PostgREST direct write is not granted.
- Audit is append-only and critical audit originates in the trusted function.
- Parent code is HMAC-peppered, short-lived, single-use, attempt-limited and rate-limited at the edge boundary.
- Service-role, LINE and HMAC secrets are absent from browser bundles and Git.
- CSP, HTTPS, explicit CORS, content-type, referrer and permissions headers are configured at deployment.

## Functional acceptance

- PWA install/offline shell/restart verified.
- Attendance and scores survive restart and reconnect without duplicates.
- Idempotency, conflicts, tombstones and protocol upgrade behavior verified on two devices.
- Enrollment transfer preserves history.
- Score boundaries, missing categories, `max_score=0`, penalties and finite output verified.
- Avatar remains identical across profile/list/board/leaderboard and across rename/restart/sync/transfer.
- Encrypted backup checksum, school scope, preview and restore drill verified.
- CSV/PDF export scope and audit verified.

Production sign-off requires Product Owner, Technical Owner, QA, Security Review and Deployment Owner. Real device, live LINE and production smoke checks cannot be truthfully marked complete without those environments.
