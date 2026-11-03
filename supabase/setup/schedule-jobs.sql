-- =============================================================================
-- Run ONCE in the Supabase SQL editor after deploying the edge functions.
-- Schedules the outbox dispatcher (every minute) and daily housekeeping.
--
-- 1. Replace the two placeholder values below:
--      <PROJECT_REF>       your Supabase project ref (from the project URL)
--      <DISPATCH_SECRET>   the same value you set as the DISPATCH_SECRET function secret
-- 2. Run the whole script. Re-running it is safe (jobs are replaced).
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets live in Supabase Vault, never in the job definition.
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/automation-dispatch', 'automation_dispatch_url')
 where not exists (select 1 from vault.secrets where name = 'automation_dispatch_url');
select vault.create_secret('<DISPATCH_SECRET>', 'automation_dispatch_secret')
 where not exists (select 1 from vault.secrets where name = 'automation_dispatch_secret');
-- To change a value later:
--   select vault.update_secret((select id from vault.secrets where name = 'automation_dispatch_secret'), 'new-value');

select cron.unschedule(jobname) from cron.job where jobname in ('automation-dispatch', 'purge-expired-data');

select cron.schedule('automation-dispatch', '* * * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'automation_dispatch_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Dispatch-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'automation_dispatch_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

select cron.schedule('purge-expired-data', '17 3 * * *', $job$ select public.purge_expired_data(); $job$);

-- Check it is running:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, content from net._http_response order by created desc limit 10;
