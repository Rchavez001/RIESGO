-- supabase/migrations/004_admin_center.sql

-- ========================================
-- HELPERS: Admin authorization
-- ========================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ========================================
-- ALTER: users
-- ========================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'analyst'));

-- ========================================
-- ALTER: questions
-- ========================================
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'incident_investigation', 'audited_generated')),
  ADD COLUMN IF NOT EXISTS generated_from_incident_id UUID,
  ADD COLUMN IF NOT EXISTS generation_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS audit_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (audit_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS audit_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ========================================
-- ALTER: alerts
-- ========================================
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS related_question_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS related_incident_id UUID,
  ADD COLUMN IF NOT EXISTS source_agent TEXT;

-- ========================================
-- TABLE: ai_providers
-- ========================================
CREATE TABLE IF NOT EXISTS ai_providers (
  provider_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  purpose TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- TABLE: agent_configs
-- ========================================
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code TEXT UNIQUE NOT NULL CHECK (agent_code IN (
    'incident-investigator',
    'question-auditor'
  )),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  trigger_time TIME NOT NULL DEFAULT '07:00:00',
  timezone TEXT NOT NULL DEFAULT 'America/Guayaquil',
  prompt_template TEXT NOT NULL,
  investigation_window_days INT DEFAULT 1,
  last_run_at TIMESTAMPTZ,
  extra_settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_agent_configs_updated_at
  BEFORE UPDATE ON agent_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- TABLE: agent_provider_assignments
-- ========================================
CREATE TABLE IF NOT EXISTS agent_provider_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES ai_providers(provider_key) ON DELETE CASCADE,
  priority INT DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(agent_config_id, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_provider_assignments_agent
  ON agent_provider_assignments(agent_config_id, priority);

-- ========================================
-- TABLE: incident_investigations
-- ========================================
CREATE TABLE IF NOT EXISTS incident_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_date DATE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  source_name TEXT,
  source_url TEXT,
  ai_provider_key TEXT REFERENCES ai_providers(provider_key),
  raw_payload JSONB,
  generated_question_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'detectado' CHECK (status IN (
    'detectado',
    'preguntas_generadas',
    'auditado',
    'descartado'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_investigations_date
  ON incident_investigations(incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_incident_investigations_severity
  ON incident_investigations(severity);

-- ========================================
-- TABLE: agent_runs
-- ========================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'running',
    'completed',
    'failed'
  )),
  summary TEXT,
  input_payload JSONB,
  output_payload JSONB,
  triggered_by TEXT DEFAULT 'system',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_date
  ON agent_runs(agent_config_id, run_date DESC);

-- ========================================
-- RLS: Enable on new tables
-- ========================================
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_provider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- RLS: Extended admin access
-- ========================================
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can view all evaluations"
  ON evaluations FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can view all kata completions"
  ON kata_completions FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can manage alerts"
  ON alerts FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can view all questions"
  ON questions FOR SELECT
  USING (public.is_admin() OR active = TRUE);

CREATE POLICY "Admins can insert questions"
  ON questions FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update questions"
  ON questions FOR UPDATE
  USING (public.is_admin());

-- ========================================
-- RLS: Admin-only central tables
-- ========================================
CREATE POLICY "Admins can manage ai providers"
  ON ai_providers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage agent configs"
  ON agent_configs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage provider assignments"
  ON agent_provider_assignments FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage incident investigations"
  ON incident_investigations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage agent runs"
  ON agent_runs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ========================================
-- SEED: AI providers
-- ========================================
INSERT INTO ai_providers (provider_key, label, provider_type, model_name, purpose, active)
VALUES
  ('deepseek', 'DeepSeek', 'chat_completion', 'deepseek-chat', 'Investigacion y generacion de preguntas', true),
  ('kimi', 'Kimi', 'chat_completion', 'moonshot-v1-8k', 'Fallback de investigacion', true),
  ('claude', 'Claude', 'messages', 'claude-haiku-4-5-20251001', 'Auditoria y fallback', true)
ON CONFLICT (provider_key) DO NOTHING;

-- ========================================
-- SEED: Agent configs
-- ========================================
INSERT INTO agent_configs (agent_code, name, description, enabled, trigger_time, timezone, prompt_template, investigation_window_days, extra_settings)
VALUES
(
  'incident-investigator',
  'Investigador Diario de Incidentes',
  'Investiga incidentes del dia anterior y propone nuevas preguntas.',
  true,
  '07:00:00',
  'America/Guayaquil',
  'Analiza los incidentes de ciberseguridad reportados para el dia anterior. Resume impacto para MIPYMEs ecuatorianas, clasifica severidad y propone preguntas nuevas para el Cyber Dojo. Devuelve JSON estricto con incidents[] y generated_questions[].',
  1,
  jsonb_build_object('max_questions_per_run', 5, 'create_alerts', true)
),
(
  'question-auditor',
  'Auditor de Preguntas Generadas',
  'Audita las preguntas generadas por el investigador y aprueba o rechaza su activacion.',
  true,
  '07:30:00',
  'America/Guayaquil',
  'Audita las preguntas generadas automaticamente para Cyber Dojo. Evalua claridad, relevancia, simplicidad y accionabilidad. Devuelve JSON estricto con audits[].',
  1,
  jsonb_build_object('auto_activate_approved', true)
)
ON CONFLICT (agent_code) DO NOTHING;

INSERT INTO agent_provider_assignments (agent_config_id, provider_key, priority, active)
SELECT ac.id, provider_key, priority, true
FROM (
  VALUES
    ('incident-investigator', 'deepseek', 1),
    ('incident-investigator', 'kimi', 2),
    ('incident-investigator', 'claude', 3),
    ('question-auditor', 'claude', 1),
    ('question-auditor', 'deepseek', 2)
) AS defaults(agent_code, provider_key, priority)
JOIN agent_configs ac ON ac.agent_code = defaults.agent_code
ON CONFLICT (agent_config_id, provider_key) DO NOTHING;
