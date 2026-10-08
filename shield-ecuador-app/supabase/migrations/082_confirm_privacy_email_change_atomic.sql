-- supabase/migrations/082_confirm_privacy_email_change_atomic.sql
-- T15.a (REQ-14/15): confirmar el cambio de correo de privacidad exige marcar
-- `privacy_email_verifications.confirmed_at` Y, en la misma transacción, insertar la siguiente versión
-- de `privacy_settings` con el correo nuevo. Dos llamadas PostgREST sueltas desde `admin-consent` NO
-- bastan (mismo defecto que arregló 080 para `publish_consent_document`: cada llamada de supabase-js es
-- su propia transacción). `settings_versioning.sql` ya probó la mecánica de tablas a mano con un
-- `DO $$ … $$` en una sola sesión psql (test 8); esta función es el envoltorio que `admin-consent`
-- puede invocar con UNA sola llamada.
--
-- El incremento de `attempts` por código incorrecto NO vive aquí a propósito: si viviera, un
-- `RAISE EXCEPTION` por código inválido revertiría también ese UPDATE en la misma transacción. Eso lo
-- hace la Edge Function (T15.c) con un UPDATE de una sola fila/tabla, atómico por sí solo, ANTES de
-- llamar a esta función — que solo se invoca cuando el código ya coincidió. Aquí se vuelve a comprobar
-- el hash como defensa en profundidad (no confía ciegamente en lo que ya validó TypeScript), pero un
-- hash que no coincide en este punto no debería ocurrir en el camino normal.
CREATE OR REPLACE FUNCTION public.confirm_privacy_email_change(
  p_verification_id UUID, p_code_hash TEXT, p_actor_id UUID, p_actor_role TEXT, p_actor_aal TEXT, p_actor_email_hmac TEXT
) RETURNS public.privacy_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  verification public.privacy_email_verifications;
  current_settings public.privacy_settings;
  new_settings public.privacy_settings;
BEGIN
  IF p_actor_aal IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'mfa_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = p_actor_id AND role = 'privacy_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO verification FROM public.privacy_email_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF verification.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_confirmed';
  END IF;
  IF now() > verification.expires_at THEN
    RAISE EXCEPTION 'code_expired';
  END IF;
  IF verification.code_hash <> p_code_hash THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  SELECT * INTO current_settings FROM public.privacy_settings_current;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;

  UPDATE public.privacy_email_verifications SET confirmed_at = now() WHERE id = verification.id;

  -- Copia el resto de la configuración vigente, cambiando solo privacy_email. El trigger
  -- `enforce_next_privacy_settings_version` (075) ya sirve de candado de la versión siguiente; si otra
  -- transacción insertara una versión al mismo tiempo, una de las dos pierde y esta función revierte TODO
  -- (incluida la confirmación de arriba), sin dejar una verificación "confirmada" sin versión nueva —
  -- mismo caso que el test 9 de settings_versioning.sql ya prueba a mano.
  INSERT INTO public.privacy_settings (
    settings_version, controller_name, controller_address, controller_phone, privacy_email,
    dpo_name, dpo_contact, unsubscribe_subject, response_days, response_day_type,
    ip_retention_days, evidence_retention_days, privacy_policy_url, four_eyes_publish, created_by
  ) VALUES (
    current_settings.settings_version + 1, current_settings.controller_name, current_settings.controller_address,
    current_settings.controller_phone, verification.new_email, current_settings.dpo_name, current_settings.dpo_contact,
    current_settings.unsubscribe_subject, current_settings.response_days, current_settings.response_day_type,
    current_settings.ip_retention_days, current_settings.evidence_retention_days, current_settings.privacy_policy_url,
    current_settings.four_eyes_publish, p_actor_id
  ) RETURNING * INTO new_settings;

  INSERT INTO public.admin_audit_log (actor_id, actor_email_hmac, actor_role, action, entity, entity_id, before, after)
  VALUES (p_actor_id, p_actor_email_hmac, p_actor_role, 'privacy_settings.email_confirmed', 'privacy_settings',
          new_settings.settings_version::text, to_jsonb(current_settings), to_jsonb(new_settings));

  RETURN new_settings;
END; $$;

REVOKE ALL ON FUNCTION public.confirm_privacy_email_change(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_privacy_email_change(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
