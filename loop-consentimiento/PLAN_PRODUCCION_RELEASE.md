# Plan de release único — migraciones pendientes (074–081) a producción

**Estado: GUARDADO, NO SE EJECUTA POR SEPARADO.** Decisión del responsable: esto se aplicará en **un único release** junto con las
funciones, el frontend y el aviso ya publicado. No se aplican por su cuenta antes de tiempo. Proyecto `wbbcjiqzbzswxsmwjqlw`.

Este documento describe los pasos de BASE DE DATOS de ese release (secciones 0–6) y se mantiene al día con **todas** las migraciones
que el loop haya creado y que sigan sin aplicarse en producción. El orden completo del release está al final.
Nada de lo que hay aquí se ejecuta hasta que la persona responsable lo pida expresamente.

**Regla de mantenimiento (ver `PROMPT.md`):** cada iteración que cree una migración nueva debe añadirla a la tabla resumen de abajo
y a las secciones 3/4/6, en el mismo commit que crea la migración. Este documento nunca debe quedar desactualizado respecto a
`supabase/migrations/`.

## Tabla resumen: migración → depende de → qué cambia → verificación posterior

| # | Migración | Depende de | Qué cambia | Verificación posterior (resumen; detalle en 1 y 4) |
|---|---|---|---|---|
| 1 | `074_consent_evidence_unlink_and_stable_hash.sql` | 073 (ya en prod) | `consent_records.user_id`/`admin_audit_log.actor_id`: `ON DELETE SET NULL` → `NO ACTION`; `row_hash` deja de cubrir PII; trigger append-only acota qué cambia la bandera de retención; nueva `unlink_user_consent_evidence()` (solo `service_role`) | `verify_consent_chain()`/`verify_audit_chain()` vacíos; permisos de la función |
| 2 | `075_privacy_settings_versioning.sql` | 073 (ya en prod) | quita `is_current` + 3 columnas de verificación de `privacy_settings`; nueva vista `privacy_settings_current`; trigger de "versión siguiente"; nueva tabla `privacy_email_verifications` | `privacy_settings_current` da la v1; columna `is_current` ausente; RLS activa en verificaciones |
| 3 | `076_learning_guest_limit.sql` | **Ninguna del módulo de consentimiento** — usa `learning_progress`/`learning_dojos`/`learning_attempts` de la línea base, ya en producción. Independiente de 073–075 y de 077. | Tope de 10 preguntas para invitados en `learning_answer`; `learning_start_exam` rechaza sesión anónima. Ambas capas para INV-SEC (P2), ajeno al módulo de consentimiento. | Invitado de prueba: la pregunta 11 da `GUEST_LIMIT_REACHED`; presentar examen como invitado da `GUEST_LIMIT_REACHED` |
| 4 | `077_consent_documents_no_gap_on_retire.sql` | 073 (tabla `consent_documents`, ya en prod) | Restricción diferible (`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`): retirar la versión publicada sin publicar un reemplazo en la misma transacción falla | El trigger existe y es `DEFERRABLE`/`INITIALLY DEFERRED` (consulta en sección 4). Prueba funcional completa (retirar+publicar de verdad) queda pendiente hasta que exista un aviso publicado real — no se puede probar en prod con `consent_documents` vacía |
| 5 | `078_data_subject_requests_case_numbers_and_status_update.sql` | 073 (tabla `data_subject_requests`, ya en prod) | Nueva tabla `data_subject_request_counters` (uno por año) y `next_case_number()` pasa de secuencia global a numeración `CD-AAAA-NNNNNN` que reinicia en `000001` cada año; `data_subject_requests` gana `update_data_subject_request_status()` (solo `service_role`, con bitácora atómica) como única vía para cambiar `status`/`resolved_at`/`resolution_note_ciphertext` — antes la tabla no tenía ninguna vía de `UPDATE`; `DELETE` queda bloqueado siempre | `next_case_number()` da `CD-<año>-000001` la primera vez tras el release (contador nuevo); el trigger `data_subject_requests_restrict_update` existe; permisos de la función (`service_role` sí, `authenticated`/`anon` no) |
| 6 | `079_email_transport_and_outbox.sql` | 073 (tabla `users`/`admin_roles`, ya en prod) | Tres tablas nuevas (T12.b): `email_transport_settings` (versionada, solo INSERT, patrón de 075 — modo `resend`/`smtp`, placeholder v1 en modo `resend`), `email_transport_tests` (resultado de cada correo de prueba, append-only, sin destinatario ni cuerpo) y `email_outbox` (avisos pendientes cuando el envío falla, solo `reference_table`/`reference_id`, sin datos del titular; `UPDATE`/`DELETE` bloqueados salvo `mark_email_outbox_sent()`). RLS activa, sin acceso para `anon`/`authenticated` en ninguna de las tres | `email_transport_settings_current` da la v1 en modo `resend`; `mark_email_outbox_sent()` existe y solo la ejecuta `service_role`; `email_transport_tests`/`email_outbox` sin privilegios para `anon`/`authenticated` |
| 7 | `080_publish_consent_document_atomic.sql` | 073 (tabla `consent_documents`), 077 (restricción diferible) | Nueva función `publish_consent_document()`: retira la vigente + publica el borrador + bitácora en UNA transacción real (con candado consultivo `pg_advisory_xact_lock`), con rol `privacy_admin`/`aal2`/motivo/"cuatro ojos" verificados DENTRO de la función. Arregla T14 (`admin-consent`): publicar con dos llamadas `UPDATE` sueltas violaba SIEMPRE la restricción diferible de 077 en cuanto ya había una versión publicada — verificado contra Postgres real antes de esta migración, ver PROGRESS.md. No toca filas existentes | La función existe y solo la ejecuta `service_role`; publicar con una vigente existente funciona (antes fallaba siempre); dos publicaciones simultáneas dejan exactamente una vigente (prueba de concurrencia en `gates.sh`) |
| 8 | `081_fix_digest_schema_qualification.sql` | 073 (las 4 funciones que corrige) | `CREATE OR REPLACE` de `consent_records_chain_trigger`/`verify_consent_chain`/`admin_audit_log_chain_trigger`/`verify_audit_chain`: califican `extensions.digest(...)` en vez de `digest(...)` a secas. Arregla un defecto preexistente de 073 (ya en prod): en Supabase real pgcrypto vive en `extensions`, no en `public`; cualquier función `SECURITY DEFINER ... SET search_path = public` que dispare estos triggers (`unlink_user_consent_evidence` 074, `update_data_subject_request_status` 078, `publish_consent_document` 080, y las que vengan) fallaba con `function digest(text, unknown) does not exist` — confirmado también en `update_data_subject_request_status`, ya desplegable, no solo en 080. Sin este arreglo, 080 (y en la práctica cualquier acción administrativa que mute `consent_records`/`admin_audit_log` desde una función con `search_path` acotado) falla en producción. No toca filas existentes, solo `CREATE OR REPLACE FUNCTION` | `verify_consent_chain()`/`verify_audit_chain()` siguen dando vacío; una llamada real a `update_data_subject_request_status()` o `publish_consent_document()` ya no da `function digest(text, unknown) does not exist` |

**Orden de aplicación: 074 → 075 → 076 → 077 → 078 → 079 → 080 → 081.** Es el orden en que `supabase db push` las aplica automáticamente
(por número de archivo); no hay forma de empujar 077/078/079/080/081 sin arrastrar 076, que ya ocupa ese número en la carpeta. 076 no es del
módulo de consentimiento, pero viaja en el mismo `push` porque le tocó ese hueco; es segura por su cuenta (`CREATE OR REPLACE`, no toca datos,
sin guarda de precondición) y no depende de ni bloquea a las demás.
**081 es la más urgente de aplicar en cuanto se abra la ventana de release**: sin ella, `update_data_subject_request_status()` (078, ya
cerrada) también falla contra producción real en cuanto alguien la llame — no es exclusivo de 080.

## Qué cambia y qué NO
- 074: ver tabla arriba.
- 075: ver tabla arriba.
- 076: ver tabla arriba. Función pura (`CREATE OR REPLACE`), sin cambios de esquema ni de datos.
- 077: ver tabla arriba. Solo añade una función y un trigger; no toca filas existentes ni esquema de columnas.
- 078: ver tabla arriba. Tabla nueva (`data_subject_request_counters`, vacía al aplicar) y dos funciones nuevas; no toca filas
  existentes de `data_subject_requests` (hoy vacía en prod, según la comprobación de la sección 1) ni cambia columnas.
- 079: ver tabla arriba. Tres tablas nuevas, todas vacías al aplicar salvo el placeholder de `email_transport_settings` v1; no toca
  ninguna tabla existente. Nadie llama todavía a `mark_email_outbox_sent()` ni escribe en `email_outbox`/`email_transport_tests`
  (las acciones de `admin-consent` que lo harán son T12.c/T12.d, aún sin hacer): aplicar 079 no cambia el comportamiento de ninguna
  función ya desplegada, solo dejan el esquema listo para cuando esas tareas se cierren.
- 080: ver tabla arriba. Función nueva; no toca filas existentes. Nadie la llama todavía desde producción (la acción `publish` de
  `admin-consent` que la usa no está desplegada hasta que se despliegue la función junto con el resto de esta ventana).
- 081: ver tabla arriba. `CREATE OR REPLACE FUNCTION` puro sobre 4 funciones de 073; no cambia esquema ni borra datos. Si `consent_records`/
  `admin_audit_log` ya tienen filas en producción (evidencia real), sus cadenas (`row_hash`/`prev_hash`) NO se recalculan ni se tocan — solo
  cambia cómo se calculan los `row_hash` de las filas FUTURAS. `verify_consent_chain()`/`verify_audit_chain()` deben seguir dando vacío
  antes y después (ver sección 4).
- **No toca** `users`, `auth`, ni ninguna tabla que use la app hoy. Las funciones desplegadas (`secure-register-user` v18 y el resto) no
  leen ninguna de estas tablas: siguen funcionando igual (076 sí las usa, pero solo endurece una regla ya vigente en el frontend).
- **Fuera de esta ventana**: `get-consent-notice`, la nueva `secure-register-user` y el frontend del módulo de consentimiento.
  Dependen de que haya un aviso publicado y de medir T03; desplegarlos antes dejaría sin registro a todos (ver "Ventana siguiente").
  076 no tiene esta dependencia y podría, en principio, desplegarse antes por separado si la persona responsable lo pide; se deja
  agrupada aquí porque no hay urgencia y separar el `push` no reduce riesgo.

## 0. Antes de empezar (tú)
- [ ] Elegir una hora de bajo tráfico. Nadie más debe estar aplicando migraciones.
- [ ] Disco local con al menos 2 GB libres (el 100 % de `C:` ya causó un incidente).

## 1. Comprobaciones de solo lectura (SQL Editor del panel, o `psql` al pooler)
Las guardas de 074/075 abortan solas si esto no se cumple, pero conviene verlo antes. 076, 077, 078 y 079 no tienen guardas de
precondición (076 es un `CREATE OR REPLACE` puro; 077 no falla por datos existentes, solo cambia el comportamiento futuro de un
`UPDATE` que retire una versión publicada; 078 y 079 crean objetos nuevos y no tocan filas existentes).
```sql
-- 074 aborta si consent_records ya tiene evidencia (no reescribe hashes).
select 'consent_records'          as tabla, count(*) from public.consent_records
union all select 'admin_audit_log',            count(*) from public.admin_audit_log
union all select 'data_subject_requests',      count(*) from public.data_subject_requests
union all select 'consent_documents',          count(*) from public.consent_documents
union all select 'consent_documents publicados', count(*) from public.consent_documents where status = 'published'
union all select 'privacy_settings',           count(*) from public.privacy_settings
-- 075 aborta si hay una verificación de correo pendiente en las columnas viejas.
union all select 'privacy_settings con verificación pendiente', count(*) from public.privacy_settings
  where privacy_email_pending is not null or privacy_email_code_hash is not null or privacy_email_code_expires_at is not null;
```
**Esperado:** `consent_records` = 0, `admin_audit_log` = 0, `data_subject_requests` = 0, `consent_documents` = 0, publicados = 0,
`privacy_settings` = 1 (la fila placeholder de 073), pendiente = 0. Si `consent_records` > 0: PARAR (haría falta una migración de re-hash).

```bash
cd shield-ecuador-app
supabase migration list        # esperado: 073 en local y remoto; 074-081 solo en local
```

## 2. Respaldo (obligatorio antes del `db push`)
- [ ] Panel → Database → Backups: comprobar si el proyecto tiene **PITR** activo y anotar la fecha/hora de la última copia diaria.
- **Si NO hay PITR, el respaldo lógico es obligatorio** (no opcional): esquema Y datos, antes del push, guardados **fuera de esta máquina**.
  ```bash
  cd shield-ecuador-app
  supabase db dump -f ../backup_pre_release_esquema.sql
  supabase db dump --data-only -f ../backup_pre_release_datos.sql
  sha256sum ../backup_pre_release_*.sql > ../backup_pre_release.sha256     # constancia de integridad
  ```
  Reglas del respaldo:
  1. **Contiene datos personales** (perfiles con PII cifrada, huellas HMAC, correos enmascarados): cifrarlo antes de moverlo
     (p. ej. `7z a -p -mhe=on` o `age`) con una clave que NO viaje con el archivo, y **no commitearlo jamás** (ni en el repo ni en `.claude/`).
  2. Copiarlo a un destino **fuera de esta máquina** (almacenamiento de la institución o un disco externo) y comprobar allí el `sha256`.
  3. Comprobar que no está vacío ni truncado: tamaño coherente y última tabla presente (`grep -c "^COPY public\." backup_pre_release_datos.sql`).
  4. Vigilar el disco antes de empezar: el 100 % de `C:` ya causó un incidente (Docker colgado, imagen dañada). Mínimo 2 GB libres.
  5. No se continúa sin la confirmación de que la copia externa existe y se verificó.
- `supabase db dump` no incluye el esquema `auth`; las cuentas de Auth dependen de la copia diaria/PITR del panel. Anotarlo en la constancia.
- Qué se pierde de verdad al aplicar: 4 columnas de `privacy_settings` (las 3 de verificación están vacías —lo comprueba la guarda— y
  `is_current` solo dice cuál es la vigente, que pasa a ser la de mayor versión). Ningún dato de usuarios. 076-081 no eliminan nada
  (079 solo crea tablas nuevas; 080/081 solo crean/reemplazan funciones).

## 3. Aplicar (una sola orden)
Esta máquina no debe quedar vinculada a un proyecto de producción entre sesiones: vincular justo antes y
desvincular justo después acota la ventana en la que `supabase db push`/`functions deploy` podrían alcanzar
producción por error.
```bash
supabase link --project-ref wbbcjiqzbzswxsmwjqlw
supabase db push
# Debe listar EXACTAMENTE, en este orden: 074_consent_evidence_unlink_and_stable_hash.sql,
# 075_privacy_settings_versioning.sql, 076_learning_guest_limit.sql,
# 077_consent_documents_no_gap_on_retire.sql,
# 078_data_subject_requests_case_numbers_and_status_update.sql,
# 079_email_transport_and_outbox.sql,
# 080_publish_consent_document_atomic.sql,
# 081_fix_digest_schema_qualification.sql. Si lista algo más o menos: PARAR.
```
Cada migración corre en su propia transacción. Si falla una, las anteriores ya aplicadas quedan así (074 y 075 son seguras por sí
solas; 076-081 también, al ser aditivas). Si falla una guarda, no se cambia nada de esa migración en particular.

## 4. Verificación posterior (solo lectura)
```sql
-- 074 y 075 (ya existían)
select * from public.verify_consent_chain();   -- 0 filas
select * from public.verify_audit_chain();     -- 0 filas
select settings_version, privacy_email from public.privacy_settings_current;   -- 1 | placeholder
select column_name from information_schema.columns
  where table_schema='public' and table_name='privacy_settings' and column_name = 'is_current';   -- 0 filas
select has_function_privilege('anon', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE');  -- f | f
select relrowsecurity from pg_class where oid = 'public.privacy_email_verifications'::regclass;   -- t

-- 077 (nuevo): el trigger existe y es diferible
select tgname, tgdeferrable, tginitdeferred
  from pg_trigger where tgname = 'consent_documents_no_gap_on_retire';   -- 1 fila | t | t
-- Prueba funcional de 077 (retirar sin reemplazo falla) NO se puede hacer en prod hasta que exista
-- al menos una versión publicada real; queda como verificación manual pendiente para cuando se
-- publique el aviso v1.0 real (paso 4 del "Orden del release único" más abajo).

-- 078 (nuevo): trigger, tabla de contadores y permisos de la función
select tgname from pg_trigger where tgname = 'data_subject_requests_restrict_update';   -- 1 fila
select count(*) from public.data_subject_request_counters;   -- 0 (nadie ha llamado a next_case_number() aún)
select has_function_privilege('service_role', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.update_data_subject_request_status(uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE');   -- t | f | f

-- 080 (nuevo): la función existe, permisos correctos
select has_function_privilege('service_role', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.publish_consent_document(uuid,uuid,text,text,text,text)', 'EXECUTE');   -- t | f | f

-- 081 (nuevo): las cadenas se siguen verificando OK con las funciones corregidas, y digest() ya no explota
-- con search_path acotado (reproducir el error directo es innecesario; esta consulta ya ejercita digest()
-- calificado con extensions. a través de verify_*_chain()).
select * from public.verify_consent_chain();   -- 0 filas (igual que antes de 081: no cambia el resultado, solo el cálculo)
select * from public.verify_audit_chain();     -- 0 filas
```
```bash
supabase migration list        # 074-081 en local y remoto
```
```sql
-- 076 (nuevo): la función lleva el código de error estable
select prosrc ~ 'GUEST_LIMIT_REACHED' from pg_proc where proname = 'learning_answer';        -- t
select prosrc ~ 'GUEST_LIMIT_REACHED' from pg_proc where proname = 'learning_start_exam';    -- t
```
Prueba funcional de 076 (fuera del SQL Editor, con una sesión anónima real): responder 11 preguntas de un dojo como invitado →
la 11.ª da `GUEST_LIMIT_REACHED`; llamar a `learning_start_exam` como invitado → `GUEST_LIMIT_REACHED`.

```sql
-- 079 (nuevo): transporte de correo en modo resend desde el placeholder, y permisos de la cola
select transport_version, mode from public.email_transport_settings_current;   -- 1 | resend
select has_function_privilege('service_role', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE'),
       has_function_privilege('anon', 'public.mark_email_outbox_sent(uuid)', 'EXECUTE');  -- t | f | f
select count(*) from public.email_outbox;         -- 0 (nadie ha encolado un aviso aún)
select count(*) from public.email_transport_tests; -- 0 (nadie ha probado el transporte aún)
```
079 no tiene prueba funcional de envío real pendiente para este release: ninguna función desplegada escribe todavía en estas tres
tablas (T12.c/T12.d, que sí lo harán, no están hechas). Solo se verifica que el esquema y los permisos quedaron como se espera.

Desde fuera, con la clave anon de la app: `GET /rest/v1/privacy_settings_current` debe dar "permission denied"; `GET /rest/v1/consent_documents`
debe dar `[]`. Y comprobar que el login y el registro actuales siguen funcionando (registro de prueba con la versión vigente de la app).

Terminada la verificación, desvincular el proyecto de esta máquina:
```bash
supabase unlink
```

## 5. Criterios para abortar
Cualquier guarda que salte, `db push` listando migraciones distintas a las 5 esperadas (en cualquier orden), o un error en las
comprobaciones de la sección 4.

## 6. Reversa (solo válida MIENTRAS `consent_records` siga vacío)
Con evidencia escrita con el hash nuevo, volver atrás dejaría cadenas que el `verify_consent_chain()` viejo daría por rotas; en ese caso
no se revierte: se corrige hacia delante. Con la tabla vacía:
- **074/075:** una migración nueva puede recrear `consent_record_canonical` con `(to_jsonb(rec) - 'row_hash')`, volver a
  `ON DELETE SET NULL` en las dos FK, restaurar `block_consent_records_mutation` de 073, borrar `unlink_user_consent_evidence`; y
  para 075: borrar la tabla, la vista y el trigger nuevos, re-añadir `is_current` (y las 3 columnas de verificación) y poner
  `is_current = true` en la fila de mayor versión.
- **076:** trivial — es un `CREATE OR REPLACE FUNCTION` puro. Revertir es volver a aplicar los cuerpos de `learning_answer` y
  `learning_start_exam` tal como quedaron en `026_learning_progress.sql` (última definición previa a 076; ninguna migración
  intermedia las tocó). No hay datos que perder.
- **077:** trivial mientras no haya habido un retiro real de una versión publicada — `DROP TRIGGER consent_documents_no_gap_on_retire
  ON public.consent_documents; DROP FUNCTION public.enforce_consent_document_no_gap_on_retire();`. Si ya se usó para retirar una
  versión real, revertir no deshace ese retiro (el documento sigue `retired`); no hay pérdida de datos, solo se relaja la restricción.
- **078:** trivial mientras no se haya generado ningún caso real con la numeración nueva — `DROP TRIGGER
  data_subject_requests_restrict_update ON public.data_subject_requests; DROP FUNCTION
  public.update_data_subject_request_status(...); DROP TABLE public.data_subject_request_counters;` y recrear
  `next_case_number()` con la secuencia vieja (`data_subject_request_seq`, que 078 borra — habría que volver a crearla). Si ya
  existen casos con `case_number` nuevo (`CD-AAAA-NNNNNN` reiniciado), no se revierte: son válidos y únicos por sí mismos, no hay
  colisión posible con revertir la función que los generó.
- **079:** trivial mientras no se haya encolado ningún aviso real ni corrido ninguna prueba de transporte — `DROP TABLE
  public.email_transport_settings, public.email_transport_tests, public.email_outbox CASCADE` (arrastra la vista, los triggers y
  `mark_email_outbox_sent()`). Nada más depende de estas tres tablas (ninguna función desplegada las usa todavía). Si ya hay avisos
  reales en `email_outbox` o pruebas en `email_transport_tests`, no se revierte: se corrige hacia delante, igual que el resto.
- **080:** trivial mientras no se haya publicado nada real con ella — `DROP FUNCTION public.publish_consent_document(uuid,uuid,text,text,text,text);`.
  Si ya se usó para publicar una versión real, revertir no deshace esa publicación (el documento sigue publicado/retirado según
  corresponda); no hay pérdida de datos, solo se relaja de vuelta a lo que había antes (nada: la función no existía).
- **081:** revertir significaría volver a `digest(...)` sin calificar en las 4 funciones — NO tiene sentido hacerlo: eso reintroduce el
  bug que 081 arregla. Si algo saliera mal con 081 en particular, se corrige hacia delante con otra migración `CREATE OR REPLACE`, nunca
  revirtiendo a la versión rota.
No la preparo hasta que la pidas: no se espera usarla.

## Orden del release único (todo o nada)
Precondiciones, todas antes de empezar: (1) el aviso real está listo y revisado por legal; los datos del responsable y del delegado
están completos (D-07); (2) T03 medido y la cabecera de IP de confianza decidida (D-08) — ver `diag/README.md`; (3) respaldo externo
verificado (sección 2); (4) `gates.sh` en verde sobre la rama del release; (5) PR revisado.

1. Secretos (los crea la persona responsable, nunca el loop): `LOOKUP_HMAC_KEY_B64` (ya existe), `TRUSTED_PROXY_HOPS` si aplica.
2. `supabase link --project-ref wbbcjiqzbzswxsmwjqlw`, luego `supabase db push` → 074 + 075 + 076 + 077 + 078 + 079 + 080 + 081 (secciones 1–4 de este plan), y `supabase unlink` al terminar de verificar (no dejar esta máquina vinculada a producción entre sesiones).
3. `supabase functions deploy` de `get-consent-notice` y `secure-register-user` (y el resto de funciones del módulo que lleguen en el release).
4. Publicar el aviso v1.0 con los datos reales (sin marcadores sin resolver). En este punto, hacer la prueba funcional pendiente
   de 077 (sección 4): con un segundo borrador listo, retirar v1.0 sin reemplazo debe fallar; retirar y publicar el reemplazo en
   la misma operación debe funcionar.
5. Desplegar el frontend (`gcloud run deploy cyberdojo --source frontend …`).
6. Prueba de punta a punta en producción: un registro real de prueba, y la verificación de cadenas (`verify_consent_chain`, `verify_audit_chain`).
7. Criterio de reversa del release: mientras `consent_records` siga vacío se puede volver atrás (sección 6); con evidencia escrita se corrige hacia delante.

**Por qué no por partes:** el frontend y `secure-register-user` nuevos exigen un aviso publicado (sin él nadie se registra) y 074/075
cambian tablas que solo esas funciones nuevas usan. 076, 077 y 078 no tienen esa dependencia, pero no hay urgencia en separarlas:
viajan ya en el mismo `push` por numeración de archivo (076) o por ser del mismo módulo (077, 078). Aplicar una pieza sola no
aporta nada y añade ventanas de riesgo.
