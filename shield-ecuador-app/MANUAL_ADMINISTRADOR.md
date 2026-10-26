# Manual del Administrador — Ciber Dojo Central Admin

Este documento reemplaza por completo la versión anterior, que describía un modelo de campañas incorrecto (duración en "meses/sesiones al aparecer", momentos "inicio/sesión/fin" sin segmentación por sector) y no reflejaba varios módulos reales (Ocupaciones, Reportes, Inteligencia de Amenazas). Todo lo que sigue está verificado leyendo `central-admin-app/index.html` (estructura e IDs reales de cada campo) y `central-admin-app/app.js` (2216 líneas, lógica real de cada botón) línea por línea.

**Acceso:** `https://cyberdojo-admin-61855290194.us-central1.run.app`, o en `/admin` del mismo dominio que la app de usuarios (`https://cyberdojo-61855290194.us-central1.run.app/admin`) vía el proxy descrito en `ARQUITECTURA_CYBER_DOJO.md`. Protegido con HTTP Basic Auth a nivel de Cloud Run (no hay pantalla de login propia de la aplicación).

## Hallazgo central de este manual: qué paneles son reales y cuáles son maqueta

Antes de describir cada panel, esto es lo más importante para una auditoría: **la consola central mezcla paneles conectados de verdad a Supabase con paneles que operan sobre datos de ejemplo guardados solo en el `localStorage` del navegador del administrador**, sin ningún indicador visual en la interfaz que distinga unos de otros. Se determinó esto leyendo qué función maneja cada botón y si esa función llama a `supabaseRest(...)` (proxy real hacia Postgres) o solo a `persist(...)` (que únicamente escribe en `localStorage.setItem("ciber-dojo-central-admin-v2", ...)`).

| Panel | Estado real | Evidencia |
|---|---|---|
| Resumen | Mixto — mezcla métricas reales y de maqueta sin distinguirlas | `metricAds` cuenta `state.campaigns` (real, cargado de Supabase); `metricDojos`, `metricQuestions` y `metricUsers` cuentan `state.dojos`/`state.questionsByDojo`/`state.users`, que son datos de ejemplo (ver fila "Dojos" y "Usuarios" abajo) |
| Dojos y progreso | **Maqueta, sin conexión a Supabase** | `state.dojos` es un arreglo fijo de 3 dojos escrito en el código (`baseState.dojos`, líneas 6-28 de `app.js`); no existe ninguna función `loadDojosFromSupabase` ni se llama nada así desde `init()`. Editar nombre/tema/ISO/estado de un dojo aquí **no modifica** la tabla real `cyber_dojos` — solo cambia el `state` en memoria del navegador, y persiste solo si se pulsa "Guardar borrador"/"Publicar configuración" (que escriben a `localStorage`, no a Supabase) |
| Preguntas | **Real (parcial)** | `loadQuestionsFromSupabase()` se ejecuta al iniciar y sí lee la tabla `questions`. Los botones "Guardar preguntas" (`saveQuestionsFromForm`) y "Generar plan 50 preguntas" (`generateQuestionPlan`) sí llaman a `saveQuestionsToSupabase(...)`, que escribe de vuelta a la tabla real |
| IA y auditoría | **Maqueta, sin conexión a Supabase** | La cadena de proveedores (`state.aiProviders`) es un arreglo fijo (DeepSeek/Kimi/Claude con timeouts de ejemplo) que solo se guarda con `persist()` (localStorage). Los dos cuadros de texto "Instrucciones para generar preguntas" e "Instrucciones para revisar y mejorar preguntas" están **codificados como texto fijo** en `renderAiProviders()` (se reescriben con el mismo texto en cada render, sin ningún listener que capture lo que el admin escriba) — es decir, **no tienen ningún efecto aunque se editen**. Los prompts reales que usan los agentes viven en `agent_configs.prompt_template` (ver `BASE_DE_DATOS.md`) y no se editan desde aquí |
| Agente noticias | **Real, con aprobación humana obligatoria antes de publicarse** (corregido 2026-10-26; ver nota al pie — describía una versión anterior del código) | "Ejecutar ahora" (`runNewsAgent()`→`executeNewsAgent()`) sí llama a un proveedor de IA real: carga Puter.js en el navegador del admin y llama a `puter.ai.chat(...)` (modelo `gpt-5.6-luna`), con el prompt y los datos que prepara la Edge Function real `run-news-agent` (acción `prepare`, que descarga server-side las fuentes configuradas). La acción `complete` de esa misma función inserta cada pregunta/caso de kata generado en la tabla real `questions`, **siempre con `active=false` y `audit_status='pending'`** — nunca sobrescribe ni activa directamente ninguna pregunta existente; requiere aprobación manual (`reviewNewsGenerated()`) antes de llegar a los usuarios. Además del botón manual, `pg_cron` dispara la misma función cada minuto con la acción `scheduled` (`dispatch_news_agent()`, migración `040`), usando una cadena de proveedores de IA respaldada por Vault en vez de Puter.js |
| Alertas IA | **Real** — ni la fila ni el contenido vienen del agente de noticias de la fila anterior (corregido 2026-10-26; la versión previa de este manual lo atribuía al "simulador de arriba") | `loadNewsAlertsFromSupabase()` lee la tabla real `alerts`. Quien escribe ahí hoy es el auditor de preguntas (`audit-generated-questions`, función `upsertIncidentAlert()`, columna `source_agent='question-auditor'`), al aprobar una pregunta pendiente que el agente investigador (`run-incident-investigator`) vinculó antes a un incidente (`incident_investigations`). El agente investigador **no** escribe en `alerts` — solo la lee (para no repetir incidentes) y crea las preguntas pendientes que el auditor revisa después. El agente de noticias (fila anterior) tampoco escribe en `alerts`: solo inserta en `questions` |
| Sensei IA | **Real (solo lectura)** | `loadSenseiStats()` consulta `sensei_consultations`/`sensei_consultation_stats` — datos genuinos de uso del chat del Sensei |
| Inteligencia de Amenazas | **Real, contra `tpotService.js`** | Este panel sí llama a un servicio backend propio (`tpotService.js` en el servidor Node del admin) para las tablas `tpot_*` — es el panel con la integración más profunda al backend Node del propio admin, no solo a Postgres vía REST |
| Preguntas abiertas | **Maqueta, sin conexión a Supabase** | "Simular pregunta" (`simulateOpenQuestion()`) agrega una fila de texto fijo (`"Consulta abierta validada: seguridad en WhatsApp"`) a `state.topics` y solo llama a `persist()`. **No existe una tabla `open_questions` en ninguna de las 21 migraciones de Supabase revisadas** — este panel no tiene, y nunca tuvo, una tabla real detrás |
| Usuarios | **Maqueta, sin conexión a Supabase — hallazgo crítico** | `state.users` es un arreglo fijo de 3 usuarios de ejemplo (`Ana Paredes`, `Luis Mora`, `Rosa Vera` — literalmente esos nombres, línea 65-69 de `app.js`) y **no existe ninguna carga desde la tabla real `users`**. El botón "Dar de baja seleccionados" (`suspendSelectedUsers()`) solo cambia `status` dentro de ese arreglo local y llama a `persist()` — **no suspende ninguna cuenta real**, no escribe en `public.users.role` ni en ningún campo de la base de datos. Este panel, tal como está hoy, **no permite administrar usuarios reales** |
| Ocupaciones | **Real** | `loadOccupationsFromSupabase()`/`saveOccupation()`/`deleteOccupation()` leen y escriben directamente la tabla `business_sectors` vía `supabaseRest(...)` |
| Propaganda | **Real** | Campañas, límites de imagen y bitácora de auditoría se cargan y guardan contra `central_admin_campaigns`, `central_admin_campaign_settings` y `central_admin_campaign_audit` respectivamente |
| Reportes | **Real (solo lectura)** | Los tres niveles de gráficos (ingresos con/sin sector, desglose por sector, desglose por campaña) se calculan sobre `app_entry_log` y `campaign_impressions` reales |

Los botones globales **"Guardar borrador"** y **"Publicar configuración"** (arriba a la derecha, en todos los paneles) ejecutan exactamente la misma función `persist()` — la única diferencia entre ambos es el texto del mensaje de confirmación ("Borrador guardado localmente." vs. "Configuración publicada para Ciber Dojo."). **Ninguno de los dos envía nada a Supabase**; ambos solo escriben el `state` completo en el `localStorage` del navegador que se esté usando en ese momento, bajo la clave `ciber-dojo-central-admin-v2`. Esto significa que los cambios hechos en los paneles "maqueta" (Dojos, IA, Usuarios, Preguntas abiertas) **no se comparten entre administradores ni entre dispositivos**, y se pierden si se limpia el navegador.

---

## Panel por panel (campos reales, según `index.html`)

### 1. Resumen (`overview`)

4 tarjetas de métrica (Dojos activos, Preguntas objetivo, Usuarios activos, Campañas activas — ver tabla de arriba sobre cuáles son reales), una vista de la tabla de progresión de cinturones/katas, y un diagrama estático "IA 1 → IA 2 → IA 3 → Revisor" (decorativo, sin datos vivos).

**Inconsistencia detectada:** la tabla de progresión que se muestra aquí (`baseState.progression`) todavía lista el camino de 8 cinturones retirado — Blanco, Amarillo, Naranja, Verde, Azul, **Morado**, **Rojo**, Negro — con un examen por cinturón. La base de datos real, desde la migración 017, fusionó Morado y Rojo en un único cinturón **Marrón** (`blanco → amarillo → naranja → verde → azul → marrón → negro`, 7 cinturones). Este panel no se actualizó cuando cambió el esquema; el número (los porcentajes 20/15/10/5/5/5/5/35) tampoco tiene una fuente verificable más allá de este arreglo local.

### 2. Dojos y progreso (`dojos`)

Lista de 3 dojos de ejemplo con editor (Nombre, Tema, Control ISO, Estado: Activo/Borrador/Pausado) y una regla fija mostrada como texto ("20 preguntas manuales", "30 preguntas IA intercaladas", "50 total por dojo" — coincide con `manual_question_target`/`ai_question_target` de la tabla real `cyber_dojos`, pero aquí son literales HTML, no leídos de la base). **Recordatorio: este panel es una maqueta (ver tabla superior); no edita `cyber_dojos`.**

### 3. Preguntas (`questions`)

Selector implícito por el dojo activo (`state.selectedDojoId`, uno de `dojo-phishing`/`dojo-passwords`/`dojo-backups` — los IDs reales de `cyber_dojos`). Dos columnas: "Manuales" (20) e "IA" (30), cargadas de la tabla real `questions` filtrada por `dojo_id`. Botones:
- **Guardar preguntas** — envía los campos editados de vuelta a `questions` (real).
- **Generar plan 50 preguntas** — reemplaza el banco completo del dojo seleccionado con plantillas por defecto (`createDefaultQuestions`) y las guarda en `questions` (real). Esto **sobrescribe** cualquier pregunta previamente editada para ese dojo.

### 4. IA y auditoría (`ai`)

Editor de "cadena de consulta" (3 proveedores con nombre/timeout/orden) y dos cuadros de texto de instrucciones. **Ambos son maqueta** (ver tabla superior) — no hay forma, desde este panel, de editar realmente `ai_providers`, `agent_configs.prompt_template` ni `agent_provider_assignments`, que son las tablas que sí gobiernan el comportamiento real de los agentes (ver `BASE_DE_DATOS.md` sección 3). El botón "Probar algoritmo" solo arma una frase de confirmación con el orden local de proveedores; no ejecuta ninguna llamada real.

### 5. Agente noticias (`newsAgent`)

Configuración (activo/inactivo, hora de activación, lista de URLs de fuentes, instrucciones) — guardada solo en `localStorage`. El botón **"Ejecutar ahora"** dispara `runNewsAgent()` → `executeNewsAgent(false)`, que sí contacta a un proveedor de IA real. El flujo tiene tres pasos, todos contra la Edge Function real `run-news-agent`:
1. **`prepare`**: el servidor descarga las fuentes de noticias configuradas (evita los problemas de CORS de hacerlo desde el navegador) y abre una fila de bitácora en `agent_runs`, devolviendo el prompt y los datos para la IA.
2. El navegador carga Puter.js (`ensurePuter()`) y llama a `puter.ai.chat(...)` con ese prompt y el modelo `gpt-5.6-luna` (la llamada a la IA corre del lado del admin, "el usuario paga", según el comentario del propio código — no se necesita una clave de proveedor de IA en el servidor para este modo).
3. **`complete`**: la Edge Function recibe el texto que devolvió la IA, lo parsea, e inserta cada pregunta/caso de kata generado en la tabla real `questions`, siempre con `active=false` y `audit_status='pending'` — **nunca sobrescribe ni activa automáticamente ninguna pregunta existente**, a diferencia de lo que describía una versión anterior de este manual.

El reporte "Preguntas y katas generadas" de este mismo panel (`loadNewsGeneratedFromSupabase()`/`renderNewsGeneratedReport()`) lista cada pregunta pendiente; los botones "Aprobar y activar"/"Rechazar" (`reviewNewsGenerated()`) son los que de verdad cambian `audit_status` y `active` en la tabla real — sin ese paso humano, el contenido generado no llega a ningún dojo. Las preguntas aprobadas se sincronizan después a `learning_items` por separado (migración `044`, solo si `audit_status='approved'`).

Aparte del botón manual, existe un modo automático: `pg_cron` llama a la misma Edge Function con la acción `scheduled` cada minuto (`dispatch_news_agent()`, migración `040`), usando una cadena de proveedores de IA respaldada por Vault (`runProviderChain`, sin Puter.js ni un admin conectado) — también inserta el contenido como pendiente, nunca activo directamente.

Nota: los casos de kata generados también se insertan en la tabla `questions` (con su propio `kata_label`), no en `cyber_dojo_generated_katas` — la tabla pensada para katas propuestas por un agente, que este flujo no usa.

**Implicación operativa:** el contenido de este panel nunca llega a un dojo por sí solo — un administrador debe revisarlo y aprobarlo explícitamente desde el reporte de "Preguntas y katas generadas"; dejarlo sin revisar no sobrescribe nada, pero sí significa que ninguna pregunta generada llega a los usuarios.

### 6. Alertas IA (`newsAlerts`)

Lectura de las alertas reales guardadas en `alerts` y de las preguntas asociadas (corregido 2026-10-26: no vienen del agente de noticias del punto 5, ver tabla de hallazgos). Las genera el auditor de preguntas (`audit-generated-questions`, `source_agent='question-auditor'`) al aprobar una pregunta pendiente que el agente investigador (`run-incident-investigator`) vinculó antes a un incidente — típicamente al pulsar "Validar con IA" sobre una pregunta pendiente en el panel "Preguntas" (punto 3). El único botón de este panel, "Actualizar", solo vuelve a ejecutar `loadNewsAlertsFromSupabase()` (relectura); no existe ningún botón "Forzar revisión IA" en el código actual.

### 7. Sensei IA (`senseiStats`)

Panel de solo lectura, genuinamente conectado. 4 métricas (Consultas, Fuera de alcance, Ayudó, Sentimiento positivo) más lista de últimas consultas y resumen diario, todo desde `sensei_consultations`/`sensei_consultation_stats` (tablas reales, migración 008). Botón "Actualizar" vuelve a consultar.

### 8. Inteligencia de Amenazas (`threatIntel`)

Panel de la integración T-Pot/honeypot, con 5 sub-vistas por pestaña: Dashboard, Alertas, Análisis IA, Reportes, Configuración. A diferencia de los demás paneles, este habla con `tpotService.js` (módulo propio del servidor Node del admin, no solo REST directo a Postgres) para consultar y operar sobre las tablas `tpot_*` descritas en `BASE_DE_DATOS.md`. Verificar el estado operativo real de la conexión al T-Pot (¿hay un honeypot desplegado y accesible desde `base_url` en `tpot_integration_settings`?) requiere revisión fuera del alcance de este documento — aquí solo se confirma que el panel y las tablas existen y están cableados entre sí a nivel de código.

### 9. Preguntas abiertas (`openQuestions`)

Maqueta completa (ver tabla superior). El botón "Simular pregunta" es literalmente eso: una simulación de un caso de ejemplo, no una función operativa.

### 10. Usuarios (`users`)

Maqueta completa sobre 3 usuarios de ejemplo (ver tabla superior). **No debe usarse como fuente de verdad sobre los usuarios reales registrados**, ni el botón "Dar de baja seleccionados" tiene efecto sobre ninguna cuenta real. La gestión real de usuarios (cambiar `role`, ver perfil descifrado) pasa por las Edge Functions `get-private-profile` y las políticas RLS de `is_admin()` descritas en `BASE_DE_DATOS.md`, no por este panel.

### 11. Ocupaciones (`occupations`)

Panel real, CRUD directo sobre `business_sectors`. Campos del editor: Ocupación/Profesión (`label`), Sector/Industria (`industry`, texto libre — no hay una lista fija de industrias en el HTML, el admin escribe el nombre), Orden (`display_order`), Estado (Activa/Inactiva → `active`). El código de la ocupación (`business_sectors.code`) se genera automáticamente al crear (`slugifyOccupationCode(label)`) y **no es editable después de creada** desde este panel — la función SQL `save_business_sector()` (migración 016/019), que sí soporta renombrar el código y propagar el cambio a `users.business_type` y `alerts.target_business_types`, no es invocada por este panel: `saveOccupation()` hace un `PATCH`/`POST` directo a la tabla REST, sin pasar por esa función.

### 12. Propaganda (`ads`)

Panel real. Un bloque superior de "Límites de imagen para toda subida" (Peso máximo KB, Ancho máximo px, Alto máximo px → tabla `central_admin_campaign_settings`, fila única). Editor de campaña por campaña: Nombre, Momento (Al inicio / En cualquier momento de la sesión / Al salir), Duración en segundos, Vigencia (Por X sesiones / Por X meses / Indefinido), Estado (Activa/Suspendida/Eliminada), Enlace al hacer clic, Mensaje, un bloque de "Sectores a los que se dirige" (checkbox "Todos los sectores" + lista de industrias reales tomada de `business_sectors.industry` vía `loadAvailableSectorsFromSupabase`), y carga de imagen (valida contra los límites configurados arriba, sube a Storage y guarda la URL). Cada guardado exitoso registra una fila en `central_admin_campaign_audit` con el actor (`state.actor`, cargado por `loadActor()`), la acción (`creada`/`actualizada`/`estado_cambiado`) y el detalle — visible en el bloque "Historial de cambios (auditoría)" al final del panel.

### 13. Reportes (`reports`)

Panel real, de solo lectura. Selector de período (Quincenal 15 días / Mensual / Trimestral, por defecto Trimestral). Tres niveles de detalle, todos como gráficos de barras 3D (ECharts + echarts-gl, cargados por CDN en `index.html`):
1. **Ingresos: con sector vs. sin sector** — cuenta filas de `app_entry_log` en el período, agrupadas según si el usuario tenía `sector` asignado al entrar.
2. Clic en "Con sector" → desglose por sector específico (tabla + gráfico), agrupando el mismo `app_entry_log` por valor de `sector`.
3. Clic en una barra de sector → desglose de qué campañas se mostraron en ese sector y cuántas veces, usando `campaign_impressions` cruzado con `central_admin_campaigns`.
Un cuarto bloque, siempre visible, muestra veces que se mostró cada campaña en total (todos los sectores).

### 14. Consentimiento informado (`consent`) — módulo LOPDP

A diferencia de los 13 paneles anteriores, esta sección **no usa la Basic Auth compartida de la consola ni el proxy con service role**: cada administrador entra con su propia cuenta (correo + contraseña de Supabase Auth) y un segundo factor TOTP propio, y toda acción queda atribuida a esa identidad individual (H08) — nunca a `central-admin`/`service_role`. El JWT de esa sesión, no el proxy, es lo que llama a la Edge Function `admin-consent`. Verificado leyendo `central-admin-app/index.html` (sección `#consent`, líneas 1179-1774) y `central-admin-app/app.js` línea por línea.

**Acceso individual (artículo "Acceso individual al módulo"):** correo + contraseña (`privacyLoginForm`) → si la cuenta no tiene TOTP activado, pantalla de enrolamiento con código QR y clave manual (`privacyEnroll`); después, código de 6 dígitos (`privacyCodeForm`). Con la sesión verificada, `privacyIdentity` muestra el correo y los roles del admin (`privacy_editor`, `privacy_admin`, `privacy_auditor` — un admin puede tener varios) y el botón "Cerrar sesión del módulo". Ningún otro artículo de esta sección es visible hasta pasar este paso.

Quién puede hacer qué, confirmado en `app.js` (no es un supuesto de diseño, son los candados reales):
- **Editar** un borrador y **compararlo** con la versión vigente: `privacy_editor` o `privacy_admin`.
- **Publicar** o **retirar** un borrador, **configurar responsable/delegado**, **cambiar el correo de privacidad**, **configurar el correo saliente** y **revelar la IP real** de una evidencia: solo `privacy_admin` (candado `ADMIN_ONLY` en el backend, no una preferencia de la interfaz).
- **Cambiar el estado de una solicitud de derechos**: `privacy_editor` o `privacy_admin`, nunca `privacy_auditor`.
- **Ver** la lista de versiones, la bitácora, la evidencia (con IP enmascarada) y las solicitudes, y **usar el botón de verificar integridad**: los tres roles.

**Versiones del aviso (`consentDocuments`):** tabla con versión, estado, título, número de aceptaciones, fecha de publicación y de creación. "Crear borrador desde vigente" (versión nueva + resumen de cambios opcional) clona el contenido y las finalidades de la versión publicada. Si todavía no hay ninguna versión publicada (primer uso), el backend exige título/contenido/finalidades completos en la misma llamada; el mensaje en pantalla lo indica.

**Editar borrador:** editor de título y contenido Markdown con vista previa en vivo (resuelve los marcadores del texto y resalta los que falten) y autoguardado (con aviso de "cambios sin guardar" si se cierra antes de que el autoguardado corra). Debajo, el editor de finalidades: el código de una finalidad que ya existía en el borrador no se puede cambiar; "Agregar finalidad" crea una fila nueva con código editable solo hasta el primer guardado exitoso.

**Comparar con la versión vigente:** diff línea a línea del Markdown y antes/después del resto de campos que cambien. Sin versión vigente, o sin diferencias, muestra un mensaje explícito en vez de una tabla vacía.

**Publicar borrador:** casilla "Requiere reconsentimiento de los titulares" (si la versión vigente queda retirada, decide si todos deben volver a aceptar en su próximo inicio de sesión — REQ-09/T20), motivo obligatorio, y confirmación escribiendo la versión exacta. Antes de confirmar, un resumen muestra cuántas aceptaciones tiene la versión que se va a retirar. "Retirar borrador" (sin publicar) solo pide motivo y la misma confirmación por versión — nunca tuvo aceptaciones, así que no hay resumen de impacto.

**Configuración del responsable y delegado (`consentSettings`):** nombre/razón social y domicilio/teléfono del responsable, nombre y contacto del DPO, URL de la Política de Privacidad, asunto del correo de baja, plazo de respuesta a solicitudes (días) y plazo de conservación de IP (días). Cada guardado crea una versión nueva; el historial de abajo (solo lectura) muestra todas las versiones anteriores con quién y cuándo. Editor y auditor ven los valores con los campos deshabilitados, sin botón "Guardar". El correo de privacidad **no** se cambia desde este formulario.

**Correo de privacidad (`consentEmailChange`):** cambiarlo exige verificación: se escribe la dirección nueva, llega un código de 6 dígitos (válido 30 minutos) a esa dirección, y solo se confirma con el código correcto. Evita desviar solicitudes de baja a un buzón que nadie revisa. El estado "pendiente de confirmación" vive solo en memoria de la pestaña — si se recarga la página a mitad del cambio, hay que pedir el código de nuevo.

**Correo saliente (`consentEmailTransport`):** modo Resend (reutiliza la integración ya existente del repo) o SMTP propio (host, puerto 465 con SSL/TLS o 2525 — Supabase bloquea 25 y 587 —, usuario y contraseña). La contraseña SMTP nunca vuelve al navegador: el formulario solo informa si hay una configurada (`password_set`) y dejar el campo en blanco al guardar conserva la que ya había, re-cifrada bajo la versión nueva. Botón "Enviar correo de prueba" (resultado solo en memoria de la pestaña) e historial de versiones (modo, remitente, si tenía contraseña, quién y cuándo — nunca la contraseña ni su cifrado). Si el transporte activo falla o no está configurado, arriba de toda la sección aparece el banner "Correo no configurado / con errores" con el contador de avisos pendientes (`email_outbox`) y un botón "Reenviar avisos pendientes" — visible solo para `privacy_admin`.

**Bitácora administrativa (`consentAuditLog`):** filtros combinables por fecha, ID de actor y texto de la acción; tabla con fecha, actor, rol, acción, entidad y motivo; el detalle de una fila muestra el diff `before`/`after` completo. "Exportar CSV" exige escribir un motivo (la exportación misma queda registrada como una entrada más de la bitácora).

**Evidencia de consentimiento (`consentEvidence`):** búsqueda por correo del titular o por ID de usuario (nunca por coincidencia parcial sobre un campo cifrado); tabla con fecha, versión, finalidad, decisión, canal e IP — la IP se muestra siempre enmascarada (`192.0.2.xxx`) salvo que se use "Revelar IP real" (solo `privacy_admin`, exige motivo, se registra en bitácora). "Exportar expediente del titular" (JSON o PDF simple, motivo obligatorio) sirve para atender una solicitud de acceso o portabilidad.

**Solicitudes de derechos (`consentRequests`):** lista filtrable por estado (recibida / requiere aclaración / en proceso / atendida / rechazada con motivo), con número de caso, tipo, canal, estado, plazo y fechas. "Cambiar estado" abre un formulario con el nuevo estado, una nota de resolución interna opcional y un motivo que solo es obligatorio al rechazar.

**Runbook: atender un caso de derechos o baja, paso a paso** (REQ-10, REQ-11; `privacy_editor` o `privacy_admin` — `privacy_auditor` solo puede leer, no cambiar el estado; verificado contra `request-data-subject-right/handler.ts` y `admin-consent/handler.ts` el 2026-10-23, T98.e):

1. **Llega el aviso al delegado.** Cuando alguien envía una solicitud desde "Mi privacidad" (o el equipo la registra manualmente tras recibirla por correo), el sistema calcula de inmediato la fecha límite (`due_at = fecha de recepción + response_days`, hoy 15 días calendario por defecto — D-03) y envía **dos correos independientes**, cada uno por su cuenta (que uno falle no impide el otro ni impide que el caso quede registrado):
   - Al **correo de privacidad vigente** (el delegado): número de caso, tipo de solicitud y fecha límite — **nunca** el correo del titular ni ningún dato cifrado (D-06).
   - Al **titular**: acuse de recibido con su número de caso y la misma fecha límite.
   - Si el transporte de correo no está configurado o falla al enviar, el caso se registra igual y el aviso queda en la cola de reintentos (`email_outbox` — ver el banner "Correo no configurado / con errores" de la sección "Correo saliente" arriba).
2. **El delegado revisa el caso en el panel**, pestaña "Solicitudes de derechos". Lo encuentra por número de caso, tipo o estado.
   - Si hace falta más información para tramitarlo formalmente, se contacta al titular **por fuera del sistema** (correo directo) y se cambia el estado a **`requiere_aclaracion`** — esto NO detiene el plazo ni cambia `due_at`; el semáforo sigue corriendo contra la fecha límite original.
   - Si ya se está trabajando el caso (verificación de identidad, búsqueda de los datos, etc.), se cambia a **`en_proceso`**. Ninguno de estos dos cambios pide nota ni motivo obligatorios (ambos son opcionales en el formulario).
3. **El semáforo de la lista** (columna junto al plazo) avisa la urgencia sin que nadie tenga que calcular fechas a mano — se recalcula en cada carga de la lista, comparando `due_at` contra la hora actual:
   - 🟢 **`vigente`** — quedan más de 3 días.
   - 🟡 **`por_vencer`** — quedan 3 días o menos (y todavía no venció).
   - 🔴 **`vencida`** — ya pasó la fecha límite y el caso sigue abierto.
   - Sin color (`null`) — el caso ya está cerrado (`atendida` o `rechazada_con_motivo`): un caso cerrado no tiene presión de plazo, nunca se le asigna un color.
4. **Se resuelve el caso**, con "Cambiar estado":
   - **`atendida`** — se atendió la solicitud (se entregaron los datos, se corrigieron, se eliminó la cuenta, se aplicó la revocación, etc., según `request_type`). La nota de resolución interna es opcional; no hace falta motivo.
   - **`rechazada_con_motivo`** — se rechaza la solicitud. El motivo **es obligatorio** aquí (el backend lo exige: sin motivo, el cambio de estado falla con `reason_required_for_rejection`); la nota de resolución sigue siendo opcional.
   - Cualquiera de los dos cambios queda registrado en `admin_audit_log` con el actor, el estado anterior y el nuevo — visible en la pestaña "Bitácora administrativa".
   - **Una vez en `atendida` o `rechazada_con_motivo`, el caso queda cerrado**: sigue visible en la lista (con su historial), pero ya no tiene semáforo. No existe, hoy, una vía para reabrir un caso cerrado desde el panel — si hiciera falta corregir algo después de cerrarlo, se documenta aparte (nota de resolución de un caso nuevo, o según decida la persona responsable).
5. **Si una baja (`request_type = 'baja'`) termina en `atendida`**: la cuenta y sus datos personales se eliminan/anonimizan según corresponda, pero la evidencia de consentimiento de esa persona **no se borra** — queda desvinculada de su identidad (`user_id → NULL`, vía `unlink_user_consent_evidence()`, REQ-20) y seudonimizada por `user_ref_hmac`. Los plazos de conservación de esa evidencia seudonimizada siguen pendientes de decisión legal (D-02) — ver `BASE_DE_DATOS.md`, sección 12, `privacy_settings.evidence_retention_days`.

**Verificación de integridad (`consentVerifyChains`):** un solo botón, "Verificar integridad", que ejecuta `verify_consent_chain()` y `verify_audit_chain()` contra la base y muestra el resultado (íntegra, o el primer eslabón roto si algo falla).

**Nota de alcance:** esta sección documenta los pasos del panel tal como existen en el código al 2026-10-20 (`admin-consent`, `central-admin-app`). No afirma que el módulo "cumple LOPDP" ni "cumple ISO 42001" — implementa controles alineados con esos marcos; varias piezas (plazos de conservación definitivos, datos reales del responsable/delegado, medición de la cabecera de IP en el entorno hospedado) siguen pendientes de decisión humana o de confirmación legal antes de publicarse en producción (ver `loop-consentimiento/DECISIONS.md`).

---

*Documento reescrito el 2026-09-08 a partir de la lectura completa de `central-admin-app/index.html` (665 líneas) y `central-admin-app/app.js` (2216 líneas). Reemplaza la versión anterior, que describía funcionalidades de campañas y navegación desactualizadas y no distinguía entre paneles reales y de maqueta. Sección 14 (Consentimiento informado) añadida el 2026-10-20 (T98.b), a partir de la lectura de la sección `#consent` de `index.html` (1179-1774) y los candados de rol reales en `app.js`. Runbook de solicitudes de derechos/baja dentro de la sección 14 añadido el 2026-10-23 (T98.e), a partir de la lectura de `request-data-subject-right/handler.ts` y `admin-consent/handler.ts` (semáforo `computeSemaphore`, estados `DSR_STATUSES`, cálculo de `due_at`). Fila "Agente noticias" de la tabla de hallazgos y sección 5 corregidas el 2026-10-26: describían `runNewsAgent()` como una simulación sin IA real (código anterior al commit `ab309ca`, 2026-09-20); el código actual (`executeNewsAgent()`/`ensurePuter()` en `app.js`, Edge Function real `supabase/functions/run-news-agent/index.ts`) sí genera contenido con un proveedor de IA real, siempre como pendiente de aprobación humana en la tabla `questions` — nunca sobrescribe preguntas activas.*
