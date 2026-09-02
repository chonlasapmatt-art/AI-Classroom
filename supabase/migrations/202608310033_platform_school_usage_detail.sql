begin;

-- Adds operational room and teacher usage to the existing privacy-safe school detail response.
-- This is aggregate/roster metadata only; marks, submissions and parent contact details stay out of
-- the Operations Center and still require an explicit Support Mode inside the school app.
create or replace function public.platform_school_detail(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare school public.schools%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into school from public.schools where id=p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'schoolId', school.id, 'name', school.name, 'code', school.code, 'status', school.status,
    'timezone', school.timezone, 'createdAt', school.created_at,
    'health', public.school_health(school.id),
    'counts', jsonb_build_object(
      'teachers', (select count(*) from public.teachers where school_id=school.id and deleted_at is null),
      'students', (select count(*) from public.students where school_id=school.id and deleted_at is null),
      'parents', (select count(*) from public.parents where school_id=school.id),
      'classes', (select count(*) from public.classes where school_id=school.id and deleted_at is null),
      'subjects', (select count(*) from public.subjects where school_id=school.id and deleted_at is null),
      'assignments', (select count(*) from public.assignments where school_id=school.id and deleted_at is null),
      'questions', (select count(*) from public.question_bank where school_id=school.id and deleted_at is null),
      'exams', (select count(*) from public.tests where school_id=school.id and deleted_at is null),
      'admins', (select count(*) from public.school_memberships where school_id=school.id and role='admin' and status='active')
    ),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'roomId', c.id, 'name', c.name, 'gradeLevel', c.grade_level, 'status', c.status,
        'academicYear', term.academic_year, 'term', term.term,
        'teacherCount', (select count(*) from public.class_teachers ct
                         where ct.class_id=c.id and ct.active_from<=now()
                           and (ct.active_until is null or ct.active_until>now())),
        'studentCount', (select count(*) from public.student_class_enrollments e
                         where e.class_id=c.id and e.status='active' and e.deleted_at is null),
        'assignmentCount', (select count(*) from public.assignments a
                            where a.class_id=c.id and a.deleted_at is null),
        'lastActivityAt', nullif(greatest(
          coalesce((select max(a.updated_at) from public.assignments a where a.class_id=c.id and a.deleted_at is null), '-infinity'::timestamptz),
          coalesce((select max(at.updated_at) from public.attendance at where at.class_id=c.id), '-infinity'::timestamptz),
          coalesce((select max(s.updated_at) from public.submissions s join public.assignments a2 on a2.id=s.assignment_id
                    where a2.class_id=c.id), '-infinity'::timestamptz)
        ), '-infinity'::timestamptz),
        'teachers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'teacherId', t.id, 'displayName', t.display_name, 'teacherCode', t.teacher_code,
            'role', ct.role_in_class, 'profileId', t.profile_id
          ) order by t.display_name)
          from public.class_teachers ct
          join public.teachers t on t.id=ct.teacher_id and t.deleted_at is null
          where ct.class_id=c.id and ct.active_from<=now()
            and (ct.active_until is null or ct.active_until>now())
        ), '[]'::jsonb)
      ) order by c.grade_level, c.name)
      from public.classes c
      join public.academic_terms term on term.id=c.academic_term_id
      where c.school_id=school.id and c.deleted_at is null
    ), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'teacherId', t.id, 'displayName', t.display_name, 'teacherCode', t.teacher_code,
        'profileId', t.profile_id,
        'accountStatus', case when t.profile_id is null then 'not_provisioned'
                              when i.profile_id is null then 'linked_no_login_identity' else 'active' end,
        'lastLoginAt', i.last_login_at,
        'roomCount', (select count(*) from public.class_teachers ct
                      where ct.teacher_id=t.id and ct.active_from<=now()
                        and (ct.active_until is null or ct.active_until>now())),
        'rooms', coalesce((
          select jsonb_agg(jsonb_build_object(
            'roomId', c.id, 'name', c.name, 'gradeLevel', c.grade_level, 'role', ct.role_in_class
          ) order by c.grade_level, c.name)
          from public.class_teachers ct
          join public.classes c on c.id=ct.class_id and c.deleted_at is null
          where ct.teacher_id=t.id and ct.active_from<=now()
            and (ct.active_until is null or ct.active_until>now())
        ), '[]'::jsonb)
      ) order by t.display_name)
      from public.teachers t
      left join public.member_login_identities i on i.profile_id=t.profile_id and i.role='teacher' and i.status='active'
      where t.school_id=school.id and t.deleted_at is null
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('deviceId', d.id, 'name', d.device_name, 'type', d.device_type,
        'lastSeenAt', d.last_seen_at, 'lastSyncAt', d.last_successful_sync_at,
        'clientVersion', d.client_version, 'protocolVersion', d.protocol_version,
        'trusted', d.trusted, 'revokedAt', d.revoked_at) order by d.last_seen_at desc nulls last)
      from public.devices d where d.school_id=school.id
    ), '[]'::jsonb),
    'recentErrors', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'severity', e.severity, 'feature', e.feature,
        'code', e.code, 'message', e.message, 'occurredAt', e.occurred_at, 'resolvedAt', e.resolved_at)
        order by e.occurred_at desc)
      from (select * from public.platform_error_events where school_id=school.id
            order by occurred_at desc limit 25) e
    ), '[]'::jsonb),
    'recentAudit', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'entityType', a.entity_type,
        'occurredAt', a.occurred_at, 'supportSessionId', a.support_session_id) order by a.occurred_at desc)
      from (select * from public.audit_log where school_id=school.id
            order by occurred_at desc limit 50) a
    ), '[]'::jsonb),
    'supportSessions', coalesce((
      select jsonb_agg(jsonb_build_object('sessionId', s.id, 'reason', s.reason, 'startedAt', s.started_at,
        'expiresAt', s.expires_at, 'endedAt', s.ended_at, 'actionsRecorded', s.actions_recorded)
        order by s.started_at desc)
      from (select * from public.support_sessions where school_id=school.id
            order by started_at desc limit 20) s
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.platform_school_detail(uuid) from public,anon;
grant execute on function public.platform_school_detail(uuid) to authenticated;

commit;
