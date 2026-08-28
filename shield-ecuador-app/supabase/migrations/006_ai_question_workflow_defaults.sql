-- supabase/migrations/006_ai_question_workflow_defaults.sql

-- Default operational target:
-- - 10 manual/base questions per dojo/module, maintained from the admin UI.
-- - 10 generated questions per incident-investigator run, audited before activation.

UPDATE agent_configs
SET
  extra_settings = COALESCE(extra_settings, '{}'::jsonb)
    || jsonb_build_object('max_questions_per_run', 10, 'create_alerts', true),
  prompt_template = 'Analiza los incidentes de ciberseguridad reportados para el dia anterior. Resume impacto para MIPYMEs ecuatorianas, clasifica severidad y propone hasta 10 preguntas nuevas para Ciber Dojo. Las preguntas deben estar alineadas a ISO 27001, usar lenguaje simple para PYMEs ecuatorianas, incluir 4 opciones cuando aplique y devolver JSON estricto con incidents[] y generated_questions[].'
WHERE agent_code = 'incident-investigator';

UPDATE agent_configs
SET
  extra_settings = COALESCE(extra_settings, '{}'::jsonb)
    || jsonb_build_object('auto_activate_approved', true),
  prompt_template = 'Audita las preguntas generadas automaticamente para Ciber Dojo antes de activarlas. Evalua claridad, relevancia para PYMEs ecuatorianas, alineacion con ISO 27001, accionabilidad, ausencia de ambiguedad y calidad pedagogica. Aprueba solo preguntas seguras y utiles. Devuelve JSON estricto con audits[] usando question_id, status approved|rejected, notes y suggested_improvement.'
WHERE agent_code = 'question-auditor';
