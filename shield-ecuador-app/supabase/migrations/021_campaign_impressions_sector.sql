-- Snapshot the viewer's sector on each impression, so the admin dashboard
-- can break down "how many times was this campaign shown" per sector
-- (needed for sponsor reporting), the same way app_entry_log already
-- snapshots sector for entry-traffic reporting.

ALTER TABLE public.campaign_impressions
  ADD COLUMN IF NOT EXISTS sector TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_impressions_sector_time
  ON public.campaign_impressions(sector, shown_at);

COMMENT ON COLUMN public.campaign_impressions.sector IS
  'Viewer sector snapshot at impression time (NULL = viewer matches all sectors). Used for the admin sector drill-down report.';
