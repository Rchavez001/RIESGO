-- INV-SEC (P2): el modo invitado ("Probar sin cuenta") limita a 10 preguntas del primer dojo solo
-- en la interfaz (frontend/src/screens/DojoDetailPage.tsx, GUEST_QUESTION_LIMIT). Un invitado que
-- llame learning_answer/learning_next directo (misma sesión anónima real de Supabase Auth, rol
-- authenticated) podía completar las 30 preguntas y presentar el kata sin registrarse. Esta
-- migración lleva el tope al servidor, sin tocar la restricción de dojo (ya server-side desde 058/059)
-- ni el minijuego (ya limita a una pregunta por llamada).
--
-- 'GUEST_LIMIT_REACHED: ' al inicio del mensaje es el código de error estable que el frontend usa
-- para mostrar la invitación a registrarse en vez de un error genérico (mismo patrón P0001 que ya
-- usan el resto de RAISE EXCEPTION de este módulo: learningCall solo distingue P0001 de otros códigos).
CREATE OR REPLACE FUNCTION public.learning_answer(p_dojo text, p_question text, p_answer int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p learning_progress; n int;
BEGIN
  PERFORM learning_state(p_dojo);
  SELECT * INTO STRICT p FROM learning_progress WHERE user_id = auth.uid() AND dojo_id = p_dojo FOR UPDATE;
  IF p.question_ids[p.cursor + 1] <> p_question THEN RAISE EXCEPTION 'Tu avance cambió. Vuelve a cargar la pregunta.'; END IF;
  IF p_answer IS NULL OR p_answer NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Elige una de las cuatro respuestas.'; END IF;
  IF NOT p.answers ? p_question THEN
    SELECT count(*) INTO n FROM jsonb_object_keys(p.answers);
    IF (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE AND n >= 10 THEN
      RAISE EXCEPTION 'GUEST_LIMIT_REACHED: Como invitado, regístrate para seguir con las 30 preguntas de este dojo.';
    END IF;
    UPDATE learning_progress SET answers = answers || jsonb_build_object(p_question,p_answer), updated_at = now()
      WHERE user_id = auth.uid() AND dojo_id = p_dojo;
  END IF;
  RETURN learning_state(p_dojo);
END $$;

-- El kata exige las 30 respondidas, así que un invitado nunca llegaría por el camino normal (bloqueado
-- arriba); este bloqueo explícito es la segunda capa por si el tope de arriba cambiara o se accede a
-- learning_start_exam con progreso ya existente de antes de esta migración.
CREATE OR REPLACE FUNCTION public.learning_start_exam(p_code text, p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d learning_dojos; p learning_progress; a learning_attempts; chosen text[] := '{}';
  families text[] := '{}'; candidate learning_items; level int; completed int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para presentar el examen.'; END IF;
  IF (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE THEN
    RAISE EXCEPTION 'GUEST_LIMIT_REACHED: Regístrate gratis para presentar el examen de este dojo.';
  END IF;
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
