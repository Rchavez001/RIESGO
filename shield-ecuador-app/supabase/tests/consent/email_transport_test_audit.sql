-- TEST-INT.e (D-15, condición 3): la bitácora que `send_test_email` (T12.d.2, admin-consent/handler.ts
-- `sendTestEmail` + `auditLog`) escribe en `admin_audit_log` vía el callback genérico `audit()` de
-- `index.ts` (INSERT directo, sin función RPC) nunca se había ejercitado contra Postgres real: los 7
-- casos de la Iteración 37 (`handler_test.ts`) usan el store en memoria de `makeEmailTransportStore`, que
-- nunca pasa por el trigger de cadena de hash ni por `verify_audit_chain()`. Esta prueba reproduce, con un
-- INSERT directo, la forma exacta que produce `sendTestEmail()` para la acción `email_transport.test`
-- (host + IP validada en `after`, caminos de éxito/fallo/resend) y confirma que la cadena de `admin_audit_log`
-- sigue íntegra después. Corre después de 073 + pendientes sobre prereqs.sql (que crea un admin);
-- independiente de qué versión de `email_transport_settings` dejaron otros archivos (usa un `entity_id`
-- centinela '9001', fuera del rango real, para no depender de su orden de ejecución).
\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.expect(actual anyelement, expected anyelement, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

-- 1. Camino smtp con fallo (smtp_send_failed): nunca solo el feliz — host + IP validada quedan en `after`
--    aunque el envío real haya fallado después de pasar el anti-SSRF (SmtpSender.send(), D-15 condición 3).
INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after, reason)
  SELECT id, 'test-hmac-admin-teste', 'privacy_admin', 'email_transport.test', 'email_transport_settings', '9001', NULL,
         '{"mode":"smtp","success":false,"error_code":"smtp_send_failed","smtp_host":"smtp.example.test","resolved_ip":"198.51.100.10"}'::jsonb,
         NULL
  FROM public.users WHERE role = 'admin';

SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001')::int, 1, 'una fila para el intento fallido');
SELECT pg_temp.expect((SELECT after ->> 'smtp_host' FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), 'smtp.example.test', 'smtp_host quedó en la bitácora del intento fallido');
SELECT pg_temp.expect((SELECT after ->> 'resolved_ip' FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), '198.51.100.10', 'resolved_ip quedó en la bitácora del intento fallido (D-15, condición 3)');
SELECT pg_temp.expect((SELECT (after ->> 'success')::boolean FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), false, 'success=false en el camino de fallo');
SELECT pg_temp.expect((SELECT row_hash IS NOT NULL FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), true, 'el trigger calculó row_hash real (no un valor puesto a mano)');

-- 2. Camino smtp con éxito: mismo host/IP, success=true, sin error_code.
INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after, reason)
  SELECT id, 'test-hmac-admin-teste', 'privacy_admin', 'email_transport.test', 'email_transport_settings', '9001', NULL,
         '{"mode":"smtp","success":true,"error_code":null,"smtp_host":"smtp.example.test","resolved_ip":"198.51.100.11"}'::jsonb,
         NULL
  FROM public.users WHERE role = 'admin';

SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001')::int, 2, 'dos filas para la acción 9001 (fallo + éxito)');
SELECT pg_temp.expect((SELECT (after ->> 'success')::boolean FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), true, 'success=true en el camino feliz');
SELECT pg_temp.expect((SELECT after ->> 'resolved_ip' FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9001' ORDER BY id DESC LIMIT 1), '198.51.100.11', 'resolved_ip también queda en el camino feliz');

-- 3. Camino resend: sin anti-SSRF (SmtpSender es quien calcula `resolvedIp`), smtp_host/resolved_ip en
--    null — documentado como "no aplica" en vez de omitido en silencio (ver handler.ts, sendTestEmail).
INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after, reason)
  SELECT id, 'test-hmac-admin-teste', 'privacy_admin', 'email_transport.test', 'email_transport_settings', '9002', NULL,
         '{"mode":"resend","success":true,"error_code":null,"smtp_host":null,"resolved_ip":null}'::jsonb,
         NULL
  FROM public.users WHERE role = 'admin';

SELECT pg_temp.expect((SELECT after ->> 'smtp_host' FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9002'), NULL, 'smtp_host es null en modo resend');
SELECT pg_temp.expect((SELECT after ->> 'resolved_ip' FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id = '9002'), NULL, 'resolved_ip es null en modo resend (no aplica, no se omite el campo)');

-- 4. La contraseña nunca viaja en esta bitácora (ni en texto ni cifrada): ninguna de las 3 filas tiene
--    una clave `password`/`ciphertext` en `after` — lo mismo que ya verifica `handler_test.ts` contra el
--    fake, ahora confirmado contra la fila real tal como quedó en Postgres.
SELECT pg_temp.expect((SELECT bool_or(after ? 'password' OR after ? 'smtp_password_ciphertext') FROM public.admin_audit_log WHERE action = 'email_transport.test' AND entity_id IN ('9001', '9002')), false, 'ninguna fila de esta prueba expone la contraseña ni su ciphertext');

-- 5. `verify_audit_chain()` sigue íntegra tras las 3 inserciones de esta prueba (condición de D-15 y del
--    criterio de aceptación de TEST-INT.e): sin filas rotas en TODA la tabla, no solo en las de arriba.
SELECT pg_temp.expect(EXISTS(SELECT 1 FROM public.verify_audit_chain()), false, 'verify_audit_chain sigue íntegra tras las inserciones de send_test_email');

\echo OK: bitácora real de send_test_email (admin_audit_log con smtp_host/resolved_ip, D-15 condición 3) y verify_audit_chain intacta
