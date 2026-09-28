← [[Índice]]

Agente de IA que revisa fuentes de noticias de ciberseguridad y genera preguntas/katas nuevas — o toma contenido pegado/subido a mano (texto, PDF, DOCX, imágenes).

## Cadena de proveedores con respaldo

`runProviderChain` / `callProviderGeneric` (en `supabase/functions/_shared/news-agent-core.ts`) prueban los proveedores de IA asignados en orden de prioridad (Vault-backed), soportando las tres formas de API que existen hoy: `chat_completion` (DeepSeek/Kimi/OpenAI-compatible), `messages` (Anthropic), `generative_language` (Gemini) — incluye adjuntos de imagen por tipo. Cada intento (éxito, error o timeout) queda registrado.

Esta misma cadena la reutilizan **sin crear una paralela**: `quiz-generator` (generación bajo demanda) y `security-diagnose` (ver [[Módulos/Centro de Seguridad]]) — cada uno con su propio prompt, pero la misma infraestructura de fallback.

## Validación antes de guardar

Todo output de la IA se valida con Zod antes de tocar la base de datos. Si el proveedor responde JSON inválido o incompleto, se guarda como `agent_runs.status = 'partial'` (con el texto crudo y el error de validación) — nunca se descarta en silencio ni se guarda a medias sin marcarlo.

## Dos motores de ejecución

- **Manual** ("Probar"/"Ejecutar ahora" en el panel): corre con **Puter.js**, en el navegador del admin, con su sesión personal — necesita internet del navegador.
- **Automático** (hora configurada): corre en el servidor vía `dispatch_news_agent()` + pg_cron + pg_net, autenticado con un secreto compartido (`cron_shared_secret` en Vault), siguiendo la cadena de proveedores real.
