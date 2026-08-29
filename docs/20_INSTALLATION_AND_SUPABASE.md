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
supabase functions deploy first-school-setup
supabase functions deploy parent-link
supabase functions deploy line-notify --no-verify-jwt
```

Configure server secrets:

```bash
supabase secrets set PARENT_LINK_HMAC_SECRET=<minimum-32-random-bytes>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<token>
supabase secrets set LINE_CHANNEL_SECRET=<secret>
supabase secrets set ALLOWED_ORIGINS=https://your-app.example
```

Migrations are immutable after deployment. Apply corrective changes as a new migration.

## First school

1. Invite/create the first Supabase Auth user.
2. Sign in through the application.
3. The setup screen invokes `bootstrap_school` transactionally to create the school, first admin membership, active academic term, scoring policy and policy drafts.
4. Register the board/device before the first critical sync.
