-- Donation-driven campaign priority: sponsors donate once ("unica") or on a
-- recurring basis ("continua", with a period in months), and the USD amount
-- they gave falls into one of 4 tiers. Higher tiers should be shown more
-- often, in direct proportion to their tier number; tier 1 is the lowest
-- priority and only catches up once the higher tiers have had their turns.
-- Same-tier campaigns targeting the same sector alternate with each other.
--
-- The USD brackets and the frequency weight per tier are kept in their own
-- table (not hardcoded in the selection function) so an admin can retune
-- them later without a code deploy.

ALTER TABLE public.central_admin_campaigns
  ADD COLUMN IF NOT EXISTS donation_type TEXT NOT NULL DEFAULT 'unica' CHECK (donation_type IN ('unica', 'continua')),
  ADD COLUMN IF NOT EXISTS donation_period_months INT CHECK (donation_period_months IS NULL OR donation_period_months > 0),
  ADD COLUMN IF NOT EXISTS value_tier SMALLINT NOT NULL DEFAULT 1 CHECK (value_tier BETWEEN 1 AND 4);

ALTER TABLE public.central_admin_campaigns
  DROP CONSTRAINT IF EXISTS central_admin_campaigns_donation_period_check;
ALTER TABLE public.central_admin_campaigns
  ADD CONSTRAINT central_admin_campaigns_donation_period_check
  CHECK (
    (donation_type = 'continua' AND donation_period_months IS NOT NULL)
    OR (donation_type = 'unica' AND donation_period_months IS NULL)
  );

-- ========================================
-- TABLE: central_admin_campaign_tier_weights (parametrizable USD brackets + weight)
-- ========================================
CREATE TABLE IF NOT EXISTS public.central_admin_campaign_tier_weights (
  value_tier SMALLINT PRIMARY KEY CHECK (value_tier BETWEEN 1 AND 4),
  min_usd NUMERIC NOT NULL CHECK (min_usd >= 0),
  max_usd NUMERIC CHECK (max_usd IS NULL OR max_usd >= min_usd),
  weight NUMERIC NOT NULL CHECK (weight > 0),
  label TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.central_admin_campaign_tier_weights (value_tier, min_usd, max_usd, weight, label) VALUES
  (1, 0,   50,   1, '0 a 50 USD'),
  (2, 51,  100,  2, '51 a 100 USD'),
  (3, 101, 500,  3, '101 a 500 USD'),
  (4, 501, NULL, 4, '501 USD en adelante')
ON CONFLICT (value_tier) DO NOTHING;

DROP TRIGGER IF EXISTS touch_central_admin_campaign_tier_weights_updated_at ON public.central_admin_campaign_tier_weights;
CREATE TRIGGER touch_central_admin_campaign_tier_weights_updated_at
  BEFORE UPDATE ON public.central_admin_campaign_tier_weights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.central_admin_campaign_tier_weights ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.central_admin_campaign_tier_weights TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaign_tier_weights' AND policyname = 'Admins can manage tier weights'
  ) THEN
    CREATE POLICY "Admins can manage tier weights"
      ON public.central_admin_campaign_tier_weights FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ========================================
-- RPC: pick the next campaign to show this user for a given moment.
--
-- Each eligible campaign's "fair-share ratio" is how many times it has
-- already been shown to this user, divided by its tier weight. Picking the
-- lowest ratio (oldest/least-shown as tiebreak) means:
--   - a tier-4 campaign (weight 4) gets picked ~4x as often as a tier-1
--     campaign (weight 1), tier-3 ~3x as often, tier-2 ~2x as often.
--   - a tier-1 campaign only reaches the front of the queue once the
--     higher tiers have already had several turns (its ratio grows
--     fastest per showing).
--   - two campaigns with equal weight (same tier) simply alternate, since
--     showing one raises its ratio above the other's.
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
  LEFT JOIN public.central_admin_campaign_tier_weights w ON w.value_tier = c.value_tier
  LEFT JOIN (
    SELECT campaign_id, COUNT(*) AS shown_count, MAX(shown_at) AS last_shown_at
    FROM public.campaign_impressions
    WHERE user_id = caller
    GROUP BY campaign_id
  ) i ON i.campaign_id = c.id
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
  ORDER BY
    COALESCE(i.shown_count, 0)::NUMERIC / COALESCE(w.weight, 1) ASC,
    i.last_shown_at ASC NULLS FIRST,
    c.created_at ASC
  LIMIT 1;

  RETURN picked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_campaign_for_user(TEXT) TO authenticated;
