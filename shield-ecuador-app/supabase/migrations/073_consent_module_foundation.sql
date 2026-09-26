-- supabase/migrations/073_consent_module_foundation.sql
-- Consentimiento Informado — Fase 0 (esquema, roles, cadenas de integridad).
-- Ver SPEC "Módulo de Consentimiento Informado y Derechos del Titular" v1.0.

-- ========================================
-- admin_roles: identidad individual para este módulo (D-01)
-- ========================================
CREATE TABLE public.admin_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('privacy_editor', 'privacy_admin', 'privacy_auditor')),
  granted_by UUID REFERENCES public.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_roles_self_read ON public.admin_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.admin_roles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.has_privacy_role(required_role TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND role = required_role);
$$;
GRANT EXECUTE ON FUNCTION public.has_privacy_role(TEXT) TO authenticated;

-- ========================================
-- privacy_settings: configuración versionada (REQ-14/15)
-- ========================================
CREATE TABLE public.privacy_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settings_version INT NOT NULL UNIQUE,
  controller_name TEXT,
  controller_address TEXT,
  controller_phone TEXT,
  privacy_email TEXT NOT NULL,
  privacy_email_pending TEXT,
  privacy_email_code_hash TEXT,
  privacy_email_code_expires_at TIMESTAMPTZ,
  dpo_name TEXT,
  dpo_contact TEXT,
  unsubscribe_subject TEXT NOT NULL DEFAULT 'Solicitud de baja y eliminación de datos - CiberDojo',
  response_days INT NOT NULL DEFAULT 15 CHECK (response_days BETWEEN 1 AND 90),
  response_day_type TEXT NOT NULL DEFAULT 'calendario' CHECK (response_day_type IN ('calendario', 'habiles')),
  ip_retention_days INT NOT NULL DEFAULT 730 CHECK (ip_retention_days >= 0),
  evidence_retention_days INT NOT NULL DEFAULT 1825 CHECK (evidence_retention_days >= 0), -- D-02: 5 años tras baja atendida
  privacy_policy_url TEXT,
  four_eyes_publish BOOLEAN NOT NULL DEFAULT false,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX privacy_settings_one_current ON public.privacy_settings (is_current) WHERE is_current;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_settings FROM authenticated, anon;

-- Cada guardado es una fila nueva (REQ-14): nunca se actualiza una versión pasada.
CREATE OR REPLACE FUNCTION public.block_privacy_settings_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'privacy_settings es de solo inserción: cree una fila nueva en vez de modificar la %', TG_OP;
END; $$;
CREATE TRIGGER privacy_settings_append_only
  BEFORE UPDATE OR DELETE ON public.privacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.block_privacy_settings_mutation();

-- Placeholder — actualizar desde el panel (Fase 3) antes de publicar el aviso real.
INSERT INTO public.privacy_settings (settings_version, controller_name, privacy_email, dpo_contact, created_by, is_current)
SELECT 1, 'CiberDojo — Club de Ciberseguridad ESPOL (placeholder, actualizar)', 'privacidad@ciberdojo.example (placeholder)',
       'placeholder', id, true
FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;

-- ========================================
-- consent_documents: aviso versionado (REQ-01/02/03)
-- ========================================
CREATE TABLE public.consent_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL CHECK (char_length(content_md) <= 100000),
  content_sha256 TEXT NOT NULL,
  purposes JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  requires_reconsent BOOLEAN NOT NULL DEFAULT false,
  change_summary TEXT,
  based_on_id UUID REFERENCES public.consent_documents(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.users(id),
  published_at TIMESTAMPTZ,
  retired_by UUID REFERENCES public.users(id),
  retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX consent_documents_one_published ON public.consent_documents (status) WHERE status = 'published';
ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_documents_published_public ON public.consent_documents
  FOR SELECT USING (status = 'published');
REVOKE INSERT, UPDATE, DELETE ON public.consent_documents FROM authenticated, anon;

-- Una versión publicada o retirada es inmutable en su contenido (REQ-01).
CREATE OR REPLACE FUNCTION public.enforce_consent_document_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.content_md IS DISTINCT FROM OLD.content_md OR
    NEW.purposes IS DISTINCT FROM OLD.purposes OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
  ) THEN
    RAISE EXCEPTION 'consent_documents: una versión % ya no es un borrador; clone un nuevo borrador en vez de editarla', OLD.status;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER consent_documents_immutable
  BEFORE UPDATE ON public.consent_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_consent_document_immutability();

-- ========================================
-- consent_records: evidencia append-only con cadena de hash (REQ-04)
-- ========================================
CREATE TABLE public.consent_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_ref_hmac TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES public.consent_documents(id),
  document_version TEXT NOT NULL,
  rendered_sha256 TEXT NOT NULL,
  settings_version INT NOT NULL,
  purpose_code TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'denied', 'revoked')),
  channel TEXT NOT NULL CHECK (channel IN ('registro', 'reconsentimiento', 'mi_privacidad', 'correo', 'admin')),
  ip_ciphertext JSONB,
  ip_hmac TEXT NOT NULL,
  ua_ciphertext JSONB,
  ua_hmac TEXT,
  key_version INT NOT NULL,
  server_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash TEXT,
  row_hash TEXT NOT NULL
);
CREATE INDEX consent_records_user_purpose ON public.consent_records (user_id, purpose_code, server_ts DESC);
CREATE INDEX consent_records_ip_hmac ON public.consent_records (ip_hmac);
CREATE INDEX consent_records_user_ref_hmac ON public.consent_records (user_ref_hmac);
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_records_self_read ON public.consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.consent_records FROM authenticated, anon;
-- El usuario ve su propio historial (REQ-08) pero nunca ip/ua, ni siquiera cifrada.
GRANT SELECT (id, user_id, document_id, document_version, purpose_code, decision, channel, server_ts)
  ON public.consent_records TO authenticated;

CREATE OR REPLACE FUNCTION public.consent_record_canonical(rec public.consent_records)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  -- Claves en orden alfabético a propósito: la canonicalización debe ser
  -- determinista para que verify_consent_chain() recalcule el mismo hash.
  SELECT (to_jsonb(rec) - 'row_hash')::text;
$$;

CREATE OR REPLACE FUNCTION public.consent_records_chain_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('consent_records_chain'));
  SELECT row_hash INTO last_hash FROM public.consent_records ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(digest(coalesce(last_hash, '') || public.consent_record_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;
CREATE TRIGGER consent_records_chain BEFORE INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_chain_trigger();

CREATE OR REPLACE FUNCTION public.block_consent_records_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.allow_evidence_mutation', true), 'off') = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'consent_records es append-only: solo la función de retención puede tocar una fila existente';
END; $$;
CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE OR DELETE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.block_consent_records_mutation();

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
    expected_hash := encode(digest(coalesce(expected_prev, '') || public.consent_record_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;

-- Vista de conveniencia para "Mi privacidad" (REQ-08): último estado por finalidad, sin ip/ua.
CREATE VIEW public.my_consent_state
WITH (security_invoker = true) AS
SELECT DISTINCT ON (purpose_code) id, document_id, document_version, purpose_code, decision, channel, server_ts
FROM public.consent_records
WHERE user_id = auth.uid()
ORDER BY purpose_code, server_ts DESC;
GRANT SELECT ON public.my_consent_state TO authenticated;

-- ========================================
-- admin_audit_log: bitácora append-only con cadena de hash (REQ-16)
-- ========================================
CREATE TABLE public.admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email_hmac TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  diff TEXT,
  reason TEXT,
  ip_ciphertext JSONB,
  ip_hmac TEXT,
  key_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash TEXT,
  row_hash TEXT NOT NULL
);
CREATE INDEX admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_action ON public.admin_audit_log (action, created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_audit_log_canonical(rec public.admin_audit_log)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (to_jsonb(rec) - 'row_hash')::text;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit_log_chain_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_log_chain'));
  SELECT row_hash INTO last_hash FROM public.admin_audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := encode(digest(coalesce(last_hash, '') || public.admin_audit_log_canonical(NEW), 'sha256'), 'hex');
  RETURN NEW;
END; $$;
CREATE TRIGGER admin_audit_log_chain BEFORE INSERT ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_chain_trigger();

CREATE OR REPLACE FUNCTION public.block_admin_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log es append-only: no existe ninguna función que pueda modificar una fila existente';
END; $$;
CREATE TRIGGER admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_admin_audit_log_mutation();

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
    expected_hash := encode(digest(coalesce(expected_prev, '') || public.admin_audit_log_canonical(rec), 'sha256'), 'hex');
    IF rec.row_hash IS DISTINCT FROM expected_hash THEN
      RETURN QUERY SELECT rec.id, 'row_hash no coincide con el contenido de la fila'; RETURN;
    END IF;
    expected_prev := rec.row_hash;
  END LOOP;
  RETURN;
END; $$;

-- ========================================
-- data_subject_requests: casos de derechos (REQ-10/11)
-- ========================================
CREATE TABLE public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email_ciphertext JSONB,
  email_hmac TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN
    ('baja', 'acceso', 'rectificacion', 'eliminacion', 'oposicion', 'suspension', 'portabilidad', 'revocacion', 'decision_automatizada')),
  details_ciphertext JSONB,
  channel TEXT NOT NULL CHECK (channel IN ('app', 'correo')),
  status TEXT NOT NULL DEFAULT 'recibida' CHECK (status IN
    ('recibida', 'requiere_aclaracion', 'en_proceso', 'atendida', 'rechazada_con_motivo')),
  routed_to_email TEXT NOT NULL,
  settings_version INT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note_ciphertext JSONB,
  ip_ciphertext JSONB,
  ip_hmac TEXT,
  key_version INT
);
CREATE INDEX data_subject_requests_status_due ON public.data_subject_requests (status, due_at);
CREATE INDEX data_subject_requests_email_hmac ON public.data_subject_requests (email_hmac);
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_subject_requests FROM authenticated, anon;
-- Sin políticas para anon/authenticated a propósito: se crea y se lee solo vía
-- las Edge Functions (service role) de las Fases 2 y 3, nunca directo del cliente.

-- ========================================
-- Case number legible: CD-2026-000123
-- ========================================
CREATE SEQUENCE public.data_subject_request_seq;
CREATE OR REPLACE FUNCTION public.next_case_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'CD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.data_subject_request_seq')::text, 6, '0');
$$;
