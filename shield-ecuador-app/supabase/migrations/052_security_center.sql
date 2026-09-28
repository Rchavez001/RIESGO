-- "Centro de Seguridad" — Phase 1: passive protection + logging schema
-- (RF-01 to RF-04). Every table here is written exclusively by edge
-- functions (service_role) — no anon/authenticated policy exists at all,
-- matching the same lockdown pattern used for ai_providers/championships
-- elsewhere in this schema. central-admin-app (the only reader) always
-- connects with the service role, which bypasses RLS entirely; the
-- REVOKE below is defense in depth against a regular Supabase Auth
-- session (a student) ever reading these tables directly.

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_endpoint ON public.security_events(endpoint, created_at DESC);

-- Backs the rate limiter (RF-02): one row per hit, pruned periodically.
-- A real sliding window (COUNT(*) WHERE hit_at > now() - interval) rather
-- than a fixed-bucket approximation, since the request explicitly asked
-- for a sliding window.
CREATE TABLE IF NOT EXISTS public.security_rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_time ON public.security_rate_limit_hits(bucket_key, hit_at DESC);

-- RF-08: alert thresholds the Club configures.
CREATE TABLE IF NOT EXISTS public.security_alert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  severity_threshold TEXT NOT NULL CHECK (severity_threshold IN ('baja', 'media', 'alta', 'critica')),
  event_count_threshold INT NOT NULL DEFAULT 5 CHECK (event_count_threshold > 0),
  window_minutes INT NOT NULL DEFAULT 60 CHECK (window_minutes > 0),
  notify_email TEXT,
  notify_webhook_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RF-20: who changed what threshold/rule, and when — the audit trail
-- covering every config table this module introduces.
CREATE TABLE IF NOT EXISTS public.security_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL, -- the central-admin-app actor string (email), same convention as agent_runs.triggered_by
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before_value JSONB,
  after_value JSONB
);

-- RF-13: feedback on AI diagnoses — never used to auto-act (RNF-11), just
-- recorded for the Club to review and to spot a diagnosis category that's
-- consistently wrong.
CREATE TABLE IF NOT EXISTS public.security_diagnosis_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diagnosis_id UUID NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('correcto', 'incorrecto')),
  comment TEXT,
  submitted_by TEXT
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_config_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_diagnosis_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.security_events, public.security_rate_limit_hits,
  public.security_alert_config, public.security_config_audit, public.security_diagnosis_feedback
  FROM anon, authenticated;
