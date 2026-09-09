# Requisitos Funcionales y No Funcionales — Ciber Dojo

Actualización completa de este documento, que en su versión anterior (commit del 2026-08-27) reflejaba el estado del sistema anterior a las migraciones 016-021 de Supabase y no cubría el panel de administración en detalle. Todo lo que sigue está verificado contra el código fuente actual — migraciones `001` a `021`, `frontend/src/`, `central-admin-app/app.js` e `index.html` — con referencias cruzadas a `BASE_DE_DATOS.md`, `ARQUITECTURA_CYBER_DOJO.md`, `MANUAL_ADMINISTRADOR.md` y `MANUAL_USUARIO_CYBER_DOJO.md`, que contienen el detalle exhaustivo de cada punto.

Ciber Dojo es una PWA en español para formar a personas no informáticas de MIPYMEs ecuatorianas en ciberseguridad, mediante un juego de entrenamiento tipo dojo de karate donde contestar bien preguntas de seguridad hace subir de cinturón. El sistema combina: frontend en React + TypeScript, autenticación y base de datos en Supabase, funciones Edge para cálculo de riesgo/recomendaciones con IA/análisis de correos sospechosos, y una consola de administración independiente.

---

## 1. Requisitos funcionales

### 1.1 Autenticación y registro de usuarios

- Iniciar sesión con enlace mágico por correo (método por defecto, recomendado en la interfaz) o con correo y contraseña (alternativa explícita).
- Registrar nuevos usuarios: nombre completo, correo, contraseña (mínimo 8 caracteres), tipo de negocio/ocupación.
- El tipo de negocio se selecciona de un catálogo administrable (`business_sectors`, ~79 ocupaciones reales agrupadas en 14 industrias desde la migración 019), no de una lista fija en el frontend.
- Autorización obligatoria de tratamiento de datos personales antes de completar el registro, con texto de derechos ARCO y un correo de contacto para ejercerlos.
- Recuperación de contraseña por correo.
- Cerrar sesión; mantener la sesión activa al recargar (comportamiento estándar del SDK de Supabase).
- Detalle completo: `MANUAL_USUARIO_CYBER_DOJO.md` secciones 2-3.

### 1.2 Entrenamiento gamificado (dojos, katas, cinturones)

- Cuestionario/combate por dojo temático, con preguntas reales cargadas de la tabla `questions`, filtradas por dojo y por estado de auditoría aprobado.
- Selector de personaje/avatar de combate (preferencia local del navegador).
- Progresión por 7 cinturones: blanco → amarillo → naranja → verde → azul → marrón → negro, con umbrales de XP reales (0/600/1300/2200/3400/6000/9000).
- Exámenes de ascenso de cinturón (katas especiales con contenido sobre casos reales de ciberdelito en Ecuador, migración 009), aprobación con 75% de respuestas correctas, validado en servidor (Edge Function `complete-kata`) — el cliente no puede otorgarse un ascenso.
- Video de recompensa y celebración animada al completar un dojo o aprobar un examen de cinturón.
- Detalle completo: `MANUAL_USUARIO_CYBER_DOJO.md` secciones 5-6.

### 1.3 Tabla de honor / Ranking

- Ranking real por XP total, cinturón y katas completados, vía Edge Function `get-ranking`.
- Exclusión automática de cuentas con proveedores de correo públicos (Gmail, Hotmail, Outlook, etc. — migración 014) para que solo compitan cuentas con correo corporativo/propio.

### 1.4 Sensei IA (consultas)

- Chat con un asistente de IA sobre ciberseguridad, vía Edge Function `ask-sensei`.
- Registro de cada consulta en `sensei_consultations` (tema detectado, si es de ciberseguridad, fuentes usadas, retroalimentación útil/no útil, sentimiento).
- Respuesta local de respaldo si la función falla (sin usar IA), para no dejar la conversación sin respuesta.
- Auditoría en tiempo real de las respuestas del Sensei antes de mostrarlas (agente `sensei-question-auditor`, migración 011).

### 1.5 Escáner de vulnerabilidades

- Pantalla `/escaner`: diagnóstico de seguridad con detección del sistema del visitante y reporte, apoyado en la Edge Function `vuln-scanner-ai` bajo un patrón de doble consulta IA (generador + auditor).

### 1.6 Alertas de seguridad

- Consulta de alertas activas (tabla `alerts`), con severidad, fuente y fecha.
- Registro de entrega/apertura por usuario disponible en el esquema (`alert_deliveries`) — confirmar contra el inventario de pantallas si está expuesto en la interfaz actual antes de asumir que es una funcionalidad visible; no se encontró una pantalla dedicada de alertas fuera del bloque "Historial de combate" del Dashboard.

### 1.7 Ventanas emergentes de propaganda/campañas

- Popups con imagen, mensaje y enlace, mostrados según el momento (inicio/sesión/salida) y segmentados por sector de industria del usuario.
- Rotación "una campaña por vez" (no repetir hasta agotar el ciclo), registrada en `campaign_impressions`.
- Gestión completa desde el panel admin: creación, límites de imagen configurables, estados (activa/suspendida/eliminada), bitácora de auditoría de quién cambió qué.

### 1.8 Análisis de correos sospechosos (backend, sin pantalla activa)

- Edge Function `analyze-email`: valida SPF/DKIM/DMARC, detecta typosquatting, cuenta URLs/palabras clave de phishing, clasifica como seguro/sospechoso/peligroso.
- **Estado real:** existe en el backend y se despliega, pero no se encontró ninguna pantalla del frontend que la invoque (verificado por búsqueda de `analyze-email` en todo `frontend/src/`; solo aparece en el archivo huérfano `AdminCenterScreen.tsx`, que no está enrutado). Es funcionalidad construida pero no expuesta al usuario final.

### 1.9 Recomendaciones personalizadas por IA (backend, sin pantalla activa)

- Edge Function `generate-recommendations`, con caché de resultados (`recommendations_cache`) y cadena de proveedores de IA con fallback (DeepSeek → Kimi → Claude).
- **Estado real:** mismo caso que 1.8 — sin punto de invocación activo en el frontend actual.

### 1.10 Panel de administración — módulos reales (conectados a Supabase)

Verificado panel por panel en `MANUAL_ADMINISTRADOR.md`. Reales: Preguntas (banco por dojo), Sensei IA (estadísticas de solo lectura), Inteligencia de Amenazas (integración T-Pot/honeypot), Ocupaciones (catálogo `business_sectors`), Propaganda (campañas), Reportes (gráficos 3D de accesos por sector e impresiones de campaña, con drill-down de 3 niveles).

### 1.11 Panel de administración — módulos de maqueta (sin conexión real)

**Hallazgo de este trabajo de auditoría, no presente en ninguna documentación previa:** 4 de los 13 paneles del admin operan sobre datos de ejemplo guardados solo en el `localStorage` del navegador, sin ninguna conexión a las tablas reales que su nombre sugiere:
- **Dojos y progreso** — no lee ni escribe la tabla real `cyber_dojos`.
- **IA y auditoría** — la cadena de proveedores y las instrucciones de generación/auditoría no modifican `ai_providers`/`agent_configs`/`agent_provider_assignments`; los cuadros de texto de instrucciones ni siquiera capturan lo que se escribe en ellos.
- **Usuarios** — muestra 3 usuarios de ejemplo fijos; "Dar de baja seleccionados" no suspende ninguna cuenta real.
- **Preguntas abiertas** — el botón "Simular pregunta" es literalmente eso, y no existe una tabla `open_questions` en el esquema real.

Adicionalmente, el panel "Agente noticias" **simula** contenido de IA con plantillas de texto fijas en JavaScript (no llama a ningún proveedor de IA real) y ese contenido simulado **sí se escribe** en la tabla real `questions`, sobrescribiendo preguntas existentes de un dojo. Ver `MANUAL_ADMINISTRADOR.md` sección 5 para el detalle completo — es el hallazgo más delicado de todo este trabajo de documentación.

### 1.12 Agentes de IA en backend, activados por cron o invocación manual externa

`run-incident-investigator`, `audit-generated-questions` y `run-daily-agent-workflows` existen como Edge Functions desplegadas, con su configuración completa en `agent_configs`/`agent_provider_assignments`, pero **no se invocan desde ninguna de las dos aplicaciones (usuario ni admin)** — su modelo de invocación previsto es externo (cron/Cloud Scheduler o llamada manual con el header `x-cron-secret`), según `GUIA_LEVANTAMIENTO_PROYECTO.md`. Confirmar si existe efectivamente un disparador externo configurado en producción requiere revisión fuera del alcance de este documento (no es visible desde el código del repositorio).

---

## 2. Requisitos no funcionales

Esta sección no existía como tal en la documentación anterior del proyecto; se construye aquí a partir de lo verificable en el código y configuración, marcando explícitamente lo que no se pudo confirmar.

### 2.1 Seguridad

- Cifrado de PII en reposo (AES-256-GCM) para email, nombre, teléfono y ubicación de los usuarios — ver `SECURITY_PRIVACY.md`.
- Autorización a nivel de fila (RLS) en Postgres para la mayoría de las tablas, gobernada por `public.is_admin()`.
- **Brechas de RLS detectadas y documentadas en `BASE_DE_DATOS.md` sección 9**: 4 tablas (`sponsors`, `ai_configs`, `recommendations_cache`, y sin política de escritura admin en `domains_whitelist`/`katas`) no tienen el mismo nivel de cobertura que el resto del esquema.
- Panel de administración protegido con HTTP Basic Auth a nivel de Cloud Run, más verificación adicional de `role='admin'` para operaciones contra Supabase.
- No se encontró en el repositorio evidencia de rate limiting persistente para registro o recuperación de contraseña (recomendación pendiente ya señalada en `SECURITY_PRIVACY.md`).

### 2.2 Disponibilidad y despliegue

- Dos servicios independientes en Google Cloud Run (`cyberdojo`, `cyberdojo-admin`), proyecto `polar-plate-499719-r1`, región `us-central1` — confirmado con `gcloud config get-value project` en este trabajo. (La guía de despliegue anterior citaba el proyecto `cool-archery-452216-v7`, que es incorrecto; se corrige en `GUIA_LEVANTAMIENTO_PROYECTO.md`.)
- Base de datos gestionada por Supabase Cloud (proyecto `wbbcjiqzbzswxsmwjqlw`), con backups y escalado gestionados por el proveedor — no verificable desde el código del repositorio, se documenta como afirmación de Supabase, no verificación propia.
- No se encontró un pipeline de CI/CD versionado en el repositorio (ver `ARQUITECTURA_CYBER_DOJO.md` sección 8); los despliegues verificados en esta sesión de trabajo se hicieron con `gcloud run deploy` manual.

### 2.3 Usabilidad y accesibilidad

- Lenguaje simplificado deliberadamente: la migración 013 reescribió términos técnicos (MFA, phishing, ransomware, credenciales, dominio) a lenguaje llano en todo el banco de preguntas, alertas y katas; `DashboardScreen.tsx` aplica la misma sustitución en tiempo de ejecución sobre contenido dinámico.
- PWA instalable (`PWAInstallPrompt`), con manifest y service worker (`public/sw.js`).
- No se realizó en este trabajo una auditoría de accesibilidad (WCAG) formal — no se afirma ni se descarta el cumplimiento, queda fuera del alcance de esta revisión de código.

### 2.4 Rendimiento

- Carga diferida (`React.lazy`) de pantallas pesadas y poco frecuentes (`TenantAdminPage`, `VulnScannerPage`) para reducir el bundle inicial.
- No se encontró en el código ninguna cifra objetivo de rendimiento (tiempos de carga, throughput) documentada ni verificable — cualquier cifra en la documentación anterior sobre este punto (por ejemplo, tamaños de bundle en KB) no pudo verificarse y se omite aquí en vez de repetirse sin evidencia.

### 2.5 Mantenibilidad

- Separación clara de dos aplicaciones independientes (`frontend/`, `central-admin-app/`) con sus propios `package.json`, sin acoplamiento de build.
- Migraciones de base de datos numeradas y versionadas (`001` a `021`), cada una idempotente donde corresponde (`IF NOT EXISTS`, `ON CONFLICT DO UPDATE`).
- Código huérfano detectado y documentado (`AdminCenterScreen.tsx`, prompts de IA no funcionales en el panel admin, tabla de ranking de ejemplo sin usar) — ver `ARQUITECTURA_CYBER_DOJO.md` y `MANUAL_USUARIO_CYBER_DOJO.md` para el detalle, para que una limpieza futura tenga un punto de partida verificado.

### 2.6 Cumplimiento y privacidad

- Consentimiento explícito de tratamiento de datos personales, con referencia a derechos ARCO, exigido antes de completar el registro.
- Ver `SECURITY_PRIVACY.md` para el detalle completo del cifrado, auditoría (`security_audit_events`) y recomendaciones pendientes de seguridad.

---

## 3. Trazabilidad de fuentes

Este documento no reinterpreta el código: cada afirmación funcional se puede verificar en los archivos citados. Para el detalle exhaustivo tabla por tabla, pantalla por pantalla y panel por panel, ver siempre el documento especializado correspondiente (`BASE_DE_DATOS.md`, `ARQUITECTURA_CYBER_DOJO.md`, `MANUAL_ADMINISTRADOR.md`, `MANUAL_USUARIO_CYBER_DOJO.md`) en vez de asumir que este resumen es exhaustivo por sí solo.

---

*Documento reescrito el 2026-09-08. Reemplaza la versión del 2026-08-27, que era honesta en su redacción pero no cubría las migraciones 016-021 ni el panel de administración, y no distinguía requisitos funcionales de no funcionales.*