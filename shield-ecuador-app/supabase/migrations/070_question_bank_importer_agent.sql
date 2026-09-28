-- Adds a fourth content agent: 'question-bank-importer'. It backs a new
-- admin capability (upload a file of already-written multiple-choice
-- questions) that validates each one with AI before it can ever be
-- published: is it actually about cybersecurity, is the language accessible
-- to non-technical readers, and which option is really correct (independent
-- of what the file claims) — plus the answer-length-parity rule already
-- applied to the other three agents (see 069).

ALTER TABLE public.agent_configs
  DROP CONSTRAINT IF EXISTS agent_configs_agent_code_check;

ALTER TABLE public.agent_configs
  ADD CONSTRAINT agent_configs_agent_code_check
  CHECK (agent_code IN (
    'incident-investigator',
    'question-auditor',
    'ciber-dojo-news-agent',
    'sensei-question-auditor',
    'question-bank-importer'
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
  'question-bank-importer',
  'Importador de banco de preguntas',
  'Extrae y valida preguntas de opcion multiple de un archivo subido por un administrador, antes de que puedan publicarse.',
  true,
  '00:00:00',
  'America/Guayaquil',
  'Recibes el contenido de un archivo subido por un administrador de Ciber Dojo que dice contener preguntas de opcion multiple sobre ciberseguridad. Extrae cada pregunta tal como esta escrita, sin inventar preguntas nuevas ni cambiar su sentido. Para cada una devuelve exactamente 4 opciones: si el archivo trae menos de 4, completa hasta 4 con distractores plausibles del mismo tema (nunca genericos como "ninguna de las anteriores"); si trae mas de 4, conserva la correcta y las 3 mas plausibles. Marca cual opcion es correcta: si el archivo ya la indica, verificala de forma independiente (no confies ciegamente en lo marcado) y corrigela si esta mal senalada; si no la indica, determinala tu con base en el contenido y en tu conocimiento de ciberseguridad. La opcion correcta y las incorrectas deben quedar con una extension y un nivel de detalle similares entre si: si el archivo ya trae ese sesgo (la correcta mucho mas larga o mas detallada), corrigelo al redactar o ajustar los distractores, sin cambiar cual es la correcta. Evalua cada pregunta con tres banderas: topic_ok (es realmente de ciberseguridad o seguridad digital para ciudadania o PYMEs ecuatorianas, no otro tema), language_ok (lenguaje simple, sin jerga tecnica ni siglas sin explicar entre parentesis, apto para personas sin conocimientos de informatica) y answer_confident (estas seguro de cual opcion es la correcta, incluso si tuviste que determinarla tu mismo). En issues (arreglo de texto en espanol simple, uno por problema, vacio si no hay ninguno) enumera cualquier problema real que quede: pregunta ambigua, tema fuera de ciberseguridad, lenguaje muy tecnico, opciones desequilibradas, respuesta correcta dudosa, pregunta duplicada dentro del mismo archivo, etc. Si el contenido no contiene ninguna pregunta de opcion multiple identificable, devuelve un arreglo vacio: nunca inventes preguntas para rellenar. Devuelve JSON estricto y nada mas: {"questions":[{"dojo_id":"string opcional si el contenido lo deja claro","question_text":"string","options":[{"texto":"string","correcta":true|false}],"explanation":"string breve","topic_ok":true|false,"language_ok":true|false,"answer_confident":true|false,"issues":["string"]}]}.',
  0,
  '{"timeout_ms":25000,"temperature":0.1,"max_tokens":4000}'::jsonb
)
ON CONFLICT (agent_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  prompt_template = EXCLUDED.prompt_template,
  extra_settings = public.agent_configs.extra_settings || EXCLUDED.extra_settings,
  updated_at = now();

INSERT INTO public.agent_provider_assignments (agent_config_id, provider_key, priority, active)
SELECT ac.id, defaults.provider_key, defaults.priority, true
FROM (
  VALUES
    ('claude', 1),
    ('deepseek', 2),
    ('kimi', 3)
) AS defaults(provider_key, priority)
JOIN public.agent_configs ac ON ac.agent_code = 'question-bank-importer'
ON CONFLICT (agent_config_id, provider_key) DO UPDATE SET
  priority = EXCLUDED.priority,
  active = EXCLUDED.active;
