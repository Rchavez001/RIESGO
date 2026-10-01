-- supabase/migrations/081_fix_digest_schema_qualification.sql
-- Defecto preexistente de 073 (ya en prod), encontrado al verificar la migración 080 contra un Supabase
-- local REAL (no el Postgres vanilla efímero de gates.sh): `consent_records_chain_trigger()`,
-- `verify_consent_chain()`, `admin_audit_log_chain_trigger()` y `verify_audit_chain()` llaman a
-- `digest(...)` (de pgcrypto) SIN calificar el esquema. En un Supabase real, pgcrypto vive en el esquema
-- `extensions`, no en `public` — funciona cuando el `search_path` efectivo de la sesión/transacción lo
-- incluye (el caso por defecto de PostgREST), pero CUALQUIER función `SECURITY DEFINER ... SET
-- search_path = public` que inserte en `consent_records`/`admin_audit_log` (ya existen varias:
-- `unlink_user_consent_evidence` 074, `update_data_subject_request_status` 078, y la nueva
-- `publish_consent_document` 080) dispara estos triggers con ESE search_path acotado — y `extensions` no
-- está en él — así que `digest()` no se encuentra: `function digest(text, unknown) does not exist`.
-- Verificado contra Postgres real: `update_data_subject_request_status` (078, ya cerrada) tiene el MISMO
-- fallo, no es nuevo de 080 — simplemente nadie lo había ejercitado contra un Supabase real hasta ahora
-- (los tests de gates.sh corren en un Postgres vanilla donde `prereqs.sql` instala pgcrypto en `public`,
-- así que nunca lo hubiera detectado; prereqs.sql se corrige en el mismo commit para que deje de ocultarlo).
--
-- Arreglo: calificar `extensions.digest(...)` explícitamente en las 4 funciones. Así deja de depender del
-- `search_path` de quien dispare el trigger — ninguna función futura con `SET search_path` acotado puede
-- volver a pisar este mismo problema.
CREATE OR REPLACE FUNCTION public.consent_records_chain_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('consent_records_chain'));
  SELECT row_hash INTO last_hash FROM public.consent_records ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(extensions.digest(coalesce(last_hash, '') || public.consent_record_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.verify_consent_chain()
RETURNS TABLE (first_broken_id BIGINT, detail TEXT) LANGUAGE plpgsql AS $$
DECLARE
  rec public.consent_records%ROWTYPE;
  expected_prev TEXT := NULL;
  expected_hash TEXT;
BEGIN
  FOR rec IN SELECT * FROM public.consent_records ORDER BY id ASC LOOP
    IF rec.prev_hash IS DISTINCT FROM expected_prev THEN
      RETURN QUERY SELECT rec.id, 'prev_hash no coincide con el row_hash anterior'; RETURN;
    END IF;
    expected_hash := encode(extensions.digest(coalesce(expected_prev, '') || public.consent_record_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_audit_log_chain_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_log_chain'));
  SELECT row_hash INTO last_hash FROM public.admin_audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(extensions.digest(coalesce(last_hash, '') || public.admin_audit_log_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.verify_audit_chain()
RETURNS TABLE (first_broken_id BIGINT, detail TEXT) LANGUAGE plpgsql AS $$
DECLARE
  rec public.admin_audit_log%ROWTYPE;
  expected_prev TEXT := NULL;
  expected_hash TEXT;
BEGIN
  FOR rec IN SELECT * FROM public.admin_audit_log ORDER BY id ASC LOOP
    IF rec.prev_hash IS DISTINCT FROM expected_prev THEN
      RETURN QUERY SELECT rec.id, 'prev_hash no coincide con el row_hash anterior'; RETURN;
    END IF;
    expected_hash := encode(extensions.digest(coalesce(expected_prev, '') || public.admin_audit_log_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;
