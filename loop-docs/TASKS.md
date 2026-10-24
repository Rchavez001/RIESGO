# TASKS · Loop de documentación (`shield-ecuador-app/docs`)

Backlog derivado de `loop-docs/INVENTARIO.md` (2026-10-24). Orden propuesto: primero lo que no
depende de ninguna decisión humana (para que el loop pueda avanzar solo), después lo bloqueado.

Convención: `[ ]` pendiente, `[x]` hecha, `⛔ BLOQUEADA` depende de una decisión humana en
`DECISIONS.md` (nunca se levanta desde una iteración del loop).

---

## Tareas ejecutables (sin decisión pendiente)

- [ ] **DOCS-01 — Crear `shield-ecuador-app/docs/README.md` (índice)**
  - Hoy `docs/` no tiene ningún índice (confirmado: no existe `README.md` ni `index.md`).
  - Una tabla con cada uno de los 13 archivos actuales: nombre, una frase de propósito (del
    inventario), y a quién está dirigido.
  - Debe quedar actualizado cada vez que una tarea posterior cambie la estructura de `docs/`
    (lo exige `PROMPT.md`) — las tareas DOCS-04/05/06 (bloqueadas) lo tocarán si se aprueban.

- [ ] **DOCS-02 — Actualizar `SUPABASE_VERIFICATION_QUERIES.sql`**
  - Hoy solo lista ~20 tablas (hasta la migración ~016). Añadir, verificando cada nombre contra
    `supabase/migrations/`: las tablas de aprendizaje (`learning_dojos`, `learning_progress`,
    `learning_items`, `learning_attempts`, migración `026` en adelante), las de campañas
    (`central_admin_campaign_settings`, `central_admin_campaign_audit`, `campaign_impressions`,
    `app_entry_log`, `018`/`020`/`021`), y las 11 tablas del módulo de consentimiento (`073`-`084`,
    ver `BASE_DE_DATOS.md` sección 12).
  - Criterio de aceptación: cada tabla añadida existe de verdad en una migración citada; la
    consulta sigue siendo de solo lectura (ninguna línea nueva escribe nada).
  - Impacto: alta prioridad — es una herramienta de verificación, no solo texto.

- [ ] **DOCS-03 — Actualizar `MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md`: excepción del módulo de consentimiento**
  - Añadir una sección (sin reescribir las existentes) que aclare que, desde el módulo de
    consentimiento, el panel administrativo tiene una vía de autenticación individual con TOTP
    (D-01 en `loop-consentimiento/DECISIONS.md`), distinta de la Basic Auth compartida que el
    resto del documento describe para T-Pot/dojos/campañas.
  - Referenciar `SECURITY_PRIVACY.md` (raíz) para el detalle, sin duplicar su contenido.
  - Verificar contra: `central-admin-app/app.js` (`privacyLoginForm`/`privacyEnroll`),
    `loop-consentimiento/DECISIONS.md` (D-01).

- [ ] **DOCS-07 — Nota sobre `docs/iso-y-privacidad` (rama sin fusionar)**
  - Añadir, en el nuevo `README.md` de `docs/` (DOCS-01) o en una nota aparte, que la evaluación
    ISO 42001 real (`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.*`, `ISO_CIBERDOJO_INVENTARIO.csv`) y
    el `vault/` de Obsidian viven en la rama `docs/iso-y-privacidad`, sin fusionar a
    `feature/consentimiento-lopdp` — para que quien busque esos documentos sepa dónde están.
  - No implica fusionar esa rama: solo documentar que existe y dónde.

- [ ] **DOCS-08 — Documento nuevo: modo invitado (sesión anónima)**
  - Hoy no existe ningún documento de referencia único sobre el modo invitado: está disperso en
    `loop-consentimiento/TASKS.md` y comentarios de código.
  - Nuevo `shield-ecuador-app/docs/MODO_INVITADO.md` (mismo estilo que `TPOT_INTEGRATION.md`):
    qué guarda un invitado (`learning_progress`), el aviso breve (`GuestNoticeModal.tsx`,
    `accept-guest-notice`), el tope de 10 preguntas (`GUEST_LIMIT_REACHED`), la caducidad de la
    sesión (`cleanup_expired_guest_sessions()`), y que `enable_anonymous_sign_ins` no está
    desplegado en producción todavía (D-12).
  - Verificar contra: el código citado arriba y `loop-consentimiento/DECISIONS.md` (D-12, D-16).
  - El texto del aviso de invitados sigue PROVISIONAL en el código (`GuestNoticeModal.tsx`): este
    documento debe citarlo como provisional también, nunca presentarlo como definitivo.

---

## Tareas bloqueadas (decisión humana — ver `DECISIONS.md`)

- [ ] **DOCS-04 — `AI_HANDOFF_CYBER_DOJO.md`: fusionar o archivar** ⛔ BLOQUEADA (DOC-01)
  - Candidato a fusión con `ARQUITECTURA_CYBER_DOJO.md`/`DOCUMENTO_FUNCIONALIDADES.md` (raíz, fuera
    de `docs/`) por solapamiento de alcance, o a archivar y reemplazar por un documento nuevo más
    corto. Severamente desactualizado (ver `INVENTARIO.md` punto 1: migraciones, cinturones, Edge
    Functions, rutas).
  - No se reescribe ni se archiva hasta que la persona responsable decida DOC-01.

- [ ] **DOCS-05 — `APLICACION_CINEMATICA_LOCAL.md`: archivar o generalizar** ⛔ BLOQUEADA (DOC-02)
  - El rediseño que describe ya está en producción; la ruta `/practica` que documenta ya no existe
    tal como se describe (redirige a `/dojos`). Archivar (cumplió su propósito) o generalizar el
    procedimiento para futuras revisiones locales.

- [ ] **DOCS-06 — `DIRECCION_VISUAL_REFERENCIAS.md`: archivar o mantener como histórico** ⛔ BLOQUEADA (DOC-03)
  - Propuesta de diseño ya implementada. Archivar, o dejar explícitamente marcada como "registro
    histórico de una decisión de dirección de arte ya ejecutada".

---

## Fuera de alcance de este backlog (no son tareas, son hallazgos del inventario sin acción)

- `BANCO_Y_APRENDIZAJE_CIBERDOJO.md`, `FICHA_DOGGOTEKA.md` (+ `.pdf`/`.png`),
  `MANUAL_TECNICO_SENSOR_TPOT.md`, `TPOT_AI_AGENT.md`, `TPOT_DEPLOYMENT_CHECKLIST.md`,
  `TPOT_INTEGRATION.md`: el inventario los marca "dejar igual" — ninguna contradicción encontrada
  contra el código actual. Si una iteración futura encuentra una, se añade como tarea nueva aquí,
  no se asume de antemano.
