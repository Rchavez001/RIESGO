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
