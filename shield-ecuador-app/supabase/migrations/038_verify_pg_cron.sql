DO $$
BEGIN
  RAISE NOTICE 'pg_cron installed: %', (SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'));
END $$;
