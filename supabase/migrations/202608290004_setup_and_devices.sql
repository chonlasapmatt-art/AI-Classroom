begin;

create or replace function public.bootstrap_school(p_school_name text,p_school_code text,p_academic_year text,p_term text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); school uuid:=gen_random_uuid(); profile_name text; term_id uuid:=gen_random_uuid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if exists(select 1 from public.school_memberships where profile_id=actor) then raise exception 'ALREADY_HAS_MEMBERSHIP'; end if;
  if char_length(trim(p_school_name))<2 or upper(p_school_code)!~'^[A-Z0-9-]{3,20}$' or char_length(trim(p_academic_year))<2 or char_length(trim(p_term))<1 then raise exception 'VALIDATION_ERROR'; end if;
  select coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1),'ผู้ดูแลระบบ') into profile_name from auth.users where id=actor;
  insert into public.user_profiles(id,display_name) values(actor,profile_name) on conflict(id) do nothing;
  insert into public.schools(id,name,code) values(school,trim(p_school_name),upper(p_school_code));
  insert into public.school_memberships(school_id,profile_id,role,status) values(school,actor,'admin','active');
  insert into public.academic_terms(id,school_id,academic_year,term,starts_on,ends_on,status) values(term_id,school,trim(p_academic_year),trim(p_term),current_date,current_date+interval '180 days','active');
  insert into public.settings(school_id,scope_type,key,value_json) values
    (school,'school','score_policy','{"weights":{"assignment":60,"activity":30,"test":10},"passingScore":60,"latePenaltyPercent":10,"missingItem":"zero"}'::jsonb),
    (school,'school','privacy_policy','{"version":"1.0","status":"draft"}'::jsonb),
    (school,'school','consent_policy','{"version":"1.0","status":"draft"}'::jsonb);
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(school,actor,'school_bootstrap','school',school,jsonb_build_object('name',trim(p_school_name),'code',upper(p_school_code)));
  return school;
end $$;
revoke all on function public.bootstrap_school(text,text,text,text) from public,anon;
grant execute on function public.bootstrap_school(text,text,text,text) to authenticated;

create or replace function public.register_device(p_school_id uuid,p_device_id uuid,p_device_name text,p_device_type text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_active_member(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_device_type not in ('board','desktop','tablet','mobile') then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.devices(id,school_id,device_name,device_type,status,last_seen_at) values(p_device_id,p_school_id,left(trim(p_device_name),120),p_device_type,'active',clock_timestamp())
  on conflict(id) do update set device_name=excluded.device_name,device_type=excluded.device_type,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
  where public.devices.school_id=p_school_id and public.devices.revoked_at is null;
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json) values(p_school_id,auth.uid(),'device_register','device',p_device_id,jsonb_build_object('name',p_device_name,'type',p_device_type));
  return p_device_id;
end $$;
revoke all on function public.register_device(uuid,uuid,text,text) from public,anon;
grant execute on function public.register_device(uuid,uuid,text,text) to authenticated;

create or replace function public.store_parent_invitation(p_school_id uuid,p_student_id uuid,p_code_hash text,p_expires_at timestamptz,p_max_attempts integer default 5)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare invite_id uuid:=gen_random_uuid();
begin
  if p_expires_at<=now() or p_expires_at>now()+interval '30 minutes' then raise exception 'VALIDATION_ERROR'; end if;
  if not (public.has_school_role(p_school_id,'admin') or exists(select 1 from public.student_class_enrollments e where e.student_id=p_student_id and e.school_id=p_school_id and e.status='active' and public.teacher_has_class_access(e.class_id))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.parent_link_invitations set revoked_at=clock_timestamp() where student_id=p_student_id and used_at is null and revoked_at is null;
  insert into public.parent_link_invitations(id,school_id,student_id,code_hash,expires_at,max_attempts,created_by) values(invite_id,p_school_id,p_student_id,p_code_hash,p_expires_at,p_max_attempts,auth.uid());
  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,target_student_id) values(p_school_id,auth.uid(),'parent_invitation_create','parent_link_invitation',invite_id,p_student_id);
  return invite_id;
end $$;
revoke all on function public.store_parent_invitation(uuid,uuid,text,timestamptz,integer) from public,anon;
grant execute on function public.store_parent_invitation(uuid,uuid,text,timestamptz,integer) to authenticated;

commit;
