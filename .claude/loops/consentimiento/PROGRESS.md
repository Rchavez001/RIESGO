# PROGRESS — Módulo de Consentimiento Informado y Derechos del Titular

Última actualización: 2026-09-28 (tarde). Fuente de requisitos: SPEC v1.0 (REQ-01…20, SEC-01…09).
El paquete del loop (PROMPT, SPEC, TASKS, DECISIONS, seed, run-loop.sh) está instalado en `.claude/loops/consentimiento/` y el trabajo sigue en la rama
`feature/consentimiento-lopdp`. Este archivo tiene dos partes: las secciones de loop (mapa del repo, línea base, iteraciones — al final) y el
historial previo al loop (estado, decisiones, hallazgos abiertos). Los pasos 2 y 3 de instalación del README (fusionar `settings.loop.json` y añadir
`CLAUDE.md.fragmento`) NO se han hecho: cambian permisos e instrucciones del proyecto y los decide la persona responsable.

## Estado (estimación contra la SPEC, no contra TASKS.md)
- **Contra TASKS.md: 3 de 28 tareas cerradas (10,7 %)** — T00, T01 y T02; el resto tiene su "Estado real" anotado en TASKS.md. Ponderando lo parcial,
  ≈ 33 % (estimación mía a partir de esas anotaciones: ≈31 % antes de T02, que aporta lo que le faltaba). Contra la SPEC: ~42 % escrito.
- ~19 % en producción (solo Fase 0; 074, 075 y Fase 1 NO están desplegadas, a la espera del release único).
- Verificado con pruebas automáticas: cripto+AAD, cuota fail-closed, evidencia, registro de punta a punta, ciclo de vida SQL (073+074),
  versionado de `privacy_settings` (075), la función de diagnóstico T03, y una prueba de punta a punta contra Supabase local (21/21).

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Esquema 073, roles, cripto, cadenas de hash | Aplicada en producción. Tenía 3 defectos, corregidos en 074 y 075 (pendientes de aplicar) |
| 0.1 | Migración 074 (baja/retención sin romper la cadena) | Escrita y probada; **NO aplicada a producción** |
| 0.2 | Migración 075 (`privacy_settings` versionable, verificación de correo) | Escrita y probada (SQL efímero, 2 mutaciones); **NO aplicada a producción** |
| 0.3 | Plan de ventana única para aplicar 074 + 075 | Escrito en `PLAN_PRODUCCION_074_075.md`; **espera el OK** |
| 1 | Registro con aviso primero, evidencia atómica, AAD, fail-closed | Escrita y probada en local; **NO desplegada** (no hay aviso publicado en producción) |
| 2 | Mi privacidad, reconsentimiento, solicitudes de derechos | No iniciada |
| 3 | Panel administrativo (8 pestañas), roles individuales | No iniciada |
| 4 | Retención, purga a 5 años, verificación programada | No iniciada |
| 5 | Documentación (H14) | No iniciada |

## Mapa del repo (todo bajo `shield-ecuador-app/` salvo lo indicado)
**Base de datos**
- `supabase/migrations/073_consent_module_foundation.sql` — tablas, RLS, triggers, cadenas de hash.
- `supabase/migrations/074_consent_evidence_unlink_and_stable_hash.sql` — hash estable, sin cascada, `unlink_user_consent_evidence()`.
- `supabase/migrations/075_privacy_settings_versioning.sql` — sin `is_current`; vista `privacy_settings_current`; `privacy_email_verifications`.
- `supabase/tests/consent/{prereqs,lifecycle,settings_versioning}.sql` — pruebas SQL autoverificables (Postgres 16 vacío).
- `supabase/tests/consent/e2e_local.cjs`, `e2e_decrypt.ts` — punta a punta contra Supabase local.

**Funciones (Deno)**
- `functions/get-consent-notice/` — aviso publicado con marcadores resueltos + huella + `privacy_email`.
- `functions/secure-register-user/` — registro con `consent_notice` + `age_gate`; 503 fail-closed; compensación.
- `functions/_shared/crypto.ts` — AES-GCM + HMAC, AAD opcional, versionado de clave.
- `functions/_shared/consent-evidence.ts` — cómo se ata cada cifrado a su fila (AAD) y helpers de lectura (`allowLegacy:false`).
- `functions/_shared/consent-render.ts` — marcadores `{{…}}` y SHA-256 (misma función para vista previa y publicación).
- `functions/_shared/client-ip.ts` — IP de confianza (T03), normalización IPv4/IPv6.
- `functions/_shared/rate-limit.ts` — cuota; `failClosed` opt-in. `security-events.ts` y `pii.ts` existían sin versionar.
- Pruebas: `*_test.ts` junto a cada módulo (40 pruebas).

**Frontend**: `src/screens/RegisterScreen.tsx` (aviso primero), `src/contexts/AuthContext.tsx` (`signUp` con consentimiento, errores con `.code`), `src/index.css` (`.consent-*`), `tests/frontend/register.spec.ts`.

**Herramientas** (`.claude/loops/consentimiento/`): `gates.sh` (Deno 2.9.6 fijado + SQL en Postgres efímero + función de diagnóstico),
`diag/` (T03: consulta del Logs Explorer y función de diagnóstico temporal, NO desplegada), `PLAN_PRODUCCION_074_075.md`.
Playwright: `CLAUDECODE=1` ⇒ reporter `line` y timeout 60 s.

## Decisiones tomadas
- D-01 login individual solo para este módulo (`admin_roles`). D-02 evidencia 5 años tras la baja. D-03 días calendario.
  D-04 menores de 15: bloqueo + instrucciones al correo de privacidad.
- El aviso es la primera pantalla del registro; rechazar devuelve a la portada.
- AAD de `consent_records` anclada en `user_ref_hmac` (no `user_id`, que pasa a NULL tras la baja); la de
  `data_subject_requests`, en el UUID de la fila, generado en la función antes del insert.
- Registro en fail-closed (T10): 503 `RATE_LIMIT_UNAVAILABLE`. Contadores reiniciados: no importa.
- Formato de cifrado: el JSON existente `{v,alg,iv,tag,ct}` (+ `aad:true`), no `v{n}.iv.ct`.
- `privacy_settings`: sin `is_current`, sin SECURITY DEFINER ni bypass; la vigente es la de mayor `settings_version`, cada cambio es un INSERT.
  La confirmación de un correo = marcar la verificación + insertar una versión nueva, en una transacción.

## Historial de sesión
1. Fase 0: esquema + cripto, probados en Postgres 16 real; aplicados a producción (`db push` + secreto `LOOKUP_HMAC_KEY_B64`).
2. Fase 1: `get-consent-notice`, `secure-register-user`, `RegisterScreen`; 11/11 Playwright en pixel-7, iPhone SE (WebKit) y desktop-chrome.
3. Bug hallado: el 409 llegaba como `error` de supabase-js, no como `data` → `.code` nunca se asignaba. Corregido.
4. SEC-04 (AAD) y SEC-07 (fail-closed) con pruebas Deno; mutaciones deliberadas confirmaron que las pruebas detectan la rotura.
5. Commits: helpers existentes (`1309559`), Fase 1 WIP (`3cd0989`), prueba de camino feliz (`70b704f`), 074 + gates (`ad9a283`),
   IP de confianza (`a2cb5d4`), PROGRESS (`2befb14`), 075 (`fix(consentimiento): 075`), y la tanda de diagnóstico T03 + plan de producción.
6. Probando 073 en Postgres real: borrar un usuario con evidencia fallaba y la retención rompía la cadena → 074.
7. **Incidente**: `supabase start` llenó `C:` (0 MB libres); Docker quedó colgado y una capa de `storage-api` quedó a 0 bytes. Se recuperó
   reiniciando Docker Desktop, borrando y re-bajando esa imagen. `cyber-risk-db` sobrevivió.
8. Punta a punta contra Supabase local: 21/21, con dos fallos que los mocks no veían (Corregidos 1 y 2).
9. `privacy_settings` no se podía versionar (el trigger bloquea todo UPDATE pero exigía bajar `is_current`) → 075, con pruebas y mutaciones.
10. T03 preparado sin tocar producción: consulta del Logs Explorer y función de diagnóstico (5 pruebas Deno) fuera de `supabase/functions/`.

## Corregidos
1. `get-consent-notice` no devolvía `privacy_email` (lo usa la pantalla de menores).
2. La IP de la evidencia salía de la primera entrada de `X-Forwarded-For` (falsificable). Ahora, la que añade el proxy.
3. `privacy_settings` no se podía versionar → 075. **T14-fix: hecha** (falta aplicarla en producción).

## Abiertos
1. **T03 en producción sin medir.** `TRUSTED_PROXY_HOPS` vale 1 por defecto (correcto en local). Método preparado en `diag/README.md`:
   primero la consulta del Logs Explorer (`function_edge_logs`, sin desplegar nada) y, si no alcanza, la función de diagnóstico
   (`diag/diag-network-headers`: JWT de admin, solo cabeceras de red de la propia petición, sin logs, con pasos para borrarla). No desplegada.
2. **T03-sec (P0)**: el rate limit y `security_events` usan la primera entrada de `X-Forwarded-For` (la controla el cliente): se puede rotar
   para evadir el límite por IP, también el del registro. Cuando T03 esté medido, pasarlos a la cabecera de confianza (probablemente
   `cf-connecting-ip`) y unificar `extractClientIp` con `_shared/client-ip.ts`. No se toca antes: con la topología equivocada todos
   compartirían un bucket.
3. **Aviso real**: sin el seed no hay texto que publicar; en local sigue el aviso de PRUEBA. Sin publicar no se puede desplegar Fase 1.
4. **074 y 075 sin aplicar a producción.** Plan de ventana única en `PLAN_PRODUCCION_074_075.md` (lecturas de solo lectura, respaldo,
   aplicar, verificar). Espera el OK.
5. `get-consent-notice` tiene prueba de punta a punta (local) pero no una prueba Deno propia (comparte el puerto :8000 con las demás).
6. Migraciones 030-058 y 069-072, `pii.ts` y otras funciones nunca se versionaron. Las migraciones antiguas no se reproducen desde cero en
   Postgres 17 (004 define una función SQL antes de crear la columna que usa).
7. Falta SEC-07 en los endpoints de Fase 2 (los helpers existen), SEC-08 (zod), SEC-09 (correos).
8. `TASKS.md`, `DECISIONS.md` y el seed del aviso: no llegaron a la máquina.

## Tareas añadidas (trasladar a TASKS.md)
- **T02-extra** — Migrar `users.email_encrypted` y `full_name_encrypted` a AAD (`users:<columna>:<user_id>`) cuando se actualicen sus
  lectores (`pii.ts`, `get-ranking` y copias inline). Re-cifrado por lotes; leer con y sin AAD durante la transición.
- **T03-prod** — Medir la cabecera de IP en Supabase hospedado (ver `diag/README.md`) y fijar `TRUSTED_PROXY_HOPS` o pasar a `cf-connecting-ip`.
- **T03-sec (P0)** — Rate limit y `security_events` con la cabecera de confianza, no la primera entrada de XFF. Depende de T03-prod.
- ~~**T14-fix** — Versionado de `privacy_settings`~~ — **hecha** en 075 (pendiente de aplicar a producción).

## Cómo reproducir en local (sin tocar producción)
```
bash .claude/loops/consentimiento/gates.sh                 # Deno + SQL efímero (necesita Docker)
```
Punta a punta con Supabase local (necesita ~3 GB libres en C:; vigilar el disco):
1. Copia desechable de `supabase/` en una carpeta temporal con `SET check_function_bodies = off;` al inicio de cada migración
   (la 004 no se aplica en PG17 sin eso), la carpeta `templates/`, y `.temp/*-version` SIN `project-ref`/`linked-project.json`.
   Fijar `gotrue-version=v2.186.0` y `rest-version=v14.3` (los del repo son más nuevos que la CLI 2.75 y Auth rechaza el JWT).
2. `supabase start --workdir <copia> -x studio,imgproxy,logflare,vector,mailpit,supavisor,postgres-meta`
3. Sembrar un admin, `privacy_settings` vigente y un aviso publicado (en local no hay admin durante la migración).
4. `supabase functions serve --env-file <fn.env>` con `PII_ENCRYPTION_KEY_B64`, `PII_KEY_VERSION`, `LOOKUP_HMAC_KEY_B64`, `SECURITY_EVENTS_HMAC_KEY`.
5. `node supabase/tests/consent/e2e_local.cjs` y luego `e2e_decrypt.ts`.

---

# Secciones del loop

## Mapa del repo (T00 — rutas reales, 2026-09-28)
Gestor de paquetes: **npm** (`package-lock.json` en la raíz de `shield-ecuador-app/` y en `frontend/`; sin pnpm/yarn). Rutas bajo `shield-ecuador-app/`.

| Qué | Ruta real |
|---|---|
| Pantalla de registro | `frontend/src/screens/RegisterScreen.tsx` (reescrita en Fase 1; el aviso ya no está hardcodeado) |
| Contexto de autenticación | `frontend/src/contexts/AuthContext.tsx` (+ `.test.tsx`) |
| Registro (Edge Function) | `supabase/functions/secure-register-user/index.ts` |
| Aviso público | `supabase/functions/get-consent-notice/index.ts` |
| Helpers compartidos | `supabase/functions/_shared/`: `crypto.ts`, `consent-evidence.ts`, `consent-render.ts`, `consent-notice.ts`, `client-ip.ts`, `rate-limit.ts`, `security-events.ts`, `pii.ts` (este último aún sin versionar en git) |
| Panel de administración | `central-admin-app/server.js` (Node `http` puro, Basic Auth compartida + proxy con service role), `app.js` (SPA en JS plano), `index.html`, `styles.css`; sin dependencias npm |
| Migraciones | `supabase/migrations/`: mayor **075**, con saltos en 023 y 033. Módulo: 073, 074, 075 |
| Pruebas SQL / punta a punta del módulo | `supabase/tests/consent/` |
| Pruebas Playwright | raíz: `playwright.frontend.config.ts` (`tests/frontend/`, 7 perfiles, necesita la app compilada en :8793), `playwright.admin.config.ts` (`tests/admin/`, levanta `server.js` con un upstream simulado) |
| Texto de aviso hardcodeado | **Ninguno** tras Fase 1 (se buscó `privacy_notice`, "aviso de privacidad", "Tratamiento de datos personales", el correo personal que antes estaba escrito en `RegisterScreen`). Quedan solo referencias a `privacy_notice_version` (`lib/supabase.ts`, `get-private-profile`) |
| Tabla de consentimiento previa | **No había**: solo columnas en `users` (migración 012): `data_processing_authorized`, `data_processing_authorized_at`, `privacy_notice_version` (antes una constante hardcodeada `2026-06-22`), `privacy_updated_at`. El panel lee `data_processing_authorized` (`central-admin-app/app.js`) |
| Proveedor de correo | **Resend** (clave `resend_api_key` en Vault vía `app_secrets`): `championship-draw-round1`, `check-security-alerts` |
| pgTAP / `supabase test db` | No existe. Las pruebas SQL del módulo son scripts `psql` autoverificables (`RAISE EXCEPTION` + `ON_ERROR_STOP`) sobre un Postgres 16 efímero |

Comandos: typecheck `cd frontend && npx tsc --noEmit` · lint `npx eslint src --ext .ts,.tsx` (config `react-app`) · unit frontend `CI=true npx react-scripts test --watchAll=false` ·
panel `cd central-admin-app && npm test` (+ `node tests/*.test.cjs`) y Playwright admin · Deno `npx -y deno@2.9.6 check|test`.

## Línea base de gates (T00)
`bash .claude/loops/consentimiento/gates.sh` — medido antes de tocar nada más en esta iteración:

| Puerta | Estado base | Detalle |
|---|---|---|
| typecheck-frontend | OK | |
| lint-frontend | **22 problemas al medir; 14 preexistentes** | 8 eran de `AuthContext.test.tsx` (imports tras `jest.mock`, `const getCtx = renderAuth()`); se corrigieron en esta iteración. Quedan **14 en 9 archivos ajenos al módulo**: `App.test.tsx` (2), `SenseiVideoModal.test.tsx` (2), `ToastContext.test.tsx` (2), `safeRedirect.test.ts` (1), `safeUrl.test.ts` (3), `AuthCallbackPage.test.tsx` (1), `LandingPage.tsx` (1), `LoginScreen.test.tsx` (1), `ResetPasswordPage.test.tsx` (1). La puerta tiene un **tope de 14**: no se admite ninguno nuevo y los viejos se siguen mostrando |
| unit-frontend | OK | |
| panel-unit | OK | |
| panel-e2e | OK | Playwright admin, perfil desktop-chrome (~2,5 min). **Flake de entorno hallado y corregido en esta iteración:** el servidor de pruebas del panel (`:3198`, `reuseExistingServer: true`) sobrevivía entre corridas y su limitador de autenticaciones fallidas (10 cada 10 min, en memoria) hacía que la segunda corrida seguida recibiera 429 en vez de 401 (`server.spec.ts:23`). La puerta ahora cierra cualquier `start-admin.cjs` antes y después. Verificado con dos corridas seguidas |
| deno-check | OK | |
| deno-test | OK | 51 pruebas + 5 de la función de diagnóstico |
| sql-ciclo-de-vida | OK | Postgres 16 efímero, 073+074+075 |
| db-reset | **SKIP explícito** | Opt-in (`GATES_DB_RESET=1`, stack local en marcha). Además, **las migraciones anteriores a 073 no se aplican desde cero en Postgres 17**: la 004 define `is_admin()` (SQL) antes de crear la columna `role` que usa (`column "role" does not exist`). Es previo al módulo y rompe la regla "cada migración aplica limpia con `supabase db reset`" tal como está escrita; en local se sortea con una copia desechable que antepone `SET check_function_bodies = off;` (ver "Cómo reproducir en local") |

No incluido en las puertas: Playwright del frontend (necesita la app compilada y un servidor en :8793; ver `npm run test:frontend`).

## Iteración 1 — 2026-09-28 — T00 Mapa del repo y gates
- Cambios: `.claude/loops/consentimiento/gates.sh` reescrito (una línea `GATE <nombre>: OK|FAIL|SKIP` por puerta, tope de lint, logs en `logs/`, `GATES_ONLY`, `GATES_DB_RESET`);
  `logs/.gitignore` (`*.log`); `AuthContext.test.tsx` sin problemas de lint; `TASKS.md` con el estado real y la sección de tareas añadidas; `DECISIONS.md` con notas y D-08, D-09;
  este archivo. Además, antes de la iteración (sin cerrar tarea): renderizador `consent-render.ts` con los 11 marcadores reales del seed, `consent-notice.ts` compartido y
  `supabase/tests/consent/load_seed_aviso.cjs` (aviso real cargado y publicado SOLO en Supabase local).
- Pruebas añadidas: 9 de `consent-render_test.ts` (incluye el seed real completo e incompleto), 1 de aviso publicado inválido en `secure-register-user/index_test.ts`.
- Gates: OK salvo la línea base documentada arriba (lint: 14 preexistentes bajo tope; db-reset: omitido explícitamente).
- Desviaciones de SPEC: ver "Decisiones tomadas" (AAD anclada en `user_ref_hmac`, aprobada; formato de cifrado JSON, pendiente D-09). Trabajo hecho fuera del orden del loop: la rama y parte de T02–T10 se
  adelantaron antes de instalar el paquete; se anotó su estado real en TASKS.md en vez de marcarlas como cerradas.
- Riesgos / pendientes detectados: `playwright.admin.config.ts` con `reuseExistingServer: true` es frágil fuera de `gates.sh` (misma causa que el flake de arriba); el frontend muestra el aviso como texto plano (Markdown sin renderizar: T18); T03-prod/T03-sec (P0); `pii.ts` sin versionar; el aviso local usa datos de desarrollo
  (D-07 sin completar); el loop dice "nunca `supabase db push`" y en la Fase 0 (antes de instalarlo) sí se aplicó 073 a producción: no se repetirá.

## Iteración 2 — 2026-09-28 — T01 Inventario de consentimiento actual y plan de backfill
Solo lectura y documentación: **ningún cambio de código, de migraciones ni de producción**. Nada se consultó en la base hospedada.

### 1. Cómo se registra hoy el consentimiento
| Dónde | Qué | Detalle |
|---|---|---|
| `public.users` (migración 012) | `data_processing_authorized BOOLEAN NOT NULL DEFAULT false`, `data_processing_authorized_at TIMESTAMPTZ` (nulo permitido), `privacy_notice_version TEXT NOT NULL DEFAULT '2026-06-22'`, `privacy_updated_at` | El **valor por defecto de la versión también se aplica a quien nunca autorizó**: `privacy_notice_version` sola no prueba nada; solo vale junto con `authorized = true`. |
| `auth.users.raw_user_meta_data` | `{privacy_notice_version, data_processing_authorized: true}` | Lo escribe `secure-register-user` al crear la cuenta. Es copia, no fuente. |
| Tabla de consentimiento | **No existía** hasta `consent_records` (073) | Vacía: nada de lo anterior está en ella. |
| Cifrado | Solo email/nombre/etc. en `users.*_encrypted` (AAD pendiente, T02-extra). El consentimiento en sí **no** está cifrado ni tiene evidencia de IP/agente. | |

Quién escribe: solo `secure-register-user` (upsert de `users`; hoy además escribe `consent_records`). Quién lee: `get-private-profile` (devuelve `data_processing_authorized` y `privacy_notice_version`),
el tipo `UserProfile` del frontend (campos declarados, sin uso visible), el panel (`central-admin-app/app.js`: columna "Consentimiento" Sí/No de la lista de usuarios), la migración 067
(`admin_user_summary`: cuenta `authorized`) y `tests/admin/users.spec.ts`. No hay más lectores. La copia `release/cyberdojo-clean-repo/` es un volcado antiguo: se ignora.

Texto que aceptaron las personas antiguas (versión `2026-06-22`, reconstruido de `release/cyberdojo-clean-repo/.../LoginScreen.tsx` y de `RegisterScreen.tsx` antes del commit 3cd0989; no hay copia en la base):
una sola autorización general "para fines internos de la aplicación, incluyendo registro, gestión de usuario, operación del servicio y clasificación estadística durante la vigencia de mi uso",
más una nota de derechos ARCO con un correo personal como contacto (no se copia aquí). No nombra al responsable legal, no indica plazos de conservación, no separa finalidades, no habla de menores ni de IP.

Calidad de la evidencia antigua: hay fecha (la del servidor al registrarse) y nada más. **No hay IP, no hay agente de usuario, no hay huella del texto mostrado, no hay decisión por finalidad.**

### 2. Qué se migra y qué no
| Población | Se migra a `consent_records` | Cómo |
|---|---|---|
| A. `authorized = true` y con fecha | Sí | 1 fila: finalidad `registro_aprendizaje`, `decision = granted`, `channel = registro`, `server_ts` = `data_processing_authorized_at`. |
| B. `authorized = true` sin fecha | Sí, marcada | Igual, con `server_ts = users.created_at` y anotada en el informe del script como "fecha aproximada". |
| C. `authorized = false` | **No** | No hay nada que registrar; no se inventa. Quedan "sin consentimiento" hasta que acepten el aviso 1.0 (D-10). |
| Finalidades opcionales (`novedades`, `publicidad_personalizada`) | **Nunca** | Nadie las aceptó nunca; quedan como "no consintió". |
| Datos personales | No se lee ni se copia ningún dato personal: solo `id`, `authorized`, `authorized_at`, `created_at`, `privacy_notice_version`. | |

Conteo previo (solo lectura, sin datos personales; **lo ejecuta la persona responsable en el editor SQL, yo no lo ejecuté**):
```sql
select data_processing_authorized as autorizado,
       data_processing_authorized_at is not null as con_fecha,
       privacy_notice_version, count(*) as personas
from public.users group by 1, 2, 3 order by personas desc;
```
Con eso se confirma que solo existe la versión `2026-06-22` y cuántas personas hay en A, B y C antes de correr nada.

### 3. Diseño del backfill (T25) — sin implementar
1. **Documento legacy** en `consent_documents`: `version = 'legacy-2026-06-22'` (uno por cada versión distinta que salga en el conteo), `status = 'retired'` (nunca `published`: el índice de "un solo publicado" no se toca y no se ofrece a nadie),
   `content_md` = el texto reconstruido (con el correo personal sustituido por "[contacto de la época, omitido]") precedido de una nota "sin copia almacenada del texto original", `purposes` = una sola finalidad obligatoria `registro_aprendizaje`
   (el mismo código que el aviso 1.0, para que "Mi privacidad" muestre continuidad), `content_sha256` = SHA-256 de ese contenido, `created_by` = el admin que la cree.
2. **Filas de evidencia** (una por persona de A y B): `user_id`, `user_ref_hmac = hmacLookup(user_id, "LOOKUP_HMAC_KEY_B64")` (la **misma** función que el registro, para que una baja o un retiro posterior encuentren la fila),
   `document_id/version` del legacy, `rendered_sha256` = `content_sha256` del legacy (no hubo renderizado), `settings_version = 0` ("no aplica"), `purpose_code = registro_aprendizaje`, `decision = granted`, `channel = registro`,
   `ip_ciphertext/ua_ciphertext/ua_hmac = NULL`, **`ip_hmac = NULL`** (requiere D-11), `key_version` = versión activa. `server_ts` = la fecha original; la cadena de hash sigue el `id`, no el tiempo, y así un `revoked` posterior siempre queda "más nuevo" que el legacy.
3. **No puede ser una migración SQL**: `user_ref_hmac` necesita `LOOKUP_HMAC_KEY_B64`, que solo existe en las funciones (D-11). Será una función/script de un solo uso con service role: `--dry-run` (solo cuenta A/B/C y muestra 3 ids abreviados, sin correos), lotes de 500 con un solo `INSERT`
   (el trigger de cadena toma su bloqueo por fila), idempotente (antes de insertar salta a quien ya tenga una fila `legacy%` para esa finalidad).
4. **Cuándo**: dentro de la ventana única del release, **después** de 074 y 075 (la 074 cambia el hash y aborta si ya hay filas) y antes de exponer el reconsentimiento (T19). Requiere el OK explícito de la persona responsable y el respaldo del plan `PLAN_PRODUCCION_074_075.md`.
   Es **irreversible por diseño** (la evidencia es append-only): por eso primero `--dry-run`, luego un lote de prueba de 5, luego el resto.
5. **Comprobación posterior**: `verify_consent_chain()` sin filas; `count(legacy) = |A| + |B|`; ninguna fila legacy con `ip_ciphertext` o `ip_hmac`; ninguna fila para personas de C; una segunda corrida no inserta nada.
6. **Después del backfill**: las columnas de `users` se quedan (las leen `get-private-profile`, el panel y la 067) y `secure-register-user` sigue escribiéndolas; la fuente de verdad pasa a `consent_records` y el panel (T22/T23) debe leer de ahí. Retirar las columnas es una tarea futura, no de esta entrega.
7. **Reconsentimiento**: el aviso 1.0 se publica con `requires_reconsent = true` (T19). Quien tenga como último estado un registro `legacy%`, o ninguno, verá el aviso nuevo. Si esto es lo que se quiere lo decide D-10.

### 4. Incompatibilidades registradas (en `DECISIONS.md`, sin decidir)
- **D-10** (legal): validez del consentimiento anterior y si se exige uno nuevo a todos; qué pasa con quienes nunca autorizaron. Bloquea T25.
- **D-11** (técnica): `ip_hmac` es `NOT NULL` en la 073; el backfill no puede ser migración SQL por la clave HMAC. Bloquea T25.

### Resultado
- T01 **cerrada**: plan de backfill escrito; sin cambios de código (verificado con `git status`: solo `PROGRESS.md`, `DECISIONS.md` y `TASKS.md`).
- Gates: no se ejecutaron los `gates.sh` completos porque no cambió ningún código, script ni prueba; las puertas no pueden cambiar de estado con cambios solo de documentación. Última corrida completa: iteración 1 (todas OK, `db-reset` omitido).
- Riesgos / pendientes: D-10 y D-11 abiertas; el conteo de la sección 2 lo ejecuta una persona; T25 queda con ⛔ hasta que se decidan.

Revísalas antes de ejecutarlas. Deben ser solo SELECT. El SQL Editor de Supabase corre con permisos totales, así que un UPDATE o DELETE se ejecutaría sin preguntar.
La del Logs Explorer (D-08) solo devuelve algo si secure-register-user recibió peticiones recientemente. Si sale vacía, entra a tu app en producción, abre el registro y envía el formulario incompleto a propósito para generar una petición. Luego repite la consulta.
En el resultado habrá IP reales. No me pegues las IP completas: basta con decirme qué columnas vienen llenas y si alguna coincide con tu IP pública, que puedes ver en ifconfig.me. Con eso decidimos D-08.

## Iteración 3 — 2026-09-28 — (sin tarea nueva) D-10/D-11 aplicadas e inventario del trabajo ajeno al módulo
- Cambios: `TASKS.md` (T25 reescrita según D-10/D-11 y sin ⛔: migración nueva `ip_hmac` nulo + `CHECK (ip_hmac IS NOT NULL OR document_version LIKE 'legacy-%')`, script de un solo uso con `--dry-run` por defecto y `--apply` explícito, clave HMAC solo por variable de entorno, solo dentro del release y con OK); `SPEC.md` §5 (`ip_hmac` nulable + CHECK). `DECISIONS.md`: la persona responsable completó el campo "Decisión" de D-10 y D-11; los encabezados aún dicen `[ABIERTA]` (solo un humano los cambia) y no los toqué.
- **Hallazgo — el árbol de trabajo tiene ~1 200 entradas sin commit ajenas al módulo** (31 archivos versionados modificados/borrados + el resto sin versionar; ~1 020 son archivos de "skills" de diseño en `frontend/.claude/skills/`). Ninguna se modificó, se commiteó ni se descartó. Agrupadas y con el plan de ramas propuesto en el informe de esta iteración. Puntos que importan al módulo:
  - **`supabase/migrations/030…058` y `069…072` (32 archivos) están sin versionar**: 41 de 73 migraciones están en git. Es la causa de fondo del problema de `db-reset` (T00-extra): un clon limpio no tiene ni el esquema real.
  - **`_shared/pii.ts` está sin versionar y lo importa `championship-draw-round1`** (que sí está versionada): en un clon limpio esa función no compila. Además `pii.ts` ignora `payload.v`, así que no sobrevive a una rotación de claves (movido a T02-extra).
  - **`supabase/config.toml` (modificado) activa `enable_anonymous_sign_ins = true`** y `frontend/src/components/GuestRegisterPrompt.tsx` (sin versionar) sugiere "modo invitado": existen usuarios anónimos sin pasar por el aviso de consentimiento. **No está en la SPEC**; hay que decidir qué datos trata un invitado y si necesita aviso (pregunta nueva D-12).
  - `config.toml` también añade `verify_jwt = false` a `run-news-agent`, `check-security-alerts` y otras: distinto de la regla H01 para funciones NUEVAS del módulo, pero conviene revisarlo en T04.
  - Riesgo de las puertas: `gates.sh` se ha ejecutado siempre con este árbol sucio (tests del frontend modificados, etc.). Hasta que el trabajo ajeno esté en su rama, "todas las puertas OK" no está probado sobre el commit limpio de la rama.
- Gates: no aplican (solo documentación).

## Iteración 4 — 2026-09-28 — T02 `_shared/crypto.ts` con versionado de claves
- Cambios: `supabase/functions/_shared/crypto.ts` (`requireAad`; claves mal formadas → `invalid_key_vN` / `invalid_hmac_key:NOMBRE` sin exponer el mensaje de `atob` ni el valor), `_shared/consent-evidence.ts` (`encryptConsentColumn` usa `requireAad: true`), `TASKS.md`.
- Pruebas añadidas (`_shared/crypto_test.ts`, ahora 14): rotación (v1 cifrado, v2 activa: lo viejo se lee y lo nuevo sale v2); v1 sin su `_V1` falla en vez de usar la clave equivocada; payload `{iv,tag,ct}` sin `v` (formato de `pii.ts`) se lee como v1; clave mal formada (no base64 / 16 bytes) sin filtrar el valor; HMAC mal formado, corto o ausente; `requireAad` (falta, vacía, correcta). Las 3 últimas fallaron primero por la razón correcta (mensaje de `atob`, mensaje del HMAC, opción inexistente).
- Gates: **OK** (`bash .claude/loops/consentimiento/gates.sh`, 4 min 25 s): typecheck-frontend, lint-frontend (14 = línea base), unit-frontend, panel-unit, panel-e2e, deno-check, deno-test (crypto 14, consent-evidence 8), sql-ciclo-de-vida; `db-reset` SKIP explícito (línea base, T00-extra). Salvedad: corrido con el árbol sucio descrito en la iteración 3.
- Desviaciones de SPEC: ninguna en el formato (D-09). **Desviación de TASKS:** "`pii.ts` pasa a delegar en `crypto.ts`" se movió a T02-extra porque `pii.ts` está sin versionar y es parte del trabajo ajeno (instrucción: no commitearlo).
- Riesgos / pendientes: `secure-register-user` sigue cifrando `users.email_encrypted`/`full_name_encrypted` sin AAD (T02-extra); `get-ranking`, `championship-draw-round1` y `pii.ts` siguen usando la clave base sin mirar `v`.

## Iteración 5 — 2026-09-28 — (higiene del repo, sin tarea del módulo) plan de ramas y D-12
- Cambios: `PLAN_RAMAS.md` (listas finales por grupo, comandos en 3 fases, verificación sobre árbol limpio, comparación con lo desplegado), `patches/registro-route.patch`, `TASKS.md` (T19b invitados por D-12; T-ruta-registro; prerrequisito de T00-extra; comprobaciones nuevas en T99), `DECISIONS.md` (edición de la persona responsable: D-10, D-11 y D-12 decididas; no se tocó). **Ningún comando del plan se ejecutó; el árbol de trabajo no se modificó.** Sin cambios de código.
- **Hallazgos nuevos** (detalle en `PLAN_RAMAS.md`):
  1. **La ruta `/registro` no existe en el código versionado.** `HEAD`/`main` enlazan a `/registro` desde `LoginScreen`, `CinematicLandingPage`, `CinematicPublicShell` y `SenseiVideoModal`, y `register.spec.ts` lo visita, pero `App.tsx` versionado no declara la ruta ni importa `RegisterScreen`: solo el `App.tsx` sin commit (mezclado con UX). El registro con aviso primero es inalcanzable en el commit limpio. Las puertas de `gates.sh` no lo detectan (no corren el Playwright del frontend). Parche mínimo listo y comprobado (`git apply --check` contra HEAD) → **T-ruta-registro (P0)**.
  2. **`gates.sh` depende de un archivo sin versionar**: `panel-unit` ejecuta `tests/shuffle-options.test.cjs`. Sobre un árbol limpio fallaría hasta integrar la línea base en `main`. Esto significa que "todas las puertas OK" de las iteraciones 1–4 solo vale con el árbol sucio actual.
  3. `main` es ancestro de la rama del módulo: actualizar desde `main` no puede dar conflictos de historia; los cambios sin commit no solapan con lo que la rama del módulo cambió.
  4. Material fuente en bruto (`imagen/` 77 MB, `videos/` 140 MB, con ZIP) sin versionar: se propone ignorarlo, no ramificarlo.
  5. `supabase/config.toml` (línea base) trae `enable_anonymous_sign_ins = true`: D-12 exige tenerlo desactivado en producción hasta cerrar T19b; T99 lo verifica.
- Gates: no aplican (solo documentación).
- Desviaciones de SPEC: ninguna.
- Riesgos / pendientes: la persona responsable debe aprobar el plan de ramas y la comparación con lo desplegado (`supabase functions download`, solo lectura) antes de fusionar la línea base; T19b paso 1 (inventario de datos de invitados) queda pendiente.

## Iteración 6 — 2026-09-28 — (higiene del repo, sin tarea del módulo) comparación con lo desplegado y Fase 1 del plan de ramas
- **Solo lectura contra producción** (`supabase functions download --use-api` a una carpeta aparte, ya borrada, y `supabase migration list`): 11 funciones descargadas. Todas coinciden con la línea base salvo: `security-diagnose`, `security-easm-scan`, `security-kata-convert` corren un `news-agent-core.ts` anterior (sin el control de SSRF) → tarea **SEC-SSRF** (P0, independiente del módulo); `log-login-event` corre el `rate-limit.ts` original (1309559), anterior al módulo. Migraciones: 001–073 aplicadas, 074 y 075 solo en local.
- **Fase 1 ejecutada** (worktrees en `~/Riesgo-wt/`, tu carpeta de trabajo no se modificó): `chore/baseline-produccion` (2 commits: contenido 52 archivos + higiene `.gitignore` y `supabase/.temp` sin versionar), `wip/ux-redesign` (1 commit, 20 archivos; se sacaron `cara.webm` y `sello.webm`), `docs/iso-y-privacidad` (1 commit, 24 archivos). Copias verificadas byte a byte contra la carpeta de trabajo. Sin `push`; `main` no se tocó.
- **`rate-limit.ts` en la línea base:** la rama no lo modifica. Lo que contiene es el de `main`, que ya trae la Fase 1 del módulo (`failClosed` + HMAC; `secure-register-user` lo importa). Revertirlo a 1309559 rompería `secure-register-user` y sus pruebas en `main` y en la rama del módulo al fusionar. No se revirtió; pendiente de decisión.
- **Secretos:** búsqueda por patrones sobre las líneas añadidas de las 3 ramas (no había gitleaks y no se descargó ningún binario): 0 hallazgos; el escáner se validó antes con un repo sintético con 7 secretos falsos (los detectó todos). Las menciones de `service_role` son comentarios/`GRANT` y el nombre de una variable de entorno, sin valores.
- Riesgos / pendientes: `SenseiChallengeModal.tsx` (rama UX) referencia `/videos/cara.webm` y `/videos/sello.webm`, que quedaron fuera de git (ignorados): la rama UX no funciona sin esos 2 archivos; la rama UX borra `public/demo/` (incluye un `bank.json` de 33 079 líneas); `tests/proposal.visual.cjs` (versionado) menciona `/demo/`.
- Gates: no aplican (sin cambios de código).

## Iteración 7 — 2026-09-28 — (higiene del repo, sin tarea del módulo) estado desplegado, modo invitado y Fase 2

### Estado desplegado en producción (medido el 2026-09-28, solo lectura: `supabase functions download --use-api` y `migration list`)
**Cobertura:** solo las 11 funciones que se descargaron (las 3 modificadas de la línea base, las 8 nuevas y `championship-draw-round1`). **No se compararon** las demás funciones desplegadas (`secure-register-user`, `get-ranking`, `get-private-profile`, `save-provider-key`, etc.); su estado desplegado es desconocido hasta que se pida.

| Función en producción | Archivos `_shared` que lleva | Versión desplegada frente al repo |
|---|---|---|
| `audit-generated-questions`, `run-daily-agent-workflows` | ninguno | `index.ts` = línea base (commit `333f2ca` de `chore/baseline-produccion`) |
| `fix-learning-item-balance`, `import-question-bank`, `quiz-generator`, `run-news-agent` | `news-agent-core.ts`, `url-guard.ts` | `news-agent-core.ts` de **540 líneas** = línea base (`333f2ca`; con SSRF, tope 512 KB, `.csv/.json` y `shuffleOptions`); **distinto del de `main` actual** (528 líneas, commit `e99e109`, sin `.csv/.json` ni `shuffleOptions`). `url-guard.ts` = `main`. |
| `security-diagnose`, `security-easm-scan`, `security-kata-convert` | solo `news-agent-core.ts` (**sin** `url-guard.ts`) | `news-agent-core.ts` de **476 líneas**: **anterior al arreglo de SSRF `e99e109`**; no coincide con ningún commit. Sin `fetchPublicPage`, sin tope de 512 KB, sin `.csv/.json`, sin `shuffleOptions`. `index.ts` = línea base. |
| `log-login-event` | `rate-limit.ts`, `security-events.ts` | `rate-limit.ts` = **original `1309559`** (≠ `main`, que trae `failClosed` + HMAC del módulo); `security-events.ts` = `main`; `index.ts` = línea base. |
| `championship-draw-round1` | `pii.ts` | `pii.ts` e `index.ts` = línea base. |

**Migraciones:** 001–073 aplicadas (faltan 023 y 033 en ambos lados); 074 y 075 solo en local.

### `main` NO es desplegable tal cual
`main` ya contiene código del módulo que **no** está desplegado ni tiene su esquema: la Fase 1 (`secure-register-user` con aviso primero, evidencia y `failClosed`; `get-consent-notice`; `_shared/consent-*.ts`, `crypto.ts`, `rate-limit.ts` nuevo) depende de las migraciones 074 y 075 (sin aplicar) y de un aviso **publicado** que hoy no existe en producción (registrar usuarios con ese código fallaría o quedaría sin evidencia). Además, `supabase functions deploy` publica lo que hay en la carpeta local, no un commit. Por eso: ningún despliegue desde `main` fuera del release único de `PLAN_PRODUCCION_074_075.md`; los despliegues sueltos (p. ej. SEC-SSRF) se hacen función por función, con OK explícito, y solo de funciones cuyas dependencias `_shared` no incluyan archivos del módulo (comprobado para SEC-SSRF: ver la tarea).

### Modo invitado (`vault/Arquitectura/Autenticación y modo invitado.md`, rama `docs/iso-y-privacidad`) — lo que afecta a T19b / D-12
1. **Es una sesión real de Supabase Auth**: `supabase.auth.signInAnonymously()` desde "Probar sin cuenta" (landing y cabecera). Sin fila en `public.users`. Ya está en el código versionado (`CinematicPublicShell`, `CinematicLandingPage`, `DojoListPage`, `DojoDetailPage`, `LoginScreen`, `RegisterScreen`), no solo en la rama UX; lo nuevo de la rama UX es `GuestRegisterPrompt` y el bloqueo de rutas en `App.tsx`.
2. **Sí toca la base de datos** (opción B de D-12, salvo que el inventario demuestre otra cosa): el invitado responde preguntas del primer dojo mediante el RPC `learning_state` (la migración `058_learning_state_guest_fix` existe para que funcione), es decir, se crean filas de progreso ligadas a un `auth.uid()` anónimo, además de la fila en `auth.users`. El inventario del paso 1 debe confirmarlo con consultas de solo lectura y listar además la IP que Supabase Auth registra al crear la sesión anónima.
3. **El candado es solo del frontend** ("el candado real está en el frontend, no en la base de datos"): `GuestGate` bloquea rutas; un invitado que llame directamente a RPC/REST con su JWT anónimo no encuentra ese candado. Hay que revisarlo en T04/T19b (RLS y RPC que aceptan `is_anonymous`).
4. **Registrarse no convierte la cuenta anónima**: `secure-register-user` crea un usuario **nuevo** con la service role; el progreso del invitado queda huérfano. Con el flujo actual no hay "conversión" que herede consentimiento; el registro pasa siempre por el aviso completo (REQ-06), que es lo que D-12 pide.
5. **No hay caducidad ni limpieza** de sesiones anónimas descrita: D-12 exige que "su sesión anónima caduque" → hace falta un job de limpieza (borrar usuarios anónimos y su progreso tras N días) y decidir N; sin él las filas se acumulan indefinidamente.
6. **La demo estática anterior** (`/practica` y `public/demo/` con `bank.json`, progreso en `localStorage`, sin datos en la base) era el equivalente a la opción A de D-12. El vault dice que se sustituyó por la sesión anónima; la rama UX borra `PracticePage` y `public/demo/` y redirige `/practica` a `/dojos`. Al borrarla desaparece la alternativa sin datos en la base: para cumplir D-12 solo quedan B (aviso breve) o C (apagar la sesión anónima en producción).
7. Sin nada de esto en la SPEC: el paso 1 de T19b debe empezar por aquí. Recordatorio: `enable_anonymous_sign_ins = true` está en `config.toml` de la línea base (no se despliega solo, pero T99 lo verifica).

### Cambios de esta iteración
- `TASKS.md`: SEC-SSRF con la lista de importaciones de `_shared`, aclaración de qué parte de las 78 líneas ya está en `main`, y condición de parada; tarea **UX-integración** (confirmar la eliminación de `public/demo/` y su relación con D-12); T19b con lo del vault.
- **Importaciones de las 3 funciones de SEC-SSRF** (`deno info`, transitivo): `news-agent-core.ts` → `url-guard.ts`; ninguna importa `rate-limit.ts`, `crypto.ts`, `consent-evidence.ts` ni otro archivo del módulo (**no se activa la condición de parada**).
- Rama `wip/ux-redesign`: se versionaron `cara.webm` y `sello.webm` (los usa `SenseiChallengeModal`); `imagen/` y `videos/` siguen ignorados. Rama `chore/baseline-produccion`: se quitaron del `.gitignore` esas dos rutas.
- Fase 2 (fusión de la línea base en `main`, en un worktree): ver el resultado abajo.
- **Fase 2 ejecutada:** `main` = `430527f` (merge `--no-ff` de `chore/baseline-produccion`, 4 commits desde `22aaed5`), hecho en el worktree `~/Riesgo-wt/main`. 54 archivos, +4 437 −346. Sin `push`. La carpeta de trabajo y la rama del módulo no se tocaron (siguen en `8cdb21c`+ y sin haber recibido `main`: eso es la Fase 3). Nota: `main` ahora contiene el `.gitignore` con las entradas de herramientas locales y `supabase/.temp` sin versionar.

## Iteración 8 — 2026-09-28 — (higiene del repo, sin tarea del módulo) disparadores de despliegue, INV-SEC y listado previo a la Fase 3
- **Disparadores de despliegue (solo lectura).** Workflows versionados: (1) `.github/workflows/security.yml`: `on: pull_request` (cualquier rama destino), ejecuta `anthropics/claude-code-security-review@main` con el secreto `CLAUDE_API_KEY` y comenta en el PR; no despliega; no corre con `push`. (2) `shield-ecuador-app/.github/workflows/playwright.yml`: `on: push/pull_request` a `main`/`master` y solo corre `npm ci` + Playwright; **está dentro de `shield-ecuador-app/`, no en la raíz del repositorio, así que GitHub no lo ejecuta**; aunque se ejecutara no despliega. La copia bajo `release/cyberdojo-clean-repo/.github` tampoco corre. `.deploy/` (build de `gcloud run deploy --source`, ignorado, sin versionar) y `.gcloud-config/` (perfil y credenciales de `gcloud`, ignorado, sin versionar; **no se leyó su contenido**, solo la lista de nombres y `project`/`region`): son artefactos locales de despliegues manuales, no disparadores. Los propios documentos del repo (`ARQUITECTURA_CYBER_DOJO.md` §8, `DOCUMENTO_FUNCIONALIDADES.md`) dicen que no hay CI/CD versionado y que se despliega con `gcloud run deploy --source` (servicios `cyberdojo` y `cyberdojo-admin`). **Consecuencia: en el repositorio no hay nada que despliegue con un `push`.** Lo que NO se puede ver desde el repositorio y debe comprobar la persona responsable: Cloud Build triggers y "despliegue continuo" de Cloud Run enlazados a GitHub (consola de GCP), y la integración GitHub de Supabase (Project settings → Integrations) que podría desplegar migraciones/funciones al recibir un push.
  - Qué pasaría con un `push` de cada rama: ningún workflow versionado se dispara por `push`. Abrir un **PR** de cualquiera de ellas (a cualquier rama) dispara `security.yml`, que envía el diff a la API de Claude y comenta: `wip/ux-redesign` (−33 k líneas por `bank.json`, dos `.webm` de 8 MB) y `docs/iso-y-privacidad` (PDF/docx) son diffs grandes o binarios; el action va sin fijar (`@main`), un riesgo de cadena de suministro menor.
- **INV-SEC (P0)** añadida a `TASKS.md`. **SEC-SSRF:** decisión de desplegar la versión completa de `main` (con `.csv/.json` y `shuffleOptions`) y solo **desde `~/Riesgo-wt/main`**, no desde la carpeta de trabajo; no se desplegó nada.
- **Listado previo a la Fase 3** (`~/fase3-listado.txt`, fuera del repo; 1 193 entradas que guardaría el stash, sin los archivos de `.claude/loops/`): 1 092 ignorados por las reglas de `main` (511 + 511 archivos de skills/agents, 43 `videos/`, 21 `imagen/`, `.vscode/`, `__pycache__`, `~$…docx`, `supabase/.temp/`, y `settings.local.json` **solo por la regla global del usuario**), 97 idénticos a un commit de rama (51 en `chore/baseline-produccion`, 22 en `wip/ux-redesign`, 24 en `docs/iso-y-privacidad`) y **5 excepciones**: `LandingPage.tsx` (su único cambio es el de `patches/registro-route.patch`, verificado línea por línea; irá en el commit `/registro` de la Fase 3d); `shield-ecuador-app/deno.lock` (la de la carpeta de trabajo tiene 126 líneas y la de la rama baseline 44: **la amplió `deno info` en mi comprobación de importaciones de SEC-SSRF**, no fue un cambio del usuario; la rama conserva la original); y **3 sin rama ni ignorado real: `.claude/settings.json` (+58 −), `.claude/settings.local.json` (+21 −; versionado en `main`, ignorado solo por la regla global del usuario) y `shield-ecuador-app/frontend/skills-lock.json`.** Por la regla acordada la Fase 3 se detuvo aquí.
- Desviación del plan: como `.gitignore` de `main` ya trae las entradas de herramientas locales, no se hará el commit de `.gitignore` en la rama del módulo; antes del stash se usará `.git/info/exclude` (local, no versionado) con las mismas entradas para que no se guarden en el stash 1 000 archivos de skills ni el material fuente; se quita después del merge.
- Gates: no aplican (sin cambios de código).

## Iteración 9 — 2026-09-28 — (higiene del repo, sin tarea del módulo) INV-SEC: verificación del límite de 10 preguntas y del modo invitado
- **Solo lectura de código y migraciones, nada contra producción.** Dato de partida de la persona responsable: en producción "Probar sin cuenta" limita a 10 preguntas del primer dojo y funciona en la interfaz.
- **Hallazgo principal: el tope de 10 preguntas es solo de interfaz.** `GUEST_QUESTION_LIMIT = 10` vive únicamente en `frontend/src/screens/DojoDetailPage.tsx:9`; ningún RPC ni política lo conoce. `learning_answer`/`learning_next` (migración 026) avanzan sobre las 30 preguntas del dojo sin mirar `is_anonymous` en ningún punto. Un invitado que llame esos RPC directo (sin la UI) puede completar las 30 preguntas del dojo 0 y presentar/aprobar su kata (`learning_start_exam` solo exige `completed = 30`); lo único que no ocurre es el ascenso de cinturón, porque el `UPDATE users` no encuentra fila para un invitado.
- **La restricción de dojo (rank 0 / primer dojo) SÍ es de servidor**, y ya estaba bien hecha: `learning_state` calcula `current_rank` con un `coalesce(...,0)` que da 0 para quien no tiene fila en `users` (arreglado en 058, afinado en 059) y rechaza cualquier dojo con `rank > 0`; `minigame_random_question` usa el mismo patrón con `belt`. No hay forma de leer otro dojo o el banco completo por REST directo: `learning_items`/`learning_dojos`/`learning_progress` tienen RLS con cero políticas y `REVOKE ALL FROM anon, authenticated` (solo las funciones `SECURITY DEFINER` tocan esas tablas).
- **Ninguna de las Edge Functions de IA revisadas acepta una sesión anónima**: todas exigen `profile.role === 'admin'` leído de `public.users` (`requireAdminOrScheduler` en `_shared/news-agent-core.ts:495-527`, `requireAdmin` propio de `save-provider-key`); un invitado no tiene esa fila, así que recibe 403. No se revisaron `secure-register-user`, `get-ranking`, `get-private-profile`, `championship-draw-round1`, `get-consent-notice`, `log-login-event` ni funciones fuera de la lista de IA/administrativas.
- **Cambios:** `TASKS.md` (INV-SEC ampliada con las 3 respuestas, citas archivo:línea, y una propuesta de migración + prueba SQL para llevar el tope de 10 al servidor con `auth.jwt()->>'is_anonymous'`, siguiendo el patrón de `request.jwt.claim.sub` que ya usa `supabase/tests/consent/prereqs.sql`; no implementada, pendiente de OK).
- Gates: no aplican (sin cambios de código; solo lectura y documentación).
- Riesgos / pendientes: la fuga confirmada es de cuota (contenido completo sin registrarse), no de datos de otras personas; falta revisar tablas del campeonato, `security_*` y el resto de funciones fuera del alcance de hoy, y decidir si se implementa la migración propuesta antes o después de T19b/D-12.

## Iteración 10 — 2026-09-28 — (higiene del repo) credencial en el historial, limpieza y Fase 3
- **INV-SEC bajada a P2** en `TASKS.md`: la verificación de la iteración 9 no encontró fuga de datos de otras personas ni acceso a funciones de IA; sigue pendiente por higiene (tope de invitado sin servidor) pero ya no es urgente.
- **Hallazgo grave:** `.claude/settings.json` y `.claude/settings.local.json` tenían, desde el commit `b2ca733` (2026-09-09, ajeno a este loop), las credenciales de Basic Auth de `central-admin-app` en texto plano dentro de la lista de comandos `Bash` permitidos (`curl -u usuario:contraseña`), incluida una llamada a `gcloud run services update ... --update-env-vars CENTRAL_ADMIN_PASSWORD=...`. `origin/main` (lo que había en GitHub) estaba 63 commits detrás y nunca llegó a tener ese commit: la credencial no había salido de la máquina por git.
- **Rotación:** la persona responsable roto la contraseña en Cloud Run antes de tocar el historial (confirmado explícitamente; el valor antiguo queda muerto).
- **Respaldo y reescritura:** `git bundle create --all` (106,0 MB, verificado con `git bundle verify`) antes de tocar nada. `git filter-repo --force --replace-text` con reglas **regex** (sin escribir el valor de la contraseña en ningún archivo auxiliar) sobre las 5 ramas locales (`main`, `feature/consentimiento-lopdp`, `chore/baseline-produccion`, `wip/ux-redesign`, `docs/iso-y-privacidad`), redactando `-u usuario:clave` → `-u REDACTED:REDACTED` y `CENTRAL_ADMIN_USER=...,CENTRAL_ADMIN_PASSWORD=...` → `...=REDACTED,...=REDACTED`. Verificado: `git log --all -S "raulchavezdrouet@hotmail.com"` = 0 en las 5 ramas; ambos archivos siguen siendo JSON válido; los 2 worktrees de agentes (`worktree-agent-*`, ajenos a este trabajo) no cambiaron de hash (no descienden de la credencial). `origin` se volvió a agregar tras la reescritura (`git filter-repo` lo quita por seguridad).
- **Incidente durante la reescritura (reportado de inmediato, antes de seguir):** solo se guardó en `stash` el par de archivos de settings; `filter-repo` fuerza un checkout al terminar y reseteó **~29 archivos** con cambios sin commitear ajenos al módulo (no tocados por mí en ningún momento de esta sesión). Verificado con `git fsck --unreachable` (0 objetos recuperables: no eran blobs de git, nunca se habían agregado). **No hubo pérdida real**: los 29 archivos ya estaban copiados, byte a byte, en `chore/baseline-produccion` (51), `wip/ux-redesign` (22, incluida la versión completa de `App.tsx`) y `docs/iso-y-privacidad` (24) desde la Fase 1 (iteración 5, antes de la reescritura); el único archivo excluido a propósito de esas ramas, `LandingPage.tsx`, ya estaba cubierto por `patches/registro-route.patch`, commiteado en el propio módulo.
- **Verificación independiente pedida por la persona responsable:** el `~/wip-backup-2026-09-28.tgz` mencionado nunca llegó a crearse (comprobado con una búsqueda completa de `C:\Users\aps-ecuador`, incluido OneDrive, sin resultados). Alternativa acordada: historial local de VS Code (`%APPDATA%\Code\User\History`) — de los 29 archivos, solo 6 tienen historial ahí, y el más reciente de cada uno es de junio de 2026 (3 meses antes de esta sesión): no aporta evidencia sobre si hubo ediciones entre la Fase 1 (10:18:42) y la reescritura, ni a favor ni en contra. `.deploy/` solo contiene un build compilado del frontend (JS/CSS minificados), sin ningún archivo fuente comparable. **Conclusión honesta:** no hay una segunda fuente independiente que confirme el contenido byte a byte; la evidencia más fuerte sigue siendo la comparación `cmp` de la Fase 1, hecha antes del incidente, más el hecho de que ninguna acción mía entre la Fase 1 y `filter-repo` escribió en esos 29 archivos (auditable en esta misma conversación).
- **Regla nueva en `PROMPT.md`** (REGLAS DURAS → Entorno): antes de `filter-repo`, `rebase`, `reset` o cambiar de rama/fusionar, el árbol debe quedar guardado por completo (`git stash push --include-untracked` o `git status` vacío); esas operaciones requieren OK explícito del humano. Commiteado (`232b64c`).
- **Limpieza final:** aplicado el stash de los settings; quitadas las 18 entradas `curl -u ...` de `.claude/settings.local.json` y las 7 de `.claude/settings.json` (antes de commitear, no solo redactadas); añadido a `deny`: `Read(./.gcloud-config/**)`, `Read(./**/.gcloud-config/**)`, `Read(./.deploy/**)`, `Bash(curl -u:*)`. `settings.json` limpio commiteado (`a647553`). `settings.local.json` con `git rm --cached` + entrada en `.gitignore` raíz (`81ca0d8`); el archivo sigue en disco, solo dejó de versionarse.
- **Fase 3 ejecutada:** `git stash push --include-untracked` (dos veces: un archivo `.docx` bloqueado por un editor no entró en el primero) antes de `git merge main` (conflicto trivial en `.gitignore`, resuelto conservando ambos bloques) → commit `c4e6519`. Aplicado `patches/registro-route.patch` → commit `005940a` (T-ruta-registro cerrada).
- **Dos defectos nuevos encontrados al compilar** (ya estaban commiteados en `HEAD`, ocultos por archivos sin versionar que los "parchaban"): `AdminShell.tsx` importaba `../lib/viewAsUser`, nunca commiteado; `SenseiChallengeModal.tsx` leía `q.generated_at`, campo no declarado en `senseiChallengeTypes.ts`. Corregidos sin cambiar comportamiento → commit `956f289`.
- **Gates:** `gates.sh` completo OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e, deno-check, deno-test, sql-ciclo-de-vida; db-reset SKIP explícito). `register.spec.ts` contra el build de producción servido en `:8793`: **77/77 OK** en 7 perfiles, 4,4 min.
- Riesgos / pendientes: los stashes `stash@{0}` (docx bloqueado) y `stash@{1}` (resto del trabajo ajeno) siguen sin soltar, a la espera de que la persona responsable termine el plan de ramas (Fase 3 de `PLAN_RAMAS.md`, integrar `chore/baseline-produccion`/`wip/ux-redesign`/`docs/iso-y-privacidad` cuando decida); **`~/respaldo-pre-filter-repo.bundle` (106 MB) sigue conteniendo la credencial antigua y no se ha borrado** — pendiente de que la persona responsable confirme que todo quedó verde antes de borrarlo; queda pendiente de la persona responsable la tarea INV-SEC (P2) y el inventario adicional de `get-ranking`/`get-private-profile`/`championship-draw-round1`/`log-login-event` con sesión anónima.

## Iteración 11 — 2026-09-28 — INV-SEC (P2): tope de invitado en el servidor + inventario de 4 funciones
- **Push:** al fetchar `origin` directamente (`git ls-remote origin`), el remoto solo tenía `main` en `97c25b0` (el valor de antes de toda la sesión); ninguna de las 5 ramas llegó a GitHub pese al aviso de "push hecho". Reportado a la persona responsable antes de seguir; no se asumió lo contrario en ningún paso posterior.
- **SEC-SSRF:** re-verificado desde el worktree limpio `~/Riesgo-wt/main` (`git status` vacío, commit `c95cc83`): las 3 funciones siguen importando solo `_shared/news-agent-core.ts` → `_shared/url-guard.ts` (sin cambios respecto a la iteración 7); `deno check` de las 3 compila (falla al final por falta de `node_modules` en el worktree, no por el código: `gates.sh` ya las compiló bien desde la carpeta con dependencias instaladas). Comandos exactos, función por función con verificación posterior, en `.claude/loops/consentimiento/SEC-SSRF-despliegue.md` — **nada desplegado**, a la espera de que la persona responsable los ejecute o dé el OK.
- **INV-SEC — el tope de 10 preguntas pasa al servidor.** Migración `076_learning_guest_limit.sql` (siguiente número libre; no toca 026/058/059): `learning_answer` rechaza una respuesta nueva para `is_anonymous` con `n >= 10`; `learning_start_exam` rechaza a cualquier invitado de entrada. Código de error estable `GUEST_LIMIT_REACHED: …`. Frontend (`DojoDetailPage.tsx`, `KataExamPage.tsx`): panel "Regístrate para seguir" en vez del error genérico cuando aparece ese código.
- **Pruebas primero, confirmado con el ciclo completo:** `supabase/tests/learning/{prereqs,guest_limit}.sql` (base de datos propia en el contenedor efímero, independiente de `consent/`), patrón `pg_temp.expect_error` de `lifecycle.sql`. Verificado a mano el ciclo rojo→verde: la prueba **falla** aplicando solo 026+058+059 (la respuesta 11 de un invitado pasa) y **pasa** con 076 aplicada. Nueva puerta `sql-guest-limit` en `gates.sh`.
- Playwright: dos pruebas nuevas ("invitado en el tope/límite (INV-SEC)") en `dojo-detail.spec.ts` y `kata-exam.spec.ts`, mockeando el RPC con el código de error. **Hallazgo aparte, no corregido:** una prueba preexistente en `kata-exam.spec.ts:82` ("el kata queda cerrado…") ya fallaba antes de este cambio — esperaba un candado de cliente para invitados que nunca se implementó en lo commiteado (solo existe, distinto, en `wip/ux-redesign`); no es una regresión de hoy, queda anotado para T19b/UX-integración.
- **Inventario adicional (solo lectura) de `get-ranking`, `get-private-profile`, `championship-draw-round1`, `log-login-event` con sesión anónima:** `get-ranking` ya rechaza explícitamente `is_anonymous` (403, con comentario propio). `championship-draw-round1` está detrás de `requireAdminOrScheduler`. `log-login-event` no comprueba identidad porque no la necesita (es de antes de que exista cualquier sesión; la clave `anon` ya es un JWT válido). **`get-private-profile` no comprueba `is_anonymous`**: hoy es inofensivo solo porque un invitado nunca tiene fila en `public.users` (protección implícita, no explícita) — queda anotado para revisar si T19b llega a crear alguna fila para invitados.
- Gates: `gates.sh` completo OK (incluida la puerta nueva); `register.spec.ts` ya verificado en la iteración anterior; `dojo-detail.spec.ts` + `kata-exam.spec.ts`: 102 de 109 OK (7 fallos, la misma prueba preexistente en los 7 perfiles).
- Riesgos / pendientes: el resto del alcance original de INV-SEC (RLS/RPC del campeonato y de `security_*`, migraciones 030–072) sigue sin revisar; SEC-SSRF sigue sin desplegar, a la espera del OK; `get-private-profile` sin corregir (nota, no bloqueante); el push a GitHub sigue pendiente de que la persona responsable lo repita y lo confirme.

## Iteración 12 — 2026-09-28 — (higiene del repo) CyberDojo.git: hallazgo y Dockerfile del frontend
- La persona responsable dio el enlace real del proyecto en GitHub: `https://github.com/Rchavez001/CyberDojo` (distinto de `origin`, que sigue en `RIESGO.git`, sin las ramas de hoy — el push reportado como hecho en la iteración 11 no llegó al remoto; se detuvo antes de tocar nada, sin asumir lo contrario).
- **Solo lectura primero** (`git ls-remote`, luego `git fetch` a una rama local descartable `cyberdojo-main-readonly`, sin tocar `origin` ni ningún remoto): `CyberDojo.git` tiene un `main` de **5 commits**, sin ningún ancestro común con la historia de RIESGO — no es un fork ni un espejo, es una importación manual puntual del 1 de septiembre de 2026 más 4 parches de despliegue hechos a mano ese mismo día. Comparado archivo por archivo contra `RIESGO/main`: `central-admin-app/{app.js,styles.css,index.html}` difieren por miles de líneas, `frontend/{App.tsx,CyberBushido.tsx}` por cientos — RIESGO lleva meses de desarrollo que CyberDojo nunca recibió. Lo único que CyberDojo tenía y RIESGO no: `frontend/Dockerfile` (con su parche "Pass Supabase env vars as Docker build args"). Revisado sin secretos: los `ARG`/`ENV` son nombres de variables (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, esta última pública por diseño, va en cada build del frontend), sin valores.
- **Copiado a RIESGO:** `shield-ecuador-app/frontend/Dockerfile`, commiteado en el worktree limpio `~/Riesgo-wt/main` (`caa1432`, `chore(deploy): Dockerfile del frontend desde CyberDojo`) y fusionado sin conflicto en `feature/consentimiento-lopdp`. De paso, se revirtió en ese worktree una expansión accidental de `deno.lock` (44→126 líneas) que había quedado de la re-verificación de SEC-SSRF de la iteración 11 (ejecutar `deno info`/`deno check` ahí modificó el lock file local de ese worktree; no afectaba a ningún commit, solo al árbol de trabajo del worktree).
- **`CyberDojo.git` no se tocó de ninguna forma**: sin push, sin force-push, sin cambios. La rama local `cyberdojo-main-readonly` es solo una referencia de lectura en este repositorio; se puede borrar cuando se quiera (`git branch -D cyberdojo-main-readonly`), no afecta a nada remoto.
- **Nueva tarea `REPO-UNIF`** en `TASKS.md`: decidir cuál de los dos repositorios es el oficial, y comprobar antes en la consola de GCP si Cloud Build/Cloud Run despliegan desde `CyberDojo.git` (lo más probable, dado que ahí están los únicos `Dockerfile`) — un force-push a un repo con despliegue continuo dispararía un despliegue real. Pendiente de la persona responsable.
- Gates: no aplican (solo el commit del Dockerfile, sin cambios de código del módulo).
- Riesgos / pendientes: `origin` (RIESGO.git) sigue sin las ramas de hoy; comandos de push preparados para que los ejecute la persona responsable (ver el cierre de esta iteración). `CyberDojo.git` sigue sin decidir su futuro (REPO-UNIF).

## Iteración 13 — 2026-09-29 — Conciliación T03–T25 (sin código)
- Confirmada y reforzada la regla dura de PROMPT.md sobre operaciones destructivas antes de la conciliación (commit `c4e30c4`, iteración previa): prohíbe explícitamente `git reflog expire`, `git gc --prune`/`--aggressive`, `git stash drop`/`clear`, `git clean` y borrar bundles de respaldo sin OK explícito del humano, cada vez.
- **Conciliación:** para cada tarea T03–T25, se contrastó el criterio de aceptación contra el código real (`grep`/`ls` directos, no solo lo que decían notas previas) y contra `PROGRESS.md`. Ninguna de las 23 tareas cumple **todos** sus criterios de aceptación; ninguna se marcó `[x]` (siguen en 5: T00, T01, T02, T14-fix, T-ruta-registro). Cambios en `TASKS.md`: se verificaron y precisaron con citas de archivo/línea las notas de T03, T04, T06, T07, T08, T09, T10 (ya tenían "Estado real"; se corrigieron cifras exactas — p. ej. T03 son 7 pruebas, no 8; T09 son 10, no 11 — y se confirmaron hallazgos como "T06 no tiene ninguna prueba SQL de sus propias reglas" o "T07 no cambia de rol con `SET ROLE`"); se añadió "Estado real" nuevo a T11, T14, T16, T19, T20, T21, T22, T23, T23b, T24 (todas sin iniciar, sin código en el árbol) y una aclaración a T19b y T25 (solo diseño, T25 explícitamente no debe implementarse fuera de la ventana de release).
- **Porcentaje estricto:** 3 de 28 tareas numeradas (T00–T25 + T98–T99) cerradas = **10,7 %**.
- **Porcentaje ponderado:** con un avance parcial estimado por tarea (T03 60 %, T04 35 %, T06 55 %, T07 85 %, T08 55 %, T09 80 %, T10 85 %, T13 10 %, T15 15 %, T17 25 %, T18 70 %, T25 10 %, T98 35 %, el resto 0 % salvo T00–T02 al 100 %), la suma da 920/2800 = **≈ 33 %**. Cifra estable: coincide con la que se venía reportando desde la iteración 9, porque ninguna iteración reciente (10–12) tocó tareas numeradas del backlog (fueron el incidente de la credencial, la Fase 3 y INV-SEC, que es independiente del módulo).
- **Ruta crítica desde aquí hasta T99** (qué bloquea a qué; construida a partir de las dependencias ya anotadas en cada tarea):
  - **T04** (`_shared/auth-guard.ts`, sin empezar) es el cuello de botella único más grande: bloquea T05, T11, T14, T16 y el paso 1 de T19b.
  - Desde T04 se abren tres ramas independientes que pueden avanzar en paralelo una vez esté hecha:
    - **T04 → T05** (identidad individual en el panel) **→ T21 → T22** y, junto con T14, **→ T23 → T24**. T05 es el segundo cuello de botella: bloquea las 4 tareas de panel (T21, T22, T23, T24) además de T23b.
    - **T04 → T14 → T15 → T16** (las tres comparten el archivo `admin-consent`; T15 además ya tiene su tabla lista, `privacy_email_verifications`).
    - **T12** (`EmailSender`, sin empezar, es la tarea más grande sin tocar) **→ T13 → T19 → T20** y, en paralelo, **T12 → T23b**.
  - **T25** (backfill) depende de T19 (`requires_reconsent`) y, aparte del código, de que 074/075 estén aplicadas en producción (fuera del loop).
  - **T98** (documentación) puede avanzar en paralelo casi todo el tiempo, pero por convención de la Fase 6 se deja para el final.
  - **T99** depende de absolutamente todo lo anterior.
  - En una frase: **T04 y T05 son las dos tareas que, si se hicen ya, desbloquean más trabajo futuro** (T04 desbloquea 5 tareas directas; T05 desbloquea 4 más). T12 es la tercera pieza crítica porque, aunque no bloquea tantas tareas, es la más grande sin ni empezar y bloquea el camino hacia T19/T20/T25.
- Gates: no aplican (solo `TASKS.md`/`PROGRESS.md`, sin cambios de código).
- Siguiente iteración: **T04** (`_shared/auth-guard.ts` con `requireUser`/`requireRole` y sus pruebas negativas), según instrucción explícita de la persona responsable.

## Iteración 14 — 2026-09-29 — Push confirmado en origin; pérdida de material fuente cerrada sin recuperación
- **Push confirmado (solo lectura, `git ls-remote origin`, dos veces):** las 5 ramas están en `RIESGO.git` y coinciden exactamente con el estado local: `main` = `217140f`, `feature/consentimiento-lopdp` = `80b5c27`, `chore/baseline-produccion` = `e140daa`, `docs/iso-y-privacidad` = `3510f26`, `wip/ux-redesign` = `39865be`. Lo hizo la persona responsable, fuera de esta sesión.
- Según reporta la persona responsable (no reverificado por mí más allá de lo anterior): el `main` remoto se reemplazó con `--force-with-lease` tras confirmar que la única diferencia con lo que ya estaba en `origin` era la página guardada con el token de OpenAI (la que se quitó del historial en la iteración de la credencial). La credencial del panel (`central-admin-app`) **nunca llegó a GitHub** — confirmado ya en su momento con `git ls-remote` contra el `origin/main` original (63 commits detrás, sin ese commit). La contraseña ya está rotada en Cloud Run.
- **Pérdida de material fuente confirmada y cerrada, sin intento de recuperación:** `shield-ecuador-app/imagen/` (de ~77 MB quedaron 6,4 MB: dos archivos) y `shield-ecuador-app/videos/` (~139 MB, carpeta completa) se perdieron por el incidente de `git reflog expire`+`gc --prune` de la iteración anterior. Ninguno de los dos se había commiteado en ninguna rama (eran material fuente en bruto, deliberadamente fuera de git). La persona responsable indica no intentar recuperarlo: se da por perdido.
- **Regla dura reforzada** (commit `c4e30c4`, iteración 13): además del texto en `PROMPT.md`, se añaden entradas a `deny` en `.claude/settings.json` para que la prohibición sea de configuración, no solo de instrucción (ver commit siguiente).
- Gates: no aplican (solo verificación y documentación).
- **Cierre (iteración 15):** las reglas `deny` anunciadas arriba quedaron en el commit `b9b0963` (15 reglas: `git gc/reflog/prune/stash drop/stash clear/clean/filter-repo/reset --hard/push/branch -D/worktree prune`, `rm -rf/-r`, `Remove-Item -Recurse`, `*.bundle*`). La iteración 14 se cortó por un error de red antes de hacerlo.

## Iteración 15 — 2026-09-29 — T04 Verificación de identidad y roles
- Cambios: `supabase/functions/_shared/auth-guard.ts` (nuevo: `requireUser`, `requireRole`, `AuthError`, `PRIVACY_ROLES`); `supabase/tests/consent/prereqs.sql` (privilegios por defecto de Supabase para `anon`/`authenticated`/`service_role`, para que los `REVOKE` de las migraciones se prueben de verdad); `gates.sh` (`admin_roles.sql` en `sql-ciclo-de-vida`; `auth-guard.ts` en `deno-check`); `deno.lock` (+80 líneas, solo `jose@v5.9.6`).
- Diseño: verificación **local** de la firma con `jose` (`jwtVerify`) contra el JWKS del proyecto (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), inyectable en pruebas; algoritmos solo asimétricos (ES256/RS256: `none` y HS256 quedan fuera); `exp` obligatorio; `aud = authenticated`; emisor si se define `SUPABASE_JWT_ISSUER`. Tras verificar: `role` debe ser `authenticated` (rechaza `service_role` y `anon` aunque estén bien firmados, H08), `sub` UUID, `is_anonymous` → 403. `requireRole` consulta `admin_roles` con el JWT del propio usuario vía PostgREST (política `admin_roles_self_read`); un claim de rol en el token no concede nada; error de consulta → 503 `role_lookup_failed` (falla cerrado); lista vacía o rol desconocido → `TypeError`. Ningún `console.log`; los `code` de error no llevan el token ni detalles.
- Pruebas añadidas: `auth-guard_test.ts` (23): sin token; esquema no Bearer / basura; firma alterada; payload alterado con firma original; clave ajena con el mismo `kid`; expirado; sin `exp`; `role: service_role` forjado sin firma (`alg: none`) y con clave ajena; `service_role` bien firmado; clave `anon`; audiencia/emisor distintos; `sub` no UUID; sesión anónima; token válido; usuario sin rol; rol insuficiente; rol suficiente; roles consultados solo para el `sub` verificado (y nunca con token inválido o anónimo); claim de rol ignorado; fallo de consulta; lista de roles inválida; comprobación estática de H01 (sin `decodeJwtRole`/`decodeJwt`/`atob(`). `admin_roles.sql`: `has_privacy_role` verdadero/falso según el rol, cada usuario ve solo su fila, INSERT/UPDATE/DELETE denegados a `authenticated` y `anon`, `anon` no ve filas, sin sesión no hay rol.
- **Rojo confirmado antes de implementar:** contra un stub que aceptaba todo (sin decodificar nada), 22 de 23 fallaron: los 20 negativos con "Expected function to reject" (el guard dejaba pasar lo que debía rechazar) y los 2 positivos con "Values are not equal" (`userId: 'stub'`); pasó solo la prueba estática de H01, como se esperaba. Para el SQL (la 073 ya existía), prueba de mutación: con la 073 real pasa (rc=0); sin el `REVOKE` falla (el INSERT solo lo frena RLS, "error distinto del esperado"); con la política `USING (true)` falla ("usuario sin rol ve filas ajenas").
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e, deno-check, deno-test [80 + 5, incluidas las 23 nuevas], sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito). Docker Desktop estaba apagado: se arrancó localmente para las puertas SQL.
- Desviaciones de SPEC: SEC-01 admite `auth.getUser(jwt)` o JWKS; se eligió JWKS local para que las pruebas negativas ejerciten la criptografía real (con `getUser` solo se probaría un mock). No se consulta `has_privacy_role()` por cada rol: se lee `admin_roles` una vez bajo la misma RLS (misma fuente, un viaje de red); `has_privacy_role()` queda cubierta por `admin_roles.sql`.
- Riesgos / pendientes detectados: (1) ~~Confirmar que el proyecto hospedado firma con claves asimétricas~~ **Resuelto (2026-09-29, después del commit de T04):** la persona responsable verificó en el dashboard que la clave de firma actual del proyecto es **asimétrica ECC P-256 (ES256)**; el guard queda como está (JWKS, solo ES256/RS256). **Medido en local** (CLI 2.75.0, GoTrue v2.186.0, copia desechable de `supabase/` sin `project-ref`, procedimiento de "Cómo reproducir en local"): el Auth local **ya firma con ES256** por defecto (JWKS con una clave EC P-256; cabecera de un token real `alg: ES256`), así que **no hizo falta configurar `signing_keys_path`**: local y producción coinciden. Las claves `anon`/`service_role` locales siguen siendo JWT HS256 heredados, y el guard las rechaza (401). Prueba de integración nueva `supabase/tests/consent/auth_guard_local_test.ts` (fuera de gates.sh: necesita el stack; se niega a correr contra un host no local): 6/6 OK con tokens reales emitidos por el Auth local y `auth-guard.ts` sin nada inyectado (JWKS remoto, emisor `SUPABASE_JWT_ISSUER`, `admin_roles` vía PostgREST con RLS): token válido; payload alterado; claves anon y service_role; sesión anónima real; sin rol → rol concedido → rol insuficiente; rol ajeno invisible por RLS. Mutación: con un emisor distinto, el token real legítimo se rechaza (`invalid_token`). **Riesgo nuevo para T05:** la verificación local no ve el cierre de sesión; un JWT revocado sigue valiendo hasta su `exp` (`jwt_expiry = 3600`). Para acciones del panel conviene acortar la vida del token o comprobar la sesión (`auth.getUser`/`session_id`) en las operaciones sensibles. **Hallazgo aparte:** `gates.sh` deja vivos los contenedores `consent-gates-*`/`learning-gates-*` (el `trap … EXIT` dentro de la función no se dispara en Git Bash); se pararon a mano. (2) Si `SUPABASE_JWT_ISSUER` no se define, no se comprueba el emisor (la firma sigue atando el token al proyecto). (3) El JWKS remoto lo cachea `jose` en memoria por instancia; una rotación de claves se recoge al fallar el `kid`. (4) Siguen con el decodificador sin verificar: `championship-draw-round1`, `save-provider-key`, `save-app-secret`, `_shared/news-agent-core.ts` (fuera del módulo; no se tocan en esta tarea).
- Porcentaje: estricto 4 de 28 tareas numeradas = **14,3 %** (antes 10,7 %). Ponderado: T04 pasa de 35 % a 100 % → 985/2800 = **≈ 35,2 %** (antes ≈ 33 %).

## Iteración 16 — 2026-09-30 — T05.a Identidad individual: backend y proxy del panel
- **Antes de T05, reglas `deny` de PowerShell** (commit `f156bdb`): equivalentes `PowerShell(<prefijo>:*)` de las 15 reglas (sintaxis de la documentación de permisos: misma forma que Bash, `:*` = ` *` final, alias canonicalizados — `Remove-Item` cubre `rm`/`del`/`ri`/`rd` —, sin distinguir mayúsculas). **Prueba de bloqueo: FALLÓ en esta sesión.** `git gc --help` se ejecutó por Bash y por PowerShell sin rechazo. Causa (documentación): las claves de `.claude/settings.json` se cargan **solo del directorio donde se lanzó Claude Code**; esta sesión se lanzó en `C:\Users\aps-ecuador`, no en `Riesgo`, así que ni estas reglas ni las 15 de `b9b0963` se aplican aquí. Solo protegen sesiones lanzadas en `Riesgo/`. Pendiente de la persona responsable: relanzar dentro de `Riesgo` (o `/cd`) o copiar las reglas a `~/.claude/settings.json` (afecta a todos sus proyectos). No se tocó la configuración global sin su OK.
- **Ajuste 2 (auth-guard contra Supabase local):** ver la nota de la iteración 15, punto (1) — local ya firma con ES256; commit `1e8fe9a`.
- **División de T05** en T05.a (backend + proxy, esta iteración) y T05.b (UI con TOTP), anotada en `TASKS.md` antes de codificar.
- Cambios: `_shared/auth-guard.ts` (`requireRole` exige `aal = aal2` → 403 `mfa_required`, antes de consultar roles; `requireUser` no cambia); `functions/admin-consent/{handler.ts,index.ts}` (nuevo, solo `POST /session`: `requireRole` con cualquier rol del módulo, correo obligatorio, registra `admin.session_verified` en `admin_audit_log` con `actor_id` = `sub` verificado, `actor_email_hmac` (HMAC de búsqueda, `LOOKUP_HMAC_KEY_B64`), `actor_role` = roles, `entity_id` = `session_id`; si no puede registrar → 503 `audit_failed`, la sesión no se da por verificada); `config.toml` (`[functions.admin-consent] verify_jwt = true`, explícito); `central-admin-app/server.js`: (a) rutas `/api/privacy/auth/*` con lista cerrada (token por contraseña/refresh, `GET user`, `logout`, alta/desafío/verificación de factor) y `/api/privacy/fn/admin-consent/*`, ambas con la clave **anon** y el JWT del admin de `X-Admin-Session` como bearer, **nunca la service role**; sin sesión → 401 sin salir a Supabase; `..` codificado o funciones ajenas → 404; (b) el proxy con service role rechaza (403) toda la superficie del módulo — ruta y query decodificadas hasta 3 veces (PostgREST decodifica `%5F` y embebe tablas relacionadas en `select`), prefijos `consent_`/`privacy_`/`admin_roles`/`admin_audit`/`data_subject_` más las RPC del módulo y `admin-consent`; (c) **cerrado todo `/api/auth/v1/`** con service role (no lo usaba `app.js`; permitía generar un enlace de acceso para un admin o borrar su factor TOTP y suplantarlo); refactor mínimo: `relay()` común. `.env.example`: `SUPABASE_ANON_KEY` ficticia. `tests/admin/start-admin.cjs`: el mock guarda los primeros 2 KB del cuerpo para `__find` y recibe una clave anon ficticia.
- Pruebas añadidas: `auth-guard_test.ts` +2 (aal1 y sin `aal` → `mfa_required` sin consultar roles; `requireUser` sigue aceptando aal1); `admin-consent/handler_test.ts` (9: sesión verificada con la bitácora exacta; sin token; aal1; sin rol; `service_role`; sin correo; fallo de bitácora; 404/405; errores sin token ni detalles); `tests/admin/privacy-session.spec.ts` (10: 17 rutas del módulo por el proxy con service role, incluidas `%5F`, mayúsculas y embebidos → 403 sin llegar al upstream; Auth con service role cerrado; sin regresión en `users`; admin-consent sin sesión o con basura → 401; con sesión → JWT del admin + anon, sin service role ni `X-Admin-Session` reenviada; `/api/privacy/fn` solo a admin-consent, también con `%2e%2e`; login con anon; factores con el JWT; lista cerrada de Auth; Basic Auth sigue delante). `auth_guard_local_test.ts`: las pruebas de roles pasan a comprobar que un token real de solo contraseña (aal1) da `mfa_required` aunque tenga rol (la de "rol ajeno invisible" se retira aquí: necesita aal2; la RLS sigue cubierta por `admin_roles.sql` y volverá con TOTP real en T05.b). 5/5 contra el Auth local.
- **Rojo confirmado:** guard — la prueba aal1 falló con "Expected function to reject" (el guard dejaba pasar sin TOTP). Handler — contra un stub que respondía 200 a todo, 9/9 fallaron en las aserciones de estado/código/bitácora. Panel — contra el `server.js` anterior, 6/10 fallaron por la razón correcta (tablas del módulo y Auth admin pasaban con 200; rutas `/api/privacy/*` inexistentes); las 4 restantes (no regresión, lista cerrada, `fn` ajena, Basic Auth) pasaban ya, porque vigilan que la implementación no abra de más.
- Ciclos de corrección: 1 — `relay()` sombreaba su parámetro `headers` con el `const headers` de la respuesta (TDZ → 502 en todo reenvío, incluida la prueba preexistente del proxy); renombrado.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e [138 pasadas, 1 omitida preexistente], deno-check [+`admin-consent/index.ts`], deno-test [91 + 5], sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito).
- Desviaciones de SPEC: ninguna de requisito. SEC-03 dice "MFA si está disponible"; D-01 fija TOTP, y se exige (`aal2`) en el guard de roles, no solo en el panel. La service role sigue existiendo como transporte de escritura de `admin_audit_log` (la tabla no admite `authenticated`), siempre con el actor del JWT verificado.
- Riesgos / pendientes detectados: (1) **Configuración de producción antes de desplegar `admin-consent`/panel:** `SUPABASE_ANON_KEY` en el panel (Cloud Run), `LOOKUP_HMAC_KEY_B64` en la función, TOTP habilitado en Auth del proyecto hospedado (en `config.toml` local está `enroll_enabled = false`; se habilita en T05.b), y cada admin necesita fila en `public.users` (FK de `admin_audit_log.actor_id`). Nada desplegado. (2) La Basic Auth + service role conserva todo lo demás de la consola (fuera del módulo); con ella se pueden seguir leyendo `public.users` y otras tablas; eso es H08 general, no de este módulo. (3) El bloqueo por nombres en el proxy es una lista negra: una tabla futura del módulo con otro prefijo quedaría abierta; la convención de nombres del módulo debe mantenerse (anotado en el comentario de `server.js`). Una vista o RPC ajena al módulo que lea sus tablas con `SECURITY DEFINER` también saltaría el bloqueo — hoy no existe ninguna (grep de 073–075). (4) `get-consent-notice` no tiene entrada `verify_jwt = false` documentada en `config.toml`, aunque SEC-01 lo exige ("siempre documentado"): pendiente de T09. (5) `gates.sh` sigue dejando vivos los contenedores de las puertas SQL (ver iteración 15); se pararon a mano otra vez. (6) El stack local de prueba (`t04-local-auth`, copia en el scratchpad) se detuvo al final; sus volúmenes quedan hasta un `supabase stop --no-backup` (no se ejecutó).
- Porcentaje: estricto sin cambio, 4 de 28 = **14,3 %** (T05 no se cierra hasta T05.b). Ponderado: T05 pasa de 0 % a 50 % → 1035/2800 = **≈ 37,0 %** (antes ≈ 35,2 %).
