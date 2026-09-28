-- The news agent was assigned to deepseek/kimi/claude (migrations 007/024),
-- but none of those API keys are configured as Supabase secrets, so all
-- three would fail on every call. gemini-2.0-flash already works (it's what
-- vuln-scanner-ai uses) — register it and put it first in priority for this
-- agent, keeping the original chain as a fallback in case those keys are
-- added later.

INSERT INTO public.ai_providers (provider_key, label, provider_type, model_name, purpose, active)
VALUES ('gemini', 'Gemini', 'generative_language', 'gemini-2.0-flash', 'Generacion de preguntas y katas desde noticias', true)
ON CONFLICT (provider_key) DO NOTHING;

UPDATE public.agent_provider_assignments
SET priority = priority + 1
WHERE agent_config_id = (SELECT id FROM public.agent_configs WHERE agent_code = 'ciber-dojo-news-agent');

INSERT INTO public.agent_provider_assignments (agent_config_id, provider_key, priority, active)
SELECT ac.id, 'gemini', 1, true
FROM public.agent_configs ac
WHERE ac.agent_code = 'ciber-dojo-news-agent'
ON CONFLICT (agent_config_id, provider_key) DO UPDATE SET priority = 1, active = true;
