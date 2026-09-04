-- supabase/migrations/013_tpot_integration.sql
-- Persistent structures for defensive T-Pot integration and AI audit workflow.

CREATE TABLE IF NOT EXISTS public.tpot_integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT false,
  base_url TEXT,
  elastic_url_encrypted_or_reference TEXT,
  verify_tls BOOLEAN NOT NULL DEFAULT true,
  allowed_indexes TEXT[] NOT NULL DEFAULT ARRAY['logstash-*', 'tpot-*', 'cowrie-*', 'suricata-*', 'dionaea-*'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tpot_query_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  action TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  records_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tpot_ai_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'audited', 'approved', 'rejected', 'failed')),
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sanitized_input_ref TEXT,
  input_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_ai_output JSONB,
  audited_output JSONB,
  audit_status TEXT,
  audit_notes TEXT,
  approved_output JSONB,
  model TEXT,
  audit_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tpot_iocs_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type TEXT NOT NULL,
  indicator_value_hash TEXT NOT NULL,
  indicator_value_masked TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  severity TEXT,
  source_honeypot TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(indicator_type, indicator_value_hash)
);

ALTER TABLE public.tpot_integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpot_query_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpot_ai_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpot_iocs_cache ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.tpot_integration_settings TO authenticated;
GRANT SELECT, INSERT ON public.tpot_query_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tpot_ai_analysis_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tpot_iocs_cache TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tpot_integration_settings' AND policyname = 'Admins manage tpot settings') THEN
    CREATE POLICY "Admins manage tpot settings" ON public.tpot_integration_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tpot_query_audit' AND policyname = 'Admins view tpot audit') THEN
    CREATE POLICY "Admins view tpot audit" ON public.tpot_query_audit FOR SELECT USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tpot_query_audit' AND policyname = 'Service insert tpot audit') THEN
    CREATE POLICY "Service insert tpot audit" ON public.tpot_query_audit FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tpot_ai_analysis_jobs' AND policyname = 'Admins manage tpot ai jobs') THEN
    CREATE POLICY "Admins manage tpot ai jobs" ON public.tpot_ai_analysis_jobs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tpot_iocs_cache' AND policyname = 'Admins manage tpot iocs') THEN
    CREATE POLICY "Admins manage tpot iocs" ON public.tpot_iocs_cache FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;
