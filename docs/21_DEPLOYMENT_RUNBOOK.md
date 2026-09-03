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
8. Schedule `notification-dispatch` (see **The notification schedule** below). This is the step that has been forgotten before, and forgetting it means every parent message queues silently.
9. Confirm on the console's notification page that the health banner reports a recent run. A banner reading "ยังไม่เคยมีการส่งเลย" means step 8 did not take.
10. Monitor function errors, database load, outbox retries and sync conflicts.

## The notification schedule

The dispatcher is a function; nothing calls a function on its own. Two ways, and either is enough:

**From the database (pg_cron).** Enable `pg_cron` and `pg_net` on the project, then run once as the service role:

```sql
select public.schedule_notification_dispatch(
  'https://<project-ref>.functions.supabase.co/notification-dispatch',
  '<the NOTIFICATION_DISPATCH_SECRET set on the server>'
);
```

The URL and the secret go into the vault, not into a migration — this repository is public. Passing `null` as the secret unschedules the job and deletes both vault entries. Rotating the secret means running the same call again with the new value.

**From outside.** Any scheduler that can `POST` every minute with the `x-notification-dispatch-secret` header. Use this when `pg_cron` is not available on the plan.

Either way, verify rather than assume: `notification_dispatch_health` reports how long ago the last run was beside how deep the queue is, and the console shows it. A queue with no recent run is the alarm — that combination is exactly the failure this system shipped with once.

## Server secrets that gate a feature

Two secrets stop a feature working rather than degrading it, so set both before a customer touches the server:

* `NOTIFICATION_DISPATCH_SECRET` — the dispatcher refuses every caller without it, including the scheduler.
* `PRODUCT_KEY_SECRET` — at least 32 characters. First-run refuses to draw a product key while it is unset, because a key sealed under no secret is a key nobody can ever recover, and recovery is the entire reason it is sealed. `scripts/setup-supabase.ps1` generates and sets both.

## Rollback / forward fix

Database migrations are forward-only. For a database defect, stop affected writes, preserve evidence and apply a new forward-fix migration. Frontend may roll back to the last protocol-compatible build. Never delete a user's unsynced queue during rollback.

## LINE OA

Create the Messaging API channel, add webhook URL `/functions/v1/line-notify`, set the channel access token/secret only as Edge Function secrets, and verify webhook signatures. Set a separate `NOTIFICATION_DISPATCH_SECRET` for the scheduler, then call `/functions/v1/notification-dispatch` with that secret every minute. Provider failure must leave the educational transaction committed and the outbox retryable; after five attempts the message is moved to `dead_letter` for operator review.

## Interactive Board

Use current Chromium, enable storage persistence when offered, install the PWA, test 56px primary targets, Thai typography, fullscreen, offline restart and reconnect. Trusted Device Offline Unlock may be enrolled only after online teacher, membership and device validation.
