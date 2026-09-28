-- Completes the "ciber-dojo-news-agent" that migrations 007/011/024 already
-- registered in agent_configs/agent_provider_assignments (and even created
-- a real cyber_news_sources table + RLS for) but never finished: no edge
-- function existed to actually do the fetching/generation, so the admin
-- UI's "Ejecutar ahora" has been a client-side template mock ever since.
--
-- This migration adds only what's genuinely still missing: provenance
-- columns on `questions` so a report can show what was extracted and from
-- where, and a new source_type so news-generated content is distinguishable
-- from incident-investigator output. cyber_news_sources itself, its RLS,
-- and its seed rows already exist (007_central_admin_ciber_dojo.sql).

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_source_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_source_type_check
  CHECK (source_type IN ('manual', 'incident_investigation', 'audited_generated', 'news_generated'));

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_title TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_questions_news_generated
  ON public.questions(source_type, extracted_at DESC)
  WHERE source_type = 'news_generated';
