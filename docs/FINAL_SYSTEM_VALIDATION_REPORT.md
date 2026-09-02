# Final System Validation Report

**Date:** 2026-09-01
**Branch:** `continuation/claude-completion` (merged to `main`)
**Supabase project:** the deployment this branch is linked to (see `supabase/.temp/project-ref`, which is not committed)

## How this pass was validated

The managed-identity changes in migrations `202609010036` and `202609010037`, together with the
teacher responsibility enforcement in `202609010038`, are implemented and
covered by local tests. They still require deployment to the linked Supabase project before they can
be called a live verification; the earlier live findings below remain valid for the already deployed
baseline.

Every claim below marked PASS was exercised against the live Supabase project, not against
fixtures. Where a property is about who may see what, it was checked from two real sessions — a
teacher signing in by name and password, a student by name and student number — and, where refusal
was the point, from an unauthenticated caller holding only the anon key.

This matters because of what it found. Six defects in this pass passed typecheck, lint and the whole
automated suite and were caught only by running against the real database:

| Defect | How it presented |
| --- | --- |
| Teacher code HMAC keyed from two different variables | Issuing used `TEACHER_CODE_SECRET`, redeeming used `MEMBER_ACCESS_HMAC_SECRET`. They agreed only while the dedicated secret was unset. Setting it broke every teacher code at once. |
| `school_health` variable/column collision (`status`) | 42702 on every call. The operations console could list no schools and open none. |
| `school_health` array append with an untyped literal | 22P02 the first time any health reason was added. |
| Quiz countdown offset cancelled itself | Reduced to the device clock, so a wrong clock produced a wrong countdown. |
| `award_quiz_bonus` variable/column collision (`student_id`) | 42702. A finished round could never become marks. |
| `exam_state` treated "released" as "results published" | A published exam never reached `open`, so no student could start one. |

Automated gates alone would have shipped all six.

## Scale

| | |
| --- | --- |
| Migrations | 32 |
| Edge Functions | 12 |
| Application source files | 116 |
| Test files | 46 |
| Automated tests | 512, all passing |
| Routes | 37 across two entry points |

Gates: `typecheck` PASS · `lint` PASS (`--max-warnings 0`) · `test` PASS (512) · `build` PASS.

---

## ARCHITECTURE — PASS

React 19, TypeScript, Vite 7, PWA. Dexie/IndexedDB local-first store with a persistent sync queue.
Supabase Postgres with row level security, security-definer RPCs and Edge Functions. Unchanged from
the established design; every addition in this pass extends it rather than replacing anything.

The operations console is a second Vite entry (`platform/index.html`), so the customer build does not
contain it. `INCLUDE_PLATFORM_CONSOLE=false` omits it entirely; verified by building both ways and
confirming `dist/platform` and the platform chunk are absent from the customer build.

## AUTH — PASS

Everyday access is a name and a password for teachers, parents and administrators; a name and a
student number for students. No entrance in the product asks for an email address, and the automated
suite asserts that no screen calls `signInWithPassword`. Accounts created through the private owner
entry carry a generated internal address nobody is shown, which is why an email-based console
sign-in was removed after it proved unusable.

Password recovery uses a Supabase recovery link; no email or recovery code appears in normal sign-in.

## ROLE MODEL — PASS

Five principal roles, and `school_admin` and `super_admin` are genuinely separate. Platform authority
is its own table (`platform_admins`) and deliberately not a school membership: a membership is a
claim about a school, and inventing one in every school would make the two roles indistinguishable
in exactly the records meant to tell them apart.

## SCHOOL ADMIN — PASS

Full authority inside one school, none outside it. Isolation is enforced by RLS and by
security-definer functions that check the school for themselves, not by route guards.

## SUPER ADMIN — PASS

Separate console at `/platform`. Reads go through security-definer functions that check
`is_platform_admin` themselves and return counts, health and identifiers — never a child's marks or a
parent's contact details. No policy was loosened and nothing was granted BYPASSRLS; the automated
suite asserts both.

Verified from a real operator session: `platform_overview`, `platform_schools`,
`platform_school_detail`, `platform_devices`, `platform_errors`, `platform_security_log`,
`platform_flags_and_releases` all returned 200; every backing table returned 401 to an
unauthenticated caller.

## SUPPORT MODE — PASS

A support session names one school, requires a reason of at least eight characters, expires on the
server's clock (5–240 minutes) and admits one school at a time. It grants administrator authority
only — never teacher, student or parent — and the session id is stamped onto every audit record by a
trigger rather than by a parameter each calling function could forget to pass. Withdrawing platform
authority ends every session that operator holds.

## TEACHER ACCESS CODE — PASS

Before this pass, anyone could open the public sign-up screen, choose "ครู", pick any school and be
granted an active verified teacher membership. That is closed. A teacher now needs a code the
school's own administrator issued, and the permissive database signature was dropped rather than
left callable.

The code is stored twice and neither copy suffices alone: an HMAC for matching, and the code sealed
with AES-GCM under a key held only in the Edge Function environment so an administrator can read
theirs back months later. A use is claimed under a row lock before the account exists, so two
teachers racing for the last use of a limited code cannot both win, and the claim is returned when
registration fails. Wrong, revoked, expired and used-up codes all answer identically.

Verified live: a school-chosen code registered a teacher at the issuing school; a wrong code and a
missing code were both refused; the same code was refused at another school.

This repository is public, so no live code, key or identifier belongs in it — including in a report
about how well they are protected.

## STUDENT — PASS

Name plus student number, no email, no password, no OTP. Server-side resolution, rate limiting,
lockout and opaque failures unchanged from the established implementation.

## MANAGED TEACHER IDENTITY — LOCAL PASS / LIVE PENDING

School administrators can now create a teacher roster row and provision its usable Auth identity in
the same save flow. The teacher receives a generated initial password and signs in by display name;
no email field, invitation step or teacher self-registration is required. Multiple subjects are
stored on the roster entry, and class assignments can carry a subject responsibility or remain a
class-advisor assignment. Audit and account-event rows are written by trusted server functions.

## PARENT — PARTIAL

Registration now records the selected school, child search is school-scoped, and a valid child match
is linked immediately. Legacy pending links remain readable. The portal itself covers linked
children, timetable, achievements and announcements; the fuller list in the specification —
attendance detail, missing work, per-subject feedback, calendar — is not built.

## SCHOOL MANAGEMENT — PASS

Terms, classes, subjects, teachers, students, enrolment, transfers and promotion remain school
scoped. Teacher assignments now support four explicit responsibilities without duplicate accounts:
class advisor, assistant advisor, subject owner and subject co-teacher. A class has at most one active
advisor, one assistant advisor and one subject owner per subject; assignment changes are audited.

## ATTENDANCE — PASS

Unchanged. Offline capture through the local-first path.

## ASSIGNMENTS — PASS

Teachers still see work and submission tracking for every class they are assigned to. Creating,
editing, publishing, cancelling and grading work is now limited to the exact class/subject where the
teacher is the active subject owner; advisors and assistants remain read-only for academic content.

## SCORES — PASS

One score ledger for everything. Quiz bonuses write through the same `score_events` path as manual
awards, with a reason, an author and a source, and the quiz source was added to the existing
constraints rather than to a second engine. Score entry, grade editing, activity/test scores and
quick-score awards now require the subject owner for the exact class and subject; advisors and
assistants can still inspect the whole assigned class.

## SYNC — PASS

Persistent queue, idempotency, exponential backoff, tombstones, protocol version and
`CLIENT_UPDATE_REQUIRED` all unchanged.

## SYNC CONFLICTS — PASS (new)

`sync_conflicts` had been recorded since the first migration and nothing could ever close one: a mark
edited on two devices left a row nobody saw and a change stuck in a queue forever. There is now a
screen that asks the question the database refused to answer for itself.

Both versions are shown field by field, only the fields that differ, with neither offered as a
default. Choosing the device's version goes through `apply_sync_mutation` against the current server
version, so it lands as an ordinary edit with an ordinary revision that other devices learn about
normally. Both answers record who chose and why.

Verified live: two conflicts manufactured and resolved both ways. Keeping the server left the record
untouched; keeping the device reapplied it with a version bump; pressing again resolved nothing
twice; both decisions appear in the audit log.

## OFFLINE — PASS

Unchanged. Mutations land in Dexie and the queue survives restart.

## QUESTION BANK — PASS (new)

The schema existed and had no screen. This pass added the screen and the one thing the schema was
missing: categories as rows rather than free text, so a school can rename one everywhere at once and
retire one without losing history. Unique per name per subject, with whitespace and case collapsed,
so one topic cannot split in two.

Searching runs on the server, so a bank of thousands stays usable on a tablet and the answer key of a
question nobody matched never reaches the device.

Verified locally: category and question creation is now subject-owner scoped, while advisors and
assistants can still use the assigned classroom without receiving answer keys. The previous live
verification remains valid for privilege boundaries; migration `202609010038` is still pending
deployment for the new owner checks.

## QUIZ CHALLENGE — PASS (new)

Live classroom rounds of 5, 10 or a custom count, chosen in order, at random or balanced across
difficulty. Questions are copied onto the round. The teacher moves the room; the countdown is the
server's; answers are unique per participant per question so a retry on classroom wifi is one answer
rather than two. Speed can add at most a quarter of a question's points, so a fast wrong answer never
beats a slow right one.

Quiz points are not marks. Awarding a bonus afterwards is a separate act, capped, recorded, and
refused a second time for the same round.

Verified live with two real sessions: student payload carried no answer key; the same answer sent
twice scored once; a question no longer on the board was refused; the bonus reached the score ledger
and a second award was refused.

## FORMAL EXAM — PASS (new)

Compose from the bank, schedule, sit, submit. The window and the countdown are the server's. An
attempt's expiry is written when it starts, so a refresh, a flat battery or a crash resumes the same
countdown rather than granting a fresh one, and answers are saved as they are chosen. Composition is
refused once anybody has started.

Verified live: composed, scheduled, started, resumed, answered, submitted and auto-marked; a second
attempt refused; a second submit returned the first; editing the paper afterwards refused.

## DEVICES — PASS

Device records carry client version, protocol version, last seen and last successful sync. Revoking
a device stops it re-registering itself, which is what makes revocation mean something.

## NOTIFICATIONS — FAIL

`notification_outbox`, preferences and the log all exist and are written to. **No Edge Function reads
the outbox and delivers anything.** Messages queue and stay queued.

This is the most consequential gap in the system: a school will believe a parent was told something
that was never sent. It should be closed before any pilot with real families.

## OPERATIONS CENTRE — PARTIAL

Present and verified: Overview, Schools with derived health, School detail, Error Centre, Device
Centre, Security log, Feature Flags, Releases, Changelog, Support Sessions.

Not built: Jobs/Queues, Tickets, Plans/Subscriptions/Usage.

School health is derived on every request rather than stored, because stored health goes stale the
moment nothing runs and a row reading "healthy" written before an incident is worse than no health at
all.

## SECURITY — PASS

Dangerous actions — suspending a school, suspending an account, publishing a release — require a
reason and a password proved within the last fifteen minutes, checked in the database so a direct API
call faces the same rule. They suspend rather than delete.

Forced logout is described for what it is rather than overpromised: a moment before which sessions
are refused, honoured by the client. A token already issued stays valid until it expires, so
suspension is the tool for actually stopping somebody.

The development sign-in is a separate Edge Function a production project simply does not deploy. It
is inert unless the server sets `PLATFORM_DEV_SIGN_IN`, still requires the platform code, signs in
only as an operator who already exists, and records every use.

**MFA is not implemented.** Re-authentication is a password within a window, not a second factor.

## RLS — PASS

No policy was loosened in this pass and nothing was granted BYPASSRLS. New tables holding answer keys
or credentials (`question_bank`, `question_categories`, `quiz_*`, `teacher_access_codes`,
`platform_admins`, `support_sessions`, `platform_error_events`) are revoked from `authenticated`
entirely, so a direct API call is refused by privilege rather than by a policy that has to keep being
written correctly.

Verified live: every one of those tables returned `401 permission denied` to an anonymous caller.

## DATABASE — BASELINE PASS / NEW MIGRATIONS LIVE PENDING

32 immutable migrations in the repository. Nothing deployed was edited; every repair is a new
migration. No data was reset. Migrations `202609010036`, `202609010037` and `202609010038` have not
been deployed from this environment, so their live RLS/RPC/trigger behaviour still needs a Supabase
migration run.

## PWA — PASS

Installable, offline shell, prompted updates. The operations console is excluded from the service
worker precache: an operations tool answering from yesterday's cache during an incident is worse than
no console.

## ANDROID READINESS — FAIL

No Capacitor configuration, no application id, no version code, no signing strategy. The product is
web and installed PWA only.

## REALTIME — NOT IMPLEMENTED

Supabase Realtime is not used anywhere. Live surfaces poll every two seconds. This is adequate for
one classroom and will not scale to many schools.

## TESTS — PASS

512 automated tests across 46 files, all passing. Coverage includes authorisation boundaries as
static assertions over the deployed SQL and Edge Functions, because a grant and a policy cannot be
exercised by rendering a screen.

Not covered: Playwright suites were not run in this pass; Android has nothing to test.

## REMAINING RISKS

1. **Notifications are never delivered.** Highest impact. A school will believe families were
   informed.
2. **Backup has never been restore-tested.** The specification says plainly that a backup without a
   tested restore is insufficient, and it is right.
3. **No Android build.** The specification names it as part of the product.
4. **No Realtime.** Polling is correct but will not hold at scale.
5. **No MFA for platform operators.** The account that can suspend any school is protected by a
   password and a fifteen-minute re-authentication window.
6. **Question bank has no import.** Every question is typed one at a time, which is a real barrier to
   a school with an existing question set.
7. **OCR import is refused rather than attempted.** Images and scanned PDFs return a clear error.

## READINESS

**CONDITIONALLY READY**

The paths that were built and verified in this pass hold up against the real database, and the
authorisation model is sound. It is not ready for production while queued notifications are never
sent, backups have never been restore-tested, and the Android product named in the specification does
not exist.

Recommended order of work: deploy and smoke-test `202609010038`, then the notification sender, a
restore test, question bank import and Android.
