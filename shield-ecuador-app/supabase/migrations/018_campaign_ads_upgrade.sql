-- Upgrade central_admin_campaigns into real popup-ad campaigns: image + link,
-- a status workflow (activa/suspendida/eliminada), a configurable image-size
-- policy, an audit trail of who/when created or changed a campaign, and a
-- public storage bucket to host the uploaded ad images.

ALTER TABLE public.central_admin_campaigns
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'activa';

UPDATE public.central_admin_campaigns
SET status = CASE WHEN active THEN 'activa' ELSE 'suspendida' END;

ALTER TABLE public.central_admin_campaigns
  DROP CONSTRAINT IF EXISTS central_admin_campaigns_status_check;

ALTER TABLE public.central_admin_campaigns
  ADD CONSTRAINT central_admin_campaigns_status_check
  CHECK (status IN ('activa', 'suspendida', 'eliminada'));

-- Keep the legacy `active` boolean truthful for any reader that still uses it.
CREATE OR REPLACE FUNCTION public.sync_campaign_active_from_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.active := (NEW.status = 'activa');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_central_admin_campaigns_active ON public.central_admin_campaigns;
CREATE TRIGGER sync_central_admin_campaigns_active
  BEFORE INSERT OR UPDATE ON public.central_admin_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_active_from_status();

-- Remove the placeholder/demo campaigns seeded by migration 007.
DELETE FROM public.central_admin_campaigns
WHERE name IN ('Plan de soporte MFA', 'Curso anti-phishing');

DROP POLICY IF EXISTS "Public can view active campaigns" ON public.central_admin_campaigns;
CREATE POLICY "Public can view active campaigns"
  ON public.central_admin_campaigns FOR SELECT
  USING (
    status = 'activa'
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())
  );

-- ========================================
-- TABLE: central_admin_campaign_settings (single-row image validation policy)
-- ========================================
CREATE TABLE IF NOT EXISTS public.central_admin_campaign_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_image_kb INT NOT NULL DEFAULT 500 CHECK (max_image_kb > 0),
  max_image_width INT NOT NULL DEFAULT 1920 CHECK (max_image_width > 0),
  max_image_height INT NOT NULL DEFAULT 1920 CHECK (max_image_height > 0),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.central_admin_campaign_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.central_admin_campaign_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.central_admin_campaign_settings TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaign_settings' AND policyname = 'Admins can manage campaign settings'
  ) THEN
    CREATE POLICY "Admins can manage campaign settings"
      ON public.central_admin_campaign_settings FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ========================================
-- TABLE: central_admin_campaign_audit (who/when created or changed a campaign)
-- ========================================
CREATE TABLE IF NOT EXISTS public.central_admin_campaign_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.central_admin_campaigns(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('creada', 'actualizada', 'estado_cambiado')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_central_admin_campaign_audit_campaign
  ON public.central_admin_campaign_audit(campaign_id, created_at DESC);

ALTER TABLE public.central_admin_campaign_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.central_admin_campaign_audit TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaign_audit' AND policyname = 'Admins can view campaign audit'
  ) THEN
    CREATE POLICY "Admins can view campaign audit"
      ON public.central_admin_campaign_audit FOR SELECT
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'central_admin_campaign_audit' AND policyname = 'Service role can insert campaign audit'
  ) THEN
    CREATE POLICY "Service role can insert campaign audit"
      ON public.central_admin_campaign_audit FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ========================================
-- STORAGE: public bucket for uploaded ad images
-- ========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-ads', 'campaign-ads', true)
ON CONFLICT (id) DO NOTHING;
