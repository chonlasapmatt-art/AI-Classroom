# Product activation key

How a customer who has just bought a Smart Classroom server turns it into their school.

## Why this exists

Before this, the only thing that could create the first school was `ADMIN_ACCESS_CODE_HASH`: one
code, hashed into the server environment at install time. That is the right shape for a deployment
the owner runs and the wrong shape for a product that is sold — the same code opens every customer's
server, and a customer who never had a copy of it has nothing of their own to activate with.

The setup wizard now draws a key for the account in front of it. The server generates the key, shows
it once, and keeps only its SHA-256 digest. The customer copies it, types it back on the next step,
and the school is created.

Typing the key back is not ceremony. It is the only moment where a customer who did not save the key
finds out while a new one is still one click away, rather than months later when the key is the only
thing that can reactivate their server.

## The three steps

| Step | What the customer does | What the server does |
| --- | --- | --- |
| 1 | Names the first administrator, the school and the school code | Nothing. No record is created yet. |
| 2 | Copies the product key | `admin-access` with `action: 'issue-product-key'` draws the key, stores `sha256(key)` and returns the plaintext once |
| 3 | Enters academic year, term and the key | `admin-access` verifies the key, runs `bootstrap_school_owner`, then spends the key |

The wizard is at the no-membership gate (`AdminSchoolSetupPage`), which is also what the private
owner route renders once an account exists. There is one activation screen, not two — and the same
screen, rendered at `/schools/new` with `mode="additional"`, is how an administrator who already
runs a school activates the next one.

## What is stored

`public.product_activation_keys` holds, per key:

* `actor_profile_id` — the account that drew it. A key spent by anybody else is refused, so a key
  read off one screen activates nothing on another server.
* `key_hash` — SHA-256 of the normalised key. This is what activation compares against, and it is
  the only thing that decides whether a typed key is right.
* `key_cipher` — the same key sealed with AES-GCM under `PRODUCT_KEY_SECRET`, which lives in the Edge
  Function environment and never in the database. This is what lets the customer be given their key
  back, and what lets the operator who sold the server read it in a support conversation.

  What that trades, stated plainly: a key is recoverable by somebody holding *both* the database and
  that secret. Neither alone is enough, opening a seal is a recorded support action rather than part
  of any sign-in, and the digest above remains the only thing activation checks. The alternative was
  a paying customer whose activation is unrecoverable, which is worse.
* `key_hint` — `SC-****-****-XXXXX`, enough to confirm which key somebody is holding in a support
  conversation and not enough to use it.
* `status` — `issued`, `consumed` or `replaced`.

The table is RLS-enabled and granted to nobody. Every path in and out is a security-definer function
callable only by `service_role`, which is to say only by the Edge Function.

Two partial unique indexes hold the invariants: one live key per account, and one live key per
digest.

## Rules the implementation depends on

* **One unspent key, and asking twice is not drawing twice.** The first ask draws a key; every later
  ask returns that same key, opened from its sealed copy. A key that changed under somebody who had
  written it down is a key they stop trusting, and "two keys in my notes, one of which works" was
  the support call this whole path exists to prevent. There is no "draw again" button.

  The single exception is a key issued before keys were sealed. There is no cipher to open, nobody
  can ever recover it, and refusing to move would strand that customer — so those, and only those,
  are retired and redrawn once. The retired row stays, so the history says a key was replaced rather
  than silently vanishing.
* **Verify and spend are separate.** The school does not exist when the key is checked. A key spent
  before `bootstrap_school_owner` succeeded would be gone for good the first time a school code
  collided, leaving a paying customer with a key that opens nothing.
* **Who may draw a key: a first-run account, or an existing administrator.** `may_activate_school`
  is the only place that rule is written, and both the draw and `bootstrap_school_owner` call it.
  An account with no membership at all is a customer activating their first server; an account that
  administers a school is the same customer activating their next campus. Everybody else — a
  student, a teacher, a parent — holds a membership and is refused with `ADMIN_ROLE_REQUIRED`.
  That is a different refusal from `ALREADY_HAS_MEMBERSHIP` on purpose: a student told "you
  already have a school" has no idea what to do next.
* **Normalisation is on the key only.** `sc a1b2c 3d4e5` and `SC-A1B2C-3D4E5` are the same key: case,
  spaces and dashes are presentation. `ADMIN_ACCESS_CODE_HASH` is still compared on the trimmed raw
  string, because that is how it was hashed.

## A key for every school

One account may run more than one school, and each of them is activated under its own key. Nothing
new enforces that: the live-key index already allows a single unspent key per account, and the key
is spent the moment its school exists, so the next draw is a new twenty characters. Two schools
never share a key, and the account never holds two unspent keys to confuse.

What the customer sees:

* **ตั้งค่า → โรงเรียนในบัญชีนี้** lists the schools this account administers and carries the
  "เพิ่มโรงเรียนใหม่" button. It is the only screen that answers for the account rather than for the
  school being looked at.
* The wizard runs outside the shell, so the new school is not being set up under the old one's
  sidebar, sync pill or repository.
* On success the new membership is selected for the administrator and the shell opens in the new
  school. A first-run account lands there on its own — its first membership replaces the wizard —
  but an administrator who already had a school is still standing in it, and without the switch the
  activation looks like nothing happened.
* The top-bar switcher names the school once the account holds more than one, instead of repeating
  the same role and display name twice.

The schools stay separate everywhere else. Each has its own code, term, settings, audit log and RLS
boundary; the account simply holds one membership row per school.

## Both doors, and when to use which

`admin-access` accepts either. It tries the account's own product key first, then the environment
code, and refuses with `SERVER_CONFIGURATION_ERROR` only when neither exists — a server nobody
finished setting up, which is worth saying plainly instead of five refusals that look like a typo.

* **Shipping to a customer:** deploy without `ADMIN_ACCESS_CODE_HASH`. The customer's key is the
  activation path.
* **A deployment the owner runs:** set `ADMIN_ACCESS_CODE_HASH` as before. Nothing changes.
* **Both:** supported, and gives support staff a way in that does not depend on the customer's key.

Rate limiting, lockout and the attempt log are unchanged and cover both doors, including drawing a
key: an account being hammered is not handed an endless supply of fresh keys to try against.

## When a customer loses their key

The operations console lists every key ever issued at **คีย์และการกู้บัญชี** (`/platform/recovery`):
the hint, which account drew it, which school it activated, and whether it can be recovered.

Opening one is a dangerous action and goes through the same gate as suspending a school: platform
authority, a password proved within fifteen minutes, and a written reason of at least eight
characters. The plaintext is assembled in the Edge Function that holds `PRODUCT_KEY_SECRET`,
returned once, and never stored by the console. `PRODUCT_KEY_REVEALED` goes into the security log
with the reason, and the key's own row counts how many times it has been opened — because a key
read twenty times is a question somebody should be able to ask later.

Two things it will not do. A key issued before sealing existed answers `KEY_NOT_RECOVERABLE`,
because it genuinely is not recoverable. And a key sealed under a `PRODUCT_KEY_SECRET` that has
since been rotated answers the same way rather than quietly handing back a different key.

## `PRODUCT_KEY_SECRET`

At least 32 characters, set as an Edge Function secret. `scripts/setup-supabase.ps1` generates and
sets it. First-run refuses to draw a key while it is unset — `SERVER_CONFIGURATION_ERROR`, 503 —
because a key nobody can ever recover is the failure this whole design exists to remove, and a
missing secret is one command to fix while an unrecoverable key is not.

Rotating it does not break activation: the digest still matches, so every existing key still opens
the server it was sold for. What rotation costs is recovery — keys sealed under the old value can
no longer be read back to anybody, and the console says so rather than guessing.

