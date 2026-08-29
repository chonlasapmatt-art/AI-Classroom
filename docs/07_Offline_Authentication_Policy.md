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
