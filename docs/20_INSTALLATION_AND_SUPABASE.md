# Installation and Supabase Setup

## Prerequisites

- Node.js 22+
- Supabase CLI and a Supabase project for each environment
- Git

## Local application

```bash
npm ci
copy .env.example apps\web\.env.local
npm run dev
```

Set only browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the web environment. Never place service-role, LINE, or HMAC secrets in a `VITE_` variable.

## Database

Link the intended **development** project first. Never run automated tests against production.

```bash
supabase link --project-ref <development-project-ref>
supabase db push
supabase functions deploy sync-push
supabase functions deploy admin-access
supabase functions deploy member-invitation
supabase functions deploy parent-link
supabase functions deploy line-notify --no-verify-jwt
supabase functions deploy notification-dispatch --no-verify-jwt
supabase functions deploy student-access --no-verify-jwt
```

Configure server secrets:

```bash
supabase secrets set PARENT_LINK_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set ADMIN_ACCESS_CODE_HASH=<sha256-hex-of-owner-code>
supabase secrets set MEMBER_INVITATION_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<token>
supabase secrets set LINE_CHANNEL_SECRET=<secret>
supabase secrets set STUDENT_ACCESS_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set STUDENT_ACCESS_EMAIL_DOMAIN=students.your-school.invalid
supabase secrets set ALLOWED_ORIGINS=https://your-app.example
supabase secrets set NOTIFICATION_DISPATCH_SECRET=<minimum-32-random-bytes>
```

Migrations are immutable after deployment. Apply corrective changes as a new migration.

## First school

1. Invite/create the first Supabase Auth user.
2. Sign in through the application.
3. Open the private Owner entry route directly. It is deliberately not linked from public UI.
4. The `admin-access` Edge Function rate-limits attempts, compares `ADMIN_ACCESS_CODE_HASH` server-side and invokes the service-role-only `bootstrap_school_owner` transaction.
5. Rotate or revoke Owner access by changing/removing `ADMIN_ACCESS_CODE_HASH`; never place the raw code in source, HTML, browser environment variables or logs.
6. Register the board/device before the first critical sync.

## Passwordless student access

Students hold no email address and no password. `student-access` is the only endpoint that can turn
a name and a student number into a session, and it is reached before the student has any account, so
it is deployed with `--no-verify-jwt` and defends itself instead:

- `STUDENT_ACCESS_HMAC_SECRET` keys the identity and client hashes in `student_access_attempts`. The
  raw name and student number are never stored. Rotating it resets the rate-limit history.
- `STUDENT_ACCESS_EMAIL_DOMAIN` names the domain used for the shadow auth accounts that hold student
  sessions. It must be a domain that cannot receive mail — the default is
  `students.smart-classroom.invalid`. Nothing is ever sent to it.
- `ALLOWED_ORIGINS` must list the app origin, or the browser call is refused by CORS.

Five failures against the same name-and-number pair, or twenty from the same client, lock further
attempts for fifteen minutes. Every failure returns the same code, so the endpoint cannot be used to
discover which students exist or which school they attend.

A school that wants only teacher-created students can set
`schools.allow_student_self_registration = false`; first-time registration is then refused while
existing students keep signing in normally.
