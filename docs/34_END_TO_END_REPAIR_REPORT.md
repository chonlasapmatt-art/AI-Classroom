# End-to-end repair: making the system actually work

**Branch** `claude/smart-classroom-v3-fix-5avrgk` · **Version** 3.2.0 · **Date** 2026-09-08

This is the report for one pass over Smart Classroom with a single question asked of every screen:
when somebody presses this button, does the data actually arrive — on the server, on the other
device, after a refresh, after being offline? Everything below was verified against the real code,
the real schema and, where a database was needed, a real PostgreSQL 16 with all 76 migrations
applied and probed as each role.

Nothing in the account, login, password, access-code, MFA or product-key systems was touched. The
verification of that is at the end.

---

## 1. What was wrong, and why

Seven of these are data-loss or authorization defects, not cosmetic ones. Each is stated as the
thing a person would have experienced.

### P0-1 · Seven kinds of academic record never left the device

`saveRubric`, `archiveRubric`, `grantExtension`, `recordAudit`, `saveNotificationPreference`, the
rubric marks written by `scoreSubmission` and the version rows written by `submitWork` all called
`db.<table>.put(...)` directly instead of `commitLocalMutation`. Dexie stored them; the sync queue
never saw them; `apply_sync_mutation` had no entity type for them; `pullStructure` never mirrored
them back.

The consequence was not "a missing feature". A rubric drawn up on the teacher's laptop did not exist
on the classroom board, so the same work was marked out of a different total in two places. A
deadline extension granted on one device left the student's own device computing lateness against
the class deadline, so a student who was given until Friday was still marked late on Wednesday. The
academic audit trail — the record of who changed a score and why — existed only on whichever device
happened to make the change, which is the one property an audit trail cannot have.

**Root cause.** The academic workflow (migration `202608290008`) shipped server tables and RPCs
(`upsert_rubric`, `grant_deadline_extension`, `record_academic_audit`, `save_notification_settings`)
and the client was written against Dexie only. The two halves were never connected, and no test
asserted that they were, because every test drove the repository and read Dexie back.

### P0-2 · The trusted boundary dropped most of the columns it was given

`apply_sync_mutation` inserted assignments with 11 of its 18 columns and submissions with 11 of its
21. `work_type`, `start_at`, `published_at`, `cancelled_at`, `reminder_offsets` and `rubric_id` were
dropped from work; `opened_at`, `acknowledged_at`, `revision_note`, `percentage`, `calculated_grade`,
`final_grade`, `grade_override_reason`, `graded_by` and `graded_at` were dropped from submissions.

Two of them were worse than dropped. `instructions` and `student_note` had no server column at all
until now, and both existed locally as `not null default ''`. So the first pull after a push
answered with an empty string, and `mergeLocal` — which only protects a field when the incoming
value is `null` — wrote that empty string over the text the author's own device still held. A
teacher typed the instructions for a project, synced, and watched them disappear.

**Root cause.** The columns were added to the tables by a later migration (`202608290008`) without
the mutation boundary being extended at the same time, and `not null default ''` cannot express "the
server was never told", so a pull could not tell absence from erasure.

### P0-3 · Students could not hand work in at all

`guard_teacher_academic_scope` (migration `202609010038`) is a trigger on `submissions`. It reads:

```
if has_school_role(admin) then return; end if;
if not has_school_role(teacher) then raise FORBIDDEN; end if;
...
elsif tg_table_name = 'submissions' then
  if not student_owns_student_record(student_id) then ... require subject owner
```

The branch written to let a student write their own submission sits *after* a check that already
refused everybody who is not staff. It has never run. Every student turn-in through the sync path
has been refused with `FORBIDDEN` since that migration landed — the local row was written, the queue
row was blocked, and the work never reached the teacher.

This was found by probing the real database, not by reading: the sync boundary's own
`student_owns_student_record` exemption made the code *look* correct.

### P0-4 · A student's device could rewrite the roster, and mark its own work

`apply_sync_mutation` had no authorization case for `student` or `enrollment` at all, so the
`is_active_member` check at the top was the only gate. A student's own device could rename a
classmate, change a classmate's status, or enrol itself into any class in the school. The submission
path accepted every grading column from whoever pushed it, so a student's device could push
`score: 95, finalGrade: "A+"` onto its own submission and the server stored it.

### P0-5 · A record with a natural key could only ever be created once

`student_achievements` is `unique(school_id, dedupe_key)`; submissions, activity scores and test
scores have partial unique indexes on their natural keys. A second device awarding the same badge,
or opening the same submission, hit the constraint. The queue item went to `blocked` and stayed
there: the same push would fail forever, and the person was shown a constraint name.

### P0-6 · The exam and quiz marked the wrong answers wrong

Both compared JSON arrays for equality:

```sql
correct := coalesce(p_selected, '[]'::jsonb) = question.answer_key;
```

A multiple-select answer is built by appending each choice as it is tapped, so a student who picked
the same correct choices in a different order was marked wrong. A short answer was compared as a
whole array against the list of accepted answers, so it was never once marked right — every short
answer in every exam scored zero and every teacher marked them by hand believing that was the design.

### P0-7 · Sync could not catch up, and pushed in the wrong order

`pullChanges` read one 500-row page per sync and then stopped, so a device a week behind caught up
one page a minute. It also issued one `select ... eq('id')` per change. `pushPending` took "the first
100 pending" in the queue's index order — which is keyed by a random UUID — so an enrollment could
reach the server before the student it names, and be refused for a foreign key the person never saw.
A pull also overwrote records that had unsent local changes.

### P1 · Two grade engines that disagreed

`features/scores/scoreEngine.ts` weighted three categories (assignment 60 / activity 30 / test 10,
from `score_policy`) and graded A–F at 80/70/60/50. `academic/gradebook.ts` weighted five categories
(from `gradebook_weights`) and graded with the school's own `grade_scheme`. The scores page, the
parent portal and every report used the first; the dashboard, the gradebook and the leaderboard used
the second. The same student was 78% and "C" on one screen and 84% and "B" on another, and the
gradebook ignored the activities table entirely. The settings screen offered both sets of weights, on
two different tabs, as though they were different settings.

`Submission.version` was also being read as "how many times this was handed in" while the sync
protocol was writing the server version into it, so the roster showed "v7" for a student who had
handed the work in once.

### P2 · The day, the imports, the backup, the files

- Every default date and day-grouping used `toISOString().slice(0,10)`, which is the **UTC** day. In
  Bangkok that is yesterday's date until 07:00, so the attendance sheet opened at 08:00 defaulted to
  the wrong day and work due at 23:30 was grouped under the wrong day on the calendar.
- The teacher/parent import aborted the whole run on the first refused row, so a typo in row 40 meant
  rows 41–120 were silently not imported. It recorded no receipt, and re-running it invited the same
  guardian twice.
- The backup omitted `scoreEvents` and `importRuns`, and included each parent's one-time
  `invitationCode` — a credential — in the file.
- The attachment panel accepted `*/*`, including `.exe`, `.bat`, `.js` and `.apk`, on devices that
  are shared classroom hardware. A file added while offline was stored with `storagePath: null` and
  there was no way to ever share it afterwards.
- The exam attempts table showed attempt numbers with no student names.
- `deliverDueReminders` delivered every student's reminders on whatever device happened to open the
  page.

---

## 2. What was done

### One new migration

`supabase/migrations/202609080003_every_record_reaches_every_device.sql`. No existing migration was
edited. It:

- adds `classroom_notifications` (RLS, `unique(school_id, dedupe_key)`, read scoped to
  `can_read_student` or the room's teacher);
- adds the missing sync columns (`version`, `deleted_at`, `server_updated_at`, `updated_at`) to
  `rubric_scores`, `submission_versions`, `deadline_extensions`, `notification_settings`;
- adds `assignments.instructions` and `submissions.student_note` and **drops the `not null`** on
  both, so `null` can mean "the server was never told" and a pull can no longer erase local text;
- replaces `apply_sync_mutation`: 20 entity types, every workflow column, natural-key lookup that
  returns the id it actually wrote, staff-only roster writes (a student may change only their own
  avatar), enrollment validated against the class's own term, a student's turn-in stripped of every
  marking column with lateness decided from the server clock and the student's personal deadline, an
  append-only audit path, and a delete of a row the server never had answered as accepted rather
  than refused;
- replaces `sync_change_visible` for the seven new entity types (a rubric is staff-only; marks,
  versions, extensions and notices follow the student; the audit trail is admin-only);
- replaces `guard_teacher_academic_scope` so a student may write their own submission on work
  published to a room they are actively enrolled in — and fixes a `column reference "school_id" is
  ambiguous` error in its score-event branch that meant that check never ran at all;
- adds `answer_matches(question_type, given, key)` — set equality for choices, case- and
  space-insensitive matching for short answers — and uses it in both `submit_quiz_answer` and
  `submit_exam_attempt`.

### Client

- `SyncEntityType` gains the seven new types; `localMutation` gains `commitLocalMutations`, which
  writes several records and their queue rows in **one** local transaction, so publishing work or
  promoting a cohort is all-or-nothing.
- Every repository method listed in P0-1 now goes through the queue. Reminder deletion is a
  tombstone, not a physical delete, so a resubmission can revive the same reminder identity.
- The sync engine pushes in the order changes were made (a new monotonic `sequence`), pages the
  journal until it is drained, reads rows in batches of 100 by id, leaves alone any record with an
  unsent local change, and re-keys the local row when the server answers with a different id.
- One grade engine: `buildGradebook` is canonical, folds in activities, honours the late/missing
  policy, and `standingsFor`/`subjectResultsFor` delegate to it. `scoreEngine.ts` is deleted. The
  duplicate weights form is gone from the settings policy card, which now points at the academic tab.
- `domain/dates.ts` (`localDateKey`, `dayKeyOf`) replaces every UTC date slice.
- Import runs row-by-row with per-row reasons, deduplicates within the file and against what is
  already on file, and records a receipt like the student import already did.
- Backup covers `scoreEvents` and `importRuns` and strips `invitationCode`.
- Attachments refuse programs and scripts on every device, keep an offline file with a "แชร์ตอนนี้"
  action, and the exam table shows student names.

### Tests

862 tests in 88 files, up from 828 in 84. New: `syncBoundarySchema` (the migration's guarantees as
static assertions), `academicSync` (every academic record reaches the queue; turn-in numbering;
reminder tombstones; promotion atomicity; teacher enrollment scope), `syncEngine` (ordering, paging,
re-keying, pending-wins), `gradeEngine` (every screen reads the same total), `localDays`.

---

## 3. Verified against a real database

All 76 migrations were applied in order to PostgreSQL 16, then `apply_sync_mutation` was called as an
admin, a teacher, and two students with real JWT claims. Verbatim results:

| Probe | Result |
| --- | --- |
| Student renames a classmate | **REFUSED** `FORBIDDEN` |
| Student writes their own record | **accepted** — name unchanged, avatar 0 → 7 |
| Enrollment into another term's room | **REFUSED** `class is not in that term` |
| Enrollment naming an unknown student | **REFUSED** `unknown student` |
| Student enrols themselves | **REFUSED** `FORBIDDEN` |
| Student turns in work with `score: 95, finalGrade: "A+"` | **accepted** — score `null`, grade `null`, `gradedBy` `null`, teacherNote empty, status corrected `submitted` → `late` by server clock, student's note kept |
| Student submits for a classmate | **REFUSED** `FORBIDDEN` |
| Teacher marks it from a different entity id | **accepted** — re-keyed onto the same row (1 row, v2), student's note survives |
| Same badge awarded from two devices | **accepted** twice — 1 row |
| Student edits a notice's wording | **accepted** — state/readAt applied, title unchanged |
| Student writes an audit entry | **REFUSED** `FORBIDDEN` |
| Audit entry replayed | **accepted** — still 1 row, actor is the signed-in teacher, not the claimed one |
| Audit entry deleted | **REFUSED** `the audit trail is append-only` |
| Delete of a row the server never had | **accepted**, 0 journal rows |
| Teacher awards a score event | **accepted** (previously raised `column reference is ambiguous`) |
| Student awards themselves 100 points | **REFUSED** `FORBIDDEN` |

Auto-grading, same database: order-independent multiple-select `true`; partial answer `false`;
`"  Bangkok  "` against `["bangkok"]` `true`; an alternative accepted answer `true`; a wrong answer
`false`; empty answer or empty key `false`.

Visibility per role (`sync_change_visible`):

| Entity | admin | teacher | owning student | classmate |
| --- | --- | --- | --- | --- |
| `rubric` | ✓ | ✓ | ✗ | ✗ |
| `rubric_score` | ✓ | ✓ | ✓ | ✗ |
| `deadline_extension` | ✓ | ✓ | ✓ | ✗ |
| `classroom_notification` | ✓ | ✓ | ✓ | ✗ |
| `notification_preference` | ✓ | own | ✗ | ✗ |
| `academic_audit` | ✓ | ✗ | ✗ | ✗ |

---

## 4. Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 warnings) |
| `npm run test` | pass — 862 tests, 88 files |
| `npm run build` | pass |
| `npm run test:e2e` | pass — 4 tests (board + mobile) |
| `npm run test:e2e:student` | pass — 44 tests (student desktop + mobile) |
| `npm audit --audit-level=high` | pass — 3 moderate, 0 high, 0 critical |
| 76 migrations against PostgreSQL 16 | applied clean, in order |

---

## 5. Blockers — what could not be verified here, and what to do

1. **No Supabase project is reachable from this environment.** There is no `apps/web/.env.local` and
   no credentials. Everything above was proved against a local PostgreSQL 16 with stand-ins for
   `auth`, `storage`, `vault`, `cron` and `net`. What that cannot prove: Edge Function behaviour,
   real RLS under the `authenticated` role over PostgREST, Storage uploads, and Realtime. Apply the
   new migration to staging and re-run the smoke checklist below before production.

2. **Migration to apply.** `supabase db push` — or apply
   `202609080003_every_record_reaches_every_device.sql` in filename order. It is additive: new table,
   new columns, replaced functions. It drops two `not null` constraints; existing rows keep their
   empty strings.

3. **Devices upgrade themselves.** Local schema 13 → 14 adds indexes only. On first sync after the
   upgrade, `enqueueUnsyncedRecords` queues the academic records an older build left behind
   (version 0, no queue row) once per device, so rubrics and extensions written before this change
   reach the server rather than being stranded.

4. **The notification scheduler still has to be scheduled.** Unchanged by this work and still the
   step most often forgotten — `docs/21_DEPLOYMENT_RUNBOOK.md` §"The notification schedule". Until it
   is, parent messages queue and nothing reports them as sent. No secret belongs in the repository.

5. **Not attempted.** OCR of scanned documents is not supported and the import screen says so.
   Multi-device and offline/online behaviour was proved by unit and integration tests plus SQL
   probes, not by two physical devices against a live project.

---

## 6. Smoke checklist

**Admin** — open a term and a room; add a student and enrol them; add a teacher and assign them a
subject; import a teacher file with one bad row (expect: the run continues, the receipt names the
row); set the gradebook weights on the academic tab (expect: no second weights form on the policy
tab); promote a cohort (expect: all or nothing); take a backup and inspect it (expect: `scoreEvents`
and `importRuns` present, no `invitationCode`); open Sync & Backup (expect: every blocked change
names a record and a reason).

**Teacher** — publish a project with instructions, a rubric and reminders; refresh (expect: the
instructions are still there); open it on a second device (expect: the rubric and the instructions
are there); grant one student an extension; mark by rubric; request a revision; check the attendance
sheet defaults to *today's* local date; try attaching a `.exe` (expect: refused); attach a PDF while
offline (expect: "อยู่เฉพาะเครื่องนี้" and a "แชร์ตอนนี้" button when back online); open an exam's
attempts table (expect: student names).

**Student** — see the new work and the notice; open and acknowledge; turn work in with a Drive link
(expect: accepted, and on the teacher's device it appears); resubmit after a revision request
(expect: v1 and v2 kept, not v7); check the personal extension is honoured on this device; sit a quiz
picking multiple correct choices in a different order (expect: marked right); answer a short-answer
exam question with different capitalisation (expect: marked right); confirm no rubric definition and
no classmate's marks are visible.

**Parent** — see only the linked child; see the same total and grade the teacher sees; confirm the
attendance and score sharing switches are honoured.

---

## 7. Files

**New** — `supabase/migrations/202609080003_every_record_reaches_every_device.sql`,
`apps/web/src/domain/dates.ts`, and five test files (`syncBoundarySchema`, `academicSync`,
`syncEngine`, `gradeEngine`, `localDays`).

**Deleted** — `apps/web/src/features/scores/scoreEngine.ts` and its test (folded into
`academic/gradebook.ts`).

**Changed (31)** — `academic/gradebook.ts`, `academic/views.ts`, `data/academicOps.ts`,
`data/attachmentKind.ts`, `data/dexieSchoolRepository.ts`, `data/fixtureSchoolRepository.ts`,
`data/schoolRepository.ts`, `data/selectors.ts`, `db/database.ts`, `db/localMutation.ts`,
`domain/types.ts`, `sync/engine.ts`, `sync/retry.ts`, and the attachment, attendance, backup,
classroom, dashboard, exams, grades, imports, leaderboard, operations (×2), parents (×2), reports,
scores and settings screens, plus two existing tests.

---

## 8. What was not modified

Confirmed by `git status` against the protected list: nothing under `features/auth/`, no
`AuthContext.tsx`, no `TeacherAccessCodePanel.tsx` or `teacherAccessCode.ts`, no `adminAccount.ts`,
`identityActivation.ts` or `schoolActivation.ts`, no `platformClient.ts` or `PlatformRecovery.tsx`,
no Edge Function under `*access*`, `*account*`, `*bootstrap*`, `member-invitation` or `parent-link`,
no `_shared/productKey.ts` or `_shared/teacherCode.ts`, and **no existing migration file was edited
or deleted** — the only change under `supabase/migrations/` is one new file.

Account creation and login for every role, usernames, passwords, teacher codes, student codes, access
codes, password reset, OTP, recovery, MFA, the product activation key, owner bootstrap, first-school
setup, platform operator login, teacher provisioning and parent/student/teacher binding are all
untouched. No `.env`, Supabase Auth config or Vercel setting was changed. No secret, token, password
or access code appears in any file added here. No RLS policy was weakened: the only policy added is a
new `select` policy on the new table, and every authorization change in this work is a narrowing.
