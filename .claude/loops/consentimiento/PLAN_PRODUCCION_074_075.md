# Plan de ventana única — aplicar 074 + 075 a producción

**Estado: NO EJECUTADO. Espera tu OK.** Proyecto `wbbcjiqzbzswxsmwjqlw`. Tiempo estimado: 10–15 min. Solo cambia la base de datos
(no se despliega ninguna función ni el frontend en esta ventana).

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

## 2. Confirmación de respaldo (tú, antes de seguir)
- [ ] Panel → Database → Backups: anotar la fecha/hora del último respaldo (o confirmar PITR activo). Debe ser de hoy.
- [ ] Opcional, recomendado: respaldo lógico previo (necesita Docker y espacio; escribe un archivo local):
      `supabase db dump -f ../backup_pre_074_075.sql` (esquema) y `supabase db dump --data-only -f ../backup_pre_074_075_data.sql`.
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

## Ventana siguiente (NO ahora): funciones y frontend
Solo cuando estén cumplidos los tres: (1) aviso real publicado en producción (revisado por legal), (2) T03 medido y `TRUSTED_PROXY_HOPS`
fijado (o `cf-connecting-ip`), (3) 074+075 aplicadas. Entonces: `supabase secrets set TRUSTED_PROXY_HOPS=…`, desplegar
`get-consent-notice` y `secure-register-user`, desplegar el frontend, y probar un registro real de punta a punta.
