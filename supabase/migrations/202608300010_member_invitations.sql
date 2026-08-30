begin;

create table public.school_member_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  email text not null,
  intended_role public.membership_role not null check (intended_role <> 'admin'),
  target_entity_id uuid not null,
  code_hash text not null,
  expires_at timestamptz not null,
  max_attempts integer not null default 5 check(max_attempts between 1 and 10),
  attempt_count integer not null default 0,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create unique index school_member_invitation_code on public.school_member_invitations(code_hash) where used_at is null and revoked_at is null;
create index school_member_invitation_email on public.school_member_invitations(lower(email),expires_at desc);
alter table public.school_member_invitations enable row level security;
revoke all on public.school_member_invitations from public,anon,authenticated;

create or replace function public.create_member_invitation(
  p_school_id uuid,p_role public.membership_role,p_target_entity_id uuid,p_email text,p_code_hash text,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); invitation_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_role='admin' or p_email!~*'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_expires_at<=now() then raise exception 'VALIDATION_ERROR'; end if;
  if p_role='teacher' and not exists(select 1 from public.teachers where id=p_target_entity_id and school_id=p_school_id and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
  if p_role='student' and not exists(select 1 from public.students where id=p_target_entity_id and school_id=p_school_id and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
  if p_role='parent' and not exists(select 1 from public.parents where id=p_target_entity_id and school_id=p_school_id) then raise exception 'NOT_FOUND'; end if;
  update public.school_member_invitations set revoked_at=clock_timestamp()
    where school_id=p_school_id and intended_role=p_role and target_entity_id=p_target_entity_id and used_at is null and revoked_at is null;
  insert into public.school_member_invitations(school_id,email,intended_role,target_entity_id,code_hash,expires_at,created_by)
    values(p_school_id,lower(trim(p_email)),p_role,p_target_entity_id,p_code_hash,p_expires_at,actor) returning id into invitation_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,'member_invitation_created','school_member_invitation',invitation_id,
      jsonb_build_object('role',p_role,'targetEntityId',p_target_entity_id,'expiresAt',p_expires_at));
  return invitation_id;
end $$;

create or replace function public.record_member_invitation_failure(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation public.school_member_invitations%rowtype;
begin
  update public.school_member_invitations set attempt_count=attempt_count+1 where id=p_invitation_id returning * into invitation;
  if found then
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json)
      values(invitation.school_id,null,'member_invitation_failed','school_member_invitation',invitation.id,
        jsonb_build_object('attemptCount',invitation.attempt_count));
  end if;
end $$;

create or replace function public.redeem_member_invitation(p_actor uuid,p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation public.school_member_invitations%rowtype; actor_email text; next_state text;
begin
  select lower(email) into actor_email from auth.users where id=p_actor;
  if actor_email is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into invitation from public.school_member_invitations where id=p_invitation_id for update;
  if not found or invitation.used_at is not null or invitation.revoked_at is not null or invitation.expires_at<=now() or invitation.attempt_count>=invitation.max_attempts then raise exception 'INVITATION_INVALID'; end if;
  if lower(invitation.email)<>actor_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;

  if invitation.intended_role='teacher' then
    update public.teachers set profile_id=p_actor,verification_status='verification_pending',updated_at=clock_timestamp()
      where id=invitation.target_entity_id and school_id=invitation.school_id and profile_id is null;
    if not found then raise exception 'TARGET_ALREADY_LINKED'; end if;
    next_state:='verification_pending';
    insert into public.school_memberships(school_id,profile_id,role,status) values(invitation.school_id,p_actor,'teacher','inactive')
      on conflict(school_id,profile_id,role) do update set status='inactive',updated_at=clock_timestamp();
  elsif invitation.intended_role='student' then
    update public.students set profile_id=p_actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1
      where id=invitation.target_entity_id and school_id=invitation.school_id and profile_id is null;
    if not found then raise exception 'TARGET_ALREADY_LINKED'; end if;
    next_state:='active';
    insert into public.school_memberships(school_id,profile_id,role,status) values(invitation.school_id,p_actor,'student','active')
      on conflict(school_id,profile_id,role) do update set status='active',updated_at=clock_timestamp();
  elsif invitation.intended_role='parent' then
    update public.parents set profile_id=p_actor,updated_at=clock_timestamp()
      where id=invitation.target_entity_id and school_id=invitation.school_id and profile_id is null;
    if not found then raise exception 'TARGET_ALREADY_LINKED'; end if;
    next_state:='active';
    insert into public.school_memberships(school_id,profile_id,role,status) values(invitation.school_id,p_actor,'parent','active')
      on conflict(school_id,profile_id,role) do update set status='active',updated_at=clock_timestamp();
  else
    raise exception 'ROLE_NOT_ALLOWED' using errcode='42501';
  end if;

  update public.user_profiles set requested_role=invitation.intended_role::text,account_state=next_state,updated_at=clock_timestamp() where id=p_actor;
  update public.school_member_invitations set used_at=clock_timestamp() where id=invitation.id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(invitation.school_id,p_actor,'member_invitation_redeemed','school_member_invitation',invitation.id,
      jsonb_build_object('role',invitation.intended_role,'targetEntityId',invitation.target_entity_id,'accountState',next_state));
  return jsonb_build_object('schoolId',invitation.school_id,'role',invitation.intended_role,'accountState',next_state);
end $$;

revoke all on function public.create_member_invitation(uuid,public.membership_role,uuid,text,text,timestamptz) from public,anon;
grant execute on function public.create_member_invitation(uuid,public.membership_role,uuid,text,text,timestamptz) to authenticated;
revoke all on function public.record_member_invitation_failure(uuid) from public,anon,authenticated;
revoke all on function public.redeem_member_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_member_invitation_failure(uuid) to service_role;
grant execute on function public.redeem_member_invitation(uuid,uuid) to service_role;

comment on table public.school_member_invitations is 'Server-owned account-to-record invitations. Stores only keyed hashes, never plaintext codes.';

commit;
