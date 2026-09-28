-- "Centro de Seguridad" — scheduled jobs for Phase 3 (weekly AI diagnosis,
-- RF-10) and Phase 4 (monthly EASM inventory, RF-14). Mirrors the exact
-- dispatcher shape from 040_news_agent_pg_cron_dispatcher.sql: pg_net calls
-- the edge function with the same Vault-stored 'cron_shared_secret' as the
-- x-cron-secret header, which requireAdminOrScheduler already accepts.
--
-- Unlike the news agent (admin-configurable trigger_time via agent_configs),
-- these two run on a fixed schedule per the request — pg_cron itself is the
-- only "configuration" needed, so no extra config table.

CREATE OR REPLACE FUNCTION public.dispatch_security_diagnosis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_diagnosis: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/security-diagnose',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_security_easm_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_easm_scan: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/security-easm-scan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_security_alert_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_alert_check: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/check-security-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_security_diagnosis() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_security_easm_scan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_security_alert_check() FROM PUBLIC, anon, authenticated;

-- Weekly diagnosis: every Monday 08:00 UTC (RF-10).
SELECT cron.schedule(
  'security-diagnosis-weekly',
  '0 8 * * 1',
  $$SELECT public.dispatch_security_diagnosis();$$
);

-- Monthly EASM inventory: the 1st of each month, 09:00 UTC (RF-14).
SELECT cron.schedule(
  'security-easm-monthly',
  '0 9 1 * *',
  $$SELECT public.dispatch_security_easm_scan();$$
);

-- Alert-threshold check: every 15 minutes (RF-08) — cheap enough (a handful
-- of COUNT queries against an indexed, pruned table) to run this often
-- rather than only nightly, so a burst gets caught the same hour it happens.
SELECT cron.schedule(
  'security-alert-check-15min',
  '*/15 * * * *',
  $$SELECT public.dispatch_security_alert_check();$$
);
