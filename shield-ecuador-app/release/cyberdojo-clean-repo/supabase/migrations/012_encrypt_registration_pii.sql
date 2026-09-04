-- supabase/migrations/012_encrypt_registration_pii.sql
-- Adds encrypted storage columns for registration PII and audit fields.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS email_lookup_hmac TEXT,
  ADD COLUMN IF NOT EXISTS full_name_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS phone_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS location_city_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS location_province_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS pii_key_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pii_encrypted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pii_migration_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS data_processing_authorized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_processing_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_notice_version TEXT NOT NULL DEFAULT '2026-06-22',
  ADD COLUMN IF NOT EXISTS privacy_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_lookup_hmac
  ON public.users(email_lookup_hmac)
  WHERE email_lookup_hmac IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_pii_migration_status
  ON public.users(pii_migration_status);

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  event_type TEXT NOT NULL,
  target_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.security_audit_events TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'security_audit_events'
      AND policyname = 'Admins can view security audit events'
  ) THEN
    CREATE POLICY "Admins can view security audit events"
      ON public.security_audit_events FOR SELECT
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'security_audit_events'
      AND policyname = 'Service role can insert security audit events'
  ) THEN
    CREATE POLICY "Service role can insert security audit events"
      ON public.security_audit_events FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE OR REPLACE VIEW public.user_statistics_private AS
SELECT
  business_type,
  belt,
  current_risk_level,
  COUNT(*)::integer AS user_count
FROM public.users
GROUP BY business_type, belt, current_risk_level;

GRANT SELECT ON public.user_statistics_private TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Users can view own profile encrypted shell'
  ) THEN
    NULL;
  END IF;
END $$;
