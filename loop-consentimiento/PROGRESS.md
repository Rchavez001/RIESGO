# PROGRESS — Módulo de Consentimiento Informado y Derechos del Titular

Última actualización: 2026-09-28 (tarde). Fuente de requisitos: SPEC v1.0 (REQ-01…20, SEC-01…09).
El paquete del loop se reparte en dos sitios (2026-09-30, por la protección "sensitive file" de Claude Code sobre todo lo bajo `.claude/`: el
loop headless no podía editar sus propios archivos de trabajo ahí): `PROMPT.md`, `gates.sh`, `run-loop.sh` y `headless-settings.json` siguen en
`.claude/loops/consentimiento/` (protegidos de edición por el propio loop headless); `SPEC.md`, `TASKS.md`, `PROGRESS.md`, `DECISIONS.md`,
`PLAN_PRODUCCION_RELEASE.md`, `PLAN_RAMAS.md`, `seed/`, `diag/` y `logs/` viven en `loop-consentimiento/` (raíz del repo). El trabajo sigue en la rama
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

**Herramientas:** `.claude/loops/consentimiento/gates.sh` (Deno 2.9.6 fijado + SQL en Postgres efímero + función de diagnóstico),
`loop-consentimiento/diag/` (T03: consulta del Logs Explorer y función de diagnóstico temporal, NO desplegada), `PLAN_PRODUCCION_074_075.md`.
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
| db-reset | **SKIP explícito** | Opt-in (`GATES_DB_RESET=1`, stack local en marcha). Además, **las migraciones anteriores a 073 no se aplican desde cero**: la 004 define `is_admin()` (SQL) antes de crear la columna `role` que usa (`column "role" does not exist`). Es previo al módulo y rompe la regla "cada migración aplica limpia con `supabase db reset`" tal como está escrita; en local se sortea con una copia desechable que antepone `SET check_function_bodies = off;` (ver "Cómo reproducir en local"). **Corrección (iteración 23, T00-extra):** no es específico de Postgres 17 como se afirmaba aquí — medido con `supabase db reset` real y también con Postgres 16 puro: falla igual en ambas versiones. `SET check_function_bodies = off` tampoco lo evita (esa opción solo afecta a `plpgsql`, y `is_admin()` es `LANGUAGE sql`); si esa copia desechable "funcionó" antes fue por otra razón, no por esa línea — no verificado, ver detalle en la Iteración 23 y D-13. |

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

## Iteración 17 — 2026-09-30 — T05.b UI del panel: login individual con TOTP (cierra T05)
- **Sesión:** abierta en `c:\Users\aps-ecuador`, no en `Riesgo` (es la misma conversación; no se ha relanzado). Por eso las reglas `deny` del proyecto no aplican aquí.
- **Pasos previos (commits aparte):**
  1. Prueba de bloqueo repetida antes de tocar nada: `git gc --help` por Bash y por PowerShell **NO fue rechazado** (rc=0 en ambos): la sesión sigue en `c:\Users\aps-ecuador`.
  2. Con OK de la persona responsable, copiadas a `~/.claude/settings.json` (nivel usuario, fuera del repo; sin commit) **solo** las reglas destructivas: 14 `Bash(...)` + 15 `PowerShell(...)` (git gc/reflog/prune/stash drop/stash clear/clean/filter-repo/reset --hard/branch -D/worktree prune, `rm -rf`/`rm -r`/`Remove-Item -Recurse` — más `PowerShell(Remove-Item *-Recurse*)` para `-Recurse` en cualquier posición —, `*.bundle*`). **No** se copiaron `git push`, `curl -u` ni `.gcloud-config` (quedan solo en el proyecto). Copia del original en el scratchpad. Prueba repetida: **ambos rechazados** ("Permission to use Bash/PowerShell with command git gc --help … has been denied"); las reglas de usuario se aplicaron en caliente. Hallazgos en ese archivo, **sin tocar**, para la persona responsable: (a) el bloque `allow` guarda **credenciales en claro** en reglas `curl -u …` aprobadas en su día (usuario/contraseña del panel local y otra pareja `admin:…`) — rotarlas si siguen vigentes y borrar esas líneas; (b) reglas `allow` como `Bash(bash -c ' *)`, `Bash(python -c ' *)`, `Bash(node -e ' *)` permiten envolver un comando y esquivar una `deny` por prefijo; (c) un hook `PostToolUse` hace `git add` de cada archivo editado (por eso los commits del loop van siempre con rutas explícitas).
  3. `gates.sh` (commit `c397eb7`): los contenedores de las puertas SQL se eliminan siempre (etiqueta por corrida, `with_pg` los borra al terminar la puerta, trap EXIT/INT/TERM en el proceso principal). Verificado con `docker ps`: corrida normal, puerta fallida (error inyectado y revertido) y corrida cortada con SIGTERM (el contenedor vivo al cortar desapareció) → ninguno queda.
  4. `TASKS.md` (commit `30da054`): PANEL-HOTFIX (P1), SESION-REVOCADA (P2) y la nota de `verify_jwt = false` de `get-consent-notice` en T09.
- Cambios T05.b: `central-admin-app/index.html` (entrada "Consentimiento informado" en la navegación y sección `#consent`: formulario de acceso, alta TOTP con QR y clave manual, código de 6 dígitos, identidad y roles, cerrar sesión); `app.js` (`privacyFlow` en memoria — nunca en `state`, `localStorage` ni `sessionStorage` —; contraseña → `GET user` → factor TOTP verificado o alta nueva → desafío → verificación → token aal2 → `admin-consent/session`; sin rol → mensaje y cierre de sesión; código inválido → nuevo desafío; textos por `textContent`); `styles.css` (estilos acotados a `#consent`, `[hidden]` gana a `.form-grid`); `supabase/config.toml` (`[auth.mfa.totp] enroll_enabled/verify_enabled = true`, local); `tests/admin/shell.spec.ts` (15 → 16 secciones).
- Pruebas añadidas: `tests/admin/privacy-login.spec.ts` (10, mock de `/api/privacy/**`): formulario sin sesión; factor verificado → código → sesión con el token **aal2** (no el de contraseña) y sin alta de otro factor; alta con QR/clave y limpieza de la clave tras verificar; factor sin verificar → alta nueva; contraseña incorrecta (sin avanzar, campo vacío); código incorrecto (reintento, sin llamar a la función); solo 6 dígitos (sin llamar a `verify`); sin rol (mensaje, sin identidad); **ningún token/refresh/secreto en `localStorage`/`sessionStorage`** tras "Guardar borrador"; logout con la sesión aal2. **70/70 en los 7 perfiles.** `supabase/tests/consent/admin_login_local.cjs` (punta a punta local, fuera de gates).
- **Rojo:** contra el `app.js` anterior, 10/10 fallaron al no existir la entrada "Consentimiento informado" (rojo grueso, a nivel de funcionalidad). Para comprobar que cada prueba muerde de verdad, dos mutaciones deliberadas sobre la implementación (restaurada después, `cmp` idéntico): (a) enviar la sesión del módulo con el token aal1 → fallan exactamente "sesión verificada con el token aal2" y "cerrar sesión"; (b) guardar el token en `localStorage` → falla exactamente "el token vive solo en memoria".
- **Aceptación de T05.b — punta a punta con TOTP real (14/14 PASS):** copia desechable de `supabase/` sin `project-ref`, stack local con TOTP y `edge-runtime`, `admin-consent` servida en local, **panel real** (`server.js`) en :3197 contra ese stack. Contraseña → aal1 → `admin-consent` responde 403 `mfa_required`; alta TOTP + código calculado (RFC 6238) → aal2 del mismo `sub` → `admin-consent/session` 200 con su rol → `admin_audit_log`: `admin.session_verified`, `actor_id` real, `entity_id` = `session_id` del token, `actor_role`, correo solo como HMAC, `row_hash` encadenado; `verify_audit_chain()` → íntegra. Usuario con TOTP sin rol → 403 `forbidden` (aunque otro admin tenga `privacy_admin`: RLS). Basic Auth + service role → `admin_audit_log`, conceder rol, `admin-consent` y `generate_link` → 403. Logout → 204. Stack, función y panel detenidos al final; ni contenedores ni puertos quedan en uso.
- **Desviación local (no de producción):** el gateway de funciones de la CLI local 2.75 (`edge-runtime` 1.70.0) rechaza los JWT ES256 con `verify_jwt = true` (`{"msg":"Invalid JWT"}`) antes de llegar a la función. La documentación de Supabase (Authorization headers) dice que en la plataforma "the check validates legacy HS256 JWTs and JWTs signed with the new asymmetric signing keys": en producción `verify_jwt = true` es correcto y se mantiene. Para la prueba local se sirvió con `--no-verify-jwt` (la función verifica ella misma con `auth-guard`); la capa del gateway no se ejercitó en local. Actualizar la CLI (hay 2.118) permitiría probarla; no se hizo (herramienta global de la máquina, fuera de alcance).
- Ciclos de corrección: 2 — (1) la spec usaba `getByLabel('Correo')` sin acotar y otras secciones tienen campos "Correo": localizadores limitados a `#consent`; (2) `shell.spec.ts` esperaba 15 secciones.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e [148 pasadas, 1 omitida preexistente], deno-check, deno-test, sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito); `docker ps` sin contenedores de gates después.
- Desviaciones de SPEC: ninguna.
- Riesgos / pendientes detectados: (1) **TOTP en el proyecto hospedado sin confirmar** (Dashboard → Authentication → Multi-Factor → App Authenticator/TOTP): sin él, ningún admin puede llegar a aal2 y el módulo queda cerrado (falla cerrado, no abierto). (2) Sin refresco de sesión: el token dura `jwt_expiry` (1 h); después, la siguiente acción devolverá `token_expired` y habrá que entrar de nuevo (T21 debe mostrarlo bien). Recargar la página también obliga a entrar (a propósito: nada en almacenamiento). (3) **`echarts-gl` lanza "Invalid expression."** al arrancar en la emulación de Android (Galaxy S9+, a veces Pixel 7), desde el gráfico 3D de Reportes: **preexistente** (reproducido con el código de `HEAD` sin T05.b: 1 de 6), intermitente, ajeno al módulo; hace fallar `shell.spec.ts:24` en esos perfiles fuera de gates (gates solo corre escritorio). No corregido. (4) Nota de herramientas: un `Stop-Process` que filtra por `CommandLine -match "start-admin.cjs"` mata también al bash que lo lanza si esa cadena aparece en su propia línea de comandos (salida 255 sin texto); `gates.sh` no se ve afectado (su línea de comandos no la contiene).
- Porcentaje: estricto 5 de 28 = **17,9 %** (antes 14,3 %). Ponderado: T05 pasa de 50 % a 100 % → 1085/2800 = **≈ 38,8 %** (antes ≈ 37,0 %).

## Iteración 18 — 2026-09-30 — T03 cierre: `maskIp` y normalización IPv4-mapped/zona IPv6
- **Previo a la tarea, con OK explícito de la persona responsable:** limpieza de `~/.claude/settings.json`
  (nivel usuario, fuera del repo) siguiendo los hallazgos anotados sin tocar en la iteración 17: (a) eliminadas
  17 reglas `allow` de `curl -u` con credenciales en claro (todas apuntaban a servicios locales del proyecto,
  `localhost:3100` y `127.0.0.1:3198`/`localhost:3198`, panel admin); (b) eliminadas 15 reglas `allow` que
  envolvían `node -e`, `bash -c`/`python -c`/`python3 -c` y `powershell -Command`, algunas con comodín abierto
  (`' *`) que permitían esquivar una `deny` por prefijo. Backup del archivo original guardado junto al mismo
  (`settings.json.bak.<timestamp>`). El hook `PostToolUse` que hace `git add` de cada archivo editado/escrito
  se inspeccionó y se dejó intacto (no se pidió borrarlo). Sin commit: es config de usuario, no del repo.
- Cambios: `supabase/functions/_shared/client-ip.ts` (`maskIp(ip)` nueva; `normalizeIp` ahora colapsa
  IPv4-mapped IPv6 —cualquier forma de entrada, vía el parser `URL` que ya canonicaliza— a la IPv4 plana
  con `ipv4FromHexPair`, y descarta la zona `%iface` antes de validar, ya que solo tiene sentido local y
  nunca la añade un proxy de red).
- Pruebas añadidas: `client-ip_test.ts` +5 (7→12): IPv4-mapped en varias formas de entrada normaliza igual
  que la IPv4 pura, incluida dentro de la cadena `X-Forwarded-For`; zona IPv6 descartada (con y sin corchetes,
  interfaz con nombre y numérica); `maskIp` IPv4 oculta el último octeto; `maskIp` IPv6 conserva los 3
  primeros hextetos (expandidos) y oculta el resto con `xxxx::`, incluido un IPv4-mapped (se enmascara como
  IPv4, coherente con que ya normaliza a IPv4); `maskIp` de un valor no-IP → `null`.
- **Rojo confirmado antes de implementar:** el import de `maskIp` en la prueba falla la comprobación de tipos
  (`TS2305: no exported member 'maskIp'`) porque la función no existía — el mismo `deno test` la reporta como
  fallo de compilación, no se pudo llegar a ejecutar ningún caso.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e,
  deno-check, deno-test [12 nuevas incluidas], sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito);
  `docker ps` sin contenedores de gates después.
- Desviaciones de SPEC: ninguna. La forma exacta de `maskIp` para IPv6 (TASKS.md: "primeros 3 hextetos +
  `xxxx::`") no estaba más detallada en SPEC.md; se interpretó como los primeros 3 grupos de la dirección
  **expandida** a 8 hextetos (no de la forma comprimida con `::`), para que el prefijo mostrado sea siempre
  de 48 bits reales y no dependa de dónde cayó la compresión. Documentado aquí por si un humano prefiere
  otro formato de presentación.
- Riesgos / pendientes detectados: ninguno nuevo. Sigue abierto lo ya conocido: medición de la cabecera de
  IP real en el proyecto hospedado (D-08, tarea separada `T03-prod`) y, en cascada, `T03-sec`.
- Porcentaje: estricto 6 de 28 = **21,4 %** (antes 17,9 %). Ponderado: T03 pasa de 60 % a 100 % →
  1125/2800 = **≈ 40,2 %** (antes ≈ 38,8 %).

## Iteración 19 — 2026-09-30 — T06 cierre: regla de no-hueco al retirar el aviso publicado
- Cambios: `supabase/migrations/077_consent_documents_no_gap_on_retire.sql` (nuevo: función
  `enforce_consent_document_no_gap_on_retire()` + `CREATE CONSTRAINT TRIGGER
  consent_documents_no_gap_on_retire ... DEFERRABLE INITIALLY DEFERRED ... WHEN (OLD.status =
  'published' AND NEW.status = 'retired')`); `supabase/tests/consent/consent_documents_lifecycle.sql`
  (nuevo, 7 aserciones); `.claude/loops/consentimiento/gates.sh` (`sql_ciclo_de_vida_in`: aplica la
  migración 077 y corre la prueba nueva).
- Diseño: la regla "retirar deja sin publicada solo si se publica otra en la misma transacción" no se
  puede expresar con una restricción inmediata (dejaría un instante sin fila `published` incluso en el
  caso correcto: retirar y luego publicar el reemplazo). Se usa una restricción **diferible** que solo
  se activa en la transición `published → retired` (no en `draft → retired`, que no exige reemplazo) y
  se comprueba al final de la transacción — o antes, con `SET CONSTRAINTS ... IMMEDIATE`, que es lo que
  usa la prueba para no depender de un `COMMIT` real dentro del script de `psql`.
- Pruebas añadidas: `consent_documents_lifecycle.sql` (7): editar contenido publicado falla (`content_md`,
  `purposes`, `title`); el borrador sí se edita; publicar una segunda versión con otra ya publicada choca
  con el índice único; retirar la publicada sin reemplazo falla con el mensaje nuevo y no deja nada a
  medias (v1.0 sigue `published` tras el intento); retirar v1.0 y publicar v1.1 en la misma transacción
  sí se permite (termina habiendo exactamente una publicada); un borrador retirado directamente
  (`draft → retired`) no dispara la restricción; permisos (`anon`/`authenticated` no escriben, `anon` sí
  lee por la RLS que filtra a `published`).
- **Rojo confirmado antes de implementar:** corrida manual de la prueba nueva contra 073+074+075 (sin la
  077): las aserciones 1–3 pasaron (ya estaban cubiertas por lo existente en 073), la 4 falló con
  `constraint "consent_documents_no_gap_on_retire" does not exist` — la razón correcta, porque la
  restricción todavía no existía.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e,
  deno-check, deno-test, sql-ciclo-de-vida [incluida la prueba nueva], sql-guest-limit; db-reset SKIP
  explícito); `docker ps` sin contenedores de gates después.
- Desviaciones de SPEC: ninguna. TASKS.md pedía la migración siguiente disponible; se detectó que 076
  (`learning_guest_limit`, ajena al módulo) ya ocupaba ese número, así que 077 es la primera libre.
- Riesgos / pendientes detectados: (1) el seed de desarrollo (`load_seed_aviso.cjs`) sigue siendo un
  script aparte, no una migración — mencionado en la reconciliación de T06 pero no listado como "Falta"
  accionable; no se tocó. (2) `admin-consent` (T14) todavía no existe: hoy solo `service_role` puede
  publicar/retirar `consent_documents` directamente por SQL; cuando T14 escriba esas acciones deberá
  manejar el error de la restricción 077 (mensaje "sin aviso vigente") como un 409/422 legible para el
  panel, no como un 500 genérico.
- Porcentaje: estricto 7 de 28 = **25,0 %** (antes 21,4 %). Ponderado: T06 pasa de 55 % a 100 % →
  1170/2800 = **≈ 41,8 %** (antes ≈ 40,2 %).

## Nota — 2026-09-30 — Hallazgo crítico: gates.sh ocultaba fallos intermedios en las puertas SQL
- **Qué pasó:** al investigar T07, una prueba de mutación deliberada (repetir el mismo `version` que ya
  usa `lifecycle.sql` en `consent_documents_lifecycle.sql`, para comprobar que el gate detecta el error)
  reveló que `sql_ciclo_de_vida_in` y `sql_guest_limit_in` ejecutaban cada `psql_in ... < archivo` como
  una sentencia bash suelta, sin `&&` ni control de código de salida. Con `set -uo pipefail` (sin `-e`),
  el fallo de un paso intermedio no detiene la función ni cambia su código de salida — el de la función
  es el del ÚLTIMO comando. Si ese último paso pasa (lo hacía), el gate completo reporta `OK` aunque un
  paso de en medio haya fallado con un error real.
- **Confirmado con la propia inyección:** con el choque de versión reintroducido a propósito, `GATES_ONLY="sql-ciclo-de-vida"`
  seguía reportando `OK` con el código sin corregir; tras encadenar con `&&`, el mismo choque produce
  `GATE sql-ciclo-de-vida: FAIL` con el error real en el log — confirma que el fallo SÍ estaba ahí antes,
  oculto, y que la corrección lo detecta.
- **Impacto en la iteración 19 (T06):** el `consent_documents_lifecycle.sql` de esa iteración reutilizaba
  `version = '1.0'`, que `lifecycle.sql` (fixture de `consent_records`) ya usa. Al correr la suite completa
  en secuencia, esa prueba nueva **fallaba de verdad** por la restricción `UNIQUE` de `version` —pero el
  "GATE sql-ciclo-de-vida: OK" reportado en esa iteración era falso: el fallo intermedio quedó oculto
  porque `admin_roles.sql` (el último paso) sí pasaba. La migración 077 y su lógica SÍ son correctas
  (lo prueba esta misma iteración, con la versión renombrada a `cdl-1.0`/`cdl-1.1`/`cdl-1.2`), pero el
  "verificado en gates.sh" de la iteración 19 no era cierto en el momento en que se escribió.
- **Corrección:** `gates.sh` (`sql_ciclo_de_vida_in`, `sql_guest_limit_in`): las llamadas a `psql_in`
  ahora se encadenan con `&&`, así el primer fallo detiene la función y propaga el código de salida real.
  `consent_documents_lifecycle.sql`: fixture renombrado de `1.0`/`1.1`/`1.2` a `cdl-1.0`/`cdl-1.1`/`cdl-1.2`
  para no chocar con el fixture de `lifecycle.sql`. Con la corrección, la suite completa (`gates.sh` sin
  filtrar) pasa de verdad — incluida la prueba de mutación que reintroduce el choque, que ahora sí falla.
- **Alcance de la duda:** este patrón (comandos sueltos sin `&&`/control de rc en una función multi-paso)
  solo existía en estas dos funciones SQL; las demás puertas (`typecheck_frontend`, `panel_e2e`, `deno_test`,
  etc.) ya usaban `&&`, un solo comando, o `rc=$?` explícito. No se auditó cada "Gates: OK" histórico de
  PROGRESS.md uno por uno (sería desproporcionado); el riesgo práctico es acotado a estas dos puertas y
  a pruebas que, como esta, reutilizan un valor `UNIQUE` ya sembrado por un archivo anterior en la misma
  secuencia — no hay indicio de que haya ocurrido antes (los archivos de prueba anteriores usan valores
  claramente distintos entre sí).
- No se marca ninguna tarea del backlog por esto: es una corrección de la propia infraestructura de
  verificación (creada en T00), no de un requisito REQ-xx/SEC-xx.

## Iteración 21 — 2026-09-30 — T07 cierre: pruebas por rol, detección de manipulación, concurrencia
- **Pasos previos (con OK explícito de la persona responsable, commits aparte):**
  1. `PLAN_PRODUCCION_074_075.md` renombrado a `PLAN_PRODUCCION_RELEASE.md` y ampliado para cubrir
     **todas** las migraciones aún sin aplicar (074–077), con tabla resumen (depende de / qué cambia /
     verificación posterior), orden real de `supabase db push` (074→075→076→077 — 076 no es del módulo
     pero viaja igual por numeración de archivo), respaldo, y reversa para 076/077. `PROMPT.md`: regla
     dura nueva — toda iteración que cree una migración debe actualizar ese plan en el mismo commit.
  2. **Hallazgo crítico de la propia infraestructura de verificación:** `sql_ciclo_de_vida_in` y
     `sql_guest_limit_in` en `gates.sh` encadenaban `psql_in ... < archivo` como sentencias sueltas, sin
     `&&`. Con `set -uo pipefail` (sin `-e`), el código de salida de la función es el del ÚLTIMO comando:
     un fallo intermedio quedaba oculto si el último paso pasaba. Se descubrió con una prueba de mutación
     deliberada (repetir a propósito el `version` que ya usa `lifecycle.sql`), que primero **no** hizo
     fallar el gate con el código sin corregir. **El "GATE sql-ciclo-de-vida: OK" de la iteración 19 (T06)
     era falso**: `consent_documents_lifecycle.sql` reutilizaba `version = '1.0'` (choque `UNIQUE` con el
     fixture de `lifecycle.sql`) y fallaba de verdad, oculto por este bug. La migración 077 y su lógica
     SÍ son correctas — lo prueba esta misma iteración, con el fixture renombrado a `cdl-1.0`/`1.1`/`1.2`
     y el gate corregido (`&&` en ambas funciones) — pero la afirmación "verificado" de la iteración 19
     no lo era en el momento en que se hizo. Commit aparte con el detalle completo del hallazgo.
- Cambios T07: `supabase/tests/consent/prereqs.sql` (`ALTER ROLE service_role BYPASSRLS`, como en
  Supabase real: sin esto, un `UPDATE` de `service_role` sobre una tabla con RLS y sin política para él
  afecta 0 filas en silencio y nunca llega al trigger — una prueba "service_role no puede mutar" habría
  pasado por la razón equivocada); `supabase/tests/consent/lifecycle.sql` (+3 bloques: roles explícitos,
  detección de manipulación, restauración); `.claude/loops/consentimiento/gates.sh`
  (`consent_records_concurrency_check`, nueva: 8 `psql` en paralelo contra el mismo contenedor).
- Pruebas añadidas: `SET ROLE authenticated` → `UPDATE`/`DELETE` fallan con `permission denied` (el
  `REVOKE` de 073); `SET ROLE service_role` → fallan con `append-only` (el trigger, alcanzable gracias al
  `BYPASSRLS` nuevo); la fila no cambió con ninguno de los dos roles. Manipulación directa (fila 3, sin
  tocar hasta ese punto, con `ALTER TABLE ... DISABLE TRIGGER` — la bandera de retención no sirve para
  esto a propósito, solo deja poner a NULL `user_id`/`ip_ciphertext`/`ua_ciphertext`, nunca `decision`):
  `verify_consent_chain()` señala exactamente la fila 3, no solo "algo roto"; se restaura y la cadena
  vuelve a estar íntegra. Concurrencia: 8 inserciones reales en paralelo (procesos `psql` distintos, no
  expresable en un único script SQL secuencial) terminan con las 8 filas y la cadena válida.
- **Rojo confirmado antes de cada pieza, con inyecciones deliberadas (todas revertidas después):**
  (1) sin `BYPASSRLS`, `SET ROLE service_role; UPDATE ...` daba `UPDATE 0` sin excepción — se habría
  "pasado" sin probar nada; con `BYPASSRLS`, la misma sentencia sí llega al trigger y da `append-only`.
  (2) el primer intento de la prueba de manipulación usó la bandera `app.allow_evidence_mutation` para
  cambiar `decision`, y falló con el error real de la propia función ("aun con la bandera solo se puede
  poner en NULL...") — confirmó que la bandera NO es el camino correcto para simular esto; se cambió a
  `DISABLE TRIGGER`. (3) la prueba de concurrencia se verificó aparte contra una copia mutada del trigger
  de cadena **sin** `pg_advisory_xact_lock` (con un `pg_sleep` para ensanchar la ventana de carrera): las
  mismas 8 inserciones paralelas rompieron la cadena de verdad (`verify_consent_chain` señaló la fila 2,
  "prev_hash no coincide") — confirma que la prueba detecta una carrera real y no es vacía. Con el
  trigger real (con el lock), la cadena queda íntegra.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e,
  deno-check, deno-test, sql-ciclo-de-vida [incluida la concurrencia], sql-guest-limit; db-reset SKIP
  explícito); `docker ps` sin contenedores de gates después.
- Desviaciones de SPEC: ninguna.
- Riesgos / pendientes detectados: (1) el alcance de la duda por el bug de `gates.sh` se acota a estas
  dos puertas SQL (las demás ya usaban `&&`, un solo comando, o `rc=$?` explícito); no se auditó cada
  "Gates: OK" histórico uno por uno, sería desproporcionado — el riesgo práctico real está limitado a
  pruebas que reutilicen un valor `UNIQUE` ya sembrado por un archivo anterior en la misma secuencia
  (no hay indicio de que ocurriera antes de la iteración 19). (2) `service_role` con `BYPASSRLS` en el
  arnés local es ahora más fiel a producción, pero conviene tenerlo presente si se añaden pruebas nuevas
  que asuman lo contrario.
- Porcentaje: estricto 8 de 28 = **28,6 %** (antes 25,0 %). Ponderado: T07 pasa de 85 % a 100 % →
  1185/2800 = **≈ 42,3 %** (antes ≈ 41,8 %).

## Nota — 2026-09-30 — Auditoría completa de gates.sh: archivos SQL, otras puertas, autoprueba

### 1) Cada archivo de prueba SQL, confirmado por separado (misma secuencia que gates.sh, mismo contenedor)
Los 10 archivos que corre `sql-ciclo-de-vida` (`prereqs.sql`, las 4 migraciones 073/074/075/077, y los 4
archivos de prueba) y los 6 que corre `sql-guest-limit` se ejecutaron uno por uno, en el mismo orden y
misma base que usa `gates.sh`, con salida completa (sin `-o /dev/null`): **los 16 terminaron en `rc=0`**.
En particular:
- `admin_roles.sql` (T04): OK.
- `guest_limit.sql` (INV-SEC): OK.
- `consent_documents_lifecycle.sql` (T06): OK — con el fixture `cdl-1.0`/`1.1`/`1.2` de la corrección de
  la iteración 21 (antes del nombre de fixture actual, esta prueba SÍ fallaba de verdad; ver la nota
  anterior de esta bitácora).
- Las de T07 (bloques nuevos en `lifecycle.sql` + `consent_records_concurrency_check` en `gates.sh`): OK.

### 2) Revisión de las demás puertas: mismo defecto (comandos encadenados sin `&&` o sin capturar rc)
Encontradas y corregidas dos más, mismo patrón que el de la iteración anterior:
- **`deno_test()`**: dos invocaciones de `$DENO test` sueltas, sin `&&` — un fallo en la primera (las
  pruebas de las funciones) quedaba oculto si la segunda (la función de diagnóstico) pasaba. Corregido
  con `&&`.
- **`lint_frontend()`**: `out="$(... 2>&1 || true)"` descartaba el código de salida real de eslint; si
  eslint fallaba por una razón AJENA a hallazgos de lint (config rota, binario ausente, crash), la
  salida no traía el resumen "N problems", `n` caía a `0` por el `${n:-0}`, y la puerta reportaba
  "NOTA: lint con 0 problemas" — un fallo real disfrazado de éxito. Corregido: se captura el código de
  salida real; si no hay resumen de problemas reconocible Y el código no es 0, es un fallo duro de la
  puerta, no "0 problemas".
- Revisadas y SIN el defecto (ya usaban `&&`, un solo comando, o `rc=$?` explícito): `typecheck_frontend`,
  `unit_frontend`, `panel_unit`, `panel_e2e`, `deno_check`, `with_pg`, `db_reset`, y las dos funciones SQL
  ya corregidas en la nota anterior.

### 3) Modo `GATES_SELFTEST=1`
Nuevo: sustituye cada una de las 10 puertas (las 9 habituales + `db-reset`, que bajo este flag corre
también) por una variante que inyecta un fallo controlado **real** (ejecuta la herramienta de verdad
contra una entrada rota — un archivo `.ts`/`.test.js`/`.spec.ts` temporal con un error genuino, una
sentencia SQL `SELECT 1/0`, o —para `panel_unit`, cuyo `npm test` corre un único archivo fijo sin
descubrimiento— un `throw` añadido al final de ese archivo real, con restauración exacta después,
incluso si el script se interrumpe). Se espera que las 10 reporten `FAIL`; si alguna reporta `OK`, la
autoprueba falla con código != 0 y señala cuál.

**Resultado, `GATES_SELFTEST=1 bash gates.sh` (corrida completa):**
```
GATE typecheck-frontend: FAIL (8s)
GATE lint-frontend:      FAIL (5s)
GATE unit-frontend:      FAIL (10s)
GATE panel-unit:         FAIL (1s)
GATE panel-e2e:          FAIL (111s)
GATE deno-check:         FAIL (3s)
GATE deno-test:          FAIL (4s)
GATE sql-ciclo-de-vida:  FAIL (4s)
GATE sql-guest-limit:    FAIL (4s)
GATE db-reset:           FAIL (0s)
AUTOPRUEBA OK: las 10 puertas detectaron su fallo inyectado y reportaron FAIL.
```
Código de salida de la autoprueba: `0` (éxito de la autoprueba misma). Verificado además que el modo
normal (sin `GATES_SELFTEST`) sigue pasando de verdad después de estos cambios (corrida completa: 9 OK,
`db-reset` SKIP como siempre), y que cada archivo/línea temporal de la autoprueba se limpia sola —
`git status` queda igual que antes de correrla, sin diffs residuales en ningún archivo tocado
(`tpotService.test.js` restaurado byte a byte).

### 4) ¿Alguna tarea cerrada con pruebas que fallan de verdad?
Ninguna, aparte de la ya encontrada y corregida en la nota anterior (T06, iteración 19 → corregida en la
misma iteración 21 en la que se descubrió). El punto 1 de esta auditoría confirma que las pruebas de T04,
T06, T07 e INV-SEC pasan de verdad hoy. No se reabre ninguna tarea en `TASKS.md`.

## Iteración 22 — 2026-09-30 — T08 cierre: numeración de casos por año y actualización acotada
- Cambios: `supabase/migrations/078_data_subject_requests_case_numbers_and_status_update.sql` (nuevo);
  `.claude/loops/consentimiento/gates.sh` (078 y `data_subject_requests_lifecycle.sql` en la secuencia de
  `sql-ciclo-de-vida`); `PLAN_PRODUCCION_RELEASE.md` (fila de 078 en la tabla resumen, orden de aplicación
  074→...→078, secciones 1/2/3/4/5/6 y "Orden del release único" actualizadas — regla del `PROMPT.md`).
- Diseño: `next_case_number()` pasa de una secuencia global (el prefijo cambiaba de año, el número nunca)
  a una tabla `data_subject_request_counters (year PK, last_number)` con `INSERT ... ON CONFLICT (year) DO
  UPDATE ... RETURNING` — atómico bajo concurrencia (upsert con bloqueo de fila), cada año empieza en
  `000001` porque es una fila nueva en la tabla, no una operación sobre la del año anterior. La secuencia
  vieja (`data_subject_request_seq`) se borra: sin otras referencias en el repo (`grep` confirmado antes).
  `update_data_subject_request_status()` sigue el mismo patrón que `unlink_user_consent_evidence` (074):
  bandera de sesión (`app.allow_case_status_update`) activada solo dentro de la función, alrededor del
  único `UPDATE` permitido, y bitácora en la misma transacción (si falla el `INSERT` a `admin_audit_log`,
  se deshace todo). El trigger bloquea `DELETE` siempre (sin excepción, a diferencia de `consent_records`
  que si tiene la retención) y, aun con la bandera, cualquier columna que no sea `status`/`resolved_at`/
  `resolution_note_ciphertext`.
- Pruebas añadidas: `data_subject_requests_lifecycle.sql` (10): dos llamadas seguidas dan `000001`/`000002`
  del año en curso; un año distinto (2019, sembrado a mano con contador en 999) no interfiere — la
  siguiente llamada real da `000003`, no `001000` (así se probó la independencia por año sin necesitar
  mockear `now()`); `UPDATE`/`DELETE` directos (sin la función) fallan con el mensaje de cada trigger;
  la función cambia `status` a `en_proceso` (sin resolver) y a `atendida` (con `resolved_at` y la nota
  cifrada), 2 filas en `admin_audit_log`; un estado fuera del `CHECK` de la tabla se rechaza (la función
  no valida aparte, confía en el `CHECK` — mismo patrón que el resto del módulo); una solicitud inexistente
  da error claro y no deja bitácora huérfana; con la bandera puesta a mano, cambiar otra columna igual
  falla; permisos (`service_role` sí ejecuta la función, `authenticated`/`anon` no, ni leen la tabla
  directamente); `verify_audit_chain()` íntegra al final.
- **Rojo confirmado antes de implementar:** contra 073+074+075+077 (sin 078), la prueba falla en el primer
  paso que usa la tabla nueva: `relation "public.data_subject_request_counters" does not exist` — la razón
  correcta, porque la migración aún no existía.
- Gates: OK (typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit, panel-e2e,
  deno-check, deno-test, sql-ciclo-de-vida [incluida la prueba nueva], sql-guest-limit; db-reset SKIP
  explícito); `docker ps` sin contenedores de gates después.
- Desviaciones de SPEC: ninguna.
- Riesgos / pendientes detectados: ninguno nuevo. `data_subject_request_counters` no tiene política RLS
  propia más allá del `REVOKE ALL` de `authenticated`/`anon` (igual que las demás tablas internas del
  módulo, pensada para leerse/escribirse solo a través de las funciones `SECURITY DEFINER`).
- Porcentaje: estricto 9 de 28 = **32,1 %** (antes 28,6 %). Ponderado: T08 pasa de 55 % a 100 % →
  1230/2800 = **≈ 43,9 %** (antes ≈ 42,3 %).

## Iteración 23 — 2026-09-30 — T00-extra: migraciones no reproducibles desde cero (propuesta, sin tocar migraciones)
- **Prioridad pedida explícitamente por la persona responsable** sobre las demás tareas desbloqueadas de `TASKS.md`.
- **Prerrequisito (iteración 5) confirmado cumplido:** las 76 migraciones (001–078, saltos ya conocidos 023 y 033) están
  todas en `supabase/migrations/` desde que `chore/baseline-produccion` se integró en `main` y se fusionó en esta rama
  (iteración 10). No es un problema de archivos faltantes.
- **Medido con `supabase db reset` real** (stack local, `major_version = 17` en `config.toml`) y con Postgres 16 puro
  (mínimo `auth` simulado, sin columna `role` preexistente): la reproducción desde cero falla **siempre** en la migración
  004, primer statement de `RLS: Extended admin access` — `ERROR: column "role" does not exist (SQLSTATE 42703)`.
  Causa exacta: `public.is_admin()` (`004_admin_center.sql:6-18`, `LANGUAGE sql`) se valida contra el catálogo EN EL
  MOMENTO de `CREATE FUNCTION` (Postgres analiza y resuelve las referencias de una función `LANGUAGE sql` al crearla,
  en cualquier versión) y referencia `users.role`; esa columna la agrega la misma migración 004 diecinueve líneas
  después (línea 26). **Corrección a la línea base anterior (T00, iteración 1):** no es específico de Postgres 17 —
  confirmado que falla igual en Postgres 16. La nota de `check_function_bodies = off` en "Cómo reproducir en local"
  (línea ~112) sigue siendo correcta como dato aislado (`SET check_function_bodies = off;` antes de 004, en la MISMA
  sesión y para ESE archivo suelto, sí evita el error — verificado con psql directo), pero **no sirve como fix para
  `supabase db reset`**, ver el punto siguiente.
- **Opción D probada y descartada (aditiva, sin tocar migraciones existentes):** se probó insertar una migración nueva
  `000_...` (ordena antes de 001 por nombre de archivo) con `ALTER DATABASE postgres SET check_function_bodies = off;`
  y, en un segundo intento, con `SET check_function_bodies = off;` a secas. Ninguna de las dos evitó el fallo en 004:
  confirmado con `supabase_migrations.schema_migrations` que la migración `000` sí se aplicó (y con `SHOW
  check_function_bodies` que quedó en `off` para la sesión psql posterior), pero el CLI de Supabase reinicia el estado
  de sesión entre archivo y archivo durante un mismo `db reset` (no es una sesión continua con `SET` heredado; probable
  `DISCARD ALL` o reconexión entre migraciones) — un ajuste de sesión hecho en un archivo anterior no le llega al
  siguiente. Se descarta esta vía; no hay forma de arreglarlo sin tocar el contenido de la migración 004 en sí, lo cual
  las REGLAS DURAS prohíben sin aprobación explícita. Detalle completo y opciones restantes (A, B, C) en **D-13**
  (`DECISIONS.md`, ABIERTA).
- **Propuesta entregada (D-13, opción recomendada A):** dump de esquema de PRODUCCIÓN (`supabase db dump
  --schema-only`, lo ejecuta la persona responsable con sus credenciales — esta sesión no tiene ni debe tener acceso a
  producción), revisado (quitar `auth`/`storage`/`realtime`/extensiones, que ya provee `supabase start`), como única
  migración nueva (`000_baseline_schema.sql` o el nombre que se acuerde); archivar 001–072 a
  `supabase/migrations_archive/` (se conservan en git, dejan de aplicarse). Verificación: `supabase db reset` local con
  la base + 073–078, volver a exportar el esquema y compararlo (diff) contra el dump de producción original. Riesgo
  documentado en D-13: desincroniza los nombres de archivo locales de `supabase_migrations.schema_migrations` en
  producción — nunca intentar `supabase db push` desde ese estado sin repararlo antes.
- **No se ha tocado ninguna migración real, ni `gates.sh`, ni se ha archivado nada.** Todos los archivos de prueba
  (`000_zzz_local_test_only.sql` y los contenedores Postgres sueltos usados para medir) se crearon fuera de
  `supabase/migrations/` real solo durante la medición y se borraron/eliminaron al terminar; `git status` queda limpio
  salvo los cambios de esta iteración (`TASKS.md`, `DECISIONS.md`, este archivo).
- Cambios: `loop-consentimiento/TASKS.md` (T00-extra marcada `[x]` con el hallazgo; nueva `T00-extra-exec` ⛔
  D-13 al final); `loop-consentimiento/DECISIONS.md` (D-13, ABIERTA); este archivo (corrección de la línea base
  de `db-reset` en la sección "Línea base de gates" — ya no dice "específico de Postgres 17").
- Pruebas añadidas: ninguna (tarea de investigación/propuesta, sin cambio de código ejecutable). Verificación empírica
  con `supabase db reset` real (dos veces) y con contenedores Postgres 16/17 sueltos (auth simulado), documentada arriba.
- **Flake detectado y descartado (no relacionado con T00-extra):** una corrida de `gates.sh` completa, hecha MIENTRAS
  varios contenedores Postgres de esta investigación seguían activos en paralelo, reportó `sql-ciclo-de-vida: FAIL` en
  la comprobación de concurrencia de `consent_records` ("la cadena quedó rota tras 8 inserciones concurrentes"). Se
  repitió la puerta aislada (`GATES_ONLY=sql-ciclo-de-vida`) y luego `gates.sh` completo, ambas veces sin ningún otro
  contenedor Docker corriendo: **OK las dos veces**. Confirmado que fue contención de recursos de Docker por mis propios
  contenedores de prueba corriendo en paralelo, no una regresión del código del módulo (no se tocó `consent_records`,
  sus triggers ni la migración 074 en esta iteración).
- Gates: OK completo al cerrar (typecheck-frontend, lint-frontend [14 = línea base, sin cambio], unit-frontend,
  panel-unit, panel-e2e, deno-check, deno-test, sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito — sigue
  así, ver arriba por qué). `docker ps -a` sin contenedores de prueba (`t00*`) al terminar; stack de `supabase start`
  detenido (`supabase stop`).
- Desviaciones de SPEC: ninguna (tarea fuera de la numeración SPEC, ver PROMPT.md).
- Riesgos / pendientes detectados: ninguno nuevo más allá de lo ya anotado en D-13. `T00-extra-exec` queda bloqueada
  hasta que un humano decida D-13 y, si es la opción A, entregue el dump de producción.
- Porcentaje: sin cambio (T00-extra es una tarea `-extra`, no cuenta en los 28 numerados; sigue en 32,1 % / ≈ 43,9 %,
  igual que la iteración 22).

## Iteración 24 — 2026-09-30 — T00-extra-exec: baseline de producción (D-13, opción A') y puerta `db-reset`
- **D-13 decidida por la persona responsable (opción A'):** el dump se guarda FUERA de `supabase/migrations/`, en
  `supabase/baseline/prod_schema.sql`; **no se archiva ni se modifica ningún archivo de `supabase/migrations/`**
  (001–072 siguen donde estaban) — a diferencia de la opción A original de T00-extra-exec, que proponía archivarlos.
  El dump (`baseline_prod_2026-09-30.sql`, 184 KB / 5314 líneas) lo generó la persona responsable fuera de esta sesión
  (`supabase db dump --schema-only --linked`, solo lectura) desde su carpeta personal; esta sesión no tuvo ni tiene
  credenciales de producción.
- **Revisión del dump (paso 1, antes de versionar nada):**
  - **Secretos: 0.** Búsqueda de patrones (claves, tokens, JWT `eyJ...`, `sk_live`/`sk_test`, `AKIA...`, bloques
    `-----BEGIN`, base64/hex largos en `DEFAULT`, correos personales) sin resultados. Lo único relacionado con secretos
    son REFERENCIAS por nombre a Supabase Vault (`app_secrets.secret_id`, `get_decrypted_secret(secret_id)`,
    `set_provider_secret(...)`, `cron_shared_secret` dentro de `dispatch_news_agent`/`dispatch_security_*`): los
    valores reales viven solo en Vault, nunca en el esquema.
  - **Datos personales: 0** (dump `--schema-only`, sin filas; los `DEFAULT` revisados uno por uno son enums/JSON
    vacíos, sin PII).
  - **Roles del sistema:** el dump no trae `CREATE ROLE`/`ALTER ROLE` (el propio `--schema-only` no los incluye); nada
    que quitar. Confirmado además que `anon`/`authenticated`/`service_role`/`postgres` ya existen en un `supabase
    start` real antes de cargar nada.
  - **`auth`/`storage`/`realtime`:** el dump no define esos esquemas (solo referencia `auth.users`, `auth.uid()`,
    `auth.role()`, `storage.buckets`, ya provistos por `supabase start`). Se quitó 1 línea real de ese tipo:
    `ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres"` (objeto de replicación gestionado por el servicio
    Realtime, no por este módulo).
  - **Extensiones gestionadas:** se quitaron las 6 líneas `CREATE EXTENSION IF NOT EXISTS` (`pg_cron`, `pg_net`,
    `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`). Verificado contra un `supabase start` real
    (`\dx` antes de cargar cualquier cosa): `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault` y `uuid-ossp`
    ya están instaladas de fábrica. `pg_cron` NO la provee `supabase start` (producción la instaló en `pg_catalog`, no
    en `extensions`, donde la crea la migración 037 local) — pero ningún objeto del dump ni de 074–078 usa el esquema
    `cron`, así que se omite sin reemplazo en vez de arrastrar esa discrepancia.
  - Todo lo anterior queda documentado también en la cabecera del propio `supabase/baseline/prod_schema.sql`.
- **Puerta `db-reset` reescrita** (`gates.sh`): ya NO llama a `supabase db reset` (que sigue sin poder reproducir
  001–072 desde cero, D-13). Contra el stack de `supabase start` YA EN MARCHA: `DROP SCHEMA public CASCADE; CREATE
  SCHEMA public;`, carga `supabase/baseline/prod_schema.sql`, compara el resultado contra ese archivo
  (`supabase db dump --local -s public` + diff, tolerando solo el ruido de formato documentado en la cabecera del
  baseline), aplica en orden 074→075→076→077→078 (lista fija en `gates.sh`, a mantener junto con
  `PLAN_PRODUCCION_RELEASE.md`) y corre `supabase/tests/consent/baseline_pending_migrations.sql` (nuevo: aserciones de
  esquema/permisos del ensayo de release — cadenas vacías, `is_current` ausente, permisos de
  `unlink_user_consent_evidence`/`update_data_subject_request_status`, RLS de `privacy_email_verifications`, trigger
  077 diferible, `GUEST_LIMIT_REACHED` en 076, `next_case_number()` = `CD-<año>-000001` desde un contador en cero). Se
  queda tras `GATES_DB_RESET=1` (sigue siendo destructiva para el `public` local, igual que antes).
  `db_reset_corrupt_hook` (no-op normalmente) se sustituye bajo `GATES_SELFTEST=1` por una que rompe el esquema de
  verdad (columna extra en `app_secrets`) justo después de cargar el baseline, para probar que la comparación de
  abajo detecta un desvío real, no un atajo.
  **Hallazgo de entorno (no relacionado con el diseño):** `psql` 10.7 (el que hay en el PATH de esta máquina) deja de
  reconocer opciones (`-v`, `-q`, `-c`, `-f`) si aparecen DESPUÉS de la URI de conexión en la línea de comandos (las
  reporta como "argumento extra" y las ignora, sin fallar con error — silenciosamente ejecuta solo `psql` sin
  opciones). Todas las llamadas de la puerta nueva ponen las opciones ANTES de la URI (`psql_db()`, helper nuevo).
- **Verificación (paso 4, obligatoria):**
  - Baseline cargado limpio sobre un `supabase start` real (Postgres 17 local): sin errores.
  - `supabase db dump --local -s public` del resultado, comparado con `supabase/baseline/prod_schema.sql`: coinciden
    salvo 2 líneas de ruido de herramienta (`CREATE SCHEMA IF NOT EXISTS "public"` + `ALTER SCHEMA "public" OWNER TO
    "postgres"` que el `pg_dump` LOCAL añade y el de producción no; `REVOKE USAGE ON SCHEMA "public" FROM PUBLIC` que
    antepone a sus `GRANT` donde producción tenía un `GRANT ... TO "postgres"` explícito — misma ACL resultante).
    Ninguna diferencia de tabla, columna, función, política ni trigger.
  - Las 5 migraciones pendientes (074–078) se aplicaron limpias y en orden sobre ese esquema (sin errores) — eso es el
    ensayo del release.
- Cambios: `supabase/baseline/prod_schema.sql` (nuevo); `.claude/loops/consentimiento/gates.sh` (puerta `db-reset`
  reescrita + `db_reset_corrupt_hook` en `GATES_SELFTEST` + mensajes de ayuda/`SKIP` actualizados);
  `supabase/tests/consent/baseline_pending_migrations.sql` (nuevo); `shield-ecuador-app/.gitignore`
  (`supabase/.branches/`, metadata local de `supabase start`/branching); `TASKS.md` (T00-extra-exec `[x]`); este
  archivo. **`supabase/migrations/` sin tocar** (confirmado con `git status` antes de commitear).
- Pruebas añadidas: `supabase/tests/consent/baseline_pending_migrations.sql` (17 aserciones sobre 074–078 aplicadas
  sobre el baseline).
- Gates: **OK completo** (`bash gates.sh`: typecheck-frontend, lint-frontend [14 = línea base], unit-frontend,
  panel-unit, panel-e2e, deno-check, deno-test, sql-ciclo-de-vida, sql-guest-limit; `db-reset` SKIP por defecto, como
  antes). Con `GATES_DB_RESET=1 GATES_ONLY=db-reset`: **OK**. Con `GATES_SELFTEST=1` completo (las 10 puertas): **OK**
  — `db-reset` detecta su fallo inyectado por la razón correcta (columna extra en `app_secrets` rompe el diff contra
  el baseline). Al terminar, se dejó el stack local en el estado canónico (baseline + 074–078 aplicadas, sin la
  columna rota de la autoprueba).
- Desviaciones de SPEC: ninguna (tarea fuera de la numeración SPEC). Desviación respecto al enunciado ORIGINAL de
  T00-extra-exec (que describía la opción A: archivar 001–072 y crear `000_baseline_schema.sql` dentro de
  `supabase/migrations/`): D-13 se decidió por la opción A', descrita arriba — el enunciado de la tarea en `TASKS.md`
  quedó desactualizado frente a D-13 y se corrigió al cerrar esta iteración.
- Riesgos / pendientes detectados: ninguno nuevo. El archivo `baseline_prod_2026-09-30.sql` en la carpeta personal de
  la persona responsable (fuera del repo) lo borra ella misma; esta sesión no lo tocó para borrarlo. Regenerar
  `supabase/baseline/prod_schema.sql` tras cada release (documentado en su propia cabecera).
- Porcentaje: sin cambio (T00-extra-exec es una tarea `-extra`, no cuenta en los 28 numerados).

## Iteración 25 — 2026-09-30 — T09: pruebas propias de `get-consent-notice` y `verify_jwt` documentado; cierra T09
- **Punto de partida:** T09 estaba "CASI" — el render de marcadores (`_shared/consent-render.ts`) y `loadPublishedNotice`
  (`_shared/consent-notice.ts`) ya tenían cobertura (`consent-render_test.ts`) y ya los reutiliza `secure-register-user`,
  pero la función `get-consent-notice` en sí no tenía ninguna prueba propia (solo un `e2e_local.cjs` manual), y
  `supabase/config.toml` no traía la entrada `[functions.get-consent-notice]` pese a que la función corre con
  `verify_jwt = false` (única excepción de SEC-01, y debía estar documentada explícitamente).
- Cambios: `supabase/functions/get-consent-notice/index_test.ts` (nuevo); `supabase/config.toml` (entrada
  `[functions.get-consent-notice] verify_jwt = false` con el motivo, junto a la de `admin-consent`); `TASKS.md` (T09
  `[x]`); este archivo.
- Pruebas añadidas (`index_test.ts`, 6, contra la función real levantada con `Deno.serve`, una Supabase falsa detrás):
  camino feliz (huella y campos verificados contra `renderConsent`/`sha256Hex` calculados de forma independiente, no
  contra el propio código de la función); la huella cambia si cambian los settings vigentes sin tocar el documento;
  sin documento publicado → 404 con el mensaje fijo, sin detalles internos; marcador desconocido y marcador conocido
  sin valor → 500 `NOTICE_INVALID` en ambos casos, comprobando que la respuesta no contiene el texto ni el nombre del
  marcador roto; método no permitido → 405; preflight `OPTIONS` → 200 con `Access-Control-Allow-Origin`.
- Gates: OK completo (`bash gates.sh`: typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit,
  panel-e2e, deno-check, deno-test [incluye las 6 pruebas nuevas], sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP
  explícito, como siempre). `deno test` del archivo nuevo corrido también de forma aislada antes de la corrida completa.
- Desviaciones de SPEC: ninguna. Se deja explícito, tal como ya anotaba TASKS.md antes de esta iteración, que la
  sanitización del Markdown (parte de SEC-08) es responsabilidad del cliente (T18, sin empezar) y que no aplica
  validación de esquema de entrada porque la función no acepta body (`GET` sin parámetros).
- Riesgos / pendientes detectados: ninguno nuevo.
- Porcentaje: estricto 10 de 28 = **35,7 %** (antes 32,1 %). Ponderado: T09 pasa de 80 % a 100 % →
  1250/2800 = **≈ 44,6 %** (antes ≈ 43,9 %).

## Iteración 26 — 2026-09-30 — T10: esquema explícito (SEC-08) en `secure-register-user`; cierra T10
- **Punto de partida:** T10 estaba "CASI" — el registro atómico, la compensación, el rate limit fail-closed y el 409 por
  huella ya funcionaban y tenían 9 pruebas. Faltaban dos cosas puntuales: (1) SEC-08 pide "validación de entrada con
  esquema (zod o equivalente ya usado en el repo)" y `secure-register-user` solo tenía validación ad hoc campo a campo;
  (2) el código de error real es `"notice_changed"` en minúscula, no `NOTICE_CHANGED` como escribe la SPEC.
- **Esquema (SEC-08):** `RegisterBodySchema` (zod 3.23.8 vía esm.sh, el mismo import y versión que ya usa
  `quiz-generator/index.ts` — "equivalente ya usado en el repo") se valida con `safeParse` justo después de leer el
  body, antes de la RPC de cuota o de cualquier llamada a la base: así un payload con forma inválida no gasta una fila
  del rate limit. Los campos quedan **opcionales** en el esquema donde el código de dominio ya toleraba su ausencia
  (`normalizeText`/`normalizeEmail` con `?? ""`) — el esquema solo rechaza **tipos equivocados** (p. ej. `email` como
  número) y **tamaños desmesurados** (topes generosos: 320/1000/200 caracteres según el campo, `decisions` acotado a
  200 elementos), nunca las ventanas finas de longitud que ya exigen `validateRegistration`/`validateConsentNotice`
  (`invalid_password` para 5 caracteres, `invalid_full_name` para vacío, huella distinta → `notice_changed`, finalidad
  obligatoria no otorgada → `missing_required_consent`). Un fallo de esquema lanza `Error("invalid_input")` y ese
  nombre se agregó a `knownValidationErrors`: cae en el mismo `catch` genérico que ya usan todos los demás rechazos de
  dominio (400, mensaje fijo), sin generar un evento `unhandled_exception` de más — ningún cambio en el contrato de
  respuesta del endpoint, solo una puerta más temprana y explícita.
- **`notice_changed` vs. `NOTICE_CHANGED` (decisión, no una D-nn porque no bloquea nada ni requiere criterio de
  negocio):** se dejó el código tal como está en producción. `frontend/src/contexts/AuthContext.tsx`,
  `RegisterScreen.tsx` y sus pruebas (`AuthContext.test.tsx`, `tests/frontend/register.spec.ts`) ya están construidos
  sobre la cadena en minúscula; normalizar el código habría significado tocar cuatro archivos y sus pruebas para
  igualar un detalle de formato que la SPEC nunca declaró como requisito de negocio (el requisito es "409 con un
  código reconocible", no una grafía concreta). Se actualizó en su lugar la tabla de funciones de `SPEC.md`
  (`secure-register-user`) para que documente el contrato real.
- Cambios: `supabase/functions/secure-register-user/index.ts` (import de `zod`, `RegisterBodySchema`, la línea de
  `safeParse`, `"invalid_input"` en `knownValidationErrors`); `supabase/functions/secure-register-user/index_test.ts`
  (+1 prueba, 4 variantes); `loop-consentimiento/SPEC.md` (nota sobre `notice_changed`); `TASKS.md` (T10
  `[x]`); este archivo.
- Pruebas añadidas: `index_test.ts` — "esquema de entrada (SEC-08): tipos equivocados o desmesurados → 400 genérico,
  sin tocar nada ni disparar unhandled_exception", con 4 variantes (`email` numérico; `consent_notice.decisions` como
  cadena en vez de arreglo; `decisions` con 201 elementos, uno más que el tope; `settings_version` como texto). Falla
  por la razón correcta: desactivé temporalmente la línea del `safeParse` (comentario `TEMP-DISABLED-FOR-VERIFICATION`,
  revertido antes de continuar) y confirmé que sin el guard esas mismas cuatro entradas ya no se rechazan por tipo o
  tamaño — una de ellas (`settings_version: 'tres'`) incluso pasa la comparación de huella y devuelve 409 en vez de
  400, la prueba lo capturó (`AssertionError: 409 !== 400`).
- Gates: OK completo (`bash gates.sh`: typecheck-frontend, lint-frontend [14 = línea base], unit-frontend, panel-unit,
  panel-e2e, deno-check [incluye el nuevo import de zod], deno-test [10/10 en `secure-register-user/index_test.ts`],
  sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito, como siempre).
- Desviaciones de SPEC: la tabla de funciones de `SPEC.md` para `secure-register-user` pasa de citar `NOTICE_CHANGED`
  a documentar `notice_changed` (minúscula), para reflejar el contrato que ya consume el frontend en producción, según
  lo explicado arriba.
- Riesgos / pendientes detectados: ninguno nuevo.
- Porcentaje: estricto 11 de 28 = **39,3 %** (antes 35,7 %). Ponderado: T10 pasa de 85 % a 100 % →
  1265/2800 = **≈ 45,2 %** (antes ≈ 44,6 %).

## Iteración 27 — 2026-09-30 — T11: `update-my-consent` y `submit-consent`; cierra T11
- **Punto de partida:** T11 sin iniciar. Ninguna de las dos funciones existía en `supabase/functions/`. Depende de T04
  (`auth-guard.ts`, hecho) y T07 (`consent_records`, hecho) — ambas desbloqueadas, siguiente tarea `[ ]` ejecutable en
  `TASKS.md`.
- **Diseño:** mismo patrón que `secure-register-user`/`get-consent-notice` (un `serve()` por archivo, cliente de
  Supabase con service role a nivel de módulo, sin DI): más cercano a lo que ya hace la Fase 3 del módulo que al
  esqueleto `handler.ts`/`index.ts` de `admin-consent` (pensado para acciones de administración con bitácora, no para
  endpoints de usuario). `_shared/consent-write.ts` (nuevo) extrae `parsePurposes` y la inserción de una fila de
  `consent_records` con IP/UA cifrados con AAD (SEC-04) — la misma forma que ya escribe `secure-register-user`, pero
  sin tocar su copia local (no es parte de esta tarea y ya tiene sus propias pruebas).
  - `update-my-consent` (REQ-08): `requireUser` (JWT del propio usuario); body `{purpose_code, action:'grant'|'revoke'}`
    validado con zod ANTES de tocar la cuota (SEC-08, mismo orden que T10); carga el aviso vigente
    (`loadPublishedNotice`) para resolver `purposes` y los campos que exige cada fila (`document_id`, `rendered_sha256`,
    `settings_version`); la finalidad obligatoria no se puede tocar por esta vía (`400 required_purpose` — retirarla
    significa pedir la baja, T13, no una fila aquí); escribe `decision='granted'|'revoked'`, `channel='mi_privacidad'`.
  - `submit-consent` (REQ-09): mismo body que el registro
    (`document_id, rendered_sha256, settings_version, decisions:[{purpose_code,decision}]`); solo tiene sentido si el
    aviso vigente se publicó con `requires_reconsent=true` — si no, `409 reconsent_not_required` sin escribir nada (no
    es un "aceptar aviso" genérico que compita con `update-my-consent` para las opcionales: decisión de contrato de API,
    no de negocio, documentada en `TASKS.md` en vez de abrir una D-nn); huella distinta a la vigente → `409
    notice_changed` (igual que el registro); finalidad obligatoria no otorgada → `400 missing_required_consent`, nada
    escrito (el frontend decide luego, con eso, si ofrece baja o cerrar sesión — REQ-09 — pero esta función no decide
    por él); si acepta, una fila por finalidad con `channel='reconsentimiento'`.
  - Ambas: rate limit fail-closed (SEC-07) con bucket de identidad = `userId` ya verificado por `requireUser` (no
    correo ni IP en claro — se pasa por el parámetro `email` de `checkRateLimit`, que solo lo usa como cadena opaca
    para el HMAC; documentado en el propio código para que no se confunda con un correo real) además del bucket de IP
    que `checkRateLimit` siempre revisa; IP exclusivamente de `getClientIp` (proxy de confianza, REQ-05), nunca del
    body.
- Cambios: `supabase/functions/_shared/consent-write.ts` (nuevo); `supabase/functions/update-my-consent/{index.ts,
  index_test.ts}` (nuevos); `supabase/functions/submit-consent/{index.ts, index_test.ts}` (nuevos);
  `.claude/loops/consentimiento/gates.sh` (`deno_check` y su copia bajo `GATES_SELFTEST` listan los dos `index.ts`
  nuevos); `TASKS.md` (T11 `[x]`); este archivo.
- Pruebas añadidas: 10 en `update-my-consent/index_test.ts` + 9 en `submit-consent/index_test.ts` (19 nuevas), contra la
  función real levantada con `Deno.serve`, con una Supabase y un JWKS falsos detrás — el JWT es real (firmado con
  `jose`), así que `requireUser` lo verifica criptográficamente, no se simula la verificación. Cubren los 3 criterios de
  aceptación de la tarea (revocar opcional → fila `revoked`; no se puede revocar la obligatoria; re-consentimiento solo
  si `requires_reconsent`) más: otorgar opcional → `granted`; finalidad desconocida → `400`; sesión anónima → `403`;
  tipos de dato inválidos rechazados ANTES de llamar a la cuota (confirmado con una bandera que detecta si se llamó);
  cuota no disponible → `503` fail-closed, nada escrito; método no permitido / preflight CORS; opcional omitida en
  `submit-consent` → `denied` por omisión; cifrado de la IP verificado desencriptándola con `decryptConsentColumn` (no
  solo "el campo no está en claro"). Dos de las comprobaciones centrales se verificaron además desactivando
  temporalmente el guard correspondiente (comentario `TEMP-DISABLED-FOR-VERIFICATION`, revertido antes de continuar):
  sin la línea `if (purpose.required) …` en `update-my-consent`, la prueba de la finalidad obligatoria falla con `200`
  en vez de `400 required_purpose`; sin la comparación de huella en `submit-consent`, la prueba de huella distinta falla
  con `200` en vez de `409 notice_changed` — ambas por la razón correcta, ambas revertidas y vueltas a pasar antes de
  cerrar la tarea.
- Gates: **OK completo** (`bash gates.sh`: typecheck-frontend, lint-frontend [14 = línea base, sin cambio], unit-frontend,
  panel-unit, panel-e2e, deno-check [incluye los 2 `index.ts` nuevos], deno-test [19 pruebas nuevas, total del paquete],
  sql-ciclo-de-vida, sql-guest-limit; db-reset SKIP explícito, como siempre).
- Desviaciones de SPEC: ninguna. Decisión de contrato de API (no de negocio, no requiere D-nn): `submit-consent`
  rechaza con `409 reconsent_not_required` cuando el aviso vigente no exige reconsentimiento, documentada en `TASKS.md`
  junto a T11.
- Riesgos / pendientes detectados: ninguno nuevo. Pendiente natural para T19 (frontend "Mi privacidad") y T20
  (re-consentimiento al iniciar sesión): ambos endpoints ya existen y están probados, pero nada en el frontend los
  llama todavía.
- Porcentaje: estricto 12 de 28 = **42,9 %** (antes 39,3 %). Ponderado: T11 pasa de 0 % a 100 % →
  1365/2800 = **≈ 48,8 %** (antes ≈ 45,2 %).
