# Plan de release único — 074 + 075 (y el resto del módulo) a producción

**Estado: GUARDADO, NO SE EJECUTA POR SEPARADO.** Decisión del responsable: esto se aplicará en **un único release** junto con las
funciones, el frontend y el aviso ya publicado. No se aplican 074/075 antes por su cuenta. Proyecto `wbbcjiqzbzswxsmwjqlw`.

Este documento describe los pasos de BASE DE DATOS de ese release (secciones 0–6). El orden completo del release está al final.
Nada de lo que hay aquí se ejecuta hasta que la persona responsable lo pida expresamente.

## Qué cambia y qué NO
- 074: `consent_records.user_id` y `admin_audit_log.actor_id` dejan de ser `ON DELETE SET NULL` (pasan a `NO ACTION`); el `row_hash`
  deja de cubrir `user_id/ip_ciphertext/ua_ciphertext`; el trigger append-only acota qué puede cambiar la bandera; nueva función
  `unlink_user_consent_evidence()` (solo `service_role`).
- 075: se elimina `privacy_settings.is_current` y las 3 columnas de verificación pendiente; nueva vista `privacy_settings_current`;
  trigger de "versión siguiente"; nueva tabla `privacy_email_verifications`.
- **No toca** `users`, `auth`, ni ninguna tabla que use la app hoy. Las funciones desplegadas (`secure-register-user` v18 y el resto) no
  leen ninguna de estas tablas: siguen funcionando igual.
- **Fuera de esta ventana**: `get-consent-notice`, la nueva `secure-register-user` y el frontend. Dependen de que haya un aviso
  publicado y de medir T03; desplegarlos antes dejaría sin registro a todos (ver "Ventana siguiente").

## 0. Antes de empezar (tú)
- [ ] Elegir una hora de bajo tráfico. Nadie más debe estar aplicando migraciones.
- [ ] Disco local con al menos 2 GB libres (el 100 % de `C:` ya causó un incidente).

## 1. Comprobaciones de solo lectura (SQL Editor del panel, o `psql` al pooler)
Las guardas de las migraciones abortan solas si esto no se cumple, pero conviene verlo antes.
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
supabase migration list        # esperado: 073 en local y remoto; 074 y 075 solo en local
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
  `is_current` solo dice cuál es la vigente, que pasa a ser la de mayor versión). Ningún dato de usuarios.

## 3. Aplicar (una sola orden)
```bash
supabase db push
# Debe listar EXACTAMENTE: 074_consent_evidence_unlink_and_stable_hash.sql y 075_privacy_settings_versioning.sql. Si lista algo más: N.
```
Cada migración corre en su propia transacción. Si falla la 075, la 074 queda aplicada y es segura por sí sola; si falla una guarda,
no se cambia nada de esa migración.

## 4. Verificación posterior (solo lectura)
```sql
select * from public.verify_consent_chain();   -- 0 filas
select * from public.verify_audit_chain();     -- 0 filas
select settings_version, privacy_email from public.privacy_settings_current;   -- 1 | placeholder
select column_name from information_schema.columns
  where table_schema='public' and table_name='privacy_settings' and column_name = 'is_current';   -- 0 filas
select has_function_privilege('anon', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.unlink_user_consent_evidence(uuid,uuid,text,text,text)', 'EXECUTE');  -- f | f
select relrowsecurity from pg_class where oid = 'public.privacy_email_verifications'::regclass;   -- t
```
```bash
supabase migration list        # 074 y 075 en local y remoto
```
Desde fuera, con la clave anon de la app: `GET /rest/v1/privacy_settings_current` debe dar "permission denied"; `GET /rest/v1/consent_documents`
debe dar `[]`. Y comprobar que el login y el registro actuales siguen funcionando (registro de prueba con la versión vigente de la app).

## 5. Criterios para abortar
Cualquier guarda que salte, `db push` listando migraciones distintas, o un error en las comprobaciones de la sección 4.

## 6. Reversa (solo válida MIENTRAS `consent_records` siga vacío)
Con evidencia escrita con el hash nuevo, volver atrás dejaría cadenas que el `verify_consent_chain()` viejo daría por rotas; en ese caso
no se revierte: se corrige hacia delante. Con la tabla vacía, una migración 076 puede: recrear `consent_record_canonical` con
`(to_jsonb(rec) - 'row_hash')`, volver a `ON DELETE SET NULL` en las dos FK, restaurar `block_consent_records_mutation` de 073, borrar
`unlink_user_consent_evidence`; y para 075: borrar la tabla, la vista y el trigger nuevos, re-añadir `is_current` (y las 3 columnas
de verificación) y poner `is_current = true` en la fila de mayor versión. No la preparo hasta que la pidas: no se espera usarla.

## Orden del release único (todo o nada)
Precondiciones, todas antes de empezar: (1) el aviso real está listo y revisado por legal; los datos del responsable y del delegado
están completos (D-07); (2) T03 medido y la cabecera de IP de confianza decidida (D-08) — ver `diag/README.md`; (3) respaldo externo
verificado (sección 2); (4) `gates.sh` en verde sobre la rama del release; (5) PR revisado.

1. Secretos (los crea la persona responsable, nunca el loop): `LOOKUP_HMAC_KEY_B64` (ya existe), `TRUSTED_PROXY_HOPS` si aplica.
2. `supabase db push` → 074 + 075 (secciones 1–4 de este plan).
3. `supabase functions deploy` de `get-consent-notice` y `secure-register-user` (y el resto de funciones del módulo que lleguen en el release).
4. Publicar el aviso v1.0 con los datos reales (sin marcadores sin resolver).
5. Desplegar el frontend (`gcloud run deploy cyberdojo --source frontend …`).
6. Prueba de punta a punta en producción: un registro real de prueba, y la verificación de cadenas (`verify_consent_chain`, `verify_audit_chain`).
7. Criterio de reversa del release: mientras `consent_records` siga vacío se puede volver atrás (sección 6); con evidencia escrita se corrige hacia delante.

**Por qué no por partes:** el frontend y `secure-register-user` nuevos exigen un aviso publicado (sin él nadie se registra) y 074/075
cambian tablas que solo esas funciones nuevas usan. Aplicar una pieza sola no aporta nada y añade ventanas de riesgo.
