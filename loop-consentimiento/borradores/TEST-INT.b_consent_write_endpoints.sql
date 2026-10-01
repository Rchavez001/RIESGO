-- TEST-INT.b: integración real para las filas que escriben `update-my-consent` y `submit-consent`
-- (ambas por `_shared/consent-write.ts::insertConsentEvidenceRow`, T11). Las 19 pruebas Deno de esas
-- dos funciones (index_test.ts) usan un cliente Supabase/Postgres FALSO: nunca ejercitan el CHECK
-- `channel IN ('registro','reconsentimiento','mi_privacidad','correo','admin')` ni el trigger de
-- cadena de hash (073) con los valores de `channel` que estas dos funciones realmente usan
-- ('mi_privacidad', 'reconsentimiento') — si un futuro cambio desalineara el literal de TypeScript
-- del de la migración, ningún test en memoria lo detectaría (misma clase de hueco que el de T14/080,
-- ver PROGRESS.md). Las reglas de NEGOCIO de esta tarea (no se puede revocar la finalidad obligatoria;
-- `submit-consent` exige `requires_reconsent`) son puramente de TypeScript, sin contraparte en el
-- esquema — no hay nada que repetir aquí para esas dos; ya están cubiertas por los fakes.
-- Corre después de lifecycle.sql (usa 'registro'/'1.0' como fixture): este archivo usa el prefijo 'cwe-'.
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

CREATE FUNCTION pg_temp.expect(actual anyelement, expected anyelement, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

CREATE FUNCTION pg_temp.expect_chains_ok(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken record;
BEGIN
  SELECT * INTO broken FROM public.verify_consent_chain();
  IF FOUND THEN RAISE EXCEPTION 'verify_consent_chain rota (%): fila % — %', label, broken.first_broken_id, broken.detail; END IF;
END $$;

-- status='draft' a propósito: solo hace falta un `document_id` real para la FK de consent_records
-- (igual que el fixture de consent_records_concurrency_check en gates.sh); usar 'published' chocaría
-- con el índice de única publicada (consent_documents_one_published) contra la que deja consent_documents_lifecycle.sql.
INSERT INTO public.users (email) VALUES ('cwe-user@example.test');
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by)
  SELECT 'cwe-1.0', 'Aviso cwe-1.0', 'contenido cwe-1.0', 'sha-cwe-1.0',
         '[{"code":"registro_aprendizaje","label":"Registro","required":true},{"code":"novedades","label":"Novedades","required":false}]'::jsonb,
         'draft', id
  FROM public.users WHERE role = 'admin';

-- 1. `update-my-consent` revoca una finalidad OPCIONAL: fila real con channel='mi_privacidad',
--    decision='revoked'. Nunca antes insertada en un Postgres real (ni en lifecycle.sql ni en ningún
--    otro .sql del módulo): si el literal "mi_privacidad" de index.ts no coincidiera con el CHECK de
--    073, esta es la primera prueba que lo detectaría.
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT u.id, 'ref-cwe', d.id, 'cwe-1.0', 'r', 1, 'novedades', 'revoked', 'mi_privacidad',
         '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'iphmac-cwe-1', '{"v":1,"ct":"ua","aad":true}'::jsonb, 'uahmac-cwe-1', 1
  FROM public.users u, public.consent_documents d
  WHERE u.email = 'cwe-user@example.test' AND d.version = 'cwe-1.0';

SELECT pg_temp.expect((SELECT count(*) FROM public.consent_records WHERE channel = 'mi_privacidad'), 1::bigint, 'fila mi_privacidad insertada');
SELECT pg_temp.expect_chains_ok('tras mi_privacidad');

-- 2. `submit-consent` en un reconsentimiento: una fila por finalidad (obligatoria otorgada + opcional
--    otorgada), channel='reconsentimiento'. Mismo motivo que el caso anterior: primera vez que ese
--    literal toca un Postgres real.
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT u.id, 'ref-cwe', d.id, 'cwe-1.0', 'r', 1, p, 'granted', 'reconsentimiento',
         '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'iphmac-cwe-2', '{"v":1,"ct":"ua","aad":true}'::jsonb, 'uahmac-cwe-2', 1
  FROM public.users u, public.consent_documents d, (VALUES ('registro_aprendizaje'), ('novedades')) v(p)
  WHERE u.email = 'cwe-user@example.test' AND d.version = 'cwe-1.0';

SELECT pg_temp.expect((SELECT count(*) FROM public.consent_records WHERE channel = 'reconsentimiento'), 2::bigint, 'filas reconsentimiento insertadas');
SELECT pg_temp.expect_chains_ok('tras reconsentimiento');

-- 3. Sanity del propio test: un `channel` que NO use ninguna de las dos funciones (typo plausible,
--    'mi-privacidad' con guion) debe seguir rechazado por el CHECK — si esto alguna vez pasara, sería
--    la migración la que cambió, no el código, y hay que investigar antes de tocar nada más.
SELECT pg_temp.expect_error($$
  INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
      purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
    SELECT u.id, 'ref-cwe', d.id, 'cwe-1.0', 'r', 1, 'novedades', 'granted', 'mi-privacidad',
           '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'iphmac-cwe-3', '{"v":1,"ct":"ua","aad":true}'::jsonb, 'uahmac-cwe-3', 1
    FROM public.users u, public.consent_documents d
    WHERE u.email = 'cwe-user@example.test' AND d.version = 'cwe-1.0'
$$, 'consent_records_channel_check');
