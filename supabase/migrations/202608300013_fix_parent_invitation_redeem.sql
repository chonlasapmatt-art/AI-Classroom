-- Remove the PL/pgSQL variable/column ambiguity in the LINE parent invitation flow.

begin;

create or replace function public.redeem_parent_invitation(
  p_invitation_id uuid,
  p_line_user_id text,
  p_display_name text,
  p_relationship text default 'ผู้ปกครอง'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  invitation public.parent_link_invitations%rowtype;
  v_parent_id uuid;
  v_link_id uuid;
begin
  select * into invitation
  from public.parent_link_invitations
  where id = p_invitation_id
  for update;

  if not found
     or invitation.used_at is not null
     or invitation.revoked_at is not null
     or invitation.expires_at <= now()
     or invitation.attempt_count >= invitation.max_attempts then
    raise exception 'INVITATION_INVALID' using errcode='22000';
  end if;

  select p.id into v_parent_id
  from public.parents as p
  where p.school_id = invitation.school_id
    and p.line_user_id = p_line_user_id
  limit 1;

  if v_parent_id is null then
    insert into public.parents(school_id,profile_id,display_name,line_user_id,line_linked_at)
    values(
      invitation.school_id,
      null,
      coalesce(nullif(p_display_name,''),'ผู้ปกครอง'),
      p_line_user_id,
      clock_timestamp()
    )
    returning id into v_parent_id;
  else
    update public.parents
    set line_linked_at=clock_timestamp(), updated_at=clock_timestamp()
    where id = v_parent_id;
  end if;

  insert into public.parent_student_links(
    school_id,parent_id,student_id,relationship,status,linked_at
  )
  values(
    invitation.school_id,
    v_parent_id,
    invitation.student_id,
    p_relationship,
    'linked',
    clock_timestamp()
  )
  on conflict(parent_id,student_id) do update
  set status='linked', linked_at=clock_timestamp(), revoked_at=null,
      updated_at=clock_timestamp(), version=public.parent_student_links.version+1
  returning id into v_link_id;

  update public.parent_link_invitations
  set used_at=clock_timestamp()
  where id=p_invitation_id;

  insert into public.audit_log(
    school_id,actor_profile_id,action,entity_type,entity_id,target_student_id,metadata_json
  )
  values(
    invitation.school_id,
    null,
    'parent_link_redeem',
    'parent_student_link',
    v_link_id,
    invitation.student_id,
    jsonb_build_object('channel','line')
  );

  return jsonb_build_object(
    'parentId',v_parent_id,
    'linkId',v_link_id,
    'studentId',invitation.student_id
  );
end $$;

revoke all on function public.redeem_parent_invitation(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.redeem_parent_invitation(uuid,text,text,text)
  to service_role;

commit;
