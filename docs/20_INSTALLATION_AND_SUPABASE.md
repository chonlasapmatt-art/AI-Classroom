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
```

Configure server secrets:

```bash
supabase secrets set PARENT_LINK_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set ADMIN_ACCESS_CODE_HASH=<sha256-hex-of-owner-code>
supabase secrets set MEMBER_INVITATION_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<token>
supabase secrets set LINE_CHANNEL_SECRET=<secret>
supabase secrets set ALLOWED_ORIGINS=https://your-app.example
```

Migrations are immutable after deployment. Apply corrective changes as a new migration.

## First school

1. Invite/create the first Supabase Auth user.
2. Sign in through the application.
3. Open the private Owner entry route directly. It is deliberately not linked from public UI.
4. The `admin-access` Edge Function rate-limits attempts, compares `ADMIN_ACCESS_CODE_HASH` server-side and invokes the service-role-only `bootstrap_school_owner` transaction.
5. Rotate or revoke Owner access by changing/removing `ADMIN_ACCESS_CODE_HASH`; never place the raw code in source, HTML, browser environment variables or logs.
6. Register the board/device before the first critical sync.
