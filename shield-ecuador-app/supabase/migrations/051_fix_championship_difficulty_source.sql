-- Bugfix: _championship_time_limit/_championship_question_payload read
-- content->>'difficulty' assuming a 1-5 scale, but real seed data uses a
-- GLOBAL absolute scale (belt_rank*3 + sublevel — e.g. negro/black is rank
-- 6, so its questions are difficulty 19/20/21). Bucketing that against
-- <=2/=3/else meant every black-belt question landed in "hard", and easy/
-- medium time limits were never reachable for the only belt this feature
-- actually uses. learning_items.sublevel (a real column, CHECK 1-3) is the
-- belt-RELATIVE tier that was actually wanted: 1=easy, 2=medium, 3=hard.

DROP FUNCTION IF EXISTS public._championship_time_limit(UUID, INT);

CREATE OR REPLACE FUNCTION public._championship_time_limit(p_championship_id UUID, p_sublevel INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champ public.championships%ROWTYPE;
BEGIN
  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF p_sublevel <= 1 THEN RETURN champ.time_limit_easy_seconds; END IF;
  IF p_sublevel = 2 THEN RETURN champ.time_limit_medium_seconds; END IF;
  RETURN champ.time_limit_hard_seconds;
END;
$$;

CREATE OR REPLACE FUNCTION public._championship_question_payload(p_match_id UUID, p_index INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.championship_matches%ROWTYPE;
  q_id TEXT;
  item public.learning_items%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  q_id := m.question_ids[p_index + 1];
  IF q_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO item FROM public.learning_items WHERE id = q_id;

  RETURN jsonb_build_object(
    'index', p_index,
    'question_id', q_id,
    'prompt', item.content->>'prompt',
    'options', item.content->'options',
    'time_limit_seconds', public._championship_time_limit(m.championship_id, item.sublevel)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.championship_answer_question(p_match_id UUID, p_answer_index INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.championship_matches%ROWTYPE;
  attempt public.championship_match_attempts%ROWTYPE;
  q_id TEXT;
  item public.learning_items%ROWTYPE;
  time_limit INT;
  elapsed NUMERIC;
  is_correct BOOLEAN;
  next_question JSONB;
  opponent_attempt public.championship_match_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesion.'; END IF;

  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combate no encontrado.'; END IF;

  SELECT * INTO attempt FROM public.championship_match_attempts
  WHERE match_id = p_match_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No has iniciado este combate.'; END IF;
  IF attempt.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Ya completaste este combate.'; END IF;

  q_id := m.question_ids[attempt.current_question_index + 1];
  IF q_id IS NULL THEN RAISE EXCEPTION 'No hay una pregunta activa.'; END IF;

  SELECT * INTO item FROM public.learning_items WHERE id = q_id;
  time_limit := public._championship_time_limit(m.championship_id, item.sublevel);
  elapsed := EXTRACT(EPOCH FROM (NOW() - attempt.current_question_started_at));

  is_correct := (elapsed <= time_limit) AND (p_answer_index = (item.content->>'correct')::INT);

  UPDATE public.championship_match_attempts
  SET
    answers = attempt.answers || jsonb_build_object(
      'question_id', q_id, 'correct', is_correct, 'time_taken_seconds', LEAST(elapsed, time_limit)
    ),
    score = attempt.score + CASE WHEN is_correct THEN 1 ELSE 0 END,
    total_time_seconds = attempt.total_time_seconds + LEAST(elapsed, time_limit),
    current_question_index = attempt.current_question_index + 1,
    current_question_started_at = NOW()
  WHERE id = attempt.id;

  next_question := public._championship_question_payload(p_match_id, attempt.current_question_index + 1);

  IF next_question IS NULL THEN
    UPDATE public.championship_match_attempts
    SET finished_at = NOW()
    WHERE id = attempt.id;

    IF m.player2_id IS NOT NULL THEN
      SELECT * INTO opponent_attempt FROM public.championship_match_attempts
      WHERE match_id = p_match_id AND user_id <> auth.uid();

      IF FOUND AND opponent_attempt.finished_at IS NOT NULL THEN
        UPDATE public.championship_matches
        SET status = 'completed',
            winner_id = CASE
              WHEN (attempt.score + CASE WHEN is_correct THEN 1 ELSE 0 END) > opponent_attempt.score THEN auth.uid()
              WHEN opponent_attempt.score > (attempt.score + CASE WHEN is_correct THEN 1 ELSE 0 END) THEN opponent_attempt.user_id
              WHEN (attempt.total_time_seconds + LEAST(elapsed, time_limit)) <= opponent_attempt.total_time_seconds THEN auth.uid()
              ELSE opponent_attempt.user_id
            END
        WHERE id = p_match_id;
      ELSE
        UPDATE public.championship_matches SET status = 'in_progress' WHERE id = p_match_id AND status = 'scheduled';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'correct', is_correct,
    'correct_index', (item.content->>'correct')::INT,
    'explanation', item.content->>'explanation',
    'next_question', next_question,
    'finished', next_question IS NULL
  );
END;
$$;

-- DROP+CREATE above reset _championship_time_limit's grants to the default
-- (EXECUTE to PUBLIC) — re-apply the lockdown from migration 050.
REVOKE ALL ON FUNCTION public._championship_time_limit(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._championship_question_payload(UUID, INT) FROM PUBLIC, anon, authenticated;
