-- Phase 3 (adapted, news agent only per explicit instruction): a pg_cron job
-- ticking every minute that checks whether ciber-dojo-news-agent is due
-- (enabled + local time matches trigger_time + hasn't already run today),
-- and if so calls run-news-agent's new 'scheduled' action via pg_net.
--
-- Anti-double-fire: last_run_at is stamped the instant this function decides
-- to dispatch, before the HTTP call even completes — matching the plan's
-- "marcar last_run_date de inmediato" requirement, using the existing
-- last_run_at TIMESTAMPTZ column (compared by local date) instead of adding
-- a redundant last_run_date column.
--
-- The shared secret authenticating this call to the edge function lives in
-- Vault (name 'cron_shared_secret', written once via set_provider_secret),
-- never in this migration file — only the lookup-by-name is.

CREATE OR REPLACE FUNCTION public.dispatch_news_agent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  cfg RECORD;
  now_local TIME;
  today_local DATE;
  last_run_local DATE;
  shared_secret TEXT;
BEGIN
  SELECT * INTO cfg FROM public.agent_configs WHERE agent_code = 'ciber-dojo-news-agent';
  IF cfg.id IS NULL OR NOT cfg.enabled THEN
    RETURN;
  END IF;

  now_local := (now() AT TIME ZONE cfg.timezone)::TIME;
  today_local := (now() AT TIME ZONE cfg.timezone)::DATE;
  last_run_local := CASE WHEN cfg.last_run_at IS NULL THEN NULL ELSE (cfg.last_run_at AT TIME ZONE cfg.timezone)::DATE END;

  IF last_run_local IS NOT DISTINCT FROM today_local THEN
    RETURN;
  END IF;

  IF date_trunc('minute', now_local) <> date_trunc('minute', cfg.trigger_time) THEN
    RETURN;
  END IF;

  UPDATE public.agent_configs SET last_run_at = now() WHERE id = cfg.id;

  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_news_agent: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/run-news-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('action', 'scheduled', 'triggered_by', 'pg_cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_news_agent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_news_agent() FROM anon, authenticated;

-- cron.schedule() upserts by job name, so re-running this migration is safe.
SELECT cron.schedule(
  'news-agent-dispatcher',
  '* * * * *',
  $$SELECT public.dispatch_news_agent();$$
);
