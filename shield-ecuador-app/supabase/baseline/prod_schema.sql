-- supabase/baseline/prod_schema.sql
--
-- Esquema de PRODUCCIÓN (proyecto wbbcjiqzbzswxsmwjqlw), esquema `public` solamente, tal como
-- quedó tras aplicar las migraciones 001–073. Generado con `supabase db dump --schema-only`
-- FUERA de esta sesión (solo lectura, con credenciales de producción que esta sesión nunca vio)
-- y revisado antes de versionarse (D-13, DECISIONS.md; iteración 24).
--
-- NO es una migración: vive fuera de `supabase/migrations/` a propósito (D-13, opción A').
-- `supabase/migrations/001…072` NO se archivan ni se modifican: siguen aplicándose tal cual en
-- `supabase db push` contra producción. Este archivo solo sirve para reconstruir un esquema de
-- desarrollo/CI local equivalente al de producción SIN depender de que 001–072 se puedan aplicar
-- desde cero (no pueden: la migración 004 define `is_admin()` antes de crear la columna que usa,
-- en cualquier versión de Postgres — ver D-13). Lo usa la puerta `db-reset` de `gates.sh`
-- ("baseline + pendientes"): base local (auth/storage/extensiones de `supabase start`) + este
-- archivo + las migraciones 074–078 en orden, según `PLAN_PRODUCCION_RELEASE.md`.
--
-- Revisado antes de versionar (iteración 24, T00-extra-exec):
--   - Secretos: NINGUNO encontrado (0 claves, tokens, contraseñas ni JSON web tokens). Solo hay
--     REFERENCIAS por nombre a Supabase Vault (`app_secrets.secret_id`, `get_decrypted_secret`,
--     `set_provider_secret`, `cron_shared_secret`); los valores reales viven únicamente en Vault,
--     nunca en el esquema.
--   - Datos personales: ninguno (dump de solo esquema, sin filas; los valores `DEFAULT` son
--     enums/JSON vacíos, sin PII).
--   - Roles del sistema (`anon`, `authenticated`, `service_role`, `postgres`): el dump no trae
--     `CREATE ROLE`/`ALTER ROLE` (no los incluye `--schema-only`); no había nada que quitar. Los
--     `GRANT`/`REVOKE` por objeto SÍ se conservan tal cual (reflejan el estado real de producción).
--   - Esquemas `auth`/`storage`/`realtime`: el dump no los define (solo referencia `auth.users`,
--     `auth.uid()`, `auth.role()`, `storage.buckets`, ya provistos por `supabase start`); no había
--     objetos propios que quitar. Se quitó 1 línea `ALTER PUBLICATION "supabase_realtime" OWNER TO
--     "postgres"` (objeto de replicación del servicio Realtime, gestionado por `supabase start`, no
--     por este módulo).
--   - Extensiones gestionadas: se quitaron las 6 líneas `CREATE EXTENSION IF NOT EXISTS` del dump
--     original (`pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`,
--     `uuid-ossp`). Verificado contra un `supabase start` real: `pg_net`, `pg_stat_statements`,
--     `pgcrypto`, `supabase_vault` y `uuid-ossp` ya están instaladas de fábrica (`\dx` antes de
--     aplicar cualquier migración). `pg_cron` NO la provee `supabase start` y producción la instaló
--     en el esquema `pg_catalog` (no `extensions`, donde la crea la migración 037 local) — pero
--     ningún objeto de este dump ni de las migraciones pendientes 074–078 usa el esquema `cron`,
--     así que se omite sin reemplazo en vez de arrastrar esa discrepancia de esquema.
--
-- Verificado (iteración 24): cargado contra un `supabase start` real (Postgres 17 local) tras
-- `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — aplica limpio, sin errores. El resultado,
-- vuelto a volcar con `supabase db dump --local -s public`, coincide con este archivo salvo 2
-- líneas de ruido de herramienta (`CREATE SCHEMA IF NOT EXISTS "public"` + `ALTER SCHEMA "public"
-- OWNER TO "postgres"` que el dump LOCAL añade y el de producción no; `REVOKE USAGE ON SCHEMA
-- "public" FROM PUBLIC` que pg_dump local antepone a sus GRANT). Ninguna diferencia de tabla,
-- columna, función, política ni trigger.
--
-- Regenerar tras cada release (`supabase db dump --schema-only --linked`, revisar y reemplazar
-- este archivo en su propio commit).



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;














COMMENT ON SCHEMA "public" IS 'standard public schema';



























CREATE OR REPLACE FUNCTION "public"."_championship_question_payload"("p_match_id" "uuid", "p_index" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  m public.championship_matches%ROWTYPE;
  q_id TEXT;
  item public.learning_items%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.championship_matches WHERE id = p_match_id;
  q_id := m.question_ids[p_index + 1];
  IF q_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO item FROM public.learning_items WHERE id = q_id;

  RETURN jsonb_build_object(
    'index', p_index,
    'question_id', q_id,
    'prompt', item.content->>'prompt',
    'options', item.content->'options',
    'time_limit_seconds', public._championship_time_limit(m.championship_id, item.sublevel)
  );
END;
$$;


ALTER FUNCTION "public"."_championship_question_payload"("p_match_id" "uuid", "p_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_championship_time_limit"("p_championship_id" "uuid", "p_sublevel" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  champ public.championships%ROWTYPE;
BEGIN
  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF p_sublevel <= 1 THEN RETURN champ.time_limit_easy_seconds; END IF;
  IF p_sublevel = 2 THEN RETURN champ.time_limit_medium_seconds; END IF;
  RETURN champ.time_limit_hard_seconds;
END;
$$;


ALTER FUNCTION "public"."_championship_time_limit"("p_championship_id" "uuid", "p_sublevel" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sync_question_to_learning_item"("p_question_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."_sync_question_to_learning_item"("p_question_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "actor_email_hmac" "text" NOT NULL,
    "actor_role" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text",
    "before" "jsonb",
    "after" "jsonb",
    "diff" "text",
    "reason" "text",
    "ip_ciphertext" "jsonb",
    "ip_hmac" "text",
    "key_version" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prev_hash" "text",
    "row_hash" "text" NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_log_canonical"("rec" "public"."admin_audit_log") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (to_jsonb(rec) - 'row_hash')::text;
$$;


ALTER FUNCTION "public"."admin_audit_log_canonical"("rec" "public"."admin_audit_log") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_log_chain_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_log_chain'));
  SELECT row_hash INTO last_hash FROM public.admin_audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(digest(coalesce(last_hash, '') || public.admin_audit_log_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."admin_audit_log_chain_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_dojo_stats"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'rank', d.rank, 'title', d.title, 'belt', d.belt, 'exam_code', d.exam_code, 'version', d.version,
    'questions', (SELECT count(*) FROM learning_items i WHERE i.kind = 'question' AND i.belt = d.belt AND i.version = d.version),
    'cases', (SELECT count(*) FROM learning_items i WHERE i.kind = 'case' AND i.belt = d.belt AND i.version = d.version),
    'started', (SELECT count(*) FROM learning_progress p WHERE p.dojo_id = d.id),
    'finished_practice', (SELECT count(*) FROM learning_progress p WHERE p.dojo_id = d.id AND (SELECT count(*) FROM jsonb_object_keys(p.answers)) >= 30),
    'exam_takers', (SELECT count(DISTINCT a.user_id) FROM learning_attempts a WHERE a.dojo_id = d.id AND a.finished_at IS NOT NULL),
    'passed', (SELECT count(DISTINCT a.user_id) FROM learning_attempts a WHERE a.dojo_id = d.id AND a.passed)
  ) ORDER BY d.rank), '[]'::jsonb)
  FROM learning_dojos d;
$$;


ALTER FUNCTION "public"."admin_dojo_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_sensei_topics"("p_limit" integer DEFAULT 15) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(t ORDER BY (t->>'total')::int DESC, t->>'topic'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'topic', coalesce(nullif(btrim(normalized_topic), ''), 'sin tema'),
      'total', count(*),
      'out_of_scope', count(*) FILTER (WHERE NOT is_cybersecurity),
      'helpful', count(*) FILTER (WHERE feedback_helpful IS TRUE),
      'not_helpful', count(*) FILTER (WHERE feedback_helpful IS FALSE),
      'last_at', max(created_at)
    ) AS t
    FROM sensei_consultations
    GROUP BY coalesce(nullif(btrim(normalized_topic), ''), 'sin tema')
    ORDER BY count(*) DESC
    LIMIT greatest(1, least(coalesce(p_limit, 15), 50))
  ) x;
$$;


ALTER FUNCTION "public"."admin_sensei_topics"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_user_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM users),
    'authorized', (SELECT count(*) FROM users WHERE data_processing_authorized IS TRUE),
    'new_30d', (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days'),
    'admins', (SELECT count(*) FROM users WHERE role = 'admin'),
    'onboarded', (SELECT count(*) FROM users WHERE onboarding_completed IS TRUE),
    'by_belt', coalesce((SELECT jsonb_object_agg(belt, n) FROM (SELECT coalesce(belt, 'sin cinturón') AS belt, count(*) AS n FROM users GROUP BY 1) b), '{}'::jsonb),
    'by_role', coalesce((SELECT jsonb_object_agg(role, n) FROM (SELECT coalesce(role, 'sin rol') AS role, count(*) AS n FROM users GROUP BY 1) r), '{}'::jsonb)
  );
$$;


ALTER FUNCTION "public"."admin_user_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."belt_es"("p_belt" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE p_belt WHEN 'white' THEN 'blanco' WHEN 'yellow' THEN 'amarillo' WHEN 'orange' THEN 'naranja'
    WHEN 'green' THEN 'verde' WHEN 'blue' THEN 'azul' WHEN 'brown' THEN 'marrón' WHEN 'black' THEN 'negro' ELSE p_belt END
$$;


ALTER FUNCTION "public"."belt_es"("p_belt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_admin_audit_log_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log es append-only: no existe ninguna función que pueda modificar una fila existente';
END; $$;


ALTER FUNCTION "public"."block_admin_audit_log_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_consent_records_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF coalesce(current_setting('app.allow_evidence_mutation', true), 'off') = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'consent_records es append-only: solo la función de retención puede tocar una fila existente';
END; $$;


ALTER FUNCTION "public"."block_consent_records_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_privacy_settings_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'privacy_settings es de solo inserción: cree una fila nueva en vez de modificar la %', TG_OP;
END; $$;


ALTER FUNCTION "public"."block_privacy_settings_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."championship_answer_question"("p_match_id" "uuid", "p_answer_index" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."championship_answer_question"("p_match_id" "uuid", "p_answer_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."championship_start_match"("p_match_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."championship_start_match"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_hits" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  hit_count INT;
BEGIN
  INSERT INTO public.security_rate_limit_hits (bucket_key) VALUES (p_bucket_key);

  SELECT COUNT(*) INTO hit_count
  FROM public.security_rate_limit_hits
  WHERE bucket_key = p_bucket_key
    AND hit_at > NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Housekeeping: opportunistically prune this bucket's own old hits so the
  -- table doesn't grow unbounded — cheap since it only touches rows this
  -- call already scanned.
  DELETE FROM public.security_rate_limit_hits
  WHERE bucket_key = p_bucket_key
    AND hit_at <= NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  RETURN hit_count <= p_max_hits;
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_hits" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_records" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_ref_hmac" "text" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "document_version" "text" NOT NULL,
    "rendered_sha256" "text" NOT NULL,
    "settings_version" integer NOT NULL,
    "purpose_code" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "ip_ciphertext" "jsonb",
    "ip_hmac" "text" NOT NULL,
    "ua_ciphertext" "jsonb",
    "ua_hmac" "text",
    "key_version" integer NOT NULL,
    "server_ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prev_hash" "text",
    "row_hash" "text" NOT NULL,
    CONSTRAINT "consent_records_channel_check" CHECK (("channel" = ANY (ARRAY['registro'::"text", 'reconsentimiento'::"text", 'mi_privacidad'::"text", 'correo'::"text", 'admin'::"text"]))),
    CONSTRAINT "consent_records_decision_check" CHECK (("decision" = ANY (ARRAY['granted'::"text", 'denied'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."consent_records" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consent_record_canonical"("rec" "public"."consent_records") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  -- Claves en orden alfabético a propósito: la canonicalización debe ser
  -- determinista para que verify_consent_chain() recalcule el mismo hash.
  SELECT (to_jsonb(rec) - 'row_hash')::text;
$$;


ALTER FUNCTION "public"."consent_record_canonical"("rec" "public"."consent_records") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consent_records_chain_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('consent_records_chain'));
  SELECT row_hash INTO last_hash FROM public.consent_records ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(digest(coalesce(last_hash, '') || public.consent_record_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."consent_records_chain_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_news_agent"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions'
    AS $$
DECLARE
  cfg RECORD;
  now_local TIME;
  today_local DATE;
  last_run_local DATE;
  shared_secret TEXT;
BEGIN
  SELECT * INTO cfg FROM public.agent_configs WHERE agent_code = 'ciber-dojo-news-agent';
  IF cfg.id IS NULL OR NOT cfg.enabled THEN
    RETURN;
  END IF;

  now_local := (now() AT TIME ZONE cfg.timezone)::TIME;
  today_local := (now() AT TIME ZONE cfg.timezone)::DATE;
  last_run_local := CASE WHEN cfg.last_run_at IS NULL THEN NULL ELSE (cfg.last_run_at AT TIME ZONE cfg.timezone)::DATE END;

  IF last_run_local IS NOT DISTINCT FROM today_local THEN
    RETURN;
  END IF;

  IF date_trunc('minute', now_local) <> date_trunc('minute', cfg.trigger_time) THEN
    RETURN;
  END IF;

  UPDATE public.agent_configs SET last_run_at = now() WHERE id = cfg.id;

  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_news_agent: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/run-news-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('action', 'scheduled', 'triggered_by', 'pg_cron')
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_news_agent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_security_alert_check"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions'
    AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_alert_check: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/check-security-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_security_alert_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_security_diagnosis"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions'
    AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_diagnosis: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/security-diagnose',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_security_diagnosis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_security_easm_scan"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions'
    AS $$
DECLARE
  shared_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO shared_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF shared_secret IS NULL THEN
    RAISE WARNING 'dispatch_security_easm_scan: cron_shared_secret not found in Vault, skipping dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/security-easm-scan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', shared_secret),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_security_easm_scan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_consent_document_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.content_md IS DISTINCT FROM OLD.content_md OR
    NEW.purposes IS DISTINCT FROM OLD.purposes OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
  ) THEN
    RAISE EXCEPTION 'consent_documents: una versión % ya no es un borrador; clone un nuevo borrador en vez de editarla', OLD.status;
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."enforce_consent_document_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_decrypted_secret"("secret_id" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id;
$$;


ALTER FUNCTION "public"."get_decrypted_secret"("secret_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_championship_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  champ public.championships%ROWTYPE;
  reg public.championship_registrations%ROWTYPE;
  my_match JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión.';
  END IF;

  SELECT * INTO champ FROM public.championships
  WHERE status IN ('registration_open', 'registration_closed', 'in_progress')
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('championship', NULL);
  END IF;

  SELECT * INTO reg FROM public.championship_registrations
  WHERE championship_id = champ.id AND user_id = auth.uid();

  SELECT jsonb_build_object(
    'id', m.id, 'round', m.round, 'scheduled_at', m.scheduled_at,
    'window_closes_at', m.window_closes_at, 'status', m.status,
    'is_bye', m.player2_id IS NULL,
    'winner_id', m.winner_id,
    'my_attempt_done', EXISTS (
      SELECT 1 FROM public.championship_match_attempts a
      WHERE a.match_id = m.id AND a.user_id = auth.uid() AND a.finished_at IS NOT NULL
    )
  ) INTO my_match
  FROM public.championship_matches m
  WHERE m.championship_id = champ.id AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
  ORDER BY m.round DESC LIMIT 1;

  RETURN jsonb_build_object(
    'championship', jsonb_build_object(
      'id', champ.id, 'name', champ.name, 'status', champ.status,
      'min_belt', champ.min_belt, 'max_age', champ.max_age,
      'registration_opens_at', champ.registration_opens_at,
      'registration_closes_at', champ.registration_closes_at,
      'questions_per_match', champ.questions_per_match,
      'time_limit_easy_seconds', champ.time_limit_easy_seconds,
      'time_limit_medium_seconds', champ.time_limit_medium_seconds,
      'time_limit_hard_seconds', champ.time_limit_hard_seconds,
      'rules_text', champ.rules_text
    ),
    'registered', reg.id IS NOT NULL,
    'my_match', my_match
  );
END;
$$;


ALTER FUNCTION "public"."get_my_championship_status"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."central_admin_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "moment" "text" DEFAULT 'inicio'::"text" NOT NULL,
    "duration_seconds" integer DEFAULT 10 NOT NULL,
    "validity_type" "text" DEFAULT 'indefinido'::"text" NOT NULL,
    "validity_value" integer,
    "message" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "link_url" "text",
    "status" "text" DEFAULT 'activa'::"text" NOT NULL,
    "target_all" boolean DEFAULT true NOT NULL,
    "target_sectors" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "donation_type" "text" DEFAULT 'unica'::"text" NOT NULL,
    "donation_period_months" integer,
    "value_tier" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "campaign_donation_period_range" CHECK ((("donation_period_months" IS NULL) OR ("donation_period_months" <= 120))),
    CONSTRAINT "campaign_duration_range" CHECK ((("duration_seconds" >= 1) AND ("duration_seconds" <= 120))),
    CONSTRAINT "campaign_image_url_own_bucket" CHECK ((("image_url" IS NULL) OR ("image_url" ~~ 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/storage/v1/object/public/campaign-ads/%'::"text"))),
    CONSTRAINT "campaign_link_url_http" CHECK ((("link_url" IS NULL) OR ("link_url" ~* '^https?://[^[:space:]]+$'::"text"))),
    CONSTRAINT "campaign_text_length" CHECK ((("char_length"("name") <= 120) AND ("char_length"("message") <= 500))),
    CONSTRAINT "central_admin_campaigns_donation_period_check" CHECK (((("donation_type" = 'continua'::"text") AND ("donation_period_months" IS NOT NULL)) OR (("donation_type" = 'unica'::"text") AND ("donation_period_months" IS NULL)))),
    CONSTRAINT "central_admin_campaigns_donation_period_months_check" CHECK ((("donation_period_months" IS NULL) OR ("donation_period_months" > 0))),
    CONSTRAINT "central_admin_campaigns_donation_type_check" CHECK (("donation_type" = ANY (ARRAY['unica'::"text", 'continua'::"text"]))),
    CONSTRAINT "central_admin_campaigns_duration_seconds_check" CHECK (("duration_seconds" > 0)),
    CONSTRAINT "central_admin_campaigns_moment_check" CHECK (("moment" = ANY (ARRAY['inicio'::"text", 'sesion'::"text", 'salida'::"text"]))),
    CONSTRAINT "central_admin_campaigns_status_check" CHECK (("status" = ANY (ARRAY['activa'::"text", 'suspendida'::"text", 'eliminada'::"text"]))),
    CONSTRAINT "central_admin_campaigns_validity_type_check" CHECK (("validity_type" = ANY (ARRAY['sesiones'::"text", 'meses'::"text", 'indefinido'::"text"]))),
    CONSTRAINT "central_admin_campaigns_value_tier_check" CHECK ((("value_tier" >= 1) AND ("value_tier" <= 4)))
);


ALTER TABLE "public"."central_admin_campaigns" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_campaign_for_user"("p_moment" "text" DEFAULT 'inicio'::"text") RETURNS "public"."central_admin_campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  caller UUID := auth.uid();
  viewer_sector TEXT;
  picked public.central_admin_campaigns%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT sector INTO viewer_sector FROM public.users WHERE id = caller;

  SELECT c.* INTO picked
  FROM public.central_admin_campaigns c
  LEFT JOIN public.central_admin_campaign_tier_weights w ON w.value_tier = c.value_tier
  LEFT JOIN (
    SELECT campaign_id, COUNT(*) AS shown_count, MAX(shown_at) AS last_shown_at
    FROM public.campaign_impressions
    WHERE user_id = caller
    GROUP BY campaign_id
  ) i ON i.campaign_id = c.id
  WHERE c.status = 'activa'
    AND c.moment = p_moment
    AND c.image_url IS NOT NULL
    AND (c.starts_at IS NULL OR c.starts_at <= NOW())
    AND (c.ends_at IS NULL OR c.ends_at >= NOW())
    AND (
      c.target_all = TRUE
      OR viewer_sector IS NULL
      OR viewer_sector = ANY(c.target_sectors)
    )
  ORDER BY
    COALESCE(i.shown_count, 0)::NUMERIC / COALESCE(w.weight, 1) ASC,
    i.last_shown_at ASC NULLS FIRST,
    c.created_at ASC
  LIMIT 1;

  RETURN picked;
END;
$$;


ALTER FUNCTION "public"."get_next_campaign_for_user"("p_moment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_privacy_role"("required_role" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND role = required_role);
$$;


ALTER FUNCTION "public"."has_privacy_role"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_answer"("p_dojo" "text", "p_question" "text", "p_answer" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_answer"("p_dojo" "text", "p_question" "text", "p_answer" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_exam_answer"("p_attempt" "uuid", "p_case" "text", "p_answer" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_exam_answer"("p_attempt" "uuid", "p_case" "text", "p_answer" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_exam_view"("p_attempt" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_exam_view"("p_attempt" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_next"("p_dojo" "text", "p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_next"("p_dojo" "text", "p_question" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para consultar tu avance.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',d.id,'answered',(SELECT count(*) FROM jsonb_object_keys(coalesce(p.answers,'{}'))),
    'passed',EXISTS(SELECT 1 FROM learning_attempts a WHERE a.user_id = auth.uid() AND a.dojo_id=d.id AND a.passed),
    'unlocked',d.rank <= coalesce((SELECT x.rank FROM users u JOIN learning_dojos x ON x.db_belt=u.belt WHERE u.id=auth.uid()),0)) ORDER BY d.rank)
    INTO result FROM learning_dojos d LEFT JOIN learning_progress p ON p.dojo_id=d.id AND p.user_id=auth.uid();
  RETURN coalesce(result,'[]');
END $$;


ALTER FUNCTION "public"."learning_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_start_exam"("p_code" "text", "p_retry" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_start_exam"("p_code" "text", "p_retry" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learning_state"("p_dojo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."learning_state"("p_dojo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_storage_buckets"() RETURNS TABLE("id" "text", "public" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT id, public FROM storage.buckets;
$$;


ALTER FUNCTION "public"."list_storage_buckets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."minigame_check_answer"("p_question_id" "text", "p_answer" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."minigame_check_answer"("p_question_id" "text", "p_answer" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."minigame_random_question"("p_exclude" "text"[] DEFAULT '{}'::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."minigame_random_question"("p_exclude" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_case_number"() RETURNS "text"
    LANGUAGE "sql"
    AS $$
  SELECT 'CD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.data_subject_request_seq')::text, 6, '0');
$$;


ALTER FUNCTION "public"."next_case_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_user_security_field_tampering"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."prevent_user_security_field_tampering"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_generated_kata"("generated_kata_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  source_row public.cyber_dojo_generated_katas%ROWTYPE;
  new_kata_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish generated katas';
  END IF;

  SELECT *
  INTO source_row
  FROM public.cyber_dojo_generated_katas
  WHERE id = generated_kata_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generated kata not found: %', generated_kata_id;
  END IF;

  INSERT INTO public.katas (
    kata_code,
    name,
    description,
    teaching,
    estimated_minutes,
    required_belt,
    points_reward,
    steps,
    verification_type,
    active
  )
  VALUES (
    'GEN_' || replace(source_row.id::text, '-', '_'),
    source_row.title,
    source_row.scenario,
    source_row.task,
    20,
    CASE
      WHEN source_row.difficulty <= 1 THEN 'white'
      WHEN source_row.difficulty = 2 THEN 'yellow'
      WHEN source_row.difficulty = 3 THEN 'orange'
      WHEN source_row.difficulty = 4 THEN 'green'
      ELSE 'black'
    END,
    100 + (source_row.difficulty * 50),
    jsonb_build_array(jsonb_build_object(
      'title', source_row.title,
      'scenario', source_row.scenario,
      'task', source_row.task,
      'source_url', source_row.source_url
    )),
    'manual',
    TRUE
  )
  RETURNING id INTO new_kata_id;

  UPDATE public.cyber_dojo_generated_katas
  SET status = 'published',
      published_kata_id = new_kata_id
  WHERE id = generated_kata_id;

  RETURN new_kata_id;
END;
$$;


ALTER FUNCTION "public"."publish_generated_kata"("generated_kata_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_for_championship"("p_championship_id" "uuid", "p_birthdate" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  champ public.championships%ROWTYPE;
  my_belt TEXT;
  my_age INT;
  reg_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para inscribirte.';
  END IF;
  -- Guests (anonymous sessions) cannot enter: the app hides the page, this keeps the RPC honest too.
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Regístrate con tu cuenta para inscribirte al campeonato.';
  END IF;

  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato no encontrado.';
  END IF;

  IF champ.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Las inscripciones no están abiertas para este campeonato.';
  END IF;
  IF NOW() < champ.registration_opens_at OR NOW() > champ.registration_closes_at THEN
    RAISE EXCEPTION 'Estamos fuera del período de inscripción (del % al %).',
      to_char(champ.registration_opens_at AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI'),
      to_char(champ.registration_closes_at AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI');
  END IF;

  IF p_birthdate IS NULL OR p_birthdate > CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha de nacimiento no es válida.';
  END IF;
  my_age := EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate))::INT;
  IF my_age > champ.max_age THEN
    RAISE EXCEPTION 'La edad máxima para este campeonato es de % años.', champ.max_age;
  END IF;

  SELECT belt INTO my_belt FROM public.users WHERE id = auth.uid();
  IF my_belt IS DISTINCT FROM champ.min_belt THEN
    RAISE EXCEPTION 'Este campeonato requiere cinturón % (tu cinturón actual: %).', belt_es(champ.min_belt), COALESCE(belt_es(my_belt), 'ninguno');
  END IF;

  INSERT INTO public.championship_registrations (championship_id, user_id, birthdate, belt_at_registration)
  VALUES (p_championship_id, auth.uid(), p_birthdate, my_belt)
  ON CONFLICT (championship_id, user_id) DO NOTHING
  RETURNING id INTO reg_id;

  IF reg_id IS NULL THEN
    RAISE EXCEPTION 'Ya estás inscrito en este campeonato.';
  END IF;

  RETURN reg_id;
END;
$$;


ALTER FUNCTION "public"."register_for_championship"("p_championship_id" "uuid", "p_birthdate" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_sectors" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "industry" "text",
    CONSTRAINT "business_sectors_code_check" CHECK (("code" ~ '^[a-z0-9_]{2,40}$'::"text")),
    CONSTRAINT "business_sectors_label_check" CHECK (("length"(TRIM(BOTH FROM "label")) >= 2))
);


ALTER TABLE "public"."business_sectors" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer DEFAULT 100) RETURNS "public"."business_sectors"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  normalized_original TEXT := lower(trim(coalesce(original_code, '')));
  normalized_code TEXT := lower(regexp_replace(trim(sector_code), '[^a-zA-Z0-9_]+', '_', 'g'));
  saved public.business_sectors%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can manage business sectors';
  END IF;

  IF normalized_code !~ '^[a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid sector code';
  END IF;

  IF length(trim(sector_label)) < 2 THEN
    RAISE EXCEPTION 'Invalid sector label';
  END IF;

  IF normalized_original = '' THEN
    INSERT INTO public.business_sectors (code, label, active, display_order)
    VALUES (normalized_code, trim(sector_label), sector_active, coalesce(sector_display_order, 100))
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label,
      active = EXCLUDED.active,
      display_order = EXCLUDED.display_order
    RETURNING * INTO saved;
  ELSIF normalized_original = normalized_code THEN
    UPDATE public.business_sectors
    SET label = trim(sector_label),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;
  ELSE
    UPDATE public.business_sectors
    SET code = normalized_code,
        label = trim(sector_label),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;

    UPDATE public.users
    SET business_type = normalized_code
    WHERE business_type = normalized_original;

    UPDATE public.alerts
    SET target_business_types = array_replace(target_business_types, normalized_original, normalized_code)
    WHERE target_business_types IS NOT NULL
      AND normalized_original = ANY(target_business_types);
  END IF;

  IF saved.code IS NULL THEN
    RAISE EXCEPTION 'Business sector not found';
  END IF;

  RETURN saved;
END;
$_$;


ALTER FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer DEFAULT 100, "sector_industry" "text" DEFAULT NULL::"text") RETURNS "public"."business_sectors"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  normalized_original TEXT := lower(trim(coalesce(original_code, '')));
  normalized_code TEXT := lower(regexp_replace(trim(sector_code), '[^a-zA-Z0-9_]+', '_', 'g'));
  saved public.business_sectors%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can manage business sectors';
  END IF;

  IF normalized_code !~ '^[a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid sector code';
  END IF;

  IF length(trim(sector_label)) < 2 THEN
    RAISE EXCEPTION 'Invalid sector label';
  END IF;

  IF normalized_original = '' THEN
    INSERT INTO public.business_sectors (code, label, industry, active, display_order)
    VALUES (normalized_code, trim(sector_label), NULLIF(trim(coalesce(sector_industry, '')), ''), sector_active, coalesce(sector_display_order, 100))
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label,
      industry = EXCLUDED.industry,
      active = EXCLUDED.active,
      display_order = EXCLUDED.display_order
    RETURNING * INTO saved;
  ELSIF normalized_original = normalized_code THEN
    UPDATE public.business_sectors
    SET label = trim(sector_label),
        industry = NULLIF(trim(coalesce(sector_industry, '')), ''),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;
  ELSE
    UPDATE public.business_sectors
    SET code = normalized_code,
        label = trim(sector_label),
        industry = NULLIF(trim(coalesce(sector_industry, '')), ''),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;

    UPDATE public.users
    SET business_type = normalized_code
    WHERE business_type = normalized_original;

    UPDATE public.alerts
    SET target_business_types = array_replace(target_business_types, normalized_original, normalized_code)
    WHERE target_business_types IS NOT NULL
      AND normalized_original = ANY(target_business_types);
  END IF;

  IF saved.code IS NULL THEN
    RAISE EXCEPTION 'Business sector not found';
  END IF;

  RETURN saved;
END;
$_$;


ALTER FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer, "sector_industry" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_provider_secret"("p_secret_id" "uuid", "p_new_secret" "text", "p_secret_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
  result_id UUID;
  existing_id UUID;
BEGIN
  IF p_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(p_secret_id, p_new_secret);
    result_id := p_secret_id;
  ELSE
    SELECT id INTO existing_id FROM vault.secrets WHERE name = p_secret_name;
    IF existing_id IS NOT NULL THEN
      PERFORM vault.update_secret(existing_id, p_new_secret);
      result_id := existing_id;
    ELSE
      result_id := vault.create_secret(p_new_secret, p_secret_name);
    END IF;
  END IF;
  RETURN result_id;
END;
$$;


ALTER FUNCTION "public"."set_provider_secret"("p_secret_id" "uuid", "p_new_secret" "text", "p_secret_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_campaign_active_from_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.active := (NEW.status = 'activa');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_campaign_active_from_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_question_to_learning_item"("p_question_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can sync questions into the learning bank';
  END IF;
  RETURN public._sync_question_to_learning_item(p_question_id);
END;
$$;


ALTER FUNCTION "public"."sync_question_to_learning_item"("p_question_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_sync_approved_news_question"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."trigger_sync_approved_news_question"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_audit_chain"() RETURNS TABLE("first_broken_id" bigint, "detail" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  rec public.admin_audit_log%ROWTYPE;
  expected_prev TEXT := NULL;
  expected_hash TEXT;
BEGIN
  FOR rec IN SELECT * FROM public.admin_audit_log ORDER BY id ASC LOOP
    IF rec.prev_hash IS DISTINCT FROM expected_prev THEN
      RETURN QUERY SELECT rec.id, 'prev_hash no coincide con el row_hash anterior'; RETURN;
    END IF;
    expected_hash := encode(digest(coalesce(expected_prev, '') || public.admin_audit_log_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;


ALTER FUNCTION "public"."verify_audit_chain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_consent_chain"() RETURNS TABLE("first_broken_id" bigint, "detail" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  rec public.consent_records%ROWTYPE;
  expected_prev TEXT := NULL;
  expected_hash TEXT;
BEGIN
  FOR rec IN SELECT * FROM public.consent_records ORDER BY id ASC LOOP
    IF rec.prev_hash IS DISTINCT FROM expected_prev THEN
      RETURN QUERY SELECT rec.id, 'prev_hash no coincide con el row_hash anterior'; RETURN;
    END IF;
    expected_hash := encode(digest(coalesce(expected_prev, '') || public.consent_record_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;


ALTER FUNCTION "public"."verify_consent_chain"() OWNER TO "postgres";


ALTER TABLE "public"."admin_audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."admin_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admin_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_roles_role_check" CHECK (("role" = ANY (ARRAY['privacy_editor'::"text", 'privacy_admin'::"text", 'privacy_auditor'::"text"])))
);


ALTER TABLE "public"."admin_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "enabled" boolean DEFAULT true,
    "trigger_time" time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'America/Guayaquil'::"text" NOT NULL,
    "prompt_template" "text" NOT NULL,
    "investigation_window_days" integer DEFAULT 1,
    "last_run_at" timestamp with time zone,
    "extra_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_configs_agent_code_check" CHECK (("agent_code" = ANY (ARRAY['incident-investigator'::"text", 'question-auditor'::"text", 'ciber-dojo-news-agent'::"text", 'sensei-question-auditor'::"text", 'question-bank-importer'::"text", 'learning-item-rebalancer'::"text"])))
);


ALTER TABLE "public"."agent_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_provider_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_config_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "priority" integer DEFAULT 1,
    "active" boolean DEFAULT true,
    "timeout_seconds" integer,
    CONSTRAINT "agent_provider_assignments_timeout_seconds_check" CHECK ((("timeout_seconds" IS NULL) OR ("timeout_seconds" > 0)))
);


ALTER TABLE "public"."agent_provider_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_config_id" "uuid",
    "run_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "summary" "text",
    "input_payload" "jsonb",
    "output_payload" "jsonb",
    "triggered_by" "text" DEFAULT 'system'::"text",
    "error_message" "text",
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "text" NOT NULL,
    "branch" "text" NOT NULL,
    "order_num" integer,
    "iso_control" "text",
    "question_text" "text" NOT NULL,
    "question_type" "text",
    "options" "jsonb" NOT NULL,
    "conditional_logic" "jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "generated_from_incident_id" "uuid",
    "generation_prompt_version" "text",
    "audit_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "audit_notes" "text",
    "reviewed_at" timestamp with time zone,
    "dojo_id" "text",
    "difficulty" integer,
    "kata_label" "text",
    "answer_text" "text",
    "explanation" "text",
    "editable" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "audit_provider" "text",
    "audit_model" "text",
    "audit_replaced_content" boolean DEFAULT false,
    "audit_original_payload" "jsonb",
    "audit_corrected_payload" "jsonb",
    "audit_reviewed_at" timestamp with time zone,
    "source_url" "text",
    "source_title" "text",
    "extracted_at" timestamp with time zone,
    CONSTRAINT "questions_audit_status_check" CHECK (("audit_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "questions_difficulty_check" CHECK ((("difficulty" >= 1) AND ("difficulty" <= 5))),
    CONSTRAINT "questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['unica_opcion'::"text", 'multiple_opcion'::"text", 'escenario'::"text"]))),
    CONSTRAINT "questions_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'incident_investigation'::"text", 'audited_generated'::"text", 'news_generated'::"text", 'incident_kata'::"text"])))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sensei_consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "question_text" "text" NOT NULL,
    "normalized_topic" "text",
    "is_cybersecurity" boolean DEFAULT false NOT NULL,
    "validation_reason" "text",
    "answer_text" "text",
    "answer_sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "matched_question_ids" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "used_bank" boolean DEFAULT false NOT NULL,
    "used_web" boolean DEFAULT false NOT NULL,
    "auditor_provider" "text",
    "auditor_replaced_answer" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'answered'::"text" NOT NULL,
    "feedback_helpful" boolean,
    "feedback_text" "text",
    "sentiment_label" "text",
    "sentiment_score" numeric(4,3),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "draft_answer_text" "text",
    "auditor_notes" "text",
    "auditor_model" "text",
    "auditor_started_at" timestamp with time zone,
    "auditor_finished_at" timestamp with time zone,
    "auditor_timeout_ms" integer,
    CONSTRAINT "sensei_consultations_sentiment_label_check" CHECK (("sentiment_label" = ANY (ARRAY['positivo'::"text", 'neutral'::"text", 'negativo'::"text"]))),
    CONSTRAINT "sensei_consultations_status_check" CHECK (("status" = ANY (ARRAY['answered'::"text", 'out_of_scope'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."sensei_consultations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ai_audit_corrections_report" AS
 SELECT 'sensei'::"text" AS "source_type",
    ("sc"."id")::"text" AS "record_id",
    "sc"."created_at",
    COALESCE("sc"."auditor_finished_at", "sc"."updated_at", "sc"."created_at") AS "reviewed_at",
    "sc"."question_text",
    "sc"."draft_answer_text" AS "original_answer_text",
    "sc"."answer_text" AS "corrected_answer_text",
    "sc"."auditor_provider",
    "sc"."auditor_model",
    "sc"."auditor_notes" AS "correction_notes",
    COALESCE("sc"."auditor_replaced_answer", false) AS "auditor_replaced_content",
    "sc"."status"
   FROM "public"."sensei_consultations" "sc"
  WHERE ("public"."is_admin"() AND (COALESCE("sc"."auditor_replaced_answer", false) = true))
UNION ALL
 SELECT 'web_scanner_question'::"text" AS "source_type",
    "q"."id" AS "record_id",
    "q"."created_at",
    COALESCE("q"."audit_reviewed_at", "q"."reviewed_at", "q"."created_at") AS "reviewed_at",
    "q"."question_text",
    ("q"."audit_original_payload")::"text" AS "original_answer_text",
    ("q"."audit_corrected_payload")::"text" AS "corrected_answer_text",
    "q"."audit_provider" AS "auditor_provider",
    "q"."audit_model" AS "auditor_model",
    "q"."audit_notes" AS "correction_notes",
    COALESCE("q"."audit_replaced_content", false) AS "auditor_replaced_content",
    COALESCE("q"."audit_status", 'unknown'::"text") AS "status"
   FROM "public"."questions" "q"
  WHERE ("public"."is_admin"() AND (COALESCE("q"."audit_replaced_content", false) = true));


ALTER VIEW "public"."ai_audit_corrections_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_name" "text" NOT NULL,
    "primary_ai" "text" NOT NULL,
    "primary_timeout_ms" integer DEFAULT 8000,
    "fallback_ai" "text",
    "fallback_timeout_ms" integer DEFAULT 5000,
    "tertiary_ai" "text",
    "temperature" numeric(3,2) DEFAULT 0.10,
    "max_tokens" integer DEFAULT 500,
    "prompt_version" "text",
    "active" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_providers" (
    "provider_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "provider_type" "text" NOT NULL,
    "model_name" "text" NOT NULL,
    "purpose" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "base_url" "text",
    "api_key_secret_id" "uuid",
    "default_timeout_seconds" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "ai_providers_default_timeout_seconds_check" CHECK (("default_timeout_seconds" > 0))
);


ALTER TABLE "public"."ai_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid",
    "user_id" "uuid",
    "delivered_at" timestamp with time zone DEFAULT "now"(),
    "opened_at" timestamp with time zone,
    "action_taken" "text"
);


ALTER TABLE "public"."alert_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "threat_type" "text" NOT NULL,
    "severity" "text",
    "source" "text",
    "source_url" "text",
    "target_business_types" "text"[],
    "target_banks" "text"[],
    "published_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "approved_by" "uuid",
    "active" boolean DEFAULT true,
    "related_question_ids" "text"[] DEFAULT ARRAY[]::"text"[],
    "related_incident_id" "uuid",
    "source_agent" "text",
    CONSTRAINT "alerts_severity_check" CHECK (("severity" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"])))
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_entry_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sector" "text",
    "entered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_entry_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_secrets" (
    "name" "text" NOT NULL,
    "secret_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_impressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shown_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sector" "text"
);


ALTER TABLE "public"."campaign_impressions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_impressions"."sector" IS 'Viewer sector snapshot at impression time (NULL = viewer matches all sectors). Used for the admin sector drill-down report.';



CREATE TABLE IF NOT EXISTS "public"."central_admin_campaign_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "actor" "text" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "central_admin_campaign_audit_action_check" CHECK (("action" = ANY (ARRAY['creada'::"text", 'actualizada'::"text", 'estado_cambiado'::"text"])))
);


ALTER TABLE "public"."central_admin_campaign_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."central_admin_campaign_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "max_image_kb" integer DEFAULT 500 NOT NULL,
    "max_image_width" integer DEFAULT 1920 NOT NULL,
    "max_image_height" integer DEFAULT 1920 NOT NULL,
    "updated_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "central_admin_campaign_settings_id_check" CHECK (("id" = 1)),
    CONSTRAINT "central_admin_campaign_settings_max_image_height_check" CHECK (("max_image_height" > 0)),
    CONSTRAINT "central_admin_campaign_settings_max_image_kb_check" CHECK (("max_image_kb" > 0)),
    CONSTRAINT "central_admin_campaign_settings_max_image_width_check" CHECK (("max_image_width" > 0))
);


ALTER TABLE "public"."central_admin_campaign_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."central_admin_campaign_tier_weights" (
    "value_tier" smallint NOT NULL,
    "min_usd" numeric NOT NULL,
    "max_usd" numeric,
    "weight" numeric NOT NULL,
    "label" "text" NOT NULL,
    "updated_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "central_admin_campaign_tier_weights_check" CHECK ((("max_usd" IS NULL) OR ("max_usd" >= "min_usd"))),
    CONSTRAINT "central_admin_campaign_tier_weights_min_usd_check" CHECK (("min_usd" >= (0)::numeric)),
    CONSTRAINT "central_admin_campaign_tier_weights_value_tier_check" CHECK ((("value_tier" >= 1) AND ("value_tier" <= 4))),
    CONSTRAINT "central_admin_campaign_tier_weights_weight_check" CHECK (("weight" > (0)::numeric))
);


ALTER TABLE "public"."central_admin_campaign_tier_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cyber_dojos" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "theme" "text" NOT NULL,
    "iso_control" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "manual_question_target" integer DEFAULT 20 NOT NULL,
    "ai_question_target" integer DEFAULT 30 NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cyber_dojos_ai_question_target_check" CHECK (("ai_question_target" >= 0)),
    CONSTRAINT "cyber_dojos_manual_question_target_check" CHECK (("manual_question_target" >= 0)),
    CONSTRAINT "cyber_dojos_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'draft'::"text", 'paused'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."cyber_dojos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."central_admin_question_bank" AS
 SELECT "q"."id",
    "q"."dojo_id",
    "d"."name" AS "dojo_name",
    "d"."theme" AS "dojo_theme",
    "q"."order_num",
    "q"."source_type",
    "q"."audit_status",
    "q"."difficulty",
    "q"."kata_label",
    "q"."iso_control",
    "q"."question_text",
    "q"."question_type",
    "q"."options",
    "q"."answer_text",
    "q"."explanation",
    "q"."editable",
    "q"."active",
    "q"."generated_from_incident_id",
    "q"."audit_notes",
    "q"."created_at",
    "q"."updated_at"
   FROM ("public"."questions" "q"
     LEFT JOIN "public"."cyber_dojos" "d" ON (("d"."id" = "q"."dojo_id")));


ALTER VIEW "public"."central_admin_question_bank" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."championship_match_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "answers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "total_time_seconds" numeric DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "current_question_started_at" timestamp with time zone,
    "current_question_index" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."championship_match_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."championship_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "championship_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "player1_id" "uuid" NOT NULL,
    "player2_id" "uuid",
    "question_ids" "text"[] NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "window_closes_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "winner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "championship_matches_check" CHECK (("window_closes_at" > "scheduled_at")),
    CONSTRAINT "championship_matches_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'bye'::"text"])))
);


ALTER TABLE "public"."championship_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."championship_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "championship_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "birthdate" "date" NOT NULL,
    "belt_at_registration" "text" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."championship_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."championships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "min_belt" "text" DEFAULT 'black'::"text" NOT NULL,
    "max_age" integer DEFAULT 18 NOT NULL,
    "registration_opens_at" timestamp with time zone NOT NULL,
    "registration_closes_at" timestamp with time zone NOT NULL,
    "questions_per_match" integer DEFAULT 5 NOT NULL,
    "time_limit_easy_seconds" integer DEFAULT 60 NOT NULL,
    "time_limit_medium_seconds" integer DEFAULT 90 NOT NULL,
    "time_limit_hard_seconds" integer DEFAULT 120 NOT NULL,
    "rules_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "championships_check" CHECK (("registration_closes_at" > "registration_opens_at")),
    CONSTRAINT "championships_max_age_check" CHECK (("max_age" > 0)),
    CONSTRAINT "championships_min_belt_check" CHECK (("min_belt" = ANY (ARRAY['white'::"text", 'yellow'::"text", 'orange'::"text", 'green'::"text", 'blue'::"text", 'brown'::"text", 'black'::"text"]))),
    CONSTRAINT "championships_questions_per_match_check" CHECK (("questions_per_match" > 0)),
    CONSTRAINT "championships_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'registration_open'::"text", 'registration_closed'::"text", 'in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "championships_time_limit_easy_seconds_check" CHECK (("time_limit_easy_seconds" > 0)),
    CONSTRAINT "championships_time_limit_hard_seconds_check" CHECK (("time_limit_hard_seconds" > 0)),
    CONSTRAINT "championships_time_limit_medium_seconds_check" CHECK (("time_limit_medium_seconds" > 0))
);


ALTER TABLE "public"."championships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_md" "text" NOT NULL,
    "content_sha256" "text" NOT NULL,
    "purposes" "jsonb" NOT NULL,
    "status" "text" NOT NULL,
    "requires_reconsent" boolean DEFAULT false NOT NULL,
    "change_summary" "text",
    "based_on_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone,
    "published_by" "uuid",
    "published_at" timestamp with time zone,
    "retired_by" "uuid",
    "retired_at" timestamp with time zone,
    CONSTRAINT "consent_documents_content_md_check" CHECK (("char_length"("content_md") <= 100000)),
    CONSTRAINT "consent_documents_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."consent_documents" OWNER TO "postgres";


ALTER TABLE "public"."consent_records" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."consent_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cyber_dojo_generated_katas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dojo_id" "text",
    "incident_investigation_id" "uuid",
    "source_url" "text",
    "title" "text" NOT NULL,
    "scenario" "text" NOT NULL,
    "task" "text" NOT NULL,
    "difficulty" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_kata_id" "uuid",
    "created_by_agent_run_id" "uuid",
    "audit_notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cyber_dojo_generated_katas_difficulty_check" CHECK ((("difficulty" >= 1) AND ("difficulty" <= 5))),
    CONSTRAINT "cyber_dojo_generated_katas_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'rejected'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."cyber_dojo_generated_katas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cyber_dojo_wisdom_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_title" "text" NOT NULL,
    "source_file" "text",
    "quote_text" "text" NOT NULL,
    "cyber_application" "text" NOT NULL,
    "tags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "display_weight" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cyber_dojo_wisdom_quotes_display_weight_check" CHECK (("display_weight" > 0))
);


ALTER TABLE "public"."cyber_dojo_wisdom_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cyber_news_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "source_type" "text" DEFAULT 'web'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cyber_news_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['web'::"text", 'rss'::"text", 'api'::"text"])))
);


ALTER TABLE "public"."cyber_news_sources" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."data_subject_request_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."data_subject_request_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_subject_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_number" "text" NOT NULL,
    "user_id" "uuid",
    "email_ciphertext" "jsonb",
    "email_hmac" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "details_ciphertext" "jsonb",
    "channel" "text" NOT NULL,
    "status" "text" DEFAULT 'recibida'::"text" NOT NULL,
    "routed_to_email" "text" NOT NULL,
    "settings_version" integer NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_note_ciphertext" "jsonb",
    "ip_ciphertext" "jsonb",
    "ip_hmac" "text",
    "key_version" integer,
    CONSTRAINT "data_subject_requests_channel_check" CHECK (("channel" = ANY (ARRAY['app'::"text", 'correo'::"text"]))),
    CONSTRAINT "data_subject_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['baja'::"text", 'acceso'::"text", 'rectificacion'::"text", 'eliminacion'::"text", 'oposicion'::"text", 'suspension'::"text", 'portabilidad'::"text", 'revocacion'::"text", 'decision_automatizada'::"text"]))),
    CONSTRAINT "data_subject_requests_status_check" CHECK (("status" = ANY (ARRAY['recibida'::"text", 'requiere_aclaracion'::"text", 'en_proceso'::"text", 'atendida'::"text", 'rechazada_con_motivo'::"text"])))
);


ALTER TABLE "public"."data_subject_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."domains_whitelist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_name" "text" NOT NULL,
    "domains" "text"[] NOT NULL,
    "entity_type" "text",
    "active" boolean DEFAULT true,
    "added_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "domains_whitelist_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['banco'::"text", 'gobierno'::"text", 'proveedor'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."domains_whitelist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "analyzed_at" timestamp with time zone DEFAULT "now"(),
    "sender_domain" "text",
    "sender_display_name" "text",
    "spf_pass" boolean,
    "dkim_pass" boolean,
    "dmarc_pass" boolean,
    "typosquatting_detected" boolean DEFAULT false,
    "urls_count" integer DEFAULT 0,
    "malicious_urls_count" integer DEFAULT 0,
    "verdict" "text",
    "threat_type" "text",
    "confidence_score" numeric(3,2),
    CONSTRAINT "email_analysis_verdict_check" CHECK (("verdict" = ANY (ARRAY['seguro'::"text", 'sospechoso'::"text", 'peligroso'::"text"])))
);


ALTER TABLE "public"."email_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "evaluation_date" timestamp with time zone DEFAULT "now"(),
    "total_score" integer NOT NULL,
    "risk_level" "text" NOT NULL,
    "belt_awarded" "text",
    "vector_scores" "jsonb",
    "responses" "jsonb" NOT NULL,
    "prompt_version" "text",
    "ai_used" "text",
    "ai_response_time_ms" integer,
    "completed" boolean DEFAULT true
);


ALTER TABLE "public"."evaluations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_investigations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incident_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "source_name" "text",
    "source_url" "text",
    "ai_provider_key" "text",
    "raw_payload" "jsonb",
    "generated_question_ids" "text"[] DEFAULT ARRAY[]::"text"[],
    "status" "text" DEFAULT 'detectado'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "incident_investigations_severity_check" CHECK (("severity" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"]))),
    CONSTRAINT "incident_investigations_status_check" CHECK (("status" = ANY (ARRAY['detectado'::"text", 'preguntas_generadas'::"text", 'auditado'::"text", 'descartado'::"text"])))
);


ALTER TABLE "public"."incident_investigations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kata_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "kata_id" "uuid",
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "verification_data" "jsonb",
    "points_earned" integer
);


ALTER TABLE "public"."kata_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."katas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kata_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "teaching" "text",
    "estimated_minutes" integer,
    "required_belt" "text",
    "points_reward" integer DEFAULT 100,
    "steps" "jsonb",
    "verification_type" "text",
    "active" boolean DEFAULT true,
    CONSTRAINT "katas_required_belt_check" CHECK ((("required_belt" IS NULL) OR ("required_belt" = ANY (ARRAY['white'::"text", 'yellow'::"text", 'orange'::"text", 'green'::"text", 'blue'::"text", 'brown'::"text", 'black'::"text"])))),
    CONSTRAINT "katas_verification_type_check" CHECK (("verification_type" = ANY (ARRAY['manual'::"text", 'automatic'::"text", 'self_report'::"text"])))
);


ALTER TABLE "public"."katas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dojo_id" "text" NOT NULL,
    "version" "text" NOT NULL,
    "case_ids" "text"[] NOT NULL,
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "score" integer,
    "passed" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "rewarded_at" timestamp with time zone,
    CONSTRAINT "learning_attempts_case_ids_check" CHECK (("cardinality"("case_ids") = 5))
);


ALTER TABLE "public"."learning_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_dojos" (
    "id" "text" NOT NULL,
    "belt" "text" NOT NULL,
    "db_belt" "text" NOT NULL,
    "rank" integer NOT NULL,
    "title" "text" NOT NULL,
    "exam_code" "text" NOT NULL,
    "version" "text" NOT NULL,
    "question_ids" "text"[] NOT NULL,
    CONSTRAINT "learning_dojos_question_ids_check" CHECK (("cardinality"("question_ids") = 30))
);


ALTER TABLE "public"."learning_dojos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_items" (
    "id" "text" NOT NULL,
    "version" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "belt" "text" NOT NULL,
    "sublevel" integer NOT NULL,
    "family" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "source_dojo_id" "text",
    "source_question_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_items_kind_check" CHECK (("kind" = ANY (ARRAY['question'::"text", 'case'::"text"]))),
    CONSTRAINT "learning_items_sublevel_check" CHECK ((("sublevel" >= 1) AND ("sublevel" <= 3)))
);


ALTER TABLE "public"."learning_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_progress" (
    "user_id" "uuid" NOT NULL,
    "dojo_id" "text" NOT NULL,
    "version" "text" NOT NULL,
    "question_ids" "text"[] NOT NULL,
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cursor" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_progress_cursor_check" CHECK ((("cursor" >= 0) AND ("cursor" <= 29))),
    CONSTRAINT "learning_progress_question_ids_check" CHECK (("cardinality"("question_ids") = 30))
);


ALTER TABLE "public"."learning_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."minigame_served" (
    "user_id" "uuid" NOT NULL,
    "question_id" "text" NOT NULL,
    "served_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."minigame_served" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_consent_state" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("purpose_code") "id",
    "document_id",
    "document_version",
    "purpose_code",
    "decision",
    "channel",
    "server_ts"
   FROM "public"."consent_records"
  WHERE ("user_id" = "auth"."uid"())
  ORDER BY "purpose_code", "server_ts" DESC;


ALTER VIEW "public"."my_consent_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."privacy_settings" (
    "id" bigint NOT NULL,
    "settings_version" integer NOT NULL,
    "controller_name" "text",
    "controller_address" "text",
    "controller_phone" "text",
    "privacy_email" "text" NOT NULL,
    "privacy_email_pending" "text",
    "privacy_email_code_hash" "text",
    "privacy_email_code_expires_at" timestamp with time zone,
    "dpo_name" "text",
    "dpo_contact" "text",
    "unsubscribe_subject" "text" DEFAULT 'Solicitud de baja y eliminación de datos - CiberDojo'::"text" NOT NULL,
    "response_days" integer DEFAULT 15 NOT NULL,
    "response_day_type" "text" DEFAULT 'calendario'::"text" NOT NULL,
    "ip_retention_days" integer DEFAULT 730 NOT NULL,
    "evidence_retention_days" integer DEFAULT 1825 NOT NULL,
    "privacy_policy_url" "text",
    "four_eyes_publish" boolean DEFAULT false NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "privacy_settings_evidence_retention_days_check" CHECK (("evidence_retention_days" >= 0)),
    CONSTRAINT "privacy_settings_ip_retention_days_check" CHECK (("ip_retention_days" >= 0)),
    CONSTRAINT "privacy_settings_response_day_type_check" CHECK (("response_day_type" = ANY (ARRAY['calendario'::"text", 'habiles'::"text"]))),
    CONSTRAINT "privacy_settings_response_days_check" CHECK ((("response_days" >= 1) AND ("response_days" <= 90)))
);


ALTER TABLE "public"."privacy_settings" OWNER TO "postgres";


ALTER TABLE "public"."privacy_settings" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."privacy_settings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."recommendations_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "query_hash" "text" NOT NULL,
    "risk_profile" "jsonb" NOT NULL,
    "recommendation_text" "text" NOT NULL,
    "ai_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hit_count" integer DEFAULT 0,
    "last_hit_at" timestamp with time zone
);


ALTER TABLE "public"."recommendations_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_alert_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "severity_threshold" "text" NOT NULL,
    "event_count_threshold" integer DEFAULT 5 NOT NULL,
    "window_minutes" integer DEFAULT 60 NOT NULL,
    "notify_email" "text",
    "notify_webhook_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_triggered_at" timestamp with time zone,
    CONSTRAINT "security_alert_config_event_count_threshold_check" CHECK (("event_count_threshold" > 0)),
    CONSTRAINT "security_alert_config_severity_threshold_check" CHECK (("severity_threshold" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"]))),
    CONSTRAINT "security_alert_config_window_minutes_check" CHECK (("window_minutes" > 0))
);


ALTER TABLE "public"."security_alert_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "target_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_hash" "text",
    "user_agent_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_config_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "before_value" "jsonb",
    "after_value" "jsonb",
    CONSTRAINT "security_config_audit_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."security_config_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_diagnoses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "event_count" integer DEFAULT 0 NOT NULL,
    "severity" "text" NOT NULL,
    "summary_es" "text" NOT NULL,
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provider_key" "text",
    "validation_status" "text" DEFAULT 'valid'::"text" NOT NULL,
    "raw_output" "text",
    "triggered_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "security_diagnoses_severity_check" CHECK (("severity" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"]))),
    CONSTRAINT "security_diagnoses_validation_status_check" CHECK (("validation_status" = ANY (ARRAY['valid'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."security_diagnoses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_diagnosis_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "diagnosis_id" "uuid" NOT NULL,
    "rating" "text" NOT NULL,
    "comment" "text",
    "submitted_by" "text",
    CONSTRAINT "security_diagnosis_feedback_rating_check" CHECK (("rating" = ANY (ARRAY['correcto'::"text", 'incorrecto'::"text"])))
);


ALTER TABLE "public"."security_diagnosis_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_easm_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scan_month" "date" NOT NULL,
    "finding_type" "text" NOT NULL,
    "target" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "security_easm_findings_finding_type_check" CHECK (("finding_type" = ANY (ARRAY['public_endpoint'::"text", 'public_bucket'::"text", 'missing_env_var'::"text", 'other'::"text"]))),
    CONSTRAINT "security_easm_findings_severity_check" CHECK (("severity" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"])))
);


ALTER TABLE "public"."security_easm_findings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "endpoint" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "ip_hash" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "security_events_severity_check" CHECK (("severity" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_kata_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_diagnosis_id" "uuid",
    "source_event_id" "uuid",
    "title" "text" NOT NULL,
    "body_md" "text" NOT NULL,
    "status" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "created_by" "text",
    "reviewed_by" "text",
    "published_question_id" "uuid",
    "published_at" timestamp with time zone,
    CONSTRAINT "security_kata_drafts_status_check" CHECK (("status" = ANY (ARRAY['borrador'::"text", 'en_revision'::"text", 'publicado'::"text"])))
);


ALTER TABLE "public"."security_kata_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_rate_limit_hits" (
    "id" bigint NOT NULL,
    "bucket_key" "text" NOT NULL,
    "hit_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_rate_limit_hits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."security_rate_limit_hits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."security_rate_limit_hits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."security_rate_limit_hits_id_seq" OWNED BY "public"."security_rate_limit_hits"."id";



CREATE OR REPLACE VIEW "public"."sensei_consultation_stats" AS
 SELECT ("date_trunc"('day'::"text", "created_at"))::"date" AS "day",
    "count"(*) AS "total_consultations",
    "count"(*) FILTER (WHERE "is_cybersecurity") AS "cybersecurity_consultations",
    "count"(*) FILTER (WHERE (NOT "is_cybersecurity")) AS "out_of_scope_consultations",
    "count"(*) FILTER (WHERE ("feedback_helpful" IS TRUE)) AS "helpful_yes",
    "count"(*) FILTER (WHERE ("feedback_helpful" IS FALSE)) AS "helpful_no",
    "count"(*) FILTER (WHERE ("sentiment_label" = 'positivo'::"text")) AS "positive_feedback",
    "count"(*) FILTER (WHERE ("sentiment_label" = 'neutral'::"text")) AS "neutral_feedback",
    "count"(*) FILTER (WHERE ("sentiment_label" = 'negativo'::"text")) AS "negative_feedback"
   FROM "public"."sensei_consultations"
  GROUP BY (("date_trunc"('day'::"text", "created_at"))::"date")
  ORDER BY (("date_trunc"('day'::"text", "created_at"))::"date") DESC;


ALTER VIEW "public"."sensei_consultation_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" "text" NOT NULL,
    "sponsor_type" "text",
    "coverage_provinces" "text"[],
    "services" "jsonb",
    "subscription_tier" "text",
    "monthly_fee" numeric(10,2),
    "matching_rules" "jsonb",
    "active" boolean DEFAULT true,
    "contact_email" "text",
    "contact_phone" "text",
    CONSTRAINT "sponsors_sponsor_type_check" CHECK (("sponsor_type" = ANY (ARRAY['banco'::"text", 'antivirus'::"text", 'tecnico'::"text", 'aseguradora'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tpot_ai_analysis_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_by" "text",
    "status" "text" NOT NULL,
    "filters_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sanitized_input_ref" "text",
    "input_summary_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_ai_output" "jsonb",
    "audited_output" "jsonb",
    "audit_status" "text",
    "audit_notes" "text",
    "approved_output" "jsonb",
    "model" "text",
    "audit_model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "text",
    "approved_at" timestamp with time zone,
    CONSTRAINT "tpot_ai_analysis_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'audited'::"text", 'approved'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."tpot_ai_analysis_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tpot_integration_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "base_url" "text",
    "elastic_url_encrypted_or_reference" "text",
    "verify_tls" boolean DEFAULT true NOT NULL,
    "allowed_indexes" "text"[] DEFAULT ARRAY['logstash-*'::"text", 'tpot-*'::"text", 'cowrie-*'::"text", 'suricata-*'::"text", 'dionaea-*'::"text"] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tpot_integration_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tpot_iocs_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indicator_type" "text" NOT NULL,
    "indicator_value_hash" "text" NOT NULL,
    "indicator_value_masked" "text" NOT NULL,
    "frequency" integer DEFAULT 1 NOT NULL,
    "first_seen" timestamp with time zone,
    "last_seen" timestamp with time zone,
    "severity" "text",
    "source_honeypot" "text",
    "tags_json" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tpot_iocs_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tpot_query_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text",
    "action" "text" NOT NULL,
    "filters_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "records_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tpot_query_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "full_name" "text",
    "business_type" "text",
    "belt" "text" DEFAULT 'white'::"text",
    "total_points" integer DEFAULT 0,
    "current_risk_level" "text",
    "location_city" "text",
    "location_province" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_evaluation_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    "role" "text" DEFAULT 'user'::"text",
    "email_encrypted" "jsonb",
    "email_lookup_hmac" "text",
    "full_name_encrypted" "jsonb",
    "phone_encrypted" "jsonb",
    "location_city_encrypted" "jsonb",
    "location_province_encrypted" "jsonb",
    "pii_key_version" integer DEFAULT 1,
    "pii_encrypted_at" timestamp with time zone,
    "pii_migration_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "data_processing_authorized" boolean DEFAULT false NOT NULL,
    "data_processing_authorized_at" timestamp with time zone,
    "privacy_notice_version" "text" DEFAULT '2026-06-22'::"text" NOT NULL,
    "privacy_updated_at" timestamp with time zone,
    "email_domain" "text",
    "sector" "text",
    CONSTRAINT "users_belt_check" CHECK (("belt" = ANY (ARRAY['white'::"text", 'yellow'::"text", 'orange'::"text", 'green'::"text", 'blue'::"text", 'brown'::"text", 'black'::"text"]))),
    CONSTRAINT "users_current_risk_level_check" CHECK (("current_risk_level" = ANY (ARRAY['bajo'::"text", 'medio'::"text", 'alto'::"text", 'critico'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."total_points" IS 'Gamification points only. Risk assessment scores are stored in evaluations.total_score.';



COMMENT ON COLUMN "public"."users"."sector" IS 'Industry/sector snapshot taken from business_sectors.industry at registration time. NULL = matches all sectors (used for legacy/test accounts).';



CREATE OR REPLACE VIEW "public"."user_statistics_private" AS
 SELECT "business_type",
    "belt",
    "current_risk_level",
    ("count"(*))::integer AS "user_count"
   FROM "public"."users"
  GROUP BY "business_type", "belt", "current_risk_level";


ALTER VIEW "public"."user_statistics_private" OWNER TO "postgres";


ALTER TABLE ONLY "public"."security_rate_limit_hits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."security_rate_limit_hits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("user_id", "role");



ALTER TABLE ONLY "public"."agent_configs"
    ADD CONSTRAINT "agent_configs_agent_code_key" UNIQUE ("agent_code");



ALTER TABLE ONLY "public"."agent_configs"
    ADD CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_provider_assignments"
    ADD CONSTRAINT "agent_provider_assignments_agent_config_id_provider_key_key" UNIQUE ("agent_config_id", "provider_key");



ALTER TABLE ONLY "public"."agent_provider_assignments"
    ADD CONSTRAINT "agent_provider_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_configs"
    ADD CONSTRAINT "ai_configs_config_name_key" UNIQUE ("config_name");



ALTER TABLE ONLY "public"."ai_configs"
    ADD CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_providers"
    ADD CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("provider_key");



ALTER TABLE ONLY "public"."alert_deliveries"
    ADD CONSTRAINT "alert_deliveries_alert_id_user_id_key" UNIQUE ("alert_id", "user_id");



ALTER TABLE ONLY "public"."alert_deliveries"
    ADD CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_entry_log"
    ADD CONSTRAINT "app_entry_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_secrets"
    ADD CONSTRAINT "app_secrets_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."business_sectors"
    ADD CONSTRAINT "business_sectors_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."campaign_impressions"
    ADD CONSTRAINT "campaign_impressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."central_admin_campaign_audit"
    ADD CONSTRAINT "central_admin_campaign_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."central_admin_campaign_settings"
    ADD CONSTRAINT "central_admin_campaign_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."central_admin_campaign_tier_weights"
    ADD CONSTRAINT "central_admin_campaign_tier_weights_pkey" PRIMARY KEY ("value_tier");



ALTER TABLE ONLY "public"."central_admin_campaigns"
    ADD CONSTRAINT "central_admin_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."championship_match_attempts"
    ADD CONSTRAINT "championship_match_attempts_match_id_user_id_key" UNIQUE ("match_id", "user_id");



ALTER TABLE ONLY "public"."championship_match_attempts"
    ADD CONSTRAINT "championship_match_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."championship_matches"
    ADD CONSTRAINT "championship_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."championship_registrations"
    ADD CONSTRAINT "championship_registrations_championship_id_user_id_key" UNIQUE ("championship_id", "user_id");



ALTER TABLE ONLY "public"."championship_registrations"
    ADD CONSTRAINT "championship_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."championships"
    ADD CONSTRAINT "championships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_version_key" UNIQUE ("version");



ALTER TABLE ONLY "public"."consent_records"
    ADD CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cyber_dojo_generated_katas"
    ADD CONSTRAINT "cyber_dojo_generated_katas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cyber_dojo_wisdom_quotes"
    ADD CONSTRAINT "cyber_dojo_wisdom_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cyber_dojos"
    ADD CONSTRAINT "cyber_dojos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cyber_news_sources"
    ADD CONSTRAINT "cyber_news_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cyber_news_sources"
    ADD CONSTRAINT "cyber_news_sources_url_key" UNIQUE ("url");



ALTER TABLE ONLY "public"."data_subject_requests"
    ADD CONSTRAINT "data_subject_requests_case_number_key" UNIQUE ("case_number");



ALTER TABLE ONLY "public"."data_subject_requests"
    ADD CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domains_whitelist"
    ADD CONSTRAINT "domains_whitelist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_analysis"
    ADD CONSTRAINT "email_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_investigations"
    ADD CONSTRAINT "incident_investigations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kata_completions"
    ADD CONSTRAINT "kata_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kata_completions"
    ADD CONSTRAINT "kata_completions_user_id_kata_id_key" UNIQUE ("user_id", "kata_id");



ALTER TABLE ONLY "public"."katas"
    ADD CONSTRAINT "katas_kata_code_key" UNIQUE ("kata_code");



ALTER TABLE ONLY "public"."katas"
    ADD CONSTRAINT "katas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_attempts"
    ADD CONSTRAINT "learning_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_dojos"
    ADD CONSTRAINT "learning_dojos_belt_key" UNIQUE ("belt");



ALTER TABLE ONLY "public"."learning_dojos"
    ADD CONSTRAINT "learning_dojos_db_belt_key" UNIQUE ("db_belt");



ALTER TABLE ONLY "public"."learning_dojos"
    ADD CONSTRAINT "learning_dojos_exam_code_key" UNIQUE ("exam_code");



ALTER TABLE ONLY "public"."learning_dojos"
    ADD CONSTRAINT "learning_dojos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_dojos"
    ADD CONSTRAINT "learning_dojos_rank_key" UNIQUE ("rank");



ALTER TABLE ONLY "public"."learning_items"
    ADD CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("user_id", "dojo_id");



ALTER TABLE ONLY "public"."minigame_served"
    ADD CONSTRAINT "minigame_served_pkey" PRIMARY KEY ("user_id", "question_id");



ALTER TABLE ONLY "public"."privacy_settings"
    ADD CONSTRAINT "privacy_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."privacy_settings"
    ADD CONSTRAINT "privacy_settings_settings_version_key" UNIQUE ("settings_version");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recommendations_cache"
    ADD CONSTRAINT "recommendations_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recommendations_cache"
    ADD CONSTRAINT "recommendations_cache_query_hash_key" UNIQUE ("query_hash");



ALTER TABLE ONLY "public"."security_alert_config"
    ADD CONSTRAINT "security_alert_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_events"
    ADD CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_config_audit"
    ADD CONSTRAINT "security_config_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_diagnoses"
    ADD CONSTRAINT "security_diagnoses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_diagnosis_feedback"
    ADD CONSTRAINT "security_diagnosis_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_easm_findings"
    ADD CONSTRAINT "security_easm_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_kata_drafts"
    ADD CONSTRAINT "security_kata_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_rate_limit_hits"
    ADD CONSTRAINT "security_rate_limit_hits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sensei_consultations"
    ADD CONSTRAINT "sensei_consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsors"
    ADD CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tpot_ai_analysis_jobs"
    ADD CONSTRAINT "tpot_ai_analysis_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tpot_integration_settings"
    ADD CONSTRAINT "tpot_integration_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tpot_iocs_cache"
    ADD CONSTRAINT "tpot_iocs_cache_indicator_type_indicator_value_hash_key" UNIQUE ("indicator_type", "indicator_value_hash");



ALTER TABLE ONLY "public"."tpot_iocs_cache"
    ADD CONSTRAINT "tpot_iocs_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tpot_query_audit"
    ADD CONSTRAINT "tpot_query_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "admin_audit_log_action" ON "public"."admin_audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "admin_audit_log_actor" ON "public"."admin_audit_log" USING "btree" ("actor_id", "created_at" DESC);



CREATE UNIQUE INDEX "championships_one_active" ON "public"."championships" USING "btree" ((true)) WHERE ("status" = ANY (ARRAY['registration_open'::"text", 'registration_closed'::"text", 'in_progress'::"text"]));



CREATE UNIQUE INDEX "consent_documents_one_published" ON "public"."consent_documents" USING "btree" ("status") WHERE ("status" = 'published'::"text");



CREATE INDEX "consent_records_ip_hmac" ON "public"."consent_records" USING "btree" ("ip_hmac");



CREATE INDEX "consent_records_user_purpose" ON "public"."consent_records" USING "btree" ("user_id", "purpose_code", "server_ts" DESC);



CREATE INDEX "consent_records_user_ref_hmac" ON "public"."consent_records" USING "btree" ("user_ref_hmac");



CREATE INDEX "data_subject_requests_email_hmac" ON "public"."data_subject_requests" USING "btree" ("email_hmac");



CREATE INDEX "data_subject_requests_status_due" ON "public"."data_subject_requests" USING "btree" ("status", "due_at");



CREATE INDEX "idx_agent_provider_assignments_agent" ON "public"."agent_provider_assignments" USING "btree" ("agent_config_id", "priority");



CREATE INDEX "idx_agent_runs_agent_date" ON "public"."agent_runs" USING "btree" ("agent_config_id", "run_date" DESC);



CREATE INDEX "idx_alerts_active" ON "public"."alerts" USING "btree" ("active");



CREATE INDEX "idx_alerts_severity" ON "public"."alerts" USING "btree" ("severity");



CREATE INDEX "idx_app_entry_log_sector_time" ON "public"."app_entry_log" USING "btree" ("sector", "entered_at");



CREATE INDEX "idx_app_entry_log_time" ON "public"."app_entry_log" USING "btree" ("entered_at");



CREATE INDEX "idx_campaign_impressions_campaign_time" ON "public"."campaign_impressions" USING "btree" ("campaign_id", "shown_at");



CREATE INDEX "idx_campaign_impressions_sector_time" ON "public"."campaign_impressions" USING "btree" ("sector", "shown_at");



CREATE INDEX "idx_campaign_impressions_user" ON "public"."campaign_impressions" USING "btree" ("user_id", "campaign_id");



CREATE INDEX "idx_central_admin_campaign_audit_campaign" ON "public"."central_admin_campaign_audit" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "idx_central_admin_campaigns_active" ON "public"."central_admin_campaigns" USING "btree" ("active", "moment");



CREATE INDEX "idx_championship_matches_round" ON "public"."championship_matches" USING "btree" ("championship_id", "round");



CREATE INDEX "idx_cyber_dojos_status_order" ON "public"."cyber_dojos" USING "btree" ("status", "display_order");



CREATE INDEX "idx_cyber_news_sources_enabled_priority" ON "public"."cyber_news_sources" USING "btree" ("enabled", "priority");



CREATE INDEX "idx_easm_findings_scan_month" ON "public"."security_easm_findings" USING "btree" ("scan_month" DESC);



CREATE INDEX "idx_email_analysis_user" ON "public"."email_analysis" USING "btree" ("user_id");



CREATE INDEX "idx_email_analysis_verdict" ON "public"."email_analysis" USING "btree" ("verdict");



CREATE INDEX "idx_evaluations_date" ON "public"."evaluations" USING "btree" ("evaluation_date" DESC);



CREATE INDEX "idx_evaluations_user" ON "public"."evaluations" USING "btree" ("user_id");



CREATE INDEX "idx_generated_katas_dojo_status" ON "public"."cyber_dojo_generated_katas" USING "btree" ("dojo_id", "status", "created_at" DESC);



CREATE INDEX "idx_incident_investigations_date" ON "public"."incident_investigations" USING "btree" ("incident_date" DESC);



CREATE INDEX "idx_incident_investigations_severity" ON "public"."incident_investigations" USING "btree" ("severity");



CREATE INDEX "idx_kata_completions_user" ON "public"."kata_completions" USING "btree" ("user_id");



CREATE INDEX "idx_kata_drafts_status" ON "public"."security_kata_drafts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_questions_audit_status" ON "public"."questions" USING "btree" ("audit_status");



CREATE INDEX "idx_questions_branch" ON "public"."questions" USING "btree" ("branch");



CREATE INDEX "idx_questions_dojo_order" ON "public"."questions" USING "btree" ("dojo_id", "source_type", "order_num");



CREATE INDEX "idx_questions_news_generated" ON "public"."questions" USING "btree" ("source_type", "extracted_at" DESC) WHERE ("source_type" = 'news_generated'::"text");



CREATE INDEX "idx_rate_limit_bucket_time" ON "public"."security_rate_limit_hits" USING "btree" ("bucket_key", "hit_at" DESC);



CREATE INDEX "idx_recommendations_hash" ON "public"."recommendations_cache" USING "btree" ("query_hash");



CREATE INDEX "idx_security_diagnoses_created_at" ON "public"."security_diagnoses" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_events_created_at" ON "public"."security_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_events_endpoint" ON "public"."security_events" USING "btree" ("endpoint", "created_at" DESC);



CREATE INDEX "idx_security_events_severity" ON "public"."security_events" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_sensei_consultations_created" ON "public"."sensei_consultations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_sensei_consultations_sentiment" ON "public"."sensei_consultations" USING "btree" ("sentiment_label");



CREATE INDEX "idx_sensei_consultations_user" ON "public"."sensei_consultations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_users_email_domain" ON "public"."users" USING "btree" ("email_domain") WHERE ("email_domain" IS NOT NULL);



CREATE INDEX "idx_users_email_lookup_hmac" ON "public"."users" USING "btree" ("email_lookup_hmac") WHERE ("email_lookup_hmac" IS NOT NULL);



CREATE INDEX "idx_users_pii_migration_status" ON "public"."users" USING "btree" ("pii_migration_status");



CREATE INDEX "idx_users_ranking" ON "public"."users" USING "btree" ("total_points" DESC, "id") WHERE (("email_domain" IS NOT NULL) AND ("email_domain" <> ALL (ARRAY['gmail.com'::"text", 'hotmail.com'::"text", 'outlook.com'::"text", 'yahoo.com'::"text", 'icloud.com'::"text", 'aol.com'::"text", 'protonmail.com'::"text", 'tutanota.com'::"text", 'mail.com'::"text", 'msn.com'::"text", 'live.com'::"text", 'altavista.com'::"text", 'ymail.com'::"text", 'zoho.com'::"text", 'gmx.com'::"text", 'fastmail.com'::"text", 'rediffmail.com'::"text", 'rocketmail.com'::"text"])));



CREATE INDEX "idx_wisdom_quotes_active" ON "public"."cyber_dojo_wisdom_quotes" USING "btree" ("active", "display_weight");



CREATE INDEX "learning_case_pool" ON "public"."learning_items" USING "btree" ("belt", "version", "kind", "sublevel");



CREATE UNIQUE INDEX "learning_items_one_per_dojo_belt" ON "public"."learning_items" USING "btree" ("source_dojo_id", "belt") WHERE ("source_dojo_id" IS NOT NULL);



CREATE UNIQUE INDEX "learning_one_open_attempt" ON "public"."learning_attempts" USING "btree" ("user_id", "dojo_id") WHERE ("finished_at" IS NULL);



CREATE UNIQUE INDEX "privacy_settings_one_current" ON "public"."privacy_settings" USING "btree" ("is_current") WHERE "is_current";



CREATE OR REPLACE TRIGGER "admin_audit_log_append_only" BEFORE DELETE OR UPDATE ON "public"."admin_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."block_admin_audit_log_mutation"();



CREATE OR REPLACE TRIGGER "admin_audit_log_chain" BEFORE INSERT ON "public"."admin_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."admin_audit_log_chain_trigger"();



CREATE OR REPLACE TRIGGER "consent_documents_immutable" BEFORE UPDATE ON "public"."consent_documents" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_consent_document_immutability"();



CREATE OR REPLACE TRIGGER "consent_records_append_only" BEFORE DELETE OR UPDATE ON "public"."consent_records" FOR EACH ROW EXECUTE FUNCTION "public"."block_consent_records_mutation"();



CREATE OR REPLACE TRIGGER "consent_records_chain" BEFORE INSERT ON "public"."consent_records" FOR EACH ROW EXECUTE FUNCTION "public"."consent_records_chain_trigger"();



CREATE OR REPLACE TRIGGER "prevent_user_security_field_tampering_trigger" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_user_security_field_tampering"();



CREATE OR REPLACE TRIGGER "privacy_settings_append_only" BEFORE DELETE OR UPDATE ON "public"."privacy_settings" FOR EACH ROW EXECUTE FUNCTION "public"."block_privacy_settings_mutation"();



CREATE OR REPLACE TRIGGER "sync_approved_news_question" AFTER UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_sync_approved_news_question"();



CREATE OR REPLACE TRIGGER "sync_central_admin_campaigns_active" BEFORE INSERT OR UPDATE ON "public"."central_admin_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."sync_campaign_active_from_status"();



CREATE OR REPLACE TRIGGER "touch_business_sectors_updated_at" BEFORE UPDATE ON "public"."business_sectors" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_central_admin_campaign_tier_weights_updated_at" BEFORE UPDATE ON "public"."central_admin_campaign_tier_weights" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_central_admin_campaigns_updated_at" BEFORE UPDATE ON "public"."central_admin_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_cyber_dojos_updated_at" BEFORE UPDATE ON "public"."cyber_dojos" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_cyber_news_sources_updated_at" BEFORE UPDATE ON "public"."cyber_news_sources" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_generated_katas_updated_at" BEFORE UPDATE ON "public"."cyber_dojo_generated_katas" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_questions_updated_at" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_sensei_consultations_updated_at" BEFORE UPDATE ON "public"."sensei_consultations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "touch_wisdom_quotes_updated_at" BEFORE UPDATE ON "public"."cyber_dojo_wisdom_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "update_agent_configs_updated_at" BEFORE UPDATE ON "public"."agent_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_ai_configs_updated_at" BEFORE UPDATE ON "public"."ai_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_provider_assignments"
    ADD CONSTRAINT "agent_provider_assignments_agent_config_id_fkey" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_provider_assignments"
    ADD CONSTRAINT "agent_provider_assignments_provider_key_fkey" FOREIGN KEY ("provider_key") REFERENCES "public"."ai_providers"("provider_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_agent_config_id_fkey" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_deliveries"
    ADD CONSTRAINT "alert_deliveries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_deliveries"
    ADD CONSTRAINT "alert_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."app_entry_log"
    ADD CONSTRAINT "app_entry_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_impressions"
    ADD CONSTRAINT "campaign_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."central_admin_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_impressions"
    ADD CONSTRAINT "campaign_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."central_admin_campaign_audit"
    ADD CONSTRAINT "central_admin_campaign_audit_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."central_admin_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."championship_match_attempts"
    ADD CONSTRAINT "championship_match_attempts_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."championship_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_match_attempts"
    ADD CONSTRAINT "championship_match_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_matches"
    ADD CONSTRAINT "championship_matches_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_matches"
    ADD CONSTRAINT "championship_matches_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_matches"
    ADD CONSTRAINT "championship_matches_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_matches"
    ADD CONSTRAINT "championship_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."championship_registrations"
    ADD CONSTRAINT "championship_registrations_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."championship_registrations"
    ADD CONSTRAINT "championship_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_based_on_id_fkey" FOREIGN KEY ("based_on_id") REFERENCES "public"."consent_documents"("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_retired_by_fkey" FOREIGN KEY ("retired_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."consent_documents"
    ADD CONSTRAINT "consent_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."consent_records"
    ADD CONSTRAINT "consent_records_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."consent_documents"("id");



ALTER TABLE ONLY "public"."consent_records"
    ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cyber_dojo_generated_katas"
    ADD CONSTRAINT "cyber_dojo_generated_katas_created_by_agent_run_id_fkey" FOREIGN KEY ("created_by_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cyber_dojo_generated_katas"
    ADD CONSTRAINT "cyber_dojo_generated_katas_dojo_id_fkey" FOREIGN KEY ("dojo_id") REFERENCES "public"."cyber_dojos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cyber_dojo_generated_katas"
    ADD CONSTRAINT "cyber_dojo_generated_katas_incident_investigation_id_fkey" FOREIGN KEY ("incident_investigation_id") REFERENCES "public"."incident_investigations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cyber_dojo_generated_katas"
    ADD CONSTRAINT "cyber_dojo_generated_katas_published_kata_id_fkey" FOREIGN KEY ("published_kata_id") REFERENCES "public"."katas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."data_subject_requests"
    ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_analysis"
    ADD CONSTRAINT "email_analysis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_investigations"
    ADD CONSTRAINT "incident_investigations_ai_provider_key_fkey" FOREIGN KEY ("ai_provider_key") REFERENCES "public"."ai_providers"("provider_key");



ALTER TABLE ONLY "public"."kata_completions"
    ADD CONSTRAINT "kata_completions_kata_id_fkey" FOREIGN KEY ("kata_id") REFERENCES "public"."katas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kata_completions"
    ADD CONSTRAINT "kata_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_attempts"
    ADD CONSTRAINT "learning_attempts_dojo_id_fkey" FOREIGN KEY ("dojo_id") REFERENCES "public"."learning_dojos"("id");



ALTER TABLE ONLY "public"."learning_attempts"
    ADD CONSTRAINT "learning_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_dojo_id_fkey" FOREIGN KEY ("dojo_id") REFERENCES "public"."learning_dojos"("id");



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."minigame_served"
    ADD CONSTRAINT "minigame_served_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."privacy_settings"
    ADD CONSTRAINT "privacy_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_dojo_id_fkey" FOREIGN KEY ("dojo_id") REFERENCES "public"."cyber_dojos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_kata_drafts"
    ADD CONSTRAINT "security_kata_drafts_source_diagnosis_id_fkey" FOREIGN KEY ("source_diagnosis_id") REFERENCES "public"."security_diagnoses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_kata_drafts"
    ADD CONSTRAINT "security_kata_drafts_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "public"."security_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sensei_consultations"
    ADD CONSTRAINT "sensei_consultations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can insert questions" ON "public"."questions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage agent configs" ON "public"."agent_configs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage agent provider assignments" ON "public"."agent_provider_assignments" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage agent runs" ON "public"."agent_runs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage ai providers" ON "public"."ai_providers" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage alerts" ON "public"."alerts" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage business sectors" ON "public"."business_sectors" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage campaign settings" ON "public"."central_admin_campaign_settings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage campaigns" ON "public"."central_admin_campaigns" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage cyber dojos" ON "public"."cyber_dojos" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage cyber news sources" ON "public"."cyber_news_sources" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage domains_whitelist" ON "public"."domains_whitelist" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage generated katas" ON "public"."cyber_dojo_generated_katas" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage incident investigations" ON "public"."incident_investigations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage katas" ON "public"."katas" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage provider assignments" ON "public"."agent_provider_assignments" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage recommendations_cache" ON "public"."recommendations_cache" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage sponsors" ON "public"."sponsors" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage tier weights" ON "public"."central_admin_campaign_tier_weights" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage wisdom quotes" ON "public"."cyber_dojo_wisdom_quotes" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update questions" ON "public"."questions" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update users" ON "public"."users" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can view all evaluations" ON "public"."evaluations" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all kata completions" ON "public"."kata_completions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all questions" ON "public"."questions" FOR SELECT USING (("public"."is_admin"() OR ("active" = true)));



CREATE POLICY "Admins can view all users" ON "public"."users" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view and manage ai_configs" ON "public"."ai_configs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can view campaign audit" ON "public"."central_admin_campaign_audit" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view security audit events" ON "public"."security_audit_events" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins manage championships" ON "public"."championships" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage tpot ai jobs" ON "public"."tpot_ai_analysis_jobs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage tpot iocs" ON "public"."tpot_iocs_cache" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage tpot settings" ON "public"."tpot_integration_settings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins view all attempts" ON "public"."championship_match_attempts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view all matches" ON "public"."championship_matches" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view all registrations" ON "public"."championship_registrations" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view tpot audit" ON "public"."tpot_query_audit" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Anyone can view championships" ON "public"."championships" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view recommendations" ON "public"."recommendations_cache" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can view active business sectors" ON "public"."business_sectors" FOR SELECT USING (("active" = true));



CREATE POLICY "Public can view active cyber dojos" ON "public"."cyber_dojos" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Public can view active sponsors" ON "public"."sponsors" FOR SELECT USING (("active" = true));



CREATE POLICY "Public can view active wisdom quotes" ON "public"."cyber_dojo_wisdom_quotes" FOR SELECT USING (("active" = true));



CREATE POLICY "Public can view published generated katas" ON "public"."cyber_dojo_generated_katas" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Service insert tpot audit" ON "public"."tpot_query_audit" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert campaign audit" ON "public"."central_admin_campaign_audit" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert security audit events" ON "public"."security_audit_events" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can create own sensei consultations" ON "public"."sensei_consultations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own alert deliveries" ON "public"."alert_deliveries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own email analysis" ON "public"."email_analysis" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own evaluations" ON "public"."evaluations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own kata completions" ON "public"."kata_completions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can log their own entries" ON "public"."app_entry_log" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can log their own impressions" ON "public"."campaign_impressions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own sensei feedback" ON "public"."sensei_consultations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"())) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Users can view active alerts" ON "public"."alerts" FOR SELECT USING (("active" = true));



CREATE POLICY "Users can view active domains" ON "public"."domains_whitelist" FOR SELECT USING (("active" = true));



CREATE POLICY "Users can view active katas" ON "public"."katas" FOR SELECT USING (("active" = true));



CREATE POLICY "Users can view active questions" ON "public"."questions" FOR SELECT USING (("active" = true));



CREATE POLICY "Users can view campaigns targeted to their sector" ON "public"."central_admin_campaigns" FOR SELECT USING ((("status" = 'activa'::"text") AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("ends_at" IS NULL) OR ("ends_at" >= "now"())) AND (("target_all" = true) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."sector" IS NULL) OR ("u"."sector" = ANY ("central_admin_campaigns"."target_sectors")))))))));



CREATE POLICY "Users can view own alert deliveries" ON "public"."alert_deliveries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own email analysis" ON "public"."email_analysis" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own evaluations" ON "public"."evaluations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own kata completions" ON "public"."kata_completions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own sensei consultations" ON "public"."sensei_consultations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Users can view their own entries" ON "public"."app_entry_log" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "Users can view their own impressions" ON "public"."campaign_impressions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "Users see their own attempts" ON "public"."championship_match_attempts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their own matches" ON "public"."championship_matches" FOR SELECT TO "authenticated" USING ((("player1_id" = "auth"."uid"()) OR ("player2_id" = "auth"."uid"())));



CREATE POLICY "Users see their own registration" ON "public"."championship_registrations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_roles_self_read" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."agent_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_provider_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_entry_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_sectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_impressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."central_admin_campaign_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."central_admin_campaign_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."central_admin_campaign_tier_weights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."central_admin_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."championship_match_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."championship_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."championship_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."championships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consent_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consent_documents_published_public" ON "public"."consent_documents" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."consent_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consent_records_self_read" ON "public"."consent_records" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."cyber_dojo_generated_katas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cyber_dojo_wisdom_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cyber_dojos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cyber_news_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_subject_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."domains_whitelist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_investigations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kata_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."katas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_dojos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."minigame_served" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."privacy_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recommendations_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_alert_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_config_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_diagnoses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_diagnosis_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_easm_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_kata_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_rate_limit_hits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sensei_consultations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tpot_ai_analysis_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tpot_integration_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tpot_iocs_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tpot_query_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;










GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."_championship_question_payload"("p_match_id" "uuid", "p_index" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_championship_question_payload"("p_match_id" "uuid", "p_index" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_championship_time_limit"("p_championship_id" "uuid", "p_sublevel" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_championship_time_limit"("p_championship_id" "uuid", "p_sublevel" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sync_question_to_learning_item"("p_question_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sync_question_to_learning_item"("p_question_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_audit_log_canonical"("rec" "public"."admin_audit_log") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_audit_log_canonical"("rec" "public"."admin_audit_log") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_audit_log_canonical"("rec" "public"."admin_audit_log") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_audit_log_chain_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_audit_log_chain_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_audit_log_chain_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_dojo_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_dojo_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_sensei_topics"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_sensei_topics"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_user_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_user_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."belt_es"("p_belt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."belt_es"("p_belt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."belt_es"("p_belt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."block_admin_audit_log_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_admin_audit_log_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_admin_audit_log_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_consent_records_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_consent_records_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_consent_records_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_privacy_settings_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_privacy_settings_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_privacy_settings_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."championship_answer_question"("p_match_id" "uuid", "p_answer_index" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."championship_answer_question"("p_match_id" "uuid", "p_answer_index" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."championship_answer_question"("p_match_id" "uuid", "p_answer_index" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."championship_start_match"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."championship_start_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."championship_start_match"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_hits" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_hits" integer) TO "service_role";



GRANT ALL ON TABLE "public"."consent_records" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("document_id") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("document_version") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("purpose_code") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("decision") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("channel") ON TABLE "public"."consent_records" TO "authenticated";



GRANT SELECT("server_ts") ON TABLE "public"."consent_records" TO "authenticated";



GRANT ALL ON FUNCTION "public"."consent_record_canonical"("rec" "public"."consent_records") TO "anon";
GRANT ALL ON FUNCTION "public"."consent_record_canonical"("rec" "public"."consent_records") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consent_record_canonical"("rec" "public"."consent_records") TO "service_role";



GRANT ALL ON FUNCTION "public"."consent_records_chain_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."consent_records_chain_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."consent_records_chain_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_news_agent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_news_agent"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_security_alert_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_security_alert_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_security_diagnosis"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_security_diagnosis"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_security_easm_scan"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_security_easm_scan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_consent_document_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_consent_document_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_consent_document_immutability"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_decrypted_secret"("secret_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_decrypted_secret"("secret_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_championship_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_championship_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_championship_status"() TO "service_role";



GRANT ALL ON TABLE "public"."central_admin_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."central_admin_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."central_admin_campaigns" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_campaign_for_user"("p_moment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_campaign_for_user"("p_moment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_campaign_for_user"("p_moment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_privacy_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_privacy_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_privacy_role"("required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_answer"("p_dojo" "text", "p_question" "text", "p_answer" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_answer"("p_dojo" "text", "p_question" "text", "p_answer" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_answer"("p_dojo" "text", "p_question" "text", "p_answer" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_exam_answer"("p_attempt" "uuid", "p_case" "text", "p_answer" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_exam_answer"("p_attempt" "uuid", "p_case" "text", "p_answer" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_exam_answer"("p_attempt" "uuid", "p_case" "text", "p_answer" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_exam_view"("p_attempt" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_exam_view"("p_attempt" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_exam_view"("p_attempt" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_next"("p_dojo" "text", "p_question" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_next"("p_dojo" "text", "p_question" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_next"("p_dojo" "text", "p_question" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_start_exam"("p_code" "text", "p_retry" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_start_exam"("p_code" "text", "p_retry" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_start_exam"("p_code" "text", "p_retry" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."learning_state"("p_dojo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learning_state"("p_dojo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_state"("p_dojo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_storage_buckets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_storage_buckets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."minigame_check_answer"("p_question_id" "text", "p_answer" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."minigame_check_answer"("p_question_id" "text", "p_answer" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."minigame_check_answer"("p_question_id" "text", "p_answer" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."minigame_random_question"("p_exclude" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."minigame_random_question"("p_exclude" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."minigame_random_question"("p_exclude" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."next_case_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_case_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_case_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_user_security_field_tampering"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_user_security_field_tampering"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_user_security_field_tampering"() TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_generated_kata"("generated_kata_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_generated_kata"("generated_kata_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_generated_kata"("generated_kata_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_for_championship"("p_championship_id" "uuid", "p_birthdate" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_for_championship"("p_championship_id" "uuid", "p_birthdate" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_for_championship"("p_championship_id" "uuid", "p_birthdate" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."business_sectors" TO "anon";
GRANT ALL ON TABLE "public"."business_sectors" TO "authenticated";
GRANT ALL ON TABLE "public"."business_sectors" TO "service_role";



GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer, "sector_industry" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer, "sector_industry" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_business_sector"("original_code" "text", "sector_code" "text", "sector_label" "text", "sector_active" boolean, "sector_display_order" integer, "sector_industry" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_provider_secret"("p_secret_id" "uuid", "p_new_secret" "text", "p_secret_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_provider_secret"("p_secret_id" "uuid", "p_new_secret" "text", "p_secret_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_campaign_active_from_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_campaign_active_from_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_campaign_active_from_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_question_to_learning_item"("p_question_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_question_to_learning_item"("p_question_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_question_to_learning_item"("p_question_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_sync_approved_news_question"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_sync_approved_news_question"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_sync_approved_news_question"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_audit_chain"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_audit_chain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_audit_chain"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_consent_chain"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_consent_chain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_consent_chain"() TO "service_role";
























GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";



GRANT ALL ON TABLE "public"."agent_configs" TO "anon";
GRANT ALL ON TABLE "public"."agent_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_configs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_provider_assignments" TO "anon";
GRANT ALL ON TABLE "public"."agent_provider_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_provider_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."sensei_consultations" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sensei_consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."sensei_consultations" TO "service_role";



GRANT UPDATE("feedback_helpful") ON TABLE "public"."sensei_consultations" TO "authenticated";



GRANT UPDATE("feedback_text") ON TABLE "public"."sensei_consultations" TO "authenticated";



GRANT UPDATE("sentiment_label") ON TABLE "public"."sensei_consultations" TO "authenticated";



GRANT UPDATE("sentiment_score") ON TABLE "public"."sensei_consultations" TO "authenticated";



GRANT ALL ON TABLE "public"."ai_audit_corrections_report" TO "anon";
GRANT ALL ON TABLE "public"."ai_audit_corrections_report" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_audit_corrections_report" TO "service_role";



GRANT ALL ON TABLE "public"."ai_configs" TO "anon";
GRANT ALL ON TABLE "public"."ai_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_configs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_providers" TO "anon";
GRANT ALL ON TABLE "public"."ai_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_providers" TO "service_role";



GRANT ALL ON TABLE "public"."alert_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."alert_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."app_entry_log" TO "anon";
GRANT ALL ON TABLE "public"."app_entry_log" TO "authenticated";
GRANT ALL ON TABLE "public"."app_entry_log" TO "service_role";



GRANT ALL ON TABLE "public"."app_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_impressions" TO "anon";
GRANT ALL ON TABLE "public"."campaign_impressions" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_impressions" TO "service_role";



GRANT ALL ON TABLE "public"."central_admin_campaign_audit" TO "anon";
GRANT ALL ON TABLE "public"."central_admin_campaign_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."central_admin_campaign_audit" TO "service_role";



GRANT ALL ON TABLE "public"."central_admin_campaign_settings" TO "anon";
GRANT ALL ON TABLE "public"."central_admin_campaign_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."central_admin_campaign_settings" TO "service_role";



GRANT ALL ON TABLE "public"."central_admin_campaign_tier_weights" TO "anon";
GRANT ALL ON TABLE "public"."central_admin_campaign_tier_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."central_admin_campaign_tier_weights" TO "service_role";



GRANT ALL ON TABLE "public"."cyber_dojos" TO "anon";
GRANT ALL ON TABLE "public"."cyber_dojos" TO "authenticated";
GRANT ALL ON TABLE "public"."cyber_dojos" TO "service_role";



GRANT ALL ON TABLE "public"."central_admin_question_bank" TO "anon";
GRANT ALL ON TABLE "public"."central_admin_question_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."central_admin_question_bank" TO "service_role";



GRANT ALL ON TABLE "public"."championship_match_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."championship_matches" TO "service_role";



GRANT ALL ON TABLE "public"."championship_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."championships" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consent_documents" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consent_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."consent_records_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."consent_records_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."consent_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cyber_dojo_generated_katas" TO "anon";
GRANT ALL ON TABLE "public"."cyber_dojo_generated_katas" TO "authenticated";
GRANT ALL ON TABLE "public"."cyber_dojo_generated_katas" TO "service_role";



GRANT ALL ON TABLE "public"."cyber_dojo_wisdom_quotes" TO "anon";
GRANT ALL ON TABLE "public"."cyber_dojo_wisdom_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."cyber_dojo_wisdom_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."cyber_news_sources" TO "anon";
GRANT ALL ON TABLE "public"."cyber_news_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."cyber_news_sources" TO "service_role";



GRANT ALL ON SEQUENCE "public"."data_subject_request_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."data_subject_request_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."data_subject_request_seq" TO "service_role";



GRANT ALL ON TABLE "public"."data_subject_requests" TO "service_role";



GRANT ALL ON TABLE "public"."domains_whitelist" TO "anon";
GRANT ALL ON TABLE "public"."domains_whitelist" TO "authenticated";
GRANT ALL ON TABLE "public"."domains_whitelist" TO "service_role";



GRANT ALL ON TABLE "public"."email_analysis" TO "anon";
GRANT ALL ON TABLE "public"."email_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."email_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."evaluations" TO "anon";
GRANT ALL ON TABLE "public"."evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."incident_investigations" TO "anon";
GRANT ALL ON TABLE "public"."incident_investigations" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_investigations" TO "service_role";



GRANT ALL ON TABLE "public"."kata_completions" TO "anon";
GRANT ALL ON TABLE "public"."kata_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."kata_completions" TO "service_role";



GRANT ALL ON TABLE "public"."katas" TO "anon";
GRANT ALL ON TABLE "public"."katas" TO "authenticated";
GRANT ALL ON TABLE "public"."katas" TO "service_role";



GRANT ALL ON TABLE "public"."learning_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."learning_dojos" TO "service_role";



GRANT ALL ON TABLE "public"."learning_items" TO "service_role";



GRANT ALL ON TABLE "public"."learning_progress" TO "service_role";



GRANT ALL ON TABLE "public"."minigame_served" TO "service_role";



GRANT ALL ON TABLE "public"."my_consent_state" TO "anon";
GRANT ALL ON TABLE "public"."my_consent_state" TO "authenticated";
GRANT ALL ON TABLE "public"."my_consent_state" TO "service_role";



GRANT ALL ON TABLE "public"."privacy_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."privacy_settings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."privacy_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."privacy_settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recommendations_cache" TO "anon";
GRANT ALL ON TABLE "public"."recommendations_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."recommendations_cache" TO "service_role";



GRANT ALL ON TABLE "public"."security_alert_config" TO "service_role";



GRANT ALL ON TABLE "public"."security_audit_events" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."security_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."security_config_audit" TO "service_role";



GRANT ALL ON TABLE "public"."security_diagnoses" TO "service_role";



GRANT ALL ON TABLE "public"."security_diagnosis_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."security_easm_findings" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."security_kata_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."security_rate_limit_hits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."security_rate_limit_hits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."security_rate_limit_hits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."security_rate_limit_hits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sensei_consultation_stats" TO "anon";
GRANT ALL ON TABLE "public"."sensei_consultation_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."sensei_consultation_stats" TO "service_role";



GRANT ALL ON TABLE "public"."sponsors" TO "anon";
GRANT ALL ON TABLE "public"."sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."tpot_ai_analysis_jobs" TO "anon";
GRANT ALL ON TABLE "public"."tpot_ai_analysis_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."tpot_ai_analysis_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."tpot_integration_settings" TO "anon";
GRANT ALL ON TABLE "public"."tpot_integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tpot_integration_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tpot_iocs_cache" TO "anon";
GRANT ALL ON TABLE "public"."tpot_iocs_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."tpot_iocs_cache" TO "service_role";



GRANT ALL ON TABLE "public"."tpot_query_audit" TO "anon";
GRANT ALL ON TABLE "public"."tpot_query_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."tpot_query_audit" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."user_statistics_private" TO "anon";
GRANT ALL ON TABLE "public"."user_statistics_private" TO "authenticated";
GRANT ALL ON TABLE "public"."user_statistics_private" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































