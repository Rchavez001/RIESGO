-- T14 fix (080): publish_consent_document() — retirar+publicar+bitácora en una sola transacción real,
-- con autorización (rol privacy_admin, aal2, motivo) y "cuatro ojos" verificados DENTRO de la función,
-- no solo en TypeScript. Autoverificable: cualquier aserción que no se cumple lanza una excepción y
-- psql (ON_ERROR_STOP) sale con código != 0. Corre después de 073..080, DESPUÉS de los demás archivos
-- de prueba de consent_documents (puede haber ya una versión publicada de otro archivo: nunca se asume
-- un estado "sin nada publicado", se usa la función misma para establecer la fixture).
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

-- Fixture: un admin con rol privacy_admin (el actor), un editor sin ese rol (para "forbidden"),
-- y dos borradores (pcd-1.0, pcd-1.1). pcd-1.0 se publica con la función misma (no con un INSERT
-- directo en status='published': ya puede haber otra versión publicada por otro archivo de prueba,
-- y el índice `consent_documents_one_published` solo permite una).
INSERT INTO public.users (id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'privacy-admin@example.test'),
  ('a2222222-2222-4222-8222-222222222222', 'privacy-editor@example.test');
INSERT INTO public.admin_roles (user_id, role) VALUES ('a1111111-1111-4111-8111-111111111111', 'privacy_admin');

INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by) VALUES
  ('pcd-1.0', 'Aviso pcd-1.0', 'contenido pcd-1.0', 'sha-pcd-1.0', '["registro_aprendizaje"]'::jsonb, 'draft', (SELECT id FROM public.users WHERE role = 'admin')),
  ('pcd-1.1', 'Aviso pcd-1.1 (borrador)', 'contenido pcd-1.1', 'sha-pcd-1.1', '["registro_aprendizaje"]'::jsonb, 'draft', (SELECT id FROM public.users WHERE role = 'admin'));

SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.0'),
  'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-setup', 'fixture: publicar pcd-1.0 como vigente inicial');
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'pcd-1.0'), 'published', 'fixture: pcd-1.0 quedó publicada');

-- 1. Sin rol privacy_admin → forbidden (defensa en profundidad: ni siquiera con aal2 y motivo basta).
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.1'),
      'a2222222-2222-4222-8222-222222222222', 'privacy_editor', 'aal2', 'hmac-editor', 'motivo válido')$$,
  'forbidden');

-- 2. Con rol pero sin aal2 (sin TOTP verificado) → mfa_required.
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.1'),
      'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal1', 'hmac-admin', 'motivo válido')$$,
  'mfa_required');

-- 3. Con rol y aal2, pero motivo vacío/solo espacios → reason_required.
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.1'),
      'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin', '   ')$$,
  'reason_required');

-- 4. Documento inexistente → not_found.
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document('00000000-0000-4000-8000-000000000000',
      'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin', 'motivo válido')$$,
  'not_found');

-- 5. Algo que no es borrador (ya publicado, por la fixture de arriba) → not_draft.
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.0'),
      'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin', 'motivo válido')$$,
  'not_draft');

-- Ninguno de los intentos fallidos de arriba cambió nada: pcd-1.0 sigue publicada, pcd-1.1 sigue borrador.
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'pcd-1.0'), 'published', 'tras los intentos fallidos, pcd-1.0 sigue publicada');
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'pcd-1.1'), 'draft', 'tras los intentos fallidos, pcd-1.1 sigue borrador');

-- 6. Cuatro ojos activo: quien editó por última vez el borrador no puede publicarlo él mismo.
--    privacy_settings es solo-INSERT (075): nueva versión con four_eyes_publish = true.
INSERT INTO public.privacy_settings (settings_version, controller_name, privacy_email, dpo_contact, four_eyes_publish, created_by)
  SELECT settings_version + 1, controller_name, privacy_email, dpo_contact, true, created_by FROM public.privacy_settings_current;
UPDATE public.consent_documents SET updated_by = 'a1111111-1111-4111-8111-111111111111' WHERE version = 'pcd-1.1';
SELECT pg_temp.expect_error(
  $$SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.1'),
      'a1111111-1111-4111-8111-111111111111', 'privacy_admin', 'aal2', 'hmac-admin', 'motivo válido')$$,
  'four_eyes_required');
-- Otro admin (distinto del último editor) SÍ puede, incluso con cuatro ojos activo.
INSERT INTO public.admin_roles (user_id, role) VALUES ('a2222222-2222-4222-8222-222222222222', 'privacy_admin');
SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = 'pcd-1.1'),
  'a2222222-2222-4222-8222-222222222222', 'privacy_admin', 'aal2', 'hmac-editor-admin', 'otro admin publica pcd-1.1');
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'pcd-1.1'), 'published', 'pcd-1.1 quedó publicada (cuatro ojos: otro admin sí puede)');
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'pcd-1.0'), 'retired', 'pcd-1.0 quedó retirada automáticamente, en la MISMA llamada');
SELECT pg_temp.expect((SELECT count(*) FROM public.consent_documents WHERE status = 'published')::int, 1, 'sigue habiendo exactamente una publicada');

-- 7. Bitácora: la fila de ESTA publicación (filtrada por el motivo, único) tiene antes/después/actor correctos.
SELECT pg_temp.expect((SELECT count(*) FROM public.admin_audit_log WHERE action = 'consent_document.publish' AND reason = 'otro admin publica pcd-1.1')::int, 1, 'una fila de bitácora por esta publicación');
SELECT pg_temp.expect((SELECT actor_id FROM public.admin_audit_log WHERE reason = 'otro admin publica pcd-1.1'), 'a2222222-2222-4222-8222-222222222222'::uuid, 'actor correcto en la bitácora');
SELECT pg_temp.expect((SELECT before ->> 'version' FROM public.admin_audit_log WHERE reason = 'otro admin publica pcd-1.1'), 'pcd-1.0', 'before = la que se retiró');
SELECT pg_temp.expect((SELECT after ->> 'version' FROM public.admin_audit_log WHERE reason = 'otro admin publica pcd-1.1'), 'pcd-1.1', 'after = la que se publicó');

-- 8. Permisos: solo service_role ejecuta la función.
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE')::int::boolean, false, 'authenticated no ejecuta publish_consent_document');
SELECT pg_temp.expect(has_function_privilege('anon', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE')::int::boolean, false, 'anon no ejecuta publish_consent_document');
SELECT pg_temp.expect(has_function_privilege('service_role', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE')::int::boolean, true, 'service_role sí ejecuta publish_consent_document');

-- 9. La cadena de la bitácora sigue íntegra tras todo esto.
SELECT pg_temp.expect(EXISTS(SELECT 1 FROM public.verify_audit_chain()), false, 'verify_audit_chain sigue íntegra');

\echo OK: publish_consent_document atómica, con autorización y cuatro ojos dentro de la función (080)
