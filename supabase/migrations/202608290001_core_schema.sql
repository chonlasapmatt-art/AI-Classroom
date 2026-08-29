begin;

create extension if not exists pgcrypto with schema extensions;

create type public.membership_role as enum ('admin','teacher','student','parent');
create type public.record_status as enum ('active','inactive','suspended','archived');
create type public.attendance_status as enum ('present','late','absent','leave');
create type public.sync_operation as enum ('upsert','delete');
create type public.outbox_status as enum ('pending','processing','sent','failed','dead_letter');

create table public.schools (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 200),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'), timezone text not null default 'Asia/Bangkok',
  status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade, display_name text not null check (char_length(display_name) between 1 and 200),
  global_status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.school_memberships (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), profile_id uuid not null references public.user_profiles(id),
  role public.membership_role not null, status public.record_status not null default 'active', active_from timestamptz not null default now(), active_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,profile_id,role)
);
create table public.academic_terms (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), academic_year text not null, term text not null,
  starts_on date not null, ends_on date not null check(ends_on >= starts_on), status text not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(school_id,academic_year,term)
);
create table public.teachers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), profile_id uuid references public.user_profiles(id),
  teacher_code text not null, display_name text not null, status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(school_id,teacher_code), unique(school_id,profile_id)
);
create table public.classes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), academic_term_id uuid not null references public.academic_terms(id),
  name text not null, grade_level text not null, status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.class_teachers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), class_id uuid not null references public.classes(id), teacher_id uuid not null references public.teachers(id),
  role_in_class text not null default 'primary', active_from timestamptz not null default now(), active_until timestamptz, created_at timestamptz not null default now(), unique(class_id,teacher_id,active_from)
);
create table public.students (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), profile_id uuid references public.user_profiles(id), student_code text not null, display_name text not null,
  avatar_index integer not null default 0 check(avatar_index >= 0), avatar_config jsonb, avatar_animation_set text not null default 'standard', status public.record_status not null default 'active',
  version integer not null default 1 check(version > 0), created_by uuid references public.user_profiles(id), updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(school_id,student_code), unique(school_id,profile_id)
);
create table public.student_class_enrollments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null references public.students(id), class_id uuid not null references public.classes(id), academic_term_id uuid not null references public.academic_terms(id),
  status text not null default 'active', enrolled_at timestamptz not null default now(), left_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index one_active_enrollment_per_term on public.student_class_enrollments(student_id,academic_term_id) where status='active' and deleted_at is null;

create table public.parents (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), profile_id uuid not null references public.user_profiles(id), display_name text not null, phone text,
  line_user_id text, line_linked_at timestamptz, status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,profile_id)
);
create table public.consents (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), parent_id uuid not null references public.parents(id), student_id uuid not null references public.students(id),
  consent_type text not null, policy_version text not null, accepted_at timestamptz not null default now(), revoked_at timestamptz, ip_hash text, user_agent_summary text, created_at timestamptz not null default now()
);
create table public.parent_student_links (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), parent_id uuid not null references public.parents(id), student_id uuid not null references public.students(id),
  relationship text not null, status text not null default 'pending', consent_id uuid references public.consents(id), linked_at timestamptz, revoked_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, unique(parent_id,student_id)
);
create table public.parent_link_invitations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null references public.students(id), code_hash text not null,
  expires_at timestamptz not null, max_attempts integer not null default 5 check(max_attempts between 1 and 20), attempt_count integer not null default 0,
  used_at timestamptz, revoked_at timestamptz, created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), class_id uuid not null references public.classes(id), title text not null, description text not null default '', assigned_at timestamptz not null default now(), due_at timestamptz, max_score numeric(10,2) not null check(max_score >= 0), status text not null default 'draft',
  version integer not null default 1, created_by uuid references public.user_profiles(id), updated_by uuid references public.user_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), assignment_id uuid not null references public.assignments(id), student_id uuid not null references public.students(id), submitted_at timestamptz, status text not null default 'draft', score numeric(10,2), is_late boolean not null default false, teacher_note text not null default '',
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index one_active_submission on public.submissions(assignment_id,student_id) where deleted_at is null;
create table public.activities (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), class_id uuid not null references public.classes(id), title text not null, activity_date date not null, max_score numeric(10,2) not null check(max_score >= 0), status text not null default 'draft', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.activity_scores (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), activity_id uuid not null references public.activities(id), student_id uuid not null references public.students(id), score numeric(10,2), note text not null default '', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index one_active_activity_score on public.activity_scores(activity_id,student_id) where deleted_at is null;
create table public.tests (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), class_id uuid not null references public.classes(id), title text not null, test_date date not null, max_score numeric(10,2) not null check(max_score >= 0), status text not null default 'draft', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.test_scores (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), test_id uuid not null references public.tests(id), student_id uuid not null references public.students(id), score numeric(10,2), published_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index one_active_test_score on public.test_scores(test_id,student_id) where deleted_at is null;
create table public.attendance (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), class_id uuid not null references public.classes(id), student_id uuid not null references public.students(id), attendance_date date not null, status public.attendance_status not null, note text not null default '', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index one_active_attendance on public.attendance(class_id,student_id,attendance_date) where deleted_at is null;

create table public.settings (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), scope_type text not null, scope_id uuid, key text not null, value_json jsonb not null,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(school_id,scope_type,scope_id,key)
);
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), parent_id uuid not null references public.parents(id),
  assignment_new boolean not null default true, due_soon boolean not null default true, missing boolean not null default true, late boolean not null default true,
  score_published boolean not null default true, absent boolean not null default true, at_risk boolean not null default true,
  quiet_period jsonb, locale text not null default 'th', updated_at timestamptz not null default now(), unique(school_id,parent_id)
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), event_type text not null, parent_id uuid references public.parents(id), student_id uuid references public.students(id), aggregate_id uuid,
  payload_json jsonb not null, idempotency_key text not null, status public.outbox_status not null default 'pending', retry_count integer not null default 0, next_retry_at timestamptz not null default now(), created_at timestamptz not null default now(), processed_at timestamptz,
  unique(school_id,idempotency_key)
);
create table public.notifications_log (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), parent_id uuid references public.parents(id), student_id uuid references public.students(id), type text not null, channel text not null, status text not null, provider_message_id text, error_code text, created_at timestamptz not null default now(), sent_at timestamptz
);
create table public.devices (
  id uuid primary key, school_id uuid not null references public.schools(id), device_name text not null, device_type text not null, status public.record_status not null default 'active',
  last_seen_at timestamptz, last_successful_sync_at timestamptz, last_ack_revision bigint not null default 0, revoked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sync_changes (
  revision bigint generated always as identity primary key, school_id uuid not null references public.schools(id), entity_type text not null, entity_id uuid not null, operation public.sync_operation not null, version integer not null, changed_at timestamptz not null default clock_timestamp()
);
create table public.sync_idempotency (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), device_id uuid not null references public.devices(id), idempotency_key text not null,
  request_hash text not null, response_json jsonb not null, processed_at timestamptz not null default now(), unique(school_id,device_id,idempotency_key)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), actor_profile_id uuid references public.user_profiles(id), action text not null, entity_type text not null, entity_id uuid, target_student_id uuid,
  before_json jsonb, after_json jsonb, metadata_json jsonb not null default '{}', occurred_at timestamptz not null default clock_timestamp()
);
create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), device_id uuid not null references public.devices(id), entity_type text not null, entity_id uuid not null,
  base_version integer not null, server_version integer not null, client_payload jsonb not null, server_payload jsonb not null, status text not null default 'needs_review', resolved_by uuid references public.user_profiles(id), resolved_at timestamptz, created_at timestamptz not null default now()
);

create index memberships_profile on public.school_memberships(profile_id,status);
create index classes_school_term on public.classes(school_id,academic_term_id,status);
create index teachers_profile on public.teachers(profile_id,school_id);
create index class_teachers_access on public.class_teachers(teacher_id,class_id,active_until);
create index students_school_status on public.students(school_id,status,deleted_at);
create index enrollments_class_status on public.student_class_enrollments(class_id,status,deleted_at);
create index assignments_class_status on public.assignments(class_id,status,deleted_at);
create index attendance_class_date on public.attendance(class_id,attendance_date,deleted_at);
create index sync_changes_school_revision on public.sync_changes(school_id,revision);
create index outbox_dispatch on public.notification_outbox(status,next_retry_at);
create index audit_school_time on public.audit_log(school_id,occurred_at desc);

comment on column public.students.avatar_index is 'Stable backward-compatible avatar identity. Never derive from display name.';
comment on column public.students.avatar_config is 'Additive animated avatar configuration approved by ADR-031.';
comment on table public.audit_log is 'Append-only trusted-layer security and business audit.';
comment on table public.sync_changes is 'Server monotonic revision journal; client clocks are never pull cursors.';

revoke all on public.audit_log from anon, authenticated;
revoke all on public.sync_idempotency from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
grant select on public.schools, public.user_profiles, public.school_memberships, public.academic_terms, public.teachers, public.classes, public.class_teachers, public.students, public.student_class_enrollments, public.parents, public.parent_student_links, public.assignments, public.submissions, public.activities, public.activity_scores, public.tests, public.test_scores, public.attendance, public.settings, public.consents, public.notification_preferences to authenticated;

commit;
