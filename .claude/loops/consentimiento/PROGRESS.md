# PROGRESS — Módulo de Consentimiento Informado y Derechos del Titular

Última actualización: 2026-09-28 (tarde). Fuente de requisitos: SPEC v1.0 (REQ-01…20, SEC-01…09).
El paquete del loop (PROMPT, SPEC, TASKS, DECISIONS, seed, run-loop.sh) está instalado en `.claude/loops/consentimiento/` y el trabajo sigue en la rama
`feature/consentimiento-lopdp`. Este archivo tiene dos partes: las secciones de loop (mapa del repo, línea base, iteraciones — al final) y el
historial previo al loop (estado, decisiones, hallazgos abiertos). Los pasos 2 y 3 de instalación del README (fusionar `settings.loop.json` y añadir
`CLAUDE.md.fragmento`) NO se han hecho: cambian permisos e instrucciones del proyecto y los decide la persona responsable.

## Estado (estimación contra la SPEC, no contra TASKS.md)
- **Contra TASKS.md: 2 de 28 tareas cerradas (7,1 %)** — T00 y T01; el resto tiene su "Estado real" anotado en TASKS.md. Ponderando lo parcial,
  ≈ 31 % (estimación mía a partir de esas anotaciones: 27–28 % antes de T01, que aporta una tarea completa). Contra la SPEC: ~42 % escrito.
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
