-- supabase/migrations/011_sensei_audit_agent_report.sql
-- Adds a configurable Sensei auditor agent and a unified audit corrections report.

ALTER TABLE public.agent_configs
  DROP CONSTRAINT IF EXISTS agent_configs_agent_code_check;

ALTER TABLE public.agent_configs
  ADD CONSTRAINT agent_configs_agent_code_check
  CHECK (agent_code IN (
    'incident-investigator',
    'question-auditor',
    'ciber-dojo-news-agent',
    'sensei-question-auditor'
  ));

ALTER TABLE public.sensei_consultations
  ADD COLUMN IF NOT EXISTS draft_answer_text TEXT,
  ADD COLUMN IF NOT EXISTS auditor_notes TEXT,
  ADD COLUMN IF NOT EXISTS auditor_model TEXT,
  ADD COLUMN IF NOT EXISTS auditor_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auditor_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auditor_timeout_ms INTEGER;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS audit_provider TEXT,
  ADD COLUMN IF NOT EXISTS audit_model TEXT,
  ADD COLUMN IF NOT EXISTS audit_replaced_content BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_original_payload JSONB,
  ADD COLUMN IF NOT EXISTS audit_corrected_payload JSONB,
  ADD COLUMN IF NOT EXISTS audit_reviewed_at TIMESTAMPTZ;

INSERT INTO public.agent_configs (
  agent_code,
  name,
  description,
  enabled,
  trigger_time,
  timezone,
  prompt_template,
  investigation_window_days,
  extra_settings
)
VALUES (
  'sensei-question-auditor',
  'Auditor IA de respuestas del Sensei',
  'Valida y corrige respuestas del Sensei antes de mostrarlas al usuario.',
  true,
  '00:00:00',
  'America/Guayaquil',
  'Eres el auditor de respuestas del Sensei de Ciber Dojo Ecuador. Valida si la consulta pertenece a ciberseguridad, ciberdelitos, privacidad, fraude digital, proteccion de datos, autenticacion, malware, phishing, redes, dispositivos, credenciales o terminologia del dominio. Si la consulta es terminologia o una palabra ambigua, interpreta la pregunta desde el punto de vista de ciberseguridad. Ejemplo: si preguntan "que es un token", responde sobre token como credencial, llave digital, codigo temporal, token de sesion, JWT o tokenizacion segun corresponda. Corrige el borrador si es impreciso, incompleto, no explica el concepto, usa una respuesta base equivocada o no es claro para ciudadanos y pequenos negocios de Ecuador. No inventes incidentes ni fuentes. Devuelve JSON estricto con: {"is_cybersecurity":boolean,"replace":boolean,"answer":"string","notes":"string"}.',
  0,
  '{"timeout_ms":12000,"temperature":0.1,"max_tokens":1200}'::jsonb
)
ON CONFLICT (agent_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  prompt_template = EXCLUDED.prompt_template,
  extra_settings = public.agent_configs.extra_settings || EXCLUDED.extra_settings,
  updated_at = now();

INSERT INTO public.agent_provider_assignments (agent_config_id, provider_key, priority, active)
SELECT ac.id, defaults.provider_key, defaults.priority, true
FROM (
  VALUES
    ('claude', 1),
    ('deepseek', 2),
    ('kimi', 3)
) AS defaults(provider_key, priority)
JOIN public.agent_configs ac ON ac.agent_code = 'sensei-question-auditor'
JOIN public.ai_providers ap ON ap.provider_key = defaults.provider_key
ON CONFLICT (agent_config_id, provider_key) DO UPDATE SET
  priority = EXCLUDED.priority,
  active = true;

CREATE OR REPLACE VIEW public.ai_audit_corrections_report AS
SELECT
  'sensei'::text AS source_type,
  sc.id::text AS record_id,
  sc.created_at AS created_at,
  COALESCE(sc.auditor_finished_at, sc.updated_at, sc.created_at) AS reviewed_at,
  sc.question_text,
  sc.draft_answer_text AS original_answer_text,
  sc.answer_text AS corrected_answer_text,
  sc.auditor_provider,
  sc.auditor_model,
  sc.auditor_notes AS correction_notes,
  COALESCE(sc.auditor_replaced_answer, false) AS auditor_replaced_content,
  sc.status
FROM public.sensei_consultations sc
WHERE public.is_admin()
  AND COALESCE(sc.auditor_replaced_answer, false) = true

UNION ALL

SELECT
  'web_scanner_question'::text AS source_type,
  q.id::text AS record_id,
  q.created_at AS created_at,
  COALESCE(q.audit_reviewed_at, q.reviewed_at, q.created_at) AS reviewed_at,
  q.question_text,
  q.audit_original_payload::text AS original_answer_text,
  q.audit_corrected_payload::text AS corrected_answer_text,
  q.audit_provider AS auditor_provider,
  q.audit_model AS auditor_model,
  q.audit_notes AS correction_notes,
  COALESCE(q.audit_replaced_content, false) AS auditor_replaced_content,
  COALESCE(q.audit_status, 'unknown') AS status
FROM public.questions q
WHERE public.is_admin()
  AND COALESCE(q.audit_replaced_content, false) = true;

GRANT SELECT ON public.ai_audit_corrections_report TO authenticated;
