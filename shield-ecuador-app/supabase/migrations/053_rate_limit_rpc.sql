-- RF-02: atomic sliding-window rate limit check. Records the hit and
-- returns whether the caller is now over the limit, in one round trip
-- (avoids a check-then-insert race between concurrent requests).
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_bucket_key TEXT, p_window_seconds INT, p_max_hits INT)
RETURNS BOOLEAN -- true = allowed, false = over the limit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit_count INT;
BEGIN
  INSERT INTO public.security_rate_limit_hits (bucket_key) VALUES (p_bucket_key);

  SELECT COUNT(*) INTO hit_count
  FROM public.security_rate_limit_hits
  WHERE bucket_key = p_bucket_key
    AND hit_at > NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Housekeeping: opportunistically prune this bucket's own old hits so the
  -- table doesn't grow unbounded — cheap since it only touches rows this
  -- call already scanned.
  DELETE FROM public.security_rate_limit_hits
  WHERE bucket_key = p_bucket_key
    AND hit_at <= NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  RETURN hit_count <= p_max_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
