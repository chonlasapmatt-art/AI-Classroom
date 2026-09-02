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
owner route renders once an account exists. There is one activation screen, not two.

## What is stored

`public.product_activation_keys` holds, per key:

* `actor_profile_id` — the account that drew it. A key spent by anybody else is refused, so a key
  read off one screen activates nothing on another server.
* `key_hash` — SHA-256 of the normalised key. The plaintext exists in one HTTP response and nowhere
  else: not in the table, not in the audit log, not in browser storage.
* `key_hint` — `SC-****-****-XXXXX`, enough to confirm which key somebody is holding in a support
  conversation and not enough to use it.
* `status` — `issued`, `consumed` or `replaced`.

The table is RLS-enabled and granted to nobody. Every path in and out is a security-definer function
callable only by `service_role`, which is to say only by the Edge Function.

Two partial unique indexes hold the invariants: one live key per account, and one live key per
digest.

## Rules the implementation depends on

* **Drawing again replaces.** A customer who closed the tab before copying cannot be given the old
  key back — the server never had it. The previous row becomes `replaced` in the same statement that
  writes the new one, so "what is my key" always has exactly one answer.
* **Verify and spend are separate.** The school does not exist when the key is checked. A key spent
  before `bootstrap_school_owner` succeeded would be gone for good the first time a school code
  collided, leaving a paying customer with a key that opens nothing.
* **An account that already administers a school cannot draw a key.** There is nothing left to
  activate, and allowing it would turn this into an endless supply of keys.
* **Normalisation is on the key only.** `sc a1b2c 3d4e5` and `SC-A1B2C-3D4E5` are the same key: case,
  spaces and dashes are presentation. `ADMIN_ACCESS_CODE_HASH` is still compared on the trimmed raw
  string, because that is how it was hashed.

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
