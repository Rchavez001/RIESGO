# PROGRESS — Módulo de Consentimiento Informado y Derechos del Titular

Última actualización: 2026-09-28 (tarde). Fuente de requisitos: SPEC v1.0 (REQ-01…20, SEC-01…09).
**`TASKS.md`, `DECISIONS.md` y el seed real del aviso NO están en la máquina** (se buscó en el repo, Descargas, Documentos y Escritorio;
solo existen `gates.sh`, este archivo, `PLAN_PRODUCCION_074_075.md` y `diag/`, creados por Claude). Sin ellos no se puede dar el porcentaje
contra TASKS.md ni cargar el aviso real: en local sigue el aviso de PRUEBA. Las tareas nuevas de abajo están listas para trasladar.

## Estado (estimación contra la SPEC, no contra TASKS.md)
- ~42 % escrito contra la SPEC · ~19 % en producción (solo Fase 0; 074, 075 y Fase 1 NO están desplegadas).
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
