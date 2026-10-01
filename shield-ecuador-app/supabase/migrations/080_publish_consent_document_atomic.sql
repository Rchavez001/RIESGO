-- supabase/migrations/080_publish_consent_document_atomic.sql
-- T14 fix (nota pendiente de T06, iteración 19, PROGRESS.md): admin-consent publicaba una versión
-- retirando la vigente y publicando el borrador con DOS llamadas UPDATE separadas (PostgREST ejecuta
-- cada llamada como su propia transacción). La restricción DEFERRABLE INITIALLY DEFERRED de 077
-- (consent_documents_no_gap_on_retire) se comprueba al COMMIT de CADA llamada por separado: el primer
-- UPDATE (retirar la vigente) siempre fallaba en cuanto existía una versión publicada — verificado
-- contra un Postgres real antes de esta migración (ver PROGRESS.md), no es un caso borde.
--
-- Esta función mueve retirar + publicar + bitácora a UNA sola transacción real, mismo patrón que
-- update_data_subject_request_status (078) y mark_email_outbox_sent (079): SECURITY DEFINER, solo
-- service_role puede ejecutarla (REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ...
-- TO service_role) — la conexión de admin-consent usa la service role, nunca el JWT del admin
-- directamente, así que la función NO puede leer auth.jwt()/auth.uid() del llamante real; identidad,
-- rol, aal2 y motivo llegan como parámetros explícitos desde el edge function (que ya los verificó vía
-- requireRole) y esta función los vuelve a comprobar por su cuenta — defensa en profundidad, no confía
-- ciegamente en lo que ya se validó en TypeScript.
CREATE OR REPLACE FUNCTION public.publish_consent_document(
  p_draft_id UUID, p_actor_id UUID, p_actor_role TEXT, p_actor_aal TEXT, p_actor_email_hmac TEXT, p_reason TEXT
) RETURNS public.consent_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  draft public.consent_documents;
  previously_published public.consent_documents;
  published_row public.consent_documents;
  settings_row RECORD;
  reason_trimmed TEXT := btrim(coalesce(p_reason, ''));
BEGIN
  IF p_actor_aal IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'mfa_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = p_actor_id AND role = 'privacy_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF reason_trimmed = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO draft FROM public.consent_documents WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF draft.status <> 'draft' THEN
    RAISE EXCEPTION 'not_draft';
  END IF;

  SELECT settings_version, four_eyes_publish INTO settings_row FROM public.privacy_settings_current;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  IF settings_row.four_eyes_publish AND coalesce(draft.updated_by, draft.created_by) = p_actor_id THEN
    RAISE EXCEPTION 'four_eyes_required';
  END IF;

  -- Candado consultivo (mismo patrón que enforce_next_privacy_settings_version, 075): un `SELECT ...
  -- FOR UPDATE WHERE status = 'published'` NO basta para serializar dos publicaciones simultáneas —
  -- si la fila que bloqueaba deja de cumplir el predicado (la retira la otra transacción), Postgres no
  -- vuelve a buscar una fila nueva que SÍ lo cumpla; cada transacción puede terminar creyendo que no hay
  -- nada publicado y las dos intentan publicar la suya, violando `consent_documents_one_published`
  -- (reproducido con dos llamadas paralelas reales antes de este candado, ver PROGRESS.md). El candado
  -- consultivo serializa TODA la función entre publicaciones concurrentes, sin ese hueco.
  PERFORM pg_advisory_xact_lock(hashtext('consent_documents_published'));
  SELECT * INTO previously_published FROM public.consent_documents WHERE status = 'published' FOR UPDATE;

  IF FOUND THEN
    UPDATE public.consent_documents SET status = 'retired', retired_by = p_actor_id, retired_at = now()
      WHERE id = previously_published.id RETURNING * INTO previously_published;
  END IF;

  UPDATE public.consent_documents SET status = 'published', published_by = p_actor_id, published_at = now()
    WHERE id = p_draft_id RETURNING * INTO published_row;

  -- En la misma transacción: si esta inserción falla (p. ej. la cadena de admin_audit_log), Postgres
  -- revierte TODO (retiro + publicación incluidos) sin necesidad de ningún UPDATE compensatorio manual.
  INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after, reason)
  VALUES (p_actor_id, p_actor_email_hmac, p_actor_role, 'consent_document.publish', 'consent_documents', p_draft_id::text,
          CASE WHEN previously_published.id IS NOT NULL THEN to_jsonb(previously_published) ELSE NULL END,
          to_jsonb(published_row), reason_trimmed);

  RETURN published_row;
END; $$;

REVOKE ALL ON FUNCTION public.publish_consent_document(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_consent_document(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
