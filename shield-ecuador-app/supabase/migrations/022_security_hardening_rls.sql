-- supabase/migrations/022_security_hardening_rls.sql
-- Ciber Dojo: Endurecimiento de Row Level Security (RLS) en tablas auxiliares y de administración

-- 1. TABLA: sponsors
ALTER TABLE IF EXISTS public.sponsors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sponsors' AND policyname = 'Public can view active sponsors'
  ) THEN
    CREATE POLICY "Public can view active sponsors"
      ON public.sponsors FOR SELECT
      USING (active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sponsors' AND policyname = 'Admins can manage sponsors'
  ) THEN
    CREATE POLICY "Admins can manage sponsors"
      ON public.sponsors FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 2. TABLA: ai_configs
ALTER TABLE IF EXISTS public.ai_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_configs' AND policyname = 'Admins can view and manage ai_configs'
  ) THEN
    CREATE POLICY "Admins can view and manage ai_configs"
      ON public.ai_configs FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 3. TABLA: recommendations_cache
ALTER TABLE IF EXISTS public.recommendations_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recommendations_cache' AND policyname = 'Authenticated users can view recommendations'
  ) THEN
    CREATE POLICY "Authenticated users can view recommendations"
      ON public.recommendations_cache FOR SELECT
      TO authenticated
      USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recommendations_cache' AND policyname = 'Admins can manage recommendations_cache'
  ) THEN
    CREATE POLICY "Admins can manage recommendations_cache"
      ON public.recommendations_cache FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 4. TABLA: katas (Agregar política de administración para INSERT/UPDATE/DELETE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'katas' AND policyname = 'Admins can manage katas'
  ) THEN
    CREATE POLICY "Admins can manage katas"
      ON public.katas FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 5. TABLA: domains_whitelist (Agregar política de administración para INSERT/UPDATE/DELETE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'domains_whitelist' AND policyname = 'Admins can manage domains_whitelist'
  ) THEN
    CREATE POLICY "Admins can manage domains_whitelist"
      ON public.domains_whitelist FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 6. TABLA: security_audit_events (Prevenir inserción arbitraria directa desde clientes autenticados)
REVOKE INSERT ON public.security_audit_events FROM authenticated;
