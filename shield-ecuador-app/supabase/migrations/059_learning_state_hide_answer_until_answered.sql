-- learning_state returned the whole question document — including the correct option index, the
-- explanation (which restates it) and the feedback texts — BEFORE the user answered, so the
-- answer was one look at the network tab away. learning_exam_view already strips exactly these
-- keys while an attempt is unfinished; the practice flow now does the same for a question that
-- has not been answered yet. Once answered (learning_answer / learning_next re-read the state
-- through this function) the full document is returned, which is what the UI needs to explain
-- the answer.
CREATE OR REPLACE FUNCTION public.learning_state(p_dojo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d learning_dojos; p learning_progress; q jsonb; n int; current_rank int;
  chosen text[] := '{}'; candidate learning_items; level int; turn int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para guardar tu avance.'; END IF;
  SELECT * INTO STRICT d FROM learning_dojos WHERE id = p_dojo;
  SELECT coalesce((SELECT x.rank FROM users u JOIN learning_dojos x ON x.db_belt = u.belt WHERE u.id = auth.uid()), 0) INTO current_rank;
  IF current_rank < d.rank THEN RAISE EXCEPTION 'Primero completa tu cinturón actual.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM learning_progress WHERE user_id=auth.uid() AND dojo_id=d.id) THEN
    FOREACH level IN ARRAY ARRAY[1,2,3] LOOP
      FOR turn IN 1..10 LOOP
        SELECT * INTO candidate FROM learning_items i WHERE i.kind='question' AND i.belt=d.belt
          AND i.version=d.version AND i.sublevel=level AND NOT(i.id=ANY(chosen))
          ORDER BY (SELECT count(*) FROM learning_items used WHERE used.id=ANY(chosen) AND used.family=i.family), random() LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'Faltan preguntas revisadas para este dojo.'; END IF;
        chosen := array_append(chosen,candidate.id);
      END LOOP;
    END LOOP;
    INSERT INTO learning_progress(user_id, dojo_id, version, question_ids)
      VALUES (auth.uid(), d.id, d.version, chosen) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO STRICT p FROM learning_progress WHERE user_id = auth.uid() AND dojo_id = d.id;
  SELECT content INTO STRICT q FROM learning_items WHERE id = p.question_ids[p.cursor + 1];
  SELECT count(*) INTO n FROM jsonb_object_keys(p.answers);
  IF NOT (p.answers ? (q->>'id')) THEN
    q := q - ARRAY['correct','explanation','feedback_correct','feedback_incorrect','sources'];
  END IF;
  RETURN jsonb_build_object('dojo',d.id,'cursor',p.cursor,'answered',n,'total',30,
    'complete',n = 30,'question',q,'selected',p.answers->(q->>'id'),'version',p.version);
END $$;
