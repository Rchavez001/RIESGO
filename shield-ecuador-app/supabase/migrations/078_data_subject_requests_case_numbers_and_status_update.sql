-- T08: next_case_number() usaba una secuencia global (el prefijo cambiaba de año, pero el número nunca
-- se reiniciaba) y data_subject_requests no tenía ninguna vía controlada de actualización — la tabla
-- nace sin ningún camino de UPDATE (REVOKE ALL en 073), así que hoy ningún caso puede cambiar de estado.

-- ========================================
-- Numeración de casos secuencial POR AÑO (REQ-10/11)
-- ========================================
CREATE TABLE public.data_subject_request_counters (
  year INT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);
ALTER TABLE public.data_subject_request_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_subject_request_counters FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.next_case_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE y INT := extract(year from now())::int; n INT;
BEGIN
  INSERT INTO public.data_subject_request_counters (year, last_number) VALUES (y, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = public.data_subject_request_counters.last_number + 1
    RETURNING last_number INTO n;
  RETURN 'CD-' || y || '-' || lpad(n::text, 6, '0');
END; $$;

DROP SEQUENCE IF EXISTS public.data_subject_request_seq;

-- ========================================
-- Actualización acotada de data_subject_requests, con bitácora (REQ-10/16)
-- ========================================
-- Igual que consent_records: una bandera de sesión, activada solo dentro de la función de abajo, es la
-- única forma de tocar una fila existente; y aun con ella, solo pueden cambiar 3 columnas concretas.
CREATE OR REPLACE FUNCTION public.block_data_subject_request_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data_subject_requests: no se puede borrar un caso, solo cambiar su estado';
  END IF;
  IF coalesce(current_setting('app.allow_case_status_update', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'data_subject_requests: solo update_data_subject_request_status() puede tocar una fila existente';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'resolved_at' - 'resolution_note_ciphertext')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'resolved_at' - 'resolution_note_ciphertext') THEN
    RAISE EXCEPTION 'data_subject_requests: aun con la bandera solo se pueden cambiar status, resolved_at y resolution_note_ciphertext';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER data_subject_requests_restrict_update
  BEFORE UPDATE OR DELETE ON public.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_data_subject_request_mutation();

CREATE OR REPLACE FUNCTION public.update_data_subject_request_status(
  p_request_id UUID, p_actor_id UUID, p_actor_email_hmac TEXT, p_actor_role TEXT,
  p_new_status TEXT, p_resolution_note_ciphertext JSONB DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS public.data_subject_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_status TEXT; after_row public.data_subject_requests;
BEGIN
  SELECT status INTO before_status FROM public.data_subject_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_data_subject_request_status: la solicitud % no existe', p_request_id;
  END IF;

  PERFORM set_config('app.allow_case_status_update', 'on', true);
  UPDATE public.data_subject_requests
    SET status = p_new_status,
        resolved_at = CASE WHEN p_new_status IN ('atendida', 'rechazada_con_motivo') THEN now() ELSE resolved_at END,
        resolution_note_ciphertext = COALESCE(p_resolution_note_ciphertext, resolution_note_ciphertext)
    WHERE id = p_request_id
    RETURNING * INTO after_row;
  PERFORM set_config('app.allow_case_status_update', 'off', true);

  INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after, reason)
  VALUES (p_actor_id, p_actor_email_hmac, p_actor_role, 'data_subject_request.status_changed', 'data_subject_requests',
          after_row.case_number, jsonb_build_object('status', before_status),
          jsonb_build_object('status', after_row.status, 'resolved_at', after_row.resolved_at), p_reason);

  RETURN after_row;
END; $$;

REVOKE ALL ON FUNCTION public.update_data_subject_request_status(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_data_subject_request_status(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
