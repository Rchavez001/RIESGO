# DECISIONS · Consentimiento informado — CiberDojo

Solo un humano completa el campo "Decisión" y cambia el estado a DECIDIDA.
Claude Code puede añadir preguntas nuevas, nunca decidirlas.

---

### D-01 — Identidad individual en el panel administrativo  [ABIERTA]
Contexto: `central-admin-app` usa Basic Auth compartida y proxy con service role (H08). Sin
identidad individual, la bitácora de cambios del aviso no prueba quién hizo qué.
Opciones:
A) Login de administradores con Supabase Auth (email + TOTP) y JWT del admin hacia `admin-consent`.
B) SSO/IAP institucional de la politécnica delante del panel, propagando identidad verificada.
C) Mantener Basic Auth pero con un usuario por persona (solución transitoria, atribución débil).
Recomendación técnica: A ahora (autónomo, verificable en código); migrar a B cuando el Club
confirme la infraestructura de identidad de la institución.
Tareas bloqueadas: T05 (y por dependencia T21–T24 en su parte de atribución).
Nota (Claude, 2026-09-28): En la conversación de trabajo NO se respondió esta pregunta (la respuesta hablaba del flujo de registro). Se ha avanzado suponiendo la opción A (login individual de admin con `admin_roles`); nada de T05 está construido. Un humano debe decidirla.
Decisión:

### D-02 — Plazos de conservación  [ABIERTA]
Contexto: el aviso exige plazos justificados. Afecta IP/UA de evidencia, evidencia seudonimizada
tras baja, bitácora y solicitudes.
Propuesta a validar con asesoría legal:
- IP/UA cifrados de consentimiento: 2 años desde la decisión (`ip_retention_days = 730`).
- Evidencia de consentimiento seudonimizada tras baja: 5 años.
- Bitácora administrativa: 5 años.
- Solicitudes de derechos: 5 años desde el cierre.
Tareas bloqueadas: T17.
Nota (Claude, 2026-09-28): En la conversación se indicó "5 años" para la evidencia seudonimizada tras la baja. No se pronunciaron sobre IP/UA (730 días), bitácora ni solicitudes. Un humano debe registrarla aquí, punto por punto.
Decisión:

### D-03 — Cómputo del plazo de 15 días (art. 15 LOPDP)  [ABIERTA]
Contexto: el aviso dice "quince días de recibida la solicitud". El sistema permite calendario o
hábiles; conviene que lo fije asesoría legal. Si son hábiles, se requiere calendario de feriados
de Ecuador (tabla `holidays` administrable).
Opciones: A) calendario B) hábiles con tabla de feriados.
Recomendación técnica: B si hay duda; es la opción conservadora para calcular alertas internas
(alertar antes nunca perjudica), pero la fecha comunicada al titular debe ser la legal.
Tareas bloqueadas: ninguna (T13 implementa ambas; el valor por defecto es configurable).
Nota (Claude, 2026-09-28): En la conversación se indicó "días calendario" como valor por defecto (configurable). Un humano debe registrarla aquí; no hay tabla de feriados.
Decisión:

### D-04 — Flujo para menores de 15 años  [ABIERTA]
Contexto: aviso §9 y art. 19 del Reglamento. La app no debe permitir registro autónomo de menores
de 15 años.
Opciones:
A) Bloquear el registro de menores de 15 y mostrar mensaje para que un representante lo gestione
   por correo (mínimo viable, sin datos adicionales).
B) Flujo de consentimiento del representante (correo del representante + confirmación), con
   evidencia propia.
C) Restringir la plataforma a mayores de 15 años.
Recomendación técnica: A para esta entrega; B como proyecto aparte con evaluación de impacto.
Tareas bloqueadas: T18 (solo la parte de puerta de edad; el resto avanza).
Nota (Claude, 2026-09-28): En la conversación se indicó la opción A (bloquear + instrucciones por correo). Implementado así en `secure-register-user` y `RegisterScreen`. Un humano debe registrarla aquí.
Decisión:

### D-05 — Proveedor de correo saliente  [ABIERTA si T00 no encuentra uno]
Contexto: se necesita enviar al delegado, acuses al titular y códigos de verificación.
Opciones: A) el que ya use el repo B) Resend C) SMTP institucional de la politécnica D) SendGrid.
Recomendación técnica: SMTP institucional si el Club asume la operación (dominio propio, SPF/DKIM
del dominio de la institución); si no, Resend por simplicidad desde Deno.
Tareas bloqueadas: T12, T13 (envío real; con FakeEmailSender se pueden avanzar las pruebas).
Nota (Claude, 2026-09-28): Hallazgo de T00: el repo YA usa Resend (clave `resend_api_key` en Vault vía `app_secrets`; `championship-draw-round1`, `check-security-alerts`). Con eso esta decisión no debería bloquear T12/T13; falta confirmar que se reutiliza y con qué remitente/dominio.
Decisión:

### D-06 — ¿El correo al delegado incluye el correo del titular?  [ABIERTA]
Contexto: minimización vs. operatividad. Sin el correo, el delegado debe entrar al panel para ver
el caso (más seguro, deja rastro en bitácora). Con él, puede responder directo desde su buzón.
Recomendación técnica: no incluirlo; el correo contiene número de caso y enlace al panel.
Tareas bloqueadas: ninguna (valor por defecto: no incluir).
Decisión:

### D-07 — Responsable legal y datos del aviso  [ABIERTA — no bloquea código]
Contexto: el aviso tiene campos "[por completar]" (responsable, domicilio, teléfono, delegado). Con
la cesión prevista al Club de Ciberseguridad, debe definirse quién es el responsable del
tratamiento. El anexo advierte no atribuir la responsabilidad al titular del correo de contacto.
Acción: completar en el panel (T23) antes de publicar en producción; el sistema debe impedir
publicar una versión con marcadores sin resolver.
Decisión:

### D-08 — ¿Qué cabecera trae la IP real del titular en Supabase hospedado?  [ABIERTA]
Contexto: medido en LOCAL (proxy Kong): añade la IP real AL FINAL de `X-Forwarded-For` y deja delante lo que envíe el cliente; `X-Real-IP` la fija el proxy. La primera entrada es falsificable. Falta medir el hospedado (probablemente hay Cloudflare delante). Afecta la IP de la evidencia (REQ-05), el rate limit y `security_events` (T03-sec).
Método (sin desplegar nada): consulta del Logs Explorer sobre `function_edge_logs`; solo si no alcanza, una función de diagnóstico temporal con JWT de admin. Ver `.claude/loops/consentimiento/diag/README.md`.
Opciones: A) `cf-connecting-ip` B) posición fija en `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`) C) `X-Real-IP`
Recomendación técnica: la que resulte de la medición; sin medir, no cambiar el rate limit (con la topología equivocada todos compartirían un bucket).
Tareas bloqueadas: T03-prod, T03-sec, T99 (paso a producción).
Decisión:

### D-09 — Formato de los textos cifrados: ¿se mantiene el JSON existente o se adopta `v{n}.{iv}.{ct}` de la SPEC?  [ABIERTA]
Contexto: SEC-04 y T02 piden `v{n}.{iv}.{ct}`. En producción ya hay columnas cifradas con el JSON `{v,alg,iv,tag,ct}` (`users.email_encrypted`, etc., leídas por varias funciones). Se implementó `_shared/crypto.ts` reutilizando ese JSON (añade `aad:true`) para no tener dos formatos incompatibles en la misma base.
Opciones: A) mantener el JSON existente (implementado) B) formato `v{n}.{iv}.{ct}` solo para las columnas nuevas y migrar las viejas después (T02-extra) C) `v{n}.{iv}.{ct}` para todo, con migración de las columnas existentes
Recomendación técnica: A por ahora; B/C solo si hay una razón concreta, porque obligan a re-cifrar producción.
Tareas bloqueadas: ninguna (T02 queda con esta desviación anotada).
Decisión:
