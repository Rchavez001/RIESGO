# Centro de Seguridad — runbook

Submodulo del panel administrativo (`central-admin-app`, pestaña **Centro de
Seguridad**) que cubre proteccion pasiva, visibilidad de eventos, alertas,
diagnostico con IA e inventario de superficie de ataque para CiberDojo.

No existe un sistema de roles propio para esta pestaña: usa el mismo modelo
de autenticacion del resto del panel (HTTP Basic Auth en `central-admin-app`,
que llama a Supabase con la service role key) mas la sesion real de un admin
de Supabase Auth como via alterna — la misma funcion compartida
`requireAdminOrScheduler` en `supabase/functions/_shared/news-agent-core.ts`
que ya usaban el agente de noticias y el campeonato.

## Donde vive cada pieza

| Requisito | Donde |
|---|---|
| RF-01 a RF-04 (rate limiting, hash de IP, logging) | `supabase/functions/_shared/{rate-limit,security-events}.ts`, usados desde `secure-register-user` (endpoint `secure-register-user`) y desde `log-login-event` (endpoint `login`) |
| RF-05 a RF-07 (panel, feed, metricas) | `central-admin-app/index.html#securityCenter`, `app.js` (`loadSecurityFeed`, `loadSecurityMetrics`) |
| RF-08 (umbrales + avisos) | tabla `security_alert_config`, funcion `save-security-alert-config`, funcion `check-security-alerts` (cron cada 15 min, ver `055_security_center_jobs.sql`) |
| RF-09 a RF-13 (diagnostico IA) | tabla `security_diagnoses`, funcion `security-diagnose` (cron semanal, lunes 08:00 UTC), feedback en `security_diagnosis_feedback` |
| RF-14 a RF-17 (EASM) | tabla `security_easm_findings`, funcion `security-easm-scan` (cron mensual, dia 1 09:00 UTC) |
| RF-18 a RF-19 (incidente -> kata) | tabla `security_kata_drafts`, funcion `security-kata-convert` (estados `borrador` -> `en_revision` -> `publicado`) |
| RF-20 (auditoria de config) | tabla `security_config_audit`, escrita solo por `save-security-alert-config` |
| Exportacion CSV/PDF | botones en el feed de eventos, generados en el navegador (`app.js`), sin backend adicional |

## Cobertura actual de endpoints en el feed

- **`secure-register-user`**: `rate_limit_exceeded`, `registration_failed`, `unhandled_exception`.
- **`login`**: `login_failed`, `otp_send_failed`, `otp_verify_failed`, `rate_limit_exceeded`.
  El login real (`signInWithPassword` / `signInWithOtp` / `verifyOtp`) llama
  directo al SDK de Supabase Auth, no a una funcion propia — no hay donde
  "engancharse" para bloquear el intento en si sin reimplementar el grant de
  autenticacion. Por eso `log-login-event` es deliberadamente solo de
  registro: el frontend (`AuthContext.tsx`, funcion `reportLoginEvent`) lo
  llama en segundo plano (fire-and-forget) despues de un fallo, nunca antes
  ni bloqueando el intento real. Si en el futuro se quiere bloquear tambien
  el login tras varios fallos, hay que decidir conscientemente cambiar el
  flujo de login para pasar por una funcion propia — no se hizo en esta fase
  por el riesgo de dejar a un usuario real bloqueado por un error de
  configuracion.

Cualquier endpoint nuevo que quieras ver en este feed necesita su propia
llamada a `checkRateLimit`/`logSecurityEvent` (o, si no puede bloquear el
flujo real como el login, solo a `logSecurityEvent` desde un lugar que se
entere del fallo) — no hay instrumentacion automatica global.

## Umbrales de alerta

Cada fila de `security_alert_config` define: severidad minima, cantidad de
eventos, ventana en minutos, y un correo (Resend) y/o webhook de aviso.
`check-security-alerts` corre cada 15 minutos via pg_cron y tambien se puede
disparar manualmente con el boton "Verificar alertas ahora". Usa
`last_triggered_at` para no reenviar el mismo aviso mientras la alerta sigue
activa — solo vuelve a notificar despues de que el conteo baje del umbral y
lo supere de nuevo.

El correo reutiliza el mismo secreto `resend_api_key` (tabla `app_secrets`)
que ya configuraron para los avisos del campeonato — no hay que configurar
una clave nueva.

## Diagnostico con IA

`security-diagnose` reutiliza la misma cadena de proveedores de IA
(Vault-backed, con fallback) que ya usa el agente de noticias — no crea una
cadena de proveedores separada. Se le pasa su propio prompt de diagnostico
(no el del agente de noticias), y valida la respuesta con Zod antes de
guardar: si el proveedor devuelve algo mal formado, el diagnostico se guarda
igual con `validation_status='partial'` para que quede visible, nunca se
descarta en silencio.

El feedback (👍/👎 por diagnostico) se guarda en
`security_diagnosis_feedback` **solo como registro** — nada en el sistema
actua automaticamente sobre ese feedback (asi lo pide el requisito RNF-11).

## Inventario EASM (mensual)

Tres verificaciones, cada una con datos reales, no inventados:

- **Buckets publicos**: consulta en vivo `storage.buckets` (via el RPC
  `list_storage_buckets`, necesario porque el esquema `storage` no esta
  expuesto a la API de PostgREST). Cualquier bucket publico que no este en el
  allowlist (`campaign-ads`, que si debe ser publico) genera un hallazgo de
  severidad alta.
- **Variables de entorno esperadas**: revisa solo si estan definidas
  (`Deno.env.get`), nunca su valor.
- **Endpoints publicos conocidos**: a diferencia de los dos anteriores, esto
  **no es introspeccion en vivo** — Supabase no ofrece una API llamable desde
  una edge function para listar las funciones desplegadas de un proyecto ni
  su `verify_jwt`. Es un allowlist mantenido a mano en
  `security-easm-scan/index.ts` (`EXPECTED_PUBLIC_ENDPOINTS`) que debe
  actualizarse junto con `supabase/config.toml` cada vez que se agregue una
  funcion con `verify_jwt = false`. Se registra cada mes como hallazgo de
  severidad baja ya resuelto, solo para dejar rastro en la auditoria.

## Incidente -> kata

Flujo de tres estados, cada transicion es una accion explicita del admin
(nada avanza solo):

1. **Borrador**: se crea a mano o desde un diagnostico ("Convertir en kata").
   Se puede editar libremente.
2. **En revision**: boton "Enviar a revision". Desde aqui se puede publicar
   o regresar a borrador ("Regresar a borrador").
3. **Publicado**: requiere elegir dojo, pregunta, respuesta correcta y
   explicacion. Al publicar se crea una fila real en `questions`
   (`source_type='incident_kata'`) — la pregunta queda indistinguible de
   cualquier otra kata para el resto de la app.

## Pruebas realizadas (no hay framework de pruebas para edge functions en
este repo — todas las funciones existentes se validan con datos reales de
prueba y se limpian despues, igual que el resto de las funciones de este
proyecto)

- `save-security-alert-config`: crear, quedar registrado en
  `security_config_audit`, editar y eliminar — verificado.
- `check-security-alerts`: sin eventos (no dispara), con eventos que superan
  el umbral (dispara y reporta el error de Resend sin caerse si no hay
  clave), y debounce (no reenvia mientras `last_triggered_at` sigue activo)
  — verificado.
- `security-diagnose`: periodo sin eventos (responde `skipped`), periodo con
  eventos reales (genera diagnostico valido en espanol) — verificado.
- `security-easm-scan`: corrida real contra el proyecto (buckets, env vars,
  endpoints) — verificado.
- `security-kata-convert`: publicar antes de "en_revision" (rechazado con
  400), flujo completo borrador -> revision -> publicado (crea la pregunta
  real), y borrador -> revision -> rechazado -> editado — verificado.

## RF-01 (WAF/CDN)

Es infraestructura, no codigo de la app: Supabase Edge Functions ya corren
detras de su propia red/CDN, y el frontend se sirve desde Cloud Run. No se
agrego un WAF dedicado en esta fase — si el Club quiere una capa adicional,
la opcion mas simple sin tocar el codigo actual es poner Cloudflare (modo
proxy) delante del dominio del frontend y de las URLs de Edge Functions.

## Limitaciones conocidas

- El inventario de "endpoints publicos" es un allowlist mantenido a mano,
  no introspeccion en vivo (ver seccion EASM arriba).
- No hay un rol de administrador propio para el Centro de Seguridad: usa el
  mismo mecanismo de autenticacion que el resto de `central-admin-app`.
