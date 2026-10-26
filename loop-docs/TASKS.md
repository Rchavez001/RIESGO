# TASKS · Loop de documentación (`shield-ecuador-app/docs` + raíz)

Backlog reescrito el 2026-10-26 tras la ampliación de alcance y la fusión de `docs/iso-y-privacidad`
(ver `loop-docs/INVENTARIO.md`, sección "Ampliación de alcance"). Orden fijado por la persona
responsable — no reordenar sin su autorización.

Convención: `[ ]` pendiente, `[x]` hecha, `⛔ BLOQUEADA` depende de una decisión humana en
`DECISIONS.md` (nunca se levanta desde una iteración del loop).

---

- [x] **DOCS-01 — Actualizar `shield-ecuador-app/docs/SUPABASE_VERIFICATION_QUERIES.sql`**
  - Hoy solo lista ~20 tablas (hasta la migración ~016). Añadir, verificando cada nombre contra
    `supabase/migrations/` (82 archivos, hasta `084`): tablas de aprendizaje (`learning_dojos`,
    `learning_items`, `learning_progress`, `learning_attempts`, desde `026`), campañas/entradas
    (`central_admin_campaign_settings`, `central_admin_campaign_audit`,
    `central_admin_campaign_tier_weights`, `campaign_impressions`, `app_entry_log`, `018`/`020`/`021`),
    centro de seguridad (`security_events`, `security_alert_config`, `security_config_audit`,
    `security_diagnoses`, `security_diagnosis_feedback`, `security_easm_findings`,
    `security_kata_drafts`, `security_rate_limit_hits`, desde `052`), campeonato (`championships`,
    `championship_registrations`, `championship_matches`, `championship_match_attempts`), y las 11
    tablas del módulo de consentimiento (`073`-`084`, ver `BASE_DE_DATOS.md` sección 12).
  - Criterio de aceptación: cada tabla añadida existe de verdad en una migración citada; la consulta
    sigue siendo de solo lectura (ninguna línea nueva escribe nada).
  - Prioridad: la más alta — es herramienta de verificación, no solo texto; su desactualización da
    una falsa sensación de que "todo coincide".

- [x] **DOCS-02 — Crear el índice general de toda la documentación**
  - Hoy no existe ningún `README.md` en la raíz de `shield-ecuador-app/` (confirmado: solo existe
    `README-centro-de-seguridad.md`, que es de un submódulo específico, no un índice general).
    Crear `shield-ecuador-app/README.md` como índice: tabla con cada `.md` de la raíz (propósito,
    público), tabla con cada archivo de `shield-ecuador-app/docs/` (incluidos los 7 documentos
    controlados de evaluación/auditoría ISO, marcados explícitamente como tales), y una entrada para
    `shield-ecuador-app/vault/` describiéndolo como notas internas de referencia del club (sin
    duplicar su índice propio, `vault/Índice.md`).
  - Debe mantenerse sincronizado cada vez que una tarea posterior cambie la estructura de archivos
    (lo exige `PROMPT.md`) — en particular DOCS-08, DOCS-10, DOCS-11, DOCS-12, DOCS-13 lo tocarán.
  - Decisión `DOC-04`: `manual-central-admin.html` se menciona solo como referencia existente, nunca
    como entrada editable (queda fuera del alcance del loop).
  - Decisión `DOC-05`: `MANUAL_ADMINISTRADOR.md` es el manual oficial/vigente. El índice debe listar
    `manual-central-admin.html` y `vault/Manual del administrador.md` indicando explícitamente que
    no son la fuente de verdad y remitiendo a `MANUAL_ADMINISTRADOR.md`.

- [x] **DOCS-03 — Actualizar `ARQUITECTURA_CYBER_DOJO.md` (raíz)**
  - Corrige el conteo de Edge Functions: dice "14" (líneas 29, 82, 121, 144); hoy hay 33 carpetas en
    `supabase/functions/` (sin contar `_shared`). Reescribe la sección 5 ("Las 14 Edge Functions...")
    para incluir las funciones del módulo de consentimiento, agente de noticias, centro de seguridad
    y campeonato. Corrige la línea 165 ("ninguna de las 14 funciones se invoca desde
    `central-admin-app`") — el panel de consentimiento sí llama `admin-consent`.
  - Verificar contra: `supabase/functions/` (listado real), `MANUAL_ADMINISTRADOR.md` sección 14.

- [x] **DOCS-04 — Actualizar `DOCUMENTO_FUNCIONALIDADES.md` (raíz)**
  - Corrige "Migraciones... (`001` a `021`)" (línea 119) al conteo real (82, hasta `084`). Amplía la
    sección 2.6 ("Cumplimiento y privacidad") para reflejar el módulo de consentimiento completo
    (re-consentimiento, modo invitado, panel admin con TOTP, derechos ARCO ejercibles desde
    `/privacidad`) en vez de la única línea genérica pre-módulo que tiene hoy.
  - Verificar contra: `supabase/migrations/`, `SECURITY_PRIVACY.md`, `MANUAL_ADMINISTRADOR.md`
    sección 14.

- [x] **DOCS-05 — Actualizar `GUIA_LEVANTAMIENTO_PROYECTO.md` (raíz)**
  - Corrige "21 migraciones... `001` a `021`" (línea 22) y "14 Edge Functions" (línea 23), y la lista
    de "Orden esperado" (línea 211), al estado real. Añade las variables de entorno nuevas del módulo
    de consentimiento (claves de cifrado, secreto TOTP, HMAC de IP) a la sección de arranque.
  - Nota para quien ejecute esta tarea: el último commit de este archivo (T98, 2026-10-23) **no**
    corrigió estas líneas — no asumir que un commit reciente implica que todo el archivo está
    vigente; verificar línea por línea igual.

- [x] **DOCS-06 — Actualizar `MANUAL_USUARIO_CYBER_DOJO.md` (raíz)**
  - Añade, sin reescribir lo existente: el aviso de re-consentimiento al iniciar sesión
    (`T20`/REQ-09), el modo invitado (aviso de `GuestNoticeModal`, tope de 10 preguntas — recordar
    que el texto del aviso sigue PROVISIONAL en el código, citarlo como tal) y la página
    `/privacidad` desde la perspectiva del usuario final (cómo ejercer derechos ARCO).
  - Verificar contra: `GuestNoticeModal.tsx`, `PrivacyPage.tsx`/ruta `/privacidad` en `App.tsx`,
    `loop-consentimiento/DECISIONS.md` (D-12, D-16 para el estado del modo invitado).

- [x] **DOCS-07 — Actualizar `SETUP.md` (raíz)**
  - Corrige "21 migraciones a la fecha de esta revisión" (línea 25) y la lista de migraciones
    (línea 30) al estado real. Añade las variables de entorno del módulo de consentimiento.
  - Verificar contra: `supabase/migrations/`, `.env.example` si existe, `SECURITY_PRIVACY.md`.

- [x] **DOCS-08 — Reescribir `AI_HANDOFF_CYBER_DOJO.md` como traspaso breve**
  - Decisión `DOC-01` (ver `DECISIONS.md`): no se archiva. Se reescribe **breve**, como documento de
    traspaso que enlaza a `ARQUITECTURA_CYBER_DOJO.md`, `BASE_DE_DATOS.md`,
    `DOCUMENTO_FUNCIONALIDADES.md` y `MANUAL_ADMINISTRADOR.md` en vez de repetir su contenido.
    Uso previsto explícito: capacitar al club Phycom — escribir pensando en ese lector (alguien que
    no construyó el proyecto, necesita orientarse rápido y saber a qué documento ir para cada tema).
  - Importante: el documento actual ya tiene una sección 28 ("Cambios desde el 27 de agosto de
    2026") y notas puntuales en las secciones 8, 10 y 17, agregadas el 2026-09-23 — no partir de
    cero; usar esa sección 28 como mapa de qué cambió, y reescribir el resto corto y enlazado.
  - Depende de que DOCS-03/04 ya estén hechas (para enlazar a contenido ya actualizado, no al
    desactualizado) — ejecutar después de esas dos.

- [x] **DOCS-09 — Actualizar `MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md`**
  - Añadir una sección (sin reescribir las existentes) que aclare que, desde el módulo de
    consentimiento, el panel administrativo tiene una vía de autenticación individual con TOTP
    (`D-01` en `loop-consentimiento/DECISIONS.md`), distinta de la Basic Auth compartida que el
    resto del documento describe para T-Pot/dojos/campañas. Referenciar `SECURITY_PRIVACY.md` (raíz)
    para el detalle, sin duplicar su contenido.
  - Verificar contra: `central-admin-app/app.js` (`privacyLoginForm`/`privacyEnroll`),
    `loop-consentimiento/DECISIONS.md` (D-01).

- [x] **DOCS-10 — Documento nuevo: `shield-ecuador-app/docs/MODO_INVITADO.md`**
  - Qué guarda un invitado (`learning_progress`), el aviso breve (`GuestNoticeModal.tsx`,
    `accept-guest-notice`), el tope de 10 preguntas (`GUEST_LIMIT_REACHED`), la caducidad de la
    sesión (`cleanup_expired_guest_sessions()`), y que `enable_anonymous_sign_ins` no está desplegado
    en producción todavía (`D-12`).
  - El texto del aviso de invitados sigue PROVISIONAL en el código (`GuestNoticeModal.tsx`): citarlo
    como provisional, nunca como definitivo.
  - Verificar contra: el código citado arriba y `loop-consentimiento/DECISIONS.md` (D-12, D-16).

- [x] **DOCS-11 — Archivar `APLICACION_CINEMATICA_LOCAL.md`**
  - Decisión `DOC-02`: mover a `shield-ecuador-app/docs/archivo/APLICACION_CINEMATICA_LOCAL.md`, con
    un aviso al inicio: "Documento histórico, no vigente desde 2026-10-26" (sin reescribir el resto
    del contenido). Actualizar el índice (DOCS-02) para reflejar la nueva ubicación.

- [x] **DOCS-12 — Archivar `DIRECCION_VISUAL_REFERENCIAS.md`**
  - Decisión `DOC-03`: igual que DOCS-11 — mover a `shield-ecuador-app/docs/archivo/`, mismo aviso
    "Documento histórico, no vigente desde 2026-10-26". Actualizar el índice (DOCS-02).

- [x] **DOCS-13 — Documento nuevo: `shield-ecuador-app/docs/GUIA_OPERACION_CLUB.md`**
  - Para el club Phycom: qué hace cada parte del sistema (frontend, central-admin-app, Supabase),
    cómo se despliega (Cloud Run, revisiones), y qué revisar a diario (panel admin, alertas del
    centro de seguridad, estado de agentes de IA).
  - Puede apoyarse en `shield-ecuador-app/vault/` (notas ya existentes y vigentes — ver
    `INVENTARIO.md` punto 31) como fuente, citándolas en vez de duplicar su contenido.
  - Ejecutar después de DOCS-08 (el traspaso breve) para poder enlazarlo desde ahí si tiene sentido.

- [x] **DOCS-14 — Propuesta de actualización de la evaluación ISO 42001 (documento controlado)**
  - La evaluación (`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.md`, v1.0, 2026-09-26) **no se edita
    directamente**. Si al verificar sus hallazgos contra el código actual (p. ej. el punto sobre
    autorización privilegiada inconsistente, o las brechas de gobierno de IA) se encuentra que algo
    ya cambió desde esa fecha, redactar la propuesta en
    `loop-docs/propuestas/PROPUESTA-ISO-42001-<fecha>.md`, con su propia tabla de control de
    versiones y estado "pendiente de aprobación", citando la sección exacta de la evaluación original
    que propone actualizar.
  - Prioridad baja — no hay plazo ni obligación de certificación en curso conocida.

- [x] **DOCS-15 — Verificar `TPOT_AI_AGENT.md` contra el código**
  - Especificación de los dos agentes de IA de T-Pot (`TpotThreatAnalysisAgent`,
    `TpotAiAuditAgent`). No se verificó línea por línea en la Fase 0 (ver `INVENTARIO.md` punto 11).
    Confirmar el JSON de salida exacto y el flujo de aprobación contra el código real de los
    agentes; marcar `[VERIFICAR]` lo que no se pueda confirmar.
  - Prioridad baja — explícitamente la última tarea del backlog.

- [ ] **DOCS-16 — Corregir `ARQUITECTURA_CYBER_DOJO.md` sección 8 (Despliegue): el frontend ya tiene `Dockerfile`**
  - La sección 8 (reescrita 2026-09-08) afirma que `cyberdojo` (frontend) se construye "por
    buildpacks de Cloud Build (`gcp-build` script), sin Dockerfile propio". Esto ya no es cierto: el
    commit `217140f` (2026-09-28) añadió `frontend/Dockerfile` (build multistage `node:20-alpine`
    que termina en `node static-server.js`). Cloud Build prioriza un `Dockerfile` presente sobre los
    buildpacks. Hallazgo encontrado al verificar fuentes para DOCS-08 (iteración de este mismo
    documento, 2026-10-26); no se corrigió ahí porque pertenece a otro documento (una iteración
    cierra un solo documento/sección).
  - Verificar contra: `shield-ecuador-app/frontend/Dockerfile` (existencia y contenido real),
    `git log --follow -- frontend/Dockerfile` (commit `217140f`). Relacionado con `DOC-07` (ABIERTA
    en `DECISIONS.md`): no se sabe si la revisión activa en Cloud Run ya usa ese `Dockerfile` o una
    build anterior por buildpacks — mismo `[VERIFICAR]` aplicaría aquí.
  - Prioridad baja — no afecta el comportamiento descrito (mismo arranque), solo el método de build.

- [ ] **DOCS-17 — Corregir `MANUAL_ADMINISTRADOR.md`: el panel "Agente noticias" ya no es una simulación**
  - La tabla "Hallazgo central de este manual" (fila "Agente noticias") y la sección 5 afirman que
    `runNewsAgent()` "no llama a ningún proveedor de IA real ni a ninguna Edge Function" y que genera
    texto con una plantilla fija en JavaScript. Esto describe el código **anterior** al commit
    `ab309ca` (2026-09-20, *"estado desplegado de la consola admin (Centro de Seguridad, Campeonato,
    proxy de funciones) antes de la auditoría A0–A15"*), posterior a la fecha de redacción de ese
    manual. El código actual (`central-admin-app/app.js`, `executeNewsAgent()`/`ensurePuter()`) sí
    llama a un proveedor de IA real vía Puter.js (`puter.ai.chat`, modelo `gpt-5.6-luna`) en el modo
    manual, y a la Edge Function real `run-news-agent` (acciones `prepare`/`complete`/`scheduled`,
    `supabase/functions/run-news-agent/index.ts`) en ambos modos (manual y automático vía
    `dispatch_news_agent()`, `supabase/migrations/040_news_agent_pg_cron_dispatcher.sql`). Todo el
    contenido generado se guarda como `audit_status='pending'` y requiere aprobación manual
    (`reviewNewsGenerated()`) antes de sincronizarse a `learning_items`
    (`supabase/migrations/044_sync_news_questions_to_learning_items.sql`) — no es un "contenido
    simulado que se guarda como si fuera real", es contenido real generado por IA pendiente de
    revisión humana. Hallazgo encontrado al verificar fuentes para `DOCS-13`
    (`docs/GUIA_OPERACION_CLUB.md`, 2026-10-26); no se corrigió ahí porque pertenece a otro documento.
  - Verificar contra: `shield-ecuador-app/central-admin-app/app.js` (funciones citadas arriba),
    `shield-ecuador-app/supabase/functions/run-news-agent/index.ts`,
    `shield-ecuador-app/supabase/migrations/040_news_agent_pg_cron_dispatcher.sql` y `044_...sql`,
    `git log --oneline -S "puter.ai.chat" -- central-admin-app/app.js` (commit `ab309ca`,
    2026-09-20).
  - Prioridad baja — no es información de seguridad crítica, pero sí cambia la recomendación
    operativa real del manual (un administrador que confíe en la nota actual podría no revisar la
    cola de contenido pendiente, pensando que el botón no hace nada real).

---

## Fuera de alcance de este backlog (hallazgos del inventario sin tarea asignada)

- `BANCO_Y_APRENDIZAJE_CIBERDOJO.md`, `FICHA_DOGGOTEKA.md` (+ `.pdf`/`.png`),
  `MANUAL_TECNICO_SENSOR_TPOT.md`, `TPOT_DEPLOYMENT_CHECKLIST.md`, `TPOT_INTEGRATION.md`,
  `BASE_DE_DATOS.md`, `SECURITY_PRIVACY.md`, `MANUAL_ADMINISTRADOR.md`, `README-centro-de-seguridad.md`,
  `shield-ecuador-app/vault/` (8 notas): el inventario los marca "dejar igual" — ninguna
  contradicción encontrada contra el código actual. Si una iteración futura encuentra una, se añade
  como tarea nueva aquí, no se asume de antemano.
- Los 7 documentos controlados de evaluación/auditoría (`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.*`,
  `ISO_CIBERDOJO_INVENTARIO.csv`, 6 informes PDF/DOCX): sin tarea salvo DOCS-14 (propuesta, no
  edición directa).
- `shield-ecuador-app/scripts/export_iso_review.py`: fuera de alcance, es código.
- `manual-central-admin.html`: decidido (`DOC-04`) — fuera del alcance del loop, solo lectura.
- Los tres "manual del administrador" (`DOC-05`): decidido — `MANUAL_ADMINISTRADOR.md` es el
  oficial; DOCS-02 lo refleja en el índice. No se fusionan ni se reescriben los otros dos.
