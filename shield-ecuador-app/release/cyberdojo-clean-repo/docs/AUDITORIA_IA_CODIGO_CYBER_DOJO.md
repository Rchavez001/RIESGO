# Cyber Dojo - Documento base para auditoria de codigo con IA

Fecha de analisis: 2026-08-31  
Repositorio analizado: `release/cyberdojo-clean-repo`  
Objetivo del documento: entregar a una IA auditora una descripcion completa y verificable de como esta construida la aplicacion, como entra y opera el usuario, que puede hacer el administrador, que datos existen, donde esta la logica sensible y que puntos deben auditarse antes de seguir construyendo funcionalidades.

## 1. Objetivo de la aplicacion

Cyber Dojo es una plataforma de entrenamiento gamificado en ciberseguridad para usuarios no tecnicos, pequenas empresas y MIPYMEs. El producto usa la metafora de un dojo: el usuario entra como aprendiz, realiza ejercicios de seguridad llamados dojos y katas, responde preguntas, gana puntos, sube de cinturon y recibe orientacion de un Sensei IA.

La aplicacion persigue cuatro objetivos funcionales:

1. Educar al usuario en practicas basicas de ciberseguridad con lenguaje sencillo.
2. Medir riesgo digital mediante cuestionarios y ejercicios.
3. Mantener contenido administrable: preguntas, katas, sectores, proveedores IA, agentes y alertas.
4. Permitir evolucion futura mediante Supabase, Edge Functions y una consola administrativa separada.

La aplicacion NO debe entenderse como herramienta ofensiva, pentest real ni scanner tecnico profundo. Las funciones de scanner actuales son educativas y defensivas.

## 2. Superficies de codigo

El repositorio limpio contiene tres superficies principales:

- `frontend/`: aplicacion React + TypeScript para usuarios finales y admin interno.
- `supabase/`: migraciones PostgreSQL, politicas RLS y Edge Functions Deno.
- `central-admin-app/`: consola administrativa Node/HTML/CSS/JS con Basic Auth opcional, proxy Supabase server-side y modulo T-Pot/Elastic defensivo.

Archivos fuente clave:

- `frontend/src/App.tsx`: define rutas publicas, rutas protegidas y rutas admin.
- `frontend/src/contexts/AuthContext.tsx`: administra sesion Supabase, login, magic link, registro y perfil.
- `frontend/src/lib/supabase.ts`: cliente Supabase y tipos TypeScript principales.
- `frontend/src/screens/LoginScreen.tsx`: login, magic link, registro, consentimiento y sectores.
- `frontend/src/screens/AdminCenterScreen.tsx`: panel admin interno.
- `frontend/src/screens/TenantAdminPage.tsx`: prototipo/UI de administracion SaaS multi-tenant.
- `central-admin-app/server.js`: servidor admin separado, Basic Auth, proxy Supabase y API T-Pot.
- `central-admin-app/tpotService.js`: normalizacion/sanitizacion de eventos T-Pot, reportes, IOCs y auditoria IA local.
- `supabase/migrations/*.sql`: esquema, RLS, funciones SQL y datos semilla.
- `supabase/functions/*/index.ts`: logica server-side privilegiada.

## 3. Stack tecnico

Frontend:

- React 19.
- TypeScript.
- Create React App / `react-scripts`.
- React Router DOM.
- Supabase JS v2.
- Zustand para estado local ligero.
- Framer Motion para animaciones.
- Lucide React para iconos.
- Three.js para fondo visual.

Backend administrado:

- Supabase Auth.
- PostgreSQL con RLS.
- Supabase Edge Functions en Deno.
- Variables secretas en Supabase para service role, claves IA y cifrado PII.

Admin central:

- Node 20.
- Servidor HTTP nativo.
- HTML/CSS/JS sin framework.
- Proxy server-side hacia Supabase.
- Integracion opcional con Elastic/OpenSearch de T-Pot.

## 4. Rutas y entrada del usuario

Las rutas se definen en `frontend/src/App.tsx`.

Rutas publicas:

- `/`: landing page.
- `/login`: pantalla de ingreso, magic link y registro.
- `/auth/callback`: callback de magic link.
- `/reset-password`: cambio/recuperacion de contrasena.
- `/dev/kata/:code`: ruta de desarrollo para probar katas sin shell protegido.

Rutas protegidas por sesion Supabase:

- `/dashboard`: tablero principal del usuario.
- `/dojos`: listado de dojos y examenes.
- `/dojo/:id`: ejercicio de dojo.
- `/kata/:code`: examen/kata de cinturon.
- `/sensei`: consulta al Sensei IA.
- `/escaner`: scanner educativo.
- `/ranking`: tabla de honor.
- `/perfil`: perfil del usuario.
- `/admin`: panel administrativo interno. Muestra bloqueo si el perfil no tiene `role = 'admin'`.

Ruta administrativa especial:

- `/tenant-admin`: ruta protegida por sesion y rol admin. Muestra la pantalla `TenantAdminPage`.

## 5. Como funciona la sesion

El estado de autenticacion vive en `frontend/src/contexts/AuthContext.tsx`.

Al iniciar la app:

1. `AuthProvider` llama `supabase.auth.getSession()`.
2. Si existe sesion Supabase, guarda `user`.
3. Luego invoca la Edge Function `get-private-profile`.
4. `get-private-profile` valida el token recibido, lee `public.users`, descifra PII si corresponde y devuelve el perfil.
5. `onAuthStateChange` escucha cambios de sesion y vuelve a cargar perfil cuando entra un usuario.

Si no hay sesion:

- `ProtectedShell` redirige a `/login`.
- La landing `/` sigue visible.
- El boton `COMENZAR ENTRENAMIENTO` envia a `/login`.

Punto importante para auditoria:

- Tener Gmail abierto en el navegador NO inicia sesion en Cyber Dojo. La app no usa Google OAuth actualmente. Gmail solo sirve para recibir el magic link. Para que una sesion de Google abra directamente la app se debe implementar OAuth con proveedor Google en Supabase.

## 6. Login, magic link y registro

Pantalla: `frontend/src/screens/LoginScreen.tsx`  
Contexto: `frontend/src/contexts/AuthContext.tsx`  
Callback: `frontend/src/screens/AuthCallbackPage.tsx`

### Login por magic link

En modo login, el flujo principal envia magic link por correo:

1. Usuario escribe email.
2. `LoginScreen` valida formato de email.
3. Llama `signInWithMagicLink(email, redirectPath)`.
4. `AuthContext` normaliza email y redirect.
5. Llama `supabase.auth.signInWithOtp`.
6. Usa `shouldCreateUser: false`, por lo que el magic link no crea cuentas nuevas.
7. Supabase envia correo si el usuario existe.
8. El enlace llega a `/auth/callback?next=...`.
9. `AuthCallbackPage` valida `token_hash` con `verifyOtp`, o usa `setSession` si recibe tokens.
10. Normaliza `next` para evitar open redirect y navega a la ruta final.

Controles ya presentes:

- No se revela si el correo existe. El mensaje es neutral.
- Hay cooldown local de 60 segundos.
- No se crean usuarios con magic link.
- `next` solo acepta rutas locales que empiezan con `/` y no `//`.
- `/login` y `/auth/callback` no se aceptan como destino final para evitar bucles.

Dependencias externas de seguridad:

- Supabase debe tener configuradas Redirect URLs permitidas:
  - `https://cyberdojo-61855290194.us-central1.run.app/auth/callback`
  - `http://localhost:3000/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`
- Supabase Auth debe usar expiracion corta para OTP/magic link.
- Debe existir SMTP real en produccion.

### Login por contrasena

El usuario puede cambiar a login con contrasena:

1. Pulsa `Usar contrasena`.
2. Ingresa email y password.
3. Se llama `supabase.auth.signInWithPassword`.
4. Si el login es valido, navega a la ruta original o `/dashboard`.

### Registro

El registro no usa `supabase.auth.signUp` directo desde el navegador. Usa una Edge Function:

1. Usuario cambia a tab `Registro`.
2. Ingresa nombre, correo, contrasena y sector de negocio.
3. La pantalla carga sectores activos desde `business_sectors`.
4. Si no puede cargar sectores desde Supabase, usa fallback local.
5. Antes de crear cuenta muestra consentimiento de tratamiento de datos.
6. Si acepta, invoca `secure-register-user`.
7. La funcion valida email, password, nombre, sector activo y consentimiento.
8. Crea usuario en Supabase Auth con API admin.
9. Cifra email y nombre con AES-256-GCM.
10. Genera HMAC para busqueda exacta de email.
11. Guarda perfil en `public.users`.
12. Enmascara email en `users.email` como `<uuid>@private.local`.
13. Registra auditoria en `security_audit_events`.
14. El frontend inicia sesion con email/password y navega al dashboard.

Puntos auditables:

- La contrasena se envia a `secure-register-user`; debe viajar solo por HTTPS.
- La funcion usa `SUPABASE_SERVICE_ROLE_KEY`; nunca debe estar en el frontend.
- Se usa una sola clave base para AES y HMAC; seria mejor separar claves.
- CORS esta abierto con `Access-Control-Allow-Origin: *`; conviene restringir en funciones sensibles.
- El rate limit de registro depende de Supabase/infra, no de una tabla persistente propia.

## 7. Como funciona el usuario final

### Landing

Archivo: `frontend/src/screens/LandingPage.tsx`

Funciona como primera pantalla publica. Si `useAuth()` tiene usuario, el boton principal dice `CONTINUAR ENTRENAMIENTO` y navega a `/dashboard`; si no, dice `COMENZAR ENTRENAMIENTO` y navega a `/login`.

Tambien ofrece instalacion PWA si el navegador dispara `beforeinstallprompt`.

### Dashboard

Archivo: `frontend/src/screens/DashboardScreen.tsx`

Muestra:

- bienvenida con nombre del perfil;
- estadisticas visuales;
- misiones sugeridas;
- alertas activas;
- consejo del Sensei;
- logros visuales.

Datos reales consultados:

- `katas`: filtra `active = true`, ordena por `points_reward`, limita a 4.
- `alerts`: filtra `active = true`, ordena por `published_at`, limita a 3.

Datos demostrativos/locales:

- Algunas metricas de dashboard como racha, ranking y kata hoy son valores visuales fijos o derivados de estado local, no calculos reales del backend.

### Dojos

Archivo: `frontend/src/screens/DojoListPage.tsx`

Muestra:

- dojos base definidos localmente en `frontend/src/data/ciberDojo.ts`;
- examenes de cinturon cargados desde tabla `katas` cuando `kata_code` empieza con `EXAM_`;
- filtro por cinturon.

Los dojos base locales sirven como estructura de navegacion y fallback visual. Los examenes reales vienen de Supabase.

### Detalle de dojo

Archivo: `frontend/src/screens/DojoDetailPage.tsx`

Funcionamiento:

1. Recibe `id` desde `/dojo/:id`.
2. Busca dojo local en `dojoModules`.
3. Calcula `dojo_id` central (`dojo-passwords`, `dojo-phishing`, `dojo-backups`, etc.).
4. Carga preguntas activas desde `questions`.
5. Filtra estados de auditoria aceptados: `approved`, `auditada`, `aprobada`.
6. Normaliza opciones.
7. Construye distractores defensivos si la pregunta trae pocas opciones utiles.
8. El usuario responde en interfaz de combate.
9. Si acierta todas las preguntas, puede ir al examen de cinturon.
10. Si no, vuelve a dojos.

Punto importante:

- El dojo normal no persiste progreso ni puntos por si mismo. El avance persistente se registra en los examenes/katas con `complete-kata`.

### Katas y examenes de cinturon

Archivo: `frontend/src/screens/KataExamPage.tsx`  
Edge Function: `supabase/functions/complete-kata/index.ts`

Funcionamiento:

1. Carga kata por `kata_code`.
2. Lee `steps` desde `katas`.
3. El usuario responde todas las preguntas.
4. El frontend envia solo `kata_code` y `selected_answers`.
5. `complete-kata` vuelve a cargar el kata desde la base.
6. Calcula score server-side contra `steps.correct`.
7. Aprueba si score/total es mayor o igual a 75%.
8. Si aprueba, asigna `points_earned = katas.points_reward`.
9. Inserta o actualiza `kata_completions` con `onConflict: user_id,kata_id`.
10. Recalcula `users.total_points` sumando todas las completaciones.
11. Si aprueba, actualiza `users.belt` al siguiente cinturon.
12. Devuelve score, total, estado aprobado, puntos y cinturon.

Puntos auditables:

- El calculo de respuestas correctas esta en servidor, correcto para evitar manipulacion simple del frontend.
- La funcion permite reintentos porque hace upsert; si se quiere limitar intentos, falta tabla/columna de intentos.
- Si un usuario repite una kata aprobada, el upsert no duplica la completion por constraint unico.
- Debe verificarse que `katas.steps` no sea legible si se considera respuesta sensible. Actualmente katas activos son legibles por RLS.

### Evaluacion de riesgo

Componente: `frontend/src/components/AdaptiveQuestionnaire.tsx`  
Edge Function: `supabase/functions/calculate-risk/index.ts`

Funcionamiento:

1. El cuestionario inicia en pregunta `A01`.
2. Cada pregunta tiene opciones con `valor`, `puntaje_riesgo` y `siguiente_pregunta`.
3. La navegacion adaptativa sigue `siguiente_pregunta`.
4. Al llegar a `FIN`, envia respuestas a `calculate-risk`.
5. La funcion valida sesion, cantidad, IDs y opciones contra la tabla `questions`.
6. Calcula `totalScore`.
7. Clasifica riesgo:
   - `>= 86`: `critico`
   - `>= 56`: `alto`
   - `>= 26`: `medio`
   - `>= 11`: `bajo`
   - `< 11`: `bajo`
8. Inserta `evaluations`.
9. Actualiza `users.current_risk_level` y `users.last_evaluation_at`.

Punto de diseno:

- `calculate-risk` no debe actualizar `users.total_points`; ese campo pertenece a gamificacion, no riesgo.

### Sensei IA

Pantalla: `frontend/src/screens/SenseiConsultPage.tsx`  
Funcion: `supabase/functions/ask-sensei/index.ts`  
Tabla: `sensei_consultations`

Funcionamiento:

1. Usuario envia una pregunta.
2. La funcion identifica si el tema es de ciberseguridad mediante palabras clave.
3. Si es vocabulario conocido, responde con glosario local.
4. Si esta fuera de alcance, responde que solo atiende temas de ciberseguridad.
5. Si es valido, busca coincidencias en `questions`.
6. Si hay pocas coincidencias, puede usar `WEB_SEARCH_ENDPOINT` si esta configurado.
7. Construye respuesta defensiva en lenguaje simple.
8. Audita la respuesta con agente `sensei-question-auditor` si esta configurado.
9. Si no hay auditor IA o falla, usa fallback local.
10. Inserta la consulta con fuentes, respuesta, auditor, notas y estado.

Proveedores soportados en la funcion:

- DeepSeek.
- Kimi.
- Anthropic/Claude.
- Fallback local.

Puntos auditables:

- La funcion acepta consulta sin usuario y registra `user_id = null`; revisar si se desea exigir sesion.
- Los prompts restringen el alcance a ciberseguridad defensiva, pero debe auditarse prompt injection.
- CORS abierto.
- Las respuestas de IA externa deben considerarse no confiables hasta pasar auditoria.

### Scanner educativo

Ruta: `/escaner`  
Componentes: `frontend/src/components/VulnScanner/*`  
Funcion: `supabase/functions/vuln-scanner-ai/index.ts`

Funcionamiento:

- Detecta senales disponibles desde navegador y entorno web.
- Usa checks locales definidos en `frontend/src/data/scanChecks.ts`.
- Solicita recomendacion al Sensei IA de scanner cuando hay `GEMINI_API_KEY`.
- Puede pedir auditoria en modo `auditor`.

Limitaciones:

- No revisa disco, antivirus, procesos ni configuracion real del SO.
- No escanea red.
- No debe presentarse como auditoria tecnica completa.

### Ranking

Ruta: `/ranking`  
Funcion: `supabase/functions/get-ranking/index.ts`

Funcionamiento:

1. Valida sesion.
2. Lee `kata_completions`.
3. Agrupa puntos por usuario.
4. Lee usuarios relacionados.
5. Excluye dominios publicos como Gmail, Hotmail, Outlook, Yahoo, iCloud, Proton, etc.
6. Descifra nombre si existe `full_name_encrypted`.
7. Muestra ranking con nombre, cinturon, XP, cantidad de katas y dominio.

Punto auditable:

- Aunque filtra dominios publicos, sigue mostrando `full_name`; revisar si el ranking debe usar alias o consentimiento especifico.

## 8. Funciones del administrador integrado

Ruta: `/admin`  
Archivo: `frontend/src/screens/AdminCenterScreen.tsx`

Control de acceso frontend:

- `AdminCenterScreen` recibe `currentUser`.
- Calcula `isAdmin = currentUser?.role === 'admin'`.
- Si no es admin, muestra `Acceso restringido`.
- La seguridad real debe depender de RLS y funciones server-side, no solo de esta condicion visual.

Datos cargados en `loadAdminData()`:

- Conteo total de usuarios.
- Usuarios evaluados.
- Usuarios con riesgo `alto` o `critico`.
- Total de completaciones de katas.
- Total de incidentes investigados.
- Preguntas pendientes de auditoria.
- Usuarios recientes.
- Preguntas recientes.
- Proveedores IA.
- Configuracion de agentes.
- Asignaciones agente-proveedor.
- Investigaciones de incidentes.
- Ejecuciones de agentes.
- Reporte de correcciones IA.
- Sectores de negocio.

Tabs administrativas:

### Dashboard

Muestra KPIs operativos y listas recientes:

- usuarios;
- evaluaciones;
- usuarios de alto riesgo;
- katas completadas;
- incidentes;
- preguntas pendientes de auditoria;
- ultimas ejecuciones de agentes.

### Preguntas

Permite crear o editar preguntas en `questions`.

Campos principales:

- `id`
- `branch`
- `order_num`
- `iso_control`
- `question_text`
- `question_type`
- `options`
- `active`
- `source_type`
- `audit_status`

Al guardar:

- Parse JSON de `options`.
- Si el `id` ya existe, actualiza.
- Si no existe, inserta.
- Marca preguntas manuales como `audit_status = approved`.

Puntos auditables:

- Validar estrictamente JSON de opciones.
- Validar que no se creen preguntas con respuestas ambiguas.
- Validar que solo admin pueda insertar/actualizar.

### Sectores

Implementacion: tab `sectors` en `AdminCenterScreen`  
Tabla: `business_sectors`  
RPC: `save_business_sector`

Permite:

- Crear nuevo sector.
- Editar codigo interno.
- Editar nombre visible.
- Editar orden.
- Activar o inhabilitar.
- Guardar cambios.
- Actualizar referencias si cambia el codigo.

Al guardar:

1. El frontend normaliza codigo con minusculas, numeros y `_`.
2. Llama `supabase.rpc('save_business_sector', ...)`.
3. La funcion SQL verifica `public.is_admin()`.
4. Valida codigo con regex `^[a-z0-9_]{2,40}$`.
5. Valida label con longitud minima.
6. Si es nuevo, inserta o actualiza por conflicto.
7. Si edita mismo codigo, actualiza label/activo/orden.
8. Si cambia codigo:
   - actualiza `business_sectors.code`;
   - actualiza `users.business_type`;
   - reemplaza el valor en `alerts.target_business_types`.

Efecto esperado:

- Sectores activos aparecen en registro de nuevos usuarios.
- Sectores inhabilitados no aparecen para nuevos registros.
- Usuarios existentes conservan su sector aunque despues se inactive.
- Si cambia el codigo, las referencias existentes se migran al nuevo codigo.

Puntos auditables:

- La tabla concede `INSERT/UPDATE/DELETE` a `authenticated`, pero RLS limita a admins. Verificar que RLS este activo en produccion.
- `save_business_sector` es `SECURITY DEFINER`; revisar owner, search_path y grants.
- Revisar si hay mas tablas que dependan de `business_type` y no se actualicen en la RPC.

### Proveedores IA

Tabla: `ai_providers`

Permite:

- Registrar proveedor.
- Editar `provider_key`, `label`, `provider_type`, `model_name`, `purpose`, `active`.
- Guardar con `upsert`.

Proveedores esperados por funciones:

- `deepseek`
- `kimi`
- `claude`/Anthropic
- otros locales o futuros si se implementan en funciones.

Punto auditable:

- Guardar un proveedor en DB no implementa automaticamente su cliente HTTP. Cada funcion debe saber como llamar ese proveedor.

### Agentes

Tablas:

- `agent_configs`
- `agent_provider_assignments`
- `agent_runs`

Permite:

- Editar nombre, descripcion, estado habilitado, hora, zona horaria, prompt, ventana de investigacion y settings.
- Asignar proveedores IA activos por prioridad.
- Ejecutar manualmente:
  - `run-incident-investigator`
  - `audit-generated-questions`
  - `run-daily-agent-workflows`
- Ver ultimas ejecuciones.

Agentes reconocidos:

- `incident-investigator`
- `question-auditor`
- `ciber-dojo-news-agent`
- `sensei-question-auditor`

Puntos auditables:

- Confirmar que cada Edge Function valida que quien la invoca es admin.
- Confirmar que los prompts no permitan generar contenido ofensivo.
- Confirmar que `agent_runs` registra errores y resultados suficientes.

### Incidentes

Tabla: `incident_investigations`

Muestra:

- fecha;
- titulo;
- resumen;
- severidad;
- fuente;
- proveedor IA;
- preguntas generadas;
- estado.

Estados esperados:

- `detectado`
- `preguntas_generadas`
- `auditado`
- `descartado`

### Auditoria IA

Vista: `ai_audit_corrections_report`

Muestra correcciones realizadas por auditores IA sobre:

- respuestas del Sensei;
- preguntas generadas desde scanner web o incidentes.

Campos relevantes:

- tipo de origen;
- pregunta;
- respuesta original;
- respuesta corregida;
- proveedor/modelo auditor;
- notas;
- si reemplazo contenido.

## 9. Administrador central separado

Ubicacion: `central-admin-app/`

Esta app no es la misma ruta `/admin` del frontend. Es una consola independiente que se levanta con:

```powershell
cd central-admin-app
$env:SUPABASE_URL="https://<project>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-server-side>"
$env:CENTRAL_ADMIN_USER="admin"
$env:CENTRAL_ADMIN_PASSWORD="<password-fuerte>"
npm start
```

Por defecto escucha en `PORT` o `3100`.

### `server.js`

Responsabilidades:

- Servir `index.html`, `styles.css`, `app.js` y assets.
- Proteger toda la app con Basic Auth si `CENTRAL_ADMIN_USER` y `CENTRAL_ADMIN_PASSWORD` existen.
- Proxy hacia Supabase:
  - `/api/rest/v1/*`
  - `/api/auth/v1/*`
- Exponer APIs T-Pot:
  - `/api/admin/tpot/health`
  - `/api/admin/tpot/summary`
  - `/api/admin/tpot/logs`
  - `/api/admin/tpot/reports`
  - `/api/admin/tpot/iocs`
  - `/api/admin/tpot/audit-log`
  - `/api/admin/tpot/settings`
  - `/api/admin/tpot/ai-analysis`
  - `/api/admin/tpot/ai-analysis/:id`
  - `/api/admin/tpot/ai-analysis/:id/audit`
  - `/api/admin/tpot/ai-analysis/:id/approve`
  - `/api/admin/tpot/ai-analysis/:id/reject`

Controles:

- Basic Auth opcional.
- `Cache-Control: no-store`.
- Sanitizacion de path para servir archivos.
- Rate limit en memoria por IP+ruta para T-Pot: 80 requests/minuto.

Riesgo principal:

- El proxy usa `SUPABASE_SERVICE_ROLE_KEY`. Si el Basic Auth es debil o la app queda publica sin proteccion adicional, un atacante podria operar Supabase con privilegios elevados.

Recomendacion de produccion:

- No exponer solo con Basic Auth.
- Usar Cloud Run IAP, SSO corporativo, MFA, VPN o allowlist de IP.
- Rotar service role si alguna vez estuvo en cliente o repo.

### `app.js`

UI administrativa extensa con estado local en `localStorage`.

Capacidades observadas:

- Gestion visual de dojos.
- Plan de preguntas manuales/IA.
- Proveedores IA.
- Noticias/agente.
- Usuarios simulados.
- Campanas.
- Frases de sabiduria.
- T-Pot dashboard.
- T-Pot logs.
- T-Pot reportes.
- T-Pot IOCs.
- T-Pot analisis IA y aprobacion.

Punto importante:

- Parte de esta UI opera con datos locales simulados y parte llama APIs reales. Una auditoria debe diferenciar persistencia local, Supabase y memoria server-side.

### `tpotService.js`

Responsabilidades:

- Leer configuracion desde variables de entorno.
- Conectarse a Elastic/OpenSearch si `TPOT_ELASTIC_URL` existe.
- Usar eventos demo si no hay endpoint T-Pot/Elastic.
- Normalizar eventos heterogeneos de honeypot.
- Sanitizar datos sensibles.
- Enmascarar emails, JWT, tokens, secrets y passwords.
- Extraer IOCs defensivos.
- Crear reportes ejecutivos, tecnicos y educativos.
- Crear jobs IA en memoria.
- Auditar respuestas IA localmente.
- Bloquear visualizacion de salida si no esta aprobada.

Limitacion actual:

- Jobs, auditoria e IOCs estan en memoria (`Map`/array), aunque existen tablas Supabase para persistirlos.

## 10. Base de datos y modelo de datos

Tablas base:

- `users`: perfil, email enmascarado, PII cifrada, rol, sector, cinturon, puntos, riesgo.
- `evaluations`: respuestas y puntaje de riesgo.
- `questions`: banco de preguntas.
- `katas`: ejercicios/examenes.
- `kata_completions`: completaciones y puntos.
- `email_analysis`: analisis de correos sospechosos.
- `domains_whitelist`: dominios confiables.
- `alerts`: alertas de seguridad.
- `alert_deliveries`: entregas de alertas.
- `sponsors`: patrocinadores/servicios.
- `ai_configs`: configuracion IA heredada.
- `recommendations_cache`: cache de recomendaciones.

Tablas admin/agentes:

- `ai_providers`
- `agent_configs`
- `agent_provider_assignments`
- `incident_investigations`
- `agent_runs`

Tablas dojo/admin central:

- `cyber_dojos`
- `cyber_dojo_wisdom_quotes`
- `cyber_news_sources`
- `cyber_dojo_generated_katas`
- `central_admin_campaigns`

Tablas privacidad:

- `security_audit_events`

Tablas T-Pot:

- `tpot_integration_settings`
- `tpot_query_audit`
- `tpot_ai_analysis_jobs`
- `tpot_iocs_cache`

Catalogo:

- `business_sectors`

## 11. RLS y autorizacion

La seguridad de datos depende principalmente de Supabase RLS.

Patrones RLS:

- Usuarios ven/modifican solo su propio perfil.
- Usuarios ven sus propias evaluaciones, completaciones, analisis de email y entregas de alertas.
- Contenido activo como katas, preguntas, alertas y dominios puede leerse de forma amplia segun politicas.
- Admins gestionan tablas operativas mediante `public.is_admin()`.
- `public.is_admin()` consulta `public.users` con `auth.uid()` y `role = 'admin'`.

Hardening relevante:

- `005_security_hardening.sql` protege campos sensibles de usuario.
- `016_business_sectors_catalog.sql` mueve sectores a catalogo administrable.
- Varias operaciones usan Edge Functions con service role y validan token antes de escribir.

Puntos auditables:

- Confirmar que RLS esta activado en todas las tablas de produccion.
- Confirmar que no existan grants que permitan saltarse RLS desde `anon`.
- Revisar funciones `SECURITY DEFINER`.
- Revisar politicas publicas de `questions` y `katas` porque podrian revelar respuestas de examenes.

## 12. Edge Functions y responsabilidades

Funciones de identidad y privacidad:

- `secure-register-user`: crea usuario y perfil con PII cifrada.
- `get-private-profile`: devuelve perfil descifrado a propietario o admin.
- `migrate-user-pii`: migra registros historicos a cifrado.
- `backfill-email-domains`: calcula dominios de email.

Funciones de entrenamiento:

- `calculate-risk`: calcula riesgo y guarda evaluacion.
- `complete-kata`: valida respuestas de kata, guarda completion, recalcula puntos y actualiza cinturon.
- `get-ranking`: devuelve ranking minimizado.

Funciones IA/educativas:

- `ask-sensei`: responde consultas defensivas y registra auditoria.
- `vuln-scanner-ai`: genera/audita recomendaciones del scanner educativo.
- `generate-recommendations`: genera recomendaciones con fallback de proveedores.
- `analyze-email`: analiza senales de correo sospechoso.

Funciones de agentes:

- `run-incident-investigator`
- `audit-generated-questions`
- `run-daily-agent-workflows`

Regla general:

- Toda funcion que use `SUPABASE_SERVICE_ROLE_KEY` debe validar token de usuario o secreto cron antes de operar, salvo que sea deliberadamente publica y de solo lectura.

## 13. Datos sensibles y privacidad

Datos personales tratados:

- email;
- nombre;
- telefono;
- ciudad;
- provincia;
- sector de negocio;
- historial de evaluaciones;
- consultas al Sensei;
- progreso y ranking.

Cifrado:

- AES-256-GCM para PII.
- HMAC-SHA-256 para busqueda exacta de email.
- `PII_KEY_VERSION` prepara rotacion futura.

Minimizacion:

- `users.email` se guarda como email enmascarado.
- El email real vive en Supabase Auth y en `email_encrypted`.
- Ranking filtra dominios publicos.

Auditoria:

- `security_audit_events` registra registros, lecturas y denegaciones relacionadas con PII.

Riesgos:

- Separar clave AES y HMAC en una iteracion futura.
- Implementar multi-key decrypt real antes de rotar claves.
- Revisar retencion de `sensei_consultations`.
- Evitar mostrar nombres reales en ranking sin consentimiento explicito.

## 14. Configuracion requerida

Frontend:

```env
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
NODE_ENV=development
```

Supabase Edge Functions:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PII_ENCRYPTION_KEY_B64=
PII_KEY_VERSION=1
PII_MIGRATION_SECRET=
DEEPSEEK_API_KEY=
KIMI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
WEB_SEARCH_ENDPOINT=
WEB_SEARCH_API_KEY=
CRON_SECRET=
```

Admin central:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CENTRAL_ADMIN_USER=
CENTRAL_ADMIN_PASSWORD=
TPOT_API_BASE_URL=
TPOT_ELASTIC_URL=
TPOT_ELASTIC_USERNAME=
TPOT_ELASTIC_PASSWORD=
TPOT_API_TOKEN=
TPOT_VERIFY_TLS=true
TPOT_TIMEOUT_MS=8000
TPOT_ALLOWED_INDEXES=logstash-*,tpot-*,cowrie-*,suricata-*,dionaea-*
AI_ANALYSIS_ENABLED=false
AI_PROVIDER=local
AI_MODEL=local-defensive-rules
AI_API_KEY=
AI_AUDIT_ENABLED=true
AI_AUDIT_MODEL=local-tpot-auditor
AI_MAX_LOG_RECORDS=120
AI_MAX_CONTEXT_TOKENS=6000
AI_OUTPUT_REQUIRES_APPROVAL=true
```

No deben existir en frontend ni en repositorio:

- `SUPABASE_SERVICE_ROLE_KEY`
- claves IA;
- claves PII;
- credenciales T-Pot;
- secretos cron;
- archivos `.env` reales;
- claves `.json`, `.pem`, `.p12`, `.pfx`, `.key`.

## 15. Checklist de auditoria para una IA

### Autenticacion

- Verificar que todas las rutas protegidas pasen por `ProtectedShell` o validen sesion.
- Confirmar que `/admin` y `/tenant-admin` no permitan acciones reales sin `role = admin`.
- Confirmar que magic link no cree usuarios (`shouldCreateUser: false`).
- Confirmar Redirect URLs permitidas en Supabase.
- Revisar expiracion OTP/magic link y rate limits.
- Evaluar implementacion futura de Google OAuth si se desea SSO real con Gmail.

### Autorizacion y RLS

- Ejecutar consultas de `docs/SUPABASE_VERIFICATION_QUERIES.sql`.
- Confirmar RLS en tablas sensibles.
- Confirmar politicas admin con `public.is_admin()`.
- Revisar funciones `SECURITY DEFINER`.
- Confirmar que `anon` no puede modificar tablas.
- Confirmar que `authenticated` sin admin no puede escribir admin data.

### Privacidad

- Confirmar que perfiles nuevos se guardan cifrados.
- Confirmar que `get-private-profile` no permite leer perfiles ajenos sin admin.
- Confirmar que logs no imprimen PII.
- Confirmar que ranking no expone PII excesiva.
- Confirmar retencion de consultas Sensei.

### Integridad de progreso

- Validar que `complete-kata` calcula respuestas server-side.
- Verificar que `users.total_points` coincide con suma de `kata_completions`.
- Revisar reintentos y abuso de katas.
- Revisar si `katas.steps.correct` debe dejar de ser publico.

### Contenido IA

- Revisar prompt injection en `ask-sensei`.
- Verificar que preguntas generadas pasen por auditoria.
- Confirmar que no se publique contenido ofensivo.
- Revisar fallback si proveedores IA fallan.
- Confirmar timeout y limites de tokens.

### Admin central

- Verificar que Basic Auth no sea la unica defensa en produccion.
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` solo vive en servidor.
- Revisar proxy `/api/rest/v1/*` por alcance excesivo.
- Persistir auditoria T-Pot en Supabase.
- Revisar rate limiting persistente.

### CORS y seguridad web

- Reemplazar `Access-Control-Allow-Origin: *` en funciones sensibles por dominios permitidos.
- Revisar headers HTTP del frontend servido en Cloud Run.
- Agregar CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Confirmar HTTPS obligatorio.

### Dependencias

- Ejecutar `npm audit`.
- Revisar deuda de `react-scripts`/CRA.
- Considerar migracion futura a Vite para reducir dependencias obsoletas.

## 16. Hallazgos tecnicos relevantes

1. El repo limpio compila y la app principal esta lista para empaquetar.
2. El login por magic link esta implementado sobre Supabase OTP, pero no es SSO Google.
3. El registro valida sector activo contra `business_sectors`.
4. El mantenimiento de sectores existe en `/admin`, tab `Sectores`, y propaga cambios de codigo a `users` y `alerts`.
5. `TenantAdminPage` es una UI/prototipo con estado local, no una administracion multi-tenant plenamente persistida.
6. `central-admin-app` es poderosa porque usa service role server-side; requiere proteccion fuerte.
7. T-Pot tiene tablas en Supabase, pero el servicio Node mantiene jobs/auditoria/IOCs en memoria.
8. Algunas metricas del dashboard usuario son demostrativas y no deben tratarse como datos auditados.
9. Preguntas y katas activos son legibles por politicas amplias; revisar si contienen respuestas correctas.
10. CORS abierto aparece en varias Edge Functions.

## 17. Recomendaciones de mejora priorizadas

Alta prioridad:

1. Endurecer CORS de Edge Functions sensibles.
2. Proteger admin central con IAP/SSO/MFA o red privada.
3. Persistir auditoria y jobs T-Pot en Supabase.
4. Verificar en Supabase vivo que RLS y politicas coinciden con migraciones.
5. Revisar exposicion de respuestas correctas en `katas.steps` y `questions.options`.
6. Agregar rate limiting server-side para registro, magic link y funciones IA.

Media prioridad:

1. Reemplazar dashboard demo por metricas reales.
2. Implementar intentos de kata, bloqueo temporal y auditoria de repeticion.
3. Conectar `generate-recommendations` a resultados de evaluacion.
4. Conectar `analyze-email` a una pantalla de usuario.
5. Separar claves AES y HMAC.
6. Implementar rotacion multi-key.

Baja prioridad:

1. Corregir mojibake/codificacion en textos visibles y docs.
2. Normalizar marca entre `Cyber Dojo` y `Ciber Dojo`.
3. Actualizar CRA a Vite.
4. Ampliar tests E2E y tests de Edge Functions.

## 18. Comandos de validacion local

Desde la raiz del repo limpio:

```powershell
npm install
npm run frontend:install
npm run build
npm run admin:test
```

Validacion detallada del frontend:

```powershell
cd frontend
npx tsc --noEmit
npm run build
```

Validacion admin central:

```powershell
cd central-admin-app
npm test
```

## 19. Script SQL recomendado para verificar Supabase vivo

Usar primero `docs/SUPABASE_VERIFICATION_QUERIES.sql`. Si se necesita una verificacion minima adicional para sectores y progreso:

```sql
-- Sectores activos visibles para registro
select code, label, active, display_order
from public.business_sectors
order by display_order, label;

-- Usuarios y sectores
select id, email, business_type, role, belt, total_points, created_at
from public.users
order by created_at desc
limit 50;

-- Consistencia de puntos
select
  u.id,
  u.email,
  u.total_points as users_total_points,
  coalesce(sum(kc.points_earned), 0) as kata_points_sum
from public.users u
left join public.kata_completions kc on kc.user_id = u.id
group by u.id, u.email, u.total_points
order by u.email;

-- RLS activo en tablas principales
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'evaluations',
    'kata_completions',
    'questions',
    'katas',
    'business_sectors',
    'ai_providers',
    'agent_configs',
    'security_audit_events'
  )
order by tablename;

-- Politicas relevantes
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'users',
    'questions',
    'katas',
    'business_sectors',
    'ai_providers',
    'agent_configs'
  )
order by tablename, policyname;
```

## 20. Prompt sugerido para una IA auditora

```text
Estas auditando Cyber Dojo, una aplicacion React/TypeScript + Supabase para entrenamiento gamificado de ciberseguridad. Debes revisar frontend, Supabase migrations/functions y central-admin-app. La app usa Supabase Auth, magic link, password login, registro cifrado de PII, RLS, Edge Functions con service role server-side, panel admin interno y admin central Node con proxy Supabase/T-Pot. Prioriza riesgos de autenticacion, autorizacion, RLS, service role, CORS, PII, exposicion de respuestas correctas, abuso de katas, prompt injection, contenido IA ofensivo, ranking con PII y admin central expuesto. No propongas cambios sin ubicar el archivo exacto y el flujo afectado. No muevas secretos al frontend. Distingue datos reales, datos demo/localStorage y datos en memoria.
```

