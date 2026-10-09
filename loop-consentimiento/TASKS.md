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
  - Documentar en `PROGRESS.md` cómo se registra hoy el consentimiento (tabla, columnas, versión,
    cifrado) y qué datos existentes deben migrarse a `consent_records` como `channel='registro'`
    con `document_version='legacy'`. No migrar aún; solo diseñar el backfill.
  - Registrar en `DECISIONS.md` cualquier incompatibilidad.
  - **Aceptación:** plan de backfill escrito; ninguna modificación de código.

## Fase 1 · Fundamentos criptográficos y de identidad

- [x] **T02 — Módulo `_shared/crypto.ts` con versionado de claves** (SEC-04) (hecha 2026-09-28, iteración 4)
  - **Estado:** cerrada. AES-256-GCM con el JSON existente `{v,alg,iv,tag,ct}` (+ `aad`, D-09); AAD obligatoria en columnas nuevas; HMAC con clave propia; versión de clave en el payload.
  - **Desviación:** "`pii.ts` pasa a delegar en `crypto.ts`" se movió a T02-extra (`pii.ts` sigue sin versionar en git).

- [x] **T03 — `_shared/client-ip.ts` y verificación empírica de cabeceras** (REQ-05) (hecha 2026-09-30, iteración 18; medición en Supabase hospedado sigue en `T03-prod`, D-08)
  - **Falta:** medición de la cabecera real en el proyecto hospedado (ver `T03-prod`, bloqueada en D-08) y su dependiente `T03-sec`.
  - En modo headless no se pueden levantar servidores de larga duración: implementar según la
    documentación oficial de Supabase y dejar en `DECISIONS.md` una verificación **D-08** para que
    un humano confirme en staging qué cabecera trae la IP real (con un script de diagnóstico que
    devuelva solo los NOMBRES de cabeceras, entregado en `scripts/diag-headers/` y NO desplegado).
    Esta verificación no bloquea la tarea, pero sí bloquea el paso a producción (T99).
  - `getClientIp(req)`: cabecera de confianza, normalización IPv4/IPv6 (IPv4-mapped → IPv4,
    minúsculas, sin zona), validación; devuelve `null` si no es válida.
  - `maskIp(ip)`: IPv4 → `a.b.c.xxx`; IPv6 → primeros 3 hextetos + `xxxx::`.
  - **Tests:** XFF con varias IP, IPv6, IPv4-mapped, cabecera ausente, valor basura, body con `ip`.

- [x] **T04 — Verificación de identidad y roles** (SEC-01, SEC-02) (hecha 2026-09-29, iteración 15)
  - **Estado:** cerrada. `_shared/auth-guard.ts` con `requireUser`/`requireRole` contra `admin_roles`; pendiente para T05/T14 confirmar que el proyecto hospedado firma con claves asimétricas (ver PROGRESS_ARCHIVO.md, iteración 15).
  - `_shared/auth-guard.ts`: `requireUser(req)` verificando JWT criptográficamente;
    `requireRole(req, roles[])` consultando `admin_roles`.
  - Migración: tabla `admin_roles` con RLS.
  - **Tests negativos obligatorios:** sin token, token con firma alterada, token expirado,
    token con claim `role: service_role` forjado, usuario sin rol, rol insuficiente.

- [x] **T05 — Identidad individual en `central-admin-app` para este módulo** (SEC-03, H08) (hecha 2026-09-30: T05.a iteración 16, T05.b iteración 17)
  - **Estado:** desbloqueada por **D-01 = A** (Supabase Auth + TOTP, JWT del admin hacia `admin-consent`, roles en `admin_roles`). Depende de T04 (`auth-guard.ts`), aún sin hacer.
  - Según D-01: login del admin con Supabase Auth (y MFA si procede) y envío del JWT del admin
    a `admin-consent`; las rutas del módulo no usan el proxy con service role.
  - **Aceptación:** una acción del módulo queda atribuida al `actor_id` del admin real;
    las credenciales Basic Auth compartidas ya no bastan para el módulo.
  - **División (2026-09-29, antes de codificar):** la tarea abarca backend, proxy del panel y UI; se parte en dos.
  - [x] **T05.a — Identidad individual: backend y proxy del panel** (hecha 2026-09-30, iteración 16)
    - `auth-guard.ts`: `requireRole` exige `aal = aal2` (TOTP verificado) → 403 `mfa_required`.
    - `admin-consent` (esqueleto; T14–T16 añaden el resto): `POST /session` con `requireRole` (cualquier rol del módulo)
      que registra `admin.session_verified` en `admin_audit_log` con el `actor_id` real (la service role solo es transporte;
      la bitácora no admite escrituras de `authenticated`). Falla cerrado si no puede registrar. `verify_jwt = true`.
    - `central-admin-app/server.js`: rutas `/api/privacy/auth/*` (lista cerrada: token por contraseña/refresh, `user`,
      `logout`, alta/desafío/verificación de factor; clave `anon`, nunca service role) y `/api/privacy/fn/admin-consent/*`
      (JWT del admin en `X-Admin-Session` → `Authorization: Bearer`; sin él, 401 sin llegar a Supabase). El proxy con
      service role rechaza (403) las tablas y RPC del módulo (ruta y query decodificadas, incluidos los embebidos de
      PostgREST), la función `admin-consent` y todo `/api/auth/v1/` (no lo usa `app.js`; con service role permitiría
      borrar el TOTP de un admin o generarle un enlace de acceso).
    - **Aceptación:** pruebas negativas de cada ruta; la acción `admin.session_verified` queda con el `actor_id` del
      token verificado; Basic Auth sola no alcanza ninguna tabla, RPC ni función del módulo.
  - [x] **T05.b — UI del panel: login individual con TOTP** (depende de T05.a) (hecha 2026-09-30, iteración 17; TOTP del proyecto hospedado sin confirmar, ver PROGRESS.md)
    - Pantalla de acceso del módulo (correo + contraseña), alta del factor TOTP (QR) si no existe, verificación del
      código, identidad y roles visibles, cierre de sesión. Token solo en memoria (no `localStorage`).
    - TOTP habilitado en `config.toml` local (`[auth.mfa.totp]`); confirmar que está habilitado en el proyecto hospedado.
    - **Aceptación:** prueba punta a punta contra Supabase local con un código TOTP real: login → aal2 →
      `admin.session_verified` con el `actor_id` del admin.

## Fase 2 · Modelo de datos

- [x] **T06 — Migración: `privacy_settings`, `consent_documents`** (REQ-01, REQ-02, REQ-03, REQ-14) (hecha 2026-09-30, iteración 19)
  - **Estado:** cerrada. `privacy_settings` versionable (075) y `consent_documents` con trigger de inmutabilidad + índice de única publicada (073) + regla de no-hueco al retirar sin reemplazo (077, restricción DIFERIBLE).
  - Triggers de inmutabilidad de versión no-borrador; índice de única publicada.
  - Seed de desarrollo: settings v1 con valores ficticios (`privacidad@example.test`) y
    documento v1.0 `published` cargado desde `seed/aviso_consentimiento_v1.0.md`.
    El correo real del aviso se carga luego desde el panel, no desde el seed.
  - **Tests SQL:** no se puede editar contenido publicado; no puede haber 2 publicadas;
    borrador sí editable; retirar deja sin publicada solo si se publica otra en la misma transacción.

- [x] **T07 — Migración: `consent_records` + cadena de integridad** (REQ-04, REQ-18, SEC-06) (hecha 2026-09-30, iteración 21)
  - **Estado:** cerrada. `consent_records` con cadena de hash (advisory lock), append-only, `verify_consent_chain()`; hallazgo de cierre: `prereqs.sql` necesitaba `BYPASSRLS` explícito en `service_role` para que las pruebas de mutación fallaran por la razón correcta (no por `UPDATE 0`).
  - Trigger `BEFORE INSERT` que calcula `prev_hash`/`row_hash` con advisory lock.
  - Trigger anti UPDATE/DELETE; `REVOKE`; vista `my_consent_state` sin IP/UA.
  - Funciones `verify_consent_chain()`.
  - **Tests SQL:** UPDATE y DELETE fallan para `authenticated` y para `service_role`;
    alterar una fila directamente (como superusuario en test) hace que `verify_consent_chain`
    reporte la fila exacta; inserciones concurrentes mantienen cadena válida.

- [x] **T08 — Migración: `admin_audit_log`, `data_subject_requests`** (REQ-10, REQ-16, SEC-06) (hecha 2026-09-30, iteración 22)
  - **Estado:** cerrada. `admin_audit_log` append-only con cadena; `data_subject_requests` con `next_case_number()` por año (078, tabla de contadores atómica) y `update_data_subject_request_status()` como única vía de `UPDATE` (solo `service_role`, bitácora atómica).
  - Misma estrategia append-only para la bitácora; `data_subject_requests` permite UPDATE solo de
    `status`, `resolved_at`, `resolution_note_ciphertext` vía función con rol y bitácora.
  - Generador de `case_number` secuencial por año.
  - `verify_audit_chain()`.
  - **Tests SQL** equivalentes a T07.

## Fase 3 · Backend

- [x] **T09 — `get-consent-notice`** (REQ-02, SEC-08) (hecha 2026-09-30, iteración 25)
  - **Estado:** cerrada. Render de los 11 marcadores (`_shared/consent-render.ts`), 404/500/405/CORS cubiertos en `index_test.ts`; `[functions.get-consent-notice] verify_jwt = false` documentado en `config.toml` (única excepción de SEC-01: pública, solo lectura).
  - Render de marcadores con settings vigentes; marcador desconocido → error en borrador,
    nunca en producción silenciosa; sanitización; `rendered_sha256` sobre el Markdown renderizado.
  - **Tests:** huella estable; cambia si cambia settings; marcador faltante detectado.

- [x] **T10 — Registro con evidencia atómica** (REQ-04, REQ-05, REQ-06 backend, REQ-07, SEC-07) (hecha 2026-09-30, iteración 26)
  - **Estado:** cerrada. Evidencia atómica por finalidad con AAD, 409 por huella, fail-closed, `RegisterBodySchema` (zod) validando el body antes de tocar cuota/BD.
  - Modificar `secure-register-user`: validación de esquema; 409 `NOTICE_CHANGED` si la huella no
    coincide; rechazo si `registro_aprendizaje` ≠ `granted`; insertar una fila por finalidad
    (incluidas las `denied`); IP/UA cifrados con AAD; compensación si falla evidencia.
  - Rate limit con clave HMAC, fail-closed.
  - **Tests:** registro feliz (3 filas), opcionales rechazadas (filas `denied`), obligatoria
    rechazada (sin usuario creado), huella vieja (409), `ip` en body ignorada + evento de seguridad,
    fallo simulado de inserción → usuario eliminado.

- [x] **T11 — `update-my-consent` y `submit-consent`** (REQ-08, REQ-09) (hecha 2026-09-30, iteración 27)
  - **Estado:** cerrada. `update-my-consent` (grant/revoke, obligatoria no revocable) y `submit-consent` (reconsentimiento, exige `requires_reconsent=true` o `409`); ambas con zod + rate limit HMAC fail-closed + IP solo del proxy de confianza. 19 pruebas (10+9).

- [x] **TEST-INT — [P1] Pruebas de integración contra Postgres real para las Edge Functions del módulo que usan fakes de BD** (añadida 2026-10-01, sesión interactiva, a raíz del fix de T14; **movida aquí 2026-10-01** para ser la próxima tarea desbloqueada, por delante de T12.c/T12.d, T13, T15 y el resto — antes vivía al final de "Tareas añadidas durante la ejecución"; cerrada 2026-10-07, iteración 48 — sus 5 subtareas a-e ya estaban `[x]` desde la iteración 47, pero el checkbox de esta línea no se había actualizado)
  - **Por qué:** nació del bug de T14 (`publishDraft` con dos UPDATE sueltos pasaba 33/33 contra un fake en memoria pero siempre violaba una restricción `DEFERRABLE` real de 077); arreglado en 080. Ver `PROGRESS_ARCHIVO.md`.
  - **Qué (regla común a cada subtarea):** para cada operación de escritura que dependa de una restricción, un trigger o una política RLS (no solo del código TypeScript), añadir AL MENOS una prueba de integración que ejercite la operación real contra un Postgres real (el mismo patrón de Postgres efímero + `docker exec`/`psql` que ya usa `gates.sh`, o un script `_local.cjs`/`_e2e_local.*` punta a punta contra `supabase start`, según corresponda). El objetivo no es sustituir los fakes (siguen siendo rápidos y útiles para los casos de borde de validación/autorización), sino cubrir el hueco que dejan: nunca ejecutan DDL real.
  - **Dónde empezar (cada subtarea):** auditar `supabase/functions/<función>/index_test.ts` o `handler_test.ts`, listar qué operaciones de escritura NO tienen ningún equivalente en `supabase/tests/consent/*.sql` ni en un script `_local.cjs`, y priorizar las que dependan de restricciones `DEFERRABLE`/triggers append-only/RLS (las más propensas a este tipo de hueco, por el mismo motivo que falló en T14).
  - **Aceptación (cada subtarea):** la función queda con cobertura de integración real documentada en `PROGRESS.md` (o ya la tenía, y se anota por qué no hace falta añadir nada), verificada en rojo-antes-de-verde contra un escenario real que el fake no detectaría (como se hizo con 080).
  - [x] **TEST-INT.a — Integración real: `secure-register-user` (T10)** (hecha 2026-10-06, iteración 42 — sesión interactiva, sin el bloqueo de permisos de `Edit` sobre `gates.sh` de las iteraciones 40-41)
    - Cubrir al menos la inserción atómica de evidencia (una fila por finalidad, compensación si falla) y el 409 por huella, contra Postgres real.
    - **Estado:** cerrada. `e2e_local.cjs` ya cubría, contra Postgres real, la inserción atómica (3 filas) y el 409 por huella. El 3er criterio (compensación real) quedó cerrado aplicando el diff que dejó listo la iteración 40 (`loop-consentimiento/borradores/gates-TEST-INT-a-compensacion.md`, borrado tras aplicarlo): dentro de `e2e_local()`, justo después de `e2e_local.cjs`, se revoca `INSERT ON consent_records FROM service_role`, se invoca `e2e_local_compensation.cjs` y se restaura el `GRANT` siempre (éxito o fallo). Verificado rojo→verde: con el `REVOKE` neutralizado (no-op), la compensación falló correctamente (el registro se completó sin bloquear el INSERT, perfil y usuario de auth quedaron creados); con el `REVOKE` real, las 3 comprobaciones de `e2e_local_compensation.cjs` pasan en verde. `bash .claude/loops/consentimiento/gates.sh --e2e-local` completo: todas las puertas OK (la primera corrida de `e2e-local` falló por un problema de entorno — ver nota abajo — y pasó en el reintento). Supuesto del borrador confirmado: `service_role` tenía el privilegio `INSERT` en `consent_records` por concesión directa sobre la tabla; el `REVOKE`/`GRANT` explícito lo quita y lo devuelve sin afectar nada más.
    - **Nota de entorno (no bloquea, ya resuelta):** el stack local de Supabase de esta máquina llevaba 24h arriba con el contenedor del edge runtime ausente y `supabase_vector` en crash-loop; `supabase functions serve` fallaba con "failed to copy edge runtime main service into container". Resuelto con `supabase stop && supabase start`. Incluso ya sano, el arranque de `functions serve` es intermitente en Windows/Docker Desktop (a veces resuelve al primer intento, a veces tarda o devuelve 503 "name resolution failed" un rato): no es un defecto del módulo ni de esta prueba — la puerta `e2e-local` ya es opt-in y se reintentó hasta obtener una corrida limpia, igual que otras veces documentado en iteraciones previas.
  - [x] **TEST-INT.b — Integración real: `update-my-consent` / `submit-consent` (T11)** (hecha 2026-10-01, iteración 32)
    - **Estado:** cerrada. `supabase/tests/consent/consent_write_endpoints.sql` cubre contra Postgres real lo que los 19 tests Deno (fake) no podían: el `CHECK` real de `channel` y la cadena de hash. Detalle completo: `PROGRESS.md`, iteración 32.
  - [x] **TEST-INT.c — Integración real: `request-data-subject-right` (T13)** (hecha 2026-10-07, iteración 47, como T13.c)
  - [x] **TEST-INT.d — Integración real: `admin-consent` (T14)** (hecha 2026-10-03, iteración 33)
    - **Estado:** cerrada. El propio fix de T14 (migración 080) ya se verificó contra Postgres real (`publish_consent_document_e2e_local.cjs`). Auditadas las demás acciones de `handler_test.ts` con escritura real: borrador editable/no editable y retire (`consent_documents_lifecycle.sql`, trigger `consent_documents_immutable` de 073), cuatro ojos + bitácora (`publish_consent_document.sql`); diff/preview son solo lectura, sin restricción que un fake pueda ocultar. Único hueco real encontrado: la traducción de la violación `UNIQUE(version)` (SQLSTATE 23505 → 409 `version_exists` en `index.ts`) solo estaba probada contra el chequeo en JS del fake, nunca contra Postgres real — cerrado con una aserción nueva en `consent_documents_lifecycle.sql`. Detalle en `PROGRESS.md`, iteración 33.
  - [x] **TEST-INT.e — Integración real: `send_test_email` (T12.d.2, D-15 condición 3)** (hecha 2026-10-05, iteración 39; sesión interactiva — pudo levantar Docker/`psql`, bloqueado en headless desde la Iteración 31)
    - **Estado:** cerrada. `supabase/tests/consent/email_transport_test_audit.sql` (nuevo): reproduce con un `INSERT` directo la forma exacta que `sendTestEmail()`/`auditLog()` (`index.ts`, sin RPC) escribe en `admin_audit_log` para la acción `email_transport.test` — camino smtp con fallo y con éxito (host + `resolved_ip` en `after`, nunca solo el feliz) y camino resend (`smtp_host`/`resolved_ip` en `null`, documentado como "no aplica"); confirma que ninguna fila expone la contraseña ni su ciphertext, y que `verify_audit_chain()` sigue íntegra tras las tres inserciones. Verificado rojo→verde: se cambió temporalmente el `resolved_ip` esperado a `'TEMP-DISABLED-FOR-VERIFICATION'`, `GATE sql-ciclo-de-vida` falló con el error exacto en la línea correcta, se revirtió y volvió a pasar. Cierra la condición (3) de D-15 que bloqueaba T99 desde la Iteración 37.
  - [x] **TEST-INT.g — T16.d: descifrado real de la IP en reveal-ip y en el expediente, y fail-closed** (REQ-17) (hecha 2026-10-09, iteración 58)
    - **Estado:** cerrada. (1) El round-trip de cifrado real con AAD (mismo escritor que `secure-register-user`,
      `encryptConsentColumn`/`decryptConsentColumn` de `consent-evidence.ts`) YA estaba cubierto antes de esta
      iteración por `consent-evidence_test.ts` (sin BD): escribe con `encryptConsentColumn` y lee con
      `decryptConsentColumn` — exactamente la misma función que `admin-consent/index.ts` llama para
      `listByUserId`/`listByUserIdRevealed` (línea 104/145) — y prueba que otra AAD (otro `user_ref_hmac`,
      otra columna) falla sin devolver la IP (`assertRejects`, líneas 29-33). No hacía falta ningún archivo
      nuevo para este punto. (2) El caso punta a punta con `e2e-local` queda condicionado ("si vuelve a
      funcionar") — no se intentó esta iteración (no hay necesidad de tocar Docker/Postgres para esto, ver
      REGLAS DURAS sobre comandos prohibidos en headless); queda pendiente para una sesión que ya tenga el
      stack local arriba. (3) Fail-closed nuevo en `handler_test.ts`: `revealIp`/`exportDossier` ya leían la
      evidencia ANTES de llamar a `auditLog` pero, a diferencia de `retireDraft` (que compensa con un
      `try/catch` porque ya mutó algo), no tenían ningún `try/catch` propio — si `deps.audit` falla, el
      `throw` corta antes del `return`, sube sin capturar hasta el catch-todo de `handle()` (línea ~1298) y
      se traduce en 500 `internal_error`, nunca en una respuesta con datos. Confirmado leyendo el código (no
      había ningún bug que arreglar): 3 pruebas nuevas con `failAudit: true` — reveal-ip (verifica además que
      el texto de la respuesta no contiene la IP real `203.0.113.77`) y export.json/export.pdf (ambos 500
      `internal_error`). `bash .claude/loops/consentimiento/gates.sh` completo en verde (9 puertas no-opcionales
      OK, incluido `panel-e2e`; `db-reset`/`e2e-local` SKIP opt-in; iteración 58, no múltiplo de 5,
      `GATES_FULL=1` no obligatorio esta vez). Desbloquea T99 en la parte que esta tarea cubría ("es la
      operación más sensible del módulo").
  - **Fuera de esta división (no crear más subtareas aquí):** `get-consent-notice` (T09) y las acciones que añadan T15/T16 se revisan dentro de sus propias tareas cuando les toque, según la regla de PROMPT.md ("toda operación que escriba en la BD necesita al menos una prueba contra Postgres real").

- [x] **T12 — Correo saliente: transporte configurable y `EmailSender`** (REQ-21 backend, REQ-10, SEC-09) (hecha 2026-10-06, confirmada en iteración 42 — las 4 subtareas a/b/c/d.1-d.4 ya estaban `[x]` desde la iteración 41, pero el checkbox de esta línea y el contador de PROGRESS.md no se habían actualizado)
  - **Estado real (2026-09-28):** desbloqueada por **D-05** (transporte configurable desde el panel). Hallazgo de T00: el repo ya usa Resend (`resend_api_key` en Vault vía `app_secrets`; `championship-draw-round1`, `check-security-alerts`), que es el modo por defecto. Depende de T02 (AAD), T04 (`auth-guard`) y T08 (bitácora), todas hechas.
  - **División (2026-10-01, antes de codificar T12):** la tarea abarca interfaz + 2 proveedores + anti-SSRF + migración + acciones de `admin-consent` + plantillas; se parte en cuatro. D-14 (por qué T12.b no se pudo cerrar en la iteración 28) resuelta el mismo día en una sesión interactiva aparte; T12.c/T12.d siguen pendientes.
  - [x] **T12.a — Interfaz `EmailSender`, `FakeEmailSender`, `ResendSender`** (hecha 2026-10-01, iteración 28)
    - `_shared/email/types.ts` (`EmailMessage`, `EmailSendResult`, `EmailSender`); `FakeEmailSender` (registra envíos, `failNextWith` para simular fallos — la usará T13); `ResendSender` + `getResendApiKey` (reutiliza `resend_api_key` de `app_secrets` vía `get_decrypted_secret`, mismo patrón que `championship-draw-round1`/`check-security-alerts`; `fetchImpl` inyectable solo para pruebas).
    - **Estado:** cerrada, 12 pruebas. **Falta:** el envío de un correo real (API key real) no se probó — fuera de alcance sin red externa; la prueba de verdad llega con `send_test_email` en T12.d.
  - [x] **T12.b — Migración: `email_transport_settings`, `email_transport_tests`, `email_outbox`** (hecha 2026-10-01, sesión interactiva — resuelve D-14)
    - **Estado:** cerrada. Migración `079_email_transport_and_outbox.sql`: `email_transport_settings` (versionada solo-INSERT, patrón 075), `email_transport_tests` (append-only), `email_outbox` (solo `mark_email_outbox_sent()` muta, patrón de 078). RLS activa, sin acceso `anon`/`authenticated`. 18 aserciones en `email_transport_lifecycle.sql`. D-14 resuelta (opción A, sesión interactiva); `gates.sh` generalizado para descubrir migraciones/pruebas nuevas solo.
  - [x] **T12.c — `SmtpSender` + anti-SSRF** (hecha 2026-10-03, iteración 34 — retoma el WIP en `git stash` de una ejecución accidental previa, confirmado idéntico byte a byte antes de confiar en él)
    - **Estado:** cerrada. `_shared/email/ssrf-guard.ts` (`assertSafeSmtpTarget`: puerto 465/2525 únicos, rechaza host vacío/`localhost`/sufijos internos, IP literal privada IPv4/IPv6, y resolución DNS A+AAAA a IP privada/loopback/link-local/metadatos/IPv4-mapped) + `_shared/email/smtp-sender.ts` (`SmtpSender`, `denomailer@1.6.0` — Deno nativo, TLS implícito en 465, evita escribir a mano el framing EHLO/AUTH/DATA; re-valida el objetivo en cada `send()`; nunca propaga el texto crudo del proveedor, que puede llevar la contraseña). 21 pruebas (12+9).
    - **Desviación de SPEC documentada (PROGRESS.md, iteración 34; D-15 en DECISIONS.md):** SEC-09/REQ-21(d) pide "conectar a la IP ya validada (sin volver a resolver)"; `denomailer` usa el mismo campo `hostname` para la conexión TCP y para la validación TLS (SNI/certificado) — pinear la IP literal rompería TLS contra cualquier servidor SMTP real. Se mantiene la revalidación de `assertSafeSmtpTarget` justo antes de cada envío (reduce, no elimina, la ventana de DNS-rebinding), mismo nivel que ya acepta `url-guard.ts` para otros destinos admin-configurables. **D-15 decidida 2026-10-03 (opción A)**, no bloquea T99: condiciones verificadas — revalidación antes de cada envío (ya estaba); `EmailSendResult.resolvedIp` (nuevo, iteración 35) expone la IP validada por `send()` para que T12.d la registre en `email_transport_tests`/bitácora en cada prueba de configuración (esa persistencia en sí es responsabilidad de T12.d, aún sin empezar).
  - **T12.d — Acciones de `admin-consent`, contraseña cifrada, degradación y plantillas** (depende de T12.b, T12.c)
    - **División (2026-10-05, antes de codificar):** la tarea abarca 5 acciones + cifrado + plantillas + semilla; se parte en cuatro subtareas, en orden de dependencia (d.2 necesita que d.1 exista para tener una fila de transporte que probar).
    - [x] **T12.d.1 — `get_email_transport` / `update_email_transport`** (solo `privacy_admin`) (hecha 2026-10-05, iteración 36)
      - Nueva fila por cada guardado (patrón 075/079: `transport_version = anterior + 1`, el trigger de la 079 lo exige igual). Contraseña SMTP cifrada con `crypto.ts`, AAD `email_transport_settings:password:<transport_version de la fila nueva>`, `requireAad:true`; si el admin no envía una contraseña nueva en modo `smtp`, se descifra la de la fila vigente (con la AAD de SU PROPIA versión, `allowLegacy:false`) y se re-cifra bajo la versión nueva — nunca se traslada el mismo ciphertext de una versión a otra. `get_email_transport` y la respuesta de `update_email_transport` nunca devuelven el ciphertext: solo `password_set` (booleano). Bitácora (`email_transport.update`) con before/after **sin la contraseña ni su ciphertext**.
      - **Tests:** la contraseña (texto y ciphertext) no aparece en ninguna respuesta JSON ni en la bitácora; cambiar de `smtp` a `resend` limpia los campos smtp; cambiar de `resend` a `smtp` sin contraseña → 400; actualizar otro campo en modo `smtp` sin reenviar la contraseña conserva el acceso (se puede volver a descifrar bajo la nueva versión); solo `privacy_admin` (editor/auditor → 403); puerto fuera de 465/2525 → 400.
    - [x] **T12.d.2 — `send_test_email`** (hecha 2026-10-05, iteración 37; condición de D-15 sigue abierta, ver abajo)
      - **Estado:** cerrada en lo que depende de esta sesión. `POST /admin-consent/email-transport/test` (solo `privacy_admin`, mismo guard que `/email-transport`): rate limit HMAC fail-closed (`checkTestRateLimit`, mismo patrón que T10/T11, keyed por el correo del admin); 400 `email_transport_not_configured` si no hay fila; envía con `deps.email.send()` (resend o smtp según `transport.mode`, wired en `index.ts` a `ResendSender`/`SmtpSender`); registra SIEMPRE una fila en `email_transport_tests` (success/error_code) y una entrada `email_transport.update`→`email_transport.test` en `admin_audit_log` con `mode`, `success`, `error_code`, `smtp_host` (solo en modo smtp) y `resolved_ip` (de `EmailSendResult.resolvedIp`, condición (3) de D-15; ausente/`null` en modo resend, documentado como no aplica), en los dos caminos (éxito y fallo), nunca solo el feliz. La contraseña nunca entra en la respuesta ni en la bitácora (verificado en los tests: `JSON.stringify(audit)` sin el texto ni el ciphertext).
      - **Condición de D-15:** cerrada en **TEST-INT.e** (iteración 39, sesión interactiva) — `email_transport_test_audit.sql` confirma la fila exacta en `admin_audit_log` (host + IP + actor) y que `verify_audit_chain()` sigue íntegra después. Ya no bloquea T99.
      - **Tests (`handler_test.ts`):** correo de prueba en modo resend → 200, fila en `email_transport_tests`, bitácora con actor correcto; modo smtp que falla → `success:false`, `error_code` en ambos sitios, `smtp_host`+`resolved_ip` en la bitácora; editor/auditor → 403 sin enviar nada; sin transporte configurado → 400; rate limit agotado → 429; rate limit no disponible (fail-closed) → 503; `GET` → 405.
    - [x] **T12.d.3 — `list_pending_emails` / `resend_pending_emails` + enganche de degradación** (hecha 2026-10-05, iteración 38)
      - **Estado:** cerrada. `GET /email-outbox` (`list_pending_emails`): `{count, items}` solo con `status='pending'` (sin correo ni datos del titular, solo `reference_table`/`reference_id`/`created_at`). `POST /email-outbox/resend` (`resend_pending_emails`): por cada fila pendiente, `EmailOutboxDeps.rebuildMessage(row)` reconstruye el `EmailMessage` a partir de `reference_table`/`reference_id`; si lo logra, envía con `deps.email.send` y marca enviada (`mark_email_outbox_sent`, 079) solo si el envío fue real (`ok:true`); nunca marca enviada una fila que no se envió. Bitácora `email_outbox.resend` con el resumen `{attempted,sent,skipped,failed}` (sin `entity_id` de una sola fila: es una acción por lotes). Solo `privacy_admin` (mismo guard que `/email-transport`).
      - **Desviación de alcance deliberada (no de SPEC):** `rebuildMessage` no tiene todavía ninguna `reference_table` que reconocer — nadie escribe en `email_outbox` hasta que exista T13 (`request-data-subject-right`, sin empezar) y sus plantillas (T12.d.4, sin empezar). `index.ts` lo deja devolviendo `null` siempre (documentado con un comentario que señala T13/T12.d.4 como el único punto a ampliar); una fila sin plantilla reconocida queda `skipped`, pendiente, nunca se pierde ni se marca enviada sin un envío real. La mecánica de cola (listar/reenviar/marcar) es la pieza genérica que pedía esta tarea; la reconstrucción concreta del contenido es trabajo de T13/T12.d.4, que esta tarea no debía anticipar.
      - **Tests (`handler_test.ts`):** con `FakeEmailSender` + un `rebuild` fake el reenvío marca los pendientes como enviados y deja el resumen en bitácora; `list_pending_emails` solo cuenta `status='pending'` (una fila ya enviada no aparece); reintentar no duplica (segunda llamada ve 0 pendientes, `email.send` no se vuelve a llamar); sin plantilla registrada → `skipped`, sigue pendiente; si el envío real falla → `failed`, sigue pendiente; sin transporte configurado y con pendientes → 400; sin pendientes → 200 en cero sin exigir transporte; editor/auditor → 403 en ambas rutas; método incorrecto → 405.
    - [x] **T12.d.4 — Plantillas de correo + aviso semilla** (hecha 2026-10-06, iteración 41)
      - **Estado:** cerrada. `_shared/email/templates.ts` (puro, sin acceso a BD): `buildDelegateNoticeEmail` (D-06: `DelegateNoticeInput` no declara correo ni IP del titular, así que no hay forma de filtrarlos), `buildSubjectAcknowledgementEmail`, `buildEmailVerificationCodeEmail` (REQ-15, documentado "no se encola"). `seed/aviso_consentimiento_v1.0.md` §4: párrafo propuesto (mismo patrón `<!-- PROPUESTA DE TEXTO NUEVO -->` que ya usa §8) declarando Resend como proveedor de correo transaccional con transferencia internacional a EE. UU. (REQ-21h).
      - **Nota de alcance:** ninguna función invoca todavía estas plantillas — `request-data-subject-right` (T13) y `confirm_email_verification` (T15) no existen aún; cuando se escriban, son las que llaman a estos builders y, para el aviso al delegado/acuse, encolan en `email_outbox` si el envío falla (el `rebuildMessage` de T12.d.3 sigue devolviendo `null` hasta entonces, sin cambios en esta tarea).
      - **Tests (`templates_test.ts`):** asunto sin `\n`/`\r` en los tres builders; el aviso al delegado no expone un correo/IP de titular ni aunque el llamador intente colarlos en un objeto ampliado (defensa en profundidad sobre D-06); tipo traducido y fecha límite en zona de Guayaquil; el código de verificación aparece en el html.

- [x] **T13 — `request-data-subject-right`** (REQ-10, REQ-11) (hecha 2026-10-07, iteración 48)
  - **Estado:** cerrada. `supabase/functions/request-data-subject-right/{handler.ts,handler_test.ts,index.ts,index_test.ts}` (handler con `dispatchOrQueue` para los dos avisos, cifrado AAD vía `prepareDsrRow()` de `_shared/consent-evidence.ts`, `due_at` = recepción + `response_days` **días calendario**, D-03, sin tabla de feriados; 7 pruebas con fakes en `handler_test.ts` + 10 pruebas HTTP en `index_test.ts`), el cambio en `supabase/functions/admin-consent/index.ts` (`rebuildMessage` reconoce `dsr_delegate_notice`/`dsr_ack` y reconstruye el mensaje desde `data_subject_requests`, enganchando la cola de T12.d.3) y `supabase/tests/consent/dsr_request_types_and_outbox.sql` (integración real de T13.c) commiteados y en verde contra `gates.sh`. La columna `response_day_type` (migración 073) sigue sin uso: retirarla en una migración nueva cuando toque, no editar la 073.
  - [x] **T13.a — Verificar el WIP existente y commitearlo si pasa `gates.sh`** (hecha 2026-10-07, iteración 45)
    - **Estado:** cerrada. Auditado el WIP contra el esquema real de `data_subject_requests` (073: columnas, `CHECK` de `request_type`, `channel='app'` válido, `ip_hmac`/`key_version` nullable) y `next_case_number()` (078, sin parámetros) — coincide sin ajustes; `buildDelegateNoticeEmail`/`buildSubjectAcknowledgementEmail` (T12.d.4) con las firmas que usa `handler.ts`. `bash .claude/loops/consentimiento/gates.sh` completo: 9 puertas OK (`db-reset`/`e2e-local` SKIP opt-in, no forzadas esta iteración por tiempo). Commit con rutas explícitas (los 3 archivos nuevos + el cambio en `admin-consent/index.ts`).
    - **Aceptación:** `gates.sh` en verde (salvo línea base conocida); commit hecho con rutas explícitas.
  - [x] **T13.b — Pruebas HTTP (`index_test.ts`)** (hecha 2026-10-07, iteración 46)
    - **Estado:** cerrada. `supabase/functions/request-data-subject-right/index_test.ts` (nuevo, 10 pruebas): 201 feliz (inserción real del body esperado + los dos avisos encolados en `email_outbox` porque el transporte fake no está configurado, sin necesitar un envío real por Resend/SMTP); 401 `missing_token` y 403 `anonymous_session` (mapeo de `AuthError`); 400 `invalid_input` por `request_type` fuera de `REQUEST_TYPES` y por tipo de dato equivocado (verificado que no llega a tocar la cuota, SEC-08); 429 `rate_limited`; 503 `RATE_LIMIT_UNAVAILABLE` fail-closed; 400 `missing_client_ip` (con un valor de `X-Forwarded-For` que no es una IP válida — ver nota abajo); 503 `settings_unavailable` (mapeo de `DsrError`); 405 fuera de `POST` + `OPTIONS` con CORS.
    - **Hallazgo de orden, antes de que el primer intento de la prueba `missing_client_ip` fallara por la razón equivocada:** `index.ts` llama a `checkRateLimit` (que usa `extractClientIp`/`hashIp` de `security-events.ts`, sin validar formato de IP) ANTES de llamar a `getClientIp` (que sí valida formato, `client-ip.ts`). Sin cabecera `X-Forwarded-For` en absoluto, `extractClientIp` devuelve `null` → la cuota falla cerrada con 503 `RATE_LIMIT_UNAVAILABLE` antes de llegar al chequeo de IP — ese escenario ya estaba cubierto por la prueba de 503 fail-closed, redundante para provocar el 400. Para llegar de verdad al 400 `missing_client_ip` hace falta una cabecera presente pero con un valor que no sea una IP (`'no-es-una-ip'`): `extractClientIp` la acepta en crudo para el HMAC del bucket (la cuota pasa), pero `getClientIp`/`normalizeIp` la rechaza por formato y devuelve `null`. No es un defecto de `index.ts` (el orden es intencional: SEC-07 prioriza fail-closed de la cuota sobre la claridad del mensaje de error), solo un ajuste necesario en la prueba.
    - **Aceptación:** `index_test.ts` nuevo, `deno test` en verde, `gates.sh` completo en verde (9 puertas no-opcionales OK; `db-reset`/`e2e-local` SKIP opt-in como siempre).
  - [x] **T13.c — Cierra TEST-INT.c: integración real contra Postgres** (hecha 2026-10-07, iteración 47)
    - **Estado:** cerrada, con una desviación de alcance frente al patrón `_local.cjs`/`e2e-local` original: un e2e HTTP completo contra `supabase functions serve` no podía probar de verdad el camino "enviado" de `resend_pending_emails` sin un proveedor de correo real (Resend sin clave, o SMTP, que el guardia anti-SSRF rechaza contra loopback a propósito, SEC-09) — enviar de verdad violaría "nunca red externa real" en pruebas. Se optó por una prueba SQL nueva (`supabase/tests/consent/dsr_request_types_and_outbox.sql`, descubierta sola por `consent_test_files()`, sin tocar `gates.sh`), mismo patrón que ya cerró TEST-INT.b/e: reproduce contra Postgres real la forma exacta de lo que el fake de `handler_test.ts` no puede ver (su `dsr.insert`/`email_outbox` son arrays en memoria sin ningún CHECK). Cubre: (1) los 9 valores de `REQUEST_TYPES` (handler.ts) insertan contra el `CHECK` real de `request_type` (antes solo se había probado `'acceso'`, en `data_subject_requests_lifecycle.sql`) y un valor fuera de la lista sigue rechazado; (2) las dos referencias que `dispatchOrQueue` encola (`dsr_delegate_notice`, `dsr_ack`) nacen `pending` en `email_outbox` (079) apuntando a un `data_subject_requests.id` real; (3) el `SELECT` exacto que usa `rebuildMessage` (admin-consent/index.ts: `id, case_number, request_type, due_at, routed_to_email, email_ciphertext`) resuelve sin NULL inesperado contra esa fila; (4) `mark_email_outbox_sent()` marca solo la referencia indicada — la otra sigue `pending` (prueba que `resend_pending_emails` nunca junta las dos referencias de un mismo caso en una sola llamada). La atomicidad/secuencia de `next_case_number()` ya estaba probada (T08); no se repite.
    - **Hallazgo durante la verificación rojo→verde (bug real en mi propia prueba, no en el código del módulo):** el primer intento anclaba las 9 filas con `email_hmac LIKE 'hmac-%'`, que también capturó la fila fixture `hmac-caso1`/`request_type='acceso'` de `data_subject_requests_lifecycle.sql` (misma base `gates`, sesiones `psql` distintas pero persistente entre archivos) — el conteo esperado en 9 "pasó" con 10 reales porque el primer rojo-antes-de-verde se probó cambiando el valor esperado a 10 (coincidía con el bug). Corregido con un prefijo propio (`hmac-t13c-…`) sin colisión; reverificado rojo (10 real contra 9 esperado) → verde. Segunda verificación rojo→verde sobre la aserción de "tipo fuera de la lista": `GATE sql-ciclo-de-vida` falló con el error real de Postgres en la línea correcta; revertido, vuelve a pasar.
    - **Aceptación:** `bash .claude/loops/consentimiento/gates.sh` completo (9 puertas no-opcionales OK; `db-reset`/`e2e-local` SKIP opt-in); TEST-INT.c pasa a `[x]` en este archivo.
  - [x] **T13.d — Documentación y cierre de T13** (hecha 2026-10-07, iteración 48)
    - **Estado:** cerrada. `PROGRESS.md` actualizado con el cierre de T13 (REQ-10, REQ-11): `dueAtIso` suma `response_days` en milisegundos sobre `receivedAt` sin ninguna lógica de día hábil, así que un caso que cruce fin de semana no necesita tratamiento especial — ya lo cubre el cálculo genérico (ejemplo real: el fixture de `handler_test.ts`, `NOW='2026-10-06T12:00:00Z'` + 15 días → `due_at='2026-10-21T12:00:00Z'`, un rango que atraviesa dos fines de semana, 10-11 y 17-18 de octubre, sin que el cálculo los trate distinto). Confirmado que `response_day_type` (073, valores `calendario`/`habiles`) sigue sin ningún lector en el código: `dueAtIso` nunca lo consulta, siempre calendario puro — anotado para retirar la columna en una migración futura, sin tocar la 073 ahora.
    - **Aceptación:** `PROGRESS.md` actualizado; T13 pasa a `[x]`.

- [x] **T14 — `admin-consent`: versiones y publicación** (REQ-01, REQ-13 a–d, SEC-02) (hecha 2026-10-01, commit `f23df35`; checkbox corregido 2026-10-01 — el mensaje de ese commit decía "TASKS.md: T14 cerrada" pero su diff nunca tocó esta línea)
  - **Estado:** cerrada. `admin-consent` con borrador/diff/preview/publish (`publish_consent_document()`, migración 080, atómica)/retire; 33/33 tests + e2e real contra Postgres (reprodujo y confirmó el arreglo del bug de atomicidad). No confundir con `T14-fix` (versionado de `privacy_settings`, 075, tarea distinta).
  - Acciones de borrador, diff, preview, publish (transacción: retira vigente + publica nueva),
    retire; motivo obligatorio; cuatro ojos si está activo; bitácora con before/after.
  - **Tests:** editor no publica; admin publica; con cuatro ojos el autor no publica su borrador;
    cada acción deja 1 fila de bitácora con actor correcto.

- [x] **T15 — `admin-consent`: configuración y verificación del correo del delegado** (REQ-14, REQ-15) (hecha 2026-10-08, iteración 52 — T15.a-c iteraciones 49-51, T15.d iteración 52)
  - **Estado real (2026-09-28):** Sin iniciar. Existe la tabla `privacy_email_verifications` (075) con guardas; falta la función `admin-consent`.
  - `update_settings` crea nueva `settings_version`; cambio de `privacy_email` pasa a pendiente;
    `confirm_email_verification` con código (hash, 30 min, 5 intentos).
  - **Tests:** correo no cambia sin código; código expirado/erróneo; intentos agotados;
    bitácora con before/after sin exponer el código.
  - **División (2026-10-08, antes de codificar):** la tarea abarca una migración (RPC atómica), dos
    familias de acciones en `handler.ts`/`index.ts` y su documentación de cierre; se parte en cuatro,
    mismo patrón que T05/T12/T13/T14.
  - [x] **T15.a — Migración: RPC `confirm_privacy_email_change()` (atómica)** (hecha 2026-10-08, iteración 49 — WIP de una iteración headless interrumpida, auditado contra el esquema real y commiteado sin cambios de código)
    - **Por qué:** confirmar el cambio de correo exige marcar `privacy_email_verifications.confirmed_at`
      Y a la vez insertar la nueva versión de `privacy_settings` con el correo nuevo, en una sola
      transacción real (mismo defecto que arregló 080 para `publish_consent_document`: dos llamadas
      PostgREST sueltas desde `admin-consent` no son atómicas entre sí). `settings_versioning.sql` ya
      probó la mecánica de tablas a mano con un `DO $$ … $$` en una sola sesión `psql` (test 8); falta
      el envoltorio `SECURITY DEFINER` que `admin-consent` pueda invocar con una sola llamada.
    - El incremento de `attempts` por código incorrecto NO vive dentro de esta función (si viviera, un
      `RAISE EXCEPTION` por código inválido revertiría también el UPDATE de `attempts` en la misma
      transacción — justo el tipo de error de atomicidad que esta tarea existe para evitar). Eso lo hace
      T15.c con un UPDATE de una sola fila/tabla desde `admin-consent`, atómico por sí solo.
    - Firma: `confirm_privacy_email_change(p_verification_id uuid, p_code_hash text, p_actor_id uuid, p_actor_role text, p_actor_aal text, p_actor_email_hmac text) RETURNS public.privacy_settings`.
      Comprueba `aal2` + rol `privacy_admin` (defensa en profundidad, igual que 080); bloquea la fila de
      verificación (`FOR UPDATE`); si ya está confirmada, venció, o el hash no coincide (no debería pasar:
      T15.c ya lo valida antes de llamar), revierte sin tocar nada; si es válida, marca `confirmed_at` e
      inserta la versión siguiente de `privacy_settings` copiando el resto de columnas de la vigente y
      cambiando solo `privacy_email`, más una fila de `admin_audit_log` — todo en la misma transacción
      (el trigger `enforce_next_privacy_settings_version` de 075 ya sirve de candado de la versión).
      `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role` (mismo patrón).
    - **Tests SQL** (archivo nuevo, `privacy_email_change_confirm.sql`, descubierto solo): sin rol → error;
      sin aal2 → error; verificación inexistente → error; vencida → error; ya confirmada → error; hash
      que no coincide → error, nada mutado; camino feliz → verificación confirmada + nueva versión con el
      correo nuevo + bitácora con actor correcto, todo en una transacción (si la inserción en
      `privacy_settings` fallara — p. ej. versión duplicada por una carrera — la confirmación también se
      revierte, igual que el test 9 de `settings_versioning.sql` ya prueba a mano); permisos (solo
      `service_role` ejecuta la función).
  - [x] **T15.b — `update_settings` (REQ-14)** (hecha 2026-10-08, iteración 50)
    - `GET /settings` (cualquier rol del módulo) y `POST /settings` (solo `privacy_admin`): valida con
      zod los campos de REQ-14 (excepto `privacy_email`, que esta ruta nunca cambia — ver T15.c),
      inserta la siguiente `settings_version` con `deps.settings.insert(...)` (INSERT de una sola tabla,
      sin problema de atomicidad) y bitácora `privacy_settings.update` con before/after.
    - **Tests:** editor/auditor → 403; campo fuera de rango (`response_days`, `ip_retention_days`) → 400;
      intentar enviar `privacy_email` en el body se ignora (no cambia el correo por esta vía); la
      respuesta y la bitácora traen la versión nueva con el resto de campos actualizados.
    - **Nota:** `four_eyes_publish` tampoco es campo de esta ruta (no está en la lista de REQ-14; ninguna
      tarea le da todavía una ruta propia): se copia de la vigente igual que `privacy_email`, para no
      resetearlo a `false` en cada guardado. `evidence_retention_days`/`response_day_type` (NOT NULL con
      default en la tabla, 073) se dejan en su valor por defecto de columna en cada INSERT nuevo — hoy no
      hay ninguna ruta que los cambie a otra cosa, así que nunca pueden divergir de ese default; si T17
      los vuelve configurables, esa tarea deberá empezar a copiarlos también. Cobertura contra Postgres
      real: no hace falta un archivo SQL nuevo — `settings_versioning.sql` (test 2, desde la iteración de
      075) ya ejercita exactamente esta forma de INSERT (copiar la vigente, subir `settings_version`,
      cambiar algunos campos) contra el trigger `enforce_next_privacy_settings_version` y las reglas de
      solo-inserción reales; lo que falta probar aquí es la capa HTTP/zod/bitácora, cubierta con los fakes
      de `handler_test.ts`.
  - [x] **T15.c — `request_email_change` + `confirm_email_verification` (REQ-15)** (hecha 2026-10-08, iteración 51)
    - **Estado:** cerrada. `POST /settings/email-change` y `/settings/email-change/confirm` en `handler.ts`;
      el incremento de `attempts` usa un UPDATE de una sola fila con bloqueo optimista
      (`WHERE id = … AND attempts = row.attempts`) desde `index.ts`, sin necesitar una RPC nueva para ese
      paso — solo `confirm_privacy_email_change` (082, T15.a) seguía necesitando RPC, por cruzar dos tablas.
      Exhausted/expired se comprueban ANTES del hash (nunca se incrementa `attempts` sobre una fila que de
      todos modos ya no puede confirmarse). 13 pruebas nuevas en `handler_test.ts`.
    - `POST /settings/email-change` (solo `privacy_admin`): valida el correo nuevo, genera un código de
      6 dígitos (`crypto.getRandomValues`, no `Math.random`), lo hashea (`sha256Hex`, mismo helper que ya
      usa `consent-render.ts`) y lo guarda en `privacy_email_verifications` (`INSERT`, una sola tabla);
      envía el código con `buildEmailVerificationCodeEmail` (T12.d.4, ya existe) vía `deps.email.send`
      usando el transporte vigente; si el envío falla, responde error sin dejar el panel pensando que
      se mandó (REQ-15 no permite encolar este correo en `email_outbox`, ya documentado en la plantilla).
    - `POST /settings/email-change/confirm` (solo `privacy_admin`): recibe el código en claro, lo
      hashea, busca la verificación `confirmed_at IS NULL` más reciente; si el hash no coincide,
      incrementa `attempts` (UPDATE de una fila, atómico por sí solo) y responde 400 `invalid_code`; si
      ya tiene 5 intentos o más, 429 `attempts_exhausted` sin tocar la fila; si venció, 410 `code_expired`;
      si coincide, llama a `deps.settings.confirmEmailChange(...)` (RPC de T15.a) y devuelve la nueva
      configuración vigente.
    - **Tests:** correo no cambia sin llamar a confirm; código erróneo no cambia nada y sube `attempts`;
      código vencido; 5 intentos agotados; código correcto confirma y la vigente pasa a tener el correo
      nuevo; la bitácora de ambas rutas nunca lleva el código en claro ni su hash.
  - [x] **T15.d — TEST-INT y cierre de T15** (hecha 2026-10-08, iteración 52)
    - **Estado:** cerrada, sin código nuevo. Auditoría confirmó que `settings_versioning.sql` (test 2 para
      `update_settings`; test 6 para `request_email_change`/`confirm_email_verification`) y
      `privacy_email_change_confirm.sql` (para la RPC `confirm_privacy_email_change`, T15.a) ya cubren
      contra Postgres real cada operación de escritura de las tres rutas — ningún archivo SQL nuevo hacía
      falta. Ver PROGRESS.md, iteración 52.

- [ ] **T16 — `admin-consent`: bitácora, evidencia, revelación de IP, solicitudes, cadenas** (REQ-16, REQ-17, REQ-18)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T04, T14 y T15 (todas comparten el archivo `admin-consent`). El modelo de datos que necesita (`admin_audit_log`, `consent_records`, `data_subject_requests`) ya existe (T07/T08).
  - **Tests:** búsqueda por correo usa HMAC; IP enmascarada por defecto; `reveal_ip` exige
    `privacy_admin` + motivo y registra; auditor no puede revelar; export CSV registrado;
    cambio de estado de solicitud registrado; `verify_chains` devuelve OK.
  - **División (2026-10-09, antes de codificar):** la tarea abarca lectura/exportación de bitácora,
    búsqueda/revelación de evidencia + expediente, cambio de estado de solicitudes y verificación de
    cadenas; se parte en seis, mismo patrón que T05/T12/T13/T14/T15.
  - [x] **T16.a — `GET /audit-log`: listado con filtros (fecha, actor, acción) y paginación** (REQ-16) (hecha 2026-10-09, iteración 53)
    - **Estado:** cerrada. `AuditTrailDeps.list()` (solo lectura de `admin_audit_log`, filtros `from`/
      `to`/`actor_id`/`action` combinables vía `gte`/`lte`/`eq`, `range` para paginar); los tres roles del
      módulo pueden verla (el candado de REQ-17 es solo sobre "Revelar IP", T16.d, no sobre ver la
      bitácora). Zod valida `from`/`to` (cualquier fecha parseable), `actor_id` (uuid), `action`
      (string), `limit` (1-200, tope para no volcar la bitácora completa) y `offset` (≥0). 6 pruebas
      nuevas en `handler_test.ts` con un fake que reproduce el filtrado/paginación de PostgREST — no
      hacía falta ninguna prueba SQL nueva (ruta de solo lectura, sin restricción/trigger/RLS que un
      fake pudiera ocultar).
    - **Pendiente detectado (fuera de este alcance, ver `AUDIT-IP-extra` al final de este archivo):**
      `admin_audit_log.ip_ciphertext`/`ip_hmac`/`key_version` (073) existen para la IP del propio admin
      (REQ-16) pero ningún llamador de `deps.audit` los rellena — siempre quedan `NULL`. No es un defecto
      de T16.a (la lectura no puede inventar un dato que nunca se escribió); documentado para que una
      tarea futura decida si se añade antes de producción.
    - **Aceptación:** filtros `from`/`to`/`actor_id`/`action` combinables; paginación `limit`/`offset`
      (tope 200); parámetros inválidos → 400; los tres roles del módulo → 200; método distinto de
      `GET` → 405.
  - [x] **T16.b — `GET /audit-log/export.csv`: exportación CSV de la bitácora, registrada en la propia bitácora** (REQ-16) (hecha 2026-10-09, iteración 54)
    - **Estado:** cerrada. Mismos filtros que `/audit-log` (`from`/`to`/`actor_id`/`action`, sin `limit`/`offset`:
      la exportación no pagina, pide hasta `MAX_AUDIT_EXPORT_ROWS = 5000` de una sola vez reutilizando
      `deps.auditTrail.list()` ya cableado en T16.a — no hizo falta ninguna dependencia nueva). `reason`
      **obligatorio** en el query string (SPEC: "reason… obligatorio para… export"), porque el resultado sale
      del sistema como archivo descargable. La propia exportación queda en `admin_audit_log` como `audit.export`
      (entity `admin_audit_log`, `entity_id: null`, `after` con el filtro + `row_count`/`total_matching`, nunca
      el CSV en sí — ya es idéntico a lo que `GET /audit-log` deja leer). Respuesta `text/csv; charset=utf-8` con
      `Content-Disposition: attachment`; cabeceras `X-Row-Count`/`X-Export-Truncated` si el filtro supera el tope.
      Mismos tres roles que `/audit-log` (REQ-17 solo exige `privacy_admin` para "Revelar IP", T16.d, no para
      exportar la bitácora). 10 pruebas nuevas en `handler_test.ts` (incluye escape de comillas/comas y
      neutralización de inyección de fórmulas CSV — OWASP — en el motivo y en campos de la fila).
    - **Hallazgo real cerrado en el camino (no solo este endpoint):** el panel (`central-admin-app/server.js`)
      reenvía `/api/privacy/fn/admin-consent/*` solo si la ruta cumple `PRIVACY_FN_RE`, cuyo patrón de segmento
      (`[A-Za-z0-9_-]+`) no admite el punto literal de `export.csv` — el endpoint habría quedado construido pero
      inalcanzable desde el panel real (403/404 del proxy antes de llegar a la función). Corregido con un patrón
      de segmento que admite **un** punto interno, nunca al inicio (`[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?`): sigue
      bloqueando `.`/`..` como segmento (no reintroduce recorrido de ruta), y admite `export.csv`. Sin esta
      corrección, no hacía falta ningún cambio en `index.ts` (reutiliza `deps.auditTrail.list`/`deps.audit` ya
      reales desde T16.a).
    - **Pendiente de entorno (no bloquea el cierre, mismo patrón que D-14 pero sobre `gates.sh`, no sobre
      Postgres):** se añadió `tests/privacy-fn-route.test.cjs` (lee el literal de `PRIVACY_FN_RE` del código
      fuente sin arrancar el servidor real, y prueba que admite `export.csv` y sigue bloqueando `.`/`..`), pero
      esta sesión no pudo ni ejecutarlo directamente (`node tests/privacy-fn-route.test.cjs` sin pasar por
      `gates.sh` pide aprobación que nadie concedió) ni cablearlo en `panel_unit()` de `gates.sh` (`Edit` denegado
      por ser `.claude/`, igual que D-14 #1). Verificado a mano, trazando el regex contra cada caso del archivo,
      pero una sesión sin esa restricción debe: (1) correr `node tests/privacy-fn-route.test.cjs` una vez para
      confirmarlo con Node real, y (2) añadir `&& node tests/privacy-fn-route.test.cjs` al final de la línea de
      `panel_unit()` en `gates.sh`.
    - **Aceptación:** filtros combinables igual que T16.a; sin `reason` (o en blanco) → 400 `reason_required`;
      filtro inválido → 400 `invalid_input` (antes de exigir el motivo); los tres roles → 200 con CSV; motivo
      agresivo con `=`/`+` al inicio queda neutralizado con un apóstrofe antepuesto; comillas/comas del contenido
      quedan escapadas; la exportación deja una fila de bitácora con el motivo y el recuento (nunca el CSV);
      `POST`/otros métodos → 405; `bash .claude/loops/consentimiento/gates.sh` completo en verde (9 puertas
      no-opcionales OK, incluido `panel-unit`/`panel-e2e` con el cambio de `server.js`; `db-reset`/`e2e-local`
      SKIP opt-in como siempre).
  - [x] **T16.c — Evidencia: búsqueda por correo (HMAC)/ID de usuario + historial con IP enmascarada** (REQ-17) (hecha 2026-10-09, iteración 55)
    - **Estado:** cerrada. `GET /evidence?email=…|user_id=…` (los tres roles del módulo, mismo candado que
      `/audit-log`: REQ-17 solo acota "Revelar IP", T16.d, no la lectura enmascarada). `EvidenceSearchSchema`
      exige exactamente uno de los dos parámetros. Con `email`: se normaliza (`trim().toLowerCase()`) y se
      hashea con `deps.emailHmac` (misma clave `LOOKUP_HMAC_KEY_B64` que `users.email_lookup_hmac` —
      `secure-register-user` ya la usa así); `deps.evidence.findUserIdByEmailHmac` busca en `users` por esa
      columna — nunca `ILIKE` sobre cifrado. Con `user_id`: se usa directo (valida uuid). Sin coincidencia
      (correo sin usuario, o user_id sin historial) → 200 `{user_id: null, items: []}`, nunca 404 (no hace
      visible la diferencia entre "no existe" y "no tiene historial"). `deps.evidence.listByUserId` (en
      `index.ts`) calcula `user_ref_hmac = hmacLookup(userId, 'LOOKUP_HMAC_KEY_B64')` (misma clave con la
      que `consent-write.ts`/`secure-register-user` ya escriben esa columna en `consent_records`), consulta
      por esa columna, descifra `ip_ciphertext` con `decryptConsentColumn` (ya existía, de T07) y la
      enmascara con `maskIp` (`_shared/client-ip.ts`, ya tenía el comentario "para vistas de evidencia
      admin antes de un reveal_ip explícito", escrito en T07/T03 antes de que esta tarea existiera) — el
      `EvidenceRow` que sale de `index.ts` nunca lleva el ciphertext ni la IP en claro; `handler.ts` no
      descifra nada directamente (mismo patrón que `emailTransport.decryptPassword`: toda crypto real vive
      detrás de un `Deps`, nunca en `handler.ts`, para que los fakes de `handler_test.ts` no necesiten
      claves de cifrado reales). 8 pruebas nuevas en `handler_test.ts`: los tres roles encuentran el
      historial por correo con IP ya enmascarada (y sin `ip_ciphertext` en la respuesta); búsqueda directa
      por `user_id`; correo sin usuario → vacío sin 404; sin parámetros / con los dos a la vez / `user_id`
      con formato inválido / correo demasiado corto → 400 `invalid_input`; sin rol → 403; `POST` → 405.
    - **Por qué no hace falta una prueba SQL nueva (regla de TEST-INT/PROMPT.md):** esta tarea es de solo
      lectura (`SELECT` sobre `users`/`consent_records`, sin ningún `INSERT`/`UPDATE`/`DELETE` nuevo) — la
      regla de PROMPT.md exige Postgres real para operaciones de ESCRITURA que dependan de una
      restricción/trigger/RLS que un fake pudiera ocultar; aquí no hay ninguna escritura nueva que
      verificar. El descifrado+enmascarado (`decryptConsentColumn`/`maskIp`) es lógica pura de Deno/Web
      Crypto, sin Postgres de por medio (a diferencia de un `DEFERRABLE`/trigger, que solo Postgres puede
      comprobar) — ya está cubierto indirectamente por `crypto_test.ts` (round-trip cifrado/descifrado) y
      por las pruebas de T07 (la fila real que `consent-write.ts`/`secure-register-user` escriben en
      `consent_records` usa exactamente el mismo esquema de AAD que `decryptConsentColumn` espera leer).
    - **Aceptación:** `bash .claude/loops/consentimiento/gates.sh` completo en verde (9 puertas no-opcionales
      OK; `db-reset`/`e2e-local` SKIP opt-in como siempre; iteración 55, no múltiplo de 5, `GATES_FULL=1` no
      obligatorio esta vez).
  - **T16.d — `reveal_ip` + exportación de expediente de un titular (REQ-17)** (división 2026-10-09, antes de codificar: la tarea mezcla una acción corta — revelar IP con motivo y bitácora — con una pieza más grande — generar JSON y PDF de un expediente completo, con su propia plantilla; se parte en dos, mismo patrón que T12.d/T15/T16)
    - [x] **T16.d.1 — `POST /evidence/reveal-ip`: IP real (sin enmascarar), solo `privacy_admin`, motivo obligatorio, registrado en bitácora** (REQ-17) (hecha 2026-10-09, iteración 56 — retoma el WIP de `handler.ts`/`handler_test.ts` de una iteración headless interrumpida, auditado y completo; faltaba el cableado real en `index.ts`)
      - **Estado:** cerrada. `EvidenceDeps.listByUserIdRevealed` (nuevo en `index.ts`, mismo patrón que
        `listByUserId` pero sin `maskIp`: descifra `ip_ciphertext` con `decryptConsentColumn` y devuelve la
        IP real) + `revealIp`/`RevealIpUserSchema` en `handler.ts` (`POST /evidence/reveal-ip`, solo
        `privacy_admin` vía `ADMIN_ONLY`, valida `user_id` antes que `reason` para que un UUID inválido dé
        `invalid_input` incluso sin motivo). La bitácora (`evidence.reveal_ip`, entidad `consent_records`,
        `entity_id = user_id`) nunca guarda la IP revelada en claro, solo `{row_count}`. El proxy del panel
        ya admite la ruta sin cambios (`PRIVACY_FN_RE` acepta varios segmentos `[A-Za-z0-9_-]+`, T16.b solo
        tuvo que ampliarlo para el punto de `export.csv`). 6 pruebas en `handler_test.ts` (ya estaban
        escritas en el WIP, confirmadas contra la implementación real: camino feliz con 2 filas incluyendo
        una IP `null`, sin coincidencias → 200 vacío con bitácora igual, sin motivo/motivo en blanco → 400
        sin bitácora, `user_id` ausente/no-uuid → 400 antes de pedir motivo, editor/auditor → 403, `GET` →
        405). No hace falta prueba SQL nueva (mismo razonamiento que T16.c: solo lectura + descifrado puro,
        sin ningún `INSERT`/`UPDATE`/`DELETE` nuevo que un fake pudiera ocultar — el único `INSERT` nuevo es
        la fila de bitácora, ya cubierta por las pruebas append-only de T08).
      - **Aceptación:** solo `privacy_admin` (editor/auditor → 403); sin motivo → 400 `reason_required`;
        `user_id` inválido → 400 `invalid_input`; camino feliz devuelve IP real (no enmascarada) + bitácora con
        actor, motivo y `row_count`, nunca la IP; método distinto de `POST` → 405.
    - [x] **T16.d.2 — Exportación de expediente de un titular (JSON y PDF simple)** (REQ-17) (hecha 2026-10-09, iteración 57)
      - **Estado:** cerrada. `GET /evidence/export.json` y `GET /evidence/export.pdf` (solo `privacy_admin`, `user_id`
        + `reason` por querystring, igual que T16.b): ambas construyen el mismo `EvidenceDossier` (`exportDossier`
        en `handler.ts`) reutilizando `evidence.listByUserId` (IP enmascarada, sin exigir "Revelar IP") +
        `evidence.listDsrByUserId` (nuevo en `EvidenceDeps`/`index.ts`: `data_subject_requests` por `user_id` —FK
        directa, sin HMAC—, solo `case_number/request_type/channel/status/received_at/due_at/resolved_at`, nunca
        ciphertext ni IP del solicitante). El JSON serializa el dossier tal cual; el PDF sale del mismo objeto vía
        `dossierToPdfLines` + `_shared/pdf-simple.ts` (nuevo: generador de PDF mínimo hecho a mano —cabecera, 1
        fuente Courier, texto plano paginado, xref/trailer— sin librería pesada, mismo nivel de esfuerzo que el CSV
        de T16.b; transcribe tildes/eñes a ASCII, nunca corrompe el PDF con un carácter fuera de rango). Bitácora
        `evidence.export_dossier` (entidad `consent_records`, `entity_id = user_id`) con `{consent_count, dsr_count}`,
        nunca el contenido del expediente. 13 pruebas nuevas en `handler_test.ts` + 7 en `pdf-simple_test.ts`
        (cabecera/trailer válidos, paginación con >LINES_PER_PAGE líneas, escape de paréntesis/barra invertida,
        transliteración de acentos, offsets de xref correctos).
      - **Por qué no hace falta una prueba SQL nueva (regla de TEST-INT/PROMPT.md):** mismo razonamiento que T16.c/
        T16.d.1 — solo lectura (`SELECT` sobre `consent_records`/`data_subject_requests`, sin ningún
        `INSERT`/`UPDATE`/`DELETE` nuevo que un fake pudiera ocultar); el único `INSERT` nuevo es la fila de
        bitácora, ya cubierta por las pruebas append-only de T08.
      - **Aceptación:** solo `privacy_admin` (editor/auditor → 403); sin motivo → 400 `reason_required`; `user_id`
        ausente/inválido → 400 `invalid_input` (antes del motivo); JSON y PDF con el mismo contenido (mismos
        identificadores presentes en ambos); bitácora con actor, motivo y recuento; método distinto de `GET` → 405.
  - [x] **T16.e — Solicitudes: cambio de estado (envuelve `update_data_subject_request_status`, 078) + listado con semáforo** (REQ-11, REQ-16) (hecha 2026-10-09, iteración 59)
    - **Estado:** cerrada. `GET /requests?status=…&limit=&offset=` (los tres roles del módulo, mismo candado
      que `/audit-log`/`/evidence`): lista `data_subject_requests` (`DsrCaseRow` — mismos campos que
      `DsrSummaryRow` más `id` y `user_id`; nunca ciphertext ni IP del solicitante) ordenada por `due_at`
      ascendente (lo más urgente primero), con `count` exacto sin paginar (igual que `auditTrail.list`).
      Cada fila lleva `semaphore` (`'vigente' | 'por_vencer' | 'vencida' | null`), calculado en `handler.ts`
      (`computeSemaphore`, nunca en `index.ts`): `null` para los dos estados terminales (`atendida`,
      `rechazada_con_motivo` — un caso cerrado no tiene presión de plazo); si no, `'vencida'` si `due_at` ya
      pasó, `'por_vencer'` si quedan ≤3 días (REQ-11), si no `'vigente'`. `POST /requests/{id}/status`
      (`EDITOR_ROLES`: privacy_editor + privacy_admin, no auditor — mismo nivel que editar un borrador, más
      que la simple lectura pero menos que "Revelar IP") envuelve la RPC `update_data_subject_request_status`
      (078): `new_status` debe ser uno de los cinco del `CHECK`; `resolution_note` opcional, se cifra con
      `encryptDsrResolutionNote` (AAD atada al `id` del caso, ya existía en `_shared/consent-evidence.ts`,
      sin usar hasta ahora) solo si el admin escribió algo — nunca sale en el expediente del titular
      (T16.d.2 ya la excluye de `DsrSummaryRow`); `reason` solo es obligatorio al pasar a
      `rechazada_con_motivo` (400 `reason_required_for_rejection`), porque es el único estado cuyo propio
      nombre lo exige — el resto de transiciones no fuerza un motivo (mismo criterio que `updateSettings`,
      que tampoco lo exige). La bitácora la deja la propia RPC dentro de la misma transacción que el
      `UPDATE` (igual que `confirm_privacy_email_change`/`publish_consent_document`): esta ruta NO vuelve a
      llamar a `auditLog` (sería doble). `id` inexistente → 404 `not_found` (mapeado en `index.ts` desde el
      mensaje `"no existe"` de la RPC, igual que el resto de RPCs envueltas). 17 pruebas nuevas en
      `handler_test.ts` (semáforo por estado/plazo, filtro+paginación, los tres roles leen pero solo editor
      y admin cambian estado, `rechazada_con_motivo` exige motivo, nota cifrada, 404, 405).
    - **Por qué no hace falta una prueba SQL nueva (regla de TEST-INT/PROMPT.md):** la propia RPC
      `update_data_subject_request_status` YA se verifica contra Postgres real en
      `supabase/tests/consent/data_subject_requests_lifecycle.sql` (T08): caso inexistente sin bitácora
      huérfana, estado fuera del `CHECK` rechazado, permisos (`service_role` únicamente), trigger
      append-only, y `verify_audit_chain()` íntegra tras los cambios. El resolutor de `index.ts` añadido
      aquí solo traduce esa RPC ya probada a `ApiError` tipados (mismo patrón que `documents.publish`) —
      no hay ninguna escritura nueva sin cobertura real que un fake pudiera estar ocultando.
    - **Hallazgo de diseño (antes de codificar):** `DsrSummaryRow` (T16.d.2) no lleva `id`, solo
      `case_number` — insuficiente para `POST /requests/{id}/status`, porque la RPC busca por `id` (UUID),
      nunca por `case_number`. Se definió `DsrCaseRow` como un tipo nuevo (no una extensión de
      `DsrSummaryRow`) con `id` + `user_id` añadidos, en vez de agregar `id` a `DsrSummaryRow`: el
      expediente de un titular (T16.d.2) no necesita expone el `id` interno de cada solicitud, y mezclar
      ambos usos en un solo tipo habría hecho ambiguo cuál es opcional para quién.
    - **Aceptación:** los tres roles → 200 en `GET /requests`; filtro `status` + `limit`/`offset` (tope 200)
      combinables; parámetro inválido → 400 `invalid_input`; semáforo correcto por estado/plazo; solo
      `privacy_editor`/`privacy_admin` → 200 en `POST /requests/{id}/status` (auditor → 403); `new_status`
      inválido o `id` no-uuid → 400 `invalid_input`; `rechazada_con_motivo` sin `reason` → 400
      `reason_required_for_rejection`; caso inexistente → 404 `not_found`; métodos distintos → 405;
      `bash .claude/loops/consentimiento/gates.sh` completo en verde (9 puertas no-opcionales OK;
      `db-reset`/`e2e-local` SKIP opt-in; iteración 59, no múltiplo de 5, `GATES_FULL=1` no obligatorio).
  - [ ] **T16.f — `verify_chains`: envuelve `verify_consent_chain()`/`verify_audit_chain()`** (REQ-18)

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
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T11 (`update-my-consent`) y T13 (`request-data-subject-right`), ninguna hecha todavía.
  - Estado por finalidad, versión aceptada, fecha; interruptores de opcionales; formulario de
    solicitud de derechos con tipo; muestra número de caso y fecha límite.
  - **Tests E2E:** revocar publicidad en un clic; solicitar baja muestra número de caso.

- [ ] **T19b — Invitados (sesión anónima): inventario, y aviso breve si guardan datos** (D-12, REQ-06, REQ-07)
  - **Estado real (2026-09-29, reconciliación):** Solo diseño e investigación (iteración 7, INV-SEC de la iteración 9). El paso 1 (inventario formal en PROGRESS.md con archivos y consultas) no se ha escrito como tal — lo más cercano es el hallazgo de INV-SEC sobre el RPC `learning_state`. Pasos 2A/2B/3 sin empezar.
  - **Decisión D-12 (2026-09-28):** primero inventariar; luego A o B según el resultado; mientras no esté implementado y probado, **`enable_anonymous_sign_ins` debe estar desactivado en producción** (opción C) y el modo invitado **no entra en el release**.
  - **Paso 1 — inventario (sin cambiar código):** qué guarda hoy un usuario con `is_anonymous = true`: filas por tabla y columna (`users`, `learning_state`, puntajes, respuestas), `security_events`, `admin_audit_log`, logs con IP, funciones que aceptan sesión anónima, y si alguna manda datos a un proveedor de IA. Documentarlo en `PROGRESS.md` con archivos y consultas de solo lectura (las que toquen producción las ejecuta la persona responsable). Puntos de partida: `frontend/src/components/GuestRegisterPrompt.tsx` (sin versionar), `App.tsx` (`isGuest`), `CinematicPublicShell.tsx`, `DojoDetailPage.tsx`, `supabase/config.toml` (`enable_anonymous_sign_ins`), migración 058 (`learning_state_guest_fix`, sin versionar).
  - **Antecedentes (resumen; detalle en `PROGRESS_ARCHIVO.md`, iteración 7):** el invitado es una sesión anónima real de Supabase Auth, sin fila en `users`, que responde preguntas del primer dojo vía `learning_state` → probablemente **sí guarda datos** (opción B). El candado de rutas es solo de frontend; no hay caducidad ni limpieza de sesiones anónimas. El paso 1 debe confirmarlo y proponer un job de limpieza.
  - **Paso 2A — si no guarda nada personal en la base:** se mantiene el modo invitado; el aviso completo se muestra al convertirse en cuenta (flujo de REQ-06). Prueba: un invitado no genera filas personales ni evidencia; al registrarse pasa por el aviso completo.
  - **Paso 2B — si guarda datos:** antes de crear la sesión anónima, aviso breve con enlace al aviso completo y botón "Continuar como invitado", registrado como evidencia con la finalidad `invitado_basico` (finalidad nueva en el documento del aviso y en el seed; requiere texto validado por la persona responsable); los invitados **no envían datos personales a proveedores de IA** y su sesión anónima **caduca** (configurar y probar); al convertirse en cuenta pasan por el flujo completo (REQ-06). Prueba: sin el aviso breve no se crea la sesión anónima; el evidence queda con `invitado_basico`.
  - **Paso 3 — comprobación de release:** una puerta o lista en T99 que verifique `enable_anonymous_sign_ins = false` en la configuración que se despliega mientras 2A/2B no estén cerradas.
  - Depende de T04 (rutas y `auth-guard`) para el paso 1; los pasos 2A/2B dependen del esquema de T06 y del aviso publicado (`secure-register-user` ya escribe la evidencia del registro).

- [ ] **T20 — Re-consentimiento al iniciar sesión** (REQ-09)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende del modelo de `requires_reconsent` en `consent_documents` (ya existe la columna, T06) y de T19 (pantalla donde mostrarlo).
  - **Tests E2E:** publicar v1.1 con reconsent → siguiente login muestra aviso; aceptar continúa;
    rechazar la obligatoria solo permite baja o cerrar sesión.

## Fase 5 · Panel administrativo — sección "Consentimiento informado"

- [ ] **T21 — Navegación y pestaña Versiones + Editor** (REQ-13 a, b)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Ninguna pantalla del panel para el módulo existe todavía en `central-admin-app`. Depende de T05 (identidad individual en el panel) y T14 (acciones de `admin-consent` que esta pantalla consume).
  - Menú "Consentimiento informado"; lista de versiones; crear borrador desde vigente; editor
    Markdown con vista previa en vivo (marcadores resueltos y resaltados si faltan);
    editor de finalidades (código inmutable para las existentes); guardado con autosave del
    borrador y aviso de cambios sin guardar.

- [ ] **T22 — Comparar y Publicar** (REQ-13 c, d)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T21 y T14.
  - Diff lado a lado; modal de publicación con motivo, casilla `requires_reconsent`,
    confirmación escribiendo la versión; resumen de impacto (nº de usuarios que verán re-consentimiento).

- [ ] **T23 — Configuración del responsable y delegado** (REQ-14, REQ-15)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T15 (`update_settings`/`confirm_email_verification`, sin hacer) y T05.
  - Formulario con todos los campos; flujo de verificación del nuevo correo con estado
    "pendiente de verificación"; historial de versiones de configuración.

- [ ] **T23b — Panel: sección "Correo saliente"** (REQ-21, SEC-03)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T12 (`EmailSender`, sin iniciar) y T05.
  - Sección "Correo saliente" dentro de "Consentimiento informado", **visible y operable solo para `privacy_admin`** (editor y auditor no la ven).
  - Formulario: modo (`resend` por defecto | `smtp`), host, puerto, seguridad SSL/TLS, usuario, contraseña, nombre y correo del remitente, reply-to, habilitado. La clave de Resend no aparece ni se edita. La contraseña se muestra como "configurada / no configurada" y solo se puede reemplazar escribiendo una nueva; nunca viaja de vuelta al navegador.
  - Aviso en pantalla: "Supabase bloquea los puertos 25 y 587; usa 465 con SSL/TLS". Botón "Enviar correo de prueba" (al admin conectado) con el último resultado (fecha y ok/error corto).
  - Banner **"Correo no configurado / con errores"** con el contador de avisos pendientes y el botón para reenviarlos; visible en la pestaña Solicitudes y en la cabecera de la sección.
  - Historial de versiones de la configuración (sin contraseñas) con quién y cuándo.
  - **Tests E2E del panel:** editor y auditor no ven la sección; la contraseña no aparece en el DOM, en las respuestas de red ni tras guardar; el banner aparece con el modo roto y desaparece tras reenviar; el correo de prueba queda en la bitácora. Depende de T12 y T05.

- [ ] **T24 — Bitácora, Evidencia y Solicitudes** (REQ-16, REQ-17, REQ-11)
  - **Estado real (2026-09-29, reconciliación):** Sin iniciar. Depende de T16 (las acciones que esta pantalla invoca) y T05.
  - Bitácora con filtros y detalle before/after (diff); export CSV.
  - Evidencia: búsqueda, historial, IP enmascarada, "Revelar IP" con motivo; export de expediente.
  - Solicitudes: tabla con semáforo (vigente / ≤3 días / vencida), cambio de estado con nota.
  - Botón "Verificar integridad".
  - **Tests E2E del panel:** editor no ve botón Publicar; auditor no ve "Revelar IP";
    cada acción aparece en bitácora.

## Fase 6 · Migración, documentación y cierre

- [ ] **T25 — Backfill de consentimientos legacy** (según plan T01; **D-10 y D-11 decididas**)
  - **Estado real (2026-09-29, reconciliación):** Solo diseño (D-10/D-11 decididas, plan completo en PROGRESS.md iteración 2 y esta tarea). Ni la migración (a) ni el script (b) están escritos — y **no deben** escribirse/ejecutarse como iteración normal del loop: el propio criterio de la tarea dice que el script solo corre dentro de la ventana de release, con OK explícito. Depende de T19 (requires_reconsent) y de que 074/075 estén aplicadas en producción.
  - **Decisiones que aplican:** D-10 = conservar el consentimiento anterior como historial (documento retirado `legacy-2026-06-22`, evidencia limitada: solo fecha) y publicar el aviso 1.0 con `requires_reconsent = true` (T19 lo muestra a todos en su próximo inicio de sesión; **pendiente de confirmación por asesoría legal antes del release**, no bloquea el código). D-11 = ver los dos puntos siguientes.
  - **(a) Migración nueva** (siguiente número libre al momento de hacerla; NO se edita la 073): `ALTER TABLE consent_records ALTER COLUMN ip_hmac DROP NOT NULL` + `CHECK (ip_hmac IS NOT NULL OR document_version LIKE 'legacy-%')`. Las filas nuevas siguen obligadas a tener `ip_hmac`. Debe entrar en la misma ventana de release que 074–077 (añadirla a `PLAN_PRODUCCION_RELEASE.md` cuando exista, en el mismo commit). Prueba SQL en `supabase/tests/consent/` y puerta en `gates.sh`: una fila con `document_version = 'registro-1.0'` y `ip_hmac` nulo **falla**; una `legacy-2026-06-22` sin IP **pasa**; `verify_consent_chain()` sigue sin filas rotas.
  - **(b) Script de un solo uso** (no migración; necesita `LOOKUP_HMAC_KEY_B64`): idempotente, en lotes de 500, **`--dry-run` por defecto** (solo cuenta las poblaciones A/B/C del plan y muestra 3 ids abreviados, sin correos ni IP); solo escribe con `--apply`. La clave HMAC llega **por variable de entorno en esa sesión**: nunca se escribe en archivos ni en logs (el script no imprime variables de entorno ni hace `console.log` de la clave, y sus pruebas lo verifican). **Se ejecuta únicamente dentro del release y con el OK explícito de la persona responsable; jamás en una iteración del loop ni contra producción desde aquí.** Mismo diseño de filas que PROGRESS.md, Iteración 2, §3 (documento legacy `retired`, una fila `registro_aprendizaje` `granted` por persona con `authorized = true`, `server_ts` original, sin IP; nada para quien nunca autorizó ni para las finalidades opcionales).
  - **Tests obligatorios:** dry-run no escribe nada (cliente falso sin llamadas de INSERT); `--apply` dos veces inserta lo mismo que una; el `user_ref_hmac` coincide con `hmacLookup(user_id)` del registro; sin IP ni agente; quien tiene `authorized = false` no recibe fila; el documento legacy nunca queda `published`; sin la variable de la clave el script aborta con mensaje claro sin imprimir nada secreto.
  - **Orden:** después de T19 (necesita `requires_reconsent`) y de 074/075 aplicadas (la 074 aborta si ya hay filas de evidencia).

- [ ] **T98 — Documentación** (H14)
  - **Estado real (2026-09-28):** PARCIAL. Hecho: `PROGRESS.md`, `PLAN_PRODUCCION_RELEASE.md` (release único, con respaldo; renombrado desde `PLAN_PRODUCCION_074_075.md` en la iteración 20 al cubrir 074–077), `diag/README.md`. Falta: `SECURITY_PRIVACY.md`, manual administrativo, `BASE_DE_DATOS.md`, `.env.example`, rotación de claves, runbook de bajas, lista para legal.
  - Incluir el correo saliente (REQ-21): configuración, rotación de la contraseña SMTP, qué hacer con el banner de avisos pendientes; y la mención de Resend (transferencia internacional) en el aviso.
  - Actualizar `SECURITY_PRIVACY.md`, manual administrativo (sección nueva con capturas o pasos),
    `BASE_DE_DATOS.md`, `.env.example`; procedimiento de rotación de claves; runbook de atención
    de solicitudes de baja; lista de lo que debe completar el área legal antes de publicar.

- [ ] **T99 — Verificación final**
  - `gates.sh` completo en verde; `verify_consent_chain()` y `verify_audit_chain()` OK sobre seed;
    búsqueda de `decodeJwtRole` sin usos nuevos; búsqueda de `console.log` con PII en archivos
    tocados; checklist de REQ/SEC en `PROGRESS.md` con evidencia (test o archivo) por requisito;
    lista de pendientes para producción (secretos a crear, config de proxy, decisiones abiertas);
    **`enable_anonymous_sign_ins` desactivado en lo que se despliega salvo que T19b esté cerrada (D-12)**; **`frontend` tiene la ruta `/registro`** (ver T-ruta-registro).

---

## Tareas añadidas durante la ejecución

Nombres fuera de la numeración original (`Tnn-extra`, según PROMPT.md). Ojo: **T14-fix no tiene relación con T14** (`admin-consent`): es el arreglo del versionado de `privacy_settings`.

- [ ] **T02-extra — Migrar `users.email_encrypted` y `full_name_encrypted` a AAD** cuando se actualicen sus lectores
  - **Añadido desde T02:** `_shared/pii.ts` (sin versionar en git hoy) descifra siempre con la clave base e ignora `payload.v`: tras una rotación de claves `championship-draw-round1` (que lo importa) no podría leer correos cifrados con la clave anterior. Hacer que delegue en `crypto.ts` (`decryptPii`) y commitearlo junto con el resto del trabajo previo, con aprobación.
  - Solo añade AAD a las columnas antiguas, **sin cambiar de formato** (D-09 = A). AAD `users:<columna>:<user_id>`. Lectores a actualizar: `_shared/pii.ts`, `get-ranking` y copias inline. Re-cifrado por lotes; leer con y sin AAD durante la transición.
  - Depende de T02.
- [ ] **T03-prod — Medir la cabecera de IP en Supabase hospedado** (D-08) ⛔ BLOQUEADA (D-08: pendiente de que la persona responsable ejecute la consulta del Logs Explorer)
  - Método: consulta del Logs Explorer y, solo si no alcanza, función de diagnóstico con JWT de admin (ver `loop-consentimiento/diag/README.md`). Fijar `TRUSTED_PROXY_HOPS` o pasar a `cf-connecting-ip`.
  - Bloquea el paso a producción (T99). Requiere una acción humana en producción.
- [ ] **T03-sec — [P0] Rate limit y `security_events` con la cabecera de confianza, no la primera entrada de X-Forwarded-For** ⛔ BLOQUEADA (D-08 / T03-prod)
  - Hoy `extractClientIp` toma la primera entrada, que controla el cliente: rotándola se evade el límite por IP (también el del registro). Unificar con `_shared/client-ip.ts`.
  - Depende de T03-prod (con la topología equivocada todos compartirían un solo bucket).
- [x] **T14-fix — Versionado de `privacy_settings`** (migración 075) — hecha
  - Sin `is_current` ni SECURITY DEFINER; `privacy_email_verifications` actualizable y acotada; `supabase/tests/consent/settings_versioning.sql`. Pendiente solo de aplicar en producción, dentro del release único.
- [x] **T00-extra — [P1] Migraciones no reproducibles desde cero** (hecha 2026-09-30, iteración 23: propuesta entregada; ejecución en `T00-extra-exec`, ⛔ D-13)
  - **Estado:** cerrada (propuesta). `supabase db reset` falla siempre en la migración 004 (`column "role" does not exist`: `is_admin()` referencia `role` antes de que la misma migración la cree) — en PG16 y PG17, no es específico de versión. Propuesta detallada en D-13 (baseline de esquema de producción como migración única). Ejecutada como `T00-extra-exec` (opción A'). Nada tocado en `supabase/migrations/` ni en `gates.sh` por esta tarea.
- [x] **T-ruta-registro — [P0] La ruta `/registro` no existe en el código versionado** (hecha 2026-09-28)
  - **Estado:** cerrada. El `App.tsx` versionado no declaraba la ruta `/registro` (solo existía sin commitear). Aplicado `patches/registro-route.patch` (commit `005940a`) + 2 defectos de compilación encontrados y corregidos (commit `956f289`). Verificado: build OK, `register.spec.ts` 77/77 en 7 perfiles.

- [ ] **AUDIT-IP-extra — [P2] `admin_audit_log.ip_ciphertext`/`ip_hmac`/`key_version` (073) nunca se rellenan** (añadida 2026-10-09, T16.a)
  - **Por qué:** REQ-16 pide que la bitácora guarde "IP del admin cifrada + HMAC"; la tabla ya tiene las tres
    columnas (073) pero `AuditEntry` (`handler.ts`) no las declara y ningún llamador de `deps.audit` (T05.a,
    T14, T15, T12.d) las rellena — hoy siempre quedan `NULL`. `GET /audit-log` (T16.a) no puede mostrar un
    dato que nunca se escribió.
  - **Qué:** añadir `ip`/`userAgent` (o ya la IP cifrada+HMAC) a `AuditEntry`, obtenerlos con
    `_shared/client-ip.ts` (mismo patrón que T10/T11/T13, IP solo del proxy de confianza) dentro de
    `auditLog()` (`handler.ts`), y cifrar con `crypto.ts` (AAD propia, H15) antes de insertar.
  - Depende de T04 (ya hecha). No bloquea T16.a/T16.b (ambas pueden listar/exportar los campos que sí
    existen); si se cierra antes de T99, `GET /audit-log`/el CSV deberían empezar a mostrar la IP
    enmascarada del admin como parte del mismo cambio.

- [ ] **SEC-SSRF — [P0, independiente del módulo] Redesplegar `security-diagnose`, `security-easm-scan` y `security-kata-convert` con el `news-agent-core.ts` actual (con control de SSRF para URLs configuradas por admin)**
  - **Estado:** sin desplegar. `security-diagnose`, `security-easm-scan` y `security-kata-convert` corren una copia anterior de `_shared/news-agent-core.ts` (476 líneas, previa al arreglo de SSRF), sin `url-guard.ts`. Decisión tomada (iteración 8): desplegar la versión completa de `main` (540 líneas: SSRF + tope 512KB + `.csv`/`.json` + `shuffleOptions`), no un parche parcial, para no dejar 3 versiones distintas conviviendo en producción. Detalle de las 78 líneas de diferencia: `PROGRESS_ARCHIVO.md`, iteraciones 6-7.
  - **Criterio de importaciones (obligatorio antes de cualquier despliegue):** listar con `deno info --json <función>/index.ts` los archivos de `_shared/` que importa cada una (transitivo) y anotarlo en `PROGRESS.md`. **Medido el 2026-09-28: las tres importan solo `_shared/news-agent-core.ts` → `_shared/url-guard.ts`.** Si en el momento de desplegar alguna importa algo modificado por el módulo (`rate-limit.ts`, `crypto.ts`, `consent-evidence.ts`, `consent-*.ts` u otro), **DETENERSE y avisar a la persona responsable antes de cualquier despliegue**.
  - **Desde dónde se despliega (obligatorio):** `supabase functions deploy` sube la **carpeta local**, no un commit. Debe hacerse **desde el worktree de `main` (`~/Riesgo-wt/main`, limpio y en el commit acordado), nunca desde la carpeta de trabajo** (que tiene cambios sin commit y código del módulo en otra rama). Antes de cada despliegue: `git -C ~/Riesgo-wt/main status --short` vacío y `git -C ~/Riesgo-wt/main log -1` anotado en `PROGRESS.md`; repetir ahí el criterio de importaciones (`deno info`).
  - **Cuándo:** después de que `chore/baseline-produccion` esté integrada en `main` (ya lo está desde la Fase 2, `430527f`). **No se ha desplegado nada; espera el OK explícito de la persona responsable, función por función.** La versión que se despliega debe ser la de `main`, no la del árbol de trabajo.
  - **Pruebas antes de desplegar:** `deno check` de las 3 funciones y una prueba local de cada una (con `supabase functions serve` y un cliente/servidor falsos; cero llamadas a producción): URL privada (10.x, 127.x, 169.254.x, metadatos) rechazada; redirección a IP privada rechazada; página > 512 KB truncada sin error; `.csv`/`.json` aceptados; opciones barajadas con la correcta en posiciones distintas. Ejecutar además `tests/shuffle-options.test.cjs`.
  - **Despliegue:** **solo con OK explícito de la persona responsable, función por función** (`supabase functions deploy <nombre>`, nunca las tres juntas ni sin OK; el loop no despliega). Verificación posterior por función: `supabase functions download` a una carpeta aparte y comparar con `main`; llamada de humo con una URL privada configurada (debe rechazarse) y otra pública (debe funcionar); revisar los logs de esa función.
  - **Aceptación:** las 3 funciones desplegadas igualan `main` byte a byte (salvo fin de línea), pruebas locales verdes, resultado anotado en `PROGRESS.md`.

- [ ] **UX-integración — Al integrar `wip/ux-redesign`: confirmar la eliminación de `public/demo/` y su relación con el modo invitado (D-12)**
  - La rama borra `frontend/public/demo/` (`index.html`, `app.js`, `style.css` y `bank.json` de 33 079 líneas), borra `PracticePage.tsx` y redirige `/practica` → `/dojos`. Confirmar con la persona responsable que es **intencional** y que no hay enlaces externos a esas rutas.
  - Relación con D-12: la demo estática (progreso en `localStorage`, nada en la base) era la alternativa **sin datos en el servidor** (opción A); el vault dice que la reemplazó la sesión anónima. Al integrar la rama, la opción A deja de existir: solo quedan B (aviso breve `invitado_basico`, T19b) o C (`enable_anonymous_sign_ins = false` en producción). Integrar la rama UX no debe adelantarse al release si T19b no está cerrada, o debe ir con el modo invitado apagado.
  - `tests/proposal.visual.cjs` (versionado) menciona `/demo/`: actualizarlo o retirarlo con la rama. Los dos videos `cara.webm` y `sello.webm` sí van versionados en esa rama (los carga `SenseiChallengeModal`).

- [ ] **INV-SEC — [P2 (bajada de P0 el 2026-09-28: la verificación no encontró fuga de datos de otras personas ni acceso a IA), independiente del módulo] Revisar políticas RLS y RPC que aceptan el rol `authenticated` sin excluir `is_anonymous`**
  - **Por qué:** en Supabase un usuario de sesión anónima (`signInAnonymously`) tiene el rol `authenticated` y un JWT con `is_anonymous = true`; toda política RLS y todo RPC/función abierto a `authenticated` lo acepta igual. Cualquiera puede crear una sesión anónima llamando directamente a la API de Auth con la clave anónima pública, **sin pasar por el frontend**; el bloqueo del modo invitado (`GuestGate`, `isGuestAllowedPath`) existe solo en el navegador. `config.toml` solo gobierna el entorno local; en producción manda el panel de Supabase (Authentication → Sign In / Providers → Anonymous sign-ins), que la persona responsable comprueba aparte.
  - **Alcance (solo lectura primero):** (1) inventario de todas las políticas RLS (`pg_policies`) con `TO authenticated` o sin rol explícito, y de todas las funciones/RPC con `GRANT EXECUTE ... TO authenticated` (o `PUBLIC`), marcando cuáles no excluyen `(auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE`; empezar por `learning_state`, `learning_overview`, `check_rate_limit`, las tablas del campeonato, `security_*` y todo lo de las migraciones 030–072. (2) Edge Functions con `verify_jwt = true` que aceptan cualquier sesión válida: cuáles llaman a proveedores de IA (`run-news-agent`, `quiz-generator`, `import-question-bank`, `fix-learning-item-balance`, `security-*`, `save-provider-key`) y cómo se autorizan (`requireAdminOrScheduler`, rol en `users`): un anónimo no debe poder llamarlas. (3) Qué puede escribir un anónimo fuera de su propio progreso.
  - **Criterio:** los usuarios anónimos **no pueden llamar a funciones de IA ni escribir fuera de su propio progreso**. Cualquier hallazgo se corrige con una migración nueva (nunca editando las existentes), p. ej. políticas restrictivas `AS RESTRICTIVE` o condición `is_anonymous IS NOT TRUE`, con prueba SQL que use un JWT anónimo simulado y demuestre el rechazo. Las consultas contra producción de solo lectura las ejecuta la persona responsable.

  - **Estado:** verificación de 2026-09-28 (solo lectura) respondió las 3 preguntas de la persona responsable — detalle completo con citas de archivo/línea en `PROGRESS_ARCHIVO.md`. Resumen: el tope de 10 preguntas es solo de frontend (sin control server-side, **ya cerrado abajo**); el primer dojo SÍ está protegido en SQL (`learning_state`); un JWT anónimo directo no puede leer otros dojos ni el banco completo; ninguna Edge Function de IA revisada acepta sesión anónima. Inventario adicional (`get-ranking`, `get-private-profile`, `championship-draw-round1`, `log-login-event`): solo `get-private-profile` queda con una nota (protección implícita, no explícita, revisar junto con T19b); las otras 3 están bien.
  - **Hecho (2026-09-28):** tope de 10 llevado al servidor — migración `076_learning_guest_limit.sql` (`learning_answer`/`learning_start_exam` rechazan a invitados con `GUEST_LIMIT_REACHED`); frontend (`DojoDetailPage.tsx`/`KataExamPage.tsx`) muestra panel de registro; pruebas SQL (`sql-guest-limit` en `gates.sh`) y Playwright (102/109, ver hallazgo aparte).
  - **Falta:** el resto del alcance original (tablas del campeonato, `security_*`, migraciones 030–072) sigue sin revisar.
  - **Hallazgo aparte, sin corregir (fuera del alcance de hoy):** `tests/frontend/kata-exam.spec.ts:82` ya fallaba antes de este cambio (candado de cliente para invitados nunca implementado en código commiteado). No es una regresión de esta tarea; pertenece a T19b/UX-integración.

- [ ] **REPO-UNIF — Decidir qué repositorio de GitHub es el oficial** (RIESGO.git vs CyberDojo.git)
  - **Hallazgo (2026-09-28):** `origin` apunta a `https://github.com/Rchavez001/RIESGO.git`, sin las ramas de hoy (el push reportado como hecho no llegó — confirmado con `git ls-remote origin`). Existe además `https://github.com/Rchavez001/CyberDojo.git`, con un `main` propio de **solo 5 commits** ("Initial CyberDojo project import" + 4 parches manuales de despliegue, todos del 1 de septiembre de 2026), **sin ningún ancestro común** con la historia de RIESGO. RIESGO está meses por delante (Centro de Seguridad, campeonato, todo el módulo de consentimiento, lo de hoy); CyberDojo solo tenía dos cosas que RIESGO no tenía: `frontend/Dockerfile` y su parche de build-args — ya copiados a RIESGO (`caa1432`, ver PROGRESS.md).
  - **Antes de tocar CyberDojo.git de cualquier forma (nunca con force-push sin decidir esto primero):** comprobar en la consola de Google Cloud si **Cloud Build → Triggers** o **Cloud Run → `cyberdojo`/`cyberdojo-admin` → Despliegue continuo** están conectados a `CyberDojo.git` (lo más probable, dado que ahí están los únicos `Dockerfile`) o a `RIESGO.git`. Si despliegan desde CyberDojo, cualquier cambio en su `main` (incluido un force-push) dispara un despliegue real.
  - **Decisión pendiente de la persona responsable:** cuál de los dos repositorios sigue existiendo como el oficial, y qué pasa con el otro (se archiva, se borra, se deja como espejo de despliegue). No se ha tocado `CyberDojo.git` de ninguna forma.

- [ ] **PANEL-HOTFIX — [P1, independiente del módulo] Llevar a producción solo el cierre del proxy de Auth y la restricción de las tablas del módulo en el proxy del panel** (añadida 2026-09-30 por la persona responsable)
  - **Por qué:** hoy, en producción, la Basic Auth compartida del panel + el proxy con service role permiten (a) llamar a la API admin de Auth (`/api/auth/v1/admin/...`: generar un enlace de acceso para cualquier usuario, borrar factores MFA) y (b) leer y escribir las tablas del módulo ya creadas por la 073 (`admin_roles` — concederse un rol —, `consent_records`, `admin_audit_log`…). Ver T05.a (iteración 16).
  - **Alcance exacto (nada más):** de `central-admin-app/server.js` en `07e19ac`, solo: el 403 para `/api/auth/v1/`, `CONSENT_MODULE_RE` + `decodedLower` y su comprobación antes de `proxySupabase`, y el refactor mínimo `relay()` si hace falta para aplicar lo anterior limpio. **No** las rutas `/api/privacy/*` (dependen de `admin-consent`, aún sin desplegar, y de `SUPABASE_ANON_KEY`).
  - **Método (misma disciplina que SEC-SSRF):** en un worktree limpio de `main` (`~/Riesgo-wt/main`, `git status` vacío), rama `hotfix/panel-proxy`; aplicar solo esos cambios; confirmar antes con `grep` que el `app.js` de `main` no usa `/api/auth/v1/` ni ningún nombre bloqueado; pruebas: `tests/admin/server.spec.ts` + los casos de 403 de `privacy-session.spec.ts` (sin los de `/api/privacy/*`) contra el mock, y `panel-e2e` completo en un perfil para descartar regresiones; fusionar en `main` solo con OK.
  - **Despliegue:** comandos preparados y escritos en `PROGRESS.md`/un `.md` aparte, **nada ejecutado sin OK explícito de la persona responsable**. Antes de desplegar, resolver la duda de REPO-UNIF (si Cloud Run despliega desde `CyberDojo.git`, el comando de despliegue es otro). Verificación posterior de humo en producción (solo lectura de códigos de estado): `/api/auth/v1/admin/users` y `/api/rest/v1/admin_roles` → 403; `/api/rest/v1/users?select=id&limit=1` → 200.
  - **Aceptación:** producción responde 403 en las rutas cerradas y el resto de la consola funciona igual; resultado anotado en `PROGRESS.md`.

- [x] **T00-extra-exec — [P1] Construir y verificar la migración base (según D-13)** (hecha 2026-09-30, iteración 24)
  - **Estado:** cerrada (D-13, opción A'). Dump de producción revisado (0 secretos/PII) guardado en `supabase/baseline/prod_schema.sql`, fuera de `supabase/migrations/` (001-072 intactos). `gates.sh`/`db-reset` reconstruye desde ese baseline + 074-078 en vez de `supabase db reset`. Verificado: diff contra dump real limpio, migraciones pendientes aplican limpias, `GATES_SELFTEST=1` OK. Detalle: `PROGRESS_ARCHIVO.md`, iteración 24.

- [ ] **SESION-REVOCADA — [P2] Acciones sensibles: comprobar que la sesión del admin sigue activa, no solo que el JWT no ha expirado** (añadida 2026-09-30)
  - **Por qué:** `auth-guard` verifica el JWT localmente (JWKS); un token de una sesión cerrada o revocada sigue siendo válido hasta su `exp` (`jwt_expiry = 3600`). Ver PROGRESS.md, iteración 15.
  - **Qué:** una opción de `requireRole` (p. ej. `requireActiveSession: true`) que, además de la verificación local, confirme la sesión en el servidor de Auth — `auth.getUser(jwt)` (GoTrue rechaza sesiones cerradas) o consulta de `session_id` en `auth.sessions` —, fallando cerrado (401 `session_revoked`; 503 si Auth no responde).
  - **Dónde:** publicar y retirar versiones (T14), revelar IP (T16), cambiar/verificar el correo del delegado (T15); y cualquier acción futura de la misma categoría.
  - **Tests:** tras `logout` (o revocar la sesión), la acción sensible devuelve 401 `session_revoked` aunque el JWT aún no haya expirado; las acciones no sensibles siguen funcionando solo con la verificación local; Auth caído → 503, nunca acceso.

- [ ] **PANEL-ECHARTS-MOBILE — [P2, independiente del módulo] `echarts-gl` (bar3D de Reportes) lanza "Invalid expression." de forma intermitente en Chrome de Android** (añadida 2026-09-30, detectada al extender `gates.sh`/`panel-e2e` con un segundo perfil por defecto, `pixel-7-chrome`; preexistente, ya anotada como riesgo en PROGRESS.md iteración 17 — T05.b)
  - **Por qué:** `runReport()` inicializa el gráfico 3D de Reportes (`echarts-gl`) aunque ese panel no esté visible; en emulación Android de Playwright falla intermitentemente con `Invalid expression.` (2 de 5 corridas reproducidas).
  - **Estado:** mitigación temporal aplicada en `shell.spec.ts:24` (descarta solo ese mensaje exacto en `pixel-7-chrome` y, desde la iteración 50 (2026-10-08, primera corrida real de `GATES_FULL=1` en la historia del loop), también en `galaxy-s9-chrome` — reprodujo el mismo mensaje exacto ahí, el otro perfil Android/Chrome de los 7; cualquier otro error, o este mismo mensaje en cualquier otro perfil, sigue fallando la prueba).
  - **Falta:** no iniciar el gráfico 3D hasta que el panel de Reportes sea visible (lazy init), o investigar el fallo con contenedor oculto en WebGL por software; luego revertir el filtro de `shell.spec.ts:24`.
