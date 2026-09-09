-- Every tenant table can find its own school.
--
-- The database is one Postgres holding every school, and almost every query starts with
-- "where school_id = ...". Twenty-two tables had no index leading with that column, so those
-- queries were sequential scans over every school's rows. At three pilot schools and a few thousand
-- rows nothing notices. At two hundred schools it is the whole difference between a query that
-- touches one school and a query that touches all of them, and it degrades for every school at once
-- rather than for the one that grew.
--
-- These are added now, while the tables are small enough that building an index is instant and a
-- mistake costs nothing. A leading `school_id` is the general shape; where a second column is
-- obviously part of the same question -- a room's roster, an assignment's submissions, a child's
-- notifications -- the pair is indexed together so the index answers the whole predicate.
--
-- Retention comes with them: `audit_log` grew 7,529 rows in ten days from three small schools, which
-- is the one table whose size is a function of activity rather than of enrolment.

-- ── The rows that grow with the school ────────────────────────────────────────────────────────
create index if not exists idx_submissions_school_assignment on public.submissions (school_id, assignment_id);
create index if not exists idx_submission_versions_school_assignment on public.submission_versions (school_id, assignment_id);
create index if not exists idx_enrollments_school_class on public.student_class_enrollments (school_id, class_id);
create index if not exists idx_enrollments_school_student on public.student_class_enrollments (school_id, student_id);
create index if not exists idx_activity_scores_school_activity on public.activity_scores (school_id, activity_id);
create index if not exists idx_test_scores_school_test on public.test_scores (school_id, test_id);
create index if not exists idx_rubric_scores_school_assignment on public.rubric_scores (school_id, assignment_id);
create index if not exists idx_rubrics_school on public.rubrics (school_id);
create index if not exists idx_deadline_extensions_school_assignment on public.deadline_extensions (school_id, assignment_id);
create index if not exists idx_notifications_log_school_student on public.notifications_log (school_id, student_id);
create index if not exists idx_parent_student_links_school_student on public.parent_student_links (school_id, student_id);
create index if not exists idx_parent_link_invitations_school on public.parent_link_invitations (school_id);
create index if not exists idx_exam_questions_school on public.exam_questions (school_id);
create index if not exists idx_quiz_participants_school on public.quiz_participants (school_id);

-- The newest announcement of a school is read on every dashboard, so the order is in the index.
create index if not exists idx_announcements_school_created on public.announcements (school_id, created_at desc);

-- ── The rows that grow with use rather than with enrolment ────────────────────────────────────
create index if not exists idx_devices_school on public.devices (school_id);
create index if not exists idx_consents_school on public.consents (school_id);
create index if not exists idx_feature_flags_school on public.feature_flags (school_id);
create index if not exists idx_member_login_identities_school on public.member_login_identities (school_id);
create index if not exists idx_member_account_events_school_time on public.member_account_events (school_id, occurred_at desc);
create index if not exists idx_school_member_invitations_school on public.school_member_invitations (school_id);
create index if not exists idx_product_activation_keys_school on public.product_activation_keys (school_id);
create index if not exists idx_student_access_attempts_school_time on public.student_access_attempts (school_id, attempted_at desc);

-- Pruning reads by age, so the age is indexed.
create index if not exists idx_audit_log_occurred on public.audit_log (occurred_at);
create index if not exists idx_sync_changes_changed on public.sync_changes (changed_at);
create index if not exists idx_sync_idempotency_processed on public.sync_idempotency (processed_at);

/*
 * What the operational tables keep.
 *
 * Four tables record activity rather than school data, and none of them is read after the window it
 * is useful in:
 *
 *   * `sync_idempotency` answers "have I already applied this mutation?", which only matters while a
 *     device might retry -- hours, not months;
 *   * `sync_changes` is the journal devices pull from, and a device that has been offline longer
 *     than the window rebuilds from the structural mirror instead;
 *   * `student_access_attempts` is the rate limiter's memory, and its longest window is fifteen
 *     minutes;
 *   * `audit_log` is the one with a real reason to be kept, so it keeps a school year.
 *
 * Nothing here touches a row that belongs to a school's records -- no student, no mark, no register.
 * The defaults are generous on purpose: a caller may ask for a shorter window, never a longer one
 * than the table's own floor.
 */
create or replace function public.prune_operational_logs(
  p_audit_days integer default 400,
  p_journal_days integer default 90,
  p_idempotency_days integer default 7,
  p_access_attempt_days integer default 30
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare removed jsonb := '{}'::jsonb; n bigint;
begin
  delete from public.sync_idempotency where processed_at < now() - make_interval(days => greatest(p_idempotency_days, 2));
  get diagnostics n = row_count; removed := removed || jsonb_build_object('sync_idempotency', n);

  delete from public.student_access_attempts where attempted_at < now() - make_interval(days => greatest(p_access_attempt_days, 1));
  get diagnostics n = row_count; removed := removed || jsonb_build_object('student_access_attempts', n);

  /*
   * The journal keeps whatever the furthest-behind device still needs.
   *
   * Deleting a revision a device has not pulled would leave that device believing it is up to date
   * while missing the change, which is worse than the row it saves. So the cut is the oldest
   * watermark any registered device holds, and the age limit only applies below that.
   */
  delete from public.sync_changes c
  where c.changed_at < now() - make_interval(days => greatest(p_journal_days, 14))
    and c.revision < coalesce((
      select min(d.last_ack_revision) from public.devices d
      where d.school_id = c.school_id and d.status = 'active' and d.revoked_at is null
    ), c.revision + 1);
  get diagnostics n = row_count; removed := removed || jsonb_build_object('sync_changes', n);

  delete from public.audit_log where occurred_at < now() - make_interval(days => greatest(p_audit_days, 90));
  get diagnostics n = row_count; removed := removed || jsonb_build_object('audit_log', n);

  return removed;
end $fn$;

-- Housekeeping is the platform's, not a school's: no device or member calls this.
revoke all on function public.prune_operational_logs(integer, integer, integer, integer) from public;
revoke all on function public.prune_operational_logs(integer, integer, integer, integer) from anon;
revoke all on function public.prune_operational_logs(integer, integer, integer, integer) from authenticated;

/*
 * And something that runs it.
 *
 * A retention function nobody calls is a comment. pg_cron is enabled and the prune runs nightly at
 * 03:20, which is after the school day everywhere this is deployed and before anybody opens the app
 * in the morning. `cron.schedule` is upsert-like on the job name, so re-running this migration
 * re-points the same job rather than making a second one.
 */
create extension if not exists pg_cron;

do $schedule$
begin
  perform cron.unschedule('prune-operational-logs')
  where exists(select 1 from cron.job where jobname = 'prune-operational-logs');
  perform cron.schedule('prune-operational-logs', '20 3 * * *', 'select public.prune_operational_logs()');
exception when undefined_table or insufficient_privilege then
  -- A local or self-hosted database without pg_cron still gets the function; only the schedule is
  -- skipped, and the platform can call it on whatever timer it already has.
  raise notice 'pg_cron unavailable; prune_operational_logs must be scheduled elsewhere';
end $schedule$;
