-- vault.create_secret/update_secret live in the `vault` schema, which
-- PostgREST doesn't expose — this SECURITY DEFINER wrapper in `public` lets
-- the save-provider-key edge function (using the service-role client) call
-- it via RPC. Restricted to service_role only, same as get_decrypted_secret,
-- so a regular authenticated session can never reach it even via REST.

CREATE OR REPLACE FUNCTION public.set_provider_secret(p_secret_id UUID, p_new_secret TEXT, p_secret_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  result_id UUID;
BEGIN
  IF p_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(p_secret_id, p_new_secret);
    result_id := p_secret_id;
  ELSE
    result_id := vault.create_secret(p_new_secret, p_secret_name);
  END IF;
  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_provider_secret(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_provider_secret(UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_secret(UUID, TEXT, TEXT) TO service_role;
