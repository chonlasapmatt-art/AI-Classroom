-- Parents a school enters directly.
--
-- Until now a parent record could only appear when somebody redeemed a LINE invitation, which left
-- no way to prepare a guardian in advance or to give one an email account. This adds the missing
-- half: a school-entered parent identity plus its link to a student, written through a trusted
-- function so the client never touches the tables. Account activation still happens through the
-- existing member invitation, which links an Auth user to this parent record rather than making a
-- second one.

begin;

create or replace function public.upsert_parent(
  p_school_id uuid, p_parent_id uuid, p_display_name text, p_phone text,
  p_student_id uuid, p_relationship text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); link_id uuid; existing_profile uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'VALIDATION_ERROR: parent name is required'; end if;
  if not exists(select 1 from public.students where id=p_student_id and school_id=p_school_id and deleted_at is null) then
    raise exception 'VALIDATION_ERROR: unknown student';
  end if;

  select profile_id into existing_profile from public.parents where id=p_parent_id and school_id=p_school_id;
  insert into public.parents(id,school_id,profile_id,display_name,phone,status)
  values(p_parent_id,p_school_id,null,trim(p_display_name),nullif(trim(coalesce(p_phone,'')),''),'active')
  on conflict(id) do update set display_name=excluded.display_name,phone=excluded.phone,
    -- An account already linked to this parent is never unlinked by an edit to their details.
    profile_id=coalesce(public.parents.profile_id,existing_profile),
    updated_at=clock_timestamp();

  insert into public.parent_student_links(school_id,parent_id,student_id,relationship,status)
  values(p_school_id,p_parent_id,p_student_id,coalesce(nullif(trim(p_relationship),''),'ผู้ปกครอง'),'pending')
  on conflict(parent_id,student_id) do update set relationship=excluded.relationship,
    updated_at=clock_timestamp(),version=public.parent_student_links.version+1
  returning id into link_id;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
  values(p_school_id,actor,'parent_upsert','parent',p_parent_id,p_student_id,
    jsonb_build_object('displayName',p_display_name,'relationship',p_relationship,'linkId',link_id));
  return jsonb_build_object('parentId',p_parent_id,'linkId',link_id);
end $$;
revoke all on function public.upsert_parent(uuid,uuid,text,text,uuid,text) from public,anon;
grant execute on function public.upsert_parent(uuid,uuid,text,text,uuid,text) to authenticated;

-- The parent list a school works from. Reading it stays inside the same boundary the link policy
-- already draws: school staff for their students, a parent for their own record.
drop policy if exists parents_scoped_read on public.parents;
create policy parents_scoped_read on public.parents for select to authenticated using (
  public.has_school_role(school_id,'admin')
  or profile_id = auth.uid()
  or exists(select 1 from public.parent_student_links l
    join public.student_class_enrollments e on e.student_id = l.student_id and e.deleted_at is null
    where l.parent_id = parents.id and l.deleted_at is null and public.teacher_has_class_access(e.class_id))
);
grant select on public.parents to authenticated;

comment on function public.upsert_parent(uuid,uuid,text,text,uuid,text) is
  'School-entered guardian identity and student link; account activation stays with member invitations.';

commit;
