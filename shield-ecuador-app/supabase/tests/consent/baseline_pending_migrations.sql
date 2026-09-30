-- Ensayo del release: aserciones de esquema/permisos sobre 074-078 aplicadas encima de
-- supabase/baseline/prod_schema.sql (NO sobre datos: el baseline es solo esquema, sin las filas
-- que la migración 073 insertó en producción; por eso aquí NO se repiten los chequeos de datos de
-- PLAN_PRODUCCION_RELEASE.md §4 que asumen esa fila semilla — esos solo tienen sentido contra
-- producción real). Cualquier aserción que no se cumple lanza una excepción y psql (ON_ERROR_STOP)
-- sale con código != 0. Pensado para correr UNA sola vez, justo después de aplicar 074→078 sobre
-- el baseline recién cargado (lo orquesta la puerta `db-reset` de gates.sh).
\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.expect_int(actual bigint, expected bigint, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION '% : se esperaba %, hubo %', label, expected, actual; END IF; END $$;

CREATE FUNCTION pg_temp.expect_true(actual boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS NOT TRUE THEN RAISE EXCEPTION '% : se esperaba verdadero, hubo %', label, actual; END IF; END $$;

CREATE FUNCTION pg_temp.expect_false(actual boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS NOT FALSE THEN RAISE EXCEPTION '% : se esperaba falso, hubo %', label, actual; END IF; END $$;

-- 074 + 075: cadenas vacías (tablas recién creadas por el baseline, sin filas) y sin `is_current`.
SELECT pg_temp.expect_int((SELECT count(*) FROM public.verify_consent_chain()), 0, '074: verify_consent_chain vacía');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.verify_audit_chain()), 0, '074: verify_audit_chain vacía');
SELECT pg_temp.expect_int(
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_settings' AND column_name='is_current'),
  0, '075: privacy_settings ya no tiene is_current');
SELECT pg_temp.expect_false(has_function_privilege('anon', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE'), '074: anon sin permiso de unlink_user_consent_evidence');
SELECT pg_temp.expect_false(has_function_privilege('authenticated', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE'), '074: authenticated sin permiso de unlink_user_consent_evidence');
SELECT pg_temp.expect_true((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.privacy_email_verifications'::regclass), '075: RLS activa en privacy_email_verifications');

-- 076 (ajena al módulo, viaja en el mismo push por numeración de archivo): código de error estable presente.
SELECT pg_temp.expect_true((SELECT prosrc ~ 'GUEST_LIMIT_REACHED' FROM pg_proc WHERE proname = 'learning_answer'), '076: learning_answer con GUEST_LIMIT_REACHED');
SELECT pg_temp.expect_true((SELECT prosrc ~ 'GUEST_LIMIT_REACHED' FROM pg_proc WHERE proname = 'learning_start_exam'), '076: learning_start_exam con GUEST_LIMIT_REACHED');

-- 077: el trigger existe y es diferible (la prueba funcional de un retiro real necesita un aviso
-- publicado; queda pendiente para producción, ver PLAN_PRODUCCION_RELEASE.md §4).
SELECT pg_temp.expect_int((SELECT count(*) FROM pg_trigger WHERE tgname = 'consent_documents_no_gap_on_retire'), 1, '077: trigger existe');
SELECT pg_temp.expect_true((SELECT tgdeferrable FROM pg_trigger WHERE tgname = 'consent_documents_no_gap_on_retire'), '077: trigger es DEFERRABLE');
SELECT pg_temp.expect_true((SELECT tginitdeferred FROM pg_trigger WHERE tgname = 'consent_documents_no_gap_on_retire'), '077: trigger es INITIALLY DEFERRED');

-- 078: trigger de restricción, contador por año arrancando en 0 (baseline sin datos) y numeración
-- CD-<año>-000001 la primera vez que se llama, sin sembrar nada a mano.
SELECT pg_temp.expect_int((SELECT count(*) FROM pg_trigger WHERE tgname = 'data_subject_requests_restrict_update'), 1, '078: trigger de restricción existe');
SELECT pg_temp.expect_int((SELECT count(*) FROM public.data_subject_request_counters), 0, '078: contador vacío antes de la primera llamada');
SELECT pg_temp.expect_true((SELECT public.next_case_number() = 'CD-' || to_char(now(), 'YYYY') || '-000001'), '078: primer caso del año en 000001');
SELECT pg_temp.expect_false(has_function_privilege('anon', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE'), '078: anon sin permiso de update_data_subject_request_status');
SELECT pg_temp.expect_false(has_function_privilege('authenticated', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE'), '078: authenticated sin permiso de update_data_subject_request_status');
SELECT pg_temp.expect_true(has_function_privilege('service_role', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE'), '078: service_role con permiso de update_data_subject_request_status');

\echo 'baseline_pending_migrations.sql: todas las aserciones pasaron'
