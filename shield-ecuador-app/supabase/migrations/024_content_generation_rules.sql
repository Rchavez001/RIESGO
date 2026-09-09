-- Encode the content rules for question/kata generation directly in the agent prompts:
-- explain acronyms and unfamiliar domain names in plain language, escalate difficulty
-- progressively from white to black belt, and require katas to have exactly 5 cases
-- with the last two at medium/medium-high complexity and non-obvious answers that
-- assume the reader already completed the dojo's 20 manual questions.

UPDATE public.agent_configs
SET
  prompt_template = 'Analiza los incidentes de ciberseguridad reportados para el dia anterior. Resume impacto para MIPYMEs ecuatorianas, clasifica severidad y propone hasta 10 preguntas nuevas para Ciber Dojo. Usa lenguaje simple para PYMEs ecuatorianas: nunca menciones una sigla, un dominio o el nombre de una fuente sin explicar entre parentesis que es, en una frase corta (ejemplo: "cisa.gov, la agencia de ciberseguridad del gobierno de Estados Unidos"). La dificultad de las preguntas debe subir progresivamente segun el cinturon del dojo, de blanco (mas facil) a negro (mas dificil). Las preguntas deben estar alineadas a ISO 27001, incluir 4 opciones cuando aplique y devolver JSON estricto con incidents[] y generated_questions[].'
WHERE agent_code = 'incident-investigator';

UPDATE public.agent_configs
SET
  prompt_template = 'Busca noticias recientes de ciberataques en las fuentes configuradas. Extrae tactica, impacto, control preventivo ISO 27001 y genera preguntas y KATAS para Ciber Dojo. Usa lenguaje simple para PYMEs ecuatorianas: nunca menciones una sigla, un dominio o el nombre de una fuente sin explicar entre parentesis que es, en una frase corta (ejemplo: "bleepingcomputer.com, un sitio web que reporta noticias de ciberataques"). La dificultad de las preguntas debe subir progresivamente segun el cinturon del dojo, de blanco (mas facil) a negro (mas dificil). Cada KATA generada debe tener exactamente 5 casos: los primeros 3 de dificultad baja a media, y los ultimos 2 de complejidad media y media-alta, con respuestas que no sean obvias a simple vista y que asuman que quien responde ya completo las 20 preguntas manuales del dojo. Devuelve JSON estricto con generated_questions[] y generated_katas[].'
WHERE agent_code = 'ciber-dojo-news-agent';

UPDATE public.agent_configs
SET
  prompt_template = 'Audita las preguntas generadas automaticamente para Ciber Dojo antes de activarlas. Evalua claridad, relevancia para PYMEs ecuatorianas, alineacion con ISO 27001, accionabilidad, ausencia de ambiguedad y calidad pedagogica. Rechaza o corrige cualquier pregunta que use una sigla, un dominio o el nombre de una fuente sin explicarlo en lenguaje simple entre parentesis. Verifica que la dificultad suba progresivamente segun el cinturon del dojo, de blanco a negro, y que las KATAS tengan exactamente 5 casos con los ultimos 2 de complejidad media y media-alta y respuestas no evidentes. Aprueba solo preguntas seguras y utiles. Devuelve JSON estricto con audits[] usando question_id, status approved|rejected, notes y suggested_improvement.'
WHERE agent_code = 'question-auditor';
