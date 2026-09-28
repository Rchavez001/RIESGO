-- Probe: can pg_cron be enabled directly via migration on this hosted
-- Supabase project, or does it require the dashboard's Extensions toggle?
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
