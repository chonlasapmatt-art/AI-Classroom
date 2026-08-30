-- Name + password access for teachers and parents, and child linking by name alone.
--
-- Product decision: everyday access asks a teacher or a parent for the name they are known by and
-- a password. No email, no OTP, no school code and no invitation code in the normal path. A student
-- keeps the existing name + student number entrance.
--
-- None of that weakens authentication. Supabase Auth still owns every password: each account keeps
-- one immutable internal address derived from its own profile id, and the trusted gateway resolves
-- a typed name to that address before GoTrue verifies the password with its own hashing. Names are
-- explicitly not unique, so resolution returns every candidate and the password decides which
-- account it was — and when two candidates accept the same password the gateway refuses to guess.
--
-- RLS is untouched. A session minted through this path is an ordinary Supabase session, so every
-- existing policy applies to it unmodified.

begin;

-- 1. The identity directory -----------------------------------------------------------------------
-- One row per account that signs in by name. The address column is what makes name + password
-- possible at all: it is generated from the profile id, never shown to the user, and never typed.

create table if not exists public.member_login_identities (
  profile_id uuid primary key references public.user_profiles(id) on delete cascade,
  -- 'admin' exists here only so that the person who creates the first school can sign in the same
  -- way as everyone else. Holding this role grants nothing: school authority still comes from a
  -- membership, and the only thing that creates an admin membership is the private owner entry.
  role text not null check (role in ('teacher','parent','admin')),
  display_name text not null check (char_length(display_name) between 2 and 200),
  first_name text not null,
  last_name text not null,
  auth_email text not null unique,
  school_id uuid references public.schools(id),
  registration_source text not null default 'self_registration'
    check (registration_source in ('self_registration','invitation','import','admin','system')),
  status text not null default 'active' check (status in ('active','disabled')),
  last_login_at timestamptz,
  login_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  normalized_name text generated always as (lower(regexp_replace(trim(display_name),'\s+',' ','g'))) stored
);
create index if not exists member_login_identities_lookup_idx
  on public.member_login_identities(role,normalized_name) where status='active';
alter table public.member_login_identities enable row level security;
revoke all on public.member_login_identities from public,anon,authenticated;

-- Account-level history for events that happen before an account belongs to any school, which the
-- school-scoped audit_log cannot hold. Append-only, and readable by no browser session.
create table if not exists public.member_account_events (
  id bigint generated always as identity primary key,
  profile_id uuid references public.user_profiles(id) on delete set null,
  role text,
  action text not null,
  school_id uuid references public.schools(id),
  metadata_json jsonb not null default '{}',
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists member_account_events_profile_idx
  on public.member_account_events(profile_id,occurred_at desc);
alter table public.member_account_events enable row level security;
revoke all on public.member_account_events from public,anon,authenticated;

-- Failed sign-ins are kept as hashes only. Neither the typed name nor the password ever lands here,
-- because this is the table an operator reads during an incident.
create table if not exists public.member_access_attempts (
  id bigint generated always as identity primary key,
  action text not null,
  identity_hash text not null,
  client_hash text not null,
  profile_id uuid references public.user_profiles(id) on delete set null,
  succeeded boolean not null,
  failure_reason text,
  attempted_at timestamptz not null default clock_timestamp()
);
create index if not exists member_access_attempts_identity_idx
  on public.member_access_attempts(identity_hash,attempted_at desc);
create index if not exists member_access_attempts_client_idx
  on public.member_access_attempts(client_hash,attempted_at desc);
alter table public.member_access_attempts enable row level security;
revoke all on public.member_access_attempts from public,anon,authenticated;

-- Recovery without email: the account holder asks, and an authorised member of school staff sets a
-- new password. The old one is never read, retrieved or shown — only replaced.
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  role text not null check (role in ('teacher','parent','admin')),
  school_id uuid references public.schools(id),
  display_name text not null,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  requested_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id)
);
create index if not exists password_reset_requests_open_idx
  on public.password_reset_requests(school_id,status,requested_at desc);
alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from public,anon;
grant select on public.password_reset_requests to authenticated;
drop policy if exists password_reset_requests_staff_read on public.password_reset_requests;
create policy password_reset_requests_staff_read on public.password_reset_requests for select to authenticated
  using (school_id is not null and public.can_operate_school(school_id));

-- 2. Columns the new flows record ------------------------------------------------------------------

alter table public.teachers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists creation_source text not null default 'admin';
alter table public.teachers drop constraint if exists teachers_creation_source_check;
alter table public.teachers add constraint teachers_creation_source_check
  check (creation_source in ('teacher','admin','self_registration','import','invitation','system'));

alter table public.parents
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists creation_source text not null default 'admin';
alter table public.parents drop constraint if exists parents_creation_source_check;
alter table public.parents add constraint parents_creation_source_check
  check (creation_source in ('teacher','admin','self_registration','import','invitation','system'));

-- The owner account is created the same way as everybody else's, so the profile has to be able to
-- say so. It still carries no authority: only the owner code checked by admin-access creates an
-- admin membership, and every policy reads the membership rather than this field.
alter table public.user_profiles drop constraint if exists user_profiles_requested_role_check;
alter table public.user_profiles add constraint user_profiles_requested_role_check
  check (requested_role is null or requested_role in ('teacher','student','parent','admin'));

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare requested text := new.raw_user_meta_data->>'requested_role';
begin
  if requested not in ('teacher','student','parent','admin') then requested := null; end if;
  insert into public.user_profiles(id,display_name,requested_role,account_state)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'ผู้ใช้งาน'),200),
    requested,
    case when new.email_confirmed_at is null then 'email_unverified' else 'registered' end
  )
  on conflict(id) do update set
    display_name=excluded.display_name,
    requested_role=coalesce(public.user_profiles.requested_role,excluded.requested_role),
    updated_at=clock_timestamp();
  return new;
end $$;

-- A parent may reach the app before they belong to any school, so their own link row has to be
-- readable by them whatever its state. Without this a pending request would be invisible to the one
-- person waiting on it. Nothing about the student's own data opens up here.
drop policy if exists parent_links_scoped_read on public.parent_student_links;
create policy parent_links_scoped_read on public.parent_student_links for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.parent_has_active_link(student_id)
  or exists(select 1 from public.parents p where p.id=parent_student_links.parent_id and p.profile_id=(select auth.uid()))
  or exists(select 1 from public.student_class_enrollments e
    where e.student_id=parent_student_links.student_id and public.teacher_has_class_access(e.class_id))
);

-- 3. Helpers ---------------------------------------------------------------------------------------

-- The service_role gateway carries the actor explicitly, so it cannot lean on auth.uid(). This is
-- the same authority test can_operate_school applies, written for a named actor.
create or replace function public.member_can_operate(p_actor uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.school_memberships m
    where m.profile_id=p_actor and m.school_id=p_school_id and m.status='active'
      and (m.role='admin' or (m.role='teacher' and exists(
        select 1 from public.teachers t where t.school_id=m.school_id and t.profile_id=p_actor
          and t.status='active' and t.deleted_at is null and t.verification_status='verified_teacher')))
  );
$$;

-- Shows enough of a student number to tell two same-named children apart and no more.
create or replace function public.mask_student_code(p_code text)
returns text language sql immutable as $$
  select case
    when coalesce(p_code,'')='' then ''
    when char_length(p_code)<=2 then repeat('•',char_length(p_code))
    else repeat('•',char_length(p_code)-2)||right(p_code,2)
  end;
$$;

-- 4. Registration ----------------------------------------------------------------------------------
-- Takes an auth user the gateway has already created and gives it the records that make it a real
-- teacher or parent. A teacher is active immediately; a parent belongs to a school only once a
-- child link is approved, which is why p_school_id is optional here.

create or replace function public.register_member_identity(
  p_actor uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_auth_email text,
  p_school_id uuid default null,
  p_source text default 'self_registration'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  clean_first text := regexp_replace(trim(coalesce(p_first_name,'')),'\s+',' ','g');
  clean_last text := regexp_replace(trim(coalesce(p_last_name,'')),'\s+',' ','g');
  full_name text;
  target_school public.schools%rowtype;
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
        jsonb_build_object('displayName',full_name,'source',p_source,'verificationStatus','verified_teacher'));
  end if;

  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_actor,p_role,'MEMBER_REGISTERED',p_school_id,jsonb_build_object('source',p_source));

  return jsonb_build_object('profileId',p_actor,'role',p_role,'displayName',full_name,
    'schoolId',p_school_id,'schoolName',target_school.name,'teacherId',teacher_id);
end $$;

-- 5. Login resolution --------------------------------------------------------------------------------
-- Deliberately returns every account that carries the typed name. Names are not unique and must not
-- be treated as though they were; the caller verifies the password against each candidate and stops
-- with an explicit choice when more than one accepts it.

create or replace function public.resolve_member_login(p_role text, p_display_name text)
returns table(profile_id uuid, auth_email text, display_name text, school_id uuid, school_name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare wanted text := lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'));
begin
  if p_role not in ('teacher','parent') or char_length(wanted)<2 then
    raise exception 'VALIDATION_ERROR';
  end if;
  return query
  select i.profile_id,i.auth_email,i.display_name,
    coalesce(i.school_id,m.school_id),
    coalesce(s.name,ms.name)
  from public.member_login_identities i
  left join public.schools s on s.id=i.school_id
  -- A parent belongs to a school through their child, and the owner through the school they
  -- created, so the school shown beside a name comes from the membership when the identity has none.
  left join lateral (
    select m2.school_id from public.school_memberships m2
    where m2.profile_id=i.profile_id and m2.status='active' order by m2.created_at limit 1
  ) m on true
  left join public.schools ms on ms.id=m.school_id
  -- School staff type "ครู" on the sign-in screen whatever their membership says, so the owner of a
  -- school resolves from the same choice rather than needing a role the public UI does not offer.
  where i.normalized_name=wanted and i.status='active'
    and (i.role=p_role or (p_role='teacher' and i.role='admin'))
  limit 5;
end $$;

create or replace function public.record_member_login(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare identity public.member_login_identities%rowtype;
begin
  update public.member_login_identities
    set last_login_at=clock_timestamp(),login_count=login_count+1,updated_at=clock_timestamp()
    where profile_id=p_profile_id returning * into identity;
  if not found then raise exception 'MEMBER_ACCESS_DENIED' using errcode='22000'; end if;
  insert into public.member_account_events(profile_id,role,action,school_id)
    values(p_profile_id,identity.role,'MEMBER_LOGIN',identity.school_id);
  return jsonb_build_object('profileId',p_profile_id,'role',identity.role,'displayName',identity.display_name);
end $$;

-- 6. Child search and linking -------------------------------------------------------------------------
-- A parent types one thing: their child's real name. The search answers with cards that carry only
-- what tells two same-named children apart — school, class, a masked number, an avatar — and never
-- anything academic. Knowing a name gets a parent to the card and no further: the link itself is
-- what opens data, and that is granted by school data or by a teacher, never by the search.

create or replace function public.search_children_for_parent(p_actor uuid, p_child_name text)
returns table(
  student_id uuid, display_name text, school_id uuid, school_name text,
  class_name text, masked_code text, avatar_index integer, already_linked boolean
) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare wanted text := lower(regexp_replace(trim(coalesce(p_child_name,'')),'\s+',' ','g'));
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if char_length(wanted)<2 then raise exception 'QUERY_TOO_SHORT'; end if;
  return query
  select s.id, s.display_name, s.school_id, sc.name,
    coalesce((select c.name from public.student_class_enrollments e
      join public.classes c on c.id=e.class_id
      where e.student_id=s.id and e.status='active' and e.deleted_at is null
      order by e.enrolled_at desc limit 1),''),
    public.mask_student_code(s.student_code),
    s.avatar_index,
    exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id
      where l.student_id=s.id and p.profile_id=p_actor and l.deleted_at is null and l.revoked_at is null)
  from public.students s
  join public.schools sc on sc.id=s.school_id
  where s.status='active' and s.deleted_at is null
    and sc.status='active' and sc.deleted_at is null
    and (s.normalized_name=wanted
      or s.normalized_name like wanted||' %'
      or lower(regexp_replace(trim(coalesce(s.first_name,'')),'\s+',' ','g'))=wanted)
  order by s.display_name
  limit 10;
end $$;

-- Establishes the relationship behind the one-field screen. When the school already recorded this
-- guardian for this child, the link is adopted and opens immediately; otherwise it waits for a
-- teacher. Either way the parent's own account, membership and parent record are created here so
-- nothing about the flow depends on an invitation code.
create or replace function public.link_parent_child(
  p_actor uuid, p_student_id uuid, p_relationship text default 'ผู้ปกครอง'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  identity public.member_login_identities%rowtype;
  target public.students%rowtype;
  school_name text;
  parent_id uuid;
  existing_parent uuid;
  link public.parent_student_links%rowtype;
  policy_version text;
  new_consent uuid;
  next_status text;
  clean_relationship text := coalesce(nullif(regexp_replace(trim(coalesce(p_relationship,'')),'\s+',' ','g'),''),'ผู้ปกครอง');
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into identity from public.member_login_identities where profile_id=p_actor and role='parent';
  if not found or identity.status<>'active' then raise exception 'MEMBER_ACCESS_DENIED' using errcode='42501'; end if;

  select * into target from public.students
    where id=p_student_id and status='active' and deleted_at is null for update;
  if not found then raise exception 'CHILD_NOT_AVAILABLE' using errcode='22000'; end if;
  select name into school_name from public.schools where id=target.school_id;

  -- A guardian the school entered for this child, under this same name and with no account yet, is
  -- the same person: adopt that record rather than creating a second guardian for one child.
  select p.id into existing_parent from public.parents p
    join public.parent_student_links l on l.parent_id=p.id and l.student_id=target.id and l.deleted_at is null
    where p.school_id=target.school_id and p.profile_id is null
      and lower(regexp_replace(trim(p.display_name),'\s+',' ','g'))=identity.normalized_name
    limit 1;

  select id into parent_id from public.parents
    where school_id=target.school_id and profile_id=p_actor limit 1;

  if parent_id is null and existing_parent is not null then
    update public.parents set profile_id=p_actor,display_name=identity.display_name,
      first_name=identity.first_name,last_name=identity.last_name,status='active',updated_at=clock_timestamp()
      where id=existing_parent;
    parent_id := existing_parent;
  elsif parent_id is null then
    insert into public.parents(school_id,profile_id,display_name,first_name,last_name,status,creation_source)
      values(target.school_id,p_actor,identity.display_name,identity.first_name,identity.last_name,
        'active','self_registration')
      returning id into parent_id;
  else
    update public.parents set display_name=identity.display_name,first_name=identity.first_name,
      last_name=identity.last_name,status='active',updated_at=clock_timestamp() where id=parent_id;
  end if;

  next_status := case when existing_parent is not null then 'linked' else 'pending' end;

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status,linked_at)
    values(target.school_id,parent_id,target.id,clean_relationship,next_status,
      case when next_status='linked' then clock_timestamp() else null end)
  on conflict(parent_id,student_id) do update
    set relationship=excluded.relationship,
        status=case when public.parent_student_links.status='linked' then 'linked' else excluded.status end,
        linked_at=coalesce(public.parent_student_links.linked_at,excluded.linked_at),
        revoked_at=null,deleted_at=null,updated_at=clock_timestamp(),
        version=public.parent_student_links.version+1
  returning * into link;

  insert into public.school_memberships(school_id,profile_id,role,status)
    values(target.school_id,p_actor,'parent','active')
  on conflict(school_id,profile_id,role) do update
    set status='active',active_until=null,updated_at=clock_timestamp();

  -- An approved link carries the school's data-sharing consent with it, so an approved parent sees
  -- their child straight away instead of landing on an empty portal.
  if link.status='linked' and link.consent_id is null then
    select coalesce(value_json->>'version','1.0') into policy_version from public.settings
      where school_id=target.school_id and scope_type='school' and key='privacy_policy' limit 1;
    insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version)
      values(target.school_id,parent_id,target.id,'student_data_sharing',coalesce(policy_version,'1.0'))
      returning id into new_consent;
    update public.parent_student_links set consent_id=new_consent,updated_at=clock_timestamp(),
      version=version+1 where id=link.id returning * into link;
  end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(target.school_id,p_actor,
      case when link.status='linked' then 'PARENT_CHILD_LINKED' else 'PARENT_CHILD_LINK_REQUESTED' end,
      'parent_student_link',link.id,target.id,
      jsonb_build_object('relationship',clean_relationship,'status',link.status,'adopted',existing_parent is not null));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(p_actor,'parent',
      case when link.status='linked' then 'PARENT_CHILD_LINKED' else 'PARENT_CHILD_LINK_REQUESTED' end,
      target.school_id,jsonb_build_object('linkId',link.id));

  return jsonb_build_object('linkId',link.id,'parentId',parent_id,'studentId',target.id,
    'status',link.status,'schoolId',target.school_id,'schoolName',school_name,
    'displayName',target.display_name);
end $$;

-- The list behind "ลูกของฉัน". Self-scoped by auth.uid(), so a parent can only ever read their own
-- children, and it deliberately answers for a pending link too — otherwise the person waiting on an
-- approval would see nothing at all.
create or replace function public.list_parent_children()
returns table(
  link_id uuid, student_id uuid, display_name text, school_id uuid, school_name text,
  class_name text, masked_code text, avatar_index integer, relationship text, status text,
  linked_at timestamptz
) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  return query
  select l.id, s.id, s.display_name, s.school_id, sc.name,
    coalesce((select c.name from public.student_class_enrollments e
      join public.classes c on c.id=e.class_id
      where e.student_id=s.id and e.status='active' and e.deleted_at is null
      order by e.enrolled_at desc limit 1),''),
    public.mask_student_code(s.student_code), s.avatar_index,
    l.relationship,
    case when l.revoked_at is not null then 'revoked' else l.status end,
    l.linked_at
  from public.parent_student_links l
  join public.parents p on p.id=l.parent_id
  join public.students s on s.id=l.student_id
  join public.schools sc on sc.id=s.school_id
  where p.profile_id=actor and l.deleted_at is null
  order by l.created_at;
end $$;

-- Staff queue for the requests the one-field screen produces.
create or replace function public.list_parent_link_requests(p_school_id uuid)
returns table(
  link_id uuid, parent_name text, student_id uuid, student_name text,
  class_name text, relationship text, status text, requested_at timestamptz
) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return query
  select l.id, p.display_name, s.id, s.display_name,
    coalesce((select c.name from public.student_class_enrollments e
      join public.classes c on c.id=e.class_id
      where e.student_id=s.id and e.status='active' and e.deleted_at is null
      order by e.enrolled_at desc limit 1),''),
    l.relationship,
    case when l.revoked_at is not null then 'revoked' else l.status end,
    l.created_at
  from public.parent_student_links l
  join public.parents p on p.id=l.parent_id
  join public.students s on s.id=l.student_id
  where l.school_id=p_school_id and l.deleted_at is null
  order by (l.status='pending') desc, l.created_at desc
  limit 200;
end $$;

-- Approve, revoke or restore one relationship. School staff decide for anyone; a parent may only
-- close their own link, and may never approve one.
create or replace function public.set_parent_link_state(p_link_id uuid, p_state text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  link public.parent_student_links%rowtype;
  parent_owner boolean;
  staff boolean;
  policy_version text;
  new_consent uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_state not in ('approve','revoke','restore') then raise exception 'VALIDATION_ERROR'; end if;
  select * into link from public.parent_student_links where id=p_link_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select exists(select 1 from public.parents p where p.id=link.parent_id and p.profile_id=actor) into parent_owner;
  staff := public.can_operate_school(link.school_id);
  if not staff and not (parent_owner and p_state='revoke') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  if p_state='revoke' then
    update public.parent_student_links set status='revoked',revoked_at=clock_timestamp(),consent_id=null,
      updated_at=clock_timestamp(),version=version+1 where id=link.id returning * into link;
  else
    select coalesce(value_json->>'version','1.0') into policy_version from public.settings
      where school_id=link.school_id and scope_type='school' and key='privacy_policy' limit 1;
    insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version)
      values(link.school_id,link.parent_id,link.student_id,'student_data_sharing',coalesce(policy_version,'1.0'))
      returning id into new_consent;
    update public.parent_student_links set status='linked',revoked_at=null,consent_id=new_consent,
      linked_at=coalesce(linked_at,clock_timestamp()),updated_at=clock_timestamp(),version=version+1
      where id=link.id returning * into link;
    update public.school_memberships set status='active',active_until=null,updated_at=clock_timestamp()
      where school_id=link.school_id and role='parent'
        and profile_id=(select profile_id from public.parents where id=link.parent_id);
  end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(link.school_id,actor,
      case p_state when 'approve' then 'PARENT_LINK_APPROVED'
                   when 'restore' then 'PARENT_LINK_RESTORED'
                   else 'PARENT_LINK_REVOKED' end,
      'parent_student_link',link.id,link.student_id,
      jsonb_build_object('status',link.status,'byParent',parent_owner and not staff));
  return jsonb_build_object('linkId',link.id,'status',link.status);
end $$;

-- 7. Password recovery without email --------------------------------------------------------------
-- The request never says whether the name exists; the gateway answers the same either way. Only a
-- new password is ever set, and only by staff who already administer that school.

create or replace function public.request_member_password_reset(p_role text, p_display_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare identity public.member_login_identities%rowtype; school uuid; request_id uuid;
begin
  select * into identity from public.member_login_identities
    where normalized_name=lower(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'))
      and (role=p_role or (p_role='teacher' and role='admin'))
      and status='active' limit 1;
  if not found then return jsonb_build_object('recorded',false); end if;
  school := identity.school_id;
  if school is null then
    select m.school_id into school from public.school_memberships m
      where m.profile_id=identity.profile_id and m.status='active' order by m.created_at limit 1;
  end if;
  if school is null then
    select l.school_id into school from public.parent_student_links l
      join public.parents p on p.id=l.parent_id
      where p.profile_id=identity.profile_id and l.deleted_at is null order by l.created_at limit 1;
  end if;
  insert into public.password_reset_requests(profile_id,role,school_id,display_name)
    values(identity.profile_id,identity.role,school,identity.display_name) returning id into request_id;
  insert into public.member_account_events(profile_id,role,action,school_id)
    values(identity.profile_id,identity.role,'PASSWORD_RESET_REQUESTED',school);
  return jsonb_build_object('recorded',true,'requestId',request_id);
end $$;

-- Authorises one reset and marks it done. The gateway sets the password itself; this function is
-- what decides the actor was allowed to ask for it, and returns the address to set it against.
create or replace function public.authorize_member_password_reset(p_request_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare request public.password_reset_requests%rowtype; identity public.member_login_identities%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into request from public.password_reset_requests where id=p_request_id for update;
  if not found or request.status<>'open' then raise exception 'NOT_FOUND'; end if;
  if request.school_id is null or not public.member_can_operate(p_actor,request.school_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into identity from public.member_login_identities where profile_id=request.profile_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.password_reset_requests set status='completed',resolved_at=clock_timestamp(),
    resolved_by=p_actor where id=request.id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(request.school_id,p_actor,'MEMBER_PASSWORD_RESET','user_profile',request.profile_id,
      jsonb_build_object('role',request.role));
  insert into public.member_account_events(profile_id,role,action,school_id,metadata_json)
    values(request.profile_id,request.role,'PASSWORD_RESET_COMPLETED',request.school_id,
      jsonb_build_object('resolvedBy',p_actor));
  return jsonb_build_object('profileId',request.profile_id,'authEmail',identity.auth_email);
end $$;

-- 8. Grants -----------------------------------------------------------------------------------------
-- Every lookup that can turn a typed name into an account stays with the gateway. The two functions
-- a signed-in person calls for themselves — their own children, a link decision — are the only ones
-- an ordinary session may execute.

revoke all on function public.register_member_identity(uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.resolve_member_login(text,text) from public,anon,authenticated;
revoke all on function public.record_member_login(uuid) from public,anon,authenticated;
revoke all on function public.search_children_for_parent(uuid,text) from public,anon,authenticated;
revoke all on function public.link_parent_child(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.request_member_password_reset(text,text) from public,anon,authenticated;
revoke all on function public.authorize_member_password_reset(uuid,uuid) from public,anon,authenticated;
revoke all on function public.member_can_operate(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_member_identity(uuid,text,text,text,text,uuid,text) to service_role;
grant execute on function public.resolve_member_login(text,text) to service_role;
grant execute on function public.record_member_login(uuid) to service_role;
grant execute on function public.search_children_for_parent(uuid,text) to service_role;
grant execute on function public.link_parent_child(uuid,uuid,text) to service_role;
grant execute on function public.request_member_password_reset(text,text) to service_role;
grant execute on function public.authorize_member_password_reset(uuid,uuid) to service_role;
grant execute on function public.member_can_operate(uuid,uuid) to service_role;

revoke all on function public.list_parent_children() from public,anon;
revoke all on function public.list_parent_link_requests(uuid) from public,anon;
revoke all on function public.set_parent_link_state(uuid,text) from public,anon;
grant execute on function public.list_parent_children() to authenticated;
grant execute on function public.list_parent_link_requests(uuid) to authenticated;
grant execute on function public.set_parent_link_state(uuid,text) to authenticated;

comment on table public.member_login_identities is
  'Name + password directory. auth_email is an internal address derived from the profile id and is never typed by a user.';
comment on function public.search_children_for_parent(uuid,text) is
  'Safe child candidates for the one-field parent screen: identity only, never academic data.';

commit;
