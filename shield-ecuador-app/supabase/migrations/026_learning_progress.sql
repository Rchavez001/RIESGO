-- Account-scoped learning, immutable answers, private case bank and atomic grading.
CREATE TABLE public.learning_items (
  id text PRIMARY KEY, version text NOT NULL, kind text NOT NULL CHECK (kind IN ('question','case')),
  belt text NOT NULL, sublevel int NOT NULL CHECK (sublevel BETWEEN 1 AND 3),
  family text NOT NULL, content jsonb NOT NULL
);
CREATE TABLE public.learning_dojos (
  id text PRIMARY KEY, belt text UNIQUE NOT NULL, db_belt text UNIQUE NOT NULL,
  rank int UNIQUE NOT NULL, title text NOT NULL, exam_code text UNIQUE NOT NULL,
  version text NOT NULL, question_ids text[] NOT NULL CHECK (cardinality(question_ids) = 30)
);
CREATE TABLE public.learning_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dojo_id text NOT NULL REFERENCES public.learning_dojos(id), version text NOT NULL,
  question_ids text[] NOT NULL CHECK (cardinality(question_ids) = 30),
  answers jsonb NOT NULL DEFAULT '{}', cursor int NOT NULL DEFAULT 0 CHECK (cursor BETWEEN 0 AND 29),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, dojo_id)
);
CREATE TABLE public.learning_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dojo_id text NOT NULL REFERENCES public.learning_dojos(id), version text NOT NULL,
  case_ids text[] NOT NULL CHECK (cardinality(case_ids) = 5),
  answers jsonb NOT NULL DEFAULT '{}', score int, passed boolean,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, rewarded_at timestamptz
);
CREATE UNIQUE INDEX learning_one_open_attempt ON public.learning_attempts(user_id, dojo_id) WHERE finished_at IS NULL;
CREATE INDEX learning_case_pool ON public.learning_items(belt, version, kind, sublevel);
ALTER TABLE public.learning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_dojos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_items, public.learning_dojos, public.learning_progress, public.learning_attempts FROM anon, authenticated;
GRANT SELECT ON public.learning_attempts TO service_role;
-- All mutations go through checked functions. No client can fabricate completion.

CREATE FUNCTION public.learning_state(p_dojo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d learning_dojos; p learning_progress; q jsonb; n int; current_rank int;
  chosen text[] := '{}'; candidate learning_items; level int; turn int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para guardar tu avance.'; END IF;
  SELECT * INTO STRICT d FROM learning_dojos WHERE id = p_dojo;
  SELECT coalesce((SELECT rank FROM learning_dojos WHERE db_belt = u.belt),0) INTO current_rank FROM users u WHERE id = auth.uid();
  IF current_rank IS NULL OR current_rank < d.rank THEN RAISE EXCEPTION 'Primero completa tu cinturón actual.'; END IF;
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
  RETURN jsonb_build_object('dojo',d.id,'cursor',p.cursor,'answered',n,'total',30,
    'complete',n = 30,'question',q,'selected',p.answers->(q->>'id'),'version',p.version);
END $$;

CREATE FUNCTION public.learning_answer(p_dojo text, p_question text, p_answer int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p learning_progress;
BEGIN
  PERFORM learning_state(p_dojo);
  SELECT * INTO STRICT p FROM learning_progress WHERE user_id = auth.uid() AND dojo_id = p_dojo FOR UPDATE;
  IF p.question_ids[p.cursor + 1] <> p_question THEN RAISE EXCEPTION 'Tu avance cambió. Vuelve a cargar la pregunta.'; END IF;
  IF p_answer IS NULL OR p_answer NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Elige una de las cuatro respuestas.'; END IF;
  IF NOT p.answers ? p_question THEN
    UPDATE learning_progress SET answers = answers || jsonb_build_object(p_question,p_answer), updated_at = now()
      WHERE user_id = auth.uid() AND dojo_id = p_dojo;
  END IF;
  RETURN learning_state(p_dojo);
END $$;

CREATE FUNCTION public.learning_next(p_dojo text, p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p learning_progress;
BEGIN
  PERFORM learning_state(p_dojo);
  SELECT * INTO STRICT p FROM learning_progress WHERE user_id = auth.uid() AND dojo_id = p_dojo FOR UPDATE;
  IF p.question_ids[p.cursor + 1] = p_question THEN
    IF NOT p.answers ? p_question THEN RAISE EXCEPTION 'Responde primero y lee la explicación.'; END IF;
    UPDATE learning_progress SET cursor = least(29,cursor + 1), updated_at = now()
      WHERE user_id = auth.uid() AND dojo_id = p_dojo;
  END IF;
  RETURN learning_state(p_dojo);
END $$;

CREATE FUNCTION public.learning_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para consultar tu avance.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',d.id,'answered',(SELECT count(*) FROM jsonb_object_keys(coalesce(p.answers,'{}'))),
    'passed',EXISTS(SELECT 1 FROM learning_attempts a WHERE a.user_id = auth.uid() AND a.dojo_id=d.id AND a.passed),
    'unlocked',d.rank <= coalesce((SELECT x.rank FROM users u JOIN learning_dojos x ON x.db_belt=u.belt WHERE u.id=auth.uid()),0)) ORDER BY d.rank)
    INTO result FROM learning_dojos d LEFT JOIN learning_progress p ON p.dojo_id=d.id AND p.user_id=auth.uid();
  RETURN coalesce(result,'[]');
END $$;

-- Internal serializer: hide answers, corrections and hints until all five are submitted.
CREATE FUNCTION public.learning_exam_view(p_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a learning_attempts; cases jsonb; d learning_dojos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
  SELECT * INTO STRICT a FROM learning_attempts WHERE id=p_attempt AND user_id=auth.uid();
  SELECT * INTO STRICT d FROM learning_dojos WHERE id=a.dojo_id;
  SELECT jsonb_agg((CASE WHEN a.finished_at IS NOT NULL THEN i.content
    ELSE i.content - ARRAY['correct','explanation','feedback_correct','feedback_incorrect','sources'] END) ORDER BY s.ord)
    INTO cases FROM unnest(a.case_ids) WITH ORDINALITY s(id,ord) JOIN learning_items i ON i.id=s.id;
  RETURN jsonb_build_object('id',a.id,'dojo',a.dojo_id,'belt',d.belt,'cases',cases,'answers',a.answers,
    'finished',a.finished_at IS NOT NULL,'score',a.score,'passed',a.passed);
END $$;

CREATE FUNCTION public.learning_start_exam(p_code text, p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d learning_dojos; p learning_progress; a learning_attempts; chosen text[] := '{}';
  families text[] := '{}'; candidate learning_items; level int; completed int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para presentar el examen.'; END IF;
  -- Serialize start/submit across devices and belts for this account.
  PERFORM 1 FROM users WHERE id=auth.uid() FOR UPDATE;
  SELECT * INTO STRICT d FROM learning_dojos WHERE exam_code=p_code;
  PERFORM learning_state(d.id);
  SELECT * INTO STRICT p FROM learning_progress WHERE user_id=auth.uid() AND dojo_id=d.id;
  SELECT count(*) INTO completed FROM unnest(p.question_ids) q WHERE p.answers ? q;
  IF completed <> 30 THEN RAISE EXCEPTION 'Completa las 30 preguntas del dojo antes de presentar el examen.'; END IF;
  SELECT * INTO a FROM learning_attempts WHERE user_id=auth.uid() AND dojo_id=d.id AND finished_at IS NULL LIMIT 1;
  IF FOUND THEN RETURN learning_exam_view(a.id); END IF;
  SELECT * INTO a FROM learning_attempts WHERE user_id=auth.uid() AND dojo_id=d.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND (a.passed OR NOT p_retry) THEN RETURN learning_exam_view(a.id); END IF;
  FOREACH level IN ARRAY ARRAY[1,1,2,2,3] LOOP
    SELECT * INTO candidate FROM learning_items i WHERE i.kind='case' AND i.belt=d.belt AND i.version=p.version
      AND i.sublevel=level AND NOT (i.family=ANY(families))
      ORDER BY (SELECT count(*) FROM learning_attempts old WHERE old.user_id=auth.uid() AND i.id=ANY(old.case_ids)), random() LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Faltan casos revisados para este examen.'; END IF;
    chosen := array_append(chosen,candidate.id); families := array_append(families,candidate.family);
  END LOOP;
  INSERT INTO learning_attempts(user_id,dojo_id,version,case_ids) VALUES(auth.uid(),d.id,p.version,chosen) RETURNING * INTO a;
  RETURN learning_exam_view(a.id);
END $$;

CREATE FUNCTION public.learning_exam_answer(p_attempt uuid, p_case text, p_answer int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a learning_attempts; n int; earned int; d learning_dojos; next_belt text; user_rank int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para guardar tu examen.'; END IF;
  PERFORM 1 FROM users WHERE id=auth.uid() FOR UPDATE;
  SELECT * INTO STRICT a FROM learning_attempts WHERE id=p_attempt AND user_id=auth.uid() FOR UPDATE;
  IF a.finished_at IS NOT NULL THEN RETURN learning_exam_view(a.id); END IF;
  IF p_answer IS NULL OR p_answer NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Elige una de las cuatro respuestas.'; END IF;
  IF a.answers ? p_case THEN RETURN learning_exam_view(a.id); END IF;
  SELECT count(*) INTO n FROM jsonb_object_keys(a.answers);
  IF a.case_ids[n+1] <> p_case THEN RAISE EXCEPTION 'Responde el caso actual antes de continuar.'; END IF;
  a.answers := a.answers || jsonb_build_object(p_case,p_answer);
  IF n = 4 THEN
    SELECT count(*) INTO earned FROM learning_items i WHERE i.id=ANY(a.case_ids) AND (a.answers->>i.id)::int=(i.content->>'correct')::int;
    SELECT * INTO STRICT d FROM learning_dojos WHERE id=a.dojo_id;
    UPDATE learning_attempts SET answers=a.answers,score=earned,passed=earned>=4,finished_at=now() WHERE id=a.id;
    IF earned >= 4 THEN
      SELECT x.rank INTO user_rank FROM users u JOIN learning_dojos x ON x.db_belt=u.belt WHERE u.id=auth.uid();
      SELECT db_belt INTO next_belt FROM learning_dojos WHERE rank=least(6,d.rank+1);
      -- Never demote an advanced learner or award points twice on a retry.
      UPDATE users SET belt=CASE WHEN coalesce(user_rank,0)=d.rank THEN next_belt ELSE belt END,
        total_points=coalesce(total_points,0)+CASE WHEN EXISTS(SELECT 1 FROM learning_attempts prev
          WHERE prev.user_id=auth.uid() AND prev.dojo_id=d.id AND prev.passed AND prev.id<>a.id) THEN 0 ELSE 250 END
        WHERE id=auth.uid();
      UPDATE learning_attempts SET rewarded_at=now() WHERE id=a.id;
    END IF;
  ELSE
    UPDATE learning_attempts SET answers=a.answers WHERE id=a.id;
  END IF;
  RETURN learning_exam_view(a.id);
END $$;

-- Preserve the existing profile protection while permitting only a verified,
-- not-yet-awarded result inside the grading transaction to promote the learner.
CREATE OR REPLACE FUNCTION public.prevent_user_security_field_tampering() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE valid_award boolean;
BEGIN
  IF auth.role()='service_role' OR public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN NEW.role := 'user'; NEW.belt := 'white'; NEW.total_points := 0; RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'role cannot be changed by this user'; END IF;
  IF NEW.current_risk_level IS DISTINCT FROM OLD.current_risk_level THEN RAISE EXCEPTION 'risk level cannot be changed by this user'; END IF;
  IF NEW.last_evaluation_at IS DISTINCT FROM OLD.last_evaluation_at THEN RAISE EXCEPTION 'last evaluation timestamp cannot be changed by this user'; END IF;
  IF NEW.belt IS DISTINCT FROM OLD.belt OR NEW.total_points IS DISTINCT FROM OLD.total_points THEN
    SELECT EXISTS(SELECT 1 FROM learning_attempts a JOIN learning_dojos d ON d.id=a.dojo_id
      JOIN learning_dojos current ON current.db_belt=OLD.belt
      JOIN learning_dojos target ON target.rank=greatest(current.rank,least(6,d.rank+1))
      WHERE a.user_id=auth.uid() AND a.user_id=NEW.id AND a.passed AND a.rewarded_at IS NULL
        AND NEW.belt=target.db_belt AND NEW.total_points=coalesce(OLD.total_points,0)+250
        AND NOT EXISTS(SELECT 1 FROM learning_attempts previous WHERE previous.user_id=a.user_id
          AND previous.dojo_id=a.dojo_id AND previous.rewarded_at IS NOT NULL)) INTO valid_award;
    IF NOT valid_award THEN RAISE EXCEPTION 'El cinturón y los puntos se obtienen completando un kata.'; END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.learning_state(text), public.learning_answer(text,text,int),
  public.learning_next(text,text), public.learning_overview(), public.learning_exam_view(uuid),
  public.learning_start_exam(text,boolean), public.learning_exam_answer(uuid,text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learning_state(text), public.learning_answer(text,text,int),
  public.learning_next(text,text), public.learning_overview(), public.learning_exam_view(uuid),
  public.learning_start_exam(text,boolean), public.learning_exam_answer(uuid,text,int) TO authenticated;
