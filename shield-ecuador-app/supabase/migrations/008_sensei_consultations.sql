-- supabase/migrations/008_sensei_consultations.sql
--
-- Registro de consultas al Sensei IA, validacion tematica, auditoria y feedback
-- para analitica en Ciber Dojo Central Admin.

CREATE TABLE IF NOT EXISTS public.sensei_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  normalized_topic TEXT,
  is_cybersecurity BOOLEAN NOT NULL DEFAULT FALSE,
  validation_reason TEXT,
  answer_text TEXT,
  answer_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_question_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  used_bank BOOLEAN NOT NULL DEFAULT FALSE,
  used_web BOOLEAN NOT NULL DEFAULT FALSE,
  auditor_provider TEXT,
  auditor_replaced_answer BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'answered' CHECK (status IN ('answered', 'out_of_scope', 'failed')),
  feedback_helpful BOOLEAN,
  feedback_text TEXT,
  sentiment_label TEXT CHECK (sentiment_label IN ('positivo', 'neutral', 'negativo')),
  sentiment_score NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensei_consultations_created
  ON public.sensei_consultations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensei_consultations_user
  ON public.sensei_consultations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensei_consultations_sentiment
  ON public.sensei_consultations(sentiment_label);

DROP TRIGGER IF EXISTS touch_sensei_consultations_updated_at ON public.sensei_consultations;
CREATE TRIGGER touch_sensei_consultations_updated_at
  BEFORE UPDATE ON public.sensei_consultations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.sensei_consultations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.sensei_consultations TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sensei_consultations'
      AND policyname = 'Users can create own sensei consultations'
  ) THEN
    CREATE POLICY "Users can create own sensei consultations"
      ON public.sensei_consultations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sensei_consultations'
      AND policyname = 'Users can view own sensei consultations'
  ) THEN
    CREATE POLICY "Users can view own sensei consultations"
      ON public.sensei_consultations FOR SELECT
      USING (auth.uid() = user_id OR public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sensei_consultations'
      AND policyname = 'Users can update own sensei feedback'
  ) THEN
    CREATE POLICY "Users can update own sensei feedback"
      ON public.sensei_consultations FOR UPDATE
      USING (auth.uid() = user_id OR public.is_admin())
      WITH CHECK (auth.uid() = user_id OR public.is_admin());
  END IF;
END $$;

CREATE OR REPLACE VIEW public.sensei_consultation_stats AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(*) AS total_consultations,
  COUNT(*) FILTER (WHERE is_cybersecurity) AS cybersecurity_consultations,
  COUNT(*) FILTER (WHERE NOT is_cybersecurity) AS out_of_scope_consultations,
  COUNT(*) FILTER (WHERE feedback_helpful IS TRUE) AS helpful_yes,
  COUNT(*) FILTER (WHERE feedback_helpful IS FALSE) AS helpful_no,
  COUNT(*) FILTER (WHERE sentiment_label = 'positivo') AS positive_feedback,
  COUNT(*) FILTER (WHERE sentiment_label = 'neutral') AS neutral_feedback,
  COUNT(*) FILTER (WHERE sentiment_label = 'negativo') AS negative_feedback
FROM public.sensei_consultations
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.sensei_consultation_stats TO authenticated;
