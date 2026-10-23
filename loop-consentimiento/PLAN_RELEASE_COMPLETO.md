# Runbook completo del release — módulo de Consentimiento Informado LOPDP

**Estado: NO EJECUTADO.** Este documento ordena, en una sola secuencia, todo lo que hace falta para
llevar el módulo a producción: lo que ya cubría `PLAN_PRODUCCION_RELEASE.md` (solo base de datos,
migraciones 074–084) más Edge Functions, panel, frontend, publicación del aviso 1.0 y el backfill
T25. Nada de esto se ejecuta hasta que la persona responsable lo autorice **paso por paso**: cada
sección dice explícitamente quién lo ejecuta.

**Convención de esta página:** cada paso lleva `[TÚ]` (lo ejecuta la persona responsable, nunca el
loop ni esta sesión), `[YA HECHO]` (verificado en esta sesión, con su commit) o `[FALTA]` (no existe
todavía — no se puede ejecutar hasta resolverlo). Proyecto Supabase `wbbcjiqzbzswxsmwjqlw`; proyecto
GCP `polar-plate-499719-r1` (`GUIA_LEVANTAMIENTO_PROYECTO.md`).

---

## 0. Requisitos previos (bloqueos que deben resolverse ANTES de abrir la ventana de release)

Ninguno de estos lo puede resolver una sesión de este loop — todos exigen criterio o acceso de la
persona responsable. **Si alguno sigue abierto, no se continúa con la sección 1.**

| # | Bloqueo | Qué falta | Dónde está |
|---|---|---|---|
| 1 | **D-07 — Responsable legal y datos del aviso** | `ABIERTA`. El aviso v1.0 tiene marcadores `[por completar]` (responsable, domicilio, teléfono, delegado). El sistema no permite publicar con marcadores sin resolver (`consent-render.ts` falla si quedan `unresolved`), así que esto bloquea el paso 7 de este runbook, no el código. | `DECISIONS.md` D-07 |
| 2 | **D-08 — Cabecera de IP en Supabase hospedado** | `ABIERTA`. Sin medirla, `TRUSTED_PROXY_HOPS` se queda en su valor por defecto (`1`), que puede estar mal si el hospedado tiene un proxy delante (p. ej. Cloudflare) — registraría la IP de un proxy, no la del titular, en la evidencia de consentimiento y en el rate limit. Método: Logs Explorer del panel de Supabase sobre `function_edge_logs`, sin desplegar nada; solo si no alcanza, una función de diagnóstico temporal (`loop-consentimiento/diag/README.md`). | `DECISIONS.md` D-08 |
| 3 | **D-10 — Confirmación de asesoría legal** | D-10 ya está `DECIDIDA` (Opción A: historial `legacy-2026-06-22` + `requires_reconsent=true`), pero su texto cierra con "Pendiente de confirmación por asesoría legal antes del release". Confirmar que sigue de acuerdo antes de publicar. | `DECISIONS.md` D-10 |
| 4 | **D-02 — Plazos de conservación** | `ABIERTA`. Bloquea **T17** (REQ-19/REQ-20: job de retención de IP/UA y seudonimización tras baja) — hoy NINGUNA de las dos existe. El release puede salir sin T17 (no es un REQ que bloquee el resto), pero hay que decidir y documentar que se sale así, a sabiendas. | `DECISIONS.md` D-02; `TASKS.md` T17 |
| 5 | **TOTP en producción** | Sin verificar en esta sesión. D-01 exige que los roles del módulo (`privacy_editor`/`privacy_admin`/`privacy_auditor`) solo se concedan a cuentas con segundo factor (TOTP) verificado — `requireRole` exige `aal2` en el JWT. Confirmar en el panel de Supabase Auth del proyecto hospedado que TOTP está habilitado como factor y que las cuentas que recibirán rol admin ya lo configuraron. | `_shared/auth-guard.ts` (`mfa_required`); D-01 |
| 6 | **Cuentas de admin con roles** | `admin_roles` nace vacía (migración 073 no inserta nada: a diferencia de `privacy_settings`, que sí trae una fila placeholder). No existe ninguna ruta de auto-alta — alguien con acceso directo a la base (SQL Editor del panel, nunca desde el cliente: `REVOKE INSERT ON admin_roles FROM authenticated, anon`) debe decidir quién recibe qué rol y ejecutar el INSERT. Ver paso 1 abajo. | migración 073 (`admin_roles`) |
| 7 | **Secretos y variables a crear** | Ver tabla siguiente. |

### Secretos y variables de entorno

| Variable | ¿Ya existe en el proyecto hospedado? | Acción |
|---|---|---|
| `PII_ENCRYPTION_KEY_B64` / `PII_KEY_VERSION` | Probablemente SÍ — la PII base del repo (`users.email_encrypted`, etc.) ya los usa desde antes del módulo. **Confirmar**, no asumir. | `[TÚ]` confirmar con `supabase secrets list --project-ref wbbcjiqzbzswxsmwjqlw` (solo lista nombres, no valores) |
| `LOOKUP_HMAC_KEY_B64` | **NO existe en ningún entorno** (ni local real ni hospedado) — confirmado en `SECURITY_PRIVACY.md`, "Secretos nuevos a provisionar antes del release". Debe ser **distinta** de `PII_ENCRYPTION_KEY_B64` (H15). | `[TÚ]` generar 32 bytes aleatorios en base64 y `supabase secrets set` |
| `SECURITY_EVENTS_HMAC_KEY` | Probablemente SÍ (la tabla `security_events` de la línea base ya la usa). **Confirmar.** | `[TÚ]` confirmar |
| `TRUSTED_PROXY_HOPS` | No crítico mientras sea `1` (su valor por defecto) y D-08 no esté medido; si D-08 concluye un valor distinto, crearla con ese valor. | `[TÚ]` después de D-08 |
| `resend_api_key` (en `app_secrets`, Vault) | Ya existe (lo usan `championship-draw-round1`/`check-security-alerts`, D-05). **Confirmar remitente y dominio verificado (SPF/DKIM)** antes de depender de él para avisos del módulo — D-05 lo deja como pendiente explícito. | `[TÚ]` confirmar en el panel de Resend |
| `PII_MIGRATION_SECRET` | Solo si se usa `migrate-user-pii` en este release (no es parte del módulo de consentimiento). | No aplica a este release salvo que se decida lo contrario |

**Generar una clave nueva (PowerShell, nunca pegada en esta sesión):**
```powershell
$rng = [Security.Cryptography.RNGCryptoServiceProvider]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```
```bash
supabase secrets set LOOKUP_HMAC_KEY_B64="<valor generado>" --project-ref wbbcjiqzbzswxsmwjqlw
```
**Verificar después:** `supabase secrets list --project-ref wbbcjiqzbzswxsmwjqlw` debe listar `LOOKUP_HMAC_KEY_B64` (sin mostrar el valor). **Revertir:** `supabase secrets unset LOOKUP_HMAC_KEY_B64 --project-ref wbbcjiqzbzswxsmwjqlw` — seguro mientras ninguna función que la lea esté desplegada todavía (si ya lo está, desplegarla da error en cualquier escritura de evidencia; no se pierden datos, pero el módulo deja de poder escribir hasta restaurar la clave).

### Dato que necesito de ti sobre el despliegue del frontend/panel

No puedo confirmar desde el código cómo se despliega **hoy realmente** `cyberdojo` (frontend) en
Cloud Run: `GUIA_LEVANTAMIENTO_PROYECTO.md` documenta que no hay `Dockerfile` y que el despliegue usa
buildpacks (`gcloud run deploy --source .` detecta `"gcp-build": "npm run build"` en
`frontend/package.json`), **pero hoy existe `frontend/Dockerfile`** (añadido después, según
`PROGRESS.md`/`TASKS.md` REPO-UNIF, copiado desde `CyberDojo.git`). Si Cloud Build ve un `Dockerfile`
en el directorio fuente, **lo usa en vez de buildpacks** — y ese `Dockerfile` espera
`REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY` como `--build-arg`, que el comando documentado
(`gcloud run deploy cyberdojo --source frontend --region us-central1 --allow-unauthenticated`) **no
pasa**. Antes del paso 7 de este runbook necesito que confirmes:
1. ¿El despliegue real de `cyberdojo`/`cyberdojo-admin` hoy usa ese `Dockerfile` o sigue en buildpacks? (`gcloud run services describe cyberdojo --region us-central1 --format='value(status.latestCreatedRevisionName)'` y revisar el build en Cloud Build History puede confirmarlo.)
2. Si usa el `Dockerfile`: ¿de dónde toma hoy los valores de `REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY`? (¿un trigger de Cloud Build con sustituciones, un comando manual con `--build-arg` que no está en el repo, otra cosa?)
3. ¿Existe algún trigger de Cloud Build/CI conectado a una rama, o todos los despliegues son manuales como dice `ARQUITECTURA_CYBER_DOJO.md`?
4. Nombre exacto del servicio, región y el dominio/URL pública actual (para las pruebas de humo del paso 11).

Mientras no confirmes esto, el paso 7 de este runbook usa el comando **documentado** (puede no ser
exacto si el `Dockerfile` cambió el comportamiento sin actualizar la guía).

---

## 1. `[TÚ]` Elegir ventana y dar de alta a los primeros administradores

**Comando (SQL Editor del panel de Supabase, proyecto hospedado — nunca desde esta sesión):**
```sql
-- Sustituye el UUID por el id real de auth.users de cada persona (ya debe tener TOTP configurado).
insert into public.admin_roles (user_id, role, granted_by) values
  ('00000000-0000-0000-0000-000000000000', 'privacy_admin', '00000000-0000-0000-0000-000000000000');
-- Repetir una fila por persona/rol. Una persona puede tener varias filas (varios roles).
```
**Verificar después:** `select user_id, role from public.admin_roles;` lista exactamente a quien
decidiste, con el rol correcto. Que esa persona pueda iniciar sesión en `cyberdojo-admin` y ver la
sección "Consentimiento informado" con sus candados correctos (`privacy_editor` no ve "Publicar"/
configuración de responsable; `privacy_auditor` solo lee) — probarlo **después** del paso 6 (panel
desplegado).
**Revertir:** `delete from public.admin_roles where user_id = '<uuid>' and role = '<rol>';` — trivial,
no hay nada más que dependa de esta fila salvo la propia sesión de esa persona en el panel.

## 2. `[TÚ]` Respaldo (obligatorio, antes de tocar nada de producción)

Repite la sección 2 completa de `PLAN_PRODUCCION_RELEASE.md` (dump de esquema + datos, cifrado,
copiado fuera de esta máquina, verificado con `sha256sum`, con al menos 2 GB libres en disco). No se
repite aquí para no tener dos copias que puedan desalinearse — ese documento es la fuente de verdad
para el respaldo. Resumen de los comandos:
```bash
cd shield-ecuador-app
supabase db dump -f ../backup_pre_release_esquema.sql
supabase db dump --data-only -f ../backup_pre_release_datos.sql
sha256sum ../backup_pre_release_*.sql > ../backup_pre_release.sha256
```
**Verificar después:** el archivo no está vacío/truncado (`grep -c "^COPY public\." backup_pre_release_datos.sql` da un número > 0), el `sha256` coincide tras copiarlo fuera de esta máquina, y la copia externa quedó confirmada por una segunda persona o un segundo canal.
**Revertir:** no aplica (el respaldo no modifica nada); si el respaldo falla o queda incompleto, **no se avanza al paso 3**.

## 3. `[TÚ]` Vincular el proyecto (ventana acotada)

```bash
cd shield-ecuador-app
supabase link --project-ref wbbcjiqzbzswxsmwjqlw
```
**Verificar después:** `supabase migration list` muestra `073` en local y remoto, `074`-`084` solo
en local — 084 es la migración de T25 (paso 9: `ip_hmac` nullable para filas legacy).
**Revertir/cerrar:** `supabase unlink` al terminar los pasos que necesitan el CLI vinculado (4 y 5;
ver el paso 5 para el cierre exacto) — esta máquina no debe quedar vinculada a producción entre
sesiones.

## 4. `[TÚ]` Aplicar las migraciones 074–084

Sigue la sección 3 completa de `PLAN_PRODUCCION_RELEASE.md` (comando único, lista exacta esperada,
cada migración en su propia transacción). Resumen:
```bash
supabase db push
# Debe listar EXACTAMENTE: 074_consent_evidence_unlink_and_stable_hash.sql,
# 075_privacy_settings_versioning.sql, 076_learning_guest_limit.sql,
# 077_consent_documents_no_gap_on_retire.sql,
# 078_data_subject_requests_case_numbers_and_status_update.sql,
# 079_email_transport_and_outbox.sql, 080_publish_consent_document_atomic.sql,
# 081_fix_digest_schema_qualification.sql, 082_confirm_privacy_email_change_atomic.sql,
# 083_guest_consent_notice_and_session_expiry.sql,
# 084_consent_records_legacy_ip_hmac_nullable.sql. Si lista algo más o menos: PARAR.
```
**Verificar después:** sección 4 completa de `PLAN_PRODUCCION_RELEASE.md` (una consulta por
migración: `verify_consent_chain()`/`verify_audit_chain()` vacíos, columnas/triggers/funciones
esperados, permisos por rol). No se repiten aquí las ~15 consultas para no desalinearlas de la
fuente — ejecutar las de ese documento tal cual.
**Revertir:** sección 6 de `PLAN_PRODUCCION_RELEASE.md`, migración por migración — válida SOLO
mientras `consent_records` siga vacía (si el paso 8 ya publicó el aviso y hay evidencia real, no se
revierte: se corrige hacia delante).

### `[YA HECHO]` — la migración (a) de T25 ya existe y está probada

`084_consent_records_legacy_ip_hmac_nullable.sql` (`ip_hmac` nullable solo para filas
`document_version LIKE 'legacy-%'`, D-11 opción 1-A) y su prueba
(`supabase/tests/consent/legacy_ip_hmac_nullable.sql`) ya están escritas y verificadas contra
Postgres real (`gates.sh --only sql-ciclo-de-vida`, OK). El paso 9 ya puede ejecutarse en cuanto
esta migración esté aplicada en producción (parte del `db push` de este mismo paso 4).

---

## 5. `[TÚ]` Desplegar las Edge Functions del módulo

Lista **exacta** (solo las que el módulo creó o modificó; el resto de `supabase/functions/` no se
toca en este release):

| # | Función | Estado | Notas |
|---|---|---|---|
| 1 | `get-consent-notice` | nueva | pública, `verify_jwt = false` (la única excepción documentada) |
| 2 | `secure-register-user` | modificada (REQ-06/07) | sigue con `verify_jwt` por defecto; la versión desplegada hoy es anterior a esta, confirmar con `supabase functions list` qué versión corre antes de reemplazarla |
| 3 | `submit-consent` | nueva | reconsentimiento (REQ-09) |
| 4 | `update-my-consent` | nueva | "Mi privacidad" (REQ-08) |
| 5 | `admin-consent` | nueva | todo el panel admin del módulo (REQ-13/16/17/18/21) |
| 6 | `request-data-subject-right` | nueva | solicitudes de derechos (REQ-10) |
| 7 | `accept-guest-notice` | nueva — **solo si el modo invitado entra en este release** (ver nota abajo) | T19b Paso 2B; exige sesión anónima real |

**Comando (uno por función, o todas con `--project-ref` ya vinculado del paso 3):**
```bash
cd shield-ecuador-app
supabase functions deploy get-consent-notice --project-ref wbbcjiqzbzswxsmwjqlw
supabase functions deploy secure-register-user --project-ref wbbcjiqzbzswxsmwjqlw
supabase functions deploy submit-consent --project-ref wbbcjiqzbzswxsmwjqlw
supabase functions deploy update-my-consent --project-ref wbbcjiqzbzswxsmwjqlw
supabase functions deploy admin-consent --project-ref wbbcjiqzbzswxsmwjqlw
supabase functions deploy request-data-subject-right --project-ref wbbcjiqzbzswxsmwjqlw
# Solo si el modo invitado entra en este release (ver nota):
supabase functions deploy accept-guest-notice --project-ref wbbcjiqzbzswxsmwjqlw
```
**Nota sobre el modo invitado:** `PLAN_PRODUCCION_RELEASE.md` deja `accept-guest-notice` y el modo
invitado "fuera de esta ventana" salvo decisión explícita en contra. Si decides incluirlo: 1) el
texto de `GuestNoticeModal.tsx` sigue **PROVISIONAL** — reemplázalo con el texto definitivo y
redespliega el frontend (paso 7) antes de activar `enable_anonymous_sign_ins`; 2) activar
`enable_anonymous_sign_ins = true` es un cambio en el panel de Supabase Auth (Authentication →
Providers → Anonymous), **no en `config.toml`** (ese archivo solo gobierna el entorno local) — hazlo
DESPUÉS de desplegar `accept-guest-notice`, nunca antes (si no, hay una ventana donde se crean
sesiones anónimas sin el endpoint que registra su evidencia).

**Verificar después (por función):**
```bash
supabase functions list --project-ref wbbcjiqzbzswxsmwjqlw   # las 6-7 aparecen, versión incrementada
```
Prueba de humo por función (con `curl`, sin credenciales reales en esta sesión — ejecútalas tú):
- `get-consent-notice`: `GET` sin token → 200 con el aviso (o 404 si aún no hay nada publicado — normal antes del paso 8).
- `submit-consent`/`update-my-consent`/`admin-consent`/`request-data-subject-right`: `POST` sin token → 401 `missing_token` (nunca 404 ni 500).
- `accept-guest-notice` (si aplica): `POST` sin token → 401; con un JWT no-anónimo (de una cuenta real) → 403 `not_anonymous_session`.
- `secure-register-user`: confirmar que la función corriendo es la nueva (compara el hash/tamaño con `supabase functions download secure-register-user` a una carpeta aparte, diff contra el árbol).

**Revertir:** `supabase functions deploy <nombre> --project-ref wbbcjiqzbzswxsmwjqlw` con el commit
anterior en el árbol de trabajo (`git checkout <commit-anterior> -- supabase/functions/<nombre>`,
desplegar, luego deshacer el checkout) — cada función es independiente; revertir una no afecta a las
demás. Si `accept-guest-notice` ya se desplegó y se activó `enable_anonymous_sign_ins`, desactívalo
primero (panel de Auth) antes de retirar la función — si no, las sesiones anónimas nuevas no podrían
registrar su evidencia.

Cierra aquí la parte que necesita el CLI vinculado:
```bash
supabase unlink
```

---

## 6. `[TÚ]` Desplegar el panel (`cyberdojo-admin`)

Comando documentado (`GUIA_LEVANTAMIENTO_PROYECTO.md`; confirmar que sigue siendo así, ver sección 0):
```bash
gcloud config set project polar-plate-499719-r1
gcloud run deploy cyberdojo-admin --source central-admin-app --region us-central1 --allow-unauthenticated
```
`central-admin-app/server.js` lee `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` como
variables de entorno de Cloud Run (no build args) — si el servicio ya existe, Cloud Run conserva las
que ya estaban configuradas; no hace falta volver a pasarlas salvo que hayan rotado.
**Verificar después:** entrar al panel con la cuenta de un `privacy_admin` recién dado de alta (paso
1) + TOTP; ver la sección "Consentimiento informado" con sus 8 pestañas (REQ-13); los candados por
rol (`privacy_editor` no ve "Publicar"/configuración de responsable; `privacy_auditor` solo lee) se
comportan según `MANUAL_ADMINISTRADOR.md` sección 14.
**Revertir:** `gcloud run services update-traffic cyberdojo-admin --to-revisions <revisión-anterior>=100 --region us-central1` (Cloud Run conserva revisiones anteriores; no hace falta volver a construir nada).

## 7. `[TÚ]` Desplegar el frontend (`cyberdojo`)

**Depende de las respuestas de la sección 0** ("Dato que necesito de ti..."). Comando documentado,
a confirmar o corregir con lo que respondas:
```bash
gcloud run deploy cyberdojo --source frontend --region us-central1 --allow-unauthenticated
# Si el Dockerfile está en uso y antes no se pasaban --build-arg, probablemente haga falta:
#   --build-arg REACT_APP_SUPABASE_URL=<url> --build-arg REACT_APP_SUPABASE_ANON_KEY=<anon-key>
# (ninguno de los dos es secreto: REACT_APP_SUPABASE_ANON_KEY ya es pública por diseño de Supabase;
# aun así, no se pegan aquí — los tienes en el panel de Supabase, Settings → API).
```
**Verificar después:** abrir la URL pública; `/registro` carga `RegisterScreen`; la landing
cinematográfica y "Probar sin cuenta" siguen funcionando (si el modo invitado NO entra en este
release, "Probar sin cuenta" debe seguir mostrando el modo invitado existente hasta que decidas
apagarlo — ver nota del paso 5); consola del navegador sin errores 404 de chunks (build nuevo
coherente).
**Revertir:** igual que el panel — `gcloud run services update-traffic cyberdojo --to-revisions <revisión-anterior>=100 --region us-central1`.

---

## 8. `[TÚ]` Publicar el aviso 1.0 con los datos reales

**Requiere:** D-07 resuelta (datos reales del responsable/delegado, sin marcadores `[por
completar]`); panel desplegado (paso 6); al menos una persona `privacy_admin` (paso 1).

1. En el panel → Consentimiento informado → Configuración: completar responsable, domicilio,
   teléfono, correo de privacidad, delegado (REQ-14). Guardar crea una `settings_version` nueva.
2. → Versiones → "Nueva versión" (clona el borrador placeholder de la migración 073) → Editor:
   pegar el contenido de `loop-consentimiento/seed/aviso_consentimiento_v1.0.md` (sin los bloques
   `<!-- PROPUESTA DE TEXTO NUEVO -->` sin resolver por legal, si D-07/asesoría legal así lo exige) y
   las finalidades del bloque "FINALIDADES" del mismo archivo.
3. Marcar `requires_reconsent = true` (D-10: todos deben aceptar el 1.0 en su próximo ingreso).
4. → Publicar, con motivo y (si `four_eyes_publish = true`) confirmación de una segunda persona.
**Verificar después:** `get-consent-notice` (GET, sin token) devuelve el documento con
`rendered_md` sin marcadores sin resolver y `requires_reconsent: true`; probar la prueba funcional
pendiente de la migración 077 (sección 4 de `PLAN_PRODUCCION_RELEASE.md`): con un segundo borrador
listo, retirar la v1.0 sin publicar el reemplazo en la misma operación debe fallar.
**Revertir:** → Versiones → Retirar (con motivo) — el documento retirado sigue existiendo como
historial, nunca se borra; si ya hubo evidencia real contra la v1.0, no se "deshace" nada, se
publica una v1.1 corregida.

## 9. `[TÚ]` Backfill T25 (consentimiento legacy)

**Requiere:** D-10/D-11 decididas (ya lo están); migración 084 aplicada (paso 4); `LOOKUP_HMAC_KEY_B64`
ya provisionada (paso 0); al menos una cuenta con `role = 'admin'` en `public.users` (el script la
usa como `created_by` del documento legacy — si no existe ninguna todavía, falla con un mensaje
claro, sin escribir nada).

`scripts/backfill-legacy-consent.cjs` ya está escrito y probado: pruebas con cliente falso (dry-run
no escribe, clasificación A/B/C, HMAC, documento siempre `retired`) y una prueba de integración
contra Postgres real del stack local (`RUN_REAL_PG=1 node scripts/backfill-legacy-consent.test.cjs`,
confirmada en esta sesión — `--apply` dos veces es idempotente, la fila queda sin IP/UA). Esa prueba
de integración deja residuo permanente en el stack LOCAL (ver el bloque "Revertir" abajo: la
evidencia es append-only por diseño, ni el script de prueba puede borrarla) — nunca se corre contra
un proyecto real.

```bash
cd shield-ecuador-app
# Variables SOLO en esta sesión de shell, nunca en un archivo ni en un log:
export SUPABASE_URL="https://wbbcjiqzbzswxsmwjqlw.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<clave de servicio del proyecto — Settings → API>"
export LOOKUP_HMAC_KEY_B64="<el mismo valor provisionado en el paso 0>"
node scripts/backfill-legacy-consent.cjs                 # dry-run (por defecto): cuenta A/B/C, 3 ids abreviados, NO escribe
# Revisar los números contra el conteo de la sección 1 de PLAN_PRODUCCION_RELEASE.md
# (cuántas cuentas con data_processing_authorized=true/false existían antes del release) ANTES de continuar.
node scripts/backfill-legacy-consent.cjs --apply          # recién aquí escribe, en lotes de 500, idempotente
unset LOOKUP_HMAC_KEY_B64 SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL
```
**Verificar después:**
```sql
select count(*) from public.consent_records where document_version like 'legacy-%';
-- coincide con el conteo de personas con data_processing_authorized = true (poblaciones A+B) antes del release
select * from public.verify_consent_chain();   -- vacío
select count(*) from public.consent_records where document_version like 'legacy-%' and (ip_ciphertext is not null or ua_ciphertext is not null);  -- 0
select version, status from public.consent_documents where version like 'legacy-%';  -- siempre 'retired', nunca 'published'
```
Correr `node scripts/backfill-legacy-consent.cjs --apply` una segunda vez no debe insertar nada
nuevo (idempotencia; el propio script lo reporta: "insertadas: 0").

**Revertir:** **no se puede, por diseño, una vez insertado.** `consent_records` es append-only
(SEC-06): ni siquiera `service_role` puede `UPDATE`/`DELETE` una fila (confirmado hoy contra
Postgres real al limpiar la prueba de integración local — el intento falla con "append-only: solo
la función de retención... puede tocar una fila existente"). Por eso el dry-run existe: es la única
oportunidad real de revisar los números **antes** de que el paso sea irreversible. Si algo salió mal
después de `--apply`, no se revierte: se corrige hacia delante (p. ej., si una fila quedó con la
versión incorrecta, se documenta el error y se decide con la persona responsable y, si corresponde,
asesoría legal, qué hacer con esa evidencia puntual — nunca borrarla en silencio).

---

## 10. `[TÚ]` Verificación posterior completa, en producción

1. `select * from public.verify_consent_chain();` y `select * from public.verify_audit_chain();` → ambas vacías.
2. Registro de prueba real (cuenta descartable) desde `/registro`: aparece el aviso 1.0 completo,
   casillas desmarcadas salvo que no aplique, "Aceptar y continuar" crea la cuenta + una fila en
   `consent_records` por finalidad.
3. Inicio de sesión con una cuenta antigua (si existe alguna de prueba): aparece el aviso de
   re-consentimiento (`requires_reconsent`) antes de cualquier otra pantalla.
4. Panel: Evidencia → buscar esa cuenta de prueba por correo → aparece con IP enmascarada; "Revelar
   IP" (solo `privacy_admin`, con motivo) la muestra sin máscara y queda en bitácora.
5. Solicitud de baja de prueba desde "Mi privacidad" → aparece en el panel con semáforo correcto;
   cambiar su estado queda en bitácora.
6. Si el modo invitado entró en este release: "Probar sin cuenta" muestra el aviso breve (texto ya
   DEFINITIVO, no el provisional) antes de crear la sesión; `select count(*) from consent_records
   where channel = 'invitado';` aumenta en 1 por cada confirmación.
7. `GET /rest/v1/privacy_settings_current` con la clave `anon` → "permission denied". `GET
   /rest/v1/consent_documents` con la clave `anon` → solo la versión `published`.
8. Borrar la cuenta de prueba del paso 2 (solicitud de baja real) y confirmar que su evidencia de
   consentimiento permanece (seudonimizada) mientras la cuenta desaparece.

**Si cualquiera de estos falla:** no se revierte el release completo — se corrige hacia delante
(cada pieza de la sección 4/6 de `PLAN_PRODUCCION_RELEASE.md` y de los pasos 5-9 de aquí tiene su
propia reversa local). Solo un fallo en el paso 1 (cadenas rotas) es motivo para detener todo y
escalar de inmediato: significa que una migración o una función ya escribió datos inconsistentes.

## 11. Cierre

- `[TÚ]` Confirmar con el equipo/Club que el release quedó estable 24-48h antes de dar por cerrada
  la ventana.
- `[TÚ]` Actualizar `LAST_MIGRATION_IN_PROD` en `.claude/loops/consentimiento/gates.sh` de `73` a
  `84` (o al número real aplicado) — así las puertas SQL del loop dejan de tratar 074-084 como
  "pendientes" en las corridas futuras. Este archivo está protegido de edición automática; lo hace
  una persona.
- `[TÚ]` Decidir si T17 (retención, D-02) y T25 (backfill, si no se hizo en este release) quedan
  para una ventana siguiente, y con qué prioridad.

