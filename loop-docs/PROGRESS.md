# PROGRESS · Loop de documentación (`shield-ecuador-app/docs`)

Bitácora de iteraciones. Nunca se borran entradas.

## Resumen al inicio (Fase 0, 2026-10-24)

Sesión interactiva (no headless) preparó: `loop-docs/INVENTARIO.md` (diagnóstico de los 13
archivos de `shield-ecuador-app/docs/`, sin editar ninguno), el diseño del loop
(`.claude/loops/docs/PROMPT.md`, `gates.sh`, `headless-settings.json`), el backlog
(`loop-docs/TASKS.md`) y 3 decisiones abiertas (`DECISIONS.md`, DOC-01 a DOC-03). También se
propuso (sin commitear) un diff a `.claude/loops/consentimiento/run-loop.sh` para que acepte
`LOOP=docs`, y se añadieron las reglas `allow`/`deny` correspondientes a `.claude/settings.json`.

**Nada de esto ejecutó ninguna tarea de `TASKS.md` todavía.** La primera iteración real del loop
headless (`LOOP=docs bash .claude/loops/consentimiento/run-loop.sh`) espera la aprobación de la
persona responsable sobre el inventario y el backlog.

## Iteración 0 — 2026-10-24 — Fase 0 (preparación, sesión interactiva)
- Cambios: `loop-docs/INVENTARIO.md`, `loop-docs/TASKS.md`, `loop-docs/DECISIONS.md`, este archivo,
  `.claude/loops/docs/PROMPT.md`, `.claude/loops/docs/gates.sh`, `.claude/loops/docs/headless-settings.json`,
  `.claude/settings.json` (reglas `allow`/`deny` para el loop nuevo).
- Verificado contra: los 13 archivos de `shield-ecuador-app/docs/`, `App.tsx`,
  `central-admin-app/*.js`, `BASE_DE_DATOS.md`, `supabase/migrations/`.
- [VERIFICAR] añadidos: ninguno (las 3 preguntas abiertas son decisiones de alcance — archivar/
  fusionar — no afirmaciones técnicas sin verificar).
- Gates: `bash .claude/loops/docs/gates.sh --selftest` OK (las 5 puertas distinguen el caso roto
  del caso sano). `bash .claude/loops/docs/gates.sh` sobre el árbol real de esta sesión reporta
  `FAIL` en la puerta `scope` — **esperado**: el propio trabajo de Fase 0 (archivos de
  `.claude/loops/docs/` y el diff de `run-loop.sh`) está, a propósito, fuera del alcance que esa
  puerta exige para las iteraciones normales del loop (solo `shield-ecuador-app/docs` y
  `loop-docs`). Antes del primer commit de una tarea real de `TASKS.md`, el árbol debe quedar
  limpio de estos archivos de infraestructura (commiteados aparte, con rutas explícitas).
- Pendiente para la persona responsable: aprobar `INVENTARIO.md` y `TASKS.md`; decidir DOC-01 a
  DOC-03; commitear (o pedir que se commitee) el diff de `run-loop.sh`.

## Iteración 0b — 2026-10-26 — Fase 0 (ampliación de alcance, sesión interactiva)
- La persona responsable aprobó el inventario y amplió el alcance: (a) `.md` de la raíz de
  `shield-ecuador-app/`, no solo `docs/`; (b) fusión de la rama `docs/iso-y-privacidad`; (c) decidió
  DOC-01/02/03.
- Cambios: fusión `git merge docs/iso-y-privacidad --no-ff` (sin conflictos); ampliación de
  `loop-docs/INVENTARIO.md` (puntos 14-32: 8 `.md` de la raíz + 2 archivos nuevos de la fusión + 7
  documentos controlados + vault + script fuera de alcance); `loop-docs/DECISIONS.md` (DOC-01/02/03
  → DECIDIDA; DOC-04 y DOC-05 nuevas, ABIERTA); `.claude/loops/docs/PROMPT.md` y
  `.claude/loops/docs/gates.sh` (alcance ampliado a los `.md` de la raíz, excluye `vault/`,
  `manual-central-admin.html` y `scripts/`); `loop-docs/TASKS.md` reescrito completo, 15 tareas en
  el orden que fijó la persona responsable; `loop-docs/propuestas/` (placeholder, para las
  propuestas de documentos controlados que pida DOCS-14).
- Verificado contra: `supabase/migrations/` (82 archivos, hasta `084`), `supabase/functions/` (33
  carpetas), `App.tsx`, `GUIA_LEVANTAMIENTO_PROYECTO.md` (se confirmó que su propio commit T98 no
  corrigió el conteo de migraciones/Edge Functions, a pesar de la fecha reciente).
- [VERIFICAR] añadidos: ninguno nuevo (DOC-04/DOC-05 son decisiones de alcance, no afirmaciones
  técnicas sin verificar).
- Gates: `bash .claude/loops/docs/gates.sh --selftest` — los casos de la puerta `scope` para
  `.md` de la raíz y árbol limpio reportan FAIL mientras los archivos de infraestructura de esta
  misma iteración (PROMPT.md, gates.sh, run-loop.sh) sigan sin commitear — **esperado**, mismo caso
  que la Iteración 0. La puerta `rutas` también reporta falsos positivos sobre `INVENTARIO.md`/
  `DECISIONS.md` porque citan nombres de rama (`docs/iso-y-privacidad`, `wip/ux-redesign`) y rutas
  abreviadas relativas a `shield-ecuador-app/` entre backticks, que la heurística de `check_code_paths`
  resuelve solo desde la raíz del repo — limitación conocida y documentada en el propio `gates.sh`
  ("heurística, no exhaustiva a propósito"), no un error introducido ahora. La puerta `secretos`
  también se autodetecta en `gates.sh` (su propio patrón de búsqueda contiene las palabras
  "password"/"service_role") mientras el archivo esté "cambiado"; deja de pasar por la puerta en
  cuanto se commitea (las iteraciones normales nunca pueden editarlo, está en `headless-settings.json`).
- Pendiente para la persona responsable: revisar `TASKS.md` final y el diff de `run-loop.sh`; decidir
  DOC-04 y DOC-05 (no bloquean ninguna tarea todavía); dar el OK antes de ejecutar cualquier tarea.

## Iteración 0c — 2026-10-26 — Fase 0 (cierre: DOC-04/DOC-05 decididas, OK al plan)
- La persona responsable dio el OK al plan completo y decidió las dos preguntas abiertas que
  quedaban: `DOC-04` (`manual-central-admin.html` queda fuera del alcance del loop, solo lectura) y
  `DOC-05` (`MANUAL_ADMINISTRADOR.md` es el manual oficial/vigente; el índice listará los otros dos
  indicando eso, sin fusionarlos).
- Cambios: `loop-docs/DECISIONS.md` (DOC-04 y DOC-05 → DECIDIDA, con el texto exacto de la decisión);
  `loop-docs/TASKS.md` (DOCS-02 incorpora ambas decisiones como parte de su criterio de aceptación;
  cierre "Fuera de alcance" actualizado — ya no quedan preguntas de alcance sin decidir).
- Con esto, **las cinco decisiones de Fase 0 (DOC-01 a DOC-05) están todas cerradas** y ninguna
  tarea de `TASKS.md` queda `⛔ BLOQUEADA`. Fase 0 interactiva terminada.
- Pendiente para la persona responsable: commitear (o pedir que se commitee) el diff de
  `.claude/loops/consentimiento/run-loop.sh` — sigue sin commitear, a propósito, desde la Iteración 0.
  A partir de ahí, la primera iteración real es responsabilidad de quien decida lanzar
  `LOOP=docs bash .claude/loops/consentimiento/run-loop.sh` (headless, fuera de esta sesión
  interactiva).

## Iteración 1 — 2026-10-26 — DOCS-01 (`SUPABASE_VERIFICATION_QUERIES.sql`)
- Cambios: `shield-ecuador-app/docs/SUPABASE_VERIFICATION_QUERIES.sql` (consulta 1, "Tablas
  esperadas en public": se añadieron 28 tablas agrupadas por módulo, con comentario de qué
  migración(es) las crea cada grupo; fecha de cabecera actualizada a 2026-10-26).
- Verificado contra: `supabase/migrations/026_learning_progress.sql` (learning_dojos,
  learning_items, learning_progress, learning_attempts), `018_campaign_ads_upgrade.sql`
  (central_admin_campaign_settings, central_admin_campaign_audit), `020_campaign_sector_targeting.sql`
  (campaign_impressions, app_entry_log), `030_campaign_donation_priority.sql`
  (central_admin_campaign_tier_weights — la tarea citaba 018/020/021 para este grupo, pero esta
  tabla específica se crea en 030; 021 solo la altera, no la crea), `052_security_center.sql`
  (security_events, security_rate_limit_hits, security_alert_config, security_config_audit,
  security_diagnosis_feedback), `054_security_center_phase3_4.sql` (security_diagnoses,
  security_easm_findings, security_kata_drafts), `047_championship.sql` (championships,
  championship_registrations, championship_matches, championship_match_attempts),
  `073_consent_module_foundation.sql` (admin_roles, privacy_settings, consent_documents,
  consent_records, admin_audit_log, data_subject_requests), `075_privacy_settings_versioning.sql`
  (privacy_email_verifications), `078_data_subject_requests_case_numbers_and_status_update.sql`
  (data_subject_request_counters), `079_email_transport_and_outbox.sql` (email_transport_settings,
  email_transport_tests, email_outbox). Las 28 tablas verificadas confirmaron existir con
  `CREATE TABLE public.<nombre>` real en el archivo citado.
- [VERIFICAR] añadidos: ninguno — todas las tablas añadidas se confirmaron contra una migración
  real; no se tocaron las consultas 2-26 (fuera del alcance literal de esta tarea, que solo pedía
  ampliar la lista de tablas de la consulta 1).
- Gates: OK.

## Iteración 2 — 2026-10-26 — DOCS-02 (índice general `shield-ecuador-app/README.md`)
- Cambios: `shield-ecuador-app/README.md` (nuevo) — tabla de los 9 `.md` de la raíz, tabla de los
  13 documentos vigentes de `docs/`, tabla separada de los 10 documentos controlados de evaluación/
  auditoría ISO en `docs/` (23 archivos en total, coincide con el listado real de la carpeta), y
  una sección sobre `vault/` que remite a su propio índice sin duplicarlo. Incorpora `DOC-04`
  (menciona `manual-central-admin.html` solo como referencia existente, nunca como entrada
  editable) y `DOC-05` (`MANUAL_ADMINISTRADOR.md` declarado manual oficial/vigente;
  `manual-central-admin.html` y `vault/Manual del administrador.md` señalados como no
  autoritativos).
- Verificado contra: listado real de `shield-ecuador-app/` (`.md`/`.html` de la raíz),
  `shield-ecuador-app/docs/` (23 archivos), `shield-ecuador-app/vault/` (confirmado `Índice.md` y
  `Manual del administrador.md` existen con esos nombres exactos); contenido de `vault/Índice.md`
  para no duplicar su mapa; `loop-docs/DECISIONS.md` (DOC-04, DOC-05) para el texto exacto de las
  decisiones ya tomadas.
- [VERIFICAR] añadidos: ninguno — este índice solo describe la ubicación y propósito de archivos
  existentes, no afirma comportamiento de código.
- Gates: OK.

## Iteración 3 — 2026-10-26 — DOCS-03 (`ARQUITECTURA_CYBER_DOJO.md`)
- Cambios: `shield-ecuador-app/ARQUITECTURA_CYBER_DOJO.md` — conteo de Edge Functions corregido de
  "14" a "33" (líneas 29, 82, 121, 144); sección 5 reescrita en tres subsecciones (5.1 funciones de
  `frontend/`, 5.2 funciones solo del panel admin, 5.3 sin invocación activa) para incorporar las 19
  funciones nuevas (consentimiento, agente de noticias, centro de seguridad, campeonato); corregida
  la afirmación de la línea 165 ("ninguna de las 14 se invoca desde `central-admin-app`") — ahora
  documenta que `central-admin-app/app.js` sí invoca Edge Functions directamente (vía
  `supabaseFunctionInvoke`/`/api/functions/v1/` para preguntas, agente de noticias, centro de
  seguridad y campeonato; vía `privacyCall`/`/fn/admin-consent/...` para todo el módulo de
  consentimiento); añadida una nota de actualización al pie del documento (no se tocó la nota
  original de 2026-09-08).
- Verificado contra: listado real de `shield-ecuador-app/supabase/functions/` (33 carpetas sin
  `_shared`), `frontend/src/contexts/AuthContext.tsx`, `frontend/src/screens/RegisterScreen.tsx`,
  `frontend/src/screens/PrivacyPage.tsx`, `frontend/src/components/ReconsentGate.tsx` (llamadas
  `functions.invoke(...)` nuevas), `central-admin-app/app.js` (función `supabaseFunctionInvoke`
  línea ~1537 y sus ~20 llamadas; función `privacyCall` y sus ~30 llamadas a `/fn/admin-consent/...`
  desde la línea 4833), `central-admin-app/server.js` (líneas 36, 53, 168, 279, 307 — rutas
  `/api/functions/v1/` y `/fn/admin-consent`), `supabase/functions/audit-generated-questions/index.ts`,
  `supabase/functions/fix-learning-item-balance/index.ts`, `supabase/functions/run-daily-agent-workflows/index.ts`,
  `supabase/functions/run-incident-investigator/index.ts` (uso de `requireAdminOrScheduler`/`x-cron-secret`),
  `MANUAL_ADMINISTRADOR.md` sección 14 (nombre del módulo de consentimiento).
- [VERIFICAR] añadidos: ninguno — las 33 funciones y cada "invocada desde" de la tabla se
  confirmaron contra el código citado arriba.
- Gates: `enlaces`, `scope`, `markdown` OK. `rutas` y `secretos` reportan FAIL, pero por líneas
  **preexistentes, no tocadas en esta iteración** (p. ej. `frontend/src/contexts/AuthContext.tsx`,
  `central-admin-app/app.js` citados sin el prefijo `shield-ecuador-app/` — la heurística de
  `check_code_paths` resuelve solo desde la raíz del repo, mismo falso positivo ya documentado en la
  Iteración 0b para `INVENTARIO.md`/`DECISIONS.md`; y la mención genérica de "service_role key" como
  término de arquitectura en las líneas 31 y 226, que coincide con el patrón de `check_secrets` sin
  ser un secreto real). Se verificó manualmente que las rutas nuevas que añadió esta iteración
  (`frontend/src/services/auditorIA.ts`, `frontend/src/screens/PrivacyPage.tsx`,
  `frontend/src/components/ReconsentGate.tsx`, `central-admin-app/app.js`, `central-admin-app/server.js`,
  `supabase/functions/audit-generated-questions/index.ts`) existen de verdad en el repo. Reescribir
  los ~40 enlaces preexistentes del documento para evitar este falso positivo habría significado
  reescribir casi todo el archivo por una limitación conocida del heurístico, fuera del alcance de
  DOCS-03.

## Iteración 4 — 2026-10-26 — DOCS-04 (`DOCUMENTO_FUNCIONALIDADES.md`)
- Cambios: `shield-ecuador-app/DOCUMENTO_FUNCIONALIDADES.md` — conteo de migraciones corregido de
  "`001` a `021`" al real ("82 archivos reales... de `001` a `084`, con huecos en `023` y `033`") en
  la intro y en la sección 2.5; sección 2.6 ("Cumplimiento y privacidad") ampliada con cuatro puntos
  nuevos sobre el módulo de consentimiento (migraciones `073`-`084`): re-consentimiento (REQ-09,
  `ReconsentGate.tsx`), modo invitado (`GuestNoticeModal.tsx`, texto marcado PROVISIONAL), panel
  admin con TOTP individual (frente a la Basic Auth compartida del resto del panel), y derechos ARCO
  ejercibles desde `/privacidad` (`PrivacyPage.tsx`, 9 tipos de solicitud). `loop-docs/DECISIONS.md`
  — nueva entrada `DOC-06` (ABIERTA): el estado real de despliegue en producción del módulo de
  consentimiento no se reverificó en esta iteración (la última afirmación conocida, en
  `SECURITY_PRIVACY.md`, es anterior a las migraciones `082`-`084`); el texto de
  `DOCUMENTO_FUNCIONALIDADES.md` queda marcado `[VERIFICAR]` en vez de afirmarlo como hecho.
- Verificado contra: `shield-ecuador-app/supabase/migrations/` (listado real: 82 archivos, `001` a
  `084`, sin `023` ni `033`), `MANUAL_ADMINISTRADOR.md` sección 14 (candados de rol, acceso
  individual con TOTP, runbook de solicitudes de derechos), `SECURITY_PRIVACY.md` (sección "Módulo de
  consentimiento informado (LOPDP)"), `frontend/src/components/ReconsentGate.tsx` (REQ-09,
  `requires_reconsent`), `frontend/src/components/GuestNoticeModal.tsx` (texto literal "[PENDIENTE DE
  VALIDACIÓN LEGAL]"), `frontend/src/screens/PrivacyPage.tsx` (`REQUEST_TYPE_LABELS`, 9 valores de
  `request_type`), `central-admin-app/app.js` (líneas 6456-6613, `privacyLoginForm`/`privacyEnroll`,
  TOTP).
- [VERIFICAR] añadidos: 1 — estado de despliegue en producción del módulo de consentimiento (ver
  `DOC-06` en `DECISIONS.md`).
- Gates: `scope`, `enlaces`, `secretos`, `markdown` OK. `rutas` reporta FAIL, pero por líneas
  **preexistentes, no tocadas en esta iteración** (`central-admin-app/app.js` ya citado en la misma
  frase de la intro antes de este cambio; `public/sw.js` en la sección 2.3, no tocada; el nombre de
  rama `docs/iso-y-privacidad` en `DECISIONS.md`, ya documentado como falso positivo desde la
  Iteración 0b) — mismo patrón de limitación del heurístico ya registrado en las Iteraciones 0b y 3.
