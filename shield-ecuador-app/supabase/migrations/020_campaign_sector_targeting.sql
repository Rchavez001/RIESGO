-- Sector-targeted campaigns: an ad can target "all sectors" or a specific
-- set of industries, shown one-at-a-time per user (oldest-created first,
-- tracked via an impressions log), plus the tracking tables needed for the
-- admin usage/impression reports.

-- ========================================
-- users.sector: NULL means "matches every sector" (wildcard).
-- Existing/legacy/test accounts are left NULL on purpose so they keep
-- seeing every campaign regardless of targeting.
-- ========================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sector TEXT;

COMMENT ON COLUMN public.users.sector IS
  'Industry/sector snapshot taken from business_sectors.industry at registration time. NULL = matches all sectors (used for legacy/test accounts).';

-- ========================================
-- central_admin_campaigns: sector targeting
-- ========================================
ALTER TABLE public.central_admin_campaigns
  ADD COLUMN IF NOT EXISTS target_all BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS target_sectors TEXT[] NOT NULL DEFAULT '{}';

-- ========================================
-- TABLE: campaign_impressions (per-user ad rotation + reporting)
-- ========================================
CREATE TABLE IF NOT EXISTS public.campaign_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.central_admin_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_impressions_user
  ON public.campaign_impressions(user_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_impressions_campaign_time
  ON public.campaign_impressions(campaign_id, shown_at);

ALTER TABLE public.campaign_impressions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.campaign_impressions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'campaign_impressions' AND policyname = 'Users can log their own impressions'
  ) THEN
    CREATE POLICY "Users can log their own impressions"
      ON public.campaign_impressions FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'campaign_impressions' AND policyname = 'Users can view their own impressions'
  ) THEN
    CREATE POLICY "Users can view their own impressions"
      ON public.campaign_impressions FOR SELECT
      USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ========================================
-- TABLE: app_entry_log (login/session-entry tracking, by sector)
-- ========================================
CREATE TABLE IF NOT EXISTS public.app_entry_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sector TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_entry_log_time
  ON public.app_entry_log(entered_at);
CREATE INDEX IF NOT EXISTS idx_app_entry_log_sector_time
  ON public.app_entry_log(sector, entered_at);

ALTER TABLE public.app_entry_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.app_entry_log TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_entry_log' AND policyname = 'Users can log their own entries'
  ) THEN
    CREATE POLICY "Users can log their own entries"
      ON public.app_entry_log FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_entry_log' AND policyname = 'Users can view their own entries'
  ) THEN
    CREATE POLICY "Users can view their own entries"
      ON public.app_entry_log FOR SELECT
      USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ========================================
-- Campaign visibility now also matches the viewer's sector
-- ========================================
DROP POLICY IF EXISTS "Public can view active campaigns" ON public.central_admin_campaigns;
CREATE POLICY "Users can view campaigns targeted to their sector"
  ON public.central_admin_campaigns FOR SELECT
  USING (
    status = 'activa'
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())
    AND (
      target_all = TRUE
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
        AND (u.sector IS NULL OR u.sector = ANY(target_sectors))
      )
    )
  );

-- ========================================
-- RPC: pick the next campaign to show this user for a given moment,
-- rotating through eligible campaigns oldest-first and skipping ones
-- already shown to them (the "control" of impressions the admin asked for).
-- SECURITY DEFINER so it can read campaign_impressions/users safely while
-- still only ever acting on behalf of the calling authenticated user.
-- ========================================
CREATE OR REPLACE FUNCTION public.get_next_campaign_for_user(p_moment TEXT DEFAULT 'inicio')
RETURNS public.central_admin_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  viewer_sector TEXT;
  picked public.central_admin_campaigns%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT sector INTO viewer_sector FROM public.users WHERE id = caller;

  SELECT c.* INTO picked
  FROM public.central_admin_campaigns c
  WHERE c.status = 'activa'
    AND c.moment = p_moment
    AND c.image_url IS NOT NULL
    AND (c.starts_at IS NULL OR c.starts_at <= NOW())
    AND (c.ends_at IS NULL OR c.ends_at >= NOW())
    AND (
      c.target_all = TRUE
      OR viewer_sector IS NULL
      OR viewer_sector = ANY(c.target_sectors)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_impressions i
      WHERE i.campaign_id = c.id AND i.user_id = caller
    )
  ORDER BY c.created_at ASC
  LIMIT 1;

  -- Everything eligible has already been shown at least once: recycle from
  -- the oldest again rather than showing nothing.
  IF picked.id IS NULL THEN
    SELECT c.* INTO picked
    FROM public.central_admin_campaigns c
    WHERE c.status = 'activa'
      AND c.moment = p_moment
      AND c.image_url IS NOT NULL
      AND (c.starts_at IS NULL OR c.starts_at <= NOW())
      AND (c.ends_at IS NULL OR c.ends_at >= NOW())
      AND (
        c.target_all = TRUE
        OR viewer_sector IS NULL
        OR viewer_sector = ANY(c.target_sectors)
      )
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  RETURN picked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_campaign_for_user(TEXT) TO authenticated;
