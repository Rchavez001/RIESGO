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

Desde una revision posterior de este documento (2026-09-08), el panel admin tambien es accesible en `/admin` del mismo dominio que la app de usuarios, mediante un segundo proxy en `frontend/static-server.js` que reenvia la peticion completa (incluyendo el header `Authorization` de Basic Auth) hacia el servicio `cyberdojo-admin`. Esto no cambia el modelo de seguridad descrito arriba — la proteccion de Basic Auth sigue viviendo en el servicio admin, el frontend solo reenvia — pero implica que cualquier cambio a las credenciales de Basic Auth debe hacerse en el servicio `cyberdojo-admin`, no en `cyberdojo`. Ver `ARQUITECTURA_CYBER_DOJO.md` seccion 2 para el detalle tecnico completo.

**Brechas de RLS detectadas en esta revision** (no presentes en la version anterior de este documento): las tablas `sponsors`, `ai_configs` y `recommendations_cache` no tienen Row Level Security habilitado en ninguna de las 21 migraciones de Supabase, y `domains_whitelist`/`katas` no tienen una politica de escritura para admin declarada en SQL (solo lectura publica). Ver `BASE_DE_DATOS.md` seccion 9 para el detalle completo y la recomendacion de confirmar si esto es intencional.

## Módulo de consentimiento informado (LOPDP)

Rama `feature/consentimiento-lopdp`, migraciones `073`-`081` (escritas y probadas en local; **no aplicadas
en producción todavía** — ver `loop-consentimiento/PLAN_PRODUCCION_RELEASE.md` para el orden de release).
Implementa controles alineados con la LOPDP de Ecuador y su Reglamento; esta sección documenta cómo, no
una declaración de cumplimiento (ver nota al final).

### Cifrado y HMAC

- Módulo propio `supabase/functions/_shared/crypto.ts`, con el mismo formato JSON de payload que ya usa
  `pii.ts` (`{v, alg, iv, tag, ct}`, AES-256-GCM, IV de 96 bits, tag de 128 bits) para no introducir un
  segundo formato incompatible en la misma base (D-09). Reutiliza el secreto existente
  `PII_ENCRYPTION_KEY_B64`/`PII_KEY_VERSION` (sección anterior) como clave por defecto.
- **AAD obligatoria en columnas nuevas** (`options.requireAad: true`): cada ciphertext queda atado a
  `tabla:columna:propietario` (`buildAad`), así que copiar el mismo valor cifrado a otra fila o columna
  hace fallar la verificación GCM en vez de descifrar silenciosamente el dato de otra persona.
- **Clave HMAC separada de la clave de cifrado (H15):** `LOOKUP_HMAC_KEY_B64` (variable nueva, distinta de
  `PII_ENCRYPTION_KEY_B64` y de `SECURITY_EVENTS_HMAC_KEY`, que es exclusiva de `security_events.ip_hash`).
  Se usa para: `user_ref_hmac`/búsqueda de evidencia por `user_id`, búsqueda de usuario por correo en el
  panel de evidencia, y la clave del bucket de rate limit de las Edge Functions del módulo (nunca correo
  o IP en claro como clave de bucket). **Debe generarse y provisionarse antes del release** (no existe
  todavía en ningún entorno, ver "Secretos nuevos" abajo).
- **Soporte de rotación multi-clave**, a diferencia de `pii.ts` (que siempre descifra con la clave base y
  ignora `payload.v`, ver T02-extra pendiente arriba): `decryptPii`/`encryptPii` de este módulo leen la
  versión del propio payload y resuelven `${keyEnvPrefix}_V${version}` antes de caer a la clave sin
  sufijo, así que subir `PII_KEY_VERSION` y añadir `PII_ENCRYPTION_KEY_B64_V<n>` no rompe la lectura de
  filas cifradas con la versión anterior (sin ventana de mantenimiento ni re-cifrado inmediato).

### IP del titular y del administrador

- `_shared/client-ip.ts` (`getClientIp`): lee únicamente la cabecera del proxy de confianza
  (`TRUSTED_PROXY_HOPS`, por defecto `1`); cualquier campo `ip` en el body de la petición se ignora y se
  registra como intento anómalo. `maskIp` enmascara por defecto (`a.b.c.xxx` / IPv6 a 3 hextetos);
  "Revelar IP" en el panel (solo `privacy_admin`, motivo obligatorio) es la única vía a la IP real.
- **Pendiente antes de producción (D-08, abierta):** qué cabecera exacta trae la IP real en el proyecto
  Supabase hospedado (medido en local: el proxy Kong añade la IP real al final de `X-Forwarded-For`;
  hospedado probablemente tiene Cloudflare delante — sin medir, no se cambia `TRUSTED_PROXY_HOPS`).

### Evidencia y bitácora append-only

`consent_records`, `admin_audit_log` y `data_subject_requests` (migraciones 073/078) son append-only por
diseño: trigger que calcula una cadena de hash encadenado (`prev_hash`/`row_hash`) al insertar, trigger
que bloquea `UPDATE`/`DELETE`, y `REVOKE` de esos privilegios incluso para `service_role` salvo a través de
funciones `SECURITY DEFINER` concretas (`update_data_subject_request_status`, `publish_consent_document`,
`confirm_privacy_email_change`), cada una atribuida al administrador real que la invoca (ver siguiente
punto) y registrada en la misma transacción que el cambio. `verify_consent_chain()`/`verify_audit_chain()`
detectan el primer eslabón roto si alguna fila se alterase fuera de este camino. No existe todavía un job
de purga por retención (T17, bloqueada por la decisión pendiente de plazos, D-02).

### Identidad administrativa individual (H08)

El panel (`central-admin-app`) ya no atribuye las acciones de este módulo a Basic Auth compartida ni a
`service_role` genérico: cada admin inicia sesión con Supabase Auth + TOTP (`admin_roles`: `privacy_editor`
/ `privacy_admin` / `privacy_auditor`) y el panel envía el JWT del propio admin a la función `admin-consent`,
que exige `aal2` (TOTP verificado) para las acciones sensibles. El proxy de `central-admin-app` con
`service_role` rechaza explícitamente las tablas/RPC/función de este módulo (nunca las sirve con la
credencial compartida).

### Correo saliente

Transporte configurable (D-05): `resend` (reutiliza `resend_api_key` ya existente en Vault vía
`app_secrets`, declarado en el aviso como transferencia internacional a EE. UU.) o `smtp` (host/puerto
465/2525 únicos, contraseña cifrada con `crypto.ts`+AAD, nunca devuelta al panel). `_shared/email/
ssrf-guard.ts` resuelve DNS y rechaza IP privada/loopback/link-local/metadatos antes de cada envío SMTP;
la revalidación es por-envío, no una conexión pineada a la IP ya resuelta (D-15, riesgo residual de
DNS-rebinding aceptado — el host solo lo configura un `privacy_admin` de confianza, no una entrada
arbitraria).

### Secretos nuevos a provisionar antes del release

Ninguno de los siguientes existe todavía en ningún entorno (local ni hospedado); generarlos y
documentar la rotación es trabajo de `T98.d`, pendiente. Se anotan aquí por completitud de esta sección:

```bash
# Misma clave por sesión de generación que PII_ENCRYPTION_KEY_B64 (ver arriba) — 32 bytes base64.
# NUNCA reutilizar el mismo valor que PII_ENCRYPTION_KEY_B64 (H15: deben ser claves distintas).
LOOKUP_HMAC_KEY_B64=<base64 de 32 bytes aleatorios, generado igual que PII_ENCRYPTION_KEY_B64>
```

### Nota sobre el alcance de esta sección

Esta sección documenta los controles implementados (qué hace el código hoy); no es una declaración de que
el módulo "cumple LOPDP" ni "cumple ISO/IEC 42001" — eso lo determina el área legal, no este documento.
Ver `loop-consentimiento/DECISIONS.md` para las decisiones aún abiertas que afectan el release (D-02, D-07,
D-08, D-16) y `loop-consentimiento/TASKS.md` (T98.b-T98.f) para el resto de la documentación pendiente
(manual administrativo, modelo de datos, runbook de solicitudes, lista para legal).

## Recomendaciones pendientes

- Rotar inmediatamente la service role key que estuvo expuesta en frontend historico.
- Sustituir Basic Auth del administrador por Identity-Aware Proxy, OAuth o Supabase Auth con MFA.
- Agregar rate limiting persistente para registro y recuperacion de contrasena.
- Separar la clave HMAC de la clave AES en una siguiente iteracion.
- Implementar multi-key decrypt para rotacion completa sin ventana de mantenimiento.
- Revisar `email_analysis` si el cuerpo/asunto de correos puede contener PII y aplicar cifrado o minimizacion.
