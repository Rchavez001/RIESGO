-- supabase/migrations/005_security_hardening.sql

-- Prevent client-side profile tampering for authorization and risk fields.
-- Service-role Edge Functions and admins can still update these fields.
CREATE OR REPLACE FUNCTION public.prevent_user_security_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role cannot be changed by this user';
  END IF;

  IF NEW.belt IS DISTINCT FROM OLD.belt THEN
    RAISE EXCEPTION 'belt cannot be changed by this user';
  END IF;

  IF NEW.current_risk_level IS DISTINCT FROM OLD.current_risk_level THEN
    RAISE EXCEPTION 'risk level cannot be changed by this user';
  END IF;

  IF NEW.last_evaluation_at IS DISTINCT FROM OLD.last_evaluation_at THEN
    RAISE EXCEPTION 'last evaluation timestamp cannot be changed by this user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_user_security_field_tampering_trigger ON users;

CREATE TRIGGER prevent_user_security_field_tampering_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_security_field_tampering();
