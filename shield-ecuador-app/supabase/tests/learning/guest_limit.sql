-- INV-SEC (P2): el tope de 10 preguntas de un invitado (sesión anónima real de Supabase Auth, rol
-- authenticated, sin fila en public.users) debe vivir en el servidor, no solo en la interfaz.
-- Autoverificable: cualquier aserción que no se cumple lanza una excepción y psql (ON_ERROR_STOP)
-- sale con código != 0.
\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.expect_error(stmt text, fragment text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF position(fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'error distinto del esperado para [%]: %', stmt, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'se esperaba un error con "%" al ejecutar [%]', fragment, stmt;
END $$;

CREATE FUNCTION pg_temp.set_session(p_sub uuid, p_anonymous boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub::text, false);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'is_anonymous', p_anonymous)::text, false);
END $$;

CREATE FUNCTION pg_temp.answer_and_advance(p_dojo text, p_question text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.learning_answer(p_dojo, p_question, 0);
  PERFORM public.learning_next(p_dojo, p_question);
END $$;

-- Un dojo de rango 0 (accesible a cualquier sesión, incluida una anónima sin fila en users) y 30
-- preguntas mínimas: no hace falta que learning_state las elija al azar, se inserta el progreso
-- directamente con este mismo orden.
INSERT INTO public.learning_dojos (id, belt, db_belt, rank, title, exam_code, version, question_ids)
  VALUES ('passwords', 'blanco', 'blanco', 0, 'Contraseñas', 'EXAM-0', 'v1',
    (SELECT array_agg('q' || g) FROM generate_series(1, 30) g));
INSERT INTO public.learning_items (id, version, kind, belt, sublevel, family, content)
  SELECT 'q' || g, 'v1', 'question', 'blanco', ((g - 1) / 10) + 1, 'f' || g,
    jsonb_build_object('prompt', 'pregunta ' || g, 'options', ARRAY['a','b','c','d'], 'correct', 0)
  FROM generate_series(1, 30) g;

-- === Invitado: sesión anónima real, sin fila en public.users ===
CREATE TEMP TABLE guest_ctx AS SELECT gen_random_uuid() AS sub;
INSERT INTO auth.users (id) SELECT sub FROM guest_ctx; -- una sesión anónima SÍ crea fila en auth.users, nunca en public.users
SELECT pg_temp.set_session(sub, true) FROM guest_ctx;
INSERT INTO public.learning_progress (user_id, dojo_id, version, question_ids)
  SELECT sub, 'passwords', 'v1', (SELECT array_agg('q' || g) FROM generate_series(1, 30) g) FROM guest_ctx;

DO $$ DECLARE i int; BEGIN FOR i IN 1..10 LOOP PERFORM pg_temp.answer_and_advance('passwords', 'q' || i); END LOOP; END $$;
SELECT pg_temp.expect_error($stmt$SELECT public.learning_answer('passwords', 'q11', 0)$stmt$, 'GUEST_LIMIT_REACHED');
-- Volver a leer el estado (sin responder nada nuevo) no debe fallar: el tope solo bloquea una respuesta NUEVA, no la lectura.
SELECT public.learning_state('passwords');
SELECT pg_temp.expect_error($stmt$SELECT public.learning_start_exam('EXAM-0')$stmt$, 'GUEST_LIMIT_REACHED');

-- === Cuenta real: sin tope ===
CREATE TEMP TABLE real_ctx AS SELECT gen_random_uuid() AS sub;
INSERT INTO auth.users (id) SELECT sub FROM real_ctx;
INSERT INTO public.users (id, belt) SELECT sub, 'blanco' FROM real_ctx;
SELECT pg_temp.set_session(sub, false) FROM real_ctx;
INSERT INTO public.learning_progress (user_id, dojo_id, version, question_ids)
  SELECT sub, 'passwords', 'v1', (SELECT array_agg('q' || g) FROM generate_series(1, 30) g) FROM real_ctx;

DO $$ DECLARE i int; BEGIN FOR i IN 1..10 LOOP PERFORM pg_temp.answer_and_advance('passwords', 'q' || i); END LOOP; END $$;
SELECT public.learning_answer('passwords', 'q11', 0); -- la 11ª respuesta de una cuenta real no debe fallar por el tope de invitado

DO $$ BEGIN
  IF (SELECT count(*) FROM jsonb_object_keys((SELECT answers FROM public.learning_progress WHERE user_id = (SELECT sub FROM real_ctx)))) <> 11 THEN
    RAISE EXCEPTION 'la cuenta real no llegó a 11 respuestas guardadas';
  END IF;
END $$;

SELECT 'guest_limit: OK' AS resultado;
