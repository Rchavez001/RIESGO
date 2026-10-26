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

## Iteración 5 — 2026-10-26 — DOCS-05 (`GUIA_LEVANTAMIENTO_PROYECTO.md`)
- Cambios: `shield-ecuador-app/GUIA_LEVANTAMIENTO_PROYECTO.md` — conteo de migraciones corregido de
  "21... `001` a `021`" al real ("82 archivos... `001` a `084`, con huecos en `023` y `033`") en la
  sección 1 y en la lista "Orden esperado" de la sección 4.2 (reemplazada por los 82 nombres de
  archivo reales); conteo de Edge Functions corregido de "14" a "33" en la sección 1, con nota de
  que las primeras 14 siguen descritas una por una y las 19 nuevas (aprendizaje, campeonato, centro
  de seguridad, agente de noticias, consentimiento) se listan por nombre con referencia a
  `ARQUITECTURA_CYBER_DOJO.md` sección 5 para el detalle de quién invoca a cada una; las listas de
  despliegue de funciones (bash, bucle `for`, array de PowerShell) en la sección 10 y el bloque de
  la sección 22 ampliadas de 14 a las 33 funciones reales (si no, la guía quedaba operativamente
  incompleta: alguien que la siguiera no desplegaría 19 funciones que el propio documento ya dice
  que existen). Añadida una nota en la sección 9 aclarando que el TOTP del panel de consentimiento
  no tiene secreto propio que configurar (es MFA nativo de Supabase Auth, enrolado por cada admin
  desde la app) — las claves de cifrado/HMAC que pedía la tarea (`PII_ENCRYPTION_KEY_B64`,
  `SECURITY_EVENTS_HMAC_KEY`, `LOOKUP_HMAC_KEY_B64`) ya estaban documentadas desde un commit previo
  (T98.d, 2026-10-23), no se duplicaron. Corregida además, al verificar línea por línea como pide la
  nota de la propia tarea, una afirmación de la sección 15 que ya no era cierta: la guía decía desde
  2026-09-09 que `frontend/` no tenía `Dockerfile` y que producción usaba buildpacks; el commit
  `217140f` (2026-09-28) añadió `frontend/Dockerfile` (build multistage que termina en
  `node static-server.js`, no Nginx) sin que ninguna revisión posterior de esta guía lo detectara.
  Corregidos también, en la sección 16-bis, los nombres de variables de entorno de
  `central-admin-app` (decía `ADMIN_BASIC_AUTH_USER`/`ADMIN_BASIC_AUTH_PASSWORD`; los reales son
  `CENTRAL_ADMIN_USER`/`CENTRAL_ADMIN_PASSWORD`) y se añadió `SUPABASE_ANON_KEY`, que faltaba por
  completo y es obligatoria para las rutas `/api/privacy/*` del módulo de consentimiento.
- Verificado contra: `shield-ecuador-app/supabase/migrations/` (listado real: 82 archivos, huecos en
  `023` y `033`), `shield-ecuador-app/supabase/functions/` (listado real: 33 carpetas sin
  `_shared`), `ARQUITECTURA_CYBER_DOJO.md` sección 5 (nombres y conteo ya corregidos en la
  Iteración 3), `shield-ecuador-app/central-admin-app/app.js` (función `privacyEnroll`, MFA de
  Supabase Auth, línea ~6536), `MANUAL_ADMINISTRADOR.md` sección 14 y `SECURITY_PRIVACY.md`
  (confirmación de que el TOTP es MFA de Supabase, no un secreto de aplicación),
  `shield-ecuador-app/frontend/Dockerfile` (existencia real, contenido literal),
  `git log --follow -- GUIA_LEVANTAMIENTO_PROYECTO.md` y `git log --follow -- frontend/Dockerfile`
  (commit `217140f`, 2026-09-28, posterior a la última vez que esta afirmación se escribió,
  2026-09-09, commit `f1282be`), `shield-ecuador-app/central-admin-app/server.js` líneas 9-15
  (`CENTRAL_ADMIN_USER`, `CENTRAL_ADMIN_PASSWORD`, `SUPABASE_ANON_KEY`),
  `shield-ecuador-app/central-admin-app/.env.example` (mismas variables confirmadas).
- [VERIFICAR] añadidos: 1 — si la revisión de Cloud Run activa hoy en producción para `cyberdojo` se
  construyó antes o después del 2026-09-28 (buildpacks vs. el `Dockerfile` real), porque no se tiene
  acceso al historial de revisiones de Cloud Run desde este loop (ver `DOC-07` en `DECISIONS.md`).
  No afecta el comportamiento descrito (mismo build, mismo arranque).
- Gates: `scope`, `enlaces`, `markdown` OK. `rutas` y `secretos` reportan FAIL, mismo patrón de
  limitación del heurístico ya documentado en las Iteraciones 0b/3/4 (resuelve rutas solo desde la
  raíz del repo, así que `frontend/Dockerfile`, `central-admin-app/server.js`, etc. — todas rutas
  relativas a `shield-ecuador-app/`, confirmadas reales con `ls shield-ecuador-app/<ruta>` — se
  marcan como inexistentes; y la frase genérica "service_role key" en notas de seguridad coincide
  con el patrón de `check_secrets` sin ser un secreto real). `docs/iso-y-privacidad` en
  `DECISIONS.md` es el mismo falso positivo ya registrado desde la Iteración 0b.

## Iteración 6 — 2026-10-26 — DOCS-06 (`MANUAL_USUARIO_CYBER_DOJO.md`)
- Cambios: `shield-ecuador-app/MANUAL_USUARIO_CYBER_DOJO.md` — tres secciones nuevas añadidas al
  final (14, 15, 16), sin reescribir el resto del documento: 14) el aviso de reconsentimiento al
  iniciar sesión (bloquea toda la app hasta aceptar la finalidad obligatoria o elegir cerrar
  sesión/solicitar baja; los invitados lo saltan); 15) el modo invitado desde "Probar sin cuenta"
  (aviso breve citado como `[PENDIENTE DE VALIDACIÓN LEGAL]` tal cual está en el código, tope real
  de 10 de las 30 preguntas del primer dojo, examen de cinturón bloqueado siempre para invitados);
  16) la página `/privacidad` desde la perspectiva del usuario (estado de cada finalidad con
  versión y fecha, toggle de finalidades opcionales, formulario de 9 tipos de solicitud ARCO con
  número de caso y fecha límite de respuesta). Nota final del documento ampliada para listar los
  archivos nuevos verificados, sin tocar la nota original de 2026-09-08.
- Verificado contra: `frontend/src/components/ReconsentGate.tsx` (lógica completa de bloqueo,
  pre-marcado de finalidades opcionales previas, rechazo → cerrar sesión/solicitar baja, exención
  de invitados vía `user?.is_anonymous`), `frontend/src/components/GuestNoticeModal.tsx` (texto
  literal del aviso, marca `[PENDIENTE DE VALIDACIÓN LEGAL]`, enlace a `/privacidad`),
  `frontend/src/components/CinematicPublicShell.tsx` y `frontend/src/screens/CinematicLandingPage.tsx`
  (puntos de entrada reales de "Probar sin cuenta"/"Probar el dojo"), `frontend/src/screens/
  DojoDetailPage.tsx` y `frontend/src/screens/KataExamPage.tsx` (manejo de
  `GUEST_LIMIT_REACHED`), `supabase/migrations/076_learning_guest_limit.sql` (tope real de 10
  preguntas sobre 30, bloqueo server-side de `learning_start_exam` para `is_anonymous`),
  `frontend/src/screens/PrivacyPage.tsx` (finalidades con estado/versión/fecha, 9
  `REQUEST_TYPE_LABELS`, resultado con `case_number`/`due_at`), `frontend/src/App.tsx` (ruta
  `/privacidad`, `ReconsentGate` envolviendo tanto `AdminShell` como `DojoShell`).
- [VERIFICAR] añadidos: ninguno — todo lo escrito se confirmó directamente contra el código citado.
- Gates: `scope`, `enlaces`, `secretos`, `markdown` OK. `rutas` reporta FAIL, mismo patrón de
  limitación del heurístico ya documentado en las Iteraciones 0b/3/4/5 (resuelve rutas solo desde
  la raíz del repo, así que las citas abreviadas relativas a `shield-ecuador-app/` que ya usaba
  este documento desde su reescritura de 2026-09-08 — p. ej. `frontend/src/screens/LoginScreen.tsx`,
  `components/CyberBushido.tsx` — y las que añadió esta iteración con el mismo estilo
  — `components/ReconsentGate.tsx`, `components/GuestNoticeModal.tsx`, `screens/PrivacyPage.tsx`,
  `supabase/migrations/076_learning_guest_limit.sql`, etc. — se marcan como inexistentes. Se
  verificó manualmente con `Read`/`Grep` que cada una de esas rutas existe de verdad bajo
  `shield-ecuador-app/`.

## Iteración 7 — 2026-10-26 — DOCS-07 (`SETUP.md`)
- Cambios: `shield-ecuador-app/SETUP.md` — "21 migraciones a la fecha de esta revision" corregido a
  "82 archivos reales... numerados 001 a 084, con huecos en 023 y 033"; la lista abreviada de
  migraciones (`1.`/`2.`/`3.`/`...`) ahora termina en la migración real más reciente
  (`084_consent_records_legacy_ip_hmac_nullable.sql`) en vez de `021_campaign_impressions_sector.sql`;
  añadida una subsección nueva en "PASO 3" con las 4 variables de entorno del módulo de
  consentimiento que debe recibir `supabase secrets set` (`PII_ENCRYPTION_KEY_B64`,
  `PII_KEY_VERSION`, `SECURITY_EVENTS_HMAC_KEY`, `LOOKUP_HMAC_KEY_B64`), remitiendo a
  `GUIA_LEVANTAMIENTO_PROYECTO.md` sección 9 para el detalle de qué cifra o hashea cada una (no se
  duplicó esa explicación). No se tocó la sección "Deploy Edge Functions" (lista de 14 comandos):
  no afirma un conteo total explícito y la tarea DOCS-07 no la incluye en su criterio de aceptación
  — fuera del alcance literal de esta tarea, mismo criterio aplicado en la Iteración 1 (DOCS-01) a
  las consultas 2-26 de `SUPABASE_VERIFICATION_QUERIES.sql`.
- Verificado contra: `shield-ecuador-app/supabase/migrations/` (listado real: 82 archivos, `001` a
  `084`, huecos en `023` y `033`), `shield-ecuador-app/GUIA_LEVANTAMIENTO_PROYECTO.md` sección 9
  (líneas 537-548: nombres exactos y propósito de las 4 variables, ya verificadas en una iteración
  previa), `shield-ecuador-app/frontend/.env.example` (confirma `PII_ENCRYPTION_KEY_B64`,
  `PII_KEY_VERSION`, `PII_MIGRATION_SECRET` ya documentadas ahí como comentario; no se citó
  `PII_MIGRATION_SECRET` en `SETUP.md` porque no la pide el criterio de aceptación de DOCS-07, que
  habla del módulo de consentimiento, no de la migración de PII preexistente).
- [VERIFICAR] añadidos: ninguno.
- Gates: `scope`, `enlaces`, `secretos`, `markdown` OK. `rutas` reporta FAIL por "frontend/.env"
  (línea 91, preexistente, no tocada en esta iteración) — es un archivo local creado por
  `cp .env.example .env`, legítimamente ausente del repo (gitignored); no es una ruta de código que
  debiera existir en el árbol. Confirmado con `git diff` que la línea no forma parte del cambio de
  esta iteración.
