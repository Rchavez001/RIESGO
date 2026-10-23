-- supabase/migrations/084_consent_records_legacy_ip_hmac_nullable.sql
-- T25 (D-11, opción 1-A): el backfill de consentimiento legacy no tiene ninguna IP real que
-- registrar (el consentimiento anterior, 2026-06-22, no guardó IP ni agente) — sin este cambio,
-- `ip_hmac NOT NULL` (073) obligaría a inventar un valor. No se edita la 073.
--
-- Las filas NUEVAS (cualquier `document_version` que no empiece con "legacy-") siguen exigiendo
-- `ip_hmac`: el CHECK solo abre la excepción para filas legacy, nunca para el resto del módulo.

ALTER TABLE public.consent_records ALTER COLUMN ip_hmac DROP NOT NULL;

ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_ip_hmac_legacy_check
  CHECK (ip_hmac IS NOT NULL OR document_version LIKE 'legacy-%');
