-- Academic workflow: work types, rubrics, submission history, personal deadlines, announcements,
-- delivery preferences, self-service avatars and the academic audit trail.
--
-- Everything here follows the boundaries the project already uses: clients read through RLS, and
-- every write that changes academic meaning goes through a security-definer function that checks
-- the caller's role and records what changed.

-- ---------------------------------------------------------------------------
-- Columns on existing records
-- ---------------------------------------------------------------------------
alter table public.classes add column if not exists capacity integer not null default 40
  check (capacity > 0 and capacity <= 200);

alter table public.students add column if not exists avatar_id text;
alter table public.teachers add column if not exists avatar_id text;
alter table public.parents add column if not exists avatar_id text;

alter table public.assignments add column if not exists work_type text not null default 'assignment'
  check (work_type in ('assignment','homework','project','activity'));
alter table public.assignments add column if not exists start_at timestamptz;
alter table public.assignments add column if not exists published_at timestamptz;
alter table public.assignments add column if not exists cancelled_at timestamptz;
alter table public.assignments add column if not exists reminder_offsets integer[] not null default '{0,1440,180}';
alter table public.assignments add column if not exists rubric_id uuid;

alter table public.submissions add column if not exists version integer not null default 0;
alter table public.submissions add column if not exists opened_at timestamptz;
alter table public.submissions add column if not exists acknowledged_at timestamptz;
alter table public.submissions add column if not exists revision_note text not null default '';
alter table public.submissions add column if not exists percentage numeric(6,2);
alter table public.submissions add column if not exists calculated_grade text;
alter table public.submissions add column if not exists final_grade text;
alter table public.submissions add column if not exists grade_override_reason text not null default '';
alter table public.submissions add column if not exists graded_by uuid references public.user_profiles(id);
alter table public.submissions add column if not exists graded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Rubrics
-- ---------------------------------------------------------------------------
create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  subject_id uuid references public.subjects(id),
  title text not null,
  criteria jsonb not null default '[]'::jsonb,
  status public.record_status not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.rubrics enable row level security;
create policy rubrics_member_read on public.rubrics for select to authenticated
  using (public.is_active_member(school_id));

create table if not exists public.rubric_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.students(id),
  criterion_id text not null,
  score numeric(10,2),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id, criterion_id)
);
alter table public.rubric_scores enable row level security;
create policy rubric_scores_scoped_read on public.rubric_scores for select to authenticated
using (
  public.has_school_role(school_id,'admin')
  or public.can_read_student(student_id)
  or exists (select 1 from public.assignments a where a.id = rubric_scores.assignment_id
             and public.teacher_has_class_access(a.class_id))
);

alter table public.assignments
  drop constraint if exists assignments_rubric_id_fkey;
alter table public.assignments
  add constraint assignments_rubric_id_fkey foreign key (rubric_id) references public.rubrics(id);

-- ---------------------------------------------------------------------------
-- Submission history, personal deadlines, announcements, preferences
-- ---------------------------------------------------------------------------
create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.students(id),
  version_number integer not null check (version_number > 0),
  submitted_at timestamptz not null,
  is_late boolean not null default false,
  student_note text not null default '',
  attachment_owner_id text not null,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id, version_number)
);
alter table public.submission_versions enable row level security;
create policy submission_versions_scoped_read on public.submission_versions for select to authenticated
using (
  public.has_school_role(school_id,'admin')
  or public.can_read_student(student_id)
  or exists (select 1 from public.assignments a where a.id = submission_versions.assignment_id
             and public.teacher_has_class_access(a.class_id))
);

create table if not exists public.deadline_extensions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.students(id),
  due_at timestamptz not null,
  reason text not null default '',
  granted_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
alter table public.deadline_extensions enable row level security;
create policy deadline_extensions_scoped_read on public.deadline_extensions for select to authenticated
using (
  public.has_school_role(school_id,'admin')
  or public.can_read_student(student_id)
  or exists (select 1 from public.assignments a where a.id = deadline_extensions.assignment_id
             and public.teacher_has_class_access(a.class_id))
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  class_id uuid not null references public.classes(id),
  subject_id uuid references public.subjects(id),
  title text not null,
  body text not null default '',
  student_ids uuid[] not null default '{}',
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.announcements enable row level security;
create policy announcements_scoped_read on public.announcements for select to authenticated
using (
  public.has_school_role(school_id,'admin')
  or public.teacher_has_class_access(class_id)
  or exists (select 1 from public.student_class_enrollments e
             where e.class_id = announcements.class_id and e.status = 'active' and e.deleted_at is null
               and public.can_read_student(e.student_id))
);

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  profile_id uuid not null references public.user_profiles(id),
  assignment_reminder boolean not null default true,
  project_reminder boolean not null default true,
  grade_notification boolean not null default true,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, profile_id)
);
alter table public.notification_settings enable row level security;
create policy notification_settings_own_read on public.notification_settings for select to authenticated
  using (profile_id = (select auth.uid()) or public.has_school_role(school_id,'admin'));

grant select on public.rubrics, public.rubric_scores, public.submission_versions,
  public.deadline_extensions, public.announcements, public.notification_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Trusted writes
-- ---------------------------------------------------------------------------
create or replace function public.set_class_capacity(p_school_id uuid, p_class_id uuid, p_capacity integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); enrolled integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.has_school_role(p_school_id,'admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_capacity is null or p_capacity <= 0 or p_capacity > 200 then
    raise exception 'VALIDATION_ERROR: capacity out of range';
  end if;
  select count(*) into enrolled from public.student_class_enrollments
  where class_id = p_class_id and school_id = p_school_id and status = 'active' and deleted_at is null;
  if p_capacity < enrolled then
    raise exception 'VALIDATION_ERROR: capacity % is below the % students already enrolled', p_capacity, enrolled;
  end if;
  update public.classes set capacity = p_capacity, updated_at = clock_timestamp(), version = version + 1
  where id = p_class_id and school_id = p_school_id;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
  values(p_school_id,actor,'class_capacity','class',p_class_id,jsonb_build_object('capacity',p_capacity));
  return jsonb_build_object('entityId',p_class_id,'capacity',p_capacity);
end $$;

/** Self-service avatar. The caller can only ever touch the record tied to their own auth user. */
create or replace function public.set_own_avatar(p_school_id uuid, p_avatar_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); touched integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if p_avatar_id !~ '^avatar_[0-9]{3}$' then raise exception 'VALIDATION_ERROR: unknown avatar'; end if;

  update public.students set avatar_id = p_avatar_id, updated_at = clock_timestamp()
  where school_id = p_school_id and profile_id = actor;
  get diagnostics touched = row_count;

  if touched = 0 then
    update public.teachers set avatar_id = p_avatar_id, updated_at = clock_timestamp()
    where school_id = p_school_id and profile_id = actor;
    get diagnostics touched = row_count;
  end if;

  if touched = 0 then
    update public.parents set avatar_id = p_avatar_id, updated_at = clock_timestamp()
    where school_id = p_school_id and profile_id = actor;
    get diagnostics touched = row_count;
  end if;

  if touched = 0 then raise exception 'NOT_FOUND: no profile of your own in this school'; end if;
  return jsonb_build_object('avatarId', p_avatar_id);
end $$;

create or replace function public.upsert_rubric(
  p_school_id uuid, p_rubric_id uuid, p_subject_id uuid, p_title text, p_criteria jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if jsonb_array_length(coalesce(p_criteria,'[]'::jsonb)) = 0 then
    raise exception 'VALIDATION_ERROR: rubric needs at least one criterion';
  end if;
  insert into public.rubrics(id,school_id,subject_id,title,criteria,status,version)
  values(p_rubric_id,p_school_id,p_subject_id,p_title,p_criteria,'active',1)
  on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,criteria=excluded.criteria,
    updated_at=clock_timestamp(),version=public.rubrics.version+1,deleted_at=null;
  return jsonb_build_object('entityId',p_rubric_id);
end $$;

create or replace function public.grant_deadline_extension(
  p_school_id uuid, p_extension_id uuid, p_assignment_id uuid, p_student_id uuid, p_due_at timestamptz, p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); scope_class uuid; previous timestamptz;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select class_id, due_at into scope_class, previous from public.assignments
  where id = p_assignment_id and school_id = p_school_id;
  if scope_class is null then raise exception 'NOT_FOUND'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(scope_class)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  insert into public.deadline_extensions(id,school_id,assignment_id,student_id,due_at,reason,granted_by)
  values(p_extension_id,p_school_id,p_assignment_id,p_student_id,p_due_at,coalesce(p_reason,''),actor)
  on conflict(assignment_id,student_id) do update set due_at=excluded.due_at,reason=excluded.reason,
    granted_by=excluded.granted_by,updated_at=clock_timestamp();

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json,after_json,metadata_json)
  values(p_school_id,actor,'STUDENT_EXTENSION_CREATED','assignment',p_assignment_id,p_student_id,
         jsonb_build_object('dueAt',previous), jsonb_build_object('dueAt',p_due_at),
         jsonb_build_object('reason',p_reason));
  return jsonb_build_object('entityId',p_extension_id,'dueAt',p_due_at);
end $$;

/** One entry point for the academic audit trail so history can never be written around. */
create or replace function public.record_academic_audit(
  p_school_id uuid, p_action text, p_assignment_id uuid, p_student_id uuid,
  p_old_value text, p_new_value text, p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  if p_action not in ('SCORE_CREATED','SCORE_CHANGED','GRADE_OVERRIDE','GRADE_OVERRIDE_REMOVED','DEADLINE_CHANGED',
                      'STUDENT_EXTENSION_CREATED','ASSIGNMENT_PUBLISHED','ASSIGNMENT_CANCELLED','REVISION_REQUESTED') then
    raise exception 'VALIDATION_ERROR: unsupported academic action';
  end if;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json,after_json,metadata_json)
  values(p_school_id,actor,p_action,'assignment',p_assignment_id,p_student_id,
         jsonb_build_object('value',p_old_value), jsonb_build_object('value',p_new_value),
         jsonb_build_object('reason',coalesce(p_reason,'')));
  return jsonb_build_object('action',p_action);
end $$;

create or replace function public.save_announcement(
  p_school_id uuid, p_announcement_id uuid, p_class_id uuid, p_subject_id uuid,
  p_title text, p_body text, p_student_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not (public.has_school_role(p_school_id,'admin') or public.teacher_has_class_access(p_class_id)) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'VALIDATION_ERROR: title required'; end if;
  insert into public.announcements(id,school_id,class_id,subject_id,title,body,student_ids,created_by)
  values(p_announcement_id,p_school_id,p_class_id,p_subject_id,p_title,coalesce(p_body,''),coalesce(p_student_ids,'{}'),actor)
  on conflict(id) do update set class_id=excluded.class_id,subject_id=excluded.subject_id,title=excluded.title,
    body=excluded.body,student_ids=excluded.student_ids,updated_at=clock_timestamp(),deleted_at=null;
  return jsonb_build_object('entityId',p_announcement_id);
end $$;

create or replace function public.save_notification_settings(
  p_school_id uuid, p_assignment_reminder boolean, p_project_reminder boolean,
  p_grade_notification boolean, p_quiet_start text, p_quiet_end text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  insert into public.notification_settings(school_id,profile_id,assignment_reminder,project_reminder,grade_notification,quiet_hours_start,quiet_hours_end)
  values(p_school_id,actor,p_assignment_reminder,p_project_reminder,p_grade_notification,p_quiet_start,p_quiet_end)
  on conflict(school_id,profile_id) do update set assignment_reminder=excluded.assignment_reminder,
    project_reminder=excluded.project_reminder,grade_notification=excluded.grade_notification,
    quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,
    updated_at=clock_timestamp();
  return jsonb_build_object('profileId',actor);
end $$;

revoke all on function public.set_class_capacity(uuid,uuid,integer) from public,anon;
revoke all on function public.set_own_avatar(uuid,text) from public,anon;
revoke all on function public.upsert_rubric(uuid,uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.grant_deadline_extension(uuid,uuid,uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.record_academic_audit(uuid,text,uuid,uuid,text,text,text) from public,anon;
revoke all on function public.save_announcement(uuid,uuid,uuid,uuid,text,text,uuid[]) from public,anon;
revoke all on function public.save_notification_settings(uuid,boolean,boolean,boolean,text,text) from public,anon;

grant execute on function public.set_class_capacity(uuid,uuid,integer) to authenticated;
grant execute on function public.set_own_avatar(uuid,text) to authenticated;
grant execute on function public.upsert_rubric(uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.grant_deadline_extension(uuid,uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.record_academic_audit(uuid,text,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.save_announcement(uuid,uuid,uuid,uuid,text,text,uuid[]) to authenticated;
grant execute on function public.save_notification_settings(uuid,boolean,boolean,boolean,text,text) to authenticated;
