begin;

-- Domain writes enqueue compact parent messages after the row operation. Provider calls happen asynchronously.
create or replace function public.enqueue_parent_notification(
  p_school_id uuid, p_event_type text, p_student_id uuid, p_aggregate_id uuid,
  p_idempotency_suffix text, p_payload jsonb
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  inserted_count integer := 0;
  parent_row record;
  preference public.notification_preferences%rowtype;
  enabled boolean := true;
  event_title text := coalesce(p_payload->>'title', 'Smart Classroom');
  event_body text := coalesce(p_payload->>'body', 'มีข้อมูลใหม่จากโรงเรียน');
begin
  if p_school_id is null or p_student_id is null or coalesce(trim(p_event_type),'') = '' then return 0; end if;
  for parent_row in
    select p.id as parent_id
    from public.parents p
    join public.parent_student_links l on l.parent_id=p.id and l.school_id=p_school_id
      and l.student_id=p_student_id and l.status='linked' and l.deleted_at is null
    where p.school_id=p_school_id and p.status='active' and p.line_user_id is not null
  loop
    select * into preference from public.notification_preferences
      where school_id=p_school_id and parent_id=parent_row.parent_id;
    enabled := case p_event_type
      when 'assignment_new' then coalesce(preference.assignment_new,true)
      when 'assignment_due' then coalesce(preference.due_soon,true)
      when 'assignment_missing' then coalesce(preference.missing,true)
      when 'attendance_absent' then coalesce(preference.absent,true)
      when 'attendance_late' then coalesce(preference.late,true)
      when 'score_published' then coalesce(preference.score_published,true)
      when 'student_at_risk' then coalesce(preference.at_risk,true)
      else true
    end;
    if not enabled then continue; end if;
    insert into public.notification_outbox(
      school_id,event_type,parent_id,student_id,aggregate_id,payload_json,idempotency_key
    ) values (
      p_school_id,p_event_type,parent_row.parent_id,p_student_id,p_aggregate_id,
      coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('title',left(event_title,120),
        'body',left(event_body,2000),'locale',coalesce(preference.locale,'th')),
      format('%s:%s:%s:%s',p_event_type,coalesce(p_aggregate_id::text,'none'),p_student_id,p_idempotency_suffix)
    ) on conflict (school_id,idempotency_key) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  return inserted_count;
end $$;

create or replace function public.enqueue_assignment_parent_notifications()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare student_row record;
begin
  if new.deleted_at is not null or new.status <> 'published' then return new; end if;
  if tg_op='UPDATE' and old.status='published' and old.due_at is not distinct from new.due_at
     and old.title is not distinct from new.title then return new; end if;
  for student_row in select student_id from public.student_class_enrollments
    where school_id=new.school_id and class_id=new.class_id and status='active' and deleted_at is null
  loop
    perform public.enqueue_parent_notification(new.school_id,
      case when tg_op='INSERT' or old.status<>'published' then 'assignment_new' else 'assignment_due' end,
      student_row.student_id,new.id,new.version::text,
      jsonb_build_object('title',new.title,'body',case when new.due_at is null
        then 'มีงานใหม่จากครู' else format('กำหนดส่ง: %s',new.due_at) end,'dueAt',new.due_at));
  end loop;
  return new;
end $$;

create or replace function public.enqueue_attendance_parent_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.deleted_at is null and new.status in ('absent','late') then
    perform public.enqueue_parent_notification(new.school_id,
      case when new.status='absent' then 'attendance_absent' else 'attendance_late' end,
      new.student_id,new.id,new.version::text,
      jsonb_build_object('title',case when new.status='absent' then 'แจ้งการขาดเรียน' else 'แจ้งการมาเรียนสาย' end,
        'body',format('วันที่ %s · %s',new.attendance_date,case when new.status='absent' then 'ขาดเรียน' else 'มาเรียนสาย' end),
        'attendanceDate',new.attendance_date,'status',new.status));
  end if;
  return new;
end $$;

create or replace function public.enqueue_submission_parent_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.deleted_at is null and new.score is not null and
     (tg_op='INSERT' or old.score is distinct from new.score) then
    perform public.enqueue_parent_notification(new.school_id,'score_published',new.student_id,new.assignment_id,new.version::text,
      jsonb_build_object('title','ประกาศคะแนนงาน','body',format('ได้รับคะแนน %s คะแนน',new.score),'score',new.score));
  end if;
  return new;
end $$;

create or replace function public.enqueue_test_score_parent_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare test_title text;
begin
  if new.deleted_at is null and new.published_at is not null and
     (tg_op='INSERT' or old.published_at is null or old.score is distinct from new.score) then
    select title into test_title from public.tests where id=new.test_id;
    perform public.enqueue_parent_notification(new.school_id,'score_published',new.student_id,new.test_id,new.version::text,
      jsonb_build_object('title','ประกาศคะแนนสอบ','body',format('%s · ได้ %s คะแนน',coalesce(test_title,'แบบทดสอบ'),coalesce(new.score::text,'-')),'score',new.score));
  end if;
  return new;
end $$;

drop trigger if exists assignment_parent_notification on public.assignments;
create trigger assignment_parent_notification after insert or update on public.assignments
for each row execute function public.enqueue_assignment_parent_notifications();
drop trigger if exists attendance_parent_notification on public.attendance;
create trigger attendance_parent_notification after insert or update on public.attendance
for each row execute function public.enqueue_attendance_parent_notification();
drop trigger if exists submission_parent_notification on public.submissions;
create trigger submission_parent_notification after insert or update on public.submissions
for each row execute function public.enqueue_submission_parent_notification();
drop trigger if exists test_score_parent_notification on public.test_scores;
create trigger test_score_parent_notification after insert or update on public.test_scores
for each row execute function public.enqueue_test_score_parent_notification();

-- Service-role-only queue boundary. SKIP LOCKED lets two scheduler invocations run safely together.
create or replace function public.claim_notification_outbox(p_limit integer default 25)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'VALIDATION_ERROR: invalid batch size'; end if;
  return query
  with candidates as (
    select o.id from public.notification_outbox o
    where (o.status in ('pending','failed') and o.next_retry_at <= clock_timestamp())
       or (o.status='processing' and o.next_retry_at <= clock_timestamp())
    order by o.next_retry_at,o.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.notification_outbox o set status='processing',retry_count=o.retry_count+1,
      next_retry_at=clock_timestamp()+interval '10 minutes'
    from candidates c where o.id=c.id returning o.*
  )
  select jsonb_build_object('id',c.id,'schoolId',c.school_id,'eventType',c.event_type,
    'parentId',c.parent_id,'studentId',c.student_id,'aggregateId',c.aggregate_id,
    'payload',c.payload_json,'retryCount',c.retry_count) from claimed c;
end $$;

create or replace function public.complete_notification_outbox(
  p_id uuid,p_success boolean,p_retryable boolean default true,
  p_error_code text default null,p_provider_message_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.notification_outbox%rowtype; next_status public.outbox_status; next_time timestamptz;
begin
  select * into item from public.notification_outbox where id=p_id for update;
  if not found or item.status<>'processing' then return jsonb_build_object('id',p_id,'updated',false); end if;
  if p_success then next_status:='sent'; next_time:=clock_timestamp();
  elsif p_retryable and item.retry_count<5 then next_status:='failed';
    next_time:=clock_timestamp()+make_interval(secs=>least(1800,30*power(4,greatest(item.retry_count-1,0))::integer));
  else next_status:='dead_letter'; next_time:=clock_timestamp(); end if;
  update public.notification_outbox set status=next_status,next_retry_at=next_time,
    processed_at=case when next_status in ('sent','dead_letter') then clock_timestamp() else null end where id=p_id;
  insert into public.notifications_log(school_id,parent_id,student_id,type,channel,status,provider_message_id,error_code,sent_at)
    values(item.school_id,item.parent_id,item.student_id,item.event_type,'line',next_status::text,p_provider_message_id,p_error_code,
      case when p_success then clock_timestamp() else null end);
  return jsonb_build_object('id',p_id,'updated',true,'status',next_status::text,'retryCount',item.retry_count);
end $$;

revoke all on function public.enqueue_parent_notification(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.complete_notification_outbox(uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_parent_notification(uuid,text,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.complete_notification_outbox(uuid,boolean,boolean,text,text) to service_role;

comment on function public.claim_notification_outbox(integer) is 'Atomically claims retryable parent notifications for the service-role dispatcher.';
comment on function public.complete_notification_outbox(uuid,boolean,boolean,text,text) is 'Records provider outcome, retry schedule and delivery log for one claimed notification.';

-- The platform console may inspect queue health without seeing recipient ids, message bodies, or
-- student data. The latest error comes from the delivery log, while the outbox remains service-only.
create or replace function public.platform_notification_queue(
  p_status text default null, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('pending','processing','sent','failed','dead_letter') then
    raise exception 'VALIDATION_ERROR: status';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',o.id,'schoolId',o.school_id,'schoolName',s.name,'eventType',o.event_type,
      'status',o.status,'retryCount',o.retry_count,'nextRetryAt',o.next_retry_at,
      'createdAt',o.created_at,'processedAt',o.processed_at,'lastError',last_log.error_code
    ) order by o.created_at desc)
    from (
      select * from public.notification_outbox
      where (p_status is null or status=p_status::public.outbox_status)
      order by created_at desc limit least(coalesce(p_limit,100),500)
    ) o
    left join public.schools s on s.id=o.school_id
    left join lateral (
      select error_code from public.notifications_log
      where parent_id=o.parent_id and student_id=o.student_id and type=o.event_type
      order by created_at desc limit 1
    ) last_log on true
  ),'[]'::jsonb);
end $$;

revoke all on function public.platform_notification_queue(text,integer) from public,anon;
grant execute on function public.platform_notification_queue(text,integer) to authenticated;
commit;
