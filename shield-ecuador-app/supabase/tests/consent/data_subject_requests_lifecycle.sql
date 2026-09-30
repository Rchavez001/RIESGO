-- T08: numeración de casos secuencial POR AÑO y actualización acotada de data_subject_requests con
-- bitácora (migración 078), autoverificable. Corre después de 073+074+075+077+078 sobre prereqs.sql.
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

-- 1. next_case_number(): secuencial dentro del año actual.
DO $$
DECLARE n1 text; n2 text; y text := to_char(now(), 'YYYY');
BEGIN
  n1 := public.next_case_number();
  n2 := public.next_case_number();
  IF n1 <> 'CD-' || y || '-000001' THEN RAISE EXCEPTION 'primer número: se esperaba CD-%-000001, hubo %', y, n1; END IF;
  IF n2 <> 'CD-' || y || '-000002' THEN RAISE EXCEPTION 'segundo número: se esperaba CD-%-000002, hubo %', y, n2; END IF;
END $$;

-- 2. Secuencial POR AÑO: un año distinto (pasado, sembrado a mano) con un contador alto no afecta al
--    año actual — no se puede mockear now(), así que se prueba la independencia entre contadores.
INSERT INTO public.data_subject_request_counters (year, last_number) VALUES (2019, 999);
SELECT pg_temp.expect((SELECT last_number FROM public.data_subject_request_counters WHERE year = extract(year from now())::int), 2, 'el contador del año actual sigue en 2, ajeno al de 2019');
DO $$
DECLARE n3 text; y text := to_char(now(), 'YYYY');
BEGIN
  n3 := public.next_case_number();
  IF n3 <> 'CD-' || y || '-000003' THEN RAISE EXCEPTION 'tercer número: se esperaba CD-%-000003 (no 001000), hubo %', y, n3; END IF;
END $$;

-- 3. Fixture para las pruebas de actualización acotada.
INSERT INTO public.data_subject_requests (case_number, email_hmac, request_type, channel, routed_to_email, settings_version, due_at)
  VALUES ('CD-TEST-000001', 'hmac-caso1', 'acceso', 'app', 'privacidad@example.test', 1, now() + interval '15 days');

-- 4. Sin la función, nadie toca la fila: ni UPDATE directo ni DELETE, ni siquiera de columnas permitidas.
SELECT pg_temp.expect_error($$UPDATE public.data_subject_requests SET status = 'en_proceso' WHERE case_number = 'CD-TEST-000001'$$, 'solo update_data_subject_request_status');
SELECT pg_temp.expect_error($$DELETE FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'$$, 'no se puede borrar un caso');

-- 5. update_data_subject_request_status(): cambia status/resolved_at/resolution_note_ciphertext y deja bitácora.
SELECT pg_temp.expect(
  (public.update_data_subject_request_status(
    (SELECT id FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'),
    (SELECT id FROM public.users WHERE role = 'admin'), 'admin-hmac', 'privacy_admin',
    'en_proceso', NULL, 'se empieza a atender')).status,
  'en_proceso', 'el estado cambió a en_proceso');
SELECT pg_temp.expect((SELECT resolved_at FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'), NULL, 'en_proceso no resuelve el caso');
SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'data_subject_request.status_changed' AND entity_id = 'CD-TEST-000001')::int, 1, 'bitácora del primer cambio');

SELECT pg_temp.expect(
  (public.update_data_subject_request_status(
    (SELECT id FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'),
    (SELECT id FROM public.users WHERE role = 'admin'), 'admin-hmac', 'privacy_admin',
    'atendida', '{"v":1,"ct":"nota cifrada"}'::jsonb, 'atendido, ver nota')).status,
  'atendida', 'el estado cambió a atendida');
SELECT pg_temp.expect((SELECT resolved_at IS NOT NULL FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'), true, 'atendida sí resuelve el caso (resolved_at)');
SELECT pg_temp.expect((SELECT resolution_note_ciphertext FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001')->>'ct', 'nota cifrada', 'la nota cifrada quedó guardada');
SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'data_subject_request.status_changed' AND entity_id = 'CD-TEST-000001')::int, 2, 'bitácora del segundo cambio (2 en total)');

-- 6. Un estado fuera del CHECK de la tabla se rechaza (la función no lo valida aparte: confía en el CHECK).
SELECT pg_temp.expect_error($$SELECT public.update_data_subject_request_status(
    (SELECT id FROM public.data_subject_requests WHERE case_number = 'CD-TEST-000001'),
    (SELECT id FROM public.users WHERE role = 'admin'), 'admin-hmac', 'privacy_admin', 'estado_inventado', NULL, NULL)$$,
  'data_subject_requests_status_check');

-- 7. Una solicitud inexistente da un error claro, sin dejar bitácora huérfana.
SELECT pg_temp.expect_error($$SELECT public.update_data_subject_request_status(
    '00000000-0000-4000-8000-000000000000', (SELECT id FROM public.users WHERE role = 'admin'), 'admin-hmac', 'privacy_admin', 'en_proceso', NULL, NULL)$$,
  'no existe');
SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE entity_id = '00000000-0000-4000-8000-000000000000')::int, 0, 'sin bitácora para una solicitud inexistente');

-- 8. Aun dentro de la función, la bandera solo permite cambiar status/resolved_at/resolution_note_ciphertext
--    (probado indirectamente: la función nunca toca email_hmac/request_type/etc., y el trigger lo exigiría
--    si algún día la función cambiara). Prueba directa de la bandera con acceso a nivel de sesión:
SET app.allow_case_status_update = 'on';
SELECT pg_temp.expect_error($$UPDATE public.data_subject_requests SET request_type = 'oposicion' WHERE case_number = 'CD-TEST-000001'$$, 'aun con la bandera');
SELECT pg_temp.expect_error($$UPDATE public.data_subject_requests SET email_hmac = 'otro' WHERE case_number = 'CD-TEST-000001'$$, 'aun con la bandera');
RESET app.allow_case_status_update;

-- 9. Permisos: solo service_role ejecuta la función; nadie fuera de eso toca la tabla directamente.
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE')::int::boolean, false, 'authenticated no ejecuta la función');
SELECT pg_temp.expect(has_function_privilege('anon', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE')::int::boolean, false, 'anon no ejecuta la función');
SELECT pg_temp.expect(has_function_privilege('service_role', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE')::int::boolean, true, 'service_role sí ejecuta la función');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.data_subject_requests', 'SELECT'), false, 'authenticated no lee la tabla directamente');
SELECT pg_temp.expect(has_table_privilege('anon', 'public.data_subject_requests', 'SELECT'), false, 'anon no lee la tabla directamente');

-- 10. verify_audit_chain() sigue íntegra tras los cambios de esta prueba.
SELECT pg_temp.expect(EXISTS(SELECT 1 FROM public.verify_audit_chain()), false, 'la cadena de la bitácora sigue íntegra');

\echo OK: numeración por año y actualización acotada de data_subject_requests (073 + 078)
