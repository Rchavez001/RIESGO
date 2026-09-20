-- minigame_check_answer returned the correct index and the explanation for ANY learning_items question
-- id, whether or not the caller had been served that question. That is an answer oracle over the whole
-- practice bank — exactly what migration 059 closed for learning_state — and it also let a caller probe
-- ids of questions belonging to dojos they have not unlocked. Now a question can only be graded after
-- minigame_random_question served it to this same user.
CREATE TABLE IF NOT EXISTS public.minigame_served (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  served_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
ALTER TABLE public.minigame_served ENABLE ROW LEVEL SECURITY; -- no policies: only the SECURITY DEFINER functions touch it
REVOKE ALL ON public.minigame_served FROM PUBLIC, anon, authenticated;

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
  IF coalesce(array_length(p_exclude, 1), 0) > 500 THEN
    RAISE EXCEPTION 'Solicitud no válida.';
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

  DELETE FROM public.minigame_served WHERE user_id = auth.uid() AND served_at < now() - interval '1 day';
  INSERT INTO public.minigame_served(user_id, question_id) VALUES (auth.uid(), candidate.id)
    ON CONFLICT (user_id, question_id) DO UPDATE SET served_at = now();

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

  IF NOT EXISTS (SELECT 1 FROM public.minigame_served WHERE user_id = auth.uid() AND question_id = p_question_id) THEN
    RAISE EXCEPTION 'Pregunta no encontrada.';
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
