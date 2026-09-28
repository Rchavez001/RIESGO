-- "Centro de Seguridad" — Phase 3 (RF-09 to RF-13, AI diagnosis) and
-- Phase 4 (RF-14 to RF-20, EASM inventory + incident-to-kata workflow)
-- schema. Same lockdown pattern as 052_security_center.sql: service_role
-- only, no anon/authenticated policy.

-- RF-08: needed so the alert-threshold check (run every 15 minutes) can
-- debounce — without this it would re-send the same email every 15
-- minutes for as long as the breach persists.
ALTER TABLE public.security_alert_config ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- RF-09/RF-10: one row per diagnosis run (on-demand or the weekly
-- scheduled job) — a Spanish plain-language read of a batch of
-- security_events, never a per-event log (that's what security_events
-- already is).
CREATE TABLE IF NOT EXISTS public.security_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  severity TEXT NOT NULL CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  summary_es TEXT NOT NULL,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_key TEXT,
  validation_status TEXT NOT NULL DEFAULT 'valid' CHECK (validation_status IN ('valid', 'partial')),
  raw_output TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_security_diagnoses_created_at ON public.security_diagnoses(created_at DESC);

-- RF-14 to RF-17: one row per finding from the monthly EASM inventory
-- (public endpoints, storage bucket exposure, expected-vs-present env
-- vars — never the var's value, only whether it's set).
CREATE TABLE IF NOT EXISTS public.security_easm_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scan_month DATE NOT NULL, -- truncated to the 1st of the month the scan ran
  finding_type TEXT NOT NULL CHECK (finding_type IN ('public_endpoint', 'public_bucket', 'missing_env_var', 'other')),
  target TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_easm_findings_scan_month ON public.security_easm_findings(scan_month DESC);

-- RF-18/RF-19: incident (a security_event or a security_diagnosis) turned
-- into a teaching kata, gated behind a human-approved draft/review/publish
-- pipeline — nothing here ever flips to 'publicado' except an explicit
-- admin action in the panel.
CREATE TABLE IF NOT EXISTS public.security_kata_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_diagnosis_id UUID REFERENCES public.security_diagnoses(id) ON DELETE SET NULL,
  source_event_id UUID REFERENCES public.security_events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'en_revision', 'publicado')),
  created_by TEXT,
  reviewed_by TEXT,
  published_question_id UUID,
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kata_drafts_status ON public.security_kata_drafts(status, created_at DESC);

ALTER TABLE public.security_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_easm_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_kata_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.security_diagnoses, public.security_easm_findings, public.security_kata_drafts
  FROM anon, authenticated;
