# Seguridad y privacidad de datos personales

## Alcance implementado

El registro de usuarios del Cyber Dojo ya no inserta datos personales directamente desde el frontend en `public.users`.
El flujo de alta usa la Edge Function `secure-register-user`, que:

- valida entradas;
- exige autorizacion de tratamiento de datos;
- crea el usuario en Supabase Auth sin guardar nombre en `user_metadata`;
- cifra email y nombre con AES-256-GCM;
- genera HMAC-SHA-256 para busqueda exacta de email;
- guarda en `public.users` solo email enmascarado, categoria estadistica y campos cifrados.

La lectura de perfil privado usa `get-private-profile`, que descifra solo para:

- el usuario autenticado propietario del perfil;
- un admin autorizado.

La migracion de datos existentes usa `migrate-user-pii`. Esta funcion cifra registros antiguos y reemplaza campos personales en claro por valores nulos o enmascarados.

## Datos personales protegidos

Campos cifrados en `public.users`:

- `email_encrypted`
- `full_name_encrypted`
- `phone_encrypted`
- `location_city_encrypted`
- `location_province_encrypted`

Campos auxiliares:

- `email_lookup_hmac`: busqueda exacta irreversible por email normalizado.
- `pii_key_version`: version de clave usada.
- `pii_encrypted_at`: fecha de cifrado.
- `pii_migration_status`: estado de migracion.

`business_type` queda en claro como categoria estadistica no identificativa para reportes agregados.
El email tambien existe en Supabase Auth porque es requerido para autenticacion.

## Criptografia

- Algoritmo: AES-256-GCM.
- IV: 96 bits aleatorios por operacion.
- Tag: 128 bits.
- Codificacion: JSON con `alg`, `v`, `iv`, `tag`, `ct`.
- Busqueda exacta: HMAC-SHA-256 con la misma clave raiz.
- Implementacion: Web Crypto nativo en Deno Edge Functions.

No se implementa criptografia propia ni algoritmos obsoletos.

## Variables y secretos requeridos

Configurar en Supabase Edge Functions, no en frontend:

```bash
PII_ENCRYPTION_KEY_B64=<base64 de 32 bytes aleatorios>
PII_KEY_VERSION=1
PII_MIGRATION_SECRET=<secreto largo aleatorio para migracion>
```

Generar una clave:

```powershell
$rng = [Security.Cryptography.RNGCryptoServiceProvider]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Configurar secretos:

```bash
supabase secrets set PII_ENCRYPTION_KEY_B64="<valor>" PII_KEY_VERSION="1" --project-ref <project-ref>
```

## Rotacion de claves

1. Generar nueva clave de 32 bytes.
2. Subirla como nueva version operativa y aumentar `PII_KEY_VERSION`.
3. Mantener temporalmente la version anterior para descifrar historicos si se implementa multi-key.
4. Ejecutar proceso de re-encriptado por lotes.
5. Verificar integridad con lecturas autorizadas.
6. Retirar la clave anterior cuando no queden registros con esa version.

La estructura `pii_key_version` ya queda lista para rotacion. La version actual usa una sola clave activa.

## Migracion de datos existentes

La migracion de esquema es `012_encrypt_registration_pii.sql`.

Para cifrar datos existentes:

```bash
POST /functions/v1/migrate-user-pii
Headers:
  Authorization: Bearer <anon key>
  apikey: <anon key>
  x-cron-secret: <PII_MIGRATION_SECRET>
Body:
  { "limit": 200 }
```

Ejecutar varias veces hasta recibir:

```json
{ "migrated": 0 }
```

Rollback operativo:

- restaurar backup previo si se requiere revertir datos;
- conservar `email_encrypted` y `full_name_encrypted` hasta validar;
- no eliminar columnas antiguas hasta completar pruebas funcionales.

## Logs y auditoria

Se agrego `security_audit_events` para eventos como:

- registro completado;
- fallo de registro;
- lectura de perfil privado;
- denegacion de lectura;
- lote de migracion PII.

No se registran payloads completos, contrasenas, tokens, claves ni datos descifrados.

## Administrador separado

`central-admin-app` ya no sirve la service role dentro de `app.js`.
El navegador llama a `/api/rest/v1/...` y `/api/auth/v1/...`.
El servidor Node actua como proxy y usa `SUPABASE_SERVICE_ROLE_KEY` solo como variable de entorno de Cloud Run.

## Recomendaciones pendientes

- Rotar inmediatamente la service role key que estuvo expuesta en frontend historico.
- Sustituir Basic Auth del administrador por Identity-Aware Proxy, OAuth o Supabase Auth con MFA.
- Agregar rate limiting persistente para registro y recuperacion de contrasena.
- Separar la clave HMAC de la clave AES en una siguiente iteracion.
- Implementar multi-key decrypt para rotacion completa sin ventana de mantenimiento.
- Revisar `email_analysis` si el cuerpo/asunto de correos puede contener PII y aplicar cifrado o minimizacion.
