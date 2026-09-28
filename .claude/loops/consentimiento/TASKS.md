# TASKS · Consentimiento informado — CiberDojo

Leyenda: `[ ]` pendiente · `[x]` hecha · `⛔ BLOQUEADA (D-nn)` · `⚠ REINTENTAR (motivo)`
Cada tarea = una iteración. Si una tarea resulta demasiado grande, divídela en `Tnn.a`, `Tnn.b`
en este archivo (antes de empezar a codificar) y ejecuta solo la primera.

---

## Fase 0 · Reconocimiento

- [x] **T00 — Mapa del repo y gates**
  - Identificar: gestor de paquetes, comandos de typecheck/lint/test del frontend y del panel,
    cómo se prueban Edge Functions (`deno test`), si existe pgTAP / `supabase test db`,
    Playwright, número mayor de migración, proveedor de correo existente (si lo hay).
  - Crear `.claude/loops/consentimiento/gates.sh` (bash, `set -euo pipefail`) que ejecute, en orden:
    typecheck, lint, tests unitarios front, tests del panel, `deno check` + `deno test` de funciones,
    `supabase db reset` y tests SQL. Cada gate imprime `GATE <nombre>: OK/FAIL`.
  - Añadir a `PROGRESS.md` un "Mapa del repo" con rutas reales de: `RegisterScreen.tsx`,
    `secure-register-user`, `_shared/pii.ts`, `_shared/security-events.ts`, `_shared/rate-limit.ts`,
    `central-admin-app/server.js`, `app.js`, texto de aviso hardcodeado y cualquier tabla de
    consentimiento previa (buscar `consent`, `privacy_notice`, `aviso`).
  - **Aceptación:** `gates.sh` corre y reporta el estado base (puede haber FAIL preexistentes:
    documentarlos como línea base y excluirlos explícitamente con comentario, sin ocultarlos).

- [ ] **T01 — Inventario de consentimiento actual**
  - **Estado real (2026-09-28):** Sin iniciar como tarea (no hay plan de backfill escrito). Hoy: `users.data_processing_authorized`/`_at`, `privacy_notice_version` (constante hardcodeada `2026-06-22` hasta la Fase 1) y PII cifrada con `PII_ENCRYPTION_KEY_B64`.
  - Documentar en `PROGRESS.md` cómo se registra hoy el consentimiento (tabla, columnas, versión,
    cifrado) y qué datos existentes deben migrarse a `consent_records` como `channel='registro'`
    con `document_version='legacy'`. No migrar aún; solo diseñar el backfill.
  - Registrar en `DECISIONS.md` cualquier incompatibilidad.
  - **Aceptación:** plan de backfill escrito; ninguna modificación de código.

## Fase 1 · Fundamentos criptográficos y de identidad

- [ ] **T02 — Módulo `_shared/crypto.ts` con versionado de claves** (SEC-04)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: AES-256-GCM, AAD opcional con marca `aad:true`, HMAC con clave propia, lectura de cifrados anteriores sin AAD, versión de clave en el payload y `_V{n}` (`_shared/crypto.ts`, 8 pruebas). Falta: formato `v{n}.{iv}.{ct}` (se mantuvo el JSON existente `{v,alg,iv,tag,ct}`: desviación pendiente de aprobar), AAD obligatoria, `pii.ts` delegando en `crypto.ts`, pruebas "leer v1 con activa v2" y "clave mal formada sin filtrar la clave".
  - AES-256-GCM, formato `v{n}.{iv}.{ct}`, AAD obligatoria, HMAC con clave distinta.
  - Compatibilidad: si `_shared/pii.ts` tiene formato previo, `decrypt` lo lee (legacy = v0) y
    `encrypt` siempre usa la versión activa. `pii.ts` pasa a delegar en `crypto.ts`.
  - **Tests:** ida y vuelta; AAD distinta falla; texto manipulado falla; leer v1 con activa v2;
    HMAC estable y distinto al usar otra clave; clave mal formada → error claro sin filtrar la clave.

- [ ] **T03 — `_shared/client-ip.ts` y verificación empírica de cabeceras** (REQ-05)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: `_shared/client-ip.ts` (toma la entrada que añadió el proxy de confianza, `TRUSTED_PROXY_HOPS`; normaliza y valida IPv4/IPv6; 8 pruebas), medición LOCAL de cabeceras (el proxy añade al final; `X-Real-IP` lo fija el proxy), IP de body ignorada con evento (en `secure-register-user`). Falta: `maskIp`, IPv4-mapped→IPv4 y zona IPv6, medición en hospedado (D-08; método en `.claude/loops/consentimiento/diag/`, no `scripts/diag-headers/`).
  - En modo headless no se pueden levantar servidores de larga duración: implementar según la
    documentación oficial de Supabase y dejar en `DECISIONS.md` una verificación **D-08** para que
    un humano confirme en staging qué cabecera trae la IP real (con un script de diagnóstico que
    devuelva solo los NOMBRES de cabeceras, entregado en `scripts/diag-headers/` y NO desplegado).
    Esta verificación no bloquea la tarea, pero sí bloquea el paso a producción (T99).
  - `getClientIp(req)`: cabecera de confianza, normalización IPv4/IPv6 (IPv4-mapped → IPv4,
    minúsculas, sin zona), validación; devuelve `null` si no es válida.
  - `maskIp(ip)`: IPv4 → `a.b.c.xxx`; IPv6 → primeros 3 hextetos + `xxxx::`.
  - **Tests:** XFF con varias IP, IPv6, IPv4-mapped, cabecera ausente, valor basura, body con `ip`.

- [ ] **T04 — Verificación de identidad y roles** (SEC-01, SEC-02)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: tabla `admin_roles` con RLS y `has_privacy_role()` (073). Falta: `_shared/auth-guard.ts` (`requireUser`/`requireRole`) y sus pruebas negativas.
  - `_shared/auth-guard.ts`: `requireUser(req)` verificando JWT criptográficamente;
    `requireRole(req, roles[])` consultando `admin_roles`.
  - Migración: tabla `admin_roles` con RLS.
  - **Tests negativos obligatorios:** sin token, token con firma alterada, token expirado,
    token con claim `role: service_role` forjado, usuario sin rol, rol insuficiente.

- [ ] **T05 — Identidad individual en `central-admin-app` para este módulo** (SEC-03, H08) ⛔ BLOQUEADA (D-01)
  - Según D-01: login del admin con Supabase Auth (y MFA si procede) y envío del JWT del admin
    a `admin-consent`; las rutas del módulo no usan el proxy con service role.
  - **Aceptación:** una acción del módulo queda atribuida al `actor_id` del admin real;
    las credenciales Basic Auth compartidas ya no bastan para el módulo.

## Fase 2 · Modelo de datos

- [ ] **T06 — Migración: `privacy_settings`, `consent_documents`** (REQ-01, REQ-02, REQ-03, REQ-14)
  - **Estado real (2026-09-28):** CASI. Hecho: `privacy_settings` versionable (075: sin `is_current`, vigente = mayor versión, trigger de versión siguiente) y `consent_documents` (inmutabilidad, única publicada); aviso real del seed cargable y publicable en local (`supabase/tests/consent/load_seed_aviso.cjs`); pruebas SQL de inmutabilidad, única publicada y versionado. Falta: seed integrado en `supabase db reset` (hoy es un script aparte), pruebas "borrador sí editable" y "retirar deja sin publicada solo si se publica otra en la misma transacción" (esa regla no está implementada).
  - Triggers de inmutabilidad de versión no-borrador; índice de única publicada.
  - Seed de desarrollo: settings v1 con valores ficticios (`privacidad@example.test`) y
    documento v1.0 `published` cargado desde `seed/aviso_consentimiento_v1.0.md`.
    El correo real del aviso se carga luego desde el panel, no desde el seed.
  - **Tests SQL:** no se puede editar contenido publicado; no puede haber 2 publicadas;
    borrador sí editable; retirar deja sin publicada solo si se publica otra en la misma transacción.

- [ ] **T07 — Migración: `consent_records` + cadena de integridad** (REQ-04, REQ-18, SEC-06)
  - **Estado real (2026-09-28):** CASI. Hecho: `consent_records`, cadena de hash con advisory lock, append-only (trigger + REVOKE), vista `my_consent_state`, `verify_consent_chain()`, y (074) baja/retención sin romper la cadena; `lifecycle.sql`. Falta: pruebas de UPDATE/DELETE como `authenticated` y como `service_role`, e inserciones concurrentes.
  - Trigger `BEFORE INSERT` que calcula `prev_hash`/`row_hash` con advisory lock.
  - Trigger anti UPDATE/DELETE; `REVOKE`; vista `my_consent_state` sin IP/UA.
  - Funciones `verify_consent_chain()`.
  - **Tests SQL:** UPDATE y DELETE fallan para `authenticated` y para `service_role`;
    alterar una fila directamente (como superusuario en test) hace que `verify_consent_chain`
    reporte la fila exacta; inserciones concurrentes mantienen cadena válida.

- [ ] **T08 — Migración: `admin_audit_log`, `data_subject_requests`** (REQ-10, REQ-16, SEC-06)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: `admin_audit_log` append-only con cadena y `verify_audit_chain()`; `data_subject_requests` con `next_case_number()`. Falta: UPDATE de `data_subject_requests` solo de `status`/`resolved_at`/`resolution_note_ciphertext` vía función con rol y bitácora; `case_number` secuencial POR AÑO (hoy una secuencia global con prefijo de año); pruebas equivalentes a T07.
  - Misma estrategia append-only para la bitácora; `data_subject_requests` permite UPDATE solo de
    `status`, `resolved_at`, `resolution_note_ciphertext` vía función con rol y bitácora.
  - Generador de `case_number` secuencial por año.
  - `verify_audit_chain()`.
  - **Tests SQL** equivalentes a T07.

## Fase 3 · Backend

- [ ] **T09 — `get-consent-notice`** (REQ-02, SEC-08)
  - **Estado real (2026-09-28):** CASI. Hecho: `get-consent-notice` con render de los 11 marcadores del aviso (`_shared/consent-render.ts`), marcador desconocido o sin valor → error `NOTICE_INVALID` (nunca silencioso), huella sobre el texto renderizado, 11 pruebas del renderizador incluido el seed real. Falta: prueba propia de la función (hoy solo punta a punta local) y la sanitización del Markdown (se hace en cliente, T18).
  - Render de marcadores con settings vigentes; marcador desconocido → error en borrador,
    nunca en producción silenciosa; sanitización; `rendered_sha256` sobre el Markdown renderizado.
  - **Tests:** huella estable; cambia si cambia settings; marcador faltante detectado.

- [ ] **T10 — Registro con evidencia atómica** (REQ-04, REQ-05, REQ-06 backend, REQ-07, SEC-07)
  - **Estado real (2026-09-28):** CASI. Hecho: registro con evidencia atómica (una fila por finalidad, IP/UA cifrados con AAD, compensación), 409 por huella, obligatoria exigida, `ip` del body ignorada + evento, 503 fail-closed (`RATE_LIMIT_UNAVAILABLE`), puerta de 15 años. Falta: validación de esquema (SEC-08) y el código `NOTICE_CHANGED` en mayúsculas de la SPEC (hoy `notice_changed`).
  - Modificar `secure-register-user`: validación de esquema; 409 `NOTICE_CHANGED` si la huella no
    coincide; rechazo si `registro_aprendizaje` ≠ `granted`; insertar una fila por finalidad
    (incluidas las `denied`); IP/UA cifrados con AAD; compensación si falla evidencia.
  - Rate limit con clave HMAC, fail-closed.
  - **Tests:** registro feliz (3 filas), opcionales rechazadas (filas `denied`), obligatoria
    rechazada (sin usuario creado), huella vieja (409), `ip` en body ignorada + evento de seguridad,
    fallo simulado de inserción → usuario eliminado.

- [ ] **T11 — `update-my-consent` y `submit-consent`** (REQ-08, REQ-09)
  - **Tests:** revocar opcional crea fila `revoked`; no se puede revocar la obligatoria por esta vía
    (debe ir a baja); re-consentimiento solo si hay versión nueva con `requires_reconsent`.

- [ ] **T12 — Abstracción de correo** (REQ-10, SEC-09) ⛔ BLOQUEADA (D-05) si no existe proveedor
  - **Estado real (2026-09-28):** Sin iniciar. Hallazgo de T00: el repo ya usa Resend (clave `resend_api_key` en Vault vía `app_secrets`; ver `championship-draw-round1`, `check-security-alerts`). D-05 no debería bloquear.
  - Interfaz `EmailSender` con implementación del proveedor elegido y `FakeEmailSender` para tests.
  - Plantillas: aviso al delegado, acuse al titular, código de verificación de correo.
  - **Tests:** asunto sin saltos de línea; plantilla del delegado no contiene correo/IP del titular
    más allá del número de caso y tipo (ver D-06 si se desea incluir el correo).

- [ ] **T13 — `request-data-subject-right`** (REQ-10, REQ-11)
  - **Estado real (2026-09-28):** Sin iniciar. Existe el helper `prepareDsrRow()` (`_shared/consent-evidence.ts`): el UUID del caso se genera antes del insert para construir la AAD.
  - Crea caso con `routed_to_email` = correo vigente y `due_at` según `response_days` y tipo de día.
  - **Tests:** caso creado, 2 correos en `FakeEmailSender`, fecha límite correcta (incluye caso
    con fin de semana si D-03 = hábiles), rate limit.

- [ ] **T14 — `admin-consent`: versiones y publicación** (REQ-01, REQ-13 a–d, SEC-02)
  - Acciones de borrador, diff, preview, publish (transacción: retira vigente + publica nueva),
    retire; motivo obligatorio; cuatro ojos si está activo; bitácora con before/after.
  - **Tests:** editor no publica; admin publica; con cuatro ojos el autor no publica su borrador;
    cada acción deja 1 fila de bitácora con actor correcto.

- [ ] **T15 — `admin-consent`: configuración y verificación del correo del delegado** (REQ-14, REQ-15)
  - **Estado real (2026-09-28):** Sin iniciar. Existe la tabla `privacy_email_verifications` (075) con guardas; falta la función `admin-consent`.
  - `update_settings` crea nueva `settings_version`; cambio de `privacy_email` pasa a pendiente;
    `confirm_email_verification` con código (hash, 30 min, 5 intentos).
  - **Tests:** correo no cambia sin código; código expirado/erróneo; intentos agotados;
    bitácora con before/after sin exponer el código.

- [ ] **T16 — `admin-consent`: bitácora, evidencia, revelación de IP, solicitudes, cadenas** (REQ-16, REQ-17, REQ-18)
  - **Tests:** búsqueda por correo usa HMAC; IP enmascarada por defecto; `reveal_ip` exige
    `privacy_admin` + motivo y registra; auditor no puede revelar; export CSV registrado;
    cambio de estado de solicitud registrado; `verify_chains` devuelve OK.

- [ ] **T17 — Job de retención** (REQ-19, REQ-20) ⛔ BLOQUEADA (D-02)
  - **Estado real (2026-09-28):** Sin iniciar. Existe el mecanismo en BD: bandera de sesión acotada a poner en NULL `user_id`/`ip_ciphertext`/`ua_ciphertext` y la cadena que no los cubre (074). Falta el job y la decisión D-02.
  - **Tests:** registros más antiguos que el plazo quedan sin IP/UA cifrados pero con HMAC y
    cadena verificable (la cadena debe calcularse sobre campos no purgables o re-anclarse de forma
    documentada: decidir en esta tarea y justificar en `PROGRESS.md`).

## Fase 4 · Frontend de usuario

- [ ] **T18 — Pantalla de registro con aviso dinámico** (REQ-06, REQ-12)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: pantalla de registro con el aviso como primera pantalla, casillas desmarcadas, "No acepto" → portada, puerta de edad con bloqueo (D-04 opción A propuesta), 409 → recarga del aviso, 503 con mensaje; `register.spec.ts` 11/11 en 3 perfiles. Falta: Markdown sanitizado (hoy texto plano: `##` y `**` se ven en crudo), botón deshabilitado hasta marcar la obligatoria, enlace a la política antes del formulario, `aria-live`, pruebas unitarias del componente.
  - Consumir `get-consent-notice`; renderizar Markdown sanitizado; casillas desmarcadas;
    «Aceptar y continuar» deshabilitado hasta marcar la obligatoria; «No aceptar y salir»;
    enlace a política antes del formulario; puerta de edad según D-04; manejo de 409 (recargar aviso).
  - Accesibilidad: casillas con `label` asociado, navegación por teclado, foco visible,
    mensajes de error anunciados (`aria-live`).
  - **Tests** (unitarios + Playwright): casillas desmarcadas al cargar; no se envía sin la
    obligatoria; payload incluye huella; no incluye IP.

- [ ] **T19 — "Mi privacidad" en la cuenta** (REQ-08, REQ-10)
  - Estado por finalidad, versión aceptada, fecha; interruptores de opcionales; formulario de
    solicitud de derechos con tipo; muestra número de caso y fecha límite.
  - **Tests E2E:** revocar publicidad en un clic; solicitar baja muestra número de caso.

- [ ] **T20 — Re-consentimiento al iniciar sesión** (REQ-09)
  - **Tests E2E:** publicar v1.1 con reconsent → siguiente login muestra aviso; aceptar continúa;
    rechazar la obligatoria solo permite baja o cerrar sesión.

## Fase 5 · Panel administrativo — sección "Consentimiento informado"

- [ ] **T21 — Navegación y pestaña Versiones + Editor** (REQ-13 a, b)
  - Menú "Consentimiento informado"; lista de versiones; crear borrador desde vigente; editor
    Markdown con vista previa en vivo (marcadores resueltos y resaltados si faltan);
    editor de finalidades (código inmutable para las existentes); guardado con autosave del
    borrador y aviso de cambios sin guardar.

- [ ] **T22 — Comparar y Publicar** (REQ-13 c, d)
  - Diff lado a lado; modal de publicación con motivo, casilla `requires_reconsent`,
    confirmación escribiendo la versión; resumen de impacto (nº de usuarios que verán re-consentimiento).

- [ ] **T23 — Configuración del responsable y delegado** (REQ-14, REQ-15)
  - Formulario con todos los campos; flujo de verificación del nuevo correo con estado
    "pendiente de verificación"; historial de versiones de configuración.

- [ ] **T24 — Bitácora, Evidencia y Solicitudes** (REQ-16, REQ-17, REQ-11)
  - Bitácora con filtros y detalle before/after (diff); export CSV.
  - Evidencia: búsqueda, historial, IP enmascarada, "Revelar IP" con motivo; export de expediente.
  - Solicitudes: tabla con semáforo (vigente / ≤3 días / vencida), cambio de estado con nota.
  - Botón "Verificar integridad".
  - **Tests E2E del panel:** editor no ve botón Publicar; auditor no ve "Revelar IP";
    cada acción aparece en bitácora.

## Fase 6 · Migración, documentación y cierre

- [ ] **T25 — Backfill de consentimientos legacy** (según plan T01)
  - Migración idempotente; evidencia legacy marcada `document_version='legacy'`, sin inventar IP.

- [ ] **T98 — Documentación** (H14)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: `PROGRESS.md`, `PLAN_PRODUCCION_074_075.md` (release único, con respaldo), `diag/README.md`. Falta: `SECURITY_PRIVACY.md`, manual administrativo, `BASE_DE_DATOS.md`, `.env.example`, rotación de claves, runbook de bajas, lista para legal.
  - Actualizar `SECURITY_PRIVACY.md`, manual administrativo (sección nueva con capturas o pasos),
    `BASE_DE_DATOS.md`, `.env.example`; procedimiento de rotación de claves; runbook de atención
    de solicitudes de baja; lista de lo que debe completar el área legal antes de publicar.

- [ ] **T99 — Verificación final**
  - `gates.sh` completo en verde; `verify_consent_chain()` y `verify_audit_chain()` OK sobre seed;
    búsqueda de `decodeJwtRole` sin usos nuevos; búsqueda de `console.log` con PII en archivos
    tocados; checklist de REQ/SEC en `PROGRESS.md` con evidencia (test o archivo) por requisito;
    lista de pendientes para producción (secretos a crear, config de proxy, decisiones abiertas).

---

## Tareas añadidas durante la ejecución

Nombres fuera de la numeración original (`Tnn-extra`, según PROMPT.md). Ojo: **T14-fix no tiene relación con T14** (`admin-consent`): es el arreglo del versionado de `privacy_settings`.

- [ ] **T02-extra — Migrar `users.email_encrypted` y `full_name_encrypted` a AAD** cuando se actualicen sus lectores
  - AAD `users:<columna>:<user_id>`. Lectores a actualizar: `_shared/pii.ts`, `get-ranking` y copias inline. Re-cifrado por lotes; leer con y sin AAD durante la transición.
  - Depende de T02.
- [ ] **T03-prod — Medir la cabecera de IP en Supabase hospedado** (D-08)
  - Método: consulta del Logs Explorer y, solo si no alcanza, función de diagnóstico con JWT de admin (ver `.claude/loops/consentimiento/diag/README.md`). Fijar `TRUSTED_PROXY_HOPS` o pasar a `cf-connecting-ip`.
  - Bloquea el paso a producción (T99). Requiere una acción humana en producción.
- [ ] **T03-sec — [P0] Rate limit y `security_events` con la cabecera de confianza, no la primera entrada de X-Forwarded-For**
  - Hoy `extractClientIp` toma la primera entrada, que controla el cliente: rotándola se evade el límite por IP (también el del registro). Unificar con `_shared/client-ip.ts`.
  - Depende de T03-prod (con la topología equivocada todos compartirían un solo bucket).
- [x] **T14-fix — Versionado de `privacy_settings`** (migración 075) — hecha
  - Sin `is_current` ni SECURITY DEFINER; `privacy_email_verifications` actualizable y acotada; `supabase/tests/consent/settings_versioning.sql`. Pendiente solo de aplicar en producción, dentro del release único.
