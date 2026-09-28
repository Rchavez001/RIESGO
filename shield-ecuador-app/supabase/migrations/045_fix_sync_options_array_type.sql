-- Bugfix for 044: options_arr was declared JSONB but populated via
-- array_agg() over text, which returns a Postgres text[] — assigning that
-- into a jsonb-typed plpgsql variable implicitly casts the array's literal
-- text representation ('{"a","b"}') as if it were JSON, which fails
-- ("invalid input syntax for type json ... Expected ':', but found ','")
-- the moment a question is approved, since that's exactly when the trigger
-- calls this function. Declaring it TEXT[] and converting with to_jsonb()
-- (already done at the call site building new_content) fixes it.

CREATE OR REPLACE FUNCTION public._sync_question_to_learning_item(p_question_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.questions%ROWTYPE;
  target_belt TEXT;
  target_rank INT;
  options_arr TEXT[];
  correct_idx INT;
  item_id TEXT;
  new_content JSONB;
BEGIN
  SELECT * INTO q FROM public.questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found: %', p_question_id;
  END IF;

  IF q.audit_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Question % is not approved (audit_status=%)', p_question_id, q.audit_status;
  END IF;

  target_rank := ROUND((COALESCE(q.difficulty, 1) - 1) * 6.0 / 4.0)::INT;
  target_rank := LEAST(GREATEST(target_rank, 0), 6);

  SELECT belt INTO target_belt FROM public.learning_dojos WHERE rank = target_rank;
  IF target_belt IS NULL THEN
    RAISE EXCEPTION 'No learning_dojos row for rank %', target_rank;
  END IF;

  SELECT array_agg(elem ->> 'texto' ORDER BY ord)
  INTO options_arr
  FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord);

  SELECT (ord - 1)
  INTO correct_idx
  FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord)
  WHERE (elem ->> 'correcta')::BOOLEAN IS TRUE
  LIMIT 1;

  IF options_arr IS NULL OR correct_idx IS NULL THEN
    RAISE EXCEPTION 'Question % has no usable options/correct answer to sync', p_question_id;
  END IF;

  item_id := 'gen-' || q.id;

  new_content := jsonb_build_object(
    'id', item_id,
    'version', 'news-agent-1.0',
    'kind', 'question',
    'belt', target_belt,
    'belt_rank', target_rank,
    'family', COALESCE(q.kata_label, 'Noticia'),
    'topic', COALESCE(q.kata_label, 'Noticia'),
    'difficulty', q.difficulty,
    'sublevel', 1,
    'prompt', q.question_text,
    'options', to_jsonb(options_arr),
    'correct', correct_idx,
    'explanation', COALESCE(q.explanation, ''),
    'generated_at', COALESCE(q.extracted_at, NOW()),
    'sources', jsonb_build_array(q.source_url)
  );

  INSERT INTO public.learning_items (
    id, version, kind, belt, sublevel, family, content,
    source_dojo_id, source_question_id, created_at
  )
  VALUES (
    item_id, 'news-agent-1.0', 'question', target_belt, 1, COALESCE(q.kata_label, 'Noticia'), new_content,
    q.dojo_id, q.id, NOW()
  )
  ON CONFLICT (source_dojo_id, belt) WHERE source_dojo_id IS NOT NULL
  DO UPDATE SET
    id = EXCLUDED.id,
    family = EXCLUDED.family,
    content = EXCLUDED.content,
    source_question_id = EXCLUDED.source_question_id,
    created_at = NOW();

  RETURN item_id;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_question_to_learning_item(TEXT) FROM PUBLIC, anon, authenticated;
