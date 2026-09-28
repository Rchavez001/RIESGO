-- Versionado de privacy_settings y verificación del correo de privacidad (migración 075), autoverificable.
-- Corre después de 073+074+075 sobre prereqs.sql (que crea un admin, así que 073 sembró la versión 1).
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

-- 1. Estado inicial y columnas retiradas
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), 1, 'la vigente inicial es la v1');
SELECT pg_temp.expect((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'privacy_settings'
                       AND column_name IN ('is_current', 'privacy_email_pending', 'privacy_email_code_hash', 'privacy_email_code_expires_at'))::int, 0, 'columnas retiradas');

-- 2. Cada cambio es un INSERT; la vigente es la de mayor versión
INSERT INTO public.privacy_settings (settings_version, controller_name, privacy_email, dpo_contact, response_days, created_by)
  SELECT settings_version + 1, controller_name, 'nuevo@prueba.local', dpo_contact, response_days, created_by FROM public.privacy_settings_current;
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), 2, 'la vigente pasó a la v2');
SELECT pg_temp.expect((SELECT privacy_email FROM public.privacy_settings_current), 'nuevo@prueba.local', 'correo de la v2');
SELECT pg_temp.expect((SELECT count(*) FROM public.privacy_settings)::int, 2, 'la v1 sigue ahí (historial completo)');

-- 3. Solo la versión siguiente: sin repetir, sin saltos, sin retroceder
SELECT pg_temp.expect_error($$INSERT INTO public.privacy_settings (settings_version, privacy_email, created_by) SELECT 2, 'x@y.zz', created_by FROM public.privacy_settings_current$$, 'siguiente versión');
SELECT pg_temp.expect_error($$INSERT INTO public.privacy_settings (settings_version, privacy_email, created_by) SELECT 999, 'x@y.zz', created_by FROM public.privacy_settings_current$$, 'siguiente versión');
SELECT pg_temp.expect_error($$INSERT INTO public.privacy_settings (settings_version, privacy_email, created_by) SELECT 1, 'x@y.zz', created_by FROM public.privacy_settings_current$$, 'siguiente versión');
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), 2, 'los intentos inválidos no cambiaron la vigente');

-- 4. Siguen siendo de solo inserción
SELECT pg_temp.expect_error($$UPDATE public.privacy_settings SET privacy_email = 'hack@x.zz'$$, 'solo inserción');
SELECT pg_temp.expect_error($$DELETE FROM public.privacy_settings WHERE settings_version = 1$$, 'solo inserción');

-- 5. Permisos: nadie fuera del service role
SELECT pg_temp.expect(has_table_privilege('anon', 'public.privacy_settings_current', 'SELECT'), false, 'anon no lee la vista');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.privacy_settings_current', 'SELECT'), false, 'authenticated no lee la vista');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.privacy_settings', 'SELECT'), false, 'authenticated no lee la tabla');
SELECT pg_temp.expect(has_table_privilege('service_role', 'public.privacy_settings_current', 'SELECT'), true, 'service_role sí lee la vista');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.privacy_email_verifications', 'SELECT'), false, 'authenticated no lee verificaciones');
SELECT pg_temp.expect(has_table_privilege('anon', 'public.privacy_email_verifications', 'UPDATE'), false, 'anon no actualiza verificaciones');
SELECT pg_temp.expect((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.privacy_email_verifications'::regclass), true, 'RLS activa en verificaciones');

-- 6. Verificación del correo: solo cambian los intentos y la confirmación
INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, requested_by)
  SELECT 'otro@prueba.local', 'hash-del-codigo', now() + interval '30 minutes', id FROM public.users WHERE role = 'admin';
UPDATE public.privacy_email_verifications SET attempts = attempts + 1;
SELECT pg_temp.expect((SELECT attempts FROM public.privacy_email_verifications), 1, 'los intentos suben');
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET attempts = 0$$, 'no pueden bajar');
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET code_hash = 'otro-hash'$$, 'solo pueden cambiar attempts y confirmed_at');
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET new_email = 'atacante@x.zz'$$, 'solo pueden cambiar attempts y confirmed_at');
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET expires_at = now() + interval '10 years'$$, 'solo pueden cambiar attempts y confirmed_at');
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET attempts = 11$$, 'attempts');
SELECT pg_temp.expect_error($$INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, requested_by) SELECT 'no-es-un-correo', 'h', now() + interval '1 hour', id FROM public.users WHERE role = 'admin'$$, 'new_email');

-- 7. Un código vencido no se puede confirmar
INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, created_at, requested_by)
  SELECT 'viejo@prueba.local', 'h', now() - interval '1 hour', now() - interval '2 hours', id FROM public.users WHERE role = 'admin';
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET confirmed_at = now() WHERE new_email = 'viejo@prueba.local'$$, 'venció');
DELETE FROM public.privacy_email_verifications WHERE new_email = 'viejo@prueba.local'; -- las no confirmadas sí se limpian

-- 8. Confirmar = marcar la verificación + INSERT de una versión nueva, en UNA transacción
DO $$
BEGIN
  UPDATE public.privacy_email_verifications SET confirmed_at = now() WHERE new_email = 'otro@prueba.local';
  INSERT INTO public.privacy_settings (settings_version, controller_name, privacy_email, dpo_contact, response_days, created_by)
    SELECT s.settings_version + 1, s.controller_name, v.new_email, s.dpo_contact, s.response_days, v.requested_by
    FROM public.privacy_settings_current s, public.privacy_email_verifications v WHERE v.new_email = 'otro@prueba.local';
END $$;
SELECT pg_temp.expect((SELECT settings_version FROM public.privacy_settings_current), 3, 'la confirmación creó la v3');
SELECT pg_temp.expect((SELECT privacy_email FROM public.privacy_settings_current), 'otro@prueba.local', 'la v3 lleva el correo confirmado');
SELECT pg_temp.expect((SELECT count(*) FROM public.privacy_settings WHERE privacy_email = 'nuevo@prueba.local')::int, 1, 'la v2 no se tocó');

-- 9. Si la inserción falla, la confirmación se deshace (no queda "confirmada" sin versión)
INSERT INTO public.privacy_email_verifications (new_email, code_hash, expires_at, requested_by)
  SELECT 'cuarto@prueba.local', 'h', now() + interval '30 minutes', id FROM public.users WHERE role = 'admin';
SELECT pg_temp.expect_error($q$DO $x$ BEGIN
  UPDATE public.privacy_email_verifications SET confirmed_at = now() WHERE new_email = 'cuarto@prueba.local';
  INSERT INTO public.privacy_settings (settings_version, privacy_email, created_by) SELECT 99, 'cuarto@prueba.local', created_by FROM public.privacy_settings_current;
END $x$ $q$, 'siguiente versión');
SELECT pg_temp.expect((SELECT confirmed_at IS NULL FROM public.privacy_email_verifications WHERE new_email = 'cuarto@prueba.local'), true, 'la confirmación se deshizo con la transacción');

-- 10. Una verificación confirmada queda como constancia
SELECT pg_temp.expect_error($$UPDATE public.privacy_email_verifications SET attempts = attempts + 1 WHERE new_email = 'otro@prueba.local'$$, 'ya no se modifica');
SELECT pg_temp.expect_error($$DELETE FROM public.privacy_email_verifications WHERE new_email = 'otro@prueba.local'$$, 'no se borra');

\echo OK: versionado de privacy_settings y verificación de correo (075)
