-- supabase/migrations/079_email_transport_and_outbox.sql
-- T12.b (REQ-21, SEC-09): transporte de correo configurable desde el panel (D-05) y cola de avisos
-- pendientes cuando el envío falla (REQ-21f). Tres tablas, mismo patrón que módulos ya hechos:
--   * email_transport_settings: versionada, solo INSERT (patrón de 075/privacy_settings).
--   * email_transport_tests: resultado de cada correo de prueba, append-only, sin datos sensibles
--     (ni destinatario ni cuerpo del correo: solo si funcionó y, si no, un código de error estable).
--   * email_outbox: avisos que no se pudieron enviar y quedan pendientes de reintento — sin correo ni
--     datos del titular en la fila, solo una referencia a la tabla/fila de origen (patrón de 078/
--     data_subject_requests: bandera de sesión + una única función para la mutación acotada permitida).
-- RLS activa en las tres; sin acceso para anon/authenticated (solo service_role, como el resto del módulo).

-- ========================================
-- email_transport_settings: configuración versionada del transporte (REQ-21, SEC-09)
-- ========================================
CREATE TABLE public.email_transport_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transport_version INT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('resend', 'smtp')),
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL CHECK (char_length(from_email) <= 254 AND from_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  -- Solo relevantes en modo 'smtp'; en 'resend' la clave vive en app_secrets (mismo patrón que
  -- championship-draw-round1/check-security-alerts, reutilizado por ResendSender de T12.a).
  smtp_host TEXT,
  smtp_port INT CHECK (smtp_port IS NULL OR smtp_port IN (465, 2525)), -- mismo tope que el anti-SSRF de T12.c: 587/25 nunca
  smtp_username TEXT,
  smtp_password_ciphertext JSONB, -- cifrada con crypto.ts (T12.d); nunca se expone en claro ni en texto plano
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (mode = 'resend' AND smtp_host IS NULL AND smtp_port IS NULL AND smtp_username IS NULL AND smtp_password_ciphertext IS NULL)
    OR
    (mode = 'smtp' AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL AND smtp_username IS NOT NULL AND smtp_password_ciphertext IS NOT NULL)
  )
);
ALTER TABLE public.email_transport_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_transport_settings FROM authenticated, anon;

-- La vigente = la de mayor transport_version. security_invoker: respeta los permisos de quien consulta.
CREATE VIEW public.email_transport_settings_current WITH (security_invoker = true) AS
  SELECT * FROM public.email_transport_settings ORDER BY transport_version DESC LIMIT 1;
REVOKE ALL ON public.email_transport_settings_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.email_transport_settings_current TO service_role;

-- Cada guardado es una fila nueva: nunca se actualiza una versión pasada.
CREATE OR REPLACE FUNCTION public.block_email_transport_settings_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'email_transport_settings es de solo inserción: cree una fila nueva en vez de modificar la %', TG_OP;
END; $$;
CREATE TRIGGER email_transport_settings_append_only
  BEFORE UPDATE OR DELETE ON public.email_transport_settings
  FOR EACH ROW EXECUTE FUNCTION public.block_email_transport_settings_mutation();

-- La versión nueva es siempre la siguiente: sin huecos ni saltos, y dos inserciones simultáneas no
-- pueden ganar ambas (mismo mecanismo que privacy_settings en 075).
CREATE OR REPLACE FUNCTION public.enforce_next_email_transport_settings_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE current_max INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('email_transport_settings_version'));
  SELECT coalesce(max(transport_version), 0) INTO current_max FROM public.email_transport_settings;
  IF NEW.transport_version <> current_max + 1 THEN
    RAISE EXCEPTION 'email_transport_settings: la siguiente versión es %, no %', current_max + 1, NEW.transport_version;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER email_transport_settings_next_version BEFORE INSERT ON public.email_transport_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_next_email_transport_settings_version();

-- Placeholder — Resend ya es el modo por defecto en el repo (ver PROGRESS.md, T12.a); actualizar desde
-- el panel (T12.d) antes de publicar el aviso real si el remitente placeholder no sirve. from_email debe
-- ser una dirección válida de verdad (CHECK de la tabla): la nota de "placeholder" va solo en from_name.
INSERT INTO public.email_transport_settings (transport_version, mode, from_name, from_email, created_by)
SELECT 1, 'resend', 'CiberDojo — Club de Ciberseguridad ESPOL (placeholder, actualizar)', 'notificaciones@ciberdojo.example', id
FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;

-- ========================================
-- email_transport_tests: resultado de cada correo de prueba (REQ-21), sin datos sensibles
-- ========================================
-- Ni destinatario ni asunto/cuerpo del correo: solo si funcionó, y si no, un código de error ESTABLE
-- (mismo patrón que ResendSender de T12.a: resend_key_missing/resend_network_error/resend_http_<status>),
-- nunca el mensaje crudo del proveedor (podría filtrar la contraseña SMTP o cabeceras).
CREATE TABLE public.email_transport_tests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transport_version INT NOT NULL REFERENCES public.email_transport_settings(transport_version),
  success BOOLEAN NOT NULL,
  error_code TEXT,
  tested_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (success OR error_code IS NOT NULL)
);
CREATE INDEX email_transport_tests_version ON public.email_transport_tests (transport_version, created_at DESC);
ALTER TABLE public.email_transport_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_transport_tests FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.block_email_transport_tests_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'email_transport_tests es append-only: ninguna función puede modificar una fila existente';
END; $$;
CREATE TRIGGER email_transport_tests_append_only
  BEFORE UPDATE OR DELETE ON public.email_transport_tests
  FOR EACH ROW EXECUTE FUNCTION public.block_email_transport_tests_mutation();

-- ========================================
-- email_outbox: avisos pendientes cuando el envío falla (REQ-21f)
-- ========================================
-- Sin correo ni datos del titular en la fila: solo una referencia a la tabla/fila de origen (p. ej.
-- data_subject_requests + su id) — quien procese la cola vuelve a leer los datos reales desde allí, con
-- los mismos permisos de siempre, en vez de duplicarlos aquí sin necesidad.
CREATE TABLE public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_table TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);
CREATE INDEX email_outbox_pending ON public.email_outbox (created_at) WHERE status = 'pending';
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM authenticated, anon;

-- Mismo patrón que data_subject_requests (078): una bandera de sesión, activada solo dentro de
-- mark_email_outbox_sent(), es la única forma de tocar una fila existente; nunca se borra (el historial
-- de avisos pendientes/enviados queda, lo reutilizará T12.d para el contador que ve el panel).
CREATE OR REPLACE FUNCTION public.block_email_outbox_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'email_outbox: no se puede borrar un aviso, solo marcarlo enviado';
  END IF;
  IF coalesce(current_setting('app.allow_email_outbox_update', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'email_outbox: solo mark_email_outbox_sent() puede tocar una fila existente';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'sent_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'sent_at') THEN
    RAISE EXCEPTION 'email_outbox: aun con la bandera solo se pueden cambiar status y sent_at';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER email_outbox_restrict_update
  BEFORE UPDATE OR DELETE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.block_email_outbox_mutation();

CREATE OR REPLACE FUNCTION public.mark_email_outbox_sent(p_outbox_id UUID)
RETURNS public.email_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE after_row public.email_outbox;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE id = p_outbox_id) THEN
    RAISE EXCEPTION 'mark_email_outbox_sent: el aviso % no existe', p_outbox_id;
  END IF;
  PERFORM set_config('app.allow_email_outbox_update', 'on', true);
  UPDATE public.email_outbox SET status = 'sent', sent_at = now()
    WHERE id = p_outbox_id RETURNING * INTO after_row;
  PERFORM set_config('app.allow_email_outbox_update', 'off', true);
  RETURN after_row;
END; $$;
REVOKE ALL ON FUNCTION public.mark_email_outbox_sent(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_outbox_sent(UUID) TO service_role;
