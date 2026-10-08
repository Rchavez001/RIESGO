-- T15.a (082): confirm_privacy_email_change() — confirmar + insertar la siguiente versión de
-- privacy_settings, en UNA transacción real. Autoverificable. Corre después de settings_versioning.sql
-- (CONSENT_TESTS_ORDERED), así que privacy_settings_current ya avanzó por esa prueba; aquí no se asume
-- un número de versión fijo, se captura la vigente ANTES de empezar y se compara en relativo.
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
  RAISE EXCEPTION 'se esperaba un error con "%" al ejecutar [%]', stmt, fragment;
END $$;

CREATE FUNCTION pg_temp.expect(actual anyelement, expected anyelement, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

INSERT INTO public.users (id, email) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'privacy-admin-t15a@example.test'),
  ('c2222222-2222-4222-8222-222222222222', 'editor-t15a@example.test');
INSERT INTO public.admin_roles (user_id, role) VALUES ('c1111111-1111-4111-8111-111111111111', 'privacy_admin');

CREATE TEMP TABLE t15a_before AS SELECT settings_version FROM public.privacy_settings_current;

-- Fixture: una verificación por caso, cada una con su propio new_email (evita pisarse entre aserciones).
-- La vencida necesita created_at TAMBIÉN en el pasado: el CHECK (expires_at > created_at) rechazaría
-- expires_at en el pasado con el created_at por defecto (now()), igual que el test 7 de settings_versioning.sql.
INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, requested_by) VALUES
  ('t15a-feliz@example.test',    'hash-feliz',    now() + interval '30 minutes', 'c1111111-1111-4111-8111-111111111111'),
  ('t15a-sinrol@example.test',   'hash-sinrol',   now() + interval '30 minutes', 'c1111111-1111-4111-8111-111111111111'),
  ('t15a-sinaal2@example.test',  'hash-sinaal2',  now() + interval '30 minutes', 'c1111111-1111-4111-8111-111111111111'),
  ('t15a-hashmalo@example.test', 'hash-correcto', now() + interval '30 minutes', 'c1111111-1111-4111-8111-111111111111');
INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, created_at, requested_by) VALUES
  ('t15a-vencida@example.test', 'hash-vencida', now() - interval '1 hour', now() - interval '2 hours', 'c1111111-1111-4111-8111-111111111111');

-- 1. Sin rol privacy_admin → forbidden (defensa en profundidad, igual que publish_consent_document).
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-sinrol@example.test'),
      'hash-sinrol', 'c2222222-2222-4222-8222-222222222222', 'privacy_editor', 'aal2', 'hmac-sinrol')$$,
  'forbidden');

-- 2. Con rol pero sin aal2 (TOTP no verificado) → mfa_required.
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-sinaal2@example.test'),
      'hash-sinaal2', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal1', 'hmac-admin')$$,
  'mfa_required');

-- 3. Verificación inexistente → not_found.
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change('00000000-0000-4000-8000-000000000000',
      'cualquier-hash', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin')$$,
  'not_found');

-- 4. Código vencido → code_expired (nada mutado).
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-vencida@example.test'),
      'hash-vencida', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin')$$,
  'code_expired');
SELECT pg_temp.expect((SELECT confirmed_at IS NULL FROM public.privacy_email_verifications WHERE new_email = 't15a-vencida@example.test'), true, 'la vencida sigue sin confirmar');

-- 5. Hash que no coincide (defensa en profundidad: no debería llegar aquí si la Edge Function ya
--    validó, pero si llegara, no confirma nada ni toca privacy_settings).
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-hashmalo@example.test'),
      'hash-que-no-coincide', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin')$$,
  'invalid_code');
SELECT pg_temp.expect((SELECT confirmed_at IS NULL FROM public.privacy_email_verifications WHERE new_email = 't15a-hashmalo@example.test'), true, 'el hash incorrecto no confirmó nada');
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), (SELECT settings_version FROM t15a_before), 'tras los intentos fallidos, la vigente no cambió');

-- 6. Camino feliz: hash correcto, rol y aal2 correctos → confirma + inserta la versión siguiente, en UNA
--    transacción (confirmed_at y la nueva versión aparecen juntos; antes de esta llamada ninguno existía).
SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-feliz@example.test'),
  'hash-feliz', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin-feliz');
SELECT pg_temp.expect((SELECT confirmed_at IS NOT NULL FROM public.privacy_email_verifications WHERE new_email = 't15a-feliz@example.test'), true, 'la verificación feliz quedó confirmada');
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), (SELECT settings_version + 1 FROM t15a_before), 'la vigente avanzó exactamente una versión');
SELECT pg_temp.expect((SELECT privacy_email FROM public.privacy_settings_current), 't15a-feliz@example.test', 'la vigente lleva el correo nuevo');

-- 7. Ya confirmada → already_confirmed; no se puede volver a usar el mismo código ni crea otra versión.
SELECT pg_temp.expect_error(
  $$SELECT public.confirm_privacy_email_change((SELECT id FROM public.privacy_email_verifications WHERE new_email = 't15a-feliz@example.test'),
      'hash-feliz', 'c1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin-feliz')$$,
  'already_confirmed');
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), (SELECT settings_version + 1 FROM t15a_before), 'reintentar la misma confirmación no crea una versión más');

-- 8. Bitácora: actor correcto, before = configuración anterior, after = la nueva con el correo nuevo.
SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'privacy_settings.email_confirmed' AND actor_email_hmac = 'hmac-admin-feliz')::int, 1, 'una fila de bitácora por esta confirmación');
SELECT pg_temp.expect((SELECT actor_id FROM public.admin_audit_log WHERE actor_email_hmac = 'hmac-admin-feliz'), 'c1111111-1111-4111-8111-111111111111'::uuid, 'actor correcto en la bitácora');
SELECT pg_temp.expect((SELECT after ->> 'privacy_email' FROM public.admin_audit_log WHERE actor_email_hmac = 'hmac-admin-feliz'), 't15a-feliz@example.test', 'after lleva el correo nuevo');
SELECT pg_temp.expect((SELECT (before ->> 'privacy_email') IS DISTINCT FROM 't15a-feliz@example.test' FROM public.admin_audit_log WHERE actor_email_hmac = 'hmac-admin-feliz'), true, 'before lleva el correo anterior, no el nuevo');

-- 9. Permisos: solo service_role ejecuta la función.
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.confirm_privacy_email_change(uuid,text,uuid,text,text,text)', 'EXECUTE')::int::boolean, false, 'authenticated no ejecuta confirm_privacy_email_change');
SELECT pg_temp.expect(has_function_privilege('anon', 'public.confirm_privacy_email_change(uuid,text,uuid,text,text,text)', 'EXECUTE')::int::boolean, false, 'anon no ejecuta confirm_privacy_email_change');
SELECT pg_temp.expect(has_function_privilege('service_role', 'public.confirm_privacy_email_change(uuid,text,uuid,text,text,text)', 'EXECUTE')::int::boolean, true, 'service_role sí ejecuta confirm_privacy_email_change');

-- 10. La cadena de la bitácora sigue íntegra tras todo esto.
SELECT pg_temp.expect(EXISTS(SELECT 1 FROM public.verify_audit_chain()), false, 'verify_audit_chain sigue íntegra');

\echo OK: confirm_privacy_email_change atómica, con autorización dentro de la función (082)
