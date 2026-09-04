# Live probes

Scripts that exercise the deployed system the way a person does: through the real Edge Functions and
the real RPCs, with real sessions, against the real database.

## Why these exist

Six defects in the last pass passed `typecheck`, `lint` and all 489 automated tests, and were caught
only by running these. Every one of them was invisible to the suite for the same reason: the suite
checks the code, and these check the deployment.

| Defect | What the suite saw | What the probe saw |
| --- | --- | --- |
| Teacher code HMAC keyed from two different environment variables | Both files looked correct | Every code stopped verifying the moment the dedicated secret was set |
| `school_health` variable named after a column | Valid SQL | `42702` on every call; the console could list no schools |
| `school_health` appending to an array with an untyped literal | Valid SQL | `22P02` the first time a reason was added |
| Quiz countdown offset cancelling itself | Arithmetic compiled | A device with a wrong clock got a wrong countdown |
| `award_quiz_bonus` variable named after a column | Valid SQL | `42702`; a finished round could never become marks |
| `exam_state` reading "released" as "results published" | Valid SQL | A published exam never reached `open`, so nobody could sit it |

None of these are exotic. They are the ordinary cost of writing PL/pgSQL and time arithmetic, and the
only cheap way to find them is to run the thing.

**Treat a green suite as necessary and not sufficient.** Before calling a server-side feature done,
write a probe for it.

## Running one

Every script takes its configuration from the environment and hardcodes nothing. Nothing here should
ever contain a project reference, a key, a password or an access code.

```powershell
# Keys come from the CLI rather than from a file, so they are never written to disk.
$keys = (npx supabase projects api-keys --project-ref <your-ref> --output json | Out-String) | ConvertFrom-Json
$env:SC_SERVICE_KEY = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
$env:SC_ANON_KEY    = ($keys | Where-Object { $_.name -eq 'anon' }).api_key
$env:SC_URL         = 'https://<your-ref>.supabase.co'
$env:SC_SCHOOL_ID   = '<a school id>'

# Whatever the probe needs
$env:SC_LOGIN_NAME     = '<staff display name>'
$env:SC_LOGIN_PASSWORD = '<their password>'
$env:SC_STUDENT_NAME   = '<student display name>'
$env:SC_STUDENT_CODE   = '<their student number>'

node scripts/probes/probe-quiz.js
```

Environment variables do not survive between shells, so set them in the same invocation that runs the
script.

## What each one does

| Script | Checks |
| --- | --- |
| `probe-platform.js` | Every operations-console read, as the operator's own session rather than as `service_role` — a read that works with the service key and fails in the browser is the failure worth finding |
| `probe-register.js` | Teacher registration: the school search, then a valid code, a wrong code and a missing code |
| `probe-dev-signin.js` | The development sign-in: wrong code refused, right code returns a session, and that session really is an operator's |
| `probe-operator-bootstrap.js` | The first-operator window: wrong code refused, short password refused, and the door shut once an operator exists |
| `probe-question-bank.js` | Question bank writes and reads as staff, and the same tables refused to an anonymous caller |
| `probe-quiz.js` | A whole live round: join, join twice, answer, answer again, a closed question, the bonus, the bonus twice |
| `probe-exam.js` | Compose, schedule, start, resume, answer, submit, submit twice, a second attempt, and editing a sat paper |
| `probe-conflict.js` | A manufactured conflict resolved both ways, and resolved twice |
| `probe-notifications.js` | The gap that mattered most: a queued message driven through the real dispatcher with the real secret, and the queue read back afterwards. Also refuses a caller with no secret and one with the wrong secret |
| `quiz-fixture.js` | `up` creates the questions and enrolment a probe needs; `down` removes them |

## The rule about probe data

These write into a real school. Everything a probe creates it must remove, and the tables must be
confirmed empty afterwards — a probe that leaves a fake teacher on a roster or a child enrolled in a
class nobody put them in has done more harm than the bug it was looking for.

`quiz-fixture.js down` exists for exactly this. Use it, then check.

## What a probe cannot tell you

`probe-notifications.js` checks that the dispatcher is reachable, refuses the wrong secret, drains
the queue and records the run. It cannot tell you whether anything is *calling* it every minute --
that is a schedule, not a request. Read `notification_dispatch_health` for that: it reports how long
ago the last run was beside how deep the queue is, and a queue with no recent run is the alarm.

