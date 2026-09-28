-- Bridges the news-agent question pipeline (public.questions, source_type =
-- 'news_generated') into the real "Desafiando al Sensei" minigame data
-- (public.learning_items), which until now had zero connection to it —
-- confirmed by inspection: learning_items has no dojo/source/created_at
-- column, and every write path elsewhere is either a static seed or the
-- unrelated katas-publishing flow (publish_generated_kata).
--
-- Trigger: the moment an admin sets a news-generated question's
-- audit_status to 'approved', it's synced into learning_items so it can
-- actually be served by minigame_random_question(). Difficulty (1-5) maps
-- onto the 7 real belts via learning_dojos.rank — since 5 doesn't divide
-- evenly into 7, this mapping is a deterministic approximation (skips
-- amarillo/azul) documented inline; a manual override wasn't asked for and
-- can be added later if this bugs anyone.
--
-- Replacement rule (per explicit instruction): at most one news-agent
-- sourced learning_item per (source_dojo_id, belt) pair — approving a new
-- question for a dojo+belt combination that already has one *replaces* it
-- (same id, refreshed content/created_at) rather than accumulating forever.
-- Enforced by a partial unique index + upsert, so it's atomic by construction
-- rather than a separate "find the oldest and delete" step.

ALTER TABLE public.learning_items
  ADD COLUMN IF NOT EXISTS source_dojo_id TEXT,
  ADD COLUMN IF NOT EXISTS source_question_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS learning_items_one_per_dojo_belt
  ON public.learning_items(source_dojo_id, belt)
  WHERE source_dojo_id IS NOT NULL;

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

  -- 1-5 difficulty -> 0-6 belt rank. Not a clean 1:1 (5 values into 7 slots),
  -- so this rounds to the nearest rank, which skips rank 1 (amarillo) and
  -- rank 4 (azul) entirely. Documented, not hidden — see module comment.
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

-- Admin-gated wrapper for manual/on-demand re-sync from the admin panel.
CREATE OR REPLACE FUNCTION public.sync_question_to_learning_item(p_question_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can sync questions into the learning bank';
  END IF;
  RETURN public._sync_question_to_learning_item(p_question_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_question_to_learning_item(TEXT) TO authenticated;

-- Trigger path: fires on the same UPDATE the admin panel's "Aprobar y
-- activar" button already performs (audit_status -> 'approved'), so nothing
-- in central-admin-app has to remember to call an extra step. Runs as the
-- function owner (SECURITY DEFINER on the internal function), so it works
-- regardless of whether the approving session is an admin's real Supabase
-- Auth JWT or the central-admin-app's service-role proxy.
CREATE OR REPLACE FUNCTION public.trigger_sync_approved_news_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type = 'news_generated'
     AND NEW.audit_status = 'approved'
     AND OLD.audit_status IS DISTINCT FROM 'approved' THEN
    PERFORM public._sync_question_to_learning_item(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_approved_news_question ON public.questions;
CREATE TRIGGER sync_approved_news_question
  AFTER UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_approved_news_question();
