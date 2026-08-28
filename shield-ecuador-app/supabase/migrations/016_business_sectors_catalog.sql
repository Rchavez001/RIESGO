-- Administrable business sector catalog for user registration.

CREATE TABLE IF NOT EXISTS public.business_sectors (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  label TEXT NOT NULL CHECK (length(trim(label)) >= 2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS touch_business_sectors_updated_at ON public.business_sectors;
CREATE TRIGGER touch_business_sectors_updated_at
  BEFORE UPDATE ON public.business_sectors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.business_sectors (code, label, active, display_order)
VALUES
  ('comerciante', 'Comerciante', TRUE, 10),
  ('restaurante', 'Restaurante / Comida', TRUE, 20),
  ('ferreteria', 'Ferreteria', TRUE, 30),
  ('farmacia', 'Farmacia', TRUE, 40),
  ('agricultor', 'Agricultor', TRUE, 50),
  ('pescador', 'Pescador', TRUE, 60),
  ('otro', 'Otro', TRUE, 900)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_business_type_check;

ALTER TABLE public.business_sectors ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.business_sectors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_sectors TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_sectors'
      AND policyname = 'Public can view active business sectors'
  ) THEN
    CREATE POLICY "Public can view active business sectors"
      ON public.business_sectors FOR SELECT
      USING (active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_sectors'
      AND policyname = 'Admins can manage business sectors'
  ) THEN
    CREATE POLICY "Admins can manage business sectors"
      ON public.business_sectors FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_business_sector(
  original_code TEXT,
  sector_code TEXT,
  sector_label TEXT,
  sector_active BOOLEAN,
  sector_display_order INT DEFAULT 100
)
RETURNS public.business_sectors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_original TEXT := lower(trim(coalesce(original_code, '')));
  normalized_code TEXT := lower(regexp_replace(trim(sector_code), '[^a-zA-Z0-9_]+', '_', 'g'));
  saved public.business_sectors%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can manage business sectors';
  END IF;

  IF normalized_code !~ '^[a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid sector code';
  END IF;

  IF length(trim(sector_label)) < 2 THEN
    RAISE EXCEPTION 'Invalid sector label';
  END IF;

  IF normalized_original = '' THEN
    INSERT INTO public.business_sectors (code, label, active, display_order)
    VALUES (normalized_code, trim(sector_label), sector_active, coalesce(sector_display_order, 100))
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label,
      active = EXCLUDED.active,
      display_order = EXCLUDED.display_order
    RETURNING * INTO saved;
  ELSIF normalized_original = normalized_code THEN
    UPDATE public.business_sectors
    SET label = trim(sector_label),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;
  ELSE
    UPDATE public.business_sectors
    SET code = normalized_code,
        label = trim(sector_label),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;

    UPDATE public.users
    SET business_type = normalized_code
    WHERE business_type = normalized_original;

    UPDATE public.alerts
    SET target_business_types = array_replace(target_business_types, normalized_original, normalized_code)
    WHERE target_business_types IS NOT NULL
      AND normalized_original = ANY(target_business_types);
  END IF;

  IF saved.code IS NULL THEN
    RAISE EXCEPTION 'Business sector not found';
  END IF;

  RETURN saved;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_business_sector(TEXT, TEXT, TEXT, BOOLEAN, INT) TO authenticated;
