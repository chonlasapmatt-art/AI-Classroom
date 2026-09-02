begin;

-- Room membership is the boundary for every school-facing read. The original policies allowed all
-- terms and all teachers to every member, which made a stale local projection look broader than the
-- classroom the signed-in person actually belonged to.
drop policy if exists terms_member_read on public.academic_terms;
create policy terms_member_read on public.academic_terms for select to authenticated using (
  public.has_school_role(school_id, 'admin')
  or exists(
    select 1 from public.classes c
    where c.academic_term_id = academic_terms.id
      and (
        public.teacher_has_class_access(c.id)
        or exists(
          select 1 from public.student_class_enrollments e
          where e.class_id = c.id
            and e.status = 'active'
            and (public.student_owns_student_record(e.student_id)
              or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id)))
        )
      )
  )
);

drop policy if exists teachers_member_read on public.teachers;
create policy teachers_member_read on public.teachers for select to authenticated using (
  public.has_school_role(school_id, 'admin')
  or profile_id = (select auth.uid())
  or exists(
    select 1 from public.class_teachers ct
    where ct.teacher_id = teachers.id
      and public.teacher_has_class_access(ct.class_id)
  )
  or exists(
    select 1
    from public.class_teachers ct
    join public.student_class_enrollments e on e.class_id = ct.class_id
    where ct.teacher_id = teachers.id
      and e.status = 'active'
      and (public.student_owns_student_record(e.student_id)
        or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id)))
  )
);

drop policy if exists class_teachers_scoped_read on public.class_teachers;
create policy class_teachers_scoped_read on public.class_teachers for select to authenticated using (
  public.has_school_role(school_id, 'admin')
  or public.teacher_has_class_access(class_id)
  or exists(
    select 1 from public.student_class_enrollments e
    where e.class_id = class_teachers.class_id
      and e.status = 'active'
      and (public.student_owns_student_record(e.student_id)
        or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id)))
  )
);

-- sync_pull is security-definer, so its journal query must apply the same visibility boundary as the
-- normal table policies. Otherwise a member could enumerate another room's entity ids/revisions.
create or replace function public.sync_change_visible(p_school_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_entity_type = 'student' then
    return exists(select 1 from public.students s where s.id = p_entity_id and s.school_id = p_school_id and public.can_read_student(s.id));
  elsif p_entity_type = 'enrollment' then
    return exists(select 1 from public.student_class_enrollments e where e.id = p_entity_id and e.school_id = p_school_id and public.can_read_student(e.student_id));
  elsif p_entity_type = 'assignment' then
    return exists(select 1 from public.assignments a where a.id = p_entity_id and a.school_id = p_school_id and (
      public.has_school_role(a.school_id, 'admin')
      or public.teacher_has_class_access(a.class_id)
      or exists(select 1 from public.student_class_enrollments e where e.class_id = a.class_id and e.status = 'active' and (public.student_owns_student_record(e.student_id) or (public.parent_has_active_link(e.student_id) and public.parent_has_active_consent(e.student_id))))
    ));
  elsif p_entity_type = 'submission' then
    return exists(select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id where s.id = p_entity_id and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'activity' then
    return exists(select 1 from public.activities a where a.id = p_entity_id and a.school_id = p_school_id and (public.has_school_role(a.school_id, 'admin') or public.teacher_has_class_access(a.class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id = a.class_id and public.can_read_student(e.student_id))));
  elsif p_entity_type = 'activity_score' then
    return exists(select 1 from public.activity_scores s join public.activities a on a.id = s.activity_id where s.id = p_entity_id and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(a.class_id)));
  elsif p_entity_type = 'test' then
    return exists(select 1 from public.tests t where t.id = p_entity_id and t.school_id = p_school_id and (public.has_school_role(t.school_id, 'admin') or public.teacher_has_class_access(t.class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id = t.class_id and public.can_read_student(e.student_id))));
  elsif p_entity_type = 'test_score' then
    return exists(select 1 from public.test_scores s join public.tests t on t.id = s.test_id where s.id = p_entity_id and s.school_id = p_school_id and (public.can_read_student(s.student_id) or public.teacher_has_class_access(t.class_id)));
  elsif p_entity_type = 'attendance' then
    return exists(select 1 from public.attendance a where a.id = p_entity_id and a.school_id = p_school_id and (public.has_school_role(a.school_id, 'admin') or public.teacher_has_class_access(a.class_id) or public.can_read_student(a.student_id)));
  elsif p_entity_type = 'timetable_entry' then
    return exists(select 1 from public.timetable_entries t where t.id = p_entity_id and t.school_id = p_school_id and (public.has_school_role(t.school_id, 'admin') or public.teacher_has_class_access(t.class_id) or exists(select 1 from public.student_class_enrollments e where e.class_id = t.class_id and public.can_read_student(e.student_id))));
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

create or replace function public.sync_pull(p_school_id uuid, p_after_revision bigint, p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; next_revision bigint;
begin
  if not public.is_active_member(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'VALIDATION_ERROR'; end if;
  select coalesce(max(revision), p_after_revision) into next_revision
  from (select revision from public.sync_changes where school_id = p_school_id and revision > p_after_revision order by revision limit p_limit) q;
  select jsonb_build_object(
    'changes', coalesce(jsonb_agg(jsonb_build_object('revision', c.revision, 'entityType', c.entity_type, 'entityId', c.entity_id, 'operation', c.operation, 'version', c.version) order by c.revision), '[]'::jsonb),
    'nextRevision', next_revision, 'serverTime', clock_timestamp(), 'minimumSupportedProtocol', 1
  ) into result
  from public.sync_changes c
  where c.school_id = p_school_id and c.revision > p_after_revision and c.revision <= next_revision
    and public.sync_change_visible(c.school_id, c.entity_type, c.entity_id);
  return result;
end;
$$;
revoke all on function public.sync_pull(uuid,bigint,integer) from public,anon;
grant execute on function public.sync_pull(uuid,bigint,integer) to authenticated;

commit;
