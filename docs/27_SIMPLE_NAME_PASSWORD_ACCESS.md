# Simple Name + Password Access

Design record for the login model the Product Owner chose: a teacher or a parent signs in with the
name they are known by plus a password, a student with a name plus a student number, and a parent
adds a child by typing the child's real name and nothing else.

The interface is the simple part. This document is about where the complexity went instead.

## What each role types

| Role | Sign in | Sign up |
| --- | --- | --- |
| Teacher | name, password | first name, last name, school, recovery email, password — active immediately |
| Parent | name, password | first name, last name, recovery email, password — no school, no child |
| Student | name, student number | first name, last name, student number, school |
| Owner | name, password | first name, last name, password at `/owner/access`, then the owner code |

No email address, OTP, school code or invitation code appears in normal sign-in. Recovery email is
collected only during Teacher/Parent registration, and its six-digit OTP appears only in Forgot Password.

## The problem a name creates

Supabase Auth identifies an account by an email address, and names are not unique. Two teachers can
share a name; so can two parents, and two children in the same school year.

The gateway resolves this without ever deciding anything about a password itself:

1. A Teacher or Parent's recovery address is stored as the Supabase Auth email and in
   `member_login_identities.auth_email`. The normal screen never asks for it; only the trusted gateway
   resolves name to this address. Existing accounts with generated internal addresses remain valid.
2. `resolve_member_login(role, name)` returns **every** account whose normalized name matches, up to five.
3. The gateway calls `signInWithPassword` once per candidate. GoTrue does the verification with its
   own hashing; the gateway learns only whether each attempt succeeded.
4. Exactly one success is the answer. Zero is the generic failure. **More than one** — two namesakes
   who also chose the same password — returns `MEMBER_SELECTION_REQUIRED` with school names, and the
   person picks. Guessing here would sign somebody into a stranger's account.

The owner resolves from the same "ครู" choice on screen: `resolve_member_login` matches `admin`
identities when asked for `teacher`, so the private role never has to appear in public UI.

## Where authority lives

Nothing above grants anything. An account is just an account:

- A **teacher** becomes staff because `register_member_identity` writes a `school_memberships` row for
  the school they picked, and a `teachers` row with `verification_status='verified_teacher'`. An
  administrator can revoke that afterwards; nobody has to approve it first.
- A **parent** has no school at all until a child link is approved. Their membership is written by
  `link_parent_child`, and their access to student data still runs through the unchanged RLS pair
  `parent_has_active_link` + `parent_has_active_consent`.
- The **owner** becomes an administrator only through `admin-access`, which checks the owner code
  hash, rate limits, locks out and audits. Creating the account at `/owner/access` grants nothing.

## Adding a child by name alone

The screen asks for one field. The server does the rest:

```
parent types "ธนกร"
  → search_children_for_parent(actor, name)      identity cards only: school, class,
                                                  masked student number, avatar
  → parent picks a card
  → link_parent_child(actor, student_id)
       ├─ school already recorded a guardian of this name for this child, with no account
       │    → adopt that record, status 'linked', consent written, data opens now
       └─ otherwise
            → status 'pending', teacher approves at /parents
```

The search returns nothing academic — no scores, no attendance, no submissions — so knowing a name
gets a stranger as far as a card and no further. The link is what opens data, and a link that the
school's own records cannot vouch for waits for a teacher.

`set_parent_link_state` handles approve, revoke and restore. Staff may do all three for anyone in
their school; a parent may only revoke their own link, never approve one.

## Recovery email and reset link

Normal login never touches email. Recovery uses the existing Supabase Auth account instead of a
second password or a separate OTP system:

1. The person opens `/forgot-password` and enters the recovery email saved during registration.
2. `resetPasswordForEmail` sends the provider's recovery email and returns to `/reset-password`.
3. The person opens the recovery link from the email; Supabase creates a temporary recovery session.
4. The page checks that session before allowing `updateUser` to set a new password.

The request screen gives the same answer for an unknown address, recovery is absent from normal
sign-in, and the old password is never read or shown. Hosted Supabase Free projects using the
default email provider send the standard recovery link; a six-digit custom OTP requires Custom SMTP
or an upgraded email configuration and is not assumed by this app.

## Abuse resistance

Identical in shape to the student entrance, because the credential is similarly guessable:

- Rate limited per identity (5 failures / 15 minutes) and per client (20 / 15 minutes), checked
  **before** any lookup runs.
- One opaque failure code, `MEMBER_ACCESS_DENIED`, rendered as "ชื่อหรือรหัสผ่านไม่ถูกต้อง". The screen
  never says which half was wrong, or whether the name exists.
- `member_access_attempts` stores an HMAC of the identity and of the client fingerprint. The typed
  name and the password never reach the table an operator reads during an incident.
- A registration whose records fail to write deletes the auth user it just created, so no account is
  left able to sign in with nothing behind it.

## What was deliberately not done

- No password hash of our own, no password column, no comparison in SQL or in React.
- No email field in normal Teacher/Parent login and no OTP outside Forgot Password.
- No relaxed RLS. A session minted here is an ordinary Supabase session; `auth.uid()` works and every
  existing policy applies unchanged.
- No service-role key in the browser. Every lookup that can turn a name into an account is
  `service_role` only; the browser may call exactly two of the new functions — `list_parent_children`,
  which takes no arguments and reads `auth.uid()`, and `set_parent_link_state`, which checks the
  school itself.

## Where it lives

| Piece | Path |
| --- | --- |
| Schema, functions, grants | `supabase/migrations/202608300016_simple_name_password_access.sql` |
| Gateway | `supabase/functions/member-access/index.ts` |
| Client | `apps/web/src/features/auth/memberAccess.ts` |
| Screens | `LoginPage.tsx`, `AccountPages.tsx`, `OwnerAccessPage.tsx`, `parents/ChildLinkPanel.tsx`, `parents/MyChildrenPage.tsx`, `parents/ParentRequestsPanel.tsx` |
| Recovery template/config | `supabase/templates/recovery.html`, `supabase/config.toml` |
| Tests | `tests/unit/memberAccess.test.ts`, `tests/integration/memberAccessSecurity.test.ts`, `tests/e2e-student/memberAccess.spec.ts` |

Tester walkthrough: [`26_TESTER_QUICKSTART_TH.md`](26_TESTER_QUICKSTART_TH.md).
