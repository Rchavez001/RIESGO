-- Lo mínimo de Supabase que necesitan las migraciones 073/074 en un Postgres vacío (solo para pruebas).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ DEFAULT NOW()
);
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Como en Supabase real: service_role tiene BYPASSRLS (así lo usa PostgREST con la clave de servicio).
-- Sin esto, un UPDATE/DELETE directo de service_role sobre una tabla con RLS y sin política para él
-- afecta 0 filas en silencio (RLS lo filtra antes de llegar a la fila) y nunca dispara los triggers
-- append-only: una prueba "service_role no puede mutar evidencia" pasaría por la razón equivocada.
ALTER ROLE service_role BYPASSRLS;
-- Como en Supabase: las tablas nuevas de `public` nacen con todos los privilegios para estos roles; así los REVOKE de las
-- migraciones se prueban de verdad (sin esto, un "permission denied" pasaría aunque la migración no revocara nada).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
INSERT INTO public.users (email, role) VALUES ('admin@test.local', 'admin');
