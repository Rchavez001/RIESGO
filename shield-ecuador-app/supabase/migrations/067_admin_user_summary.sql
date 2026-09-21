-- Admin console › Usuarios: aggregate figures without personal data (names and emails are encrypted and are
-- deliberately never shown there). Callable only with the service role.
CREATE OR REPLACE FUNCTION public.admin_user_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM users),
    'authorized', (SELECT count(*) FROM users WHERE data_processing_authorized IS TRUE),
    'new_30d', (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days'),
    'admins', (SELECT count(*) FROM users WHERE role = 'admin'),
    'onboarded', (SELECT count(*) FROM users WHERE onboarding_completed IS TRUE),
    'by_belt', coalesce((SELECT jsonb_object_agg(belt, n) FROM (SELECT coalesce(belt, 'sin cinturón') AS belt, count(*) AS n FROM users GROUP BY 1) b), '{}'::jsonb),
    'by_role', coalesce((SELECT jsonb_object_agg(role, n) FROM (SELECT coalesce(role, 'sin rol') AS role, count(*) AS n FROM users GROUP BY 1) r), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.admin_user_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_summary() TO service_role;
