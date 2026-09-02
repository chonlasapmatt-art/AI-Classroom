-- Sync failed for everybody, on every device, because two row level security policies each ask the
-- other table a question.
--
--   `parents_scoped_read`      reads `parent_student_links` to find the staff who may see a guardian
--   `parent_links_scoped_read` reads `parents` to find the guardian who owns a link
--
-- Each subquery is itself subject to the other table's policy, so Postgres walks into the cycle and
-- refuses: `42P17 infinite recursion detected in policy for relation "parents"`. It only bites when
-- one statement touches both tables, which is exactly what the sync pull does — it reads the links
-- with the guardian embedded — so `pullParentLinks` threw, `pullStructure` threw with it, and every
-- background sync in the product ended in the error state. Nothing was lost: the queue is durable
-- and kept the work. It simply never left the device.
--
-- The schema already had the answer everywhere else. Cross-table authority questions are asked
-- through `security definer` helpers — `teacher_has_class_access`, `parent_has_active_link`,
-- `can_read_student` — which run with the owner's rights and therefore do not re-enter RLS. These
-- two policies were the ones written with inline subqueries instead. They now ask the same questions
-- the same way, so the boundary is unchanged and the cycle is gone.

begin;

/**
 * Is this account the guardian behind this parent record?
 *
 * Definer rights, because the caller is being asked *whether* they may read the row — evaluating
 * that question under the reader's own policy is what closed the loop.
 */
create or replace function public.profile_owns_parent(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.parents p
    where p.id = p_parent_id and p.profile_id = (select auth.uid())
  );
$$;

/** Does the caller teach a class holding a child this guardian is linked to? */
create or replace function public.staff_can_read_parent(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.parent_student_links l
    join public.student_class_enrollments e on e.student_id = l.student_id and e.deleted_at is null
    where l.parent_id = p_parent_id and l.deleted_at is null
      and public.teacher_has_class_access(e.class_id)
  );
$$;

/** Does the caller teach a class holding this child? */
create or replace function public.staff_can_read_student_links(p_student_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.student_class_enrollments e
    where e.student_id = p_student_id and public.teacher_has_class_access(e.class_id)
  );
$$;

-- Same boundary as before, asked without re-entering the other table's policy.
drop policy if exists parents_scoped_read on public.parents;
create policy parents_scoped_read on public.parents for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or profile_id = (select auth.uid())
  or public.staff_can_read_parent(id)
);

drop policy if exists parent_links_scoped_read on public.parent_student_links;
create policy parent_links_scoped_read on public.parent_student_links for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or public.parent_has_active_link(student_id)
  or public.profile_owns_parent(parent_id)
  or public.staff_can_read_student_links(student_id)
);

revoke all on function public.profile_owns_parent(uuid) from public,anon;
revoke all on function public.staff_can_read_parent(uuid) from public,anon;
revoke all on function public.staff_can_read_student_links(uuid) from public,anon;
grant execute on function public.profile_owns_parent(uuid) to authenticated;
grant execute on function public.staff_can_read_parent(uuid) to authenticated;
grant execute on function public.staff_can_read_student_links(uuid) to authenticated;

comment on function public.staff_can_read_parent(uuid) is
  'Definer-rights authority test used by parents_scoped_read. Inlining this as a subquery recurses against parent_student_links.';

commit;
