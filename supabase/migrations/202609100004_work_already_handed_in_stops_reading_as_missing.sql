begin;

/*
 * Work that was handed in before the turn-in path worked.
 *
 * Until `202609100001` the server refused every pupil's own write to their submission row, so a
 * child could attach the photograph of their worksheet — that path went through
 * `record_class_file` and always worked — and then press send into silence. The file is on the
 * server, owned by `${assignment}:${student}`, and the submission row beside it still says
 * `not_started` with no `submitted_at`: the teacher's screen reports the child as not having sent
 * anything, and after `3.5.0` it says so out loud as "ยังไม่ส่ง".
 *
 * There is no version of this the app can repair. The refused push is long gone from the queue on
 * whatever device made it, and no later sync will invent it. So the file is taken as the evidence
 * it is: the earliest one attached to a submission is when that work was handed in.
 *
 * ── What this does not do ──
 * It sets only the three fields a turn-in sets — when, the status, and whether it was late against
 * that assignment's own deadline — and it touches no mark, note or grade. Cancelled work is left
 * alone: nobody is waiting on it, and marking it handed in would put it back on a teacher's list.
 * The condition is also the description of the fault, so running it twice changes nothing: a row
 * with a `submitted_at` is no longer eligible.
 *
 * Each repaired row is journalled, because a row the server changed without telling anybody is the
 * fault this whole release is about.
 */
with picked as (
  select
    s.id,
    a.school_id,
    a.due_at,
    (
      select min(f.created_at)
      from public.class_files f
      where f.owner_type = 'submission'
        and f.owner_id = s.assignment_id || ':' || s.student_id
        and f.deleted_at is null
    ) as handed_in
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.submitted_at is null
    and s.deleted_at is null
    and a.status <> 'cancelled'
    and exists (
      select 1
      from public.class_files f
      where f.owner_type = 'submission'
        and f.owner_id = s.assignment_id || ':' || s.student_id
        and f.deleted_at is null
    )
), repaired as (
  update public.submissions s
  set submitted_at = p.handed_in,
      status = 'submitted',
      is_late = (p.due_at is not null and p.handed_in > p.due_at),
      updated_at = clock_timestamp(),
      server_updated_at = clock_timestamp(),
      version = s.version + 1
  from picked p
  where p.id = s.id
    and p.handed_in is not null
  returning s.id, p.school_id, s.version
)
select public.journal_sync_change(r.school_id, 'submission', r.id, 'upsert', r.version)
from repaired r;

commit;
