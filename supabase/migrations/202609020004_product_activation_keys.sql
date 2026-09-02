-- Per-purchase product activation keys.
--
-- Until now the only thing that turned a signed-in account into a school administrator was
-- `ADMIN_ACCESS_CODE_HASH`: one code, hashed once into the server environment, shared by every copy
-- of the product. That works for a single deployment the owner runs, and stops working the moment
-- the product is sold: the same code opens every customer's server, and a customer who mislays it
-- has nothing of their own to fall back on.
--
-- The setup wizard now draws a key of its own during first-run. The gateway generates it, shows it
-- once for the customer to copy, and stores only its SHA-256 digest here. The last step of the
-- wizard asks for the key back, which is what makes the copy step real rather than decorative: a
-- customer who did not save the key cannot finish, and finds that out while the key is still
-- recoverable by drawing a new one, not months later.
--
-- What this table deliberately is not: a licence check. It grants nothing on its own, it is scoped
-- to the one account that drew it, and it is spent the moment that account's school exists. The
-- environment code stays supported alongside it, so a deployment the owner activates by hand keeps
-- working unchanged.

begin;

create table if not exists public.product_activation_keys (
  id uuid primary key default gen_random_uuid(),
  -- The account that drew the key. A key belongs to one first-run and cannot be spent by anybody
  -- else, so a key read off somebody's screen is worth nothing to a different account.
  actor_profile_id uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 of the normalised key. The key itself is shown once by the gateway and never stored.
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  -- Safe to show in a support conversation: enough to confirm which key, not enough to use it.
  key_hint text not null default '',
  status text not null default 'issued' check (status in ('issued','consumed','replaced')),
  issued_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz,
  school_id uuid references public.schools(id)
);

-- One live key per account. Drawing again replaces the previous one in the same statement, so
-- "what is my key" always has exactly one answer and an abandoned key cannot be spent later.
create unique index if not exists product_activation_key_live_actor
  on public.product_activation_keys(actor_profile_id) where status = 'issued';
create unique index if not exists product_activation_key_live_hash
  on public.product_activation_keys(key_hash) where status = 'issued';

alter table public.product_activation_keys enable row level security;
revoke all on public.product_activation_keys from public, anon, authenticated;

comment on table public.product_activation_keys is
  'First-run product keys. No browser session can read this table; the gateway holds the only plaintext, once.';

/**
 * Draws a key for one account, retiring whatever it drew before.
 *
 * Replacing rather than refusing is the deliberate choice: a customer who closed the tab before
 * copying the key is the ordinary case, and the only safe recovery is a new key. The retired row is
 * kept so the school's history says a key was replaced rather than silently vanishing.
 */
create or replace function public.issue_product_activation_key(
  p_actor uuid, p_key_hash text, p_key_hint text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare new_id uuid; replaced uuid;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR'; end if;
  -- A key opens a first school. An account that already administers one has nothing to activate,
  -- and letting it draw keys would turn this into an endless supply of them.
  if exists(select 1 from public.school_memberships where profile_id=p_actor) then
    raise exception 'ALREADY_HAS_MEMBERSHIP';
  end if;

  update public.product_activation_keys
    set status='replaced' where actor_profile_id=p_actor and status='issued'
    returning id into replaced;

  insert into public.product_activation_keys(actor_profile_id, key_hash, key_hint)
    values(p_actor, lower(p_key_hash), left(coalesce(p_key_hint,''),40))
    returning id into new_id;

  return jsonb_build_object('keyId', new_id, 'replacedKeyId', replaced, 'hint', left(coalesce(p_key_hint,''),40));
end $$;

/**
 * Says whether a typed key is this account's live key, and returns which row it was.
 *
 * Verification is separate from spending because the school does not exist yet at this point. A key
 * spent before `bootstrap_school_owner` succeeds would be gone for good if the school name collided
 * with another, leaving the customer with a key they cannot use and no way to draw another.
 */
create or replace function public.verify_product_activation_key(p_actor uuid, p_key_hash text)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select id from public.product_activation_keys
  where actor_profile_id=p_actor and status='issued'
    and p_key_hash ~ '^[a-f0-9]{64}$' and key_hash=lower(p_key_hash)
  limit 1;
$$;

/** Spends a verified key, once the school it activated exists. */
create or replace function public.consume_product_activation_key(p_key_id uuid, p_school_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.product_activation_keys
    set status='consumed', consumed_at=clock_timestamp(), school_id=p_school_id
    where id=p_key_id and status='issued';
end $$;

revoke all on function public.issue_product_activation_key(uuid,text,text) from public,anon,authenticated;
revoke all on function public.verify_product_activation_key(uuid,text) from public,anon,authenticated;
revoke all on function public.consume_product_activation_key(uuid,uuid) from public,anon,authenticated;

grant execute on function public.issue_product_activation_key(uuid,text,text) to service_role;
grant execute on function public.verify_product_activation_key(uuid,text) to service_role;
grant execute on function public.consume_product_activation_key(uuid,uuid) to service_role;

comment on function public.issue_product_activation_key(uuid,text,text) is
  'Service-role-only. Records the digest of a first-run product key drawn by the gateway.';
comment on function public.verify_product_activation_key(uuid,text) is
  'Service-role-only. Matches a typed product key against the live key of one account.';

commit;
