-- Admin console › Preguntas abiertas: what people actually ask the Sensei, grouped by detected topic.
-- Aggregated in the database (PostgREST cannot GROUP BY) and callable only with the service role.
CREATE OR REPLACE FUNCTION public.admin_sensei_topics(p_limit int DEFAULT 15) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(t ORDER BY (t->>'total')::int DESC, t->>'topic'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'topic', coalesce(nullif(btrim(normalized_topic), ''), 'sin tema'),
      'total', count(*),
      'out_of_scope', count(*) FILTER (WHERE NOT is_cybersecurity),
      'helpful', count(*) FILTER (WHERE feedback_helpful IS TRUE),
      'not_helpful', count(*) FILTER (WHERE feedback_helpful IS FALSE),
      'last_at', max(created_at)
    ) AS t
    FROM sensei_consultations
    GROUP BY coalesce(nullif(btrim(normalized_topic), ''), 'sin tema')
    ORDER BY count(*) DESC
    LIMIT greatest(1, least(coalesce(p_limit, 15), 50))
  ) x;
$$;
REVOKE ALL ON FUNCTION public.admin_sensei_topics(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sensei_topics(int) TO service_role;
