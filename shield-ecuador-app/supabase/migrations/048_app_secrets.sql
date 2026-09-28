-- Generic named-secret registry for standalone credentials that aren't tied
-- to an ai_providers row (e.g. the Resend API key for championship match
-- emails) — reuses the same Vault-backed set_provider_secret/
-- get_decrypted_secret RPCs already built for AI provider keys, just keyed
-- by a plain name instead of a provider_key.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name TEXT PRIMARY KEY,
  secret_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
-- No policies granted to authenticated/anon at all — only service_role
-- (edge functions) ever reads/writes this table, same as ai_providers'
-- api_key_secret_id column.
