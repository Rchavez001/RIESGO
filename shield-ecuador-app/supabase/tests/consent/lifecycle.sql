-- Ciclo de vida de la evidencia de consentimiento (migraciones 073 + 074), autoverificable:
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

CREATE FUNCTION pg_temp.expect_chains_ok(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken record;
BEGIN
  SELECT * INTO broken FROM public.verify_consent_chain();
  IF FOUND THEN RAISE EXCEPTION 'verify_consent_chain rota (%): fila % — %', label, broken.first_broken_id, broken.detail; END IF;
  SELECT * INTO broken FROM public.verify_audit_chain();
  IF FOUND THEN RAISE EXCEPTION 'verify_audit_chain rota (%): fila % — %', label, broken.first_broken_id, broken.detail; END IF;
END $$;

CREATE FUNCTION pg_temp.expect_int(actual bigint, expected bigint, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

INSERT INTO public.users (email) VALUES ('ana@test.local');
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by)
  SELECT '1.0', 't', 'md', 'sha', '[]'::jsonb, 'draft', id FROM public.users WHERE role = 'admin';
INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256, settings_version,
    purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
  SELECT u.id, 'ref-ana', d.id, '1.0', 'r', 1, p, 'granted', 'registro',
         '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, 'iphmac', '{"v":1,"ct":"ua","aad":true}'::jsonb, 'uahmac', 1
  FROM public.users u, public.consent_documents d, (VALUES ('registro_aprendizaje'), ('novedades'), ('publicidad')) v(p)
  WHERE u.email = 'ana@test.local';

SELECT pg_temp.expect_chains_ok('tras insertar');

-- 1. Sin desvincular, no se puede borrar a quien tiene evidencia (la FK ya no hace cascada).
SELECT pg_temp.expect_error($$DELETE FROM public.users WHERE email = 'ana@test.local'$$, 'consent_records_user_id_fkey');

-- 2. Append-only: sin la bandera nada se toca.
SELECT pg_temp.expect_error($$UPDATE public.consent_records SET user_id = NULL WHERE id = 2$$, 'append-only');
SELECT pg_temp.expect_error($$UPDATE public.consent_records SET decision = 'revoked' WHERE id = 2$$, 'append-only');

-- 3. Retención (REQ-19): con la bandera, ip/ua a NULL, y la cadena SIGUE íntegra.
SET app.allow_evidence_mutation = 'on';
UPDATE public.consent_records SET ip_ciphertext = NULL, ua_ciphertext = NULL WHERE id = 1;
-- 4. ...pero la bandera no da carta blanca: nada más cambia, y user_id solo puede ir a NULL.
SELECT pg_temp.expect_error($$UPDATE public.consent_records SET decision = 'revoked' WHERE id = 2$$, 'solo se puede poner en NULL');
SELECT pg_temp.expect_error($$UPDATE public.consent_records SET user_id = gen_random_uuid() WHERE id = 2$$, 'solo se puede poner en NULL');
SELECT pg_temp.expect_error($$UPDATE public.consent_records SET ip_ciphertext = '{"v":1,"ct":"otro"}'::jsonb WHERE id = 2$$, 'solo se puede poner en NULL');
RESET app.allow_evidence_mutation;
SELECT pg_temp.expect_chains_ok('tras la retención');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.consent_records WHERE id = 1 AND ip_ciphertext IS NULL AND ip_hmac = 'iphmac'), 1, 'la retención conserva ip_hmac');

-- 5. La función de baja (REQ-20): exige motivo y solo la ejecuta service_role.
SELECT pg_temp.expect_error(
  $$SELECT public.unlink_user_consent_evidence((SELECT id FROM public.users WHERE email='ana@test.local'), (SELECT id FROM public.users WHERE role='admin'), 'h', 'privacy_admin', '  ')$$,
  'motivo es obligatorio');
SELECT pg_temp.expect_int(has_function_privilege('authenticated', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE')::int, 0, 'authenticated no ejecuta la baja');
SELECT pg_temp.expect_int(has_function_privilege('anon', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE')::int, 0, 'anon no ejecuta la baja');
SELECT pg_temp.expect_int(has_function_privilege('service_role', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE')::int, 1, 'service_role sí ejecuta la baja');

SELECT pg_temp.expect_int(
  public.unlink_user_consent_evidence((SELECT id FROM public.users WHERE email='ana@test.local'), (SELECT id FROM public.users WHERE role='admin'),
                                      'adm-hmac', 'privacy_admin', 'Baja atendida caso CD-2026-000001'), 3, 'filas desvinculadas');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.consent_records WHERE user_id IS NULL AND user_ref_hmac = 'ref-ana'), 3, 'evidencia seudonimizada');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.admin_audit_log WHERE action = 'consent.unlink_user' AND entity_id = 'ref-ana' AND reason LIKE 'Baja atendida%'), 1, 'bitácora de la baja');
SELECT pg_temp.expect_chains_ok('tras la baja');

-- 6. Ahora sí se puede borrar al usuario, y la evidencia queda intacta.
DELETE FROM public.users WHERE email = 'ana@test.local';
SELECT pg_temp.expect_int((SELECT count(*) FROM public.users WHERE email = 'ana@test.local'), 0, 'usuario borrado');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.consent_records), 3, 'la evidencia sobrevive al usuario');
SELECT pg_temp.expect_chains_ok('tras borrar al usuario');

-- 7. La bitácora sigue siendo append-only, sin bandera que valga.
SELECT pg_temp.expect_error($$UPDATE public.admin_audit_log SET reason = 'x'$$, 'append-only');
SET app.allow_evidence_mutation = 'on';
SELECT pg_temp.expect_error($$UPDATE public.admin_audit_log SET reason = 'x'$$, 'append-only');
RESET app.allow_evidence_mutation;

-- 8. El usuario nunca ve IP/UA ni sus HMAC, ni siquiera de su propia evidencia.
SELECT pg_temp.expect_int(has_column_privilege('authenticated', 'public.consent_records', 'ip_ciphertext', 'SELECT')::int, 0, 'authenticated no lee ip_ciphertext');
SELECT pg_temp.expect_int(has_column_privilege('authenticated', 'public.consent_records', 'ip_hmac', 'SELECT')::int, 0, 'authenticated no lee ip_hmac');
SELECT pg_temp.expect_int(has_column_privilege('authenticated', 'public.consent_records', 'purpose_code', 'SELECT')::int, 1, 'authenticated sí lee la finalidad');

\echo OK: ciclo de vida de la evidencia (073 + 074)
