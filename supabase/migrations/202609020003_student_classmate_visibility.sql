begin;

-- A student may read the small roster identity of classmates who share one of the student's
-- active rooms. This is deliberately separate from can_read_student: scores, submissions,
-- attendance and parent links must remain private to the owner/linked parent or teaching staff.
create or replace function public.student_can_read_classmate(target_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1
    from public.students target
    join public.student_class_enrollments target_enrollment
      on target_enrollment.student_id = target.id
     and target_enrollment.status = 'active'
     and target_enrollment.deleted_at is null
    join public.student_class_enrollments mine_enrollment
      on mine_enrollment.class_id = target_enrollment.class_id
     and mine_enrollment.status = 'active'
     and mine_enrollment.deleted_at is null
    where target.id = target_student
      and target.status = 'active'
      and target.deleted_at is null
      and public.student_owns_student_record(mine_enrollment.student_id)
  );
$$;

revoke all on function public.student_can_read_classmate(uuid) from public, anon;
grant execute on function public.student_can_read_classmate(uuid) to authenticated;

drop policy if exists students_scoped_read on public.students;
create policy students_scoped_read on public.students for select to authenticated using (
  public.can_read_student(id) or public.student_can_read_classmate(id)
);

drop policy if exists enrollments_scoped_read on public.student_class_enrollments;
create policy enrollments_scoped_read on public.student_class_enrollments for select to authenticated using (
  public.can_read_student(student_id) or public.student_can_read_classmate(student_id)
);

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
  end if;
  return false;
end;
$$;

revoke all on function public.sync_change_visible(uuid, text, uuid) from public, anon;
grant execute on function public.sync_change_visible(uuid, text, uuid) to authenticated;

commit;
