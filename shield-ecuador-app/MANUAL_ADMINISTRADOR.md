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
| Agente noticias | **Simulado, con escritura real de contenido simulado a Supabase** | "Ejecutar ahora"/"Forzar revisión IA" (`runNewsAgent()`) **no llama a ningún proveedor de IA real ni a ninguna Edge Function** — genera texto de pregunta con una plantilla fija en JavaScript (`` `Según una noticia revisada en ${domain}, un atacante explota ${topicForIndex(index)}...` ``) usando un banco reducido de temas/respuestas predefinidos (`topicForIndex`/`answerForIndex`). Ese contenido plantilla **sí se guarda en la tabla real `questions`** (vía `saveQuestionsToSupabase`) y en una alerta que sí se intenta guardar en Supabase (`saveNewsAlertToSupabase`). **Esto es lo más delicado del panel**: un clic en "Ejecutar ahora" sobrescribe preguntas reales de un dojo con texto plantilla genérico, presentándolo como si fuera producto de una investigación de IA real |
| Alertas IA | Real para lectura; el contenido que se guarda proviene del simulador de arriba | `loadNewsAlertsFromSupabase()` lee la tabla real (`alerts`, según el esquema); el contenido mostrado como "generado por IA" es el texto plantilla descrito en la fila anterior, no una llamada real a un modelo |
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

Configuración (activo/inactivo, hora de activación, lista de URLs de fuentes, instrucciones) — guardada solo en `localStorage`. El botón **"Ejecutar ahora"** dispara `runNewsAgent()`, que **no contacta a ningún proveedor de IA**: genera preguntas con una plantilla de texto fija, las guarda en la tabla real `questions` (sobrescribiendo hasta 6 preguntas "IA" del dojo activo) y genera hasta 3 "katas" con escenario/tarea también plantilla, guardados solo localmente en `state.generatedKatas` (sin tabla Supabase asociada — no coinciden con `cyber_dojo_generated_katas`, que es la tabla real para katas propuestas por el agente y que este panel no usa). También intenta guardar una entrada de alerta en Supabase vía `saveNewsAlertToSupabase`.

**Implicación operativa:** un administrador que use este botón pensando que dispara una investigación real de noticias de ciberseguridad estará, en la práctica, reemplazando preguntas reales del dojo con texto genérico de plantilla.

### 6. Alertas IA (`newsAlerts`)

Lectura de las alertas guardadas (incluyendo las generadas por el simulador del punto 5) y de las preguntas asociadas. El botón "Forzar revisión IA" ejecuta la misma `runNewsAgent()` del panel anterior.

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

---

*Documento reescrito el 2026-09-08 a partir de la lectura completa de `central-admin-app/index.html` (665 líneas) y `central-admin-app/app.js` (2216 líneas). Reemplaza la versión anterior, que describía funcionalidades de campañas y navegación desactualizadas y no distinguía entre paneles reales y de maqueta.*
