-- One product key per customer, readable again by the operator who sold it; and a password reset
-- only the platform operator can perform.
--
-- Three complaints, one root: the product key was write-once and nobody kept a copy.
--
--   * "Draw again" was a button. A customer who pressed it twice had two keys in their notes and one
--     that worked, and no way to tell which. The key is now drawn once and returned unchanged on
--     every later ask -- pressing the button again is not a new key, it is the same key.
--
--   * The operator who sold the product could not see the key. Only `sha256(key)` was stored, so a
--     customer who lost theirs could be given a replacement and never an answer. The key is now
--     also stored sealed with AES-GCM under a secret held in the Edge Function environment, exactly
--     as a teacher access code already is, and the operations console can open it.
--
--     What that trades: a key is recoverable by whoever holds both the database and
--     `PRODUCT_KEY_SECRET`. Neither alone is enough, and the digest is still what activation matches
--     against -- opening the seal is a support action, never part of a sign-in. The alternative on
--     offer was a customer whose paid activation is unrecoverable, which is worse.
--
--   * A school administrator who forgot their password had nobody to ask. School administrators are
--     the top of their own school and there is no rank above them inside it. The platform operator
--     is that rank, and can now reset one -- with a reason, a fresh password of their own, and a
--     record. A reset issues a new password; it does not reveal the old one. Passwords are bcrypt
--     hashes in GoTrue and no function here or anywhere else can read one back, which is a property
--     worth keeping rather than a limitation to work around.

begin;

-- ---------------------------------------------------------------------------
-- One key, and one that can be read back
-- ---------------------------------------------------------------------------

alter table public.product_activation_keys
  add column if not exists key_cipher text,
  add column if not exists last_revealed_at timestamptz,
  add column if not exists reveal_count integer not null default 0;

comment on column public.product_activation_keys.key_cipher is
  'The key sealed with AES-GCM under PRODUCT_KEY_SECRET. Null on keys drawn before this was stored.';

-- Drawing is now idempotent. The old signature replaced the live key on every call, which is what
-- made "draw again" a way to lose the key that was actually sold.
drop function if exists public.issue_product_activation_key(uuid,text,text);

/**
 * Returns this account's product key, drawing one the first time and only the first time.
 *
 * A key that can be read back has no honest reason to be replaced, so this no longer replaces one.
 * The single exception is a key drawn before keys were sealed: there is no cipher to open, nobody
 * can ever recover it, and refusing to move would leave that customer stuck forever. Those are
 * retired and redrawn once, and the retired row stays so the history says so.
 */
create or replace function public.issue_product_activation_key(
  p_actor uuid, p_key_hash text, p_key_cipher text, p_key_hint text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare live public.product_activation_keys%rowtype; new_id uuid; replaced uuid;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR'; end if;
  if coalesce(trim(p_key_cipher),'') = '' then raise exception 'VALIDATION_ERROR: cipher required'; end if;
  -- An account that already administers a school has nothing left to activate, and letting it draw
  -- keys would turn this into an endless supply of them.
  if exists(select 1 from public.school_memberships where profile_id=p_actor) then
    raise exception 'ALREADY_HAS_MEMBERSHIP';
  end if;

  select * into live from public.product_activation_keys
    where actor_profile_id=p_actor and status='issued' for update;

  if found and live.key_cipher is not null then
    return jsonb_build_object('keyId', live.id, 'hint', live.key_hint,
      'keyCipher', live.key_cipher, 'existing', true);
  end if;

  if found then
    update public.product_activation_keys set status='replaced' where id=live.id returning id into replaced;
  end if;

  insert into public.product_activation_keys(actor_profile_id, key_hash, key_cipher, key_hint)
    values(p_actor, lower(p_key_hash), p_key_cipher, left(coalesce(p_key_hint,''),40))
    returning id into new_id;

  return jsonb_build_object('keyId', new_id, 'replacedKeyId', replaced,
    'hint', left(coalesce(p_key_hint,''),40), 'existing', false);
end $$;

revoke all on function public.issue_product_activation_key(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.issue_product_activation_key(uuid,text,text,text) to service_role;

comment on function public.issue_product_activation_key(uuid,text,text,text) is
  'Service-role-only. Returns the account''s one product key, drawing it only if there is not one already.';

-- ---------------------------------------------------------------------------
-- What the operations console can see
-- ---------------------------------------------------------------------------

/**
 * Every product key ever drawn, as a list. Hints only -- the sealed key is not in this answer.
 *
 * Which account drew it and which school it activated are the two things a support conversation
 * actually starts from ("we bought it in March, the school is ..."), so both are here.
 */
create or replace function public.platform_product_keys(p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'keyId', k.id, 'hint', k.key_hint, 'status', k.status,
      'issuedAt', k.issued_at, 'consumedAt', k.consumed_at,
      'actorProfileId', k.actor_profile_id, 'actorName', p.display_name,
      'schoolId', k.school_id, 'schoolName', s.name, 'schoolCode', s.code,
      'recoverable', k.key_cipher is not null,
      'lastRevealedAt', k.last_revealed_at, 'revealCount', k.reveal_count
    ) order by k.issued_at desc)
    from (select * from public.product_activation_keys order by issued_at desc
          limit least(coalesce(p_limit,200),500)) k
    left join public.user_profiles p on p.id = k.actor_profile_id
    left join public.schools s on s.id = k.school_id
  ), '[]'::jsonb);
end $$;

revoke all on function public.platform_product_keys(integer) from public,anon;
grant execute on function public.platform_product_keys(integer) to authenticated;

/**
 * Hands the sealed key to the Edge Function that can open it, and writes down that it did.
 *
 * The cipher never reaches a browser through this path -- the console asks the function, the
 * function asks this, opens the seal in its own environment and returns the plaintext once. The
 * count and the timestamp are kept because a key read twenty times is a question somebody should be
 * able to ask later.
 */
create or replace function public.reveal_product_activation_key(
  p_actor uuid, p_key_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_key public.product_activation_keys%rowtype;
begin
  if not public.is_platform_admin(p_actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not public.platform_reauth_fresh(p_actor,15) then
    raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'VALIDATION_ERROR: reason required'; end if;

  select * into row_key from public.product_activation_keys where id=p_key_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if row_key.key_cipher is null then raise exception 'KEY_NOT_RECOVERABLE'; end if;

  update public.product_activation_keys
    set last_revealed_at=clock_timestamp(), reveal_count=reveal_count+1 where id=p_key_id;

  perform public.record_platform_event(p_actor,'PRODUCT_KEY_REVEALED',row_key.school_id,
    row_key.actor_profile_id,p_reason,jsonb_build_object('keyId',p_key_id,'hint',row_key.key_hint));

  return jsonb_build_object('keyId',row_key.id,'keyCipher',row_key.key_cipher,'hint',row_key.key_hint,
    'status',row_key.status,'schoolId',row_key.school_id);
end $$;

revoke all on function public.reveal_product_activation_key(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reveal_product_activation_key(uuid,uuid,text) to service_role;

comment on function public.reveal_product_activation_key(uuid,uuid,text) is
  'Service-role-only. Releases one sealed product key to the Edge Function holding the key, and records it.';

-- ---------------------------------------------------------------------------
-- Password recovery the school cannot do for itself
-- ---------------------------------------------------------------------------

/**
 * The accounts inside one school, as the operations console needs them to pick one.
 *
 * Names, roles and statuses. No marks, no attendance, no contact details, and no student rows: a
 * student signs in with a name and a student number and has no password for anybody to reset, so
 * including them here would only invite an action that does not exist.
 */
create or replace function public.platform_school_accounts(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_school_id is null then raise exception 'VALIDATION_ERROR'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'profileId', m.profile_id, 'displayName', p.display_name, 'role', m.role,
      'membershipStatus', m.status, 'accountStatus', p.global_status,
      'isPlatformAdmin', exists(select 1 from public.platform_admins a
        where a.profile_id=m.profile_id and a.status='active' and a.revoked_at is null)
    ) order by m.role, p.display_name)
    from public.school_memberships m
    join public.user_profiles p on p.id = m.profile_id
    where m.school_id = p_school_id and m.role in ('admin','teacher','parent')
  ), '[]'::jsonb);
end $$;

revoke all on function public.platform_school_accounts(uuid) from public,anon;
grant execute on function public.platform_school_accounts(uuid) to authenticated;

/**
 * Authorises one password reset and records it. The new password is set by GoTrue, not here.
 *
 * A reset is not a read. There is no path in this system that returns somebody's existing password,
 * because GoTrue holds a bcrypt hash and that is the correct thing for it to hold. What an operator
 * can do is issue a new one and tell the account holder what it is -- which is why the reason is
 * mandatory and the event is written before the password changes rather than after.
 *
 * A platform operator is not a target. Resetting a peer's password from inside the console would let
 * one operator take another's account with a reason field for cover; a platform operator recovers
 * through the enrolment code, which is held outside the database.
 */
create or replace function public.authorize_member_password_reset(
  p_actor uuid, p_profile_id uuid, p_school_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.user_profiles%rowtype; member public.school_memberships%rowtype;
begin
  if not public.is_platform_admin(p_actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not public.platform_reauth_fresh(p_actor,15) then
    raise exception 'REAUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'VALIDATION_ERROR: reason required'; end if;

  select * into target from public.user_profiles where id=p_profile_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if exists(select 1 from public.platform_admins a
            where a.profile_id=p_profile_id and a.status='active' and a.revoked_at is null) then
    raise exception 'TARGET_IS_PLATFORM_ADMIN';
  end if;

  select * into member from public.school_memberships
    where profile_id=p_profile_id and (p_school_id is null or school_id=p_school_id)
    order by case role when 'admin' then 0 when 'teacher' then 1 else 2 end limit 1;
  if not found then raise exception 'NOT_FOUND: no membership'; end if;

  perform public.record_platform_event(p_actor,'MEMBER_PASSWORD_RESET',member.school_id,p_profile_id,
    p_reason,jsonb_build_object('role',member.role));
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,
    before_json,after_json,metadata_json)
    values(member.school_id,p_actor,'MEMBER_PASSWORD_RESET','user_profile',p_profile_id,
      '{}'::jsonb,'{}'::jsonb,jsonb_build_object('reason',trim(p_reason),'role',member.role));

  return jsonb_build_object('profileId',p_profile_id,'displayName',target.display_name,
    'schoolId',member.school_id,'role',member.role);
end $$;

revoke all on function public.authorize_member_password_reset(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_member_password_reset(uuid,uuid,uuid,text) to service_role;

comment on function public.authorize_member_password_reset(uuid,uuid,uuid,text) is
  'Service-role-only. Authorises and records a platform-operator password reset. Never returns a password.';

commit;
