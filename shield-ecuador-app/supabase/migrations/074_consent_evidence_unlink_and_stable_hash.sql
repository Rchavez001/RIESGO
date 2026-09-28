-- supabase/migrations/074_consent_evidence_unlink_and_stable_hash.sql
-- Corrige dos defectos de 073 encontrados probando en un Postgres real (REQ-19/REQ-20):
--  1. consent_records.user_id era ON DELETE SET NULL: ese UPDATE implícito dispara el trigger
--     append-only, así que borrar a un usuario con evidencia FALLABA (una baja no se podía atender).
--  2. row_hash incluía user_id, ip_ciphertext y ua_ciphertext, exactamente las columnas que la
--     retención (REQ-19) y la baja (REQ-20) ponen en NULL a propósito: cada retención o baja
--     habría roto verify_consent_chain().
-- Ahora: el hash no cubre esas tres columnas (sí user_ref_hmac, ip_hmac y ua_hmac, que no cambian);
-- no hay cascada, y la desvinculación tras una baja la hace una función SECURITY DEFINER con la
-- bandera de sesión y registro en bitácora. Orden de una baja: unlink_user_consent_evidence() y
-- después borrar al usuario.

-- El cambio de canonicalización NO reescribe filas existentes (son append-only): solo es seguro
-- mientras no haya evidencia. Si algún día se aplica con filas, hace falta una migración de re-hash.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.consent_records) THEN
    RAISE EXCEPTION '074 cambia la canonicalización del row_hash y consent_records ya tiene evidencia: se necesita una migración de re-hash, no esta';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.consent_record_canonical(rec public.consent_records)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (to_jsonb(rec) - 'row_hash' - 'user_id' - 'ip_ciphertext' - 'ua_ciphertext')::text;
$$;

ALTER TABLE public.consent_records DROP CONSTRAINT consent_records_user_id_fkey;
ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE NO ACTION;

-- Mismo defecto en la bitácora: borrar a un administrador con historial fallaba por el trigger.
-- Un administrador con historial se desactiva, no se borra.
ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_actor_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE NO ACTION;

-- Con la bandera de sesión solo puede cambiar lo que está diseñado para cambiar, y solo hacia NULL:
-- antes la bandera permitía reescribir cualquier columna.
CREATE OR REPLACE FUNCTION public.block_consent_records_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.allow_evidence_mutation', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'consent_records es append-only: solo la función de retención o de baja puede tocar una fila existente';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF (to_jsonb(NEW) - 'user_id' - 'ip_ciphertext' - 'ua_ciphertext') IS DISTINCT FROM (to_jsonb(OLD) - 'user_id' - 'ip_ciphertext' - 'ua_ciphertext')
     OR (NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
     OR (NEW.ip_ciphertext IS NOT NULL AND NEW.ip_ciphertext IS DISTINCT FROM OLD.ip_ciphertext)
     OR (NEW.ua_ciphertext IS NOT NULL AND NEW.ua_ciphertext IS DISTINCT FROM OLD.ua_ciphertext) THEN
    RAISE EXCEPTION 'consent_records: aun con la bandera solo se puede poner en NULL user_id, ip_ciphertext y ua_ciphertext';
  END IF;
  RETURN NEW;
END; $$;

-- REQ-20: la desvinculación de la persona tras una baja atendida. Lo único que pierde la fila es
-- user_id; user_ref_hmac, la huella del texto, la decisión y la fecha se conservan como evidencia.
CREATE OR REPLACE FUNCTION public.unlink_user_consent_evidence(
  p_user_id UUID, p_actor_id UUID, p_actor_email_hmac TEXT, p_actor_role TEXT, p_reason TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  unlinked INT;
  ref TEXT;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'unlink_user_consent_evidence: el motivo es obligatorio';
  END IF;

  SELECT min(user_ref_hmac) INTO ref FROM public.consent_records WHERE user_id = p_user_id;

  PERFORM set_config('app.allow_evidence_mutation', 'on', true);
  UPDATE public.consent_records SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS unlinked = ROW_COUNT;
  PERFORM set_config('app.allow_evidence_mutation', 'off', true);

  -- entity_id es el seudónimo (user_ref_hmac), no el id de la persona: la bitácora es permanente.
  INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, after, reason)
  VALUES (p_actor_id, p_actor_email_hmac, p_actor_role, 'consent.unlink_user', 'consent_records', ref,
          jsonb_build_object('rows_unlinked', unlinked), p_reason);

  RETURN unlinked;
END; $$;

REVOKE ALL ON FUNCTION public.unlink_user_consent_evidence(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_user_consent_evidence(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
