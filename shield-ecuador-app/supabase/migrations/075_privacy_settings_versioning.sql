-- supabase/migrations/075_privacy_settings_versioning.sql
-- Corrige un defecto de 073 (REQ-14/15) encontrado probando contra Supabase local:
-- privacy_settings es de solo inserción (trigger que bloquea todo UPDATE) pero exigía UN solo is_current
-- con índice único, así que nunca se podía bajar la marca de la fila vieja y la versión 2 no cabía; y
-- la verificación de correo pendiente (código, vencimiento) vivía en esa misma tabla inmutable.
-- Ahora, sin SECURITY DEFINER ni bypass:
--   * cada cambio de configuración es un INSERT; la versión vigente es la de mayor settings_version;
--   * la verificación del correo de privacidad vive en su propia tabla, esa sí actualizable pero acotada.
-- Orden al confirmar un correo: marcar la verificación confirmada y, en la misma transacción, insertar
-- una versión nueva de privacy_settings con privacy_email = new_email (lo hace la función admin-consent).

-- Los campos que se eliminan nunca los usó ningún código; si hubiera datos, mejor abortar que perderlos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.privacy_settings
             WHERE privacy_email_pending IS NOT NULL OR privacy_email_code_hash IS NOT NULL OR privacy_email_code_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION '075: privacy_settings tiene una verificación de correo pendiente; resuélvela antes de migrar';
  END IF;
END $$;

-- Al borrar is_current cae también su índice único (privacy_settings_one_current).
ALTER TABLE public.privacy_settings
  DROP COLUMN is_current,
  DROP COLUMN privacy_email_pending,
  DROP COLUMN privacy_email_code_hash,
  DROP COLUMN privacy_email_code_expires_at;

-- La vigente = la de mayor settings_version. security_invoker: respeta los permisos de quien consulta.
CREATE VIEW public.privacy_settings_current WITH (security_invoker = true) AS
  SELECT * FROM public.privacy_settings ORDER BY settings_version DESC LIMIT 1;
REVOKE ALL ON public.privacy_settings_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.privacy_settings_current TO service_role;

-- La versión nueva es siempre la siguiente: sin huecos ni saltos, y dos inserciones simultáneas no
-- pueden ganar ambas (la segunda ve la primera, o choca con el UNIQUE de settings_version).
-- Sin esto, un INSERT con una versión enorme pasaría a ser "la vigente" sin más.
CREATE OR REPLACE FUNCTION public.enforce_next_privacy_settings_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_max INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('privacy_settings_version'));
  SELECT coalesce(max(settings_version), 0) INTO current_max FROM public.privacy_settings;
  IF NEW.settings_version <> current_max + 1 THEN
    RAISE EXCEPTION 'privacy_settings: la siguiente versión es %, no %', current_max + 1, NEW.settings_version;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER privacy_settings_next_version BEFORE INSERT ON public.privacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_next_privacy_settings_version();

-- Verificación del nuevo correo de privacidad (REQ-15): código de 6 dígitos guardado como hash, 30 min.
CREATE TABLE public.privacy_email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  new_email TEXT NOT NULL CHECK (char_length(new_email) <= 254 AND new_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  confirmed_at TIMESTAMPTZ,
  requested_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX privacy_email_verifications_requester ON public.privacy_email_verifications (requested_by, created_at DESC);
ALTER TABLE public.privacy_email_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_email_verifications FROM anon, authenticated;
-- Sin políticas para anon/authenticated a propósito: solo la función admin-consent (service role) la toca.

-- Actualizable, pero solo lo que tiene que cambiar: los intentos suben y se confirma una vez, a tiempo.
CREATE OR REPLACE FUNCTION public.guard_privacy_email_verification_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'privacy_email_verifications: una verificación confirmada ya no se modifica';
  END IF;
  IF (NEW.id, NEW.new_email, NEW.code_hash, NEW.expires_at, NEW.requested_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.new_email, OLD.code_hash, OLD.expires_at, OLD.requested_by, OLD.created_at) THEN
    RAISE EXCEPTION 'privacy_email_verifications: solo pueden cambiar attempts y confirmed_at';
  END IF;
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'privacy_email_verifications: los intentos no pueden bajar';
  END IF;
  IF NEW.confirmed_at IS NOT NULL AND now() > OLD.expires_at THEN
    RAISE EXCEPTION 'privacy_email_verifications: el código venció';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER privacy_email_verifications_guard BEFORE UPDATE ON public.privacy_email_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_privacy_email_verification_update();

-- Una verificación confirmada queda como constancia del cambio de correo; solo se pueden limpiar las no confirmadas.
CREATE OR REPLACE FUNCTION public.guard_privacy_email_verification_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'privacy_email_verifications: una verificación confirmada no se borra';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER privacy_email_verifications_no_delete_confirmed BEFORE DELETE ON public.privacy_email_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_privacy_email_verification_delete();
