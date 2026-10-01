# Plan de release único — migraciones pendientes (074–078) a producción

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

**Orden de aplicación: 074 → 075 → 076 → 077 → 078.** Es el orden en que `supabase db push` las aplica automáticamente (por número de
archivo); no hay forma de empujar 077/078 sin arrastrar 076, que ya ocupa ese número en la carpeta. 076 no es del módulo de
consentimiento, pero viaja en el mismo `push` porque le tocó ese hueco; es segura por su cuenta (`CREATE OR REPLACE`, no toca datos,
sin guarda de precondición) y no depende de ni bloquea a las demás.

## Qué cambia y qué NO
- 074: ver tabla arriba.
- 075: ver tabla arriba.
- 076: ver tabla arriba. Función pura (`CREATE OR REPLACE`), sin cambios de esquema ni de datos.
- 077: ver tabla arriba. Solo añade una función y un trigger; no toca filas existentes ni esquema de columnas.
- 078: ver tabla arriba. Tabla nueva (`data_subject_request_counters`, vacía al aplicar) y dos funciones nuevas; no toca filas
  existentes de `data_subject_requests` (hoy vacía en prod, según la comprobación de la sección 1) ni cambia columnas.
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
Las guardas de 074/075 abortan solas si esto no se cumple, pero conviene verlo antes. 076, 077 y 078 no tienen guardas de
precondición (076 es un `CREATE OR REPLACE` puro; 077 no falla por datos existentes, solo cambia el comportamiento futuro de un
`UPDATE` que retire una versión publicada; 078 crea objetos nuevos y no toca filas de `data_subject_requests`, que la comprobación
de abajo ya espera en 0).
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
supabase migration list        # esperado: 073 en local y remoto; 074, 075, 076, 077 y 078 solo en local
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
  `is_current` solo dice cuál es la vigente, que pasa a ser la de mayor versión). Ningún dato de usuarios. 076, 077 y 078 no eliminan nada.

## 3. Aplicar (una sola orden)
```bash
supabase db push
# Debe listar EXACTAMENTE, en este orden: 074_consent_evidence_unlink_and_stable_hash.sql,
# 075_privacy_settings_versioning.sql, 076_learning_guest_limit.sql,
# 077_consent_documents_no_gap_on_retire.sql,
# 078_data_subject_requests_case_numbers_and_status_update.sql. Si lista algo más o menos: PARAR.
```
Cada migración corre en su propia transacción. Si falla una, las anteriores ya aplicadas quedan así (074 y 075 son seguras por sí
solas; 076, 077 y 078 también, al ser aditivas). Si falla una guarda, no se cambia nada de esa migración en particular.

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
```
```bash
supabase migration list        # 074, 075, 076, 077 y 078 en local y remoto
```
```sql
-- 076 (nuevo): la función lleva el código de error estable
select prosrc ~ 'GUEST_LIMIT_REACHED' from pg_proc where proname = 'learning_answer';        -- t
select prosrc ~ 'GUEST_LIMIT_REACHED' from pg_proc where proname = 'learning_start_exam';    -- t
```
Prueba funcional de 076 (fuera del SQL Editor, con una sesión anónima real): responder 11 preguntas de un dojo como invitado →
la 11.ª da `GUEST_LIMIT_REACHED`; llamar a `learning_start_exam` como invitado → `GUEST_LIMIT_REACHED`.

Desde fuera, con la clave anon de la app: `GET /rest/v1/privacy_settings_current` debe dar "permission denied"; `GET /rest/v1/consent_documents`
debe dar `[]`. Y comprobar que el login y el registro actuales siguen funcionando (registro de prueba con la versión vigente de la app).

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
No la preparo hasta que la pidas: no se espera usarla.

## Orden del release único (todo o nada)
Precondiciones, todas antes de empezar: (1) el aviso real está listo y revisado por legal; los datos del responsable y del delegado
están completos (D-07); (2) T03 medido y la cabecera de IP de confianza decidida (D-08) — ver `diag/README.md`; (3) respaldo externo
verificado (sección 2); (4) `gates.sh` en verde sobre la rama del release; (5) PR revisado.

1. Secretos (los crea la persona responsable, nunca el loop): `LOOKUP_HMAC_KEY_B64` (ya existe), `TRUSTED_PROXY_HOPS` si aplica.
2. `supabase db push` → 074 + 075 + 076 + 077 + 078 (secciones 1–4 de este plan).
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
