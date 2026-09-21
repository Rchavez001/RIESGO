-- The match screen needs to say "Pregunta N de M"; start_match now also returns the number of questions.

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
    'remaining_seconds', remaining, 'answered_so_far', attempt.current_question_index,
    'total_questions', cardinality(m.question_ids));
END;
$$;
