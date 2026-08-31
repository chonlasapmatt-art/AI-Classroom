-- Teacher access codes: the one thing that turns a new account into a teacher.
--
-- Until now a person could open the public sign-up screen, choose "ครู", pick any school from the
-- directory and be granted an active, verified teacher membership in it. The school had no say. This
-- migration removes that: `register_member_identity` no longer accepts a teacher without a code that
-- the school's own administrator issued, and the old signature is dropped so nothing can call the
-- permissive version by accident.
--
-- What a code is, and what it is deliberately not:
--
--   * It belongs to exactly one school and carries exactly one role. Redeeming it makes a teacher of
--     that school and nothing else — never an administrator, never a member of a second school.
--   * It is shared on purpose. One code activates many teachers, each with their own account and
--     their own password. The code is an invitation to the school, not a login.
--
-- Storage follows the pattern the rest of this schema already uses: the table is granted to nobody,
-- and every path in and out of it is a security-definer function. Two columns hold the code, and the
-- split matters. `code_hash` is an HMAC the gateway computes with a server secret and is the only
-- thing the redemption path ever looks at, so validation never needs the code itself. `code_cipher`
-- is the code encrypted with a key that lives in the Edge Function environment, and exists solely so
-- an administrator can read their own code back weeks later — a database dump without that key
-- cannot show anybody a working code.

begin;

-- ---------------------------------------------------------------------------
-- The code
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_access_codes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  -- HMAC-SHA256 of the code, keyed with a secret the database does not hold.
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  -- The code itself, encrypted by the gateway. Useless without the key it was sealed with.
  code_cipher text not null,
  -- Safe to display in a list: enough to tell two codes apart, not enough to use one.
  code_hint text not null default '',
  label text not null default '',
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz,
  -- Null means "no limit". A school that wants a code for exactly twelve teachers sets twelve.
  max_uses integer check (max_uses is null or max_uses between 1 and 10000),
  use_count integer not null default 0,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles(id),
  revoked_reason text
);

-- One live code per school. Rotation revokes the old one in the same statement that writes the new,
-- so a school always has exactly one answer to "what is our code".
create unique index if not exists teacher_access_code_active_school
  on public.teacher_access_codes(school_id) where status = 'active';
create unique index if not exists teacher_access_code_active_hash
  on public.teacher_access_codes(code_hash) where status = 'active';

alter table public.teacher_access_codes enable row level security;
revoke all on public.teacher_access_codes from public, anon, authenticated;

comment on table public.teacher_access_codes is
  'School-issued teacher activation codes. No browser session can read this table; every path is a security-definer function.';

-- ---------------------------------------------------------------------------
-- Who used it
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_access_code_uses (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.teacher_access_codes(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  profile_id uuid references public.user_profiles(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  display_name text not null default '',
  used_at timestamptz not null default clock_timestamp()
);
create index if not exists teacher_access_code_uses_code_idx
  on public.teacher_access_code_uses(code_id, used_at desc);
create index if not exists teacher_access_code_uses_school_idx
  on public.teacher_access_code_uses(school_id, used_at desc);

alter table public.teacher_access_code_uses enable row level security;
revoke all on public.teacher_access_code_uses from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may touch a code
-- ---------------------------------------------------------------------------

/**
 * The school's administrator, and nobody else.
 *
 * `member_can_operate` is the wrong test here even though it is the one the rest of the gateway
 * uses: it admits verified teachers, and a teacher who could mint teacher codes could staff the
 * school without the administrator ever seeing it. Issuing, reading and revoking a code are
 * administrator acts.
 */
create or replace function public.member_is_school_admin(p_actor uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.profile_id=p_actor and m.school_id=p_school_id and m.role='admin'
      and m.status='active' and m.active_from<=now()
      and (m.active_until is null or m.active_until>now())
  );
$$;

-- ---------------------------------------------------------------------------
-- Issuing and rotating
-- ---------------------------------------------------------------------------

/**
 * Issues a school's teacher code, replacing whatever it had.
 *
 * Rotation and first issue are the same operation because they must be: leaving two live codes for
 * one school would mean revoking one and still handing out a working one. The previous code is
 * revoked inside this transaction, and every teacher it already activated keeps their account —
 * revoking a code closes the door, it does not evict the people who came through it.
 */
create or replace function public.issue_teacher_access_code(
  p_actor uuid,
  p_school_id uuid,
  p_code_hash text,
  p_code_cipher text,
  p_code_hint text,
  p_label text default '',
  p_expires_at timestamptz default null,
  p_max_uses integer default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  new_id uuid;
  replaced uuid;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.member_is_school_admin(p_actor, p_school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if p_code_hash !~ '^[a-f0-9]{64}$' or coalesce(trim(p_code_cipher),'') = '' then
    raise exception 'VALIDATION_ERROR';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'VALIDATION_ERROR: expiry in the past';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 10000) then
    raise exception 'VALIDATION_ERROR: use limit';
  end if;

  update public.teacher_access_codes
    set status='revoked', revoked_at=clock_timestamp(), revoked_by=p_actor,
        revoked_reason=coalesce(nullif(revoked_reason,''),'rotated')
    where school_id=p_school_id and status='active'
    returning id into replaced;

  insert into public.teacher_access_codes(
    school_id, code_hash, code_cipher, code_hint, label, expires_at, max_uses, created_by
  ) values (
    p_school_id, lower(p_code_hash), p_code_cipher, coalesce(p_code_hint,''), coalesce(trim(p_label),''),
    p_expires_at, p_max_uses, p_actor
  ) returning id into new_id;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, p_actor,
      case when replaced is null then 'TEACHER_CODE_CREATED' else 'TEACHER_CODE_ROTATED' end,
      'teacher_access_code', new_id,
      jsonb_build_object('hint', p_code_hint, 'expiresAt', p_expires_at, 'maxUses', p_max_uses,
        'replacedCodeId', replaced));

  return jsonb_build_object('codeId', new_id, 'replacedCodeId', replaced,
    'expiresAt', p_expires_at, 'maxUses', p_max_uses, 'hint', p_code_hint);
end $$;

/**
 * Returns the school's live code, sealed, for an administrator who wants to send it out again.
 *
 * The decryption happens in the gateway, not here, and the read is audited: an administrator looking
 * up their own code is ordinary, but it is still a disclosure and the school's log should say so.
 */
create or replace function public.reveal_teacher_access_code(p_actor uuid, p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare code public.teacher_access_codes%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.member_is_school_admin(p_actor, p_school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into code from public.teacher_access_codes
    where school_id=p_school_id and status='active' limit 1;
  if not found then return jsonb_build_object('exists', false); end if;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, metadata_json)
    values(p_school_id, p_actor, 'TEACHER_CODE_VIEWED', 'teacher_access_code', code.id,
      jsonb_build_object('hint', code.code_hint));

  return jsonb_build_object(
    'exists', true, 'codeId', code.id, 'cipher', code.code_cipher, 'hint', code.code_hint,
    'label', code.label, 'expiresAt', code.expires_at, 'maxUses', code.max_uses,
    'useCount', code.use_count, 'createdAt', code.created_at,
    'expired', code.expires_at is not null and code.expires_at <= now(),
    'exhausted', code.max_uses is not null and code.use_count >= code.max_uses
  );
end $$;

/** Closes a code. Teachers it already activated are untouched; nobody new can use it. */
create or replace function public.revoke_teacher_access_code(
  p_actor uuid, p_code_id uuid, p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare code public.teacher_access_codes%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into code from public.teacher_access_codes where id=p_code_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.member_is_school_admin(p_actor, code.school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if code.status = 'revoked' then
    return jsonb_build_object('codeId', code.id, 'status', 'revoked', 'alreadyRevoked', true);
  end if;

  update public.teacher_access_codes
    set status='revoked', revoked_at=clock_timestamp(), revoked_by=p_actor,
        revoked_reason=left(coalesce(trim(p_reason),''),400)
    where id=code.id;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, metadata_json)
    values(code.school_id, p_actor, 'TEACHER_CODE_REVOKED', 'teacher_access_code', code.id,
      jsonb_build_object('reason', left(coalesce(trim(p_reason),''),400), 'useCount', code.use_count));

  return jsonb_build_object('codeId', code.id, 'status', 'revoked', 'alreadyRevoked', false);
end $$;

/** Every code the school has ever issued, and who each one activated. */
create or replace function public.teacher_access_code_history(p_actor uuid, p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.member_is_school_admin(p_actor, p_school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  return jsonb_build_object(
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codeId', c.id, 'hint', c.code_hint, 'label', c.label, 'status', c.status,
        'expiresAt', c.expires_at, 'maxUses', c.max_uses, 'useCount', c.use_count,
        'createdAt', c.created_at, 'revokedAt', c.revoked_at, 'revokedReason', c.revoked_reason
      ) order by c.created_at desc)
      from public.teacher_access_codes c where c.school_id=p_school_id
    ), '[]'::jsonb),
    'uses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codeId', u.code_id, 'displayName', u.display_name, 'teacherId', u.teacher_id, 'usedAt', u.used_at
      ) order by u.used_at desc)
      from public.teacher_access_code_uses u where u.school_id=p_school_id
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------

/**
 * Checks a code against a school and claims one use of it.
 *
 * The claim happens here, under a row lock, rather than after the account is created: two teachers
 * racing for the last use of a limited code must not both get it. A code that is revoked, expired or
 * used up fails the same way a wrong code does, and the caller is told nothing beyond "no".
 */
create or replace function public.claim_teacher_access_code(p_school_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare code public.teacher_access_codes%rowtype;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('valid', false); end if;
  select * into code from public.teacher_access_codes
    where school_id=p_school_id and code_hash=lower(p_code_hash) for update;
  if not found then return jsonb_build_object('valid', false); end if;
  if code.status <> 'active' then return jsonb_build_object('valid', false, 'reason', 'revoked'); end if;
  if code.expires_at is not null and code.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if code.max_uses is not null and code.use_count >= code.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'exhausted');
  end if;

  update public.teacher_access_codes
    set use_count = use_count + 1 where id = code.id;

  return jsonb_build_object('valid', true, 'codeId', code.id, 'schoolId', code.school_id);
end $$;

/** Records which account a claimed use belongs to, once the account exists. */
create or replace function public.record_teacher_access_code_use(
  p_code_id uuid, p_profile_id uuid, p_teacher_id uuid, p_display_name text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare code public.teacher_access_codes%rowtype;
begin
  select * into code from public.teacher_access_codes where id=p_code_id;
  if not found then return; end if;
  insert into public.teacher_access_code_uses(code_id, school_id, profile_id, teacher_id, display_name)
    values(p_code_id, code.school_id, p_profile_id, p_teacher_id, left(coalesce(p_display_name,''),200));
  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(code.school_id, p_profile_id, 'TEACHER_CODE_REDEEMED', 'teacher_access_code', p_code_id,
      jsonb_build_object('teacherId', p_teacher_id, 'displayName', left(coalesce(p_display_name,''),200),
        'useCount', code.use_count));
end $$;

/** Returns a claimed use when the registration that claimed it failed afterwards. */
create or replace function public.release_teacher_access_code(p_code_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.teacher_access_codes
    set use_count = greatest(use_count - 1, 0) where id = p_code_id;
end $$;

-- ---------------------------------------------------------------------------
-- Registration now requires a code for teachers
-- ---------------------------------------------------------------------------
-- The permissive signature is dropped rather than left in place. Leaving it would mean the rule
-- below could be skipped by calling the old function, which is exactly the hole this closes.

drop function if exists public.register_member_identity(uuid,text,text,text,text,uuid,text);

create or replace function public.register_member_identity(
  p_actor uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_auth_email text,
  p_school_id uuid default null,
  p_source text default 'self_registration',
  p_access_code_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  full_name text;
  target_school public.schools%rowtype;
  claimed public.teacher_access_codes%rowtype;
  teacher_id uuid;
  generated_code text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_role not in ('teacher','parent','admin') then raise exception 'VALIDATION_ERROR'; end if;
  if char_length(clean_first)<1 or char_length(clean_last)<1 then raise exception 'VALIDATION_ERROR'; end if;
  full_name := trim(clean_first||' '||clean_last);
  if char_length(full_name)<2 or char_length(full_name)>200 then raise exception 'VALIDATION_ERROR'; end if;
  if coalesce(trim(p_auth_email),'')='' then raise exception 'VALIDATION_ERROR'; end if;

  if p_role='teacher' then
    select * into target_school from public.schools
    where id=p_school_id and status='active' and deleted_at is null;
    if not found then raise exception 'SCHOOL_NOT_AVAILABLE' using errcode='22000'; end if;

    -- The school's own code is the authorisation. A teacher registration without one is refused
    -- here, whatever the caller believes it has already checked, and a code belonging to a different
    -- school is refused too: a code carries the school it was issued for and cannot be moved.
    if p_access_code_id is null then
      raise exception 'TEACHER_CODE_REQUIRED' using errcode='42501';
    end if;
    select * into claimed from public.teacher_access_codes
      where id=p_access_code_id and school_id=target_school.id;
    if not found then raise exception 'TEACHER_CODE_REQUIRED' using errcode='42501'; end if;
  end if;

  insert into public.user_profiles(id,display_name,requested_role,account_state)
    values(p_actor,full_name,p_role,'active')
  on conflict(id) do update set display_name=excluded.display_name,requested_role=excluded.requested_role,
    account_state='active',onboarding_completed_at=coalesce(public.user_profiles.onboarding_completed_at,clock_timestamp()),
    updated_at=clock_timestamp();

  insert into public.member_login_identities(
    profile_id,role,display_name,first_name,last_name,auth_email,school_id,registration_source
  ) values(p_actor,p_role,full_name,clean_first,clean_last,lower(trim(p_auth_email)),p_school_id,p_source)
  on conflict(profile_id) do update set display_name=excluded.display_name,first_name=excluded.first_name,
    last_name=excluded.last_name,school_id=excluded.school_id,status='active',updated_at=clock_timestamp();

  if p_role='teacher' then
    select id into teacher_id from public.teachers
      where school_id=target_school.id and profile_id=p_actor and deleted_at is null limit 1;
    if teacher_id is null then
      generated_code := 'T-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
      insert into public.teachers(school_id,profile_id,teacher_code,display_name,first_name,last_name,
        email,subject,verification_status,status,creation_source)
      values(target_school.id,p_actor,generated_code,full_name,clean_first,clean_last,
        '','','verified_teacher','active','self_registration')
      returning id into teacher_id;
    else
      update public.teachers set display_name=full_name,first_name=clean_first,last_name=clean_last,
        verification_status='verified_teacher',status='active',updated_at=clock_timestamp()
      where id=teacher_id;
    end if;
    insert into public.school_memberships(school_id,profile_id,role,status)
      values(target_school.id,p_actor,'teacher','active')
    on conflict(school_id,profile_id,role) do update
      set status='active',active_until=null,updated_at=clock_timestamp();
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
      values(target_school.id,p_actor,'MEMBER_TEACHER_REGISTERED','teacher',teacher_id,
        jsonb_build_object('displayName',full_name,'source',p_source,'verificationStatus','verified_teacher',
          'accessCodeId',p_access_code_id));
    perform public.record_teacher_access_code_use(p_access_code_id, p_actor, teacher_id, full_name);
  end if;

  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_actor,p_role,'MEMBER_REGISTERED',p_school_id,jsonb_build_object('source',p_source));

  return jsonb_build_object('profileId',p_actor,'role',p_role,'displayName',full_name,
    'schoolId',p_school_id,'schoolName',target_school.name,'teacherId',teacher_id);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Nothing here is callable from a browser. Codes are issued, read and redeemed through the trusted
-- gateway, which is where the rate limiting and the encryption key live.

revoke all on function public.issue_teacher_access_code(uuid,uuid,text,text,text,text,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.reveal_teacher_access_code(uuid,uuid) from public,anon,authenticated;
revoke all on function public.revoke_teacher_access_code(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.teacher_access_code_history(uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_teacher_access_code(uuid,text) from public,anon,authenticated;
revoke all on function public.record_teacher_access_code_use(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.release_teacher_access_code(uuid) from public,anon,authenticated;
revoke all on function public.register_member_identity(uuid,text,text,text,text,uuid,text,uuid) from public,anon,authenticated;

grant execute on function public.issue_teacher_access_code(uuid,uuid,text,text,text,text,timestamptz,integer) to service_role;
grant execute on function public.reveal_teacher_access_code(uuid,uuid) to service_role;
grant execute on function public.revoke_teacher_access_code(uuid,uuid,text) to service_role;
grant execute on function public.teacher_access_code_history(uuid,uuid) to service_role;
grant execute on function public.claim_teacher_access_code(uuid,text) to service_role;
grant execute on function public.record_teacher_access_code_use(uuid,uuid,uuid,text) to service_role;
grant execute on function public.release_teacher_access_code(uuid) to service_role;
grant execute on function public.register_member_identity(uuid,text,text,text,text,uuid,text,uuid) to service_role;

comment on function public.claim_teacher_access_code(uuid,text) is
  'Validates a teacher code against one school and claims a use of it under a row lock.';
comment on function public.register_member_identity(uuid,text,text,text,text,uuid,text,uuid) is
  'Creates the records behind a member account. A teacher requires a claimed school access code.';

commit;
