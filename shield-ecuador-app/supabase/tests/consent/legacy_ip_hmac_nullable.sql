-- T25 (migración 084, D-11 opción 1-A): ip_hmac NULL solo para filas legacy. Autoverificable:
-- cualquier aserción que no se cumple lanza una excepción y psql (ON_ERROR_STOP) sale con código != 0.
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

CREATE FUNCTION pg_temp.any_document() RETURNS TABLE (id uuid, version text) LANGUAGE sql AS $$
  SELECT id, version FROM public.consent_documents ORDER BY created_at ASC LIMIT 1
$$;

-- Documento legacy real, retirado (nunca publicado): lo que crearía el script de backfill.
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by)
  SELECT 'legacy-2026-06-22', 't-legacy', 'md-legacy', 'sha-legacy', '[]'::jsonb, 'retired', id
  FROM public.users WHERE role = 'admin';

-- 1. Fila legacy sin ip_hmac: permitida (lo que el backfill inserta para cada persona migrada).
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT NULL, 'ref-legacy-1', d.id, d.version, 'r', 0, 'registro_aprendizaje', 'granted', 'registro',
         NULL, NULL, NULL, NULL, 1
  FROM public.consent_documents d WHERE d.version = 'legacy-2026-06-22';

SELECT pg_temp.expect_chains_ok('tras insertar fila legacy sin ip_hmac');
SELECT pg_temp.expect_int(
  (SELECT count(*) FROM public.consent_records WHERE document_version = 'legacy-2026-06-22' AND ip_hmac IS NULL),
  1, 'fila legacy sin ip_hmac');

-- 2. Fila NO legacy sin ip_hmac: sigue rechazada (el CHECK no abre la puerta a todo el módulo).
SELECT pg_temp.expect_error($$
  INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
      purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
    SELECT NULL, 'ref-x', d.id, 'registro-1.0', 'r', 1, 'registro_aprendizaje', 'granted', 'registro',
           '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, NULL, NULL, NULL, 1
    FROM pg_temp.any_document() d
$$, 'consent_records_ip_hmac_legacy_check');

-- 3. Una fila legacy CON ip_hmac también sigue siendo válida (el CHECK solo exige "o es legacy", no prohíbe tener IP si la hubiera).
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT NULL, 'ref-legacy-2', d.id, d.version, 'r', 0, 'novedades', 'denied', 'registro',
         NULL, 'iphmac-legacy', NULL, NULL, 1
  FROM public.consent_documents d WHERE d.version = 'legacy-2026-06-22';

SELECT pg_temp.expect_chains_ok('tras insertar fila legacy con y sin ip_hmac');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.consent_records WHERE document_version = 'legacy-2026-06-22'), 2, 'filas legacy totales');

\echo 'legacy_ip_hmac_nullable.sql: OK'
