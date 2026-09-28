# PROGRESS — Módulo de Consentimiento Informado y Derechos del Titular

Última actualización: 2026-09-28. Fuente de requisitos: SPEC v1.0 (REQ-01…20, SEC-01…09).
`TASKS.md` no estaba en la máquina cuando se escribió esto: el porcentaje contra TASKS.md queda pendiente
y las tareas nuevas de abajo hay que trasladarlas a él.

## Estado (estimación contra la SPEC, no contra TASKS.md)
- ~39 % escrito · ~19 % en producción (solo Fase 0; la 074 y la Fase 1 NO están desplegadas).
- Verificado con pruebas automáticas: cripto+AAD, cuota fail-closed, evidencia, registro de punta a punta,
  ciclo de vida SQL (073+074) y una prueba de punta a punta contra Supabase local (21/21).

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Esquema 073, roles, cripto, cadenas de hash | Aplicada en producción. Tiene 3 defectos (ver "Abiertos") |
| 0.1 | Migración 074 (baja/retención sin romper la cadena) | Escrita y probada; **NO aplicada a producción** (pendiente de visto bueno) |
| 1 | Registro con aviso primero, evidencia atómica, AAD, fail-closed | Escrita y probada en local; **NO desplegada** (no hay aviso publicado en producción) |
| 2 | Mi privacidad, reconsentimiento, solicitudes de derechos | No iniciada |
| 3 | Panel administrativo (8 pestañas), roles individuales | No iniciada |
| 4 | Retención, purga a 5 años, verificación programada | No iniciada |
| 5 | Documentación (H14) | No iniciada |

## Mapa del repo (todo bajo `shield-ecuador-app/`)
**Base de datos**
- `supabase/migrations/073_consent_module_foundation.sql` — tablas, RLS, triggers, cadenas de hash.
- `supabase/migrations/074_consent_evidence_unlink_and_stable_hash.sql` — hash estable, sin cascada, `unlink_user_consent_evidence()`.
- `supabase/tests/consent/{prereqs,lifecycle}.sql` — prueba SQL autoverificable (Postgres 16 vacío).
- `supabase/tests/consent/e2e_local.cjs`, `e2e_decrypt.ts` — punta a punta contra Supabase local.

**Funciones (Deno)**
- `functions/get-consent-notice/` — aviso publicado con marcadores resueltos + huella.
- `functions/secure-register-user/` — registro con `consent_notice` + `age_gate`; 503 fail-closed; compensación.
- `functions/_shared/crypto.ts` — AES-GCM + HMAC, AAD opcional, versionado de clave.
- `functions/_shared/consent-evidence.ts` — cómo se ata cada cifrado a su fila (AAD) y helpers de lectura (`allowLegacy:false`).
- `functions/_shared/consent-render.ts` — marcadores `{{…}}` y SHA-256 (misma función para vista previa y publicación).
- `functions/_shared/client-ip.ts` — IP de confianza (T03), normalización IPv4/IPv6.
- `functions/_shared/rate-limit.ts` — cuota; `failClosed` opt-in. `security-events.ts`, `pii.ts` existían sin versionar.
- Pruebas: `*_test.ts` junto a cada módulo (40 pruebas).

**Frontend**: `src/screens/RegisterScreen.tsx` (aviso primero), `src/contexts/AuthContext.tsx` (`signUp` con consentimiento, errores con `.code`), `src/index.css` (`.consent-*`), `tests/frontend/register.spec.ts`.

**Herramientas**: `.claude/loops/consentimiento/gates.sh` (Deno 2.9.6 fijado + SQL en Postgres efímero). Playwright: `CLAUDECODE=1` ⇒ reporter `line` y timeout 60 s.

## Decisiones tomadas
- D-01 login individual solo para este módulo (`admin_roles`). D-02 evidencia 5 años tras la baja. D-03 días calendario.
  D-04 menores de 15: bloqueo + instrucciones al correo de privacidad.
- El aviso es la primera pantalla del registro; rechazar devuelve a la portada.
- AAD de `consent_records` anclada en `user_ref_hmac` (no `user_id`, que pasa a NULL tras la baja); la de
  `data_subject_requests`, en el UUID de la fila, generado en la función antes del insert.
- Registro en fail-closed (T10): 503 `RATE_LIMIT_UNAVAILABLE`. Contadores reiniciados: no importa.
- Formato de cifrado: el JSON existente `{v,alg,iv,tag,ct}` (+ `aad:true`), no `v{n}.iv.ct`.

## Historial de sesión
1. Fase 0: esquema + cripto, probados en Postgres 16 real; aplicados a producción (`db push` + secreto `LOOKUP_HMAC_KEY_B64`).
2. Fase 1: `get-consent-notice`, `secure-register-user`, `RegisterScreen`; 11/11 Playwright en pixel-7, iPhone SE (WebKit) y desktop-chrome.
3. Bug hallado: el 409 llegaba como `error` de supabase-js, no como `data` → `.code` nunca se asignaba. Corregido.
4. SEC-04 (AAD) y SEC-07 (fail-closed) con pruebas Deno; mutaciones deliberadas confirmaron que las pruebas detectan la rotura.
5. Commits: helpers existentes (`1309559`), Fase 1 WIP (`3cd0989`), prueba de camino feliz (`70b704f`), 074 + gates (`ad9a283`), IP de confianza (siguiente).
6. Probando 073 en Postgres real: borrar un usuario con evidencia fallaba y la retención rompía la cadena → 074.
7. **Incidente**: `supabase start` llenó `C:` (0 MB libres); Docker quedó colgado y una capa de `storage-api` quedó a 0 bytes. Se recuperó
   reiniciando Docker Desktop, borrando y re-bajando esa imagen. `cyber-risk-db` sobrevivió.
8. Punta a punta contra Supabase local: 21/21, con dos fallos que los mocks no veían (ver hallazgos 1 y 2 de "Corregidos").

## Corregidos en esta sesión
1. `get-consent-notice` no devolvía `privacy_email` (lo usa la pantalla de menores).
2. La IP de la evidencia salía de la primera entrada de `X-Forwarded-For` (falsificable). Ahora, la que añade el proxy.

## Abiertos
1. **`privacy_settings` no se puede versionar (073).** El trigger bloquea todo `UPDATE`, así que no se puede bajar `is_current` de la fila
   vieja (la versión 2 viola el índice único) ni guardar la verificación de correo pendiente (REQ-15). Falta una función SECURITY DEFINER
   o permitir solo esos campos. Bloquea REQ-14/15, no la Fase 1.
2. **T03 en producción sin medir.** `TRUSTED_PROXY_HOPS` vale 1 por defecto (correcto en local). En Supabase hospedado hay que medirlo con una
   función de diagnóstico; un valor equivocado guarda la IP de un proxy.
3. **Rate limit y `security_events` existentes usan la primera entrada de `X-Forwarded-For`**: un cliente puede rotarla y evadir el límite por
   IP (también el del registro). No cambiado: con la topología equivocada todos compartirían un bucket. Va junto con el punto 2.
4. **Aviso real**: sin texto no hay nada que publicar; en local se usó un aviso de PRUEBA. Sin publicar no se puede desplegar Fase 1.
5. **074 sin aplicar a producción.** Trae una guarda: aborta si `consent_records` ya tuviera filas.
6. `get-consent-notice` tiene prueba de punta a punta (local) pero no una prueba Deno propia.
7. Migraciones 030-058 y 069-072, `pii.ts` y otras funciones nunca se versionaron. Las migraciones antiguas no se reproducen desde cero en
   Postgres 17 (004 define una función SQL antes de crear la columna que usa).
8. Falta SEC-07 en los endpoints de Fase 2 (los helpers existen), SEC-08 (zod), SEC-09 (correos).

## Tareas añadidas (trasladar a TASKS.md)
- **T02-extra** — Migrar `users.email_encrypted` y `full_name_encrypted` a AAD (`users:<columna>:<user_id>`) cuando se actualicen sus
  lectores (`pii.ts`, `get-ranking` y copias inline). Re-cifrado por lotes; leer con y sin AAD durante la transición.
- **T03-prod** — Medir la cabecera de IP en Supabase hospedado y fijar `TRUSTED_PROXY_HOPS`; después, unificar `extractClientIp`.
- **T14-fix** — Versionado de `privacy_settings` (abierto 1).

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
