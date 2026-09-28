# SPEC · Módulo de Consentimiento Informado y Derechos del Titular — CiberDojo

Versión de SPEC: 1.0 · 26-09-2026
Insumos: `CiberDojo_Consentimiento_Informado.pdf` v1.0 (propuesta) y
`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.docx` v1.0 (diagnóstico).
Stack observado: frontend React/TypeScript (`frontend/`), panel `central-admin-app/` (Node,
`server.js` + `app.js`, Basic Auth y proxy con service role), Supabase (Edge Functions Deno en
`supabase/functions/`, helpers en `_shared/`, migraciones SQL hasta 072).

---

## 1. Objetivo

1. Guardar en base de datos el aviso de consentimiento **versionado** y editable desde el panel
   administrativo, con historial completo de cambios.
2. Guardar la **evidencia de cada autorización por finalidad**, cifrada, con la **IP de origen**
   identificable por el personal autorizado, fecha/hora del servidor, versión y huella del texto
   exactamente mostrado.
3. Permitir configurar desde el panel el **correo del delegado / canal de privacidad**, al que se
   enrutan las solicitudes de baja y derechos, con historial.
4. Cerrar, en el perímetro de este módulo, los hallazgos H01, H04 (parcial), H08, H15 y reforzar E01/E10.

Fuera de alcance: resto de hallazgos ISO (H02, H03, H05–H07, H09–H14, H16, H17), redacción jurídica
definitiva de la Política de Privacidad completa.

---

## 2. Tensión normativa que el diseño resuelve (leer antes de implementar)

El anexo del aviso dice: *"No recoger datos adicionales innecesarios solo para probar la
aceptación."* Registrar la IP es un dato personal adicional. Se justifica así, y el código debe
reflejarlo:

- **Finalidad declarada:** prueba de la manifestación de voluntad y seguridad de la cuenta. El aviso
  v1.0 incluye una frase nueva que lo informa (ver `seed/aviso_consentimiento_v1.0.md`, §8).
- **Minimización:** se guarda IP y user-agent, nada más (sin geolocalización, sin fingerprinting).
- **Protección:** cifrado AES-256-GCM + HMAC separado para búsqueda; visualización enmascarada;
  revelación solo por rol con motivo y registro en bitácora.
- **Limitación de conservación:** plazo configurable; al vencer, la IP se elimina y queda solo el
  HMAC truncado, manteniendo la evidencia de fecha/versión/decisión.

Si un revisor legal decide que la IP no debe conservarse, basta cambiar `ip_retention_days` a 0
(se guarda solo HMAC). El diseño no debe impedir esa opción.

---

## 3. Requisitos funcionales

| ID | Requisito | Origen |
|---|---|---|
| REQ-01 | El aviso vive en BD (`consent_documents`), versionado (semver), con estados `draft → published → retired`. Solo una versión `published` a la vez. Una versión publicada es **inmutable**; editar implica crear un borrador nuevo (clonado de la vigente). | Aviso §Anexo "mantener versiones"; ISO A.6 |
| REQ-02 | El texto usa marcadores `{{...}}` que se resuelven con `privacy_settings` al mostrarse. Se calcula `rendered_sha256` del texto exactamente mostrado y se guarda en la evidencia, junto con `settings_version`. | Evidencia verificable |
| REQ-03 | Las finalidades (`purposes`) se versionan con el documento: `registro_aprendizaje` (obligatoria), `novedades` (opcional), `publicidad_personalizada` (opcional). Código, etiqueta, descripción, obligatoria sí/no, orden. | Aviso §3, §8 |
| REQ-04 | Cada decisión se guarda como **fila independiente** en `consent_records` (`granted` / `denied` / `revoked`), append-only, con usuario, versión, huella, canal, fecha/hora de servidor, IP y user-agent cifrados + HMAC, y encadenamiento de integridad. | Aviso §8 nota; Anexo "Evidencia" |
| REQ-05 | IP obtenida **solo en servidor** de la cabecera del proxy de confianza. IPv4/IPv6 normalizada. Campos `ip`/`client_ip` enviados por el cliente se ignoran y generan `security_event` de tipo `consent_ip_spoof_attempt`. | Requisito del cliente; E10 |
| REQ-06 | Registro: casillas desmarcadas por defecto; solo `registro_aprendizaje` obligatoria; botones **«Aceptar y continuar»** y **«No aceptar y salir»**; enlace a la Política de Privacidad visible **antes** de registrarse; texto cargado de la versión publicada (eliminar texto hardcodeado de `RegisterScreen.tsx`). Rechazar opcionales no impide registrarse. | Aviso §2, §3, §8; H04 |
| REQ-07 | Atomicidad: no puede existir cuenta sin evidencia de `registro_aprendizaje = granted`. Si falla la inserción de evidencia tras crear el usuario en Auth, se compensa eliminando el usuario y se responde error. | Anexo "Evidencia" |
| REQ-08 | Área "Mi privacidad" en la cuenta del usuario: ver estado vigente de cada finalidad, versión aceptada, fecha; otorgar/revocar opcionales con **un clic** (mismo esfuerzo que otorgar); revocación sin justificación. El usuario **no** ve IP ni UA (ni siquiera la suya cifrada). | Aviso §7 |
| REQ-09 | Re-consentimiento: si se publica una versión con `requires_reconsent = true`, en el siguiente inicio de sesión el usuario ve el nuevo aviso antes de continuar. Si no acepta la finalidad obligatoria, solo puede solicitar baja o cerrar sesión. | Anexo "Coherencia operativa" |
| REQ-10 | Solicitud de baja / derechos desde la cuenta (formulario) y por correo. La solicitud desde la app crea fila en `data_subject_requests`, envía correo al **correo de privacidad vigente** con asunto configurable (por defecto: *"Solicitud de baja y eliminación de datos - CiberDojo"*) y acuse al titular con número de caso y fecha límite. El correo al delegado contiene número de caso y tipo, **no** datos cifrados ni IP. | Aviso §6, §7 |
| REQ-11 | Plazo de respuesta configurable (`response_days`, por defecto 15; tipo de día configurable, ver D-03). El panel muestra casos por vencer (≤3 días) y vencidos. | Aviso §7 (art. 15 LOPDP) |
| REQ-12 | Menores: el registro pide declarar si la persona tiene 15 años o más. Si no, se bloquea el registro autónomo y se muestra el flujo de representante legal definido en D-04. No se almacena fecha de nacimiento salvo que D-04 lo decida. | Aviso §9 |
| REQ-13 | **Panel admin → sección "Consentimiento informado"** con pestañas: (a) Versiones: lista, estado, fechas, autor, publicador, nº de aceptaciones; (b) Editor de borrador en Markdown con vista previa renderizada con los marcadores resueltos y editor de finalidades; (c) Comparar versiones (diff línea a línea); (d) Publicar/retirar con motivo obligatorio y confirmación escribiendo el número de versión; (e) Configuración del responsable y delegado; (f) Bitácora; (g) Solicitudes de derechos; (h) Evidencia. | Requisito del cliente |
| REQ-14 | Configuración (`privacy_settings`): nombre/razón social del responsable, domicilio, teléfono, **correo de privacidad y baja**, nombre y contacto del delegado (DPO), asunto de baja, `response_days`, `ip_retention_days`, URL de Política de Privacidad. Cada guardado crea nueva `settings_version`. | Aviso §1; Anexo "Identificación" |
| REQ-15 | Cambio del correo de privacidad: el nuevo correo queda `pending` hasta confirmarse con un código de 6 dígitos (válido 30 min, guardado como hash) enviado a esa dirección. Solo entonces se activa. Evita desviar solicitudes de baja a un buzón erróneo. | Robustez del canal |
| REQ-16 | **Bitácora administrativa** (`admin_audit_log`): toda creación/edición/publicación/retiro de aviso, cambio de configuración, revelación de IP, cambio de estado de solicitud y exportación. Guarda actor individual, rol, acción, entidad, `before`/`after` (JSON), diff, motivo, IP del admin cifrada + HMAC, fecha, hash encadenado. Append-only. Filtros por fecha, actor, acción; exportación CSV (la exportación también se registra). | Requisito del cliente; H08 |
| REQ-17 | Evidencia (panel): búsqueda por correo del titular (vía HMAC, nunca `ILIKE` sobre cifrado) o por ID de usuario; muestra historial de decisiones, versión, huella, fecha, canal e IP **enmascarada** (`192.0.2.xxx`, `2001:db8:xxxx::`). Botón "Revelar IP" solo para rol `privacy_admin`, exige motivo, se registra en bitácora. Exportación de expediente de un titular (para atender acceso/portabilidad) en JSON y PDF simple. | Aviso §6; Anexo "Evidencia" |
| REQ-18 | Verificación de integridad: función `verify_consent_chain()` y `verify_audit_chain()` que recorren las cadenas y reportan el primer eslabón roto. Botón en el panel y test automatizado. | Integridad de evidencia |
| REQ-19 | Retención: job programado (pg_cron o función invocada por scheduler con secreto propio) que, tras `ip_retention_days`, pone a NULL `ip_ciphertext` y `ua_ciphertext` preservando HMAC y el resto de la fila. Es la única mutación permitida sobre `consent_records` y se hace mediante función `SECURITY DEFINER` con registro en bitácora. | Aviso §5; Anexo "Conservación" |
| REQ-20 | Tras una baja atendida, los datos de cuenta se eliminan/anonimizan según la política, pero la evidencia de consentimiento se conserva seudonimizada (user_id → HMAC) durante el plazo de evidencia que fije D-02, y luego se purga. | Aviso §5, §7 |

## 4. Requisitos de seguridad

| ID | Requisito | Origen |
|---|---|---|
| SEC-01 | Funciones nuevas verifican el JWT **criptográficamente** (`supabase.auth.getUser(jwt)` o verificación JWKS) y leen rol desde BD (`admin_roles`), no desde claims sin verificar. `verify_jwt = true` en `config.toml` salvo `get-consent-notice`. | H01 |
| SEC-02 | Roles del módulo en tabla `admin_roles(user_id, role)`: `privacy_editor` (crea/edita borradores), `privacy_admin` (publica, retira, configura, revela IP, gestiona solicitudes), `privacy_auditor` (solo lectura de bitácora y evidencia enmascarada). Opción de "cuatro ojos": si `four_eyes_publish = true`, quien editó el borrador no puede publicarlo. | H08; ISO A.3 |
| SEC-03 | El panel `central-admin-app` debe operar con la **sesión del administrador individual** (JWT de Supabase Auth del admin, con MFA si está disponible) para este módulo; el proxy con service role no se usa para estas rutas. Ver D-01. | H08 |
| SEC-04 | Criptografía en `_shared/crypto.ts` (nuevo o refactor de `_shared/pii.ts` manteniendo compatibilidad): AES-256-GCM, IV aleatorio de 12 bytes, formato `v{n}.{iv_b64}.{ct_b64}` (el tag va incluido en `ct` en WebCrypto). Claves `PII_ENC_KEY_V{n}` (32 bytes base64), clave activa `PII_ENC_ACTIVE_VERSION`. HMAC-SHA256 con clave **distinta** `LOOKUP_HMAC_KEY`. AAD = `tabla:columna:user_id` para impedir mover cifrados entre filas. Lectura soporta todas las versiones registradas. | H15; E01 |
| SEC-05 | Nada de cifrado con clave en SQL (`pgp_sym_encrypt` con clave literal) ni claves en el frontend. | Buenas prácticas |
| SEC-06 | RLS: `consent_records`, `admin_audit_log`, `data_subject_requests` sin políticas de UPDATE/DELETE para ningún rol de cliente; `REVOKE UPDATE, DELETE` a `anon`, `authenticated`; trigger `BEFORE UPDATE OR DELETE` que lanza excepción salvo bandera de sesión puesta por la función de retención. El usuario solo lee sus propios `consent_records` a través de una vista sin columnas de IP/UA. | E02 |
| SEC-07 | Rate limit en `submit-consent`, `update-my-consent`, `request-data-subject-right` y confirmación de correo, con clave HMAC (no correo/IP en claro) y **fail-closed** en endpoints de escritura si la RPC de cuota falla. | H15 |
| SEC-08 | Validación de entrada con esquema (zod o equivalente ya usado en el repo); Markdown del aviso sanitizado al renderizar (sin HTML crudo, sin `javascript:`), tamaño máximo 100 KB. | OWASP |
| SEC-09 | Correos: plantillas sin datos cifrados, sin IP, sin enlaces con tokens de larga duración; cabeceras anti-inyección (sin saltos de línea en asunto). | Minimización |

## 5. Modelo de datos (orientativo; adaptarlo a convenciones del repo)

```sql
-- Configuración versionada (una fila vigente, historial completo)
create table privacy_settings (
  id bigint generated always as identity primary key,
  settings_version int not null unique,
  controller_name text,           -- responsable legal
  controller_address text,
  controller_phone text,
  privacy_email text not null,    -- correo de privacidad y baja (activo)
  privacy_email_pending text,     -- en verificación (REQ-15)
  privacy_email_code_hash text,
  privacy_email_code_expires_at timestamptz,
  dpo_name text,
  dpo_contact text,
  unsubscribe_subject text not null default 'Solicitud de baja y eliminación de datos - CiberDojo',
  response_days int not null default 15 check (response_days between 1 and 90),
  response_day_type text not null default 'calendario' check (response_day_type in ('calendario','habiles')),
  ip_retention_days int not null default 730 check (ip_retention_days >= 0),
  privacy_policy_url text,
  four_eyes_publish boolean not null default false,
  is_current boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create unique index on privacy_settings (is_current) where is_current;

create table consent_documents (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,               -- '1.0', '1.1', '2.0'
  title text not null,
  content_md text not null check (length(content_md) <= 100000),
  content_sha256 text not null,               -- del Markdown con marcadores
  purposes jsonb not null,                    -- [{code,label,description,required,order}]
  status text not null check (status in ('draft','published','retired')),
  requires_reconsent boolean not null default false,
  change_summary text,
  based_on_id uuid references consent_documents(id),
  created_by uuid not null, created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz,
  published_by uuid, published_at timestamptz,
  retired_by uuid, retired_at timestamptz
);
create unique index one_published on consent_documents (status) where status = 'published';
-- trigger: si OLD.status <> 'draft' => prohibir cambios en content_md, purposes, version, title

create table consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  user_ref_hmac text,                         -- para seudonimizar tras baja (REQ-20)
  document_id uuid not null references consent_documents(id),
  document_version text not null,
  rendered_sha256 text not null,
  settings_version int not null,
  purpose_code text not null,
  decision text not null check (decision in ('granted','denied','revoked')),
  channel text not null check (channel in ('registro','reconsentimiento','mi_privacidad','correo','admin')),
  ip_ciphertext text,                         -- v{n}.iv.ct ; NULL tras retención
  ip_hmac text not null,
  ua_ciphertext text,
  ua_hmac text,
  key_version int not null,
  server_ts timestamptz not null default now(),
  prev_hash text,
  row_hash text not null                      -- sha256(prev_hash || canonical_json(fila sin row_hash))
);
create index on consent_records (user_id, purpose_code, server_ts desc);
create index on consent_records (ip_hmac);

create view my_consent_state as ...          -- último estado por finalidad, SIN ip/ua, filtrado por auth.uid()

create table admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null, actor_email_hmac text not null, actor_role text not null,
  action text not null,        -- consent.draft.create|update, consent.publish, consent.retire,
                               -- settings.update, settings.email.verify, evidence.reveal_ip,
                               -- evidence.export, dsr.status_change, audit.export
  entity text not null, entity_id text,
  before jsonb, after jsonb, diff text,
  reason text,                 -- obligatorio para publish, retire, reveal_ip, export, settings.update
  ip_ciphertext text, ip_hmac text, key_version int,
  created_at timestamptz not null default now(),
  prev_hash text, row_hash text not null
);

create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,           -- 'CD-2026-000123'
  user_id uuid, email_ciphertext text, email_hmac text not null,
  request_type text not null check (request_type in
    ('baja','acceso','rectificacion','eliminacion','oposicion','suspension','portabilidad','revocacion','decision_automatizada')),
  details_ciphertext text,
  channel text not null check (channel in ('app','correo')),
  status text not null default 'recibida' check (status in
    ('recibida','requiere_aclaracion','en_proceso','atendida','rechazada_con_motivo')),
  routed_to_email text not null,              -- correo de privacidad vigente al recibirla
  settings_version int not null,
  received_at timestamptz not null default now(),
  due_at timestamptz not null,
  resolved_at timestamptz, resolution_note_ciphertext text,
  ip_ciphertext text, ip_hmac text, key_version int
);

create table admin_roles (user_id uuid, role text check (role in
  ('privacy_editor','privacy_admin','privacy_auditor')), granted_by uuid, granted_at timestamptz default now(),
  primary key (user_id, role));
```

Canonicalización para `row_hash`: JSON con claves ordenadas alfabéticamente, timestamps en ISO-8601
UTC con microsegundos, sin espacios. Calcular en la función PL/pgSQL de inserción (trigger
`BEFORE INSERT`) con bloqueo `pg_advisory_xact_lock` para serializar la cadena.

## 6. Superficie de API (Edge Functions; reutilizar nombres existentes si ya hay equivalentes)

| Función | Auth | Propósito |
|---|---|---|
| `get-consent-notice` | pública | Devuelve versión publicada: `document_id`, `version`, `rendered_md`, `rendered_sha256`, `settings_version`, `purposes`, `privacy_policy_url`. Cache corta (60 s). |
| `secure-register-user` (modificar) | pública + rate limit | Recibe datos de registro + `{document_id, rendered_sha256, settings_version, decisions:[{purpose_code, decision}], age_gate}`. Valida que la huella coincide con la versión vigente (si no: 409 `NOTICE_CHANGED`). Crea usuario y evidencia de forma atómica (REQ-07). |
| `submit-consent` | usuario | Re-consentimiento (REQ-09). |
| `update-my-consent` | usuario | Otorgar/revocar opcionales (REQ-08). |
| `request-data-subject-right` | usuario | Crea caso, envía correos (REQ-10). |
| `admin-consent` | admin con rol | Acciones: `list_versions`, `get_version`, `create_draft`, `update_draft`, `diff`, `preview`, `publish`, `retire`, `get_settings`, `update_settings`, `start_email_verification`, `confirm_email_verification`, `list_audit`, `export_audit`, `search_evidence`, `reveal_ip`, `export_subject_file`, `list_requests`, `update_request_status`, `verify_chains`. Cada acción valida rol y escribe bitácora. |
| `consent-retention-job` | secreto de scheduler dedicado | REQ-19. |

**Obtención de IP (REQ-05):** implementar `getClientIp(req)` en `_shared/client-ip.ts`. Antes de
codificar, T03 debe **comprobar empíricamente** en el entorno local/staging qué cabeceras llegan a la
Edge Function (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`) y documentar cuál es la fiable y en
qué posición de la cadena. Para el panel Node, usar `req.ip` con `app.set('trust proxy', <n saltos
exactos>)` según la topología real del servidor de la politécnica; nunca `trust proxy = true` a ciegas.

## 7. Trazabilidad con los hallazgos de la evaluación

| Hallazgo | Cómo lo aborda este módulo |
|---|---|
| E01 (consentimiento, cifrado PII, aviso versionado) | Se conserva y se amplía: versionado en BD, evidencia por finalidad, huella del texto. |
| E10 (HMAC de IP, cuotas) | Se reutiliza `_shared/security-events.ts` y `_shared/rate-limit.ts`, corrigiendo la clave del bucket. |
| H01 | Funciones nuevas con verificación criptográfica; test de token manipulado. |
| H04 | Aviso visible y editable, sección IA y proveedores del aviso; se eliminan textos hardcodeados. |
| H08 | Identidad individual, roles, bitácora con actor. |
| H14 | T98 actualiza `SECURITY_PRIVACY.md`, manual administrativo y `BASE_DE_DATOS.md` para este módulo. |
| H15 | Versionado de claves, separación enc/HMAC, rotación probada, fail-closed. |
