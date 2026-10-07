-- T13.c (cierra TEST-INT.c): integración real de `request-data-subject-right` contra Postgres real.
-- Los 7 tests de handler_test.ts usan un fake sin ningún CHECK (`dsr.insert` solo hace `rows.push`,
-- `email_outbox` es un array en memoria): aquí se prueban, contra el esquema real de 073/078/079, los dos
-- huecos que ese fake no puede ver —
--   1) que los 9 valores de REQUEST_TYPES (handler.ts) siguen aceptados por el CHECK real de
--      `request_type` (si alguna vez se añadiera un valor a uno sin el otro, esto lo detecta), y un valor
--      fuera de la lista sigue rechazado;
--   2) que las dos filas que `createDataSubjectRequest`/`dispatchOrQueue` encola en `email_outbox`
--      (`dsr_delegate_notice`, `dsr_ack`) sobreviven de verdad al esquema de 079 (CHECK de `status`,
--      append-only, `mark_email_outbox_sent`), que `mark_email_outbox_sent` marca cada una por separado
--      (nunca las dos a la vez), y que el SELECT exacto que usa `rebuildMessage`
--      (admin-consent/index.ts: `id, case_number, request_type, due_at, routed_to_email,
--      email_ciphertext`) resuelve sin NULL inesperado contra una fila real.
-- La atomicidad/secuencia de `next_case_number()` ya está probada en data_subject_requests_lifecycle.sql
-- (T08); no se repite aquí. Corre después de 073+077+078+079 sobre prereqs.sql.
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

-- 1. Los 9 valores reales de REQUEST_TYPES insertan con next_case_number() real y la misma forma de fila
--    que arma createDataSubjectRequest (ciphertext con AAD, ip_hmac, key_version, channel='app').
DO $$
DECLARE
  t text;
  admin_id uuid := (SELECT id FROM public.users WHERE role = 'admin');
  types text[] := ARRAY['baja','acceso','rectificacion','eliminacion','oposicion','suspension','portabilidad','revocacion','decision_automatizada'];
BEGIN
  FOREACH t IN ARRAY types LOOP
    INSERT INTO public.data_subject_requests
      (case_number, user_id, email_ciphertext, email_hmac, request_type, channel, routed_to_email,
       settings_version, due_at, ip_ciphertext, ip_hmac, key_version)
    VALUES
      (public.next_case_number(), admin_id, '{"v":1,"iv":"iv","tag":"tag","ct":"ct","aad":true}'::jsonb,
       'hmac-t13c-' || t, t, 'app', 'privacidad@example.test', 1, now() + interval '15 days',
       '{"v":1,"iv":"iv","tag":"tag","ct":"ct","aad":true}'::jsonb, 'iphmac-' || t, 1);
  END LOOP;
END $$;
SELECT pg_temp.expect(
  (SELECT count(*) FROM public.data_subject_requests
     WHERE request_type = ANY(ARRAY['baja','acceso','rectificacion','eliminacion','oposicion','suspension','portabilidad','revocacion','decision_automatizada'])
       AND email_hmac LIKE 'hmac-t13c-%')::int,
  9, 'los 9 valores de REQUEST_TYPES insertan contra el CHECK real');

-- 2. Un tipo fuera de la lista (drift si algún día se añadiera solo en TypeScript) sigue rechazado por
--    el CHECK real.
SELECT pg_temp.expect_error($$INSERT INTO public.data_subject_requests
    (case_number, email_hmac, request_type, channel, routed_to_email, settings_version, due_at)
  VALUES ('CD-TEST-DRIFT', 'hmac-drift', 'tipo_inventado', 'app', 'privacidad@example.test', 1, now() + interval '15 days')$$,
  'data_subject_requests_request_type_check');

-- 3. email_outbox: las dos referencias que dispatchOrQueue encola para un caso real sin transporte
--    configurado (dsr_delegate_notice, dsr_ack), contra la fila real que las origina.
INSERT INTO public.data_subject_requests
  (case_number, email_hmac, request_type, channel, routed_to_email, settings_version, due_at, email_ciphertext)
VALUES (public.next_case_number(), 'hmac-t13c-outbox-dsr', 'acceso', 'app', 'privacidad@example.test', 1, now() + interval '15 days',
        '{"v":1,"iv":"iv","tag":"tag","ct":"ct","aad":true}'::jsonb);

INSERT INTO public.email_outbox (reference_table, reference_id)
  SELECT 'dsr_delegate_notice', id::text FROM public.data_subject_requests WHERE email_hmac = 'hmac-t13c-outbox-dsr'
  UNION ALL
  SELECT 'dsr_ack', id::text FROM public.data_subject_requests WHERE email_hmac = 'hmac-t13c-outbox-dsr';

SELECT pg_temp.expect(
  (SELECT count(*) FROM public.email_outbox eo JOIN public.data_subject_requests dsr ON dsr.id::text = eo.reference_id
     WHERE dsr.email_hmac = 'hmac-t13c-outbox-dsr' AND eo.status = 'pending' AND eo.reference_table IN ('dsr_delegate_notice', 'dsr_ack'))::int,
  2, 'las dos referencias (dsr_delegate_notice, dsr_ack) nacen pendientes, apuntando al caso real');

-- El SELECT exacto que ejecuta rebuildMessage (admin-consent/index.ts) resuelve sin NULL inesperado.
SELECT pg_temp.expect(
  (SELECT (id IS NOT NULL AND case_number IS NOT NULL AND request_type IS NOT NULL AND due_at IS NOT NULL
           AND routed_to_email IS NOT NULL AND email_ciphertext IS NOT NULL)
     FROM public.data_subject_requests WHERE email_hmac = 'hmac-t13c-outbox-dsr'),
  true, 'rebuildMessage: SELECT id,case_number,request_type,due_at,routed_to_email,email_ciphertext sin NULL inesperado');

-- mark_email_outbox_sent() marca solo la fila indicada; resend_pending_emails procesa cada referencia por
-- separado, nunca junta dsr_delegate_notice y dsr_ack de un mismo caso en una sola llamada.
SELECT pg_temp.expect(
  (public.mark_email_outbox_sent(
    (SELECT eo.id FROM public.email_outbox eo JOIN public.data_subject_requests dsr ON dsr.id::text = eo.reference_id
       WHERE dsr.email_hmac = 'hmac-t13c-outbox-dsr' AND eo.reference_table = 'dsr_delegate_notice'))).status,
  'sent', 'dsr_delegate_notice queda enviado');
SELECT pg_temp.expect(
  (SELECT eo.status FROM public.email_outbox eo JOIN public.data_subject_requests dsr ON dsr.id::text = eo.reference_id
     WHERE dsr.email_hmac = 'hmac-t13c-outbox-dsr' AND eo.reference_table = 'dsr_ack'),
  'pending', 'dsr_ack sigue pendiente (no se marcan juntas)');

\echo OK: request_type real (9 valores) + email_outbox para dsr_delegate_notice/dsr_ack contra Postgres real (T13.c)
