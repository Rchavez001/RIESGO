# Manual de ciberseguridad de la implementacion

Fecha de revision: 2026-06-23  
Proyecto: Shield Ecuador / Ciber Dojo

## 1. Resumen ejecutivo

La aplicacion combina tres superficies principales:

- Frontend Ciber Dojo: aplicacion React para registro, autenticacion, evaluaciones, katas, scanner educativo y consultas IA.
- Supabase: autenticacion, base de datos, Row Level Security, Edge Functions, cifrado de datos personales y agentes defensivos.
- Central Admin: aplicacion administrativa Node/HTML para gestionar dojos, preguntas, usuarios, agentes, campanas e inteligencia de amenazas T-Pot.

Conclusion principal: lo implementado en la app administrativa no es un honeypot por si mismo. La app administrativa es un panel de consulta, normalizacion, sanitizacion, reporte y auditoria sobre datos de un T-Pot externo o Elasticsearch/OpenSearch externo. Si no existe `TPOT_ELASTIC_URL`, el sistema funciona en modo demo con eventos simulados. El honeypot real seria una instalacion separada de T-Pot, no esta dentro de esta aplicacion.

El scanner del frontend tampoco es un escaneo activo de red. Es un diagnostico local y educativo basado en senales disponibles en el navegador: HTTPS, version aproximada de sistema/navegador, soporte Web Crypto, WebAuthn, cookies, localStorage, service worker y heuristicas de sesion. No ejecuta Nmap, no prueba puertos remotos, no explota vulnerabilidades y no inspecciona archivos del dispositivo.

## 2. Alcance revisado

Se revisaron las siguientes areas del repositorio:

- `frontend/src`: autenticacion, scanner, Supabase client, pantallas de usuario y admin tenant.
- `central-admin-app`: servidor Node, frontend administrativo y servicio T-Pot.
- `supabase/functions`: registro seguro, lectura de perfil privado, migracion PII, scanner IA, agentes de noticias/incidentes.
- `supabase/migrations`: esquema, RLS, hardening, cifrado PII e integracion T-Pot.
- `docs/TPOT_INTEGRATION.md` y `SECURITY_PRIVACY.md`: documentacion existente comparada contra el codigo.

## 3. Arquitectura de seguridad

### 3.1 Frontend publico

El frontend usa Supabase con `REACT_APP_SUPABASE_URL` y `REACT_APP_SUPABASE_ANON_KEY`. La clave anonima es publica por diseno, por lo que la proteccion real depende de:

- Supabase Auth para identidad.
- RLS en tablas.
- Edge Functions para operaciones sensibles.
- No exponer `service_role` en el navegador.

El registro no escribe directamente los datos personales en la tabla `users`; llama a la Edge Function `secure-register-user`.

### 3.2 Supabase

Supabase concentra:

- Autenticacion de usuarios.
- Base de datos Postgres.
- Politicas RLS.
- Edge Functions con `SUPABASE_SERVICE_ROLE_KEY` para tareas privilegiadas.
- Cifrado y descifrado de PII en funciones controladas.
- Auditoria de eventos sensibles en `security_audit_events`.

### 3.3 Central Admin

`central-admin-app/server.js` sirve la UI administrativa y expone:

- Proxy a Supabase REST/Auth con `SUPABASE_SERVICE_ROLE_KEY`.
- Endpoints `/api/admin/tpot/*` para consultar T-Pot/Elastic.
- Basic Auth mediante `CENTRAL_ADMIN_USER` y `CENTRAL_ADMIN_PASSWORD`.
- Rate limiting simple en memoria para endpoints T-Pot.

Riesgo importante: como el proxy usa `service_role`, si el Basic Auth o el despliegue administrativo se compromete, el atacante podria acceder con privilegios elevados a Supabase desde esa superficie. Para produccion conviene poner el admin detras de Cloud Run/IAP, VPN, SSO con MFA, allowlist de IP y logs centralizados.

## 4. Autenticacion y autorizacion

### 4.1 Usuarios finales

El frontend usa `supabase.auth.signInWithPassword`. Para registro usa `secure-register-user`, que valida:

- Email con formato correcto.
- Contrasena entre 8 y 128 caracteres.
- Nombre completo minimo.
- Tipo de negocio permitido.
- Consentimiento de tratamiento de datos.

Luego crea el usuario en Supabase Auth mediante API admin y guarda el perfil cifrado en `public.users`.

### 4.2 Administradores

Hay dos modelos:

- En Supabase, el rol aplicativo esta en `users.role` con valores `user`, `admin`, `analyst`.
- En `central-admin-app`, el acceso HTTP se protege con Basic Auth si existen `CENTRAL_ADMIN_USER` y `CENTRAL_ADMIN_PASSWORD`.

Las politicas SQL usan la funcion `public.is_admin()`, que valida que `auth.uid()` corresponda a un usuario con `role = 'admin'`.

### 4.3 RLS

El proyecto habilita Row Level Security para tablas principales:

- `users`
- `evaluations`
- `kata_completions`
- `email_analysis`
- `alert_deliveries`
- `alerts`
- `katas`
- `questions`
- `domains_whitelist`
- tablas administrativas y de T-Pot

Patrones principales:

- El usuario solo puede ver/insertar datos propios en perfiles, evaluaciones, katas completadas y analisis de email.
- Alertas, katas, preguntas y dominios activos son consultables publicamente segun su politica.
- Admins pueden gestionar contenido, agentes, dojos, campanas, preguntas y datos T-Pot.
- El `service_role` puede insertar auditorias y operar funciones privilegiadas.

## 5. Proteccion contra manipulacion de perfil

La migracion `005_security_hardening.sql` agrega un trigger `prevent_user_security_field_tampering` sobre `users`.

Este trigger evita que un usuario normal modifique directamente:

- `role`
- `belt`
- `current_risk_level`
- `last_evaluation_at`

En inserciones fuerza `role = 'user'` salvo cuando opera `service_role` o un admin.

## 6. Datos personales y niveles de cifrado

### 6.1 Datos protegidos

Los campos PII definidos para cifrado son:

- `email_encrypted`
- `full_name_encrypted`
- `phone_encrypted`
- `location_city_encrypted`
- `location_province_encrypted`

Los campos en claro antiguos se minimizan:

- `email` queda enmascarado como `<user_id>@private.local`.
- `full_name`, `phone`, `location_city`, `location_province` quedan `null` durante registro seguro o migracion.
- `business_type` queda en claro como categoria estadistica no identificativa.

Nota: el email tambien existe dentro de Supabase Auth porque se necesita para login, recuperacion de contrasena y autenticacion.

### 6.2 Cifrado de contenido

Las Edge Functions `secure-register-user`, `get-private-profile` y `migrate-user-pii` implementan cifrado de PII con:

- Algoritmo: AES-256-GCM.
- Clave: 32 bytes desde `PII_ENCRYPTION_KEY_B64`.
- IV: 12 bytes aleatorios por operacion.
- Tag de autenticacion: 128 bits.
- Formato almacenado: JSON con `v`, `alg`, `iv`, `tag`, `ct`.
- Version de clave: `pii_key_version`.

AES-GCM aporta confidencialidad e integridad: si el texto cifrado, IV o tag se alteran, el descifrado falla.

### 6.3 Busqueda exacta de email

Para detectar cuentas existentes sin guardar el email en claro se usa:

- HMAC-SHA-256 del email normalizado.
- Campo: `email_lookup_hmac`.
- Codificacion: base64url.

Esto permite busqueda exacta irreversible por email. No permite busquedas parciales ni recuperar el email desde el HMAC.

Observacion tecnica: actualmente AES y HMAC derivan de la misma clave base `PII_ENCRYPTION_KEY_B64`. Es funcional, pero una mejora recomendada es separar claves: una para cifrado y otra para HMAC.

### 6.4 Descifrado controlado

`get-private-profile` descifra datos solo cuando:

- El usuario autenticado solicita su propio perfil.
- Un admin solicita el perfil de otro usuario.

Cada lectura privada registra auditoria `private_profile_read`. Los intentos no autorizados registran `private_profile_denied`.

### 6.5 Migracion de PII historica

`migrate-user-pii` migra perfiles antiguos:

- Cifra email, nombre, telefono, ciudad y provincia.
- Reemplaza email por `<id>@private.local`.
- Borra campos personales en claro.
- Es ejecutable por admin autenticado o por `x-cron-secret`.

## 7. Auditoria y trazabilidad

### 7.1 Auditoria de privacidad

La tabla `security_audit_events` registra:

- Registro completado.
- Fallos de registro.
- Lectura de perfil privado.
- Denegaciones de lectura.
- Lotes de migracion PII.

En registro se guardan hashes de IP y User-Agent, no valores crudos.

### 7.2 Auditoria T-Pot

La migracion `013_tpot_integration.sql` define tablas persistentes:

- `tpot_query_audit`
- `tpot_ai_analysis_jobs`
- `tpot_iocs_cache`
- `tpot_integration_settings`

Sin embargo, el servicio actual `central-admin-app/tpotService.js` mantiene jobs, auditoria e IOCs en memoria (`MEMORY_JOBS`, `MEMORY_AUDIT`, `MEMORY_IOCS`). Por tanto, en el estado actual:

- La auditoria T-Pot se pierde al reiniciar el proceso.
- Los jobs IA no quedan persistidos en Supabase.
- Las tablas estan preparadas, pero no integradas como almacenamiento real del servicio Node.

## 8. Honeypot, T-Pot y monitoreo

### 8.1 Que es T-Pot en esta arquitectura

T-Pot es una plataforma externa de honeypots. En una instalacion real puede incluir sensores como Cowrie, Dionaea, Suricata, Heralding y otros componentes para capturar intentos de ataque contra servicios expuestos controladamente.

En este proyecto, la app administrativa no instala ni ejecuta T-Pot. Solo consulta indices permitidos desde un Elastic/OpenSearch externo cuando se configura `TPOT_ELASTIC_URL`.

### 8.2 Que hace realmente la app administrativa

El backend administrativo:

- Consulta eventos desde Elastic/OpenSearch.
- Limita indices a una lista permitida.
- Normaliza campos de eventos.
- Sanitiza correos, tokens, JWT, secretos y passwords.
- Enmascara credenciales intentadas.
- Extrae IOCs defensivos: IP, dominio, URL, hash, puerto, payload y credenciales enmascaradas.
- Construye resumenes por severidad, sensor, IP origen, pais, puerto, protocolo y user-agent.
- Mapea patrones a MITRE ATT&CK de forma defensiva.
- Genera reportes ejecutivos, tecnicos y educativos.
- Ejecuta analisis IA local defensivo o placeholder de proveedor externo.
- Audita la salida IA antes de mostrarla o aprobarla.

### 8.3 Que no hace

La app administrativa no hace lo siguiente:

- No despliega honeypots.
- No abre puertos trampa.
- No intercepta trafico por si sola.
- No ejecuta comandos sobre T-Pot.
- No corre Nmap ni escaneos ofensivos.
- No explota vulnerabilidades.
- No modifica ni elimina indices Elastic.
- No bloquea atacantes automaticamente.

### 8.4 Modo demo

Si `TPOT_ELASTIC_URL` no esta configurado, `tpotService.js` devuelve eventos mock:

- SSH brute force en Cowrie.
- Login Telnet.
- Alerta Suricata tipo scan.
- Captura malware Dionaea.
- Fuzzing HTTP Heralding.

Esto sirve para probar la UI, no representa telemetria real.

## 9. Scanner de vulnerabilidades del frontend

### 9.1 Naturaleza del scanner

El scanner implementado en `frontend/src/components/VulnScanner` y `frontend/src/data/scanChecks.ts` es un scanner local, pasivo y educativo. Evalua indicadores disponibles desde el navegador:

- Uso de HTTPS.
- Tipo efectivo de conexion.
- Sistema operativo y navegador detectados.
- Version de navegador comparada contra umbrales locales.
- Cookies y localStorage.
- Do Not Track.
- IndexedDB y ServiceWorker.
- Web Crypto API.
- WebAuthn.
- Page Visibility API.

### 9.2 Limitaciones

No puede garantizar el estado real del equipo porque el navegador no permite inspeccionar:

- Parches completos del sistema operativo.
- Antivirus o EDR.
- Firewall local.
- Procesos activos.
- Malware.
- Puertos abiertos del equipo.
- Configuracion de router.
- Red interna.

Las conclusiones deben presentarse como diagnostico orientativo, no como pentest ni auditoria tecnica completa.

### 9.3 IA del scanner

Cuando se solicita una recomendacion, el frontend llama a una funcion IA:

- Modo `sensei`: genera recomendacion simple para usuarios no tecnicos.
- Modo `auditor`: valida que la respuesta sea clara, segura, no ofensiva y accionable.

Si no hay IA o falla la auditoria, existe fallback local con recomendaciones basicas.

## 10. Controles de sanitizacion y minimizacion

### 10.1 T-Pot

El servicio T-Pot aplica:

- Redaccion de emails.
- Redaccion de JWT.
- Redaccion de tokens, API keys, bearer tokens y secrets.
- Redaccion de passwords.
- Truncamiento de textos largos.
- Hash SHA-256 para IOCs.
- Enmascaramiento de IPs en indicadores mostrados.
- Enmascaramiento de usuarios y passwords intentados.

### 10.2 PII

La PII se cifra en Edge Functions, no en el frontend. Esto reduce el riesgo de exponer claves criptograficas al navegador.

### 10.3 Logs

Los eventos de auditoria no guardan payloads completos ni datos descifrados. En registro se guarda metadata minima y hashes de IP/User-Agent.

## 11. Seguridad de IA

El proyecto incluye varias barreras:

- Prompts defensivos que prohiben informacion danina.
- Auditor IA para respuestas del scanner.
- Auditor local para resultados T-Pot que detecta secretos y contenido ofensivo.
- Ocultamiento de salida IA no aprobada cuando `AI_OUTPUT_REQUIRES_APPROVAL=true`.
- Flujo de aprobar/rechazar analisis T-Pot.

Limitacion: el `callAiProvider` de T-Pot es actualmente un placeholder defensivo que devuelve analisis local; no integra realmente un proveedor externo aunque existan variables `AI_PROVIDER` y `AI_API_KEY`.

## 12. Controles de red y despliegue

### 12.1 TLS

La aplicacion depende de HTTPS del hosting, Supabase y endpoints externos. En T-Pot existe variable `TPOT_VERIFY_TLS`, pero el codigo Node usa `fetch` estandar y no implementa una logica explicita para desactivar/verificar TLS. En la practica, Node valida TLS por defecto.

### 12.2 CORS

Varias Edge Functions usan:

```text
Access-Control-Allow-Origin: *
```

Esto no equivale a acceso anonimo porque las funciones sensibles validan token o secreto, pero en produccion es mejor restringir origenes a dominios oficiales.

### 12.3 Secretos

Secretos esperados:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PII_ENCRYPTION_KEY_B64`
- `PII_MIGRATION_SECRET` o `CRON_SECRET`
- `GEMINI_API_KEY`
- `CENTRAL_ADMIN_USER`
- `CENTRAL_ADMIN_PASSWORD`
- Credenciales/API token T-Pot/Elastic

Estos secretos deben vivir en Supabase Secrets, Cloud Run env vars o un secret manager, nunca en frontend ni repositorio.

## 13. Riesgos y brechas observadas

1. El repositorio contiene archivos de configuracion `.gcloud-config` y referencias a bases de credenciales locales. Deben excluirse del repositorio y rotarse credenciales si fueron compartidas.
2. Existe un archivo de clave/credencial administrativa en la raiz (`clave admistrador nubel.txt`) y una imagen relacionada. Deben moverse fuera del repo y rotar cualquier secreto contenido ahi.
3. `central-admin-app` usa Basic Auth. Para produccion se recomienda SSO/MFA, Cloud Run IAP, VPN o allowlist de IP.
4. El proxy administrativo usa `SUPABASE_SERVICE_ROLE_KEY`; debe estar estrictamente aislado.
5. El rate limit de T-Pot es en memoria; no resiste reinicios ni multiples instancias.
6. La auditoria y jobs T-Pot estan en memoria aunque ya existen tablas para persistencia.
7. `TPOT_API_BASE_URL` se lee en configuracion, pero el codigo real consulta `TPOT_ELASTIC_URL`; no hay cliente API T-Pot separado.
8. La rotacion PII esta preparada con `pii_key_version`, pero no hay soporte multi-key para descifrar versiones antiguas.
9. AES y HMAC usan la misma clave raiz. Separar claves reduciria impacto ante compromiso parcial.
10. CORS wildcard debe restringirse en funciones sensibles.
11. El scanner educativo puede sobreinterpretarse como auditoria completa; la UI debe aclarar que es diagnostico orientativo.

## 14. Recomendaciones priorizadas

### Alta prioridad

- Sacar `.gcloud-config`, archivos de claves y cualquier credencial del repositorio.
- Rotar credenciales expuestas o potencialmente expuestas: GCP, Supabase service role, Basic Auth admin, tokens T-Pot.
- Proteger Central Admin con SSO/MFA o Cloud Run IAP.
- Restringir el acceso de red al admin y a Elastic/OpenSearch.
- Persistir auditoria y jobs T-Pot en las tablas de `013_tpot_integration.sql`.

### Media prioridad

- Separar claves AES y HMAC.
- Implementar multi-key decrypt para rotacion real de PII.
- Restringir CORS a dominios oficiales.
- Agregar rate limiting persistente para registro, login, recuperacion y T-Pot.
- Agregar logs estructurados de seguridad sin PII.

### Baja prioridad

- Mejorar mensajes del scanner para evitar promesas absolutas.
- Documentar politica de retencion de datos.
- Agregar pruebas automaticas para RLS y funciones de PII.
- Crear playbooks de respuesta ante incidente.

## 15. Clasificacion final

| Componente | Clasificacion | Implementacion real |
| --- | --- | --- |
| Central Admin T-Pot | Consola defensiva de inteligencia de amenazas | Consulta, normaliza, sanitiza y reporta eventos T-Pot/Elastic externos |
| Honeypot | No esta implementado dentro de esta app | Debe existir como T-Pot separado |
| Scanner frontend | Diagnostico local educativo | Heuristicas de navegador/sistema, no escaneo activo |
| Cifrado PII | Implementado parcialmente y correctamente para campos definidos | AES-256-GCM + HMAC-SHA-256 en Edge Functions |
| Auditoria PII | Implementada | `security_audit_events` |
| Auditoria T-Pot | Parcial | En memoria; tablas listas pero no conectadas |
| Autorizacion DB | Implementada | RLS + `is_admin()` |
| Admin productivo | Requiere endurecimiento | Basic Auth + proxy service role |

## 16. Dictamen

La aplicacion tiene una base defensiva seria: RLS, Edge Functions privilegiadas, cifrado de PII con AES-256-GCM, HMAC para lookup, auditoria de privacidad, sanitizacion de logs T-Pot y flujos IA con auditoria. Sin embargo, la app administrativa no debe describirse como honeypot. Debe describirse como panel administrativo y consola de inteligencia defensiva que puede conectarse a un honeypot T-Pot externo.

Para produccion, el mayor foco no es la criptografia de PII, que esta bien encaminada, sino el aislamiento operacional: secretos fuera del repo, proteccion fuerte del admin, persistencia de auditoria T-Pot, rotacion de claves y control de red sobre Supabase service role y Elastic/OpenSearch.
