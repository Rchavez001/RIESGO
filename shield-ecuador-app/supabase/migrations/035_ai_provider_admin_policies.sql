-- ai_providers and agent_provider_assignments had RLS enabled since 004 but
-- no policy was ever added — safe by default (deny-all for anon/authenticated),
-- but inconsistent with the explicit is_admin() policy pattern used on every
-- sibling admin table. Adding it for consistency and so a direct admin
-- session (not just the service-role-bypassing central-admin-app proxy)
-- can manage these too.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_providers' AND policyname = 'Admins can manage ai providers'
  ) THEN
    CREATE POLICY "Admins can manage ai providers"
      ON public.ai_providers FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_provider_assignments' AND policyname = 'Admins can manage agent provider assignments'
  ) THEN
    CREATE POLICY "Admins can manage agent provider assignments"
      ON public.agent_provider_assignments FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_provider_assignments TO authenticated;
