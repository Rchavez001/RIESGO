-- Match-taking RPCs. Time limits are enforced SERVER-SIDE per question (via
-- current_question_started_at, stamped fresh each time a question is
-- served) — a client-side countdown alone could be trivially bypassed by
-- anyone editing JS in devtools, which would make the whole tournament
-- untrustworthy.

ALTER TABLE public.championship_match_attempts
  ADD COLUMN IF NOT EXISTS current_question_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_question_index INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._championship_time_limit(p_championship_id UUID, p_difficulty INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champ public.championships%ROWTYPE;
BEGIN
  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF p_difficulty <= 2 THEN RETURN champ.time_limit_easy_seconds; END IF;
  IF p_difficulty = 3 THEN RETURN champ.time_limit_medium_seconds; END IF;
  RETURN champ.time_limit_hard_seconds;
END;
$$;

-- Returns the question at the given 0-based index for a match, stripped of
-- its answer key, plus the time limit for it. Shared by start_match and
-- answer_question so "what question is this" is computed one way only.
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
  difficulty INT;
BEGIN
  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  q_id := m.question_ids[p_index + 1]; -- Postgres arrays are 1-indexed
  IF q_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO item FROM public.learning_items WHERE id = q_id;
  difficulty := COALESCE((item.content->>'difficulty')::INT, 1);

  RETURN jsonb_build_object(
    'index', p_index,
    'question_id', q_id,
    'prompt', item.content->>'prompt',
    'options', item.content->'options',
    'time_limit_seconds', public._championship_time_limit(m.championship_id, difficulty)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.championship_start_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.championship_matches%ROWTYPE;
  attempt public.championship_match_attempts%ROWTYPE;
  question JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesion.'; END IF;

  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combate no encontrado.'; END IF;
  IF auth.uid() NOT IN (m.player1_id, m.player2_id) THEN
    RAISE EXCEPTION 'No eres participante de este combate.';
  END IF;
  IF NOW() < m.scheduled_at THEN RAISE EXCEPTION 'Este combate todavia no ha comenzado.'; END IF;
  IF NOW() > m.window_closes_at THEN RAISE EXCEPTION 'La ventana de este combate ya cerro.'; END IF;

  SELECT * INTO attempt FROM public.championship_match_attempts
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.championship_match_attempts (match_id, user_id, started_at, current_question_started_at, current_question_index)
    VALUES (p_match_id, auth.uid(), NOW(), NOW(), 0)
    RETURNING * INTO attempt;
  ELSIF attempt.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ya completaste este combate.';
  ELSE
    -- Resuming after a refresh/disconnect: re-stamp the current question's
    -- start time so they aren't penalized for time spent away, but don't
    -- let re-opening the tab rewind to an earlier question.
    UPDATE public.championship_match_attempts
    SET current_question_started_at = NOW()
    WHERE id = attempt.id;
  END IF;

  question := public._championship_question_payload(p_match_id, attempt.current_question_index);
  RETURN jsonb_build_object('match_id', p_match_id, 'question', question, 'score_so_far', attempt.score);
END;
$$;

REVOKE ALL ON FUNCTION public.championship_start_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.championship_start_match(UUID) TO authenticated;

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
  difficulty INT;
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
  difficulty := COALESCE((item.content->>'difficulty')::INT, 1);
  time_limit := public._championship_time_limit(m.championship_id, difficulty);
  elapsed := EXTRACT(EPOCH FROM (NOW() - attempt.current_question_started_at));

  -- A late answer counts as wrong regardless of what was submitted — this
  -- is what makes the per-question timer actually mean something instead
  -- of being cosmetic.
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

    -- If the opponent has already finished too, decide the match now:
    -- higher score wins, tied score is broken by faster total time.
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

REVOKE ALL ON FUNCTION public.championship_answer_question(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.championship_answer_question(UUID, INT) TO authenticated;
