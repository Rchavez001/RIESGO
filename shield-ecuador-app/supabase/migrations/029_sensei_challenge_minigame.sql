-- "Desafiando al Sensei" minigame: read-only access to the real question bank
-- for a side tic-tac-toe minigame that never touches belt, points, dojo
-- progress or exam attempts. Two functions, same anti-cheat shape as the rest
-- of the learning_* system: the client never receives `correct`/`explanation`
-- until it explicitly asks to grade an answer.

CREATE OR REPLACE FUNCTION public.minigame_random_question(p_exclude text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  user_belt text;
  item_belt text;
  candidate learning_items;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesion para jugar.';
  END IF;

  SELECT belt INTO user_belt FROM public.users WHERE id = auth.uid();
  SELECT d.belt INTO item_belt FROM public.learning_dojos d WHERE d.db_belt = user_belt;

  IF item_belt IS NULL THEN
    item_belt := 'blanco';
  END IF;

  SELECT * INTO candidate
  FROM public.learning_items i
  WHERE i.kind = 'question'
    AND i.belt = item_belt
    AND NOT (i.id = ANY(coalesce(p_exclude, '{}')))
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN candidate.content - ARRAY['correct', 'explanation', 'feedback_correct', 'feedback_incorrect', 'sources'];
END;
$$;

CREATE OR REPLACE FUNCTION public.minigame_check_answer(p_question_id text, p_answer int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item learning_items;
  is_correct boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesion para jugar.';
  END IF;

  SELECT * INTO item FROM public.learning_items WHERE id = p_question_id AND kind = 'question';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pregunta no encontrada.';
  END IF;

  IF p_answer IS NULL OR p_answer NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'Elige una de las cuatro respuestas.';
  END IF;

  is_correct := (p_answer = (item.content->>'correct')::int);

  RETURN jsonb_build_object(
    'correct', is_correct,
    'correct_index', (item.content->>'correct')::int,
    'explanation', item.content->>'explanation'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.minigame_random_question(text[]), public.minigame_check_answer(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minigame_random_question(text[]), public.minigame_check_answer(text, int) TO authenticated;
