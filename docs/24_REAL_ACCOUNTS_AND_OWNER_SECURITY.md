# Real Accounts, Teacher Verification and Private Owner Access

> Historical design record. The current public Teacher/Parent/Student access and recovery behavior
> is defined by `27_SIMPLE_NAME_PASSWORD_ACCESS.md`; where this document conflicts, document 27 wins.

## Implemented boundary

- Public Supabase registration supports Teacher, Student and Parent requests only.
- Registration metadata is non-authoritative. A new account receives no school membership until it redeems a server-issued invitation.
- Student/Parent redemption links the Auth user to an existing school record; it does not create a duplicate person.
- Teacher redemption creates an inactive membership and `verification_pending` state. Only `verified_teacher` can pass teacher authorization.
- Verified Teacher may perform normal class, subject, teacher-assignment, parent-link and enrollment-transfer operations through audited RPCs.
- Deep system configuration and role assignment remain outside the Teacher operational boundary.

## Private Owner bootstrap

The legacy authenticated `bootstrap_school` function is revoked. The private route is deliberately unlinked and calls `admin-access`:

1. validate Supabase Auth session;
2. rate-limit by actor and hashed request fingerprint;
3. compare SHA-256 input to `ADMIN_ACCESS_CODE_HASH` in constant time;
4. record failed/success attempts without the raw code;
5. invoke service-role-only `bootstrap_school_owner`;
6. create the first school/membership/term/settings and trusted audit atomically.

Security does not rely on route secrecy. Rotation or revocation is performed by changing/removing the Edge Function secret.

## Member invitations

`member-invitation` uses `MEMBER_INVITATION_HMAC_SECRET` to store only keyed hashes. Codes are short-lived, single-use, attempt-limited and email-bound. Creation requires `can_operate_school`; redemption is transactional and audited.

## Deployment

```bash
supabase db push
supabase functions deploy admin-access
supabase functions deploy member-invitation
```

Configure all server secrets from `docs/20_INSTALLATION_AND_SUPABASE.md`. Never put them in a `VITE_` variable.

## Current limitation

This repository is credential-ready, not Production Ready. A real Supabase staging project is still required to execute the live Auth/RLS/Edge Function negative suite and migration smoke test.
