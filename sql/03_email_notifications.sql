-- ============================================================
-- PHASE 5: EMAIL NOTIFICATION SUPPORT
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER 01_schema.sql and 02_rls_policies.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Track whether reminder/overdue emails have already been sent,
--    so the daily check never spams the same person twice for the
--    same transaction.
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists overdue_alert_sent_at timestamptz;

-- ------------------------------------------------------------
-- 2. Enable required extensions for scheduling + HTTP calls
--    (pg_cron runs the schedule, pg_net lets Postgres call out to
--    our Edge Function's HTTPS endpoint)
-- ------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 3. Schedule the daily-due-check Edge Function to run once a day.
--
--    IMPORTANT — before running this block:
--    a) Replace YOUR-PROJECT-REF with your actual Supabase project ref
--       (visible in your project URL: https://YOUR-PROJECT-REF.supabase.co)
--    b) Replace YOUR-SERVICE-ROLE-KEY with your service_role key
--       (Project Settings > API > service_role secret).
--       This key is only ever stored inside Postgres/pg_cron config
--       here — it is NOT in any frontend file.
-- ------------------------------------------------------------
select cron.schedule(
  'daily-due-check',           -- job name
  '0 1 * * *',                 -- every day at 01:00 UTC — adjust to your timezone
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-due-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- To check scheduled jobs later:
--   select * from cron.job;
-- To remove this schedule later:
--   select cron.unschedule('daily-due-check');
-- ------------------------------------------------------------
