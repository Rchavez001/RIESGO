-- T19b Paso 2B (migración 083): channel='invitado' con user_id NULL (sin fila en public.users) y
-- caducidad de la sesión anónima. Autoverificable: cualquier aserción que no se cumple lanza una
-- excepción y psql (ON_ERROR_STOP) sale con código != 0.
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

CREATE FUNCTION pg_temp.expect_int(actual bigint, expected bigint, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

CREATE FUNCTION pg_temp.expect_chains_ok(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken record;
BEGIN
  SELECT * INTO broken FROM public.verify_consent_chain();
  IF FOUND THEN RAISE EXCEPTION 'verify_consent_chain rota (%): fila % — %', label, broken.first_broken_id, broken.detail; END IF;
END $$;

-- consent_records.document_id solo exige que la fila exista (FK), no que esté publicada: para esta
-- prueba basta cualquier consent_documents ya creado por un archivo anterior (orden fijo de
-- gates.sh) — igual que accept-guest-notice de verdad, que solo necesita id/versión del aviso
-- vigente, nunca su contenido completo. Evita además chocar con el UNIQUE de `version` o con el
-- índice parcial de "un solo publicado a la vez" que ya puedan haber dejado esos archivos.
CREATE FUNCTION pg_temp.any_document() RETURNS TABLE (id uuid, version text) LANGUAGE sql AS $$
  SELECT id, version FROM public.consent_documents ORDER BY created_at ASC LIMIT 1
$$;

-- Sesión anónima real: existe en auth.users, sin ninguna fila en public.users.
INSERT INTO auth.users (id, is_anonymous, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', true, now()),
  ('a0000000-0000-4000-8000-000000000002', true, now() - interval '25 hours'); -- vencida

-- 1. channel='invitado' con user_id NULL: lo que insertaría accept-guest-notice (storeUserId: false).
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT NULL, 'ref-invitado-1', d.id, d.version, 'r', 1, 'invitado_basico', 'granted', 'invitado',
         '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'iphmac-invitado', NULL, NULL, 1
  FROM pg_temp.any_document() d;

SELECT pg_temp.expect_chains_ok('tras insertar evidencia de invitado');
SELECT pg_temp.expect_int(
  (SELECT count(*) FROM public.consent_records WHERE channel = 'invitado' AND purpose_code = 'invitado_basico' AND user_id IS NULL),
  1, 'fila de invitado con user_id NULL');

-- 2. El CHECK de channel (083) sigue cerrado: cualquier valor fuera de la lista se rechaza.
SELECT pg_temp.expect_error($$
  INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
      purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
    SELECT NULL, 'ref-x', d.id, d.version, 'r', 1, 'invitado_basico', 'granted', 'otro_canal',
           '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'h', NULL, NULL, 1
    FROM pg_temp.any_document() d
$$, 'consent_records_channel_check');

-- 3. cleanup_expired_guest_sessions(): borra solo la sesión anónima vencida (> 24h), nunca la reciente
--    ni ninguna cuenta registrada; la evidencia de invitado YA escrita sigue intacta (user_id ya era NULL).
SELECT pg_temp.expect_int((SELECT count(*) FROM auth.users WHERE is_anonymous), 2, 'invitados antes de limpiar');
SELECT public.cleanup_expired_guest_sessions();
SELECT pg_temp.expect_int((SELECT count(*) FROM auth.users WHERE id = 'a0000000-0000-4000-8000-000000000001'), 1, 'invitado reciente sigue');
SELECT pg_temp.expect_int((SELECT count(*) FROM auth.users WHERE id = 'a0000000-0000-4000-8000-000000000002'), 0, 'invitado vencido se borró');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.consent_records WHERE channel = 'invitado'), 1, 'evidencia de invitado intacta tras limpiar');
SELECT pg_temp.expect_chains_ok('tras cleanup_expired_guest_sessions');

\echo 'guest_notice_and_session_expiry.sql: OK'
