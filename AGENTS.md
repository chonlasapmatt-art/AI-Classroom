# Working on Smart Classroom

A multi-school education platform: web and installable PWA, local-first with a persistent sync queue,
Supabase behind it. Thai is the product language; every user-facing string is Thai.

This file is the handoff. Read it before changing anything.

---

## Start here — no credentials needed

```bash
npm ci
npm run dev          # http://localhost:5173
```

With no `.env.local` at all, the app offers **Preview Mode** on the configuration screen: the whole
product rendered from a 460-line fixture, with working role switching between administrator, teacher,
student and parent. No Supabase project, no account, no keys.

That is enough to build screens, change behaviour, run all 777 tests and see the result. Most work on
this codebase needs nothing more.

You need a real project only to push migrations, deploy Edge Functions, or run anything in
`scripts/probes/`. When you do, copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill
in the two browser-safe values; server secrets never go in a file (see **Secrets** below).

## Run it

```bash
npm run build && npm run preview   # http://localhost:4173
```

Two entry points, and they are separate builds:

| | Where | Who |
| --- | --- | --- |
| School app | `/` | school administrator, teacher, student, parent |
| Operations console | `/platform/` | platform operator |

`INCLUDE_PLATFORM_CONSOLE=false npm run build` omits the console entirely — that is how the customer
build stays free of developer tooling. Not by hiding a menu; by not shipping the code.

## Gates

```bash
npm run typecheck   # tsc -b
npm run lint        # eslint --max-warnings 0
npm run test        # vitest, 777 tests
npm run build
```

All four must pass. `--max-warnings 0` is deliberate; do not relax it.

**A green suite does not mean it works.** See the next section.

---

## How to verify server-side work

Six defects in the last pass passed every gate above and were caught only by running against the live
database. They are listed with their symptoms in `scripts/probes/README.md`. Four were PL/pgSQL
variables named after a column, which is valid SQL and fails at runtime with `42702`.

So: **when you change a migration, an RPC or an Edge Function, write or run a probe.**
`scripts/probes/` holds one per feature and a README explaining how to run them. They take everything
from the environment and hardcode nothing.

Probes write into a real school. Remove everything they create and confirm the tables are empty
afterwards.

---

## Invariants — do not break these

These are not style preferences. Each one is load-bearing and several have already been broken once.

**Authority is decided by the database, never by the client.** A screen may hide a button; that is a
convenience. The refusal that matters is a grant or a security-definer function.

**Tables holding answer keys or credentials are revoked from `authenticated` entirely.**
`question_bank`, `question_categories`, `quiz_*`, `teacher_access_codes`, `platform_admins`,
`support_sessions`, `platform_error_events`, `member_login_identities`. A direct API call is refused
by privilege rather than by a policy somebody has to keep writing correctly. Do not add a `grant
select` to any of them.

**No entrance asks for an email address.** Teachers, parents and administrators sign in with a name
and a password; students with a name and a student number. Accounts created through the private owner
entry carry a generated internal address nobody is ever shown, so a screen asking for an email is
asking for something that does not exist. Email is for password recovery only. The suite asserts that
no screen calls `signInWithPassword`.

**Time belongs to the server.** Exam windows, quiz countdowns and attempt expiry are all read from
`now()` on the server. A client may render a countdown; it may not decide one. When you need a
countdown, take the offset when the payload arrives and apply it to every tick — see
`secondsRemaining` in `quizChallenge.ts`.

**Platform authority is not a school membership.** It lives in `platform_admins`. Inventing a
membership in every school would make a platform operator indistinguishable from a school
administrator in exactly the records meant to tell them apart.

**Support mode is not impersonation.** It names one school, carries a reason, expires on the clock,
grants administrator authority only, and is stamped onto every audit record by a trigger rather than
by a parameter each function could forget to pass.

**Nothing is deleted that can be archived or suspended.** Schools, accounts, questions, categories,
teacher codes: all have a status. History stays readable.

**Migrations are immutable.** Never edit one that has been applied. Every repair is a new migration.
There are 68; the last is `202609030003`. Replacing a function in a *new* migration is the repair
path and is not an exception to this — `platform_reauth_fresh` has been replaced twice that way.

**Snapshots, not pointers.** Exams and quiz rounds copy each question they use. Editing the bank next
term must not change what a class already sat.

**One score ledger.** Everything that awards points writes to `score_events` with a reason, an author
and a source. Do not build a second one.

---

## Secrets

None are in this repository, and this repository is **public**. Check before you commit.

Server secrets live in Supabase project secrets (`npx supabase secrets set`). `.env.example` lists
every name with empty values. `apps/web/.env.local` holds the browser-safe values and is gitignored.

Do not put a project reference, a key, a password or an access code in a file, a comment, a commit
message or a document — including a document about how well those things are protected. That mistake
has already been made once here.

`scripts/new-access-code.ps1` generates an access code and prints only the hash to set on the server.

---

## Where things are

```
apps/web/src/
  app/            App shell, routing, AuthContext, theme
  data/           repository interface, Dexie and fixture implementations, import parsing
  db/             Dexie schema, local mutation journal
  domain/         shared types
  features/       one directory per feature; the screens live here
  platform/       the operations console — its own entry, its own routes
  sync/           push, pull, retry, protocol contracts
  ui/             the shared component set every screen composes
supabase/
  migrations/     68 immutable migrations
  functions/      15 Edge Functions; _shared holds the crypto and client helpers
scripts/probes/   live verification scripts — read the README
docs/             specification and the validation report
```

`docs/FINAL_SYSTEM_VALIDATION_REPORT.md` is the current state of the system, feature by feature, with
failures named as failures.

---

## What is done

Teacher access codes · platform authority and support mode · the operations console (overview,
schools with derived health, errors, devices, changelog, security log, flags and releases) · question
bank with categories and file import · Quiz Challenge · formal exams · sync conflict resolution ·
name-and-password access for staff and parents · passwordless student access · attendance,
assignments, scores, gradebook, leaderboard, achievements, timetable, promotion, reports, roster
import, backup · the parent portal's per-child view (attendance, outstanding work, per-subject
results, calendar) · the notification sender and its queue health · one recoverable product key per
customer, readable by the platform operator · operator password reset for a school that has nobody
above the administrator · TOTP for platform operators.

## What is not

In the order they matter:

1. **A scheduler for the notification sender, on the deployment.** The dispatcher exists, drains the
   outbox, delivers over LINE and records every run. Nothing in this repository can make a particular
   project *call* it: run `schedule_notification_dispatch(url, secret)` once for a pg_cron job, or
   point an external scheduler at the function every minute. Until one of those is done, messages
   still queue — the difference from before is that `notification_dispatch_health` now says so, on
   the console's notification page, instead of the queue looking healthy while nobody reads it.
2. **A tested restore.** `restoreBackup` is covered by `tests/integration/backupRestore.test.ts`
   against the local store, and has never been run against a live project. The specification says a
   backup without a tested restore is insufficient, and it is right about the live half.
3. **An Android release.** Capacitor is configured ? `apps/web/capacitor.config.ts`, the application
   id, the npm scripts, `docs/30_ANDROID_BUILD.md`. What does not exist is a built, signed release:
   the native project is generated by `npm run android:add` on the build machine, and the keystore
   is deliberately not in this public repository. Nobody has run the Play upload once.
4. **Realtime beyond the quiz room.** The live classroom round now moves on a Realtime broadcast
   with a ten-second poll underneath as the floor. The channel carries a nudge and no rows, because
   a `postgres_changes` subscription on a `quiz_*` table would be a grant on rows holding the
   answer key. Everything else that polls is a local clock tick or the background sync, both of
   which are correct as they are.
5. **Operations console: Jobs/Queues, Tickets, Plans/Subscriptions/Usage.** The notification queue is
   there; the rest of that section of the specification is not.
6. **OCR import.** Images and scanned PDFs are refused with a clear message rather than attempted.
   The spreadsheet importer covers CSV, TSV and XLSX for both the roster and the question bank.
7. **Practice mode**, and the question types beyond the four implemented (matching, ordering, fill in
   the blank, image, audio, essay). The specification says not to overengineer unfinished types.

Readiness: **CONDITIONALLY READY**. Items 1 and 2 are both deployment steps rather than missing code,
and both must be done on the real project before a pilot with real families.

---

## House style

Comments explain why, not what. A comment that restates the line above it is noise; a comment that
says which failure a line prevents is worth more than the line. Match the density around you.

Tests describe behaviour in a sentence a person would say. Assertions carry the reason where the
reason is not obvious.

Thai for anything a user reads. English for code, comments, commits and documentation.

Never weaken or delete a test to get a pass. If a test is wrong, tighten it into a correct one and
say why in the commit.
