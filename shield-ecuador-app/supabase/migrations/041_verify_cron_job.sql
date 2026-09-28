DO $$
DECLARE
  job_count INT;
  job_row RECORD;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'news-agent-dispatcher';
  RAISE NOTICE 'news-agent-dispatcher job count: %', job_count;
  FOR job_row IN SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'news-agent-dispatcher' LOOP
    RAISE NOTICE 'job: id=% schedule=% active=%', job_row.jobid, job_row.schedule, job_row.active;
  END LOOP;
END $$;
