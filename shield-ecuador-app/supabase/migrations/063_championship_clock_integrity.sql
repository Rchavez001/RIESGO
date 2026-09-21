-- Row 17 (/campeonato/combate/:id): the per-question clock was not trustworthy.
--  1. championship_start_match re-stamped the question's start time on every call, so refreshing the page
--     restarted the timer with the same question on screen: unlimited time to look the answer up.
--  2. championship_answer_question started the NEXT question's clock at the moment of answering, i.e.
--     while the player was still reading the explanation, so honest players lost seconds the UI never showed.
--  3. No row lock: a double submit could grade and score the same question twice.
-- Now the clock of a question starts when it is opened (start_match) and keeps running across reloads; the
-- answer call no longer returns the next question's text, the client opens it with start_match.
-- Also accented user-facing messages.

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
  time_limit INT;
  remaining INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;

  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combate no encontrado.'; END IF;
  IF auth.uid() NOT IN (m.player1_id, m.player2_id) THEN
    RAISE EXCEPTION 'No eres participante de este combate.';
  END IF;
  IF NOW() < m.scheduled_at THEN RAISE EXCEPTION 'Este combate todavía no ha comenzado.'; END IF;
  IF NOW() > m.window_closes_at THEN RAISE EXCEPTION 'La ventana de este combate ya cerró.'; END IF;

  SELECT * INTO attempt FROM public.championship_match_attempts
  WHERE match_id = p_match_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.championship_match_attempts (match_id, user_id, started_at, current_question_started_at, current_question_index)
    VALUES (p_match_id, auth.uid(), NOW(), NOW(), 0)
    RETURNING * INTO attempt;
  ELSIF attempt.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ya completaste este combate.';
  ELSIF attempt.current_question_started_at IS NULL THEN
    -- The previous question was answered and this one is being opened now: its clock starts here.
    UPDATE public.championship_match_attempts SET current_question_started_at = NOW()
    WHERE id = attempt.id RETURNING * INTO attempt;
  END IF;
  -- Otherwise the question was already shown and its clock is running: re-opening the page (refresh, second
  -- tab) must NOT restart it — that used to give unlimited time to look the answer up and reload.

  question := public._championship_question_payload(p_match_id, attempt.current_question_index);
  time_limit := (question ->> 'time_limit_seconds')::INT;
  remaining := GREATEST(0, CEIL(time_limit - EXTRACT(EPOCH FROM (NOW() - attempt.current_question_started_at))))::INT;
  RETURN jsonb_build_object('match_id', p_match_id, 'question', question, 'score_so_far', attempt.score,
    'remaining_seconds', remaining, 'answered_so_far', attempt.current_question_index);
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;

  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combate no encontrado.'; END IF;

  SELECT * INTO attempt FROM public.championship_match_attempts
  WHERE match_id = p_match_id AND user_id = auth.uid()
  FOR UPDATE; -- a double submit must not grade (and score) the same question twice
  IF NOT FOUND THEN RAISE EXCEPTION 'No has iniciado este combate.'; END IF;
  IF attempt.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Ya completaste este combate.'; END IF;

  IF attempt.current_question_started_at IS NULL THEN RAISE EXCEPTION 'Abre la siguiente pregunta antes de responder.'; END IF;

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
    current_question_started_at = NULL -- the clock of the next question starts when it is opened (championship_start_match)
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
    'has_next', next_question IS NOT NULL,
    'finished', next_question IS NULL
  );
END;
$$;
