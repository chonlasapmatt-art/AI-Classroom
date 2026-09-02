-- Approving the same relationship twice wrote a second consent, and a third wrote a third.
--
-- `set_parent_link_state` inserted a fresh `consents` row on every approval and pointed the link at
-- it, so a staff member clicking twice — or a screen retrying — left the older rows behind with
-- nothing referring to them. Ten approvals in a probe produced ten consent records for one child.
-- A consent register that grows every time somebody clicks is not a register anybody can read, and
-- this is the one table whose job is to say what a school was permitted to share and when.
--
-- An approval now reuses the consent the link already carries, and reinstates it if it had been
-- withdrawn. A link with no consent still gets one, which is what makes approving work at all.

begin;

create or replace function public.set_parent_link_state(p_link_id uuid, p_state text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  link public.parent_student_links%rowtype;
  parent_owner boolean;
  staff boolean;
  policy_version text;
  new_consent uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_state not in ('approve','revoke','restore') then raise exception 'VALIDATION_ERROR'; end if;
  select * into link from public.parent_student_links where id=p_link_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select exists(select 1 from public.parents p where p.id=link.parent_id and p.profile_id=actor) into parent_owner;
  staff := public.can_operate_school(link.school_id);
  if not staff and not (parent_owner and p_state='revoke') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  if p_state='revoke' then
    update public.parent_student_links set status='revoked',revoked_at=clock_timestamp(),consent_id=null,
      updated_at=clock_timestamp(),version=version+1 where id=link.id returning * into link;
  else
    -- One consent per relationship. A link that already carries one is approved again with the same
    -- record, brought back if it had been withdrawn; only a link with none is given a new one.
    if link.consent_id is not null then
      new_consent := link.consent_id;
      update public.consents set revoked_at=null where id=new_consent and revoked_at is not null;
    else
      select coalesce(value_json->>'version','1.0') into policy_version from public.settings
        where school_id=link.school_id and scope_type='school' and key='privacy_policy' limit 1;
      insert into public.consents(school_id,parent_id,student_id,consent_type,policy_version)
        values(link.school_id,link.parent_id,link.student_id,'student_data_sharing',coalesce(policy_version,'1.0'))
        returning id into new_consent;
    end if;
    update public.parent_student_links set status='linked',revoked_at=null,consent_id=new_consent,
      linked_at=coalesce(linked_at,clock_timestamp()),updated_at=clock_timestamp(),version=version+1
      where id=link.id returning * into link;
    update public.school_memberships set status='active',active_until=null,updated_at=clock_timestamp()
      where school_id=link.school_id and role='parent'
        and profile_id=(select profile_id from public.parents where id=link.parent_id);
  end if;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,after_json)
    values(link.school_id,actor,
      case p_state when 'approve' then 'PARENT_LINK_APPROVED'
                   when 'restore' then 'PARENT_LINK_RESTORED'
                   else 'PARENT_LINK_REVOKED' end,
      'parent_student_link',link.id,link.student_id,
      jsonb_build_object('status',link.status,'byParent',parent_owner and not staff));
  return jsonb_build_object('linkId',link.id,'status',link.status);
end $$;

revoke all on function public.set_parent_link_state(uuid,text) from public,anon;
grant execute on function public.set_parent_link_state(uuid,text) to authenticated;

comment on function public.set_parent_link_state(uuid,text) is
  'Approve, revoke or restore one relationship. One consent record per relationship, reused.';

commit;
