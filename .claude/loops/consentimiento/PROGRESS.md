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
