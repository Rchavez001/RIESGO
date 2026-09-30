-- Reglas propias de consent_documents (migraciones 073 + 077), autoverificable.
-- Corre después de 073+074+075+077, DESPUÉS de lifecycle.sql (que ya usó la versión '1.0' como fixture
-- de consent_records) sobre prereqs.sql (que crea un admin). Por eso el fixture de este archivo usa el
-- prefijo 'cdl-' en la versión: no puede repetir '1.0' (UNIQUE en consent_documents.version).
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

-- Fixture: una versión publicada (cdl-1.0) y una en borrador (cdl-1.1), ambas del admin de prereqs.sql.
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by, published_by, published_at)
  SELECT 'cdl-1.0', 'Aviso cdl-1.0', 'contenido cdl-1.0', 'sha-cdl-1.0', '["registro_aprendizaje"]'::jsonb, 'published', id, id, now()
  FROM public.users WHERE role = 'admin';
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by, based_on_id)
  SELECT 'cdl-1.1', 'Aviso cdl-1.1 (borrador)', 'contenido cdl-1.1', 'sha-cdl-1.1', '["registro_aprendizaje"]'::jsonb, 'draft', id,
         (SELECT id FROM public.consent_documents WHERE version = 'cdl-1.0')
  FROM public.users WHERE role = 'admin';

-- 1. No se puede editar el contenido de una versión publicada.
SELECT pg_temp.expect_error($$UPDATE public.consent_documents SET content_md = 'hackeado' WHERE version = 'cdl-1.0'$$, 'ya no es un borrador');
SELECT pg_temp.expect_error($$UPDATE public.consent_documents SET purposes = '["otra"]'::jsonb WHERE version = 'cdl-1.0'$$, 'ya no es un borrador');
SELECT pg_temp.expect_error($$UPDATE public.consent_documents SET title = 'otro título' WHERE version = 'cdl-1.0'$$, 'ya no es un borrador');

-- 2. El borrador sí es editable (mismo trigger, no bloquea cuando OLD.status = 'draft').
UPDATE public.consent_documents SET content_md = 'contenido cdl-1.1 revisado', title = 'Aviso cdl-1.1 (borrador, revisado)' WHERE version = 'cdl-1.1';
SELECT pg_temp.expect((SELECT content_md FROM public.consent_documents WHERE version = 'cdl-1.1'), 'contenido cdl-1.1 revisado', 'el borrador se editó');

-- 3. No puede haber dos versiones publicadas a la vez.
SELECT pg_temp.expect_error($$UPDATE public.consent_documents SET status = 'published', published_at = now() WHERE version = 'cdl-1.1'$$, 'consent_documents_one_published');

-- 4. Retirar la publicada sin reemplazo en la misma transacción deja el módulo sin aviso vigente:
--    la restricción es DEFERRED, así que forzamos su comprobación con SET CONSTRAINTS ... IMMEDIATE
--    dentro del mismo bloque, sin depender de un COMMIT real del script.
SELECT pg_temp.expect_error($q$DO $x$ BEGIN
  UPDATE public.consent_documents SET status = 'retired', retired_at = now() WHERE version = 'cdl-1.0';
  SET CONSTRAINTS consent_documents_no_gap_on_retire IMMEDIATE;
END $x$ $q$, 'sin aviso vigente');
-- La transacción fallida no debe haber dejado nada a medias: cdl-1.0 sigue publicada.
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'cdl-1.0'), 'published', 'cdl-1.0 sigue publicada tras el intento fallido');

-- 5. Retirar la publicada y publicar el reemplazo EN LA MISMA transacción sí se permite.
DO $$
BEGIN
  UPDATE public.consent_documents SET status = 'retired', retired_at = now() WHERE version = 'cdl-1.0';
  UPDATE public.consent_documents SET status = 'published', published_at = now() WHERE version = 'cdl-1.1';
  SET CONSTRAINTS consent_documents_no_gap_on_retire IMMEDIATE;
END $$;
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'cdl-1.0'), 'retired', 'cdl-1.0 quedó retirada');
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'cdl-1.1'), 'published', 'cdl-1.1 pasó a publicada');
SELECT pg_temp.expect((SELECT count(*) FROM public.consent_documents WHERE status = 'published')::int, 1, 'sigue habiendo exactamente una publicada');

-- 6. El trigger de retiro no se dispara para transiciones ajenas a published→retired
--    (draft→retired, por ejemplo un borrador descartado, no exige reemplazo).
INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by)
  SELECT 'cdl-1.2', 'Borrador descartado', 'x', 'sha-cdl-1.2', '["registro_aprendizaje"]'::jsonb, 'draft', id FROM public.users WHERE role = 'admin';
UPDATE public.consent_documents SET status = 'retired', retired_at = now() WHERE version = 'cdl-1.2';
SELECT pg_temp.expect((SELECT status FROM public.consent_documents WHERE version = 'cdl-1.2'), 'retired', 'un borrador se puede retirar sin exigir reemplazo');

-- 7. Solo lectura pública de lo publicado; nadie fuera de service_role escribe.
SELECT pg_temp.expect(has_table_privilege('anon', 'public.consent_documents', 'INSERT'), false, 'anon no inserta');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.consent_documents', 'UPDATE'), false, 'authenticated no actualiza');
SELECT pg_temp.expect(has_table_privilege('anon', 'public.consent_documents', 'SELECT'), true, 'anon sí puede leer (RLS filtra a published)');

\echo OK: reglas de consent_documents (073 + 077)
