-- One-off bulk fix for the real dojo practice bank (public.learning_items, the 700 questions +
-- 300 kata cases behind the 30-per-dojo exams): 526 of 1000 items have a correct answer at least
-- 50% longer/more detailed than their distractors (the same length-parity bug fixed for
-- AI-generated questions in 069, but this bank predates that and was never covered by it — the
-- admin panel explicitly does not edit it). This agent only rewrites the WRONG options to match
-- the correct answer's length and detail; it never touches the correct answer's text or index.

ALTER TABLE public.agent_configs
  DROP CONSTRAINT IF EXISTS agent_configs_agent_code_check;

ALTER TABLE public.agent_configs
  ADD CONSTRAINT agent_configs_agent_code_check
  CHECK (agent_code IN (
    'incident-investigator',
    'question-auditor',
    'ciber-dojo-news-agent',
    'sensei-question-auditor',
    'question-bank-importer',
    'learning-item-rebalancer'
  ));

INSERT INTO public.agent_configs (
  agent_code,
  name,
  description,
  enabled,
  trigger_time,
  timezone,
  prompt_template,
  investigation_window_days,
  extra_settings
)
VALUES (
  'learning-item-rebalancer',
  'Reequilibrador de extension de opciones (banco real de dojos)',
  'Reescribe solo los distractores de preguntas y casos de kata existentes para que no delaten la respuesta correcta por su extension, sin cambiar el contenido correcto.',
  true,
  '00:00:00',
  'America/Guayaquil',
  'Recibes una lista de preguntas de opcion multiple de ciberseguridad ya publicadas, cada una con su enunciado, sus 4 opciones en orden y el indice (0 a 3) de la que es correcta. La opcion correcta de cada una es notablemente mas larga o mas detallada que sus 3 distractores, lo cual le da a quien responde una pista para adivinarla sin saber el tema. Tu unica tarea es reescribir los 3 distractores de cada pregunta para que tengan una extension y un nivel de detalle similar al de la opcion correcta, sin agregar relleno vacio: dales el mismo tipo de precision tecnica o de contexto que ya tiene la correcta, manteniendolos claramente incorrectos pero creibles para alguien que no sabe el tema (nunca opciones absurdas, irrelevantes o evidentemente descartables). Nunca cambies el texto de la opcion correcta ni cual indice es el correcto. Nunca uses "todas las anteriores" ni "ninguna de las anteriores". Devuelve JSON estricto: {"items":[{"id":"string","options":["string","string","string","string"]}]}, con el arreglo options en el mismo orden y con el mismo indice correcto que recibiste, solo con los 3 distractores reescritos.',
  0,
  '{"timeout_ms":45000,"temperature":0.4,"max_tokens":6000}'::jsonb
)
ON CONFLICT (agent_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  prompt_template = EXCLUDED.prompt_template,
  extra_settings = public.agent_configs.extra_settings || EXCLUDED.extra_settings,
  updated_at = now();

-- 60s instead of the 30s default: each call rewrites a batch of items in one response, which
-- takes longer than the usual single-item agent calls.
INSERT INTO public.agent_provider_assignments (agent_config_id, provider_key, priority, active, timeout_seconds)
SELECT ac.id, defaults.provider_key, defaults.priority, true, 60
FROM (
  VALUES
    ('claude', 1),
    ('deepseek', 2),
    ('kimi', 3)
) AS defaults(provider_key, priority)
JOIN public.agent_configs ac ON ac.agent_code = 'learning-item-rebalancer'
ON CONFLICT (agent_config_id, provider_key) DO UPDATE SET
  priority = EXCLUDED.priority,
  active = EXCLUDED.active,
  timeout_seconds = EXCLUDED.timeout_seconds;
