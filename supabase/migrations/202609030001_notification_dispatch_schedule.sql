-- The dispatcher existed and nothing ever called it.
--
-- `claim_notification_outbox`, `complete_notification_outbox` and the `notification-dispatch` Edge
-- Function were all written and all correct, and the deployment runbook asked an operator to
-- remember to call the function every minute. Nobody does. So messages queued, the queue looked
-- healthy from every screen, and a school believed a parent had been told something that was never
-- sent -- which is exactly the failure the outbox was built to prevent.
--
-- Two things close it, and they are deliberately separate:
--
--   1. A schedule the database owns. `schedule_notification_dispatch` takes the function URL and the
--      scheduler secret, keeps them in the vault and puts a pg_cron job on them. This repository is
--      public, so neither value can live in a migration; an operator passes them once.
--
--   2. Proof it ran. Every invocation records a row here whether it delivered anything or not, so
--      "the sender is alive" is an observation rather than an assumption. Silence is the dangerous
--      state, and silence is now visible: `notification_dispatch_health` reports the age of the last
--      run beside the depth of the queue, and a queue with no recent run is the alarm.
--
-- The schedule is optional and the proof is not. A project that prefers an external scheduler -- a
-- CI cron, an uptime pinger -- skips step 1 entirely and still gets step 2.

begin;

-- One row per invocation of the dispatcher, successful or not. Small, append-only, and pruned to
-- the last seven days so it cannot grow without bound.
create table if not exists public.notification_dispatch_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default clock_timestamp(),
  claimed integer not null default 0,
  sent integer not null default 0,
  retried integer not null default 0,
  dead_lettered integer not null default 0,
  duration_ms integer,
  error_code text
);

create index if not exists notification_dispatch_runs_ran_at_idx
  on public.notification_dispatch_runs(ran_at desc);

alter table public.notification_dispatch_runs enable row level security;

-- The run log names no parent, no student and no message. It is still revoked from `authenticated`
-- outright: the platform console reads it through the security-definer function below, which is the
-- only caller that has ever needed it.
revoke all on public.notification_dispatch_runs from public, anon, authenticated;
grant select, insert, delete on public.notification_dispatch_runs to service_role;

create or replace function public.record_notification_dispatch_run(
  p_claimed integer, p_sent integer, p_retried integer, p_dead_lettered integer,
  p_duration_ms integer default null, p_error_code text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare run_id uuid;
begin
  insert into public.notification_dispatch_runs(claimed,sent,retried,dead_lettered,duration_ms,error_code)
  values (greatest(coalesce(p_claimed,0),0), greatest(coalesce(p_sent,0),0),
          greatest(coalesce(p_retried,0),0), greatest(coalesce(p_dead_lettered,0),0),
          nullif(greatest(coalesce(p_duration_ms,0),0),0), nullif(trim(coalesce(p_error_code,'')),''))
  returning id into run_id;

  -- Pruning here rather than on its own schedule: the only thing that writes this table is also the
  -- only thing that runs often enough to keep it tidy.
  delete from public.notification_dispatch_runs where ran_at < clock_timestamp() - interval '7 days';
  return run_id;
end $$;

revoke all on function public.record_notification_dispatch_run(integer,integer,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_notification_dispatch_run(integer,integer,integer,integer,integer,text) to service_role;

comment on function public.record_notification_dispatch_run(integer,integer,integer,integer,integer,text) is
  'Records one dispatcher invocation so a queue that is never drained is visible rather than silent.';

-- Queue depth beside sender liveness. Either number alone misleads: an empty queue means nothing if
-- the sender is dead and nothing has been enqueued since, and a busy sender means nothing if the
-- oldest message has been waiting an hour.
create or replace function public.notification_dispatch_health()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  last_run public.notification_dispatch_runs%rowtype;
  pending_count integer; dead_count integer; oldest_pending timestamptz;
  sent_last_hour integer; failed_last_hour integer;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  select * into last_run from public.notification_dispatch_runs order by ran_at desc limit 1;

  select count(*) filter (where status in ('pending','failed','processing')),
         count(*) filter (where status = 'dead_letter'),
         min(created_at) filter (where status in ('pending','failed','processing'))
    into pending_count, dead_count, oldest_pending
    from public.notification_outbox;

  select coalesce(sum(sent),0), coalesce(sum(retried) + sum(dead_lettered),0)
    into sent_last_hour, failed_last_hour
    from public.notification_dispatch_runs where ran_at >= clock_timestamp() - interval '1 hour';

  return jsonb_build_object(
    'pending', coalesce(pending_count,0),
    'deadLettered', coalesce(dead_count,0),
    'oldestPendingAt', oldest_pending,
    'oldestPendingSeconds', case when oldest_pending is null then null
      else floor(extract(epoch from clock_timestamp() - oldest_pending))::integer end,
    'lastRunAt', last_run.ran_at,
    'lastRunSecondsAgo', case when last_run.ran_at is null then null
      else floor(extract(epoch from clock_timestamp() - last_run.ran_at))::integer end,
    'lastRunError', last_run.error_code,
    'sentLastHour', coalesce(sent_last_hour,0),
    'failedLastHour', coalesce(failed_last_hour,0),
    'scheduled', exists(select 1 from pg_extension where extname='pg_cron')
      and exists(select 1 from information_schema.tables where table_schema='cron' and table_name='job')
  );
end $$;

revoke all on function public.notification_dispatch_health() from public,anon;
grant execute on function public.notification_dispatch_health() to authenticated;

comment on function public.notification_dispatch_health() is
  'Queue depth beside sender liveness for the operations console. Either number alone misleads.';

-- The schedule. Optional, because a project may drive the dispatcher from outside; and separate from
-- everything above, because the values it needs cannot be written down in a public repository.
--
-- Called once by an operator with the deployed function URL and the scheduler secret. Re-running it
-- rotates both and re-schedules; passing a null secret unschedules.
create or replace function public.schedule_notification_dispatch(
  p_function_url text, p_secret text, p_schedule text default '* * * * *', p_batch_limit integer default 50
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  job_name constant text := 'notification-dispatch';
  command text;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'PG_CRON_NOT_AVAILABLE: enable the pg_cron extension for this project first';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'PG_NET_NOT_AVAILABLE: enable the pg_net extension for this project first';
  end if;

  -- Unschedule and forget. An operator turning the schedule off should not leave the secret behind.
  if p_secret is null then
    perform cron.unschedule(job_name) where exists(select 1 from cron.job where jobname=job_name);
    delete from vault.secrets where name in ('notification_dispatch_url','notification_dispatch_secret');
    return jsonb_build_object('scheduled', false);
  end if;

  if coalesce(trim(p_function_url),'') = '' or p_function_url !~ '^https://' then
    raise exception 'VALIDATION_ERROR: function url must be https';
  end if;
  if length(trim(p_secret)) < 24 then
    raise exception 'VALIDATION_ERROR: dispatch secret must be at least 24 characters';
  end if;
  if p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 100 then
    raise exception 'VALIDATION_ERROR: batch limit must be between 1 and 100';
  end if;

  delete from vault.secrets where name in ('notification_dispatch_url','notification_dispatch_secret');
  perform vault.create_secret(trim(p_function_url), 'notification_dispatch_url',
    'Deployed notification-dispatch Edge Function endpoint.');
  perform vault.create_secret(trim(p_secret), 'notification_dispatch_secret',
    'Shared secret the scheduler presents as x-notification-dispatch-secret.');

  -- The job reads both values at fire time rather than baking them into the schedule, so rotating a
  -- secret does not mean rewriting the job.
  command := format($cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='notification_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-notification-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='notification_dispatch_secret')),
      body := jsonb_build_object('limit',%s),
      timeout_milliseconds := 25000);
  $cmd$, p_batch_limit);

  perform cron.unschedule(job_name) where exists(select 1 from cron.job where jobname=job_name);
  perform cron.schedule(job_name, p_schedule, command);

  return jsonb_build_object('scheduled', true, 'schedule', p_schedule, 'batchLimit', p_batch_limit);
end $$;

revoke all on function public.schedule_notification_dispatch(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.schedule_notification_dispatch(text,text,text,integer) to service_role;

comment on function public.schedule_notification_dispatch(text,text,text,integer) is
  'Puts a pg_cron job on the notification dispatcher. Values come from the operator; this repository is public.';

commit;
