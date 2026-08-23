-- Schedules the send-reminders Edge Function to run every minute via
-- pg_cron + pg_net. Supabase's dashboard-native scheduled-functions UI is
-- the simpler option on a hosted project, but isn't something a migration
-- can express -- pg_cron works identically local and hosted, so it's used
-- here instead, per the design spec's documented fallback.
create extension if not exists pg_cron with schema pg_catalog;
-- pg_net is already enabled in the base image this project's local stack
-- uses; `if not exists` keeps this migration safe to re-run/port anyway.
create extension if not exists pg_net with schema public;

-- LOCAL DEV URL. When deploying to a hosted Supabase project, replace the
-- url below with https://<project-ref>.functions.supabase.co/send-reminders
-- and add an Authorization header carrying the service_role/secret key
-- (ideally read from Supabase Vault rather than hardcoded in a migration).
-- verify_jwt = false for this function (see supabase/config.toml) is what
-- makes the no-auth-header local version work; that's fine for local dev
-- (not internet-reachable) but reconsider before relying on it in production.
select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'http://127.0.0.1:54321/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
