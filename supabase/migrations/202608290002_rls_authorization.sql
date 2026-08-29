begin;

create or replace function public.is_active_member(target_school uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.school_memberships m where m.school_id=target_school and m.profile_id=(select auth.uid()) and m.status='active' and m.active_from<=now() and (m.active_until is null or m.active_until>now()));
$$;
create or replace function public.has_school_role(target_school uuid, target_role public.membership_role)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.school_memberships m where m.school_id=target_school and m.profile_id=(select auth.uid()) and m.role=target_role and m.status='active' and m.active_from<=now() and (m.active_until is null or m.active_until>now()));
$$;
create or replace function public.teacher_has_class_access(target_class uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.class_teachers ct join public.teachers t on t.id=ct.teacher_id join public.school_memberships m on m.school_id=ct.school_id and m.profile_id=t.profile_id and m.role='teacher'
    where ct.class_id=target_class and t.profile_id=(select auth.uid()) and t.status='active' and t.deleted_at is null and m.status='active' and (ct.active_until is null or ct.active_until>now()));
$$;
create or replace function public.student_owns_student_record(target_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.students s where s.id=target_student and s.profile_id=(select auth.uid()) and s.status='active' and s.deleted_at is null);
$$;
create or replace function public.parent_has_active_link(target_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id where l.student_id=target_student and p.profile_id=(select auth.uid()) and l.status='active' and l.revoked_at is null and l.deleted_at is null);
$$;
create or replace function public.parent_has_active_consent(target_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id join public.consents c on c.id=l.consent_id where l.student_id=target_student and p.profile_id=(select auth.uid()) and l.status='active' and l.revoked_at is null and c.revoked_at is null);
$$;
create or replace function public.can_read_student(target_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.students s where s.id=target_student and (
    public.has_school_role(s.school_id,'admin') or public.student_owns_student_record(s.id) or
    (public.parent_has_active_link(s.id) and public.parent_has_active_consent(s.id)) or
    exists(select 1 from public.student_class_enrollments e where e.student_id=s.id and e.status='active' and e.deleted_at is null and public.teacher_has_class_access(e.class_id))));
$$;

revoke all on function public.is_active_member(uuid), public.has_school_role(uuid,public.membership_role), public.teacher_has_class_access(uuid), public.student_owns_student_record(uuid), public.parent_has_active_link(uuid), public.parent_has_active_consent(uuid), public.can_read_student(uuid) from public, anon;
grant execute on function public.is_active_member(uuid), public.has_school_role(uuid,public.membership_role), public.teacher_has_class_access(uuid), public.student_owns_student_record(uuid), public.parent_has_active_link(uuid), public.parent_has_active_consent(uuid), public.can_read_student(uuid) to authenticated;

alter table public.schools enable row level security;
alter table public.user_profiles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_terms enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students enable row level security;
alter table public.student_class_enrollments enable row level security;
alter table public.parents enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.parent_link_invitations enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.activities enable row level security;
alter table public.activity_scores enable row level security;
alter table public.tests enable row level security;
alter table public.test_scores enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;
alter table public.consents enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notifications_log enable row level security;
alter table public.devices enable row level security;
alter table public.sync_changes enable row level security;
alter table public.sync_idempotency enable row level security;
alter table public.audit_log enable row level security;
alter table public.sync_conflicts enable row level security;

create policy schools_member_read on public.schools for select to authenticated using (public.is_active_member(id));
create policy profiles_self_read on public.user_profiles for select to authenticated using (id=(select auth.uid()) or exists(select 1 from public.school_memberships mine join public.school_memberships theirs on theirs.school_id=mine.school_id where mine.profile_id=(select auth.uid()) and mine.status='active' and theirs.profile_id=user_profiles.id));
create policy memberships_self_or_admin_read on public.school_memberships for select to authenticated using (profile_id=(select auth.uid()) or public.has_school_role(school_id,'admin'));
create policy terms_member_read on public.academic_terms for select to authenticated using (public.is_active_member(school_id));
create policy teachers_member_read on public.teachers for select to authenticated using (public.is_active_member(school_id));
create policy classes_scoped_read on public.classes for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(id) or exists(select 1 from public.student_class_enrollments e where e.class_id=classes.id and public.student_owns_student_record(e.student_id)) or exists(select 1 from public.student_class_enrollments e where e.class_id=classes.id and public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id)));
create policy class_teachers_scoped_read on public.class_teachers for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(class_id));
create policy students_scoped_read on public.students for select to authenticated using (public.can_read_student(id));
create policy enrollments_scoped_read on public.student_class_enrollments for select to authenticated using (public.can_read_student(student_id));
create policy parents_self_or_admin_read on public.parents for select to authenticated using (profile_id=(select auth.uid()) or public.has_school_role(school_id,'admin'));
create policy parent_links_scoped_read on public.parent_student_links for select to authenticated using (public.has_school_role(school_id,'admin') or public.parent_has_active_link(student_id) or exists(select 1 from public.student_class_enrollments e where e.student_id=parent_student_links.student_id and public.teacher_has_class_access(e.class_id)));
create policy invitations_teacher_read on public.parent_link_invitations for select to authenticated using (public.has_school_role(school_id,'admin') or exists(select 1 from public.student_class_enrollments e where e.student_id=parent_link_invitations.student_id and public.teacher_has_class_access(e.class_id)));
create policy assignments_scoped_read on public.assignments for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id=assignments.class_id and (public.student_owns_student_record(e.student_id) or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id)))));
create policy submissions_scoped_read on public.submissions for select to authenticated using (public.has_school_role(school_id,'admin') or public.can_read_student(student_id) or exists(select 1 from public.assignments a where a.id=submissions.assignment_id and public.teacher_has_class_access(a.class_id)));
create policy activities_scoped_read on public.activities for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id=activities.class_id and public.can_read_student(e.student_id)));
create policy activity_scores_scoped_read on public.activity_scores for select to authenticated using (public.has_school_role(school_id,'admin') or public.can_read_student(student_id) or exists(select 1 from public.activities a where a.id=activity_scores.activity_id and public.teacher_has_class_access(a.class_id)));
create policy tests_scoped_read on public.tests for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id=tests.class_id and public.can_read_student(e.student_id)));
create policy test_scores_scoped_read on public.test_scores for select to authenticated using (public.has_school_role(school_id,'admin') or public.can_read_student(student_id) or exists(select 1 from public.tests t where t.id=test_scores.test_id and public.teacher_has_class_access(t.class_id)));
create policy attendance_scoped_read on public.attendance for select to authenticated using (public.has_school_role(school_id,'admin') or public.teacher_has_class_access(class_id) or public.can_read_student(student_id));
create policy settings_member_read on public.settings for select to authenticated using (public.is_active_member(school_id));
create policy consents_parent_or_admin_read on public.consents for select to authenticated using (public.has_school_role(school_id,'admin') or exists(select 1 from public.parents p where p.id=consents.parent_id and p.profile_id=(select auth.uid())));
create policy preferences_owner_read on public.notification_preferences for select to authenticated using (public.has_school_role(school_id,'admin') or exists(select 1 from public.parents p where p.id=notification_preferences.parent_id and p.profile_id=(select auth.uid())));
create policy devices_admin_or_own_school_read on public.devices for select to authenticated using (public.has_school_role(school_id,'admin') or public.has_school_role(school_id,'teacher'));
create policy sync_changes_member_read on public.sync_changes for select to authenticated using (public.is_active_member(school_id));
create policy conflicts_admin_teacher_read on public.sync_conflicts for select to authenticated using (public.has_school_role(school_id,'admin') or public.has_school_role(school_id,'teacher'));
create policy audit_admin_read on public.audit_log for select to authenticated using (public.has_school_role(school_id,'admin'));

grant select on public.audit_log, public.sync_conflicts, public.sync_changes, public.devices to authenticated;

commit;
