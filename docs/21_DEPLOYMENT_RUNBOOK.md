# Deployment and Operations Runbook

## Environments

Use separate Supabase projects and frontend environments for development, staging and production. Validate staging migrations, RLS negative tests, offline restart and recovery before production.

## Release order

1. Freeze and tag a verified candidate.
2. Verify database and local backup recovery.
3. Apply staging migrations in filename order.
4. Deploy Edge Functions and set secrets.
5. Deploy the frontend with security headers and HTTPS.
6. Run role/RLS/sync/offline smoke tests.
7. Apply production migrations, functions and frontend in the same order.
8. Schedule `notification-dispatch` every minute with `x-notification-dispatch-secret` and monitor function errors, database load, outbox retries and sync conflicts.

## Rollback / forward fix

Database migrations are forward-only. For a database defect, stop affected writes, preserve evidence and apply a new forward-fix migration. Frontend may roll back to the last protocol-compatible build. Never delete a user's unsynced queue during rollback.

## LINE OA

Create the Messaging API channel, add webhook URL `/functions/v1/line-notify`, set the channel access token/secret only as Edge Function secrets, and verify webhook signatures. Set a separate `NOTIFICATION_DISPATCH_SECRET` for the scheduler, then call `/functions/v1/notification-dispatch` with that secret every minute. Provider failure must leave the educational transaction committed and the outbox retryable; after five attempts the message is moved to `dead_letter` for operator review.

## Interactive Board

Use current Chromium, enable storage persistence when offered, install the PWA, test 56px primary targets, Thai typography, fullscreen, offline restart and reconnect. Trusted Device Offline Unlock may be enrolled only after online teacher, membership and device validation.
