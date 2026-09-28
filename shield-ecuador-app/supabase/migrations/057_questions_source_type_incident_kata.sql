-- RF-18/RF-19: security-kata-convert publishes real incidents as quiz
-- questions with source_type='incident_kata' — extend the check constraint
-- the same way 031_news_agent_sources_and_report.sql added 'news_generated'.
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_source_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_source_type_check
  CHECK (source_type IN ('manual', 'incident_investigation', 'audited_generated', 'news_generated', 'incident_kata'));
