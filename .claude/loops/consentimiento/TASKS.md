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

- [x] **T01 — Inventario de consentimiento actual** (hecha 2026-09-28: ver Iteración 2 en PROGRESS.md; incompatibilidades en D-10 y D-11)
  - **Estado real (2026-09-28):** Sin iniciar como tarea (no hay plan de backfill escrito). Hoy: `users.data_processing_authorized`/`_at`, `privacy_notice_version` (constante hardcodeada `2026-06-22` hasta la Fase 1) y PII cifrada con `PII_ENCRYPTION_KEY_B64`.
  - Documentar en `PROGRESS.md` cómo se registra hoy el consentimiento (tabla, columnas, versión,
    cifrado) y qué datos existentes deben migrarse a `consent_records` como `channel='registro'`
    con `document_version='legacy'`. No migrar aún; solo diseñar el backfill.
  - Registrar en `DECISIONS.md` cualquier incompatibilidad.
  - **Aceptación:** plan de backfill escrito; ninguna modificación de código.

## Fase 1 · Fundamentos criptográficos y de identidad

- [ ] **T02 — Módulo `_shared/crypto.ts` con versionado de claves** (SEC-04)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: AES-256-GCM, AAD opcional con marca `aad:true`, HMAC con clave propia, lectura de cifrados anteriores sin AAD, versión de clave en el payload y `_V{n}` (`_shared/crypto.ts`, 8 pruebas). El formato es el JSON existente `{v,alg,iv,tag,ct}`: **D-09 = A (decidida), SPEC 1.1 ya lo dice; no es una desviación**. Falta: AAD obligatoria para columnas nuevas, `pii.ts` delegando en `crypto.ts`, pruebas "leer v1 con activa v2" y "clave mal formada sin filtrar la clave".
  - AES-256-GCM, formato JSON existente `{v,alg,iv,tag,ct}` con marca `aad` (D-09), AAD obligatoria en columnas nuevas, HMAC con clave distinta.
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

- [ ] **T05 — Identidad individual en `central-admin-app` para este módulo** (SEC-03, H08)
  - **Estado:** desbloqueada por **D-01 = A** (Supabase Auth + TOTP, JWT del admin hacia `admin-consent`, roles en `admin_roles`). Depende de T04 (`auth-guard.ts`), aún sin hacer.
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

- [ ] **T12 — Correo saliente: transporte configurable y `EmailSender`** (REQ-21 backend, REQ-10, SEC-09)
  - **Estado real (2026-09-28):** desbloqueada por **D-05** (transporte configurable desde el panel). Sin iniciar. Hallazgo de T00: el repo ya usa Resend (`resend_api_key` en Vault vía `app_secrets`; `championship-draw-round1`, `check-security-alerts`), que es el modo por defecto. Depende de T02 (AAD), T04 (`auth-guard`) y T08 (bitácora).
  - **Migración** (siguiente número libre; patrón de la 075): `email_transport_settings` versionada solo con INSERT (trigger de versión siguiente; sin UPDATE/DELETE), `email_transport_tests` (resultado de cada correo de prueba, sin datos sensibles), `email_outbox` (avisos pendientes: sin correo ni datos del titular en la fila). RLS sin acceso para `anon`/`authenticated`. Prueba SQL autoverificable en `supabase/tests/consent/` y puerta en `gates.sh`.
  - **`_shared/email/`**: interfaz `EmailSender`; `ResendSender` (reutiliza `resend_api_key` de `app_secrets`; la clave no se expone ni se edita desde el panel); `SmtpSender` con una librería **mantenida** (elegirla en la tarea y justificarla en `PROGRESS.md`), puerto 465 con SSL/TLS; `FakeEmailSender` para pruebas.
  - **Contraseña SMTP:** cifrada con `crypto.ts`, AAD `email_transport_settings:password:<settings_version>`, lectura con `allowLegacy:false`. Nunca se devuelve al cliente: la API responde `password_set`; para cambiarla hay que escribir una nueva.
  - **Anti-SSRF** (`_shared/email/ssrf-guard.ts`): resolver el DNS y rechazar IP privadas, loopback, link-local y de metadatos (incluido IPv4-mapped de IPv6); conectar a la IP validada, sin volver a resolver; solo puertos 465 y 2525; el 587 (y el 25) se rechazan con un mensaje claro: "Supabase bloquea los puertos 25 y 587; usa 465 con SSL/TLS".
  - **Acciones de `admin-consent`** (solo `privacy_admin`; comparten el archivo con T14–T16, pero aquí solo las de correo): `get_email_transport`, `update_email_transport`, `send_test_email` (al correo del admin conectado, con rate limit HMAC fail-closed; guarda fecha y resultado en `email_transport_tests`), `list_pending_emails`, `resend_pending_emails`. Bitácora con before/after **sin la contraseña** (solo "contraseña cambiada: sí/no").
  - **Degradación:** si el modo activo falla o no está configurado, quien llama (T13) registra la solicitud igual y deja el aviso en `email_outbox` como pendiente; la API del panel expone el contador para el banner (T23b).
  - **Plantillas:** aviso al delegado (solo número de caso, tipo, fecha límite y enlace al panel: **D-06, sin el correo del titular**), acuse al titular, código de verificación de correo (no se encola: si falla se informa al instante).
  - **Aviso semilla:** proponer en §4 de `seed/aviso_consentimiento_v1.0.md` la declaración de Resend como proveedor con transferencia internacional (EE. UU.), marcada como texto a validar con asesoría legal (REQ-21 h); el anexo del PDF lo actualiza quien lo mantiene.
  - **Tests obligatorios:** la contraseña no aparece en **ninguna** respuesta ni log (revisar respuestas de `get/update`, errores, `console.*` y bitácora); host privado rechazado (10.x, 127.x, 169.254.x, metadatos, ::1, IPv4-mapped, y un nombre que resuelve a IP privada); puerto 587 rechazado con el mensaje claro; si el envío falla, la solicitud igual se registra y queda como pendiente; el correo de prueba queda en bitácora; asunto sin saltos de línea; la plantilla del delegado no contiene el correo ni la IP del titular; con `FakeEmailSender` el reenvío marca los pendientes como enviados.

- [ ] **T13 — `request-data-subject-right`** (REQ-10, REQ-11)
  - **Estado real (2026-09-28):** Sin iniciar. Existe el helper `prepareDsrRow()` (`_shared/consent-evidence.ts`): el UUID del caso se genera antes del insert para construir la AAD.
  - Crea caso con `routed_to_email` = correo vigente y `due_at` = recepción + `response_days` **días calendario** (D-03; sin tabla de feriados). La columna `response_day_type` que trae la migración 073 queda sin uso: retirarla en una migración nueva cuando toque (no editar la 073).
  - Si el envío del correo falla, el caso **se registra igual**, el titular ve su número de caso y el aviso queda pendiente en `email_outbox` (T12).
  - **Tests:** caso creado, 2 correos en `FakeEmailSender`, fecha límite correcta en días calendario (incluye un plazo que cruza fin de semana: cuenta igual), rate limit, y **envío fallido → caso registrado + aviso pendiente**.

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

- [ ] **T23b — Panel: sección "Correo saliente"** (REQ-21, SEC-03)
  - Sección "Correo saliente" dentro de "Consentimiento informado", **visible y operable solo para `privacy_admin`** (editor y auditor no la ven).
  - Formulario: modo (`resend` por defecto | `smtp`), host, puerto, seguridad SSL/TLS, usuario, contraseña, nombre y correo del remitente, reply-to, habilitado. La clave de Resend no aparece ni se edita. La contraseña se muestra como "configurada / no configurada" y solo se puede reemplazar escribiendo una nueva; nunca viaja de vuelta al navegador.
  - Aviso en pantalla: "Supabase bloquea los puertos 25 y 587; usa 465 con SSL/TLS". Botón "Enviar correo de prueba" (al admin conectado) con el último resultado (fecha y ok/error corto).
  - Banner **"Correo no configurado / con errores"** con el contador de avisos pendientes y el botón para reenviarlos; visible en la pestaña Solicitudes y en la cabecera de la sección.
  - Historial de versiones de la configuración (sin contraseñas) con quién y cuándo.
  - **Tests E2E del panel:** editor y auditor no ven la sección; la contraseña no aparece en el DOM, en las respuestas de red ni tras guardar; el banner aparece con el modo roto y desaparece tras reenviar; el correo de prueba queda en la bitácora. Depende de T12 y T05.

- [ ] **T24 — Bitácora, Evidencia y Solicitudes** (REQ-16, REQ-17, REQ-11)
  - Bitácora con filtros y detalle before/after (diff); export CSV.
  - Evidencia: búsqueda, historial, IP enmascarada, "Revelar IP" con motivo; export de expediente.
  - Solicitudes: tabla con semáforo (vigente / ≤3 días / vencida), cambio de estado con nota.
  - Botón "Verificar integridad".
  - **Tests E2E del panel:** editor no ve botón Publicar; auditor no ve "Revelar IP";
    cada acción aparece en bitácora.

## Fase 6 · Migración, documentación y cierre

- [ ] **T25 — Backfill de consentimientos legacy** (según plan T01) ⛔ BLOQUEADA (D-10, D-11)
  - **Ajuste tras T01 (D-11):** no es una migración SQL sino una función/script de un solo uso (necesita `LOOKUP_HMAC_KEY_B64`); idempotente, con `--dry-run`, en lotes. Evidencia legacy marcada con `document_version LIKE 'legacy%'` (esperado `legacy-2026-06-22`), sin inventar IP (`ip_hmac` nulo, requiere migración nueva). Diseño completo en PROGRESS.md, Iteración 2.

- [ ] **T98 — Documentación** (H14)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: `PROGRESS.md`, `PLAN_PRODUCCION_074_075.md` (release único, con respaldo), `diag/README.md`. Falta: `SECURITY_PRIVACY.md`, manual administrativo, `BASE_DE_DATOS.md`, `.env.example`, rotación de claves, runbook de bajas, lista para legal.
  - Incluir el correo saliente (REQ-21): configuración, rotación de la contraseña SMTP, qué hacer con el banner de avisos pendientes; y la mención de Resend (transferencia internacional) en el aviso.
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
  - Solo añade AAD a las columnas antiguas, **sin cambiar de formato** (D-09 = A). AAD `users:<columna>:<user_id>`. Lectores a actualizar: `_shared/pii.ts`, `get-ranking` y copias inline. Re-cifrado por lotes; leer con y sin AAD durante la transición.
  - Depende de T02.
- [ ] **T03-prod — Medir la cabecera de IP en Supabase hospedado** (D-08) ⛔ BLOQUEADA (D-08: pendiente de que la persona responsable ejecute la consulta del Logs Explorer)
  - Método: consulta del Logs Explorer y, solo si no alcanza, función de diagnóstico con JWT de admin (ver `.claude/loops/consentimiento/diag/README.md`). Fijar `TRUSTED_PROXY_HOPS` o pasar a `cf-connecting-ip`.
  - Bloquea el paso a producción (T99). Requiere una acción humana en producción.
- [ ] **T03-sec — [P0] Rate limit y `security_events` con la cabecera de confianza, no la primera entrada de X-Forwarded-For** ⛔ BLOQUEADA (D-08 / T03-prod)
  - Hoy `extractClientIp` toma la primera entrada, que controla el cliente: rotándola se evade el límite por IP (también el del registro). Unificar con `_shared/client-ip.ts`.
  - Depende de T03-prod (con la topología equivocada todos compartirían un solo bucket).
- [x] **T14-fix — Versionado de `privacy_settings`** (migración 075) — hecha
  - Sin `is_current` ni SECURITY DEFINER; `privacy_email_verifications` actualizable y acotada; `supabase/tests/consent/settings_versioning.sql`. Pendiente solo de aplicar en producción, dentro del release único.
- [ ] **T00-extra — [P1] Migraciones no reproducibles desde cero**
  - La migración 004 usa una columna (`users.role`) antes de crearla: `supabase db reset` falla en Postgres 17. Proponer una **migración base** con `supabase db dump --schema-only` (revisada) y reactivar `db-reset` en `gates.sh` (hoy SKIP explícito, ver línea base en `PROGRESS.md`).
  - **No editar migraciones existentes sin aprobación explícita.** Es una propuesta: describir el enfoque (base + qué migraciones se archivan o se marcan como aplicadas), cómo se comprueba que el esquema resultante es idéntico al de producción, y esperar el visto bueno antes de tocar nada.
