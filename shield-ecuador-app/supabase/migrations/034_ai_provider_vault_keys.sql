-- Phase 1 (adapted): evolve the EXISTING ai_providers / agent_provider_assignments
-- tables rather than introducing a parallel monitor_jobs/job_ai_chain schema —
-- this project already has a single-admin agent system (agent_configs,
-- agent_provider_assignments, agent_runs) in real use by 3 agents
-- (incident-investigator, question-auditor, ciber-dojo-news-agent). RLS stays
-- on the existing is_admin() pattern: there is one admin-owned configuration,
-- not per-end-user monitor jobs.
--
-- Adds what was genuinely missing: a place to point each provider at a
-- custom endpoint (OpenRouter/Groq/Mistral-style APIs, not just the 4
-- hardcoded providers wired into code today), a per-provider default
-- timeout, and — the important part — a Vault-backed secret reference
-- instead of a Supabase secret I set by hand from a key pasted in chat.
-- Real key material never touches this table or any client response.

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS api_key_secret_id UUID,
  ADD COLUMN IF NOT EXISTS default_timeout_seconds INT NOT NULL DEFAULT 30 CHECK (default_timeout_seconds > 0);

ALTER TABLE public.agent_provider_assignments
  ADD COLUMN IF NOT EXISTS timeout_seconds INT CHECK (timeout_seconds IS NULL OR timeout_seconds > 0);

-- ========================================
-- Vault-backed secret storage for provider API keys.
-- get_decrypted_secret() is intentionally NOT granted to authenticated/anon —
-- only service_role (i.e. edge functions) can ever read a decrypted key back.
-- ========================================
CREATE OR REPLACE FUNCTION public.get_decrypted_secret(secret_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id;
$$;

REVOKE ALL ON FUNCTION public.get_decrypted_secret(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_secret(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_decrypted_secret(UUID) TO service_role;
