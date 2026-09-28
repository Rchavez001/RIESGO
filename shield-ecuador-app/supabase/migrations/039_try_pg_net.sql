CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  RAISE NOTICE 'pg_net installed: %', (SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'));
END $$;
