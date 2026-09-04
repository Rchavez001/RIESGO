-- supabase/migrations/007_central_admin_ciber_dojo.sql
--
-- Central Admin debe operar sobre el mismo Supabase de Cyber Dojo.
-- Esta migracion agrega las entidades que faltan para:
-- - Dojos configurables.
-- - Preguntas editables por dojo, reutilizando la tabla public.questions.
-- - Frases de sabiduria oriental para ventanas emergentes.
-- - Fuentes del agente de noticias.
-- - KATAS generadas por el agente para revision/publicacion.

-- ========================================
-- HELPERS
-- ========================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TABLE: cyber_dojos
-- ========================================
CREATE TABLE IF NOT EXISTS public.cyber_dojos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  iso_control TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'paused', 'archived')),
  manual_question_target INT NOT NULL DEFAULT 20 CHECK (manual_question_target >= 0),
  ai_question_target INT NOT NULL DEFAULT 30 CHECK (ai_question_target >= 0),
  display_order INT NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cyber_dojos_status_order
  ON public.cyber_dojos(status, display_order);

DROP TRIGGER IF EXISTS touch_cyber_dojos_updated_at ON public.cyber_dojos;
CREATE TRIGGER touch_cyber_dojos_updated_at
  BEFORE UPDATE ON public.cyber_dojos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- ALTER: questions for dojo-admin bank
-- ========================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS dojo_id TEXT REFERENCES public.cyber_dojos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS difficulty INT CHECK (difficulty BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS kata_label TEXT,
  ADD COLUMN IF NOT EXISTS answer_text TEXT,
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS editable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_questions_dojo_order
  ON public.questions(dojo_id, source_type, order_num);

CREATE INDEX IF NOT EXISTS idx_questions_audit_status
  ON public.questions(audit_status);

DROP TRIGGER IF EXISTS touch_questions_updated_at ON public.questions;
CREATE TRIGGER touch_questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- TABLE: cyber_dojo_wisdom_quotes
-- ========================================
CREATE TABLE IF NOT EXISTS public.cyber_dojo_wisdom_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_title TEXT NOT NULL,
  source_file TEXT,
  quote_text TEXT NOT NULL,
  cyber_application TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_weight INT NOT NULL DEFAULT 1 CHECK (display_weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wisdom_quotes_active
  ON public.cyber_dojo_wisdom_quotes(active, display_weight);

DROP TRIGGER IF EXISTS touch_wisdom_quotes_updated_at ON public.cyber_dojo_wisdom_quotes;
CREATE TRIGGER touch_wisdom_quotes_updated_at
  BEFORE UPDATE ON public.cyber_dojo_wisdom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- TABLE: cyber_news_sources
-- ========================================
CREATE TABLE IF NOT EXISTS public.cyber_news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'web' CHECK (source_type IN ('web', 'rss', 'api')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cyber_news_sources_enabled_priority
  ON public.cyber_news_sources(enabled, priority);

DROP TRIGGER IF EXISTS touch_cyber_news_sources_updated_at ON public.cyber_news_sources;
CREATE TRIGGER touch_cyber_news_sources_updated_at
  BEFORE UPDATE ON public.cyber_news_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- TABLE: cyber_dojo_generated_katas
-- ========================================
CREATE TABLE IF NOT EXISTS public.cyber_dojo_generated_katas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dojo_id TEXT REFERENCES public.cyber_dojos(id) ON DELETE SET NULL,
  incident_investigation_id UUID REFERENCES public.incident_investigations(id) ON DELETE SET NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  scenario TEXT NOT NULL,
  task TEXT NOT NULL,
  difficulty INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'published')),
  published_kata_id UUID REFERENCES public.katas(id) ON DELETE SET NULL,
  created_by_agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  audit_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_katas_dojo_status
  ON public.cyber_dojo_generated_katas(dojo_id, status, created_at DESC);

DROP TRIGGER IF EXISTS touch_generated_katas_updated_at ON public.cyber_dojo_generated_katas;
CREATE TRIGGER touch_generated_katas_updated_at
  BEFORE UPDATE ON public.cyber_dojo_generated_katas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- TABLE: central_admin_campaigns
-- ========================================
CREATE TABLE IF NOT EXISTS public.central_admin_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  moment TEXT NOT NULL DEFAULT 'inicio' CHECK (moment IN ('inicio', 'sesion', 'salida')),
  duration_seconds INT NOT NULL DEFAULT 10 CHECK (duration_seconds > 0),
  validity_type TEXT NOT NULL DEFAULT 'indefinido' CHECK (validity_type IN ('sesiones', 'meses', 'indefinido')),
  validity_value INT,
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_central_admin_campaigns_active
  ON public.central_admin_campaigns(active, moment);

DROP TRIGGER IF EXISTS touch_central_admin_campaigns_updated_at ON public.central_admin_campaigns;
CREATE TRIGGER touch_central_admin_campaigns_updated_at
  BEFORE UPDATE ON public.central_admin_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========================================
-- ALTER: agent_configs allow Central Admin news agent
-- ========================================
ALTER TABLE public.agent_configs
  DROP CONSTRAINT IF EXISTS agent_configs_agent_code_check;

ALTER TABLE public.agent_configs
  ADD CONSTRAINT agent_configs_agent_code_check
  CHECK (agent_code IN (
    'incident-investigator',
    'question-auditor',
    'ciber-dojo-news-agent'
  ));

-- ========================================
-- VIEW: central admin question bank
-- ========================================
CREATE OR REPLACE VIEW public.central_admin_question_bank AS
SELECT
  q.id,
  q.dojo_id,
  d.name AS dojo_name,
  d.theme AS dojo_theme,
  q.order_num,
  q.source_type,
  q.audit_status,
  q.difficulty,
  q.kata_label,
  q.iso_control,
  q.question_text,
  q.question_type,
  q.options,
  q.answer_text,
  q.explanation,
  q.editable,
  q.active,
  q.generated_from_incident_id,
  q.audit_notes,
  q.created_at,
  q.updated_at
FROM public.questions q
LEFT JOIN public.cyber_dojos d ON d.id = q.dojo_id;

-- ========================================
-- FUNCTION: Publish generated kata into katas
-- ========================================
CREATE OR REPLACE FUNCTION public.publish_generated_kata(generated_kata_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_row public.cyber_dojo_generated_katas%ROWTYPE;
  new_kata_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish generated katas';
  END IF;

  SELECT *
  INTO source_row
  FROM public.cyber_dojo_generated_katas
  WHERE id = generated_kata_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generated kata not found: %', generated_kata_id;
  END IF;

  INSERT INTO public.katas (
    kata_code,
    name,
    description,
    teaching,
    estimated_minutes,
    required_belt,
    points_reward,
    steps,
    verification_type,
    active
  )
  VALUES (
    'GEN_' || replace(source_row.id::text, '-', '_'),
    source_row.title,
    source_row.scenario,
    source_row.task,
    20,
    CASE
      WHEN source_row.difficulty <= 1 THEN 'white'
      WHEN source_row.difficulty = 2 THEN 'yellow'
      WHEN source_row.difficulty = 3 THEN 'orange'
      WHEN source_row.difficulty = 4 THEN 'green'
      ELSE 'black'
    END,
    100 + (source_row.difficulty * 50),
    jsonb_build_array(jsonb_build_object(
      'title', source_row.title,
      'scenario', source_row.scenario,
      'task', source_row.task,
      'source_url', source_row.source_url
    )),
    'manual',
    TRUE
  )
  RETURNING id INTO new_kata_id;

  UPDATE public.cyber_dojo_generated_katas
  SET status = 'published',
      published_kata_id = new_kata_id
  WHERE id = generated_kata_id;

  RETURN new_kata_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_generated_kata(UUID) TO authenticated;

-- ========================================
-- RLS
-- ========================================
ALTER TABLE public.cyber_dojos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyber_dojo_wisdom_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyber_news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyber_dojo_generated_katas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.central_admin_campaigns ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cyber_dojos TO anon, authenticated;
GRANT SELECT ON public.cyber_dojo_wisdom_quotes TO anon, authenticated;
GRANT SELECT ON public.cyber_dojo_generated_katas TO anon, authenticated;
GRANT SELECT ON public.central_admin_campaigns TO anon, authenticated;
GRANT SELECT ON public.central_admin_question_bank TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cyber_dojos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cyber_dojo_wisdom_quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cyber_news_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cyber_dojo_generated_katas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.central_admin_campaigns TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojos' AND policyname = 'Public can view active cyber dojos'
  ) THEN
    CREATE POLICY "Public can view active cyber dojos"
      ON public.cyber_dojos FOR SELECT
      USING (status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojos' AND policyname = 'Admins can manage cyber dojos'
  ) THEN
    CREATE POLICY "Admins can manage cyber dojos"
      ON public.cyber_dojos FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojo_wisdom_quotes' AND policyname = 'Public can view active wisdom quotes'
  ) THEN
    CREATE POLICY "Public can view active wisdom quotes"
      ON public.cyber_dojo_wisdom_quotes FOR SELECT
      USING (active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojo_wisdom_quotes' AND policyname = 'Admins can manage wisdom quotes'
  ) THEN
    CREATE POLICY "Admins can manage wisdom quotes"
      ON public.cyber_dojo_wisdom_quotes FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_news_sources' AND policyname = 'Admins can manage cyber news sources'
  ) THEN
    CREATE POLICY "Admins can manage cyber news sources"
      ON public.cyber_news_sources FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojo_generated_katas' AND policyname = 'Public can view published generated katas'
  ) THEN
    CREATE POLICY "Public can view published generated katas"
      ON public.cyber_dojo_generated_katas FOR SELECT
      USING (status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cyber_dojo_generated_katas' AND policyname = 'Admins can manage generated katas'
  ) THEN
    CREATE POLICY "Admins can manage generated katas"
      ON public.cyber_dojo_generated_katas FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaigns' AND policyname = 'Public can view active campaigns'
  ) THEN
    CREATE POLICY "Public can view active campaigns"
      ON public.central_admin_campaigns FOR SELECT
      USING (
        active = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaigns' AND policyname = 'Admins can manage campaigns'
  ) THEN
    CREATE POLICY "Admins can manage campaigns"
      ON public.central_admin_campaigns FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ========================================
-- SEED: Dojos
-- ========================================
INSERT INTO public.cyber_dojos (
  id,
  name,
  theme,
  iso_control,
  status,
  manual_question_target,
  ai_question_target,
  display_order
)
VALUES
  ('dojo-phishing', 'Phishing y correo seguro', 'Correos fraudulentos, enlaces sospechosos y suplantacion', 'ISO 27001 A.6.3', 'active', 20, 30, 10),
  ('dojo-passwords', 'Contrasenas y MFA', 'Identidad, claves y doble factor', 'ISO 27001 A.5.17', 'active', 20, 30, 20),
  ('dojo-backups', 'Backups y continuidad', 'Respaldo, restauracion y ransomware', 'ISO 27001 A.8.13', 'draft', 20, 30, 30)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  theme = EXCLUDED.theme,
  iso_control = EXCLUDED.iso_control,
  status = EXCLUDED.status,
  manual_question_target = EXCLUDED.manual_question_target,
  ai_question_target = EXCLUDED.ai_question_target,
  display_order = EXCLUDED.display_order;

-- ========================================
-- SEED: 50 editable questions per dojo
-- ========================================
INSERT INTO public.questions (
  id,
  branch,
  order_num,
  iso_control,
  question_text,
  question_type,
  options,
  active,
  source_type,
  audit_status,
  dojo_id,
  difficulty,
  kata_label,
  answer_text,
  explanation,
  editable
)
SELECT
  d.id || '-' || CASE WHEN gs.n <= d.manual_question_target THEN 'manual' ELSE 'ai' END || '-' || lpad(gs.n::text, 2, '0') AS id,
  d.id AS branch,
  gs.n AS order_num,
  d.iso_control,
  CASE
    WHEN gs.n <= d.manual_question_target THEN
      'Pregunta manual ' || gs.n || ' sobre ' || d.theme
    ELSE
      'Pregunta IA ' || gs.n || ' sobre ' || d.theme
  END AS question_text,
  'escenario' AS question_type,
  jsonb_build_array(
    jsonb_build_object('valor', 'A', 'texto', 'Control correcto pendiente de configurar', 'correcta', true),
    jsonb_build_object('valor', 'B', 'texto', 'Distractor pendiente de configurar', 'correcta', false),
    jsonb_build_object('valor', 'C', 'texto', 'Distractor pendiente de configurar', 'correcta', false),
    jsonb_build_object('valor', 'D', 'texto', 'Distractor pendiente de configurar', 'correcta', false)
  ) AS options,
  TRUE AS active,
  CASE WHEN gs.n <= d.manual_question_target THEN 'manual' ELSE 'incident_investigation' END AS source_type,
  CASE WHEN gs.n <= d.manual_question_target THEN 'approved' ELSE 'pending' END AS audit_status,
  d.id AS dojo_id,
  LEAST(5, GREATEST(1, CEIL(gs.n / 10.0)::int)) AS difficulty,
  CASE
    WHEN gs.n >= 50 THEN 'Kata final'
    ELSE 'Kata ' || LEAST(7, GREATEST(1, CEIL(gs.n / 7.0)::int))
  END AS kata_label,
  CASE
    WHEN gs.n <= d.manual_question_target THEN 'Respuesta correcta pendiente de ajustar.'
    ELSE 'Respuesta generada pendiente de auditoria.'
  END AS answer_text,
  CASE
    WHEN gs.n <= d.manual_question_target THEN 'Explicacion pendiente de ajustar.'
    ELSE 'Justificacion generada pendiente de auditoria.'
  END AS explanation,
  TRUE AS editable
FROM public.cyber_dojos d
CROSS JOIN LATERAL generate_series(1, d.manual_question_target + d.ai_question_target) AS gs(n)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- SEED: Wisdom quotes from local books
-- ========================================
INSERT INTO public.cyber_dojo_wisdom_quotes (
  source_title,
  source_file,
  quote_text,
  cyber_application,
  tags,
  active,
  display_weight
)
VALUES
  (
    'El arte de la guerra - Sun Tzu',
    'frases/El_arte_de_la_guerra-Sun_Tzu.pdf',
    'Conoce al enemigo y conocete a ti mismo; en cien batallas no correras peligro.',
    'Antes de entrenar, identifica activos, usuarios criticos y tacticas del atacante. La defensa empieza con inventario, contexto y monitoreo.',
    ARRAY['estrategia', 'riesgo', 'monitoreo'],
    TRUE,
    3
  ),
  (
    'El arte de la guerra - Sun Tzu',
    'frases/El_arte_de_la_guerra-Sun_Tzu.pdf',
    'Toda guerra se basa en el engano.',
    'El phishing y la suplantacion explotan confianza. Verifica remitentes, dominios y urgencias antes de actuar.',
    ARRAY['phishing', 'ingenieria_social'],
    TRUE,
    3
  ),
  (
    'El arte de la guerra - Sun Tzu',
    'frases/El_arte_de_la_guerra-Sun_Tzu.pdf',
    'La victoria se decide antes de la batalla.',
    'Backups probados, MFA, parches y playbooks reducen el impacto antes de que el incidente ocurra.',
    ARRAY['preparacion', 'continuidad'],
    TRUE,
    2
  ),
  (
    'Bushido - El Codigo del Samurai',
    'frases/BUSHIDO_El_Codigo_del_Samurai.pdf',
    'La rectitud es el poder de decidir una conducta correcta.',
    'En ciberseguridad, rectitud significa reportar incidentes rapido, no ocultar errores y seguir controles aunque incomoden.',
    ARRAY['etica', 'reporte'],
    TRUE,
    2
  ),
  (
    'Bushido - El Codigo del Samurai',
    'frases/BUSHIDO_El_Codigo_del_Samurai.pdf',
    'El coraje verdadero vive cuando se hace lo correcto.',
    'Ante una alerta, el coraje operativo es detener una accion riesgosa, escalar evidencia y proteger los datos.',
    ARRAY['respuesta', 'alertas'],
    TRUE,
    2
  )
ON CONFLICT DO NOTHING;

-- ========================================
-- SEED: News sources
-- ========================================
INSERT INTO public.cyber_news_sources (name, url, source_type, enabled, priority, notes)
VALUES
  ('CISA Cybersecurity Advisories', 'https://www.cisa.gov/news-events/cybersecurity-advisories', 'web', TRUE, 10, 'Alertas y advisories oficiales.'),
  ('BleepingComputer', 'https://www.bleepingcomputer.com/', 'web', TRUE, 20, 'Noticias de incidentes y ransomware.'),
  ('The Hacker News', 'https://thehackernews.com/', 'web', TRUE, 30, 'Noticias de amenazas y vulnerabilidades.'),
  ('EcuCERT', 'https://www.ecucert.gob.ec/', 'web', TRUE, 40, 'Fuente local Ecuador.')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  enabled = EXCLUDED.enabled,
  priority = EXCLUDED.priority,
  notes = EXCLUDED.notes;

-- ========================================
-- SEED: News agent config
-- ========================================
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
  'ciber-dojo-news-agent',
  'Agente de Noticias para Ciber Dojo',
  'Busca noticias de ciberataques en fuentes configuradas y propone nuevas preguntas y simulaciones KATAS.',
  TRUE,
  '07:30:00',
  'America/Guayaquil',
  'Busca noticias recientes de ciberataques en las fuentes configuradas. Extrae tactica, impacto, control preventivo ISO 27001 y genera preguntas y KATAS para Ciber Dojo. Devuelve JSON estricto con generated_questions[] y generated_katas[].',
  1,
  jsonb_build_object(
    'max_questions_per_run', 10,
    'max_katas_per_run', 5,
    'requires_admin_review', true,
    'source_table', 'cyber_news_sources'
  )
)
ON CONFLICT (agent_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  trigger_time = EXCLUDED.trigger_time,
  timezone = EXCLUDED.timezone,
  prompt_template = EXCLUDED.prompt_template,
  investigation_window_days = EXCLUDED.investigation_window_days,
  extra_settings = EXCLUDED.extra_settings,
  updated_at = NOW();

INSERT INTO public.agent_provider_assignments (agent_config_id, provider_key, priority, active)
SELECT ac.id, defaults.provider_key, defaults.priority, TRUE
FROM (
  VALUES
    ('ciber-dojo-news-agent', 'deepseek', 1),
    ('ciber-dojo-news-agent', 'kimi', 2),
    ('ciber-dojo-news-agent', 'claude', 3)
) AS defaults(agent_code, provider_key, priority)
JOIN public.agent_configs ac ON ac.agent_code = defaults.agent_code
ON CONFLICT (agent_config_id, provider_key) DO UPDATE SET
  priority = EXCLUDED.priority,
  active = EXCLUDED.active;

-- ========================================
-- SEED: Campaigns
-- ========================================
INSERT INTO public.central_admin_campaigns (name, moment, duration_seconds, validity_type, message, active)
VALUES
  ('Plan de soporte MFA', 'inicio', 12, 'meses', 'Activa el paquete de soporte para configurar MFA en tu negocio.', TRUE),
  ('Curso anti-phishing', 'sesion', 8, 'sesiones', 'Refuerza a tu equipo con el curso express anti-phishing.', TRUE)
ON CONFLICT DO NOTHING;
