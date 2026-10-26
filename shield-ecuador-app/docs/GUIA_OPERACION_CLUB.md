# Guía de operación para el club Phycom — CiberDojo

Documento nuevo (2026-10-26, tarea `DOCS-13` de `loop-docs/TASKS.md`). Pensado para quien el club
ESPOL Cybersecurity Club (Phycom) ponga a operar el día a día de CiberDojo **sin** tener que leer
los documentos técnicos completos primero: qué hace cada parte del sistema, cómo se despliega, y
qué revisar con regularidad. No repite el detalle técnico de los documentos especializados — los
cita. Todo lo escrito aquí está verificado contra el código y las migraciones citadas en cada
sección.

## 1. Qué hace cada parte del sistema

Tres piezas (detalle completo en `ARQUITECTURA_CYBER_DOJO.md`; resumen de orientación también en
`vault/Arquitectura/Visión general.md`):

- **`frontend/`** — la app React que usan los estudiantes. Se sirve en producción con
  `static-server.js` sobre el build de `react-scripts`. Cloud Run: servicio `cyberdojo`.
- **`central-admin-app/`** — la consola administrativa que usa el club, un servidor Node.js propio
  (`server.js`, sin framework). Cloud Run: servicio `cyberdojo-admin`. Protegida con HTTP Basic
  Auth compartida (`CENTRAL_ADMIN_USER`/`CENTRAL_ADMIN_PASSWORD`, un solo usuario para todo el
  club) — excepto el módulo de consentimiento informado (pestaña "Consentimiento informado"), que
  exige cuenta individual de Supabase Auth más TOTP por administrador (ver
  `docs/MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md` sección 4.4).
- **Supabase** (Postgres + Auth + Edge Functions + Storage + Vault + `pg_cron`) — toda la lógica de
  datos y automatización. Migraciones en `supabase/migrations/*.sql` (82 archivos reales, `001` a
  `084`, con huecos en `023` y `033`); Edge Functions en `supabase/functions/*/index.ts` (33
  carpetas, sin contar `_shared`).

`central-admin-app/server.js` nunca expone la `service_role key` al navegador del club: su propio
servidor hace de proxy (`proxySupabase()`) inyectando esa clave en las llamadas REST/Edge Function
del panel. El módulo de consentimiento es la excepción: usa el JWT de la sesión individual del
administrador, no el proxy con `service_role` (ver sección 3.5 más abajo).

## 2. Cómo se despliega

Ambos servicios tienen hoy su propio `Dockerfile` (`frontend/Dockerfile`,
`central-admin-app/Dockerfile`) — **ya no es cierto que el frontend se despliegue por Buildpacks de
Cloud Build sin `Dockerfile` propio**; eso cambió con el commit `217140f` (2026-09-28). Ver
`GUIA_LEVANTAMIENTO_PROYECTO.md` sección 15 para el detalle completo de esta corrección y el
`[VERIFICAR]` abierto sobre qué revisión exacta de Cloud Run está activa hoy (`DOC-07` en
`loop-docs/DECISIONS.md`).

Comandos reales de despliegue (detalle completo, incluidas variables de entorno y habilitación de
APIs de Google Cloud, en `GUIA_LEVANTAMIENTO_PROYECTO.md` sección 22):

```bash
gcloud run deploy cyberdojo --source frontend --region us-central1 --allow-unauthenticated
gcloud run deploy cyberdojo-admin --source central-admin-app --region us-central1 --allow-unauthenticated
```

El servicio `cyberdojo` (frontend) también expone el panel admin en `/admin` de su propio dominio,
reenviando la petición completa (incluido el header `Authorization`) al servicio `cyberdojo-admin`
— ver `ARQUITECTURA_CYBER_DOJO.md` sección 2 y `GUIA_LEVANTAMIENTO_PROYECTO.md` línea 944.

Para Supabase: migraciones con `supabase db push`, funciones con
`supabase functions deploy <nombre>`, configuración de Auth con `supabase config push`. Las
variables de entorno y secretos que cada servicio necesita (incluidas las del módulo de
consentimiento: claves de cifrado PII, HMAC, TOTP) están en `SETUP.md` y, con más detalle,
`GUIA_LEVANTAMIENTO_PROYECTO.md` sección 9 — no se duplican aquí.

## 3. Qué revisar a diario

### 3.1 Antes de nada: qué pestañas del panel admin son reales

La consola `cyberdojo-admin` mezcla pestañas conectadas de verdad a Supabase con pestañas que
operan sobre datos de ejemplo guardados solo en el navegador del administrador, sin ningún aviso
visual que distinga unas de otras. `MANUAL_ADMINISTRADOR.md` (sección "Hallazgo central de este
manual") tiene la tabla completa panel por panel — léela antes de confiar en cualquier pestaña como
fuente de verdad. Las que siguen (3.2 a 3.6) son las que sí dan una señal operativa real hoy.

### 3.2 Agente de noticias (`newsAgent`)

Genera preguntas/katas de ciberseguridad nuevos, de dos formas reales (no una plantilla fija — ver
nota al final de esta sección sobre un hallazgo que corrige a `MANUAL_ADMINISTRADOR.md` en este
punto):

- **Automática**, a la hora configurada (casilla "Activo" + hora, guardadas en la tabla real
  `agent_configs`): `dispatch_news_agent()` (`supabase/migrations/040_news_agent_pg_cron_dispatcher.sql`)
  corre cada minuto vía `pg_cron`, comprueba si ya toca y si no corrió hoy, y llama a la Edge
  Function `run-news-agent` (acción `scheduled`), que usa la cadena real de proveedores de IA
  (`runProviderChain`, compartida con `security-diagnose` y `quiz-generator` — Vault-backed, con
  reintento entre proveedores).
- **Manual** (botón "Ejecutar ahora"/"Probar" en el panel): corre en el navegador del administrador
  vía Puter.js (`puter.ai.chat`, modelo `gpt-5.6-luna`), llamando también a la Edge Function real
  `run-news-agent` (acciones `prepare`/`complete`) — necesita que el navegador del administrador
  tenga internet y acceso a `js.puter.com`.

En ambos casos, todo lo generado se guarda en la tabla real `questions` con
`audit_status='pending'` — **nunca llega a los estudiantes automáticamente**
(`supabase/functions/run-news-agent/index.ts`, comentario de cabecera: "Generated content is
always inserted as `audit_status='pending'`"). Lo que hay que revisar cada día:

- **"Reporte: preguntas y katas generadas"** (misma pestaña `newsAgent`, bajo "Historial de
  ejecuciones"): cada fila pendiente tiene botones "Aprobar y activar" / "Rechazar"
  (`reviewNewsGenerated()`, `central-admin-app/app.js`). Aprobar pone `active=true` y, por la
  migración `044_sync_news_questions_to_learning_items.sql`, sincroniza la pregunta a
  `learning_items` — recién ahí la ven los estudiantes.
- **"Historial de ejecuciones"** (`agent_runs` filtrado por `agent_code = 'ciber-dojo-news-agent'`):
  confirma si la corrida automática del día realmente se ejecutó y si terminó en `completed` o
  `failed`.

**Hallazgo (no corregido en esta tarea, pertenece a otro documento):** `MANUAL_ADMINISTRADOR.md`
(fila "Agente noticias" de su tabla "Hallazgo central" y su sección 5) describe este panel como
"simulado" y dice que `runNewsAgent()` "no llama a ningún proveedor de IA real ni a ninguna Edge
Function" — eso describe el código anterior al commit `ab309ca` (2026-09-20, *"estado desplegado de
la consola admin (Centro de Seguridad, Campeonato, proxy de funciones) antes de la auditoría
A0–A15"*). El código actual sí llama a un proveedor de IA real y a la Edge Function `run-news-agent`
en ambos modos, como se describe arriba. Este documento (`GUIA_OPERACION_CLUB.md`) describe el
comportamiento verificado hoy; la corrección de `MANUAL_ADMINISTRADOR.md` queda registrada como
tarea nueva en `loop-docs/TASKS.md` (`DOCS-17`), para no mezclar dos documentos en una misma
iteración.

### 3.3 Centro de Seguridad (`securityCenter`)

Runbook técnico completo en `README-centro-de-seguridad.md`; resumen operativo aquí:

- **Alertas por umbral**: `dispatch_security_alert_check()` corre cada 15 minutos vía `pg_cron`
  (`supabase/migrations/055_security_center_jobs.sql`, job `security-alert-check-15min`) y avisa
  por correo o webhook si se configuró un umbral. Revisar el feed de eventos y las alertas
  recientes es la comprobación diaria más directa de que no hay un incidente en curso.
- **Diagnóstico con IA**: corre automáticamente cada lunes 08:00 UTC (job
  `security-diagnosis-weekly`) además del botón manual — no es diario, pero conviene revisar el
  resultado del lunes al empezar la semana. El feedback 👍/👎 del panel solo se registra, nunca
  dispara una acción automática.
- **EASM** (inventario de superficie expuesta): mensual, el día 1 a las 09:00 UTC (job
  `security-easm-monthly`) — revisión mensual, no diaria.

### 3.4 Sensei IA (`senseiStats`) e Inteligencia de Amenazas (`threatIntel`)

- **Sensei IA**: panel real de solo lectura sobre `sensei_consultations`/`sensei_consultation_stats`
  — vigilar picos de "Fuera de alcance" o sentimiento negativo puede señalar un problema con el
  contenido o con el propio Sensei.
- **Inteligencia de Amenazas (T-Pot)**: panel real contra `tpotService.js` y las tablas `tpot_*`
  (ver `BASE_DE_DATOS.md`, `docs/TPOT_INTEGRATION.md`). Antes de confiar en que hay alertas reales
  que revisar, confirmar que `tpot_integration_settings.base_url` apunta a un honeypot
  efectivamente desplegado y accesible — este documento no verifica ese estado operativo (requiere
  acceso a la infraestructura del sensor, fuera del alcance de este loop de documentación).

### 3.5 Consentimiento informado (`consent`) — aplica solo cuando el módulo esté desplegado

Según `loop-docs/DECISIONS.md` (`DOC-06`), en producción **solo** está aplicada la migración `073`;
las migraciones `074`-`084` (Edge Functions del módulo, panel nuevo, frontend con su rediseño)
están **implementadas, pendientes de despliegue**. Mientras ese despliegue no ocurra, esta pestaña
no aplica a la operación diaria real. Una vez desplegado (ver
`loop-consentimiento/PLAN_RELEASE_COMPLETO.md`, rama `feature/consentimiento-lopdp`), lo que
conviene revisar con frecuencia (detalle completo en `MANUAL_ADMINISTRADOR.md` sección 14):

- **"Solicitudes de derechos"**: cada caso tiene un semáforo calculado contra su fecha límite
  (`due_at`) — 🟢 `vigente` (más de 3 días), 🟡 `por_vencer` (3 días o menos), 🔴 `vencida` (ya pasó
  el plazo). Revisar los casos 🟡/🔴 es la comprobación más urgente de esta pestaña.
- **Banner "Correo no configurado / con errores"** (visible solo para `privacy_admin`): indica
  avisos de solicitudes atascados en `email_outbox` por una falla del transporte de correo saliente.

### 3.6 Lo que no hace falta revisar a diario

- **Ocupaciones, Propaganda**: paneles reales (CRUD sobre `business_sectors` y campañas), pero de
  gestión puntual — solo hace falta tocarlos cuando cambia algo (una campaña nueva, un sector
  nuevo), no como chequeo diario.
- **Reportes**: panel real de solo lectura (ingresos con/sin sector, desglose por campaña) — útil
  semanal o mensual para ver tendencia, no como chequeo diario.
- **Resumen, Dojos y progreso, IA y auditoría, Preguntas abiertas, Usuarios**: paneles totalmente o
  parcialmente maqueta (datos de ejemplo en `localStorage`, sin conexión a Supabase) — no sirven
  como fuente de verdad operativa. Ver la tabla completa en `MANUAL_ADMINISTRADOR.md`.

## 4. Si algo falla

Este documento no sustituye un runbook de incidentes. Para diagnóstico técnico:

- Panel caído o con error: revisar logs de Cloud Run de `cyberdojo`/`cyberdojo-admin`
  (`gcloud run services logs read <servicio> --region us-central1`).
- Comportamiento inesperado de una Edge Function o una migración: `ARQUITECTURA_CYBER_DOJO.md`
  sección 5 (quién invoca cada función) y `BASE_DE_DATOS.md` (esquema completo).
- Arranque del entorno desde cero: `SETUP.md` (rápido) o `GUIA_LEVANTAMIENTO_PROYECTO.md`
  (detallado).
- Mapa general de a qué documento ir según el tema: `docs/AI_HANDOFF_CYBER_DOJO.md`.
