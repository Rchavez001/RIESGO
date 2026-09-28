-- Bugfix: set_provider_secret always called vault.create_secret() whenever
-- ai_providers.api_key_secret_id was NULL, even if a Vault secret with that
-- deterministic name (ai_provider_<key>_key) already existed from an
-- earlier save whose link back to ai_providers was lost or reset. Since
-- vault.secrets.name is UNIQUE, that INSERT fails with a duplicate-key
-- error and the admin can never re-save a key for that provider — even
-- though nothing is displayed as "already saved" (the UI reads
-- api_key_secret_id, which is genuinely null), so from the admin's side
-- typing a fresh key and saving just errors for no visible reason.
--
-- Fix: when no secret_id was passed in, look up any existing secret under
-- that name first and update it (re-linking it) instead of blindly trying
-- to create a duplicate.

CREATE OR REPLACE FUNCTION public.set_provider_secret(p_secret_id UUID, p_new_secret TEXT, p_secret_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  result_id UUID;
  existing_id UUID;
BEGIN
  IF p_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(p_secret_id, p_new_secret);
    result_id := p_secret_id;
  ELSE
    SELECT id INTO existing_id FROM vault.secrets WHERE name = p_secret_name;
    IF existing_id IS NOT NULL THEN
      PERFORM vault.update_secret(existing_id, p_new_secret);
      result_id := existing_id;
    ELSE
      result_id := vault.create_secret(p_new_secret, p_secret_name);
    END IF;
  END IF;
  RETURN result_id;
END;
$$;
