-- supabase/migrations/083_guest_consent_notice_and_session_expiry.sql
-- T19b Paso 2B (D-12 opción B, D-16 opción A): evidencia del aviso breve de invitados y
-- caducidad de la sesión anónima. No se edita la 073: se amplía su CHECK de `channel`.

-- ========================================
-- 1) consent_records.channel admite 'invitado' (aviso breve antes de signInAnonymously())
-- ========================================
ALTER TABLE public.consent_records DROP CONSTRAINT consent_records_channel_check;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_channel_check
  CHECK (channel IN ('registro', 'reconsentimiento', 'mi_privacidad', 'correo', 'admin', 'invitado'));

-- ========================================
-- 2) Caducidad de la sesión anónima (D-12/T19b): no había caducidad ni limpieza (hallazgo de
-- T19b Paso 1). 24 horas es un valor por defecto razonable para esta entrega, no una decisión
-- legal; la persona responsable puede ajustarlo cambiando el intervalo de abajo.
-- `auth.users.id` es la PK que referencian `learning_progress`/`learning_attempts` (ON DELETE
-- CASCADE) y `consent_records.user_id` (ON DELETE SET NULL, conserva la evidencia). Borrar la
-- fila de auth.users es lo único que de verdad termina la sesión anónima (revoca sus refresh
-- tokens) y limpia su progreso sin tocar la evidencia de consentimiento ya registrada.
CREATE OR REPLACE FUNCTION public.cleanup_expired_guest_sessions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth.users WHERE is_anonymous = true AND created_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END; $$;

-- pg_cron no existe en el Postgres efímero de `gates.sh` (imagen `postgres:16` simple, sin la
-- extensión que sí está instalada en el proyecto hospedado desde las migraciones 037/038): se
-- agenda solo si la extensión está presente, para no romper la puerta `sql-ciclo-de-vida`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-guest-sessions-hourly', '0 * * * *', $cron$SELECT public.cleanup_expired_guest_sessions();$cron$);
  END IF;
END $$;
