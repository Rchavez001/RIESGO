-- Admin console › Dojos y progreso: one aggregate per dojo (bank size, learners, exam results) so the panel
-- shows what is really published and how people are progressing, instead of a browser-local draft.
-- Only the service role (the admin proxy) may call it; the counts are not meant for end users.
CREATE OR REPLACE FUNCTION public.admin_dojo_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'rank', d.rank, 'title', d.title, 'belt', d.belt, 'exam_code', d.exam_code, 'version', d.version,
    'questions', (SELECT count(*) FROM learning_items i WHERE i.kind = 'question' AND i.belt = d.belt AND i.version = d.version),
    'cases', (SELECT count(*) FROM learning_items i WHERE i.kind = 'case' AND i.belt = d.belt AND i.version = d.version),
    'started', (SELECT count(*) FROM learning_progress p WHERE p.dojo_id = d.id),
    'finished_practice', (SELECT count(*) FROM learning_progress p WHERE p.dojo_id = d.id AND (SELECT count(*) FROM jsonb_object_keys(p.answers)) >= 30),
    'exam_takers', (SELECT count(DISTINCT a.user_id) FROM learning_attempts a WHERE a.dojo_id = d.id AND a.finished_at IS NOT NULL),
    'passed', (SELECT count(DISTINCT a.user_id) FROM learning_attempts a WHERE a.dojo_id = d.id AND a.passed)
  ) ORDER BY d.rank), '[]'::jsonb)
  FROM learning_dojos d;
$$;
REVOKE ALL ON FUNCTION public.admin_dojo_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dojo_stats() TO service_role;
