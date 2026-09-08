-- Every academic record reaches every device.
--
-- The sync protocol carried thirteen entity types. The academic workflow added seven more kinds of
-- record — rubrics, rubric marks, submission history, personal deadlines, delivery preferences, the
-- in-app notices a student reads and the academic audit trail — and every one of them was written to
-- the device's own database and nowhere else. A rubric drawn up on the teacher's laptop did not exist
-- on the classroom board; a deadline extension granted on one device left the student's own device
-- computing lateness against the class deadline; a "งานใหม่" notice was created on the teacher's
-- device and never reached the student it was addressed to.
--
-- This migration gives each of those records a place at the trusted mutation boundary, and repairs
-- four things about that boundary that showed up while doing so:
--
--   1. The assignment and submission writes dropped most of the workflow columns (work type, start,
--      publication, cancellation, reminder offsets, rubric; opened/acknowledged, revision note, the
--      computed grade and who graded it). Two of them — the teacher's instructions and the student's
--      note — had no server column at all, so the first pull after a push wrote an empty string over
--      the text the author's own device still held.
--   2. Records whose identity is a natural key (a badge's dedupe key, a rubric mark's criterion, a
--      submission's assignment+student) could only ever be created by one device: the second device
--      to award the same badge hit the unique constraint and its change was blocked for good. The
--      boundary now finds the row by its natural key and reports the id it actually wrote, so the
--      device can re-key its copy.
--   3. Any active member could push a student or an enrollment — a student's own device could rename
--      a classmate or enrol itself — and a student could push grading columns on their own
--      submission. Students and enrollments are staff writes now (a student may still change their
--      own avatar); a student's turn-in never carries a score, and its lateness is decided here,
--      against the server clock and the student's personal deadline.
--   4. Deleting a row the server never had raised NOT_FOUND and blocked the queue. A delete of
--      something that does not exist is already done; it is answered as accepted and not journaled.
--
-- Marking is repaired too: a multiple-select answer chosen in a different order than the key was
-- marked wrong, and a short answer was never marked at all, because both compared JSON arrays for
-- equality. `answer_matches` compares sets, and accepted short answers case- and space-insensitively.
--
-- Everything else about the mutation — idempotency, the version check on critical records, the audit
-- entry, the journal — is carried over from `202609040001` unchanged.

begin;

-- ---------------------------------------------------------------------------
-- Columns the local schema carried and the server did not
-- ---------------------------------------------------------------------------
-- Null means the server was never told the value; an empty string means the author cleared it.
-- The distinction is what lets a device keep the text it holds until the author's device sends it.
alter table public.assignments add column if not exists instructions text;
alter table public.submissions add column if not exists student_note text;
-- Both columns already existed as `not null default ''`, which cannot express "not told yet": the
-- server answered every pull with an empty string, and the empty string overwrote the text the
-- authoring device still held. Existing rows keep their empty string and change meaning for nobody.
alter table public.assignments alter column instructions drop not null;
alter table public.submissions alter column student_note drop not null;

alter table public.rubrics add column if not exists server_updated_at timestamptz not null default now();

alter table public.rubric_scores add column if not exists version integer not null default 1;
alter table public.rubric_scores add column if not exists server_updated_at timestamptz not null default now();
alter table public.rubric_scores add column if not exists deleted_at timestamptz;

alter table public.submission_versions add column if not exists version integer not null default 1;
alter table public.submission_versions add column if not exists updated_at timestamptz not null default now();
alter table public.submission_versions add column if not exists server_updated_at timestamptz not null default now();
alter table public.submission_versions add column if not exists deleted_at timestamptz;

alter table public.deadline_extensions add column if not exists version integer not null default 1;
alter table public.deadline_extensions add column if not exists server_updated_at timestamptz not null default now();
alter table public.deadline_extensions add column if not exists deleted_at timestamptz;

alter table public.notification_settings add column if not exists version integer not null default 1;
alter table public.notification_settings add column if not exists server_updated_at timestamptz not null default now();
alter table public.notification_settings add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- A student may hand in their own work
-- ---------------------------------------------------------------------------
-- `guard_teacher_academic_scope` refuses anybody who is not an admin or a teacher before it reaches
-- the branch that was written to let a student write their own submission — so that branch has
-- never run, and turning work in has been refused for every student since the guard was added. The
-- exemption the sync boundary already grants (`student_owns_student_record`) is the one this guard
-- has to honour too; a submission a student writes carries no mark, because `apply_sync_mutation`
-- fills the marking columns only for staff.
--
-- Everything else about the guard is carried over from `202609010038` unchanged.
create or replace function public.guard_teacher_academic_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare row_json jsonb; school_id uuid; class_id uuid; subject_id uuid; parent_id uuid; student_id uuid;
begin
  row_json := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  school_id := (row_json->>'school_id')::uuid;
  if public.has_school_role(school_id,'admin') then return case when tg_op='DELETE' then old else new end; end if;

  -- Work a student hands in is theirs to write, and theirs alone: their own record, on a piece of
  -- work published to a room they are actively enrolled in.
  if tg_table_name = 'submissions' and public.student_owns_student_record((row_json->>'student_id')::uuid) then
    if not exists(
      select 1 from public.assignments a
      join public.student_class_enrollments e on e.class_id=a.class_id and e.school_id=a.school_id
      where a.id=(row_json->>'assignment_id')::uuid and a.school_id=(row_json->>'school_id')::uuid
        and a.deleted_at is null
        and e.student_id=(row_json->>'student_id')::uuid and e.status='active' and e.deleted_at is null
    ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
    return case when tg_op='DELETE' then old else new end;
  end if;

  if not public.has_school_role(school_id,'teacher') then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  if tg_table_name in ('assignments','activities','tests') then
    class_id := (row_json->>'class_id')::uuid; subject_id := (row_json->>'subject_id')::uuid;
    if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'activity_scores' then
    select a.class_id,a.subject_id into class_id,subject_id from public.activities a where a.id=(row_json->>'activity_id')::uuid;
    if not public.teacher_can_edit_subject_score(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'test_scores' then
    select t.class_id,t.subject_id into class_id,subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_edit_subject_score(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'submissions' then
    parent_id := (row_json->>'assignment_id')::uuid; student_id := (row_json->>'student_id')::uuid;
    select a.class_id,a.subject_id into class_id,subject_id from public.assignments a where a.id=parent_id;
    if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  elsif tg_table_name = 'score_events' then
    class_id := (row_json->>'class_id')::uuid; subject_id := (row_json->>'subject_id')::uuid; student_id := (row_json->>'student_id')::uuid;
    if class_id is null or not public.teacher_can_edit_subject_score(school_id,class_id,subject_id)
       -- Qualifying every column here is not tidying: `e.school_id=school_id` reads `school_id` as
       -- both the local variable and the table's own column, which PL/pgSQL refuses outright, so
       -- awarding a score event as a teacher raised "column reference is ambiguous" rather than
       -- checking anything.
       or not exists(select 1 from public.student_class_enrollments e
            where e.school_id=(row_json->>'school_id')::uuid and e.class_id=(row_json->>'class_id')::uuid
              and e.student_id=(row_json->>'student_id')::uuid and e.status='active' and e.deleted_at is null) then
      raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501';
    end if;
  elsif tg_table_name = 'exam_questions' then
    select t.class_id,t.subject_id into class_id,subject_id from public.tests t where t.id=(row_json->>'test_id')::uuid;
    if not public.teacher_can_manage_subject_content(school_id,class_id,subject_id) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

comment on function public.guard_teacher_academic_scope() is
  'Subject ownership for staff writes; a student may write their own submission on work published to their room.';

-- ---------------------------------------------------------------------------
-- The in-app notice a student reads
-- ---------------------------------------------------------------------------
-- Separate from notification_outbox, which is the LINE delivery queue for parents. This is the
-- record behind the student's notification centre: created on the teacher's device when work is
-- published, moved, cancelled or marked, delivered and read on the student's.
create table if not exists public.classroom_notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  assignment_id uuid references public.assignments(id),
  kind text not null check (kind in ('assignment_published','submission_reminder','work_returned','deadline_changed','work_cancelled','revision_requested','announcement','grade_posted')),
  title text not null,
  body text not null default '',
  -- Stable identity so a retry, a resync or a recalculated reminder plan never duplicates a notice.
  dedupe_key text not null,
  state text not null default 'delivered' check (state in ('queued','scheduled','sent','delivered','failed','read')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (school_id, dedupe_key)
);
create index if not exists classroom_notifications_student_idx on public.classroom_notifications(school_id, student_id, state);

alter table public.classroom_notifications enable row level security;
drop policy if exists classroom_notifications_scoped_read on public.classroom_notifications;
create policy classroom_notifications_scoped_read on public.classroom_notifications for select to authenticated
  using (public.can_read_student(student_id) or public.teacher_has_class_access(class_id));
grant select on public.classroom_notifications to authenticated;

comment on table public.classroom_notifications is
  'In-app notices for students. The LINE outbox for parents is notification_outbox; this is the record the student reads.';

-- ---------------------------------------------------------------------------
-- Small helpers the boundary needs
-- ---------------------------------------------------------------------------
/** A uuid, or null when the text is not one. A payload field is never allowed to abort a batch with a cast error. */
create or replace function public.sync_uuid(p_value text)
returns uuid language sql immutable as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid else null end;
$$;

/** A JSON array of numbers as an integer array, or null when the payload did not carry one. */
create or replace function public.sync_int_array(p_value jsonb)
returns integer[] language sql immutable as $$
  select case when p_value is null or jsonb_typeof(p_value) <> 'array' then null
    else coalesce((select array_agg(v::integer) from jsonb_array_elements_text(p_value) v), '{}'::integer[]) end;
$$;

/** The deadline that applies to one student: their personal extension, else the class deadline. */
create or replace function public.submission_deadline(p_assignment_id uuid, p_student_id uuid)
returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    (select e.due_at from public.deadline_extensions e
      where e.assignment_id=p_assignment_id and e.student_id=p_student_id and e.deleted_at is null
      order by e.updated_at desc limit 1),
    (select a.due_at from public.assignments a where a.id=p_assignment_id));
$$;

/**
 * Whether an answer matches the key.
 *
 * Choice questions compare the set of chosen ids with the set in the key, so the order a student
 * tapped them in is irrelevant. A short answer is right when any of the accepted answers matches it
 * once case and surrounding or repeated whitespace are ignored. An empty answer, or an empty key, is
 * never a match.
 */
create or replace function public.answer_matches(p_question_type text, p_given jsonb, p_key jsonb)
returns boolean language sql immutable as $$
  select case
    when p_given is null or p_key is null then false
    when jsonb_typeof(p_given) <> 'array' or jsonb_typeof(p_key) <> 'array' then false
    when jsonb_array_length(p_given) = 0 or jsonb_array_length(p_key) = 0 then false
    when p_question_type = 'short_answer' then exists (
      select 1
      from jsonb_array_elements_text(p_given) g(answer), jsonb_array_elements_text(p_key) k(accepted)
      where lower(regexp_replace(btrim(g.answer), '\s+', ' ', 'g')) <> ''
        and lower(regexp_replace(btrim(g.answer), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(k.accepted), '\s+', ' ', 'g')))
    else (select array_agg(distinct g.choice order by g.choice) from jsonb_array_elements_text(p_given) g(choice))
       = (select array_agg(distinct k.choice order by k.choice) from jsonb_array_elements_text(p_key) k(choice))
  end;
$$;

revoke all on function public.sync_uuid(text) from public,anon;
revoke all on function public.sync_int_array(jsonb) from public,anon;
revoke all on function public.submission_deadline(uuid,uuid) from public,anon;
revoke all on function public.answer_matches(text,jsonb,jsonb) from public,anon;
grant execute on function public.sync_uuid(text) to authenticated;
grant execute on function public.sync_int_array(jsonb) to authenticated;
grant execute on function public.submission_deadline(uuid,uuid) to authenticated;
grant execute on function public.answer_matches(text,jsonb,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The trusted mutation boundary
-- ---------------------------------------------------------------------------
create or replace function public.apply_sync_mutation(
  p_school_id uuid, p_device_id uuid, p_idempotency_key text, p_request_hash text,
  p_entity_type text, p_entity_id uuid, p_operation public.sync_operation, p_payload jsonb, p_base_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid(); stored public.sync_idempotency%rowtype; device public.devices%rowtype;
  current_version integer; result jsonb; new_revision bigint; class_scope uuid; student_scope uuid; assignment_scope uuid;
  critical boolean; is_admin boolean; staff boolean; journal boolean:=true; subject_scope uuid;
  -- The row the boundary actually writes. It differs from p_entity_id when the record already exists
  -- under its natural key, created by another device.
  target_id uuid:=p_entity_id; existing_id uuid;
  server_now timestamptz:=clock_timestamp(); submitted timestamptz; deadline timestamptz; late boolean; head_status text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.is_active_member(p_school_id) then raise exception 'MEMBERSHIP_INACTIVE' using errcode='42501'; end if;
  select * into device from public.devices where id=p_device_id and school_id=p_school_id for update;
  if not found or device.status<>'active' or device.revoked_at is not null then raise exception 'DEVICE_REVOKED' using errcode='42501'; end if;
  if p_entity_type not in ('student','enrollment','assignment','submission','activity','activity_score','test','test_score','attendance','setting','timetable_entry','achievement','score_event','rubric','rubric_score','submission_version','deadline_extension','notification_preference','classroom_notification','academic_audit') then raise exception 'VALIDATION_ERROR: unsupported entity'; end if;
  if char_length(p_idempotency_key)<8 or char_length(p_request_hash)<32 then raise exception 'VALIDATION_ERROR: invalid idempotency'; end if;
  select * into stored from public.sync_idempotency where school_id=p_school_id and device_id=p_device_id and idempotency_key=p_idempotency_key;
  if found then
    if stored.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_INTEGRITY_ERROR' using errcode='22000'; end if;
    return stored.response_json;
  end if;
  is_admin:=public.has_school_role(p_school_id,'admin');
  staff:=is_admin or public.has_school_role(p_school_id,'teacher');
  critical:=p_entity_type in ('attendance','activity_score','test_score');

  -- A record whose identity is a natural key is found by that key first. Two devices that both
  -- award the same badge, mark the same criterion or open the same submission converge on one row
  -- instead of the second one being refused for as long as the first exists.
  if p_operation='upsert' then
    case p_entity_type
      when 'achievement' then select id into existing_id from public.student_achievements where school_id=p_school_id and dedupe_key=p_payload->>'dedupeKey' and id<>p_entity_id limit 1;
      when 'classroom_notification' then select id into existing_id from public.classroom_notifications where school_id=p_school_id and dedupe_key=p_payload->>'dedupeKey' and id<>p_entity_id limit 1;
      when 'rubric_score' then select id into existing_id from public.rubric_scores where school_id=p_school_id and assignment_id=public.sync_uuid(p_payload->>'assignmentId') and student_id=public.sync_uuid(p_payload->>'studentId') and criterion_id=p_payload->>'criterionId' and id<>p_entity_id limit 1;
      when 'submission_version' then select id into existing_id from public.submission_versions where school_id=p_school_id and assignment_id=public.sync_uuid(p_payload->>'assignmentId') and student_id=public.sync_uuid(p_payload->>'studentId') and version_number=nullif(p_payload->>'versionNumber','')::integer and id<>p_entity_id limit 1;
      when 'deadline_extension' then select id into existing_id from public.deadline_extensions where school_id=p_school_id and assignment_id=public.sync_uuid(p_payload->>'assignmentId') and student_id=public.sync_uuid(p_payload->>'studentId') and id<>p_entity_id limit 1;
      when 'notification_preference' then select id into existing_id from public.notification_settings where school_id=p_school_id and profile_id=public.sync_uuid(p_payload->>'profileId') and id<>p_entity_id limit 1;
      when 'submission' then select id into existing_id from public.submissions where school_id=p_school_id and assignment_id=public.sync_uuid(p_payload->>'assignmentId') and student_id=public.sync_uuid(p_payload->>'studentId') and deleted_at is null and id<>p_entity_id limit 1;
      when 'activity_score' then select id into existing_id from public.activity_scores where school_id=p_school_id and activity_id=public.sync_uuid(p_payload->>'activityId') and student_id=public.sync_uuid(p_payload->>'studentId') and deleted_at is null and id<>p_entity_id limit 1;
      when 'test_score' then select id into existing_id from public.test_scores where school_id=p_school_id and test_id=public.sync_uuid(p_payload->>'testId') and student_id=public.sync_uuid(p_payload->>'studentId') and deleted_at is null and id<>p_entity_id limit 1;
      else null;
    end case;
    if existing_id is not null then target_id:=existing_id; end if;
  end if;

  case p_entity_type
    when 'attendance' then select version,class_id,student_id into current_version,class_scope,student_scope from public.attendance where id=target_id and school_id=p_school_id for update;
    when 'activity_score' then select s.version,a.class_id,s.student_id into current_version,class_scope,student_scope from public.activity_scores s join public.activities a on a.id=s.activity_id where s.id=target_id and s.school_id=p_school_id for update;
    when 'test_score' then select s.version,t.class_id,s.student_id into current_version,class_scope,student_scope from public.test_scores s join public.tests t on t.id=s.test_id where s.id=target_id and s.school_id=p_school_id for update;
    when 'assignment' then select version,class_id into current_version,class_scope from public.assignments where id=target_id and school_id=p_school_id for update;
    when 'activity' then select version,class_id into current_version,class_scope from public.activities where id=target_id and school_id=p_school_id for update;
    when 'test' then select version,class_id into current_version,class_scope from public.tests where id=target_id and school_id=p_school_id for update;
    when 'submission' then select s.version,a.class_id,s.student_id,s.assignment_id into current_version,class_scope,student_scope,assignment_scope from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=target_id and s.school_id=p_school_id for update;
    when 'student' then select version,id into current_version,student_scope from public.students where id=target_id and school_id=p_school_id for update;
    when 'enrollment' then select version,class_id,student_id into current_version,class_scope,student_scope from public.student_class_enrollments where id=target_id and school_id=p_school_id for update;
    when 'setting' then select version into current_version from public.settings where id=target_id and school_id=p_school_id for update;
    when 'timetable_entry' then select version,class_id into current_version,class_scope from public.timetable_entries where id=target_id and school_id=p_school_id for update;
    when 'achievement' then select version,student_id into current_version,student_scope from public.student_achievements where id=target_id and school_id=p_school_id for update;
    when 'score_event' then select version,student_id,class_id into current_version,student_scope,class_scope from public.score_events where id=target_id and school_id=p_school_id for update;
    when 'rubric' then select version into current_version from public.rubrics where id=target_id and school_id=p_school_id for update;
    when 'rubric_score' then select s.version,a.class_id,s.student_id,s.assignment_id into current_version,class_scope,student_scope,assignment_scope from public.rubric_scores s join public.assignments a on a.id=s.assignment_id where s.id=target_id and s.school_id=p_school_id for update;
    when 'submission_version' then select v.version,a.class_id,v.student_id,v.assignment_id into current_version,class_scope,student_scope,assignment_scope from public.submission_versions v join public.assignments a on a.id=v.assignment_id where v.id=target_id and v.school_id=p_school_id for update;
    when 'deadline_extension' then select e.version,a.class_id,e.student_id,e.assignment_id into current_version,class_scope,student_scope,assignment_scope from public.deadline_extensions e join public.assignments a on a.id=e.assignment_id where e.id=target_id and e.school_id=p_school_id for update;
    when 'notification_preference' then select version into current_version from public.notification_settings where id=target_id and school_id=p_school_id for update;
    when 'classroom_notification' then select version,class_id,student_id into current_version,class_scope,student_scope from public.classroom_notifications where id=target_id and school_id=p_school_id for update;
    else current_version:=0;
  end case;
  current_version:=coalesce(current_version,0);
  if critical and current_version<>p_base_version then
    insert into public.sync_conflicts(school_id,device_id,entity_type,entity_id,base_version,server_version,client_payload,server_payload) values(p_school_id,p_device_id,p_entity_type,target_id,p_base_version,current_version,p_payload,jsonb_build_object('version',current_version));
    result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',target_id,'status','conflict','code','SYNC_CONFLICT','message','Critical record version changed','serverVersion',current_version);
    insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result); return result;
  end if;

  -- Everything that hangs off a piece of work is scoped by that work's room.
  if p_entity_type in ('submission','rubric_score','submission_version','deadline_extension') then
    assignment_scope:=coalesce(assignment_scope,public.sync_uuid(p_payload->>'assignmentId'));
    student_scope:=coalesce(student_scope,public.sync_uuid(p_payload->>'studentId'));
    if assignment_scope is null or student_scope is null then raise exception 'VALIDATION_ERROR: assignment and student required'; end if;
    select a.class_id,a.subject_id into class_scope,subject_scope from public.assignments a where a.id=assignment_scope and a.school_id=p_school_id;
    if class_scope is null then raise exception 'VALIDATION_ERROR: unknown assignment'; end if;
  end if;
  if p_entity_type='classroom_notification' then
    class_scope:=coalesce(class_scope,public.sync_uuid(p_payload->>'classId'));
    student_scope:=coalesce(student_scope,public.sync_uuid(p_payload->>'studentId'));
    if class_scope is null or student_scope is null then raise exception 'VALIDATION_ERROR: class and student required'; end if;
  end if;

  if p_entity_type='attendance' and not (is_admin or public.teacher_has_class_access(coalesce(class_scope,(p_payload->>'classId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- The roster is staff's to write. A student may still touch their own record, and only the avatar
  -- on it; the write below keeps every other column as it was.
  if p_entity_type='student' and not (staff or (p_operation='upsert' and public.student_owns_student_record(target_id))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='enrollment' and not (is_admin or public.teacher_has_class_access(coalesce(class_scope,public.sync_uuid(p_payload->>'classId')))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- Work a student hands in is theirs to write. A mark is not. Grouping the submission with the
  -- assignment, the activity, the test and every score attached to one let a student's own device
  -- insert a score for themselves, which is the one thing a gradebook must never accept.
  if p_entity_type in ('submission','submission_version') and not (staff or public.student_owns_student_record(student_scope)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type in ('assignment','activity','test','rubric','academic_audit') and not staff then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- A score, a board award and a badge all land on one student, so they are all decided the same
  -- way: an admin of the school, or a teacher who actually teaches that student.
  if p_entity_type in ('activity_score','test_score','score_event') and not public.staff_can_award_student(p_school_id,coalesce(student_scope,(p_payload->>'studentId')::uuid),coalesce(class_scope,(p_payload->>'classId')::uuid)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='rubric_score' and not public.staff_can_award_student(p_school_id,student_scope,class_scope) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- A rubric mark is a mark on the submission, so it follows the same rule the submissions table enforces by trigger: the subject's owner, or an admin.
  if p_entity_type='rubric_score' and not is_admin and not public.teacher_can_manage_subject_content(p_school_id,class_scope,subject_scope) then raise exception 'FORBIDDEN: SUBJECT_OWNER_REQUIRED' using errcode='42501'; end if;
  if p_entity_type='deadline_extension' and not (is_admin or public.teacher_has_class_access(class_scope)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='setting' and not is_admin then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='timetable_entry' and not (is_admin or public.teacher_has_class_access(coalesce(class_scope,(p_payload->>'classId')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_entity_type='achievement' and not public.staff_can_award_student(p_school_id,coalesce(student_scope,(p_payload->>'studentId')::uuid),null) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- Delivery preferences are the person's own. An admin may set them on somebody's behalf.
  if p_entity_type='notification_preference' and not (is_admin or public.sync_uuid(p_payload->>'profileId')=actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- A notice is written by the staff of the room it is about, and read by the student it is for.
  if p_entity_type='classroom_notification' and not (is_admin or public.teacher_has_class_access(class_scope) or public.student_owns_student_record(student_scope)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  if p_operation='delete' then
    case p_entity_type
      when 'student' then update public.students set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),updated_by=actor,version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'enrollment' then update public.student_class_enrollments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'assignment' then update public.assignments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),updated_by=actor,version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'submission' then update public.submissions set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'activity' then update public.activities set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'activity_score' then update public.activity_scores set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'test' then update public.tests set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'test_score' then update public.test_scores set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'attendance' then update public.attendance set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'setting' then update public.settings set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'timetable_entry' then update public.timetable_entries set deleted_at=clock_timestamp(),status='archived',updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'achievement' then update public.student_achievements set deleted_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'score_event' then update public.score_events set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'rubric' then update public.rubrics set deleted_at=clock_timestamp(),status='archived',updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'rubric_score' then update public.rubric_scores set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'submission_version' then update public.submission_versions set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'deadline_extension' then update public.deadline_extensions set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'notification_preference' then update public.notification_settings set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'classroom_notification' then update public.classroom_notifications set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id returning version into current_version;
      when 'academic_audit' then raise exception 'VALIDATION_ERROR: the audit trail is append-only';
    end case;
    -- Deleting what the server never had is already done. Refusing it left a tombstone the device
    -- could neither deliver nor discard.
    if current_version is null then current_version:=0; journal:=false; end if;
  else
    case p_entity_type
      when 'attendance' then
        class_scope:=(p_payload->>'classId')::uuid; student_scope:=(p_payload->>'studentId')::uuid;
        if not exists(select 1 from public.student_class_enrollments where school_id=p_school_id and class_id=class_scope and student_id=student_scope and status='active' and deleted_at is null) then raise exception 'VALIDATION_ERROR: inactive enrollment'; end if;
        insert into public.attendance(id,school_id,class_id,student_id,attendance_date,status,note,version) values(target_id,p_school_id,class_scope,student_scope,(p_payload->>'attendanceDate')::date,(p_payload->>'status')::public.attendance_status,coalesce(p_payload->>'note',''),1) on conflict(id) do update set status=excluded.status,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.attendance.version+1,deleted_at=null returning version into current_version;
      when 'student' then
        if staff then
          insert into public.students(id,school_id,student_code,display_name,avatar_index,avatar_config,status,version,created_by,updated_by) values(target_id,p_school_id,p_payload->>'studentCode',p_payload->>'displayName',coalesce((p_payload->>'avatarIndex')::integer,0),p_payload->'avatarConfig',coalesce((p_payload->>'status')::public.record_status,'active'),1,actor,actor) on conflict(id) do update set display_name=excluded.display_name,avatar_index=excluded.avatar_index,avatar_config=excluded.avatar_config,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.students.version+1,deleted_at=null returning version into current_version;
        else
          update public.students set avatar_index=coalesce((p_payload->>'avatarIndex')::integer,avatar_index),avatar_config=coalesce(p_payload->'avatarConfig',avatar_config),updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=version+1 where id=target_id and school_id=p_school_id and deleted_at is null returning version into current_version;
          if current_version is null then raise exception 'NOT_FOUND'; end if;
        end if;
      when 'enrollment' then
        class_scope:=public.sync_uuid(p_payload->>'classId'); student_scope:=public.sync_uuid(p_payload->>'studentId');
        if not exists(select 1 from public.students s where s.id=student_scope and s.school_id=p_school_id) then raise exception 'VALIDATION_ERROR: unknown student'; end if;
        if not exists(select 1 from public.classes c where c.id=class_scope and c.school_id=p_school_id and c.academic_term_id=public.sync_uuid(p_payload->>'academicTermId')) then raise exception 'VALIDATION_ERROR: class is not in that term'; end if;
        insert into public.student_class_enrollments(id,school_id,student_id,class_id,academic_term_id,status,enrolled_at,left_at,version) values(target_id,p_school_id,student_scope,class_scope,(p_payload->>'academicTermId')::uuid,p_payload->>'status',coalesce((p_payload->>'enrolledAt')::timestamptz,now()),(p_payload->>'leftAt')::timestamptz,1) on conflict(id) do update set class_id=excluded.class_id,status=excluded.status,left_at=excluded.left_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_class_enrollments.version+1,deleted_at=null returning version into current_version;
      when 'assignment' then
        class_scope:=(p_payload->>'classId')::uuid;
        if coalesce(trim(p_payload->>'title'),'')='' then raise exception 'VALIDATION_ERROR: title required'; end if;
        insert into public.assignments(id,school_id,class_id,subject_id,work_type,title,description,instructions,assigned_at,start_at,due_at,max_score,rubric_id,reminder_offsets,status,published_at,cancelled_at,version,created_by,updated_by)
          values(target_id,p_school_id,class_scope,public.sync_uuid(p_payload->>'subjectId'),coalesce(nullif(p_payload->>'workType',''),'assignment'),p_payload->>'title',coalesce(p_payload->>'description',''),p_payload->>'instructions',coalesce((p_payload->>'assignedAt')::timestamptz,now()),(p_payload->>'startAt')::timestamptz,(p_payload->>'dueAt')::timestamptz,(p_payload->>'maxScore')::numeric,public.sync_uuid(p_payload->>'rubricId'),coalesce(public.sync_int_array(p_payload->'reminderOffsets'),'{0,1440,180}'::integer[]),p_payload->>'status',(p_payload->>'publishedAt')::timestamptz,(p_payload->>'cancelledAt')::timestamptz,1,actor,actor)
          on conflict(id) do update set subject_id=excluded.subject_id,work_type=excluded.work_type,title=excluded.title,description=excluded.description,instructions=coalesce(excluded.instructions,public.assignments.instructions),start_at=excluded.start_at,due_at=excluded.due_at,max_score=excluded.max_score,rubric_id=excluded.rubric_id,reminder_offsets=case when p_payload ? 'reminderOffsets' then excluded.reminder_offsets else public.assignments.reminder_offsets end,status=excluded.status,published_at=coalesce(excluded.published_at,public.assignments.published_at),cancelled_at=excluded.cancelled_at,updated_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.assignments.version+1,deleted_at=null returning version into current_version;
      when 'submission' then
        submitted:=(p_payload->>'submittedAt')::timestamptz;
        if staff then
          insert into public.submissions(id,school_id,assignment_id,student_id,submitted_at,status,score,is_late,teacher_note,student_note,drive_url,opened_at,acknowledged_at,revision_note,percentage,calculated_grade,final_grade,grade_override_reason,graded_by,graded_at,version)
            values(target_id,p_school_id,assignment_scope,student_scope,submitted,coalesce(nullif(p_payload->>'status',''),'not_started'),nullif(p_payload->>'score','')::numeric,coalesce((p_payload->>'isLate')::boolean,false),coalesce(p_payload->>'teacherNote',''),p_payload->>'studentNote',nullif(p_payload->>'driveUrl',''),(p_payload->>'openedAt')::timestamptz,(p_payload->>'acknowledgedAt')::timestamptz,coalesce(p_payload->>'revisionNote',''),nullif(p_payload->>'percentage','')::numeric,nullif(p_payload->>'calculatedGrade',''),nullif(p_payload->>'finalGrade',''),coalesce(p_payload->>'gradeOverrideReason',''),(select u.id from public.user_profiles u where u.id=public.sync_uuid(p_payload->>'gradedBy')),(p_payload->>'gradedAt')::timestamptz,1)
            on conflict(id) do update set submitted_at=excluded.submitted_at,status=excluded.status,score=excluded.score,is_late=excluded.is_late,teacher_note=excluded.teacher_note,student_note=coalesce(excluded.student_note,public.submissions.student_note),drive_url=coalesce(excluded.drive_url,public.submissions.drive_url),opened_at=coalesce(excluded.opened_at,public.submissions.opened_at),acknowledged_at=coalesce(excluded.acknowledged_at,public.submissions.acknowledged_at),revision_note=excluded.revision_note,percentage=excluded.percentage,calculated_grade=excluded.calculated_grade,final_grade=excluded.final_grade,grade_override_reason=excluded.grade_override_reason,graded_by=excluded.graded_by,graded_at=excluded.graded_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.submissions.version+1,deleted_at=null returning version into current_version;
        else
          -- The student's own turn-in. Whether it was late is decided here, from the server clock
          -- and the student's personal deadline, never from what the device believed; and nothing
          -- about the mark travels with it.
          deadline:=public.submission_deadline(assignment_scope,student_scope);
          submitted:=least(submitted,server_now);
          late:=submitted is not null and deadline is not null and submitted>deadline;
          head_status:=p_payload->>'status';
          if head_status not in ('not_started','in_progress','submitted','late','resubmitted') then head_status:=null; end if;
          if head_status in ('submitted','late') then head_status:=case when late then 'late' else 'submitted' end; end if;
          insert into public.submissions(id,school_id,assignment_id,student_id,submitted_at,status,score,is_late,teacher_note,student_note,drive_url,opened_at,acknowledged_at,version)
            values(target_id,p_school_id,assignment_scope,student_scope,submitted,coalesce(head_status,'not_started'),null,late,'',p_payload->>'studentNote',nullif(p_payload->>'driveUrl',''),(p_payload->>'openedAt')::timestamptz,(p_payload->>'acknowledgedAt')::timestamptz,1)
            on conflict(id) do update set submitted_at=coalesce(excluded.submitted_at,public.submissions.submitted_at),status=coalesce(head_status,public.submissions.status),is_late=case when excluded.submitted_at is null then public.submissions.is_late else excluded.is_late end,student_note=coalesce(excluded.student_note,public.submissions.student_note),drive_url=coalesce(excluded.drive_url,public.submissions.drive_url),opened_at=coalesce(excluded.opened_at,public.submissions.opened_at),acknowledged_at=coalesce(excluded.acknowledged_at,public.submissions.acknowledged_at),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.submissions.version+1,deleted_at=null returning version into current_version;
        end if;
      when 'activity' then
        insert into public.activities(id,school_id,class_id,subject_id,title,activity_date,max_score,status,version) values(target_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,p_payload->>'title',(p_payload->>'activityDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,activity_date=excluded.activity_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activities.version+1,deleted_at=null returning version into current_version;
      when 'activity_score' then
        insert into public.activity_scores(id,school_id,activity_id,student_id,score,note,version) values(target_id,p_school_id,(p_payload->>'activityId')::uuid,(p_payload->>'studentId')::uuid,nullif(p_payload->>'score','')::numeric,coalesce(p_payload->>'note',''),1) on conflict(id) do update set score=excluded.score,note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.activity_scores.version+1,deleted_at=null returning version into current_version;
      when 'test' then
        insert into public.tests(id,school_id,class_id,subject_id,title,test_date,max_score,status,version) values(target_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,p_payload->>'title',(p_payload->>'testDate')::date,(p_payload->>'maxScore')::numeric,p_payload->>'status',1) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,test_date=excluded.test_date,max_score=excluded.max_score,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.tests.version+1,deleted_at=null returning version into current_version;
      when 'test_score' then
        insert into public.test_scores(id,school_id,test_id,student_id,score,published_at,version) values(target_id,p_school_id,(p_payload->>'testId')::uuid,(p_payload->>'studentId')::uuid,nullif(p_payload->>'score','')::numeric,(p_payload->>'publishedAt')::timestamptz,1) on conflict(id) do update set score=excluded.score,published_at=excluded.published_at,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.test_scores.version+1,deleted_at=null returning version into current_version;
      when 'setting' then
        insert into public.settings(id,school_id,scope_type,scope_id,key,value_json,version) values(target_id,p_school_id,p_payload->>'scopeType',(p_payload->>'scopeId')::uuid,p_payload->>'key',p_payload->'valueJson',1) on conflict(id) do update set value_json=excluded.value_json,updated_at=clock_timestamp(),version=public.settings.version+1,deleted_at=null returning version into current_version;
      when 'timetable_entry' then
        insert into public.timetable_entries(id,school_id,class_id,subject_id,teacher_id,academic_term_id,day_of_week,period,start_time,end_time,room,status,version) values(target_id,p_school_id,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,(p_payload->>'teacherId')::uuid,(p_payload->>'academicTermId')::uuid,(p_payload->>'dayOfWeek')::integer,(p_payload->>'period')::integer,(p_payload->>'startTime')::time,(p_payload->>'endTime')::time,coalesce(p_payload->>'room',''),coalesce((p_payload->>'status')::public.record_status,'active'),1) on conflict(id) do update set class_id=excluded.class_id,subject_id=excluded.subject_id,teacher_id=excluded.teacher_id,academic_term_id=excluded.academic_term_id,day_of_week=excluded.day_of_week,period=excluded.period,start_time=excluded.start_time,end_time=excluded.end_time,room=excluded.room,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.timetable_entries.version+1,deleted_at=null returning version into current_version;
      when 'achievement' then
        if coalesce(p_payload->>'dedupeKey','')='' then raise exception 'VALIDATION_ERROR: dedupe key required'; end if;
        insert into public.student_achievements(id,school_id,student_id,achievement_key,dedupe_key,note,awarded_by,awarded_at,version) values(target_id,p_school_id,(p_payload->>'studentId')::uuid,p_payload->>'achievementKey',p_payload->>'dedupeKey',coalesce(p_payload->>'note',''),(select u.id from public.user_profiles u where u.id=public.sync_uuid(p_payload->>'awardedBy')),coalesce((p_payload->>'awardedAt')::timestamptz,now()),1) on conflict(id) do update set note=excluded.note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.student_achievements.version+1,deleted_at=null returning version into current_version;
      when 'score_event' then
        student_scope:=(p_payload->>'studentId')::uuid;
        insert into public.score_events(id,school_id,student_id,class_id,subject_id,category,points,reason,source_type,source_id,awarded_by,occurred_at,version) values(target_id,p_school_id,student_scope,(p_payload->>'classId')::uuid,(p_payload->>'subjectId')::uuid,coalesce(p_payload->>'category','bonus'),(p_payload->>'points')::numeric,coalesce(p_payload->>'reason',''),coalesce(p_payload->>'sourceType','manual'),(p_payload->>'sourceId')::uuid,actor,coalesce((p_payload->>'occurredAt')::timestamptz,now()),1) on conflict(id) do update set points=excluded.points,reason=excluded.reason,category=excluded.category,subject_id=excluded.subject_id,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.score_events.version+1,deleted_at=null returning version into current_version;
      when 'rubric' then
        if coalesce(trim(p_payload->>'title'),'')='' then raise exception 'VALIDATION_ERROR: title required'; end if;
        if p_payload->'criteria' is null or jsonb_typeof(p_payload->'criteria')<>'array' or jsonb_array_length(p_payload->'criteria')=0 then raise exception 'VALIDATION_ERROR: rubric needs at least one criterion'; end if;
        insert into public.rubrics(id,school_id,subject_id,title,criteria,status,version) values(target_id,p_school_id,public.sync_uuid(p_payload->>'subjectId'),trim(p_payload->>'title'),p_payload->'criteria',coalesce((p_payload->>'status')::public.record_status,'active'),1) on conflict(id) do update set subject_id=excluded.subject_id,title=excluded.title,criteria=excluded.criteria,status=excluded.status,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.rubrics.version+1,deleted_at=null returning version into current_version;
      when 'rubric_score' then
        if coalesce(p_payload->>'criterionId','')='' then raise exception 'VALIDATION_ERROR: criterion required'; end if;
        insert into public.rubric_scores(id,school_id,assignment_id,student_id,criterion_id,score,comment,version) values(target_id,p_school_id,assignment_scope,student_scope,p_payload->>'criterionId',nullif(p_payload->>'score','')::numeric,coalesce(p_payload->>'comment',''),1) on conflict(id) do update set score=excluded.score,comment=excluded.comment,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.rubric_scores.version+1,deleted_at=null returning version into current_version;
      when 'submission_version' then
        if nullif(p_payload->>'versionNumber','')::integer is null or (p_payload->>'versionNumber')::integer<1 then raise exception 'VALIDATION_ERROR: version number required'; end if;
        submitted:=coalesce((p_payload->>'submittedAt')::timestamptz,server_now);
        if staff then
          late:=coalesce((p_payload->>'isLate')::boolean,false);
        else
          submitted:=least(submitted,server_now);
          deadline:=public.submission_deadline(assignment_scope,student_scope);
          late:=deadline is not null and submitted>deadline;
        end if;
        insert into public.submission_versions(id,school_id,assignment_id,student_id,version_number,submitted_at,is_late,student_note,attachment_owner_id,version) values(target_id,p_school_id,assignment_scope,student_scope,(p_payload->>'versionNumber')::integer,submitted,late,coalesce(p_payload->>'studentNote',''),coalesce(nullif(p_payload->>'attachmentOwnerId',''),assignment_scope::text||':'||student_scope::text),1) on conflict(id) do update set submitted_at=excluded.submitted_at,is_late=excluded.is_late,student_note=excluded.student_note,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.submission_versions.version+1,deleted_at=null returning version into current_version;
      when 'deadline_extension' then
        if (p_payload->>'dueAt')::timestamptz is null then raise exception 'VALIDATION_ERROR: due date required'; end if;
        insert into public.deadline_extensions(id,school_id,assignment_id,student_id,due_at,reason,granted_by,version) values(target_id,p_school_id,assignment_scope,student_scope,(p_payload->>'dueAt')::timestamptz,coalesce(p_payload->>'reason',''),actor,1) on conflict(id) do update set due_at=excluded.due_at,reason=excluded.reason,granted_by=actor,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.deadline_extensions.version+1,deleted_at=null returning version into current_version;
      when 'notification_preference' then
        if public.sync_uuid(p_payload->>'profileId') is null then raise exception 'VALIDATION_ERROR: profile required'; end if;
        insert into public.notification_settings(id,school_id,profile_id,assignment_reminder,project_reminder,grade_notification,quiet_hours_start,quiet_hours_end,version) values(target_id,p_school_id,(p_payload->>'profileId')::uuid,coalesce((p_payload->>'assignmentReminder')::boolean,true),coalesce((p_payload->>'projectReminder')::boolean,true),coalesce((p_payload->>'gradeNotification')::boolean,true),nullif(p_payload->>'quietHoursStart',''),nullif(p_payload->>'quietHoursEnd',''),1) on conflict(id) do update set assignment_reminder=excluded.assignment_reminder,project_reminder=excluded.project_reminder,grade_notification=excluded.grade_notification,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.notification_settings.version+1,deleted_at=null returning version into current_version;
      when 'classroom_notification' then
        if coalesce(p_payload->>'dedupeKey','')='' then raise exception 'VALIDATION_ERROR: dedupe key required'; end if;
        if p_payload->>'kind' not in ('assignment_published','submission_reminder','work_returned','deadline_changed','work_cancelled','revision_requested','announcement','grade_posted') then raise exception 'VALIDATION_ERROR: unknown notification kind'; end if;
        if p_payload->>'state' not in ('queued','scheduled','sent','delivered','failed','read') then raise exception 'VALIDATION_ERROR: unknown notification state'; end if;
        if staff then
          insert into public.classroom_notifications(id,school_id,student_id,class_id,assignment_id,kind,title,body,dedupe_key,state,scheduled_at,sent_at,read_at,version) values(target_id,p_school_id,student_scope,class_scope,public.sync_uuid(p_payload->>'assignmentId'),p_payload->>'kind',coalesce(p_payload->>'title',''),coalesce(p_payload->>'body',''),p_payload->>'dedupeKey',p_payload->>'state',coalesce((p_payload->>'scheduledAt')::timestamptz,server_now),(p_payload->>'sentAt')::timestamptz,(p_payload->>'readAt')::timestamptz,1) on conflict(id) do update set title=excluded.title,body=excluded.body,state=excluded.state,scheduled_at=excluded.scheduled_at,sent_at=excluded.sent_at,read_at=coalesce(excluded.read_at,public.classroom_notifications.read_at),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.classroom_notifications.version+1,deleted_at=null returning version into current_version;
        else
          -- A student delivers and reads a notice; the words on it are not theirs to change.
          insert into public.classroom_notifications(id,school_id,student_id,class_id,assignment_id,kind,title,body,dedupe_key,state,scheduled_at,sent_at,read_at,version) values(target_id,p_school_id,student_scope,class_scope,public.sync_uuid(p_payload->>'assignmentId'),p_payload->>'kind',coalesce(p_payload->>'title',''),coalesce(p_payload->>'body',''),p_payload->>'dedupeKey',p_payload->>'state',coalesce((p_payload->>'scheduledAt')::timestamptz,server_now),(p_payload->>'sentAt')::timestamptz,(p_payload->>'readAt')::timestamptz,1) on conflict(id) do update set state=excluded.state,sent_at=coalesce(excluded.sent_at,public.classroom_notifications.sent_at),read_at=coalesce(excluded.read_at,public.classroom_notifications.read_at),updated_at=clock_timestamp(),server_updated_at=clock_timestamp(),version=public.classroom_notifications.version+1 returning version into current_version;
        end if;
      when 'academic_audit' then
        if p_payload->>'action' not in ('SCORE_CREATED','SCORE_CHANGED','GRADE_OVERRIDE','GRADE_OVERRIDE_REMOVED','DEADLINE_CHANGED','STUDENT_EXTENSION_CREATED','ASSIGNMENT_PUBLISHED','ASSIGNMENT_CANCELLED','REVISION_REQUESTED') then raise exception 'VALIDATION_ERROR: unsupported academic action'; end if;
        -- The entry is the audit record itself, written once under the id the device gave it. The
        -- actor is the signed-in person, whatever the payload claims.
        insert into public.audit_log(id,school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,before_json,after_json,metadata_json,occurred_at)
          values(target_id,p_school_id,actor,p_payload->>'action','assignment',public.sync_uuid(p_payload->>'assignmentId'),public.sync_uuid(p_payload->>'studentId'),jsonb_build_object('value',coalesce(p_payload->>'oldValue','')),jsonb_build_object('value',coalesce(p_payload->>'newValue','')),jsonb_build_object('reason',coalesce(p_payload->>'reason',''),'device_id',p_device_id,'idempotency_key',p_idempotency_key),coalesce((p_payload->>'occurredAt')::timestamptz,server_now))
          on conflict(id) do nothing;
        current_version:=1;
    end case;
  end if;
  if p_entity_type<>'academic_audit' then
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json,metadata_json) values(p_school_id,actor,case when p_operation='delete' then 'sync_delete' else 'sync_upsert' end,p_entity_type,target_id,student_scope,p_payload,jsonb_build_object('device_id',p_device_id,'idempotency_key',p_idempotency_key,'client_entity_id',p_entity_id));
  end if;
  if journal then
    insert into public.sync_changes(school_id,entity_type,entity_id,operation,version) values(p_school_id,p_entity_type,target_id,p_operation,current_version) returning revision into new_revision;
  end if;
  update public.devices set last_seen_at=clock_timestamp(),last_successful_sync_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_device_id;
  result:=jsonb_build_object('idempotencyKey',p_idempotency_key,'entityId',target_id,'status','accepted','version',current_version,'revision',coalesce(new_revision,0));
  insert into public.sync_idempotency(school_id,device_id,idempotency_key,request_hash,response_json) values(p_school_id,p_device_id,p_idempotency_key,p_request_hash,result);
  return result;
end $$;

revoke all on function public.apply_sync_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) from public,anon;
grant execute on function public.apply_sync_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- What a device may pull
-- ---------------------------------------------------------------------------
create or replace function public.sync_change_visible(p_school_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_entity_type = 'student' then
    return exists(select 1 from public.students s where s.id = p_entity_id and s.school_id = p_school_id
      and (public.can_read_student(s.id) or public.student_can_read_classmate(s.id)));
  elsif p_entity_type = 'enrollment' then
    return exists(select 1 from public.student_class_enrollments e where e.id = p_entity_id and e.school_id = p_school_id
      and (public.can_read_student(e.student_id) or public.student_can_read_classmate(e.student_id)));
  elsif p_entity_type = 'assignment' then
    return exists(select 1 from public.assignments a where a.id = p_entity_id and a.school_id = p_school_id and (
      public.has_school_role(a.school_id, 'admin')
      or public.teacher_has_class_access(a.class_id)
      or exists(select 1 from public.student_class_enrollments e where e.class_id = a.class_id and e.status = 'active'
        and (public.student_owns_student_record(e.student_id) or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id))))
    ));
  elsif p_entity_type = 'submission' then
    return exists(select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id where s.id = p_entity_id
      and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'activity' then
    return exists(select 1 from public.activities a where a.id = p_entity_id and a.school_id = p_school_id and (
      public.has_school_role(a.school_id, 'admin') or public.teacher_has_class_access(a.class_id)
      or exists(select 1 from public.student_class_enrollments e where e.class_id = a.class_id and public.can_read_student(e.student_id))
    ));
  elsif p_entity_type = 'activity_score' then
    return exists(select 1 from public.activity_scores s join public.activities a on a.id = s.activity_id where s.id = p_entity_id
      and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'test' then
    return exists(select 1 from public.tests t where t.id = p_entity_id and t.school_id = p_school_id and (
      public.has_school_role(t.school_id, 'admin') or public.teacher_has_class_access(t.class_id)
      or exists(select 1 from public.student_class_enrollments e where e.class_id = t.class_id and public.can_read_student(e.student_id))
    ));
  elsif p_entity_type = 'test_score' then
    return exists(select 1 from public.test_scores s join public.tests t on t.id = s.test_id where s.id = p_entity_id
      and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(t.class_id)));
  elsif p_entity_type = 'attendance' then
    return exists(select 1 from public.attendance a where a.id = p_entity_id and a.school_id = p_school_id and (
      public.has_school_role(a.school_id, 'admin') or public.teacher_has_class_access(a.class_id) or public.can_read_student(a.student_id)
    ));
  elsif p_entity_type = 'timetable_entry' then
    return exists(select 1 from public.timetable_entries t where t.id = p_entity_id and t.school_id = p_school_id and (
      public.has_school_role(t.school_id, 'admin') or public.teacher_has_class_access(t.class_id)
      or exists(select 1 from public.student_class_enrollments e where e.class_id = t.class_id and public.can_read_student(e.student_id))
    ));
  elsif p_entity_type = 'achievement' then
    return exists(select 1 from public.student_achievements a where a.id = p_entity_id and a.school_id = p_school_id and public.can_read_student(a.student_id));
  elsif p_entity_type = 'score_event' then
    return exists(select 1 from public.score_events e where e.id = p_entity_id and e.school_id = p_school_id and public.can_read_student(e.student_id));
  elsif p_entity_type = 'setting' then
    return public.is_active_member(p_school_id);
  -- A marking scheme is the staff's; a student sees the marks it produced, not the scheme.
  elsif p_entity_type = 'rubric' then
    return exists(select 1 from public.rubrics r where r.id = p_entity_id and r.school_id = p_school_id
      and (public.has_school_role(r.school_id, 'admin') or public.has_school_role(r.school_id, 'teacher')));
  elsif p_entity_type = 'rubric_score' then
    return exists(select 1 from public.rubric_scores s join public.assignments a on a.id = s.assignment_id where s.id = p_entity_id
      and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'submission_version' then
    return exists(select 1 from public.submission_versions v join public.assignments a on a.id = v.assignment_id where v.id = p_entity_id
      and v.school_id = p_school_id and (public.can_read_student(v.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'deadline_extension' then
    return exists(select 1 from public.deadline_extensions x join public.assignments a on a.id = x.assignment_id where x.id = p_entity_id
      and x.school_id = p_school_id and (public.can_read_student(x.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'notification_preference' then
    return exists(select 1 from public.notification_settings n where n.id = p_entity_id and n.school_id = p_school_id
      and (n.profile_id = (select auth.uid()) or public.has_school_role(n.school_id, 'admin')));
  elsif p_entity_type = 'classroom_notification' then
    return exists(select 1 from public.classroom_notifications n where n.id = p_entity_id and n.school_id = p_school_id
      and (public.can_read_student(n.student_id) or public.teacher_has_class_access(n.class_id)));
  -- The audit trail is the administrator's; audit_log itself is only readable by admins.
  elsif p_entity_type = 'academic_audit' then
    return public.has_school_role(p_school_id, 'admin');
  end if;
  return false;
end;
$$;

revoke all on function public.sync_change_visible(uuid, text, uuid) from public, anon;
grant execute on function public.sync_change_visible(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Marking, by set rather than by sequence
-- ---------------------------------------------------------------------------
create or replace function public.submit_quiz_answer(
  p_session_id uuid, p_question_id uuid, p_selected jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  student public.students%rowtype;
  session public.quiz_sessions%rowtype;
  participant public.quiz_participants%rowtype;
  question public.quiz_questions%rowtype;
  existing public.quiz_answers%rowtype;
  deadline timestamptz;
  server_now timestamptz := clock_timestamp();
  elapsed_ms integer;
  correct boolean;
  awarded numeric := 0;
  speed_share numeric;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into session from public.quiz_sessions where id=p_session_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where profile_id=actor and school_id=session.school_id
    and deleted_at is null limit 1;
  if not found then raise exception 'QUIZ_NOT_FOR_YOU' using errcode='42501'; end if;
  select * into participant from public.quiz_participants
    where session_id=session.id and student_id=student.id for update;
  if not found then raise exception 'QUIZ_NOT_JOINED' using errcode='42501'; end if;

  select * into existing from public.quiz_answers
    where session_id=session.id and participant_id=participant.id and question_id=p_question_id;
  if found then
    return jsonb_build_object('recorded', true, 'alreadyAnswered', true,
      'isCorrect', existing.is_correct, 'awarded', existing.awarded);
  end if;

  select * into question from public.quiz_questions where id=p_question_id and session_id=session.id;
  if not found then raise exception 'NOT_FOUND: question'; end if;
  if question.position <> session.current_position then
    raise exception 'QUIZ_QUESTION_CLOSED' using errcode='42501';
  end if;
  if session.status <> 'running' then raise exception 'QUIZ_NOT_RUNNING' using errcode='42501'; end if;

  deadline := public.quiz_deadline(session);
  if deadline is not null and server_now > deadline then
    raise exception 'QUIZ_TIME_UP' using errcode='42501';
  end if;

  elapsed_ms := greatest(0, (extract(epoch from (server_now - session.question_started_at)) * 1000)::integer);
  -- The order the choices were tapped in is not part of the answer.
  correct := public.answer_matches(question.question_type, coalesce(p_selected, '[]'::jsonb), question.answer_key);

  if correct then
    awarded := question.points;
    if session.scoring_mode = 'speed' and session.timer_seconds is not null then
      -- Fraction of the window still unused, capped so speed can add a quarter at most.
      speed_share := greatest(0, 1 - (elapsed_ms::numeric / (session.timer_seconds * 1000)));
      awarded := awarded + round(question.points * speed_share * 0.25, 2);
    end if;
  end if;

  insert into public.quiz_answers(session_id, participant_id, question_id, selected, is_correct,
    response_ms, awarded)
    values(session.id, participant.id, question.id, coalesce(p_selected,'[]'::jsonb), correct,
      elapsed_ms, awarded);

  update public.quiz_participants set
    score = score + awarded,
    correct_count = correct_count + case when correct then 1 else 0 end,
    answered_count = answered_count + 1,
    last_seen_at = server_now
  where id = participant.id;

  return jsonb_build_object('recorded', true, 'alreadyAnswered', false,
    'isCorrect', correct, 'awarded', awarded, 'explanation', question.explanation);
end $$;

revoke all on function public.submit_quiz_answer(uuid,uuid,jsonb) from public,anon;
grant execute on function public.submit_quiz_answer(uuid,uuid,jsonb) to authenticated;

create or replace function public.submit_exam_attempt(
  p_attempt_id uuid, p_answers jsonb, p_final boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  attempt public.exam_attempts%rowtype;
  actor uuid := auth.uid();
  student public.students%rowtype;
  server_now timestamptz := now();
  expired boolean;
  earned numeric := 0;
  question record;
  given jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into attempt from public.exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into student from public.students where id=attempt.student_id;
  if student.profile_id is distinct from actor then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if attempt.submitted_at is not null then
    return jsonb_build_object('attemptId',attempt.id,'submittedAt',attempt.submitted_at,'alreadySubmitted',true);
  end if;

  expired := attempt.expires_at is not null and server_now > attempt.expires_at;

  update public.exam_attempts set
    answers = coalesce(p_answers,'{}'::jsonb),
    submitted_at = case when p_final or expired then server_now else null end,
    submitted_reason = case when expired then 'timeout' when p_final then 'student' else null end,
    updated_at = server_now
  where id=attempt.id returning * into attempt;

  -- Objective questions are marked here so a teacher starts from a total rather than from zero.
  -- A short answer with an accepted-answer list is objective too; only a question without a key
  -- is left for the teacher.
  if attempt.submitted_at is not null then
    for question in
      select id, question_type, answer_key, points from public.exam_questions where test_id=attempt.test_id
    loop
      given := attempt.answers -> question.id::text;
      if public.answer_matches(question.question_type, given, question.answer_key) then
        earned := earned + question.points;
      end if;
    end loop;
    update public.exam_attempts set auto_score=earned where id=attempt.id;
    insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
      values(attempt.school_id,actor,'EXAM_ATTEMPT_SUBMITTED','exam_attempt',attempt.id,attempt.student_id,
        jsonb_build_object('testId',attempt.test_id,'reason',attempt.submitted_reason,'autoScore',earned));
  end if;

  return jsonb_build_object('attemptId',attempt.id,'submittedAt',attempt.submitted_at,
    'reason',attempt.submitted_reason,'autoScore',case when attempt.submitted_at is null then null else earned end,
    'serverTime',server_now);
end $$;

revoke all on function public.submit_exam_attempt(uuid,jsonb,boolean) from public,anon;
grant execute on function public.submit_exam_attempt(uuid,jsonb,boolean) to authenticated;

comment on function public.apply_sync_mutation(uuid,uuid,text,text,text,uuid,public.sync_operation,jsonb,integer) is
  'The trusted mutation boundary. Twenty entity types; finds natural-key records by their key and reports the id it wrote.';

commit;
