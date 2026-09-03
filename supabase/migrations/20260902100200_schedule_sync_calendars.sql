-- Schedules the sync-calendars Edge Function to run every 5 minutes via
-- pg_cron + pg_net, same pattern as schedule_send_reminders.sql. pg_cron
-- and pg_net are already enabled by that migration; `if not exists` keeps
-- this one safe to apply on its own too.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema public;

-- LOCAL DEV URL. When deploying to a hosted Supabase project, replace the
-- url below with https://<project-ref>.functions.supabase.co/sync-calendars
-- and add an Authorization header carrying the service_role/secret key
-- (ideally read from Supabase Vault rather than hardcoded in a migration).
-- verify_jwt = false for this function (see supabase/config.toml) is what
-- makes the no-auth-header local version work; that's fine for local dev
-- (not internet-reachable) but reconsider before relying on it in production.
select cron.schedule(
  'sync-calendars-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'http://127.0.0.1:54321/functions/v1/sync-calendars',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
