-- RF-15: the storage schema isn't exposed to PostgREST's Data API by
-- default (only public/graphql_public are), so `.schema('storage')` from
-- the edge function's supabase-js client fails with "Invalid schema:
-- storage" even over the service role. This function lives in the exposed
-- public schema but reads storage.buckets internally, giving the EASM scan
-- a way to see bucket exposure without changing the project's exposed
-- schema list.
CREATE OR REPLACE FUNCTION public.list_storage_buckets()
RETURNS TABLE (id TEXT, public BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT id, public FROM storage.buckets;
$$;

REVOKE ALL ON FUNCTION public.list_storage_buckets() FROM PUBLIC, anon, authenticated;
