-- A subject an administrator can take off the list.
--
-- Until now the only way out of the catalogue was `archive_subject`, which flips the status and
-- leaves the card in place wearing "เก็บถาวร". That is the right move for a subject the school
-- taught last year and has records for. It is the wrong move for the subject somebody created by
-- mistake five minutes ago, which cannot be got rid of at all — and a catalogue nobody can remove
-- from is a catalogue that fills with typos.
--
-- What this refuses to do is more important than what it does. A subject that carries academic
-- records — work set, activities run, tests taken, marks awarded, registers marked against it, exam
-- material written for it — is the label on those records, and deleting it would leave a child's
-- marks attached to a name nobody can read. Those rows are counted first and the delete is refused
-- with the count, so the answer is "archive it" rather than a silent partial removal.
--
-- What it does clear is configuration: the staff assignment that says who teaches it, and the
-- periods on the timetable that name it. Neither is a record of anything that happened; both are
-- statements about a subject that is about to stop existing, and leaving them behind would leave
-- the timetable showing lessons in a subject that is gone. The periods are soft-deleted through the
-- same `deleted_at` every other sync entity uses, so they travel to every device the ordinary way
-- and remain in the audit trail.

begin;

create or replace function public.delete_subject(p_school_id uuid, p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  academic_records integer;
  cleared_slots integer;
  cleared_links integer;
  current_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  -- Everything that would be orphaned by the delete rather than merely re-pointed by it.
  select
    (select count(*) from public.assignments where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null)
    + (select count(*) from public.activities where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null)
    + (select count(*) from public.tests where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null)
    + (select count(*) from public.score_events where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null)
    + (select count(*) from public.attendance where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null)
    into academic_records;
  if academic_records > 0 then
    raise exception 'VALIDATION_ERROR: subject has % academic records', academic_records;
  end if;

  update public.timetable_entries
    set deleted_at=clock_timestamp(), status='inactive', updated_at=clock_timestamp(),
        server_updated_at=clock_timestamp(), version=version+1
    where subject_id=p_subject_id and school_id=p_school_id and deleted_at is null;
  get diagnostics cleared_slots = row_count;

  delete from public.class_teachers where subject_id=p_subject_id and school_id=p_school_id;
  get diagnostics cleared_links = row_count;

  update public.subjects
    set status='inactive', deleted_at=clock_timestamp(), updated_at=clock_timestamp(), version=version+1
    where id=p_subject_id and school_id=p_school_id
    returning version into current_version;
  if current_version is null then raise exception 'NOT_FOUND'; end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,metadata_json)
  values(p_school_id,actor,'subject_delete','subject',p_subject_id,
    jsonb_build_object('timetable_slots_cleared',cleared_slots,'teacher_links_cleared',cleared_links));

  return jsonb_build_object('entityId',p_subject_id,'version',current_version,
    'timetableSlotsCleared',cleared_slots,'teacherLinksCleared',cleared_links);
end $$;

revoke all on function public.delete_subject(uuid,uuid) from public,anon;
grant execute on function public.delete_subject(uuid,uuid) to authenticated;

comment on function public.delete_subject(uuid,uuid) is
  'Removes a subject that carries no academic records, clearing its timetable periods and staff links. Refuses otherwise; archive_subject is the move for a subject with history.';

commit;
