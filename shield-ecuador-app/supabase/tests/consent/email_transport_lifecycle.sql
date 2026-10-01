-- T12.b: transporte de correo configurable y cola de avisos pendientes (migración 079), autoverificable.
-- Corre después de 073 + pendientes (incluida 079) sobre prereqs.sql (que crea un admin, así que 079
-- sembró la versión 1 de email_transport_settings, en modo 'resend'). Cualquier aserción que no se
-- cumple lanza una excepción y psql (ON_ERROR_STOP) sale con código != 0.
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

-- ── email_transport_settings ────────────────────────────────────────────────────────────────────────────────────────
-- 1. Estado inicial: el placeholder de 079, en modo resend.
SELECT pg_temp.expect((SELECT transport_version FROM public.email_transport_settings_current), 1, 'la vigente inicial es la v1');
SELECT pg_temp.expect((SELECT mode FROM public.email_transport_settings_current), 'resend', 'modo inicial resend');

-- 2. 'smtp' exige host/puerto/usuario/password; 'resend' los exige todos NULL (CHECK de coherencia de la tabla).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, created_by)
    SELECT 2, 'smtp', 'x', 'x@y.zz', created_by FROM public.email_transport_settings_current$$,
  'email_transport_settings_check');
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, smtp_host, created_by)
    SELECT 2, 'resend', 'x', 'x@y.zz', 'smtp.example.test', created_by FROM public.email_transport_settings_current$$,
  'email_transport_settings_check');

-- 3. Puerto SMTP fuera de 465/2525 (mismo tope que el anti-SSRF de T12.c) se rechaza.
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, smtp_host, smtp_port, smtp_username, smtp_password_ciphertext, created_by)
    SELECT 2, 'smtp', 'x', 'x@y.zz', 'smtp.example.test', 587, 'u', '{"v":1,"ct":"pw"}'::jsonb, created_by FROM public.email_transport_settings_current$$,
  'email_transport_settings_smtp_port_check');

-- 4. Cambio válido a smtp: nueva fila, la vigente pasa a la v2.
INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, smtp_host, smtp_port, smtp_username, smtp_password_ciphertext, created_by)
  SELECT 2, 'smtp', 'CiberDojo', 'avisos@ciberdojo.test', 'smtp.example.test', 465, 'avisos@ciberdojo.test', '{"v":1,"iv":"x","tag":"y","ct":"z","aad":true}'::jsonb, created_by
  FROM public.email_transport_settings_current;
SELECT pg_temp.expect((SELECT transport_version FROM public.email_transport_settings_current), 2, 'la vigente pasó a la v2');
SELECT pg_temp.expect((SELECT mode FROM public.email_transport_settings_current), 'smtp', 'modo de la v2 es smtp');
SELECT pg_temp.expect((SELECT count(*) FROM public.email_transport_settings)::int, 2, 'la v1 sigue ahí (historial completo)');

-- 5. Solo la versión siguiente: sin repetir, sin saltos.
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, created_by)
    SELECT 2, 'resend', 'x', 'x@y.zz', created_by FROM public.email_transport_settings_current$$,
  'siguiente versión');
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, created_by)
    SELECT 99, 'resend', 'x', 'x@y.zz', created_by FROM public.email_transport_settings_current$$,
  'siguiente versión');

-- 6. Solo inserción: ni UPDATE ni DELETE, ni de la vigente ni del historial.
SELECT pg_temp.expect_error($$UPDATE public.email_transport_settings SET mode = 'resend' WHERE transport_version = 2$$, 'solo inserción');
SELECT pg_temp.expect_error($$DELETE FROM public.email_transport_settings WHERE transport_version = 1$$, 'solo inserción');

-- 7. Permisos: nadie fuera del service role.
SELECT pg_temp.expect(has_table_privilege('anon', 'public.email_transport_settings_current', 'SELECT'), false, 'anon no lee la vista');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.email_transport_settings_current', 'SELECT'), false, 'authenticated no lee la vista');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.email_transport_settings', 'SELECT'), false, 'authenticated no lee la tabla');
SELECT pg_temp.expect(has_table_privilege('service_role', 'public.email_transport_settings_current', 'SELECT'), true, 'service_role sí lee la vista');

-- ── email_transport_tests ───────────────────────────────────────────────────────────────────────────────────────────
-- 8. Un resultado sin éxito exige error_code (CHECK: success OR error_code IS NOT NULL).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_tests (transport_version, success, tested_by) SELECT 2, false, (SELECT id FROM public.users WHERE role = 'admin')$$,
  'email_transport_tests_check');

-- 9. Camino feliz: éxito sin error_code, y fallo con un código estable. Ninguno guarda destinatario ni cuerpo
--    (la tabla ni siquiera tiene columnas para eso: no hay nada que filtrar).
INSERT INTO public.email_transport_tests (transport_version, success, tested_by) SELECT 2, true, (SELECT id FROM public.users WHERE role = 'admin');
INSERT INTO public.email_transport_tests (transport_version, success, error_code, tested_by) SELECT 2, false, 'smtp_network_error', (SELECT id FROM public.users WHERE role = 'admin');
SELECT pg_temp.expect((SELECT count(*) FROM public.email_transport_tests WHERE transport_version = 2)::int, 2, '2 resultados de prueba para la v2');

-- 10. Referencia a una versión inexistente de email_transport_settings falla (FK).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.email_transport_tests (transport_version, success, tested_by) SELECT 999, true, (SELECT id FROM public.users WHERE role = 'admin')$$,
  'email_transport_tests_transport_version_fkey');

-- 11. Append-only: ni UPDATE ni DELETE.
SELECT pg_temp.expect_error($$UPDATE public.email_transport_tests SET success = true WHERE transport_version = 2 AND NOT success$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM public.email_transport_tests WHERE transport_version = 2$$, 'append-only');

-- 12. Permisos: nadie fuera del service role.
SELECT pg_temp.expect(has_table_privilege('anon', 'public.email_transport_tests', 'SELECT'), false, 'anon no lee las pruebas');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.email_transport_tests', 'SELECT'), false, 'authenticated no lee las pruebas');

-- ── email_outbox ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 13. Fixture: un aviso pendiente, sin correo ni datos del titular — solo la referencia a su origen.
INSERT INTO public.email_outbox (reference_table, reference_id) VALUES ('data_subject_requests', 'CD-TEST-000001');
SELECT pg_temp.expect((SELECT status FROM public.email_outbox WHERE reference_id = 'CD-TEST-000001'), 'pending', 'nace pendiente');
SELECT pg_temp.expect((SELECT sent_at FROM public.email_outbox WHERE reference_id = 'CD-TEST-000001'), NULL, 'sin fecha de envío todavía');

-- 14. Sin la función, nadie toca la fila: ni UPDATE directo ni DELETE.
SELECT pg_temp.expect_error($$UPDATE public.email_outbox SET status = 'sent' WHERE reference_id = 'CD-TEST-000001'$$, 'solo mark_email_outbox_sent');
SELECT pg_temp.expect_error($$DELETE FROM public.email_outbox WHERE reference_id = 'CD-TEST-000001'$$, 'no se puede borrar');

-- 15. mark_email_outbox_sent(): marca enviado y pone sent_at.
SELECT pg_temp.expect(
  (public.mark_email_outbox_sent((SELECT id FROM public.email_outbox WHERE reference_id = 'CD-TEST-000001'))).status,
  'sent', 'el estado cambió a sent');
SELECT pg_temp.expect((SELECT sent_at IS NOT NULL FROM public.email_outbox WHERE reference_id = 'CD-TEST-000001'), true, 'sent_at quedó puesto');

-- 16. Un aviso inexistente da un error claro.
SELECT pg_temp.expect_error($$SELECT public.mark_email_outbox_sent('00000000-0000-4000-8000-000000000000')$$, 'no existe');

-- 17. Aun dentro de la función, la bandera solo permite cambiar status/sent_at (prueba directa de la
--     bandera con acceso a nivel de sesión, mismo patrón que data_subject_requests en 078).
INSERT INTO public.email_outbox (reference_table, reference_id) VALUES ('data_subject_requests', 'CD-TEST-000002');
SET app.allow_email_outbox_update = 'on';
SELECT pg_temp.expect_error($$UPDATE public.email_outbox SET reference_id = 'otro' WHERE reference_id = 'CD-TEST-000002'$$, 'aun con la bandera');
RESET app.allow_email_outbox_update;

-- 18. Permisos: solo service_role ejecuta la función; nadie fuera de eso toca la tabla directamente.
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE')::int::boolean, false, 'authenticated no ejecuta la función');
SELECT pg_temp.expect(has_function_privilege('anon', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE')::int::boolean, false, 'anon no ejecuta la función');
SELECT pg_temp.expect(has_function_privilege('service_role', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE')::int::boolean, true, 'service_role sí ejecuta la función');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.email_outbox', 'SELECT'), false, 'authenticated no lee la cola directamente');
SELECT pg_temp.expect(has_table_privilege('anon', 'public.email_outbox', 'SELECT'), false, 'anon no lee la cola directamente');

\echo OK: transporte de correo configurable y cola de avisos pendientes (079)
