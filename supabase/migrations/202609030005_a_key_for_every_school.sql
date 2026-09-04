-- One account, many schools, and a separate product key for each of them.
--
-- Until now an account could activate exactly one school. Both halves of the path refused a second:
-- `issue_product_activation_key` would not draw a key for an account that held any membership, and
-- `bootstrap_school_owner` refused outright. That was the right rule when the product was one school
-- per customer, and the wrong one for an administrator who runs more than one campus and wants each
-- of them activated under its own key.
--
-- What replaces it is narrower than "anybody may create a school", which is what simply deleting the
-- check would have meant. A student, a teacher and a parent all hold memberships, and none of them
-- should be able to draw a key and become the administrator of a school of their own. So the rule is
-- now: an account with no membership at all is a first-run customer and may activate, and an account
-- that already administers a school may activate another. Everybody else is refused with
-- `ADMIN_ROLE_REQUIRED` — a different refusal from `ALREADY_HAS_MEMBERSHIP`, because the two mean
-- opposite things and a member told "you already have a school" would have no idea what to do next.
--
-- One key per school falls out of the existing invariant rather than needing a new one. The unique
-- index still allows one live key per account: the key is spent the moment its school exists, and
-- the next draw — for the next school — is a new twenty characters. Two schools never share a key,
-- and the account never holds two unspent keys to confuse.

begin;

-- ---------------------------------------------------------------------------
-- Who may activate a school
-- ---------------------------------------------------------------------------

/**
 * Whether this account may activate a school: a first-run account, or an existing administrator.
 *
 * One function, called by the draw and by the bootstrap, because two copies of this rule would
 * agree right up until one of them was changed.
 */
create or replace function public.may_activate_school(p_actor uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from public.school_memberships where profile_id=p_actor)
      or exists(select 1 from public.school_memberships
                where profile_id=p_actor and role='admin' and status='active');
$$;

revoke all on function public.may_activate_school(uuid) from public,anon,authenticated;
grant execute on function public.may_activate_school(uuid) to service_role;

comment on function public.may_activate_school(uuid) is
  'Service-role-only. True for a first-run account and for an existing school administrator.';

-- ---------------------------------------------------------------------------
-- Drawing a key for the next school
-- ---------------------------------------------------------------------------

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
  -- A member who is not an administrator anywhere has nothing to activate, and letting them draw a
  -- key would hand every student in the school a way to become an administrator of their own.
  if not public.may_activate_school(p_actor) then
    raise exception 'ADMIN_ROLE_REQUIRED';
  end if;

  -- The account's unspent key, if it has one. A key that was already spent on a school stays spent;
  -- the next school is activated with a key of its own.
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

-- ---------------------------------------------------------------------------
-- Creating the school the key was drawn for
-- ---------------------------------------------------------------------------

/**
 * The school itself. Unchanged from `202608300009` except for who is allowed to ask.
 *
 * A school code still has to be unique across the whole server, which is what keeps two campuses of
 * the same customer apart, and the term, the settings and the audit entry are still written in the
 * same statement as the school.
 */
create or replace function public.bootstrap_school_owner(
  p_actor uuid,p_school_name text,p_school_code text,p_academic_year text,p_term text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare school uuid:=gen_random_uuid(); term_id uuid:=gen_random_uuid(); profile_name text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.may_activate_school(p_actor) then raise exception 'ADMIN_ROLE_REQUIRED'; end if;
  if char_length(trim(p_school_name))<2 or upper(p_school_code)!~'^[A-Z0-9-]{3,20}$' or char_length(trim(p_academic_year))<2 or char_length(trim(p_term))<1 then raise exception 'VALIDATION_ERROR'; end if;
  select coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1),'เจ้าของระบบ') into profile_name from auth.users where id=p_actor;
  insert into public.user_profiles(id,display_name,account_state) values(p_actor,profile_name,'active')
    on conflict(id) do update set account_state='active',updated_at=clock_timestamp();
  insert into public.schools(id,name,code) values(school,trim(p_school_name),upper(p_school_code));
  insert into public.school_memberships(school_id,profile_id,role,status) values(school,p_actor,'admin','active');
  insert into public.academic_terms(id,school_id,academic_year,term,starts_on,ends_on,status)
    values(term_id,school,trim(p_academic_year),trim(p_term),current_date,current_date+interval '180 days','active');
  insert into public.settings(school_id,scope_type,key,value_json) values
    (school,'school','score_policy','{"weights":{"assignment":60,"activity":30,"test":10},"passingScore":60,"latePenaltyPercent":10,"missingItem":"zero"}'::jsonb),
    (school,'school','privacy_policy','{"version":"1.0","status":"draft"}'::jsonb),
    (school,'school','consent_policy','{"version":"1.0","status":"draft"}'::jsonb),
    (school,'school','teacher_verification_policy','{"allowVerifiedTeacherApproval":false}'::jsonb);
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(school,p_actor,'owner_school_bootstrap','school',school,jsonb_build_object('name',trim(p_school_name),'code',upper(p_school_code)));
  return school;
end $$;

revoke all on function public.bootstrap_school_owner(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_school_owner(uuid,text,text,text,text) to service_role;

/**
 * The wrapper that also carries the administrator's display name.
 *
 * The identity row follows the newest school so that name-and-password sign-in resolves against the
 * school the administrator just created. Their membership of the earlier school is untouched: the
 * account holds one row per school and the shell switches between them.
 */
create or replace function public.bootstrap_school_owner(
  p_actor uuid, p_school_name text, p_school_code text, p_academic_year text, p_term text,
  p_display_name text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  school uuid;
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g');
  first_part text;
  last_part text;
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 200 then
    raise exception 'VALIDATION_ERROR: display name';
  end if;

  school := public.bootstrap_school_owner(p_actor, p_school_name, p_school_code, p_academic_year, p_term);
  first_part := split_part(clean_name, ' ', 1);
  last_part := nullif(trim(substr(clean_name, char_length(first_part) + 1)), '');
  last_part := coalesce(last_part, first_part);

  update public.user_profiles
    set display_name=clean_name, requested_role='admin', account_state='active',
        onboarding_completed_at=coalesce(onboarding_completed_at, clock_timestamp()), updated_at=clock_timestamp()
    where id=p_actor;

  update public.member_login_identities
    set display_name=clean_name, first_name=first_part, last_name=last_part,
        school_id=school, updated_at=clock_timestamp()
    where profile_id=p_actor;

  if not found then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;
  return school;
end $$;

revoke all on function public.bootstrap_school_owner(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_school_owner(uuid,text,text,text,text,text) to service_role;

commit;
