# Cyber Dojo - Documento maestro para continuidad con IA

Fecha de elaboracion: 2026-08-27  
Repositorio local revisado: `C:\Users\aps-ecuador\Riesgo\shield-ecuador-app`  
Objetivo: entregar una base tecnica y funcional para que una IA o un equipo pueda seguir construyendo funcionalidades en Cyber Dojo sin partir desde cero.

## 1. Resumen ejecutivo

Cyber Dojo es una plataforma de entrenamiento en ciberseguridad para MIPYMEs ecuatorianas y usuarios no tecnicos. Usa una narrativa de dojo/karate: los usuarios aprenden conceptos de seguridad, responden preguntas, completan katas, suben de cinturon y reciben apoyo de un Sensei IA.

La aplicacion tiene tres superficies principales:

- `frontend/`: aplicacion React + TypeScript para usuarios finales y un panel admin interno.
- `supabase/`: base de datos PostgreSQL, RLS, migraciones y Edge Functions.
- `central-admin-app/`: consola administrativa Node/HTML/CSS/JS con proxy a Supabase y modulo defensivo T-Pot/Elastic.

Estado general observado:

- El frontend implementa autenticacion, registro seguro, perfil privado, dashboard, dojos, katas/examenes, ranking, Sensei IA y scanner educativo.
- Supabase contiene 14 migraciones, tablas base, politicas RLS, cifrado PII, agentes IA, ranking y estructuras T-Pot.
- Existen Edge Functions conectadas al frontend (`secure-register-user`, `get-private-profile`, `calculate-risk`, `complete-kata`, `ask-sensei`, `get-ranking`, `vuln-scanner-ai`) y otras disponibles para evolucion (`generate-recommendations`, `analyze-email`, agentes diarios, migraciones PII).
- `central-admin-app` usa un proxy server-side con `SUPABASE_SERVICE_ROLE_KEY`; esto permite administracion, pero exige endurecimiento fuerte antes de produccion.

## 2. Fuentes internas revisadas

Documentacion Markdown propia revisada:

- `ARQUITECTURA_CYBER_DOJO.md`
- `DOCUMENTO_FUNCIONALIDADES.md`
- `GUIA_LEVANTAMIENTO_PROYECTO.md`
- `MANUAL_ADMINISTRADOR.md`
- `MANUAL_USUARIO_CYBER_DOJO.md`
- `SECURITY_PRIVACY.md`
- `SETUP.md`
- `docs/MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md`
- `docs/MANUAL_TECNICO_SENSOR_TPOT.md`
- `docs/TPOT_AI_AGENT.md`
- `docs/TPOT_DEPLOYMENT_CHECKLIST.md`
- `docs/TPOT_INTEGRATION.md`
- `frontend/README.md`

Codigo y configuracion usados para contrastar la documentacion:

- `frontend/package.json`
- `frontend/.env.example`
- `frontend/src/App.tsx`
- `frontend/src/lib/supabase.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/components/AdaptiveQuestionnaire.tsx`
- `frontend/src/screens/KataExamPage.tsx`
- `frontend/src/screens/AdminCenterScreen.tsx`
- `frontend/src/screens/SenseiConsultPage.tsx`
- `frontend/src/screens/LeaderboardPage.tsx`
- `frontend/src/services/auditorIA.ts`
- `frontend/src/services/senseiIA.ts`
- `central-admin-app/package.json`
- `central-admin-app/server.js`
- `central-admin-app/app.js`
- `central-admin-app/tpotService.js`
- `supabase/migrations/*.sql`, incluidas `015_align_belt_progression_and_points.sql` y `016_business_sectors_catalog.sql`
- `supabase/functions/*/index.ts`

Nota de calidad documental: varios Markdown existentes tienen caracteres mojibake por codificacion. Este documento corrige el contenido conceptual, pero no modifica esos archivos originales.

## 3. Stack real observado

Frontend:

- React `^19.2.5`
- TypeScript `^4.9.5`
- Create React App / `react-scripts` `5.0.1`
- React Router DOM `^7.15.0`
- Supabase JS `^2.104.1`
- Framer Motion `^12.38.0`
- Lucide React `^1.11.0`
- Three.js `^0.184.0`
- Zustand `^5.0.13`

Scripts reales del frontend:

- `npm start`: ejecuta `node static-server.js`, pensado para servir build estatico.
- `npm run start:dev`: ejecuta `react-scripts start`, modo desarrollo.
- `npm run build`: compila produccion en `frontend/build`.
- `npm test`: ejecuta tests CRA/Jest.

Admin central:

- Node 20.x.
- `npm start`: `node server.js`.
- `npm test`: `node tests/tpotService.test.js`.
- No declara dependencias externas en `package.json`; usa modulos nativos de Node y archivos estaticos.

Supabase:

- PostgreSQL con migraciones SQL.
- Supabase Auth.
- Supabase Edge Functions en Deno.
- RLS habilitado en tablas sensibles y administrativas.

## 4. Estructura funcional del repositorio

```text
shield-ecuador-app/
  frontend/
    public/
    src/
      components/
      contexts/
      data/
      hooks/
      lib/
      screens/
      services/
      store/
    package.json
    static-server.js
  central-admin-app/
    index.html
    app.js
    server.js
    styles.css
    tpotService.js
    tests/
  supabase/
    config.toml
    migrations/
    functions/
  docs/
  Banco de preguntas/
  frases/
  imagen/
  kata/
```

Directorios que no deben usarse como fuente funcional principal:

- `frontend/node_modules/`: dependencias instaladas, no documentacion del producto.
- `.gcloud-config/`: contiene material local sensible o de configuracion; no debe estar versionado.
- `frontend.zip`: respaldo pesado; no usar como fuente de verdad si existe codigo descomprimido.

## 5. Rutas del frontend

Rutas publicas:

- `/`: landing page.
- `/login`: login y registro.
- `/reset-password`: recuperacion/cambio de contrasena.
- `/dev/kata/:code`: ruta directa de desarrollo para katas.

Rutas protegidas por sesion:

- `/dashboard`: tablero principal.
- `/dojos`: listado de dojos/katas disponibles.
- `/dojo/:id`: detalle de dojo.
- `/kata/:code`: examen/kata.
- `/sensei`: consulta al Sensei IA.
- `/escaner`: scanner educativo local/IA.
- `/ranking`: tabla de posiciones.
- `/perfil`: perfil.
- `/admin`: panel admin interno protegido por rol.

Ruta especial:

- `/tenant-admin`: usa `TenantAdminRoute`; revisar rol/autorizacion en codigo antes de ampliarla.

## 6. Autenticacion y perfil

El estado de autenticacion vive en `frontend/src/contexts/AuthContext.tsx`.

Flujo real:

1. Al cargar, `supabase.auth.getSession()` busca sesion activa.
2. Si hay sesion, se invoca `get-private-profile` por Edge Function.
3. En cambios de sesion, `onAuthStateChange` actualiza `user` y perfil.
4. Login usa `supabase.auth.signInWithPassword`.
5. Login passwordless usa `supabase.auth.signInWithOtp` con `shouldCreateUser = false`.
6. Magic link redirige a `/auth/callback`, valida el token con Supabase Auth y vuelve a la ruta solicitada.
7. Registro no usa `signUp` directo; invoca `secure-register-user` y luego hace login.

Controles de seguridad del magic link:

- No crea usuarios nuevos automaticamente.
- Usa mensaje neutral para no revelar si el correo existe.
- El boton `COMENZAR ENTRENAMIENTO` lleva a `/login`; en modo ingreso, el submit principal envia magic link por defecto.
- Si ya existe sesion Supabase, `COMENZAR ENTRENAMIENTO` lleva directo a `/dashboard` y `/login` redirige a la ruta solicitada.
- Una sesion abierta en Gmail no equivale a sesion en Ciber Dojo; para SSO con Gmail se debe configurar Google OAuth con Supabase.
- La pantalla ofrece registro como alternativa, sin afirmar si la cuenta existe o no.
- Usa redirect local normalizado para evitar open redirects.
- Depende del allowlist de Supabase Auth para `/auth/callback`.
- Configuracion recomendada: reenvio minimo 60 segundos y expiracion OTP/magic link 15 minutos.
- En produccion se debe configurar SMTP real, HTTPS y monitoreo de eventos Auth.

Registro seguro:

- Entradas: email, password, full_name, business_type, data_processing_authorized.
- Edge Function: `secure-register-user`.
- `business_type` debe existir como `business_sectors.code` activo.
- Crea usuario en Supabase Auth por API admin.
- Guarda perfil en `public.users`.
- Cifra PII con AES-256-GCM.
- Genera HMAC para busqueda exacta por email.
- Registra auditoria en `security_audit_events`.

Lectura de perfil:

- Edge Function: `get-private-profile`.
- Descifra PII solo para propietario o admin.
- Registra auditoria de lectura o denegacion.

Roles:

- `user`
- `admin`
- `analyst`

## 7. Modelo de dominio

Conceptos principales:

- Usuario: persona registrada que realiza entrenamiento.
- Sector de negocio: catalogo administrable (`business_sectors`) usado en el registro para clasificar usuarios por actividad.
- Cinturon: nivel de progreso gamificado. La progresion alineada es `white`, `yellow`, `orange`, `green`, `blue`, `purple`, `red`, `black`. La UI los presenta como blanco, amarillo, naranja, verde, azul, morado, rojo y negro.
- Dojo: tema de entrenamiento configurable (`cyber_dojos`).
- Pregunta: item de evaluacion adaptativa o banco de preguntas (`questions`).
- Kata: practica o examen almacenado en `katas`.
- Completion: evidencia de kata completada (`kata_completions`).
- Evaluacion: resultado del cuestionario de riesgo (`evaluations`).
- Sensei: asistente IA que responde preguntas y registra consultas (`sensei_consultations`).
- Alerta: noticia/amenaza activa para usuarios (`alerts`).
- Agente IA: proceso administrativo que investiga incidentes o audita preguntas.
- T-Pot: fuente externa de telemetria honeypot consultada desde admin, no instalada dentro de esta app.

## 8. Base de datos Supabase

Tablas base creadas en `001_initial_schema.sql`:

- `users`: perfil, rol, cinturon, puntos, riesgo, negocio, PII historica/cifrada.
- `evaluations`: historico de evaluaciones, puntaje total, riesgo, vector_scores, responses.
- `questions`: preguntas adaptativas y banco editable.
- `katas`: catalogo de katas/examenes.
- `kata_completions`: completaciones por usuario.
- `email_analysis`: resultados de analisis de correo sospechoso.
- `domains_whitelist`: dominios confiables.
- `alerts`: alertas de seguridad.
- `alert_deliveries`: entregas/aperturas de alertas.
- `sponsors`: patrocinadores o servicios relacionados.
- `ai_configs`: configuracion heredada de proveedores IA.
- `recommendations_cache`: cache de recomendaciones IA.
- `business_sectors`: catalogo de sectores/tipos de negocio disponibles para registro.

Tablas administrativas/agentes desde `004_admin_center.sql`:

- `ai_providers`
- `agent_configs`
- `agent_provider_assignments`
- `incident_investigations`
- `agent_runs`

Tablas de admin dojo desde `007_central_admin_ciber_dojo.sql`:

- `cyber_dojos`
- `cyber_dojo_wisdom_quotes`
- `cyber_news_sources`
- `cyber_dojo_generated_katas`
- `central_admin_campaigns`

Sensei desde `008_sensei_consultations.sql`:

- `sensei_consultations`
- Vista `sensei_consultation_stats`

Privacidad desde `012_encrypt_registration_pii.sql`:

- `security_audit_events`

T-Pot desde `013_tpot_integration.sql`:

- `tpot_integration_settings`
- `tpot_query_audit`
- `tpot_ai_analysis_jobs`
- `tpot_iocs_cache`

Ranking desde `014_ranking_email_domain.sql`:

- Agrega soporte para dominio de email en ranking. Confirmar columnas exactas con el script de verificacion.

Alineacion desde `015_align_belt_progression_and_points.sql`:

- Amplia el CHECK de `users.belt` a la ruta completa de cinturones.
- Agrega CHECK a `katas.required_belt`.
- Documenta que `users.total_points` son puntos de gamificacion, no puntaje de riesgo.

Catalogo desde `016_business_sectors_catalog.sql`:

- Crea `business_sectors` con `code`, `label`, `active` y `display_order`.
- Migra el modelo desde una lista fija hacia un catalogo administrable.
- Quita el CHECK fijo de `users.business_type`.
- Expone lectura publica solo de sectores activos para el formulario de registro.
- Permite mantenimiento solo a admins mediante RLS y `save_business_sector`.
- `save_business_sector` actualiza `business_sectors`; si cambia el codigo, tambien actualiza `users.business_type` y `alerts.target_business_types`.

## 9. RLS y autorizacion

Patrones RLS observados:

- Usuarios ven y crean datos propios en `users`, `evaluations`, `kata_completions`, `email_analysis`, `alert_deliveries`, `sensei_consultations`.
- Usuarios autenticados pueden leer contenido activo: preguntas, katas, alertas, dominios, campanas activas, dojos activos y frases activas.
- Admins gestionan usuarios, preguntas, alertas, proveedores IA, agentes, dojos, fuentes, campanas, katas generadas, sectores de negocio y T-Pot.
- `public.is_admin()` consulta `public.users` con `auth.uid()` y `role = 'admin'`.

Proteccion adicional:

- `005_security_hardening.sql` agrega un trigger para evitar que usuarios normales manipulen `role`, `belt`, `current_risk_level` y `last_evaluation_at`.
- Las operaciones privilegiadas deben ejecutarse por Edge Functions con service role o por admin autenticado.

## 10. Edge Functions

Funciones existentes:

- `secure-register-user`: registro seguro con cifrado PII.
- `get-private-profile`: lectura/descifrado de perfil privado.
- `migrate-user-pii`: migra datos historicos a PII cifrada.
- `backfill-email-domains`: rellena dominios de email para ranking/analitica.
- `calculate-risk`: calcula evaluacion de riesgo y actualiza `users.current_risk_level` y `users.last_evaluation_at`.
- `complete-kata`: evalua respuestas de una kata en servidor, registra completion, recalcula `users.total_points` desde `kata_completions` y actualiza cinturon si aprueba.
- `generate-recommendations`: genera recomendaciones con IA y cache.
- `analyze-email`: analiza correo sospechoso.
- `ask-sensei`: responde preguntas de ciberseguridad, usa banco de preguntas y auditor IA.
- `get-ranking`: ranking con datos minimizados/descifrados segun necesidad.
- `vuln-scanner-ai`: recomendaciones/auditoria para scanner educativo usando Gemini.
- `run-incident-investigator`: investiga incidentes y genera preguntas.
- `audit-generated-questions`: audita preguntas generadas.
- `run-daily-agent-workflows`: dispatcher de agentes segun horario.

Funciones invocadas desde frontend actual:

- `secure-register-user`
- `get-private-profile`
- `calculate-risk`
- `complete-kata`
- `ask-sensei`
- `get-ranking`
- `vuln-scanner-ai`
- `run-incident-investigator` / `audit-generated-questions` / `run-daily-agent-workflows` desde panel admin interno segun `AdminCenterScreen`.

Funciones disponibles pero no conectadas claramente a pantallas de usuario:

- `generate-recommendations`
- `analyze-email`
- `migrate-user-pii`
- `backfill-email-domains`

## 11. Flujo de evaluacion adaptativa

Componente: `frontend/src/components/AdaptiveQuestionnaire.tsx`  
Edge Function: `calculate-risk`  
Tabla: `questions`  
Tabla resultado: `evaluations`

Flujo:

1. Inicia por defecto en pregunta `A01`.
2. Carga pregunta activa por `id`.
3. Cada opcion contiene:
   - `valor`
   - `texto`
   - `puntaje_riesgo`
   - `siguiente_pregunta`
   - `explicacion_para_usuario`
   - opcionalmente `alerta_inmediata` y `mensaje_alerta`
4. Si `siguiente_pregunta` es `FIN`, envia respuestas a `calculate-risk`.
5. `calculate-risk` valida sesion, IDs, opciones y puntajes contra la base.
6. Inserta fila en `evaluations`.
7. Actualiza `users.current_risk_level` y `users.last_evaluation_at`.

Clasificacion actual en `calculate-risk`:

- `totalScore >= 86`: riesgo `critico`, cinturon `white`.
- `totalScore >= 56`: riesgo `alto`, cinturon `yellow`.
- `totalScore >= 26`: riesgo `medio`, cinturon `orange`.
- `totalScore >= 11`: riesgo `bajo`, cinturon `green`.
- `< 11`: riesgo `bajo`, cinturon `brown`.

Decision aplicada: `calculate-risk` ya no actualiza `users.total_points` ni `users.belt`. El puntaje de riesgo queda en `evaluations.total_score`; `users.total_points` queda reservado para puntos de gamificacion.

## 12. Flujo de katas y cinturones

Pantalla: `frontend/src/screens/KataExamPage.tsx`  
Tabla: `katas`  
Tabla resultado: `kata_completions`
Edge Function: `complete-kata`

Flujo:

1. Carga kata por `kata_code`.
2. Normaliza `steps`.
3. El usuario responde pasos de opcion multiple.
4. Envia `kata_code` y `selected_answers` a `complete-kata`.
5. La Edge Function carga los pasos desde `katas.steps` y calcula el puntaje en servidor.
6. Aprueba si acierta al menos 75%.
7. Inserta/upserta `kata_completions`.
8. Recalcula `users.total_points` como suma de `kata_completions.points_earned`.
9. Si aprueba, actualiza `users.belt` al siguiente cinturon en la ruta `white -> yellow -> orange -> green -> blue -> purple -> red -> black`.

Riesgos a revisar:

- La Edge Function usa service role, por lo que respeta el hardening sin exponer privilegios al navegador.
- La migracion `015` alinea cinturones entre DB y UI.
- El frontend ya no decide puntos ni escribe `users.belt` directamente.

## 13. Sensei IA

Pantalla: `/sensei`  
Edge Function: `ask-sensei`  
Tabla: `sensei_consultations`  
Vista: `sensei_consultation_stats`

Capacidades:

- Valida si la consulta trata de ciberseguridad.
- Busca coincidencias en banco de preguntas.
- Construye respuesta en lenguaje claro.
- Puede usar hallazgos web configurados segun implementacion de la funcion.
- Audita la respuesta con proveedor configurado o fallback local.
- Registra consulta, fuentes, pregunta emparejada, estado, feedback y sentimiento.

Feedback:

- El frontend actualiza `sensei_consultations.feedback_helpful`, `feedback_text`, `sentiment_label` o campos relacionados segun pantalla.

## 14. Scanner educativo

Ruta: `/escaner`  
Componentes: `frontend/src/components/VulnScanner*`, `frontend/src/data/scanChecks.ts`  
Servicios: `frontend/src/services/senseiIA.ts`, `frontend/src/services/auditorIA.ts`  
Edge Function: `vuln-scanner-ai`

Naturaleza:

- No es un pentest.
- No escanea puertos.
- No inspecciona archivos, procesos, antivirus ni red interna.
- Usa senales disponibles en navegador: HTTPS, cookies, localStorage, Web Crypto, WebAuthn, Service Worker, IndexedDB, version aproximada de navegador/SO y heuristicas educativas.

IA:

- Usa `GEMINI_API_KEY` en Edge Function.
- Modo `sensei`: genera recomendaciones educativas.
- Modo `auditor`: valida que la salida sea segura y entendible.

## 15. Ranking

Ruta: `/ranking`  
Edge Function: `get-ranking`

Observaciones:

- Consulta usuarios y completaciones.
- Usa service role dentro de la funcion.
- Puede descifrar email si hay `PII_ENCRYPTION_KEY_B64`.
- Debe minimizar datos visibles: mostrar alias, dominio o email enmascarado, no PII completa salvo caso autorizado.

## 16. Admin interno del frontend

Ruta: `/admin`  
Pantalla: `frontend/src/screens/AdminCenterScreen.tsx`

Capacidades observadas por llamadas Supabase:

- KPIs de usuarios, usuarios evaluados, usuarios en alto/critico, completaciones, incidentes y preguntas pendientes.
- Lista usuarios recientes.
- Lista preguntas.
- Gestion de sectores de negocio (`business_sectors`): crear, editar, inhabilitar para nuevos registros y guardar cambios propagando codigos a tablas dependientes.
- Gestion de `ai_providers`.
- Gestion de `agent_configs`.
- Gestion de `agent_provider_assignments`.
- Ejecucion manual de Edge Functions de agentes.
- Consulta de `incident_investigations`.
- Consulta de `agent_runs`.
- Consulta de `ai_audit_corrections_report`.

Condicion de seguridad:

- Esta ruta debe requerir perfil con rol `admin`. Antes de agregar funciones, revisar `AdminRoute` en `App.tsx` y politicas RLS.

## 17. Central Admin app

Ubicacion: `central-admin-app/`

Componentes:

- `server.js`: servidor HTTP, Basic Auth, proxy Supabase y rutas T-Pot.
- `app.js`: UI administrativa vanilla JS.
- `tpotService.js`: logica T-Pot/Elastic, sanitizacion, reportes y jobs IA en memoria.
- `tests/tpotService.test.js`: pruebas del servicio T-Pot.

Rutas backend principales:

- `/api/rest/v1/*`: proxy a Supabase REST con service role.
- `/api/auth/v1/*`: proxy a Supabase Auth con service role.
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

Riesgo principal:

- El navegador nunca ve `SUPABASE_SERVICE_ROLE_KEY`, pero el servidor si. Si el admin queda expuesto con Basic Auth debil, el atacante puede operar contra Supabase con privilegios elevados via proxy.

Recomendacion:

- Para produccion, proteger con Cloud Run IAP, SSO/MFA, VPN o allowlist de IP.
- Rotar cualquier service role expuesta historicamente.
- Evitar credenciales en repo.

## 18. T-Pot y threat intelligence

El proyecto no incluye un honeypot T-Pot corriendo dentro del repo. La arquitectura correcta es:

```text
T-Pot externo aislado
  -> Elasticsearch/OpenSearch externo
  -> central-admin-app/server.js
  -> tpotService.js
  -> UI admin
```

Modo demo:

- Si falta `TPOT_ELASTIC_URL`, el servicio usa eventos simulados.
- Esto sirve para probar UI, no representa telemetria real.

Modo live:

- `TPOT_ELASTIC_URL` apunta a Elastic/OpenSearch.
- Se consulta `/{index}/_search`.
- `TPOT_ALLOWED_INDEXES` limita indices.
- Se normalizan eventos heterogeneos.
- Se redactan emails, JWT, tokens, passwords y payloads largos.
- Se extraen IOCs defensivos.
- Se genera mapeo MITRE aproximado.

Limitacion actual:

- `tpot_query_audit`, `tpot_ai_analysis_jobs` y `tpot_iocs_cache` existen en Supabase, pero `tpotService.js` usa memoria para jobs/auditoria/IOCs. Falta persistencia real.

## 19. Variables y secretos

Frontend `.env`:

```env
REACT_APP_SUPABASE_URL=https://xxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key_here
NODE_ENV=development
```

Supabase Edge Functions:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
KIMI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
CRON_SECRET=
PII_ENCRYPTION_KEY_B64=
PII_KEY_VERSION=1
PII_MIGRATION_SECRET=
```

Central Admin backend / Cloud Run:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CENTRAL_ADMIN_USER=
CENTRAL_ADMIN_PASSWORD=
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

Nunca poner en frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- claves IA
- `CRON_SECRET`
- claves PII
- credenciales T-Pot

## 20. Setup local recomendado

Frontend en desarrollo:

```bash
cd frontend
npm install
npm run start:dev
```

Frontend build/servidor estatico:

```bash
cd frontend
npm run build
npm start
```

Admin central:

```bash
cd central-admin-app
npm start
```

Supabase:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy secure-register-user
supabase functions deploy get-private-profile
supabase functions deploy calculate-risk
supabase functions deploy complete-kata
supabase functions deploy ask-sensei
supabase functions deploy get-ranking
supabase functions deploy vuln-scanner-ai
```

Desplegar todas las funciones usadas/proyectadas:

```bash
supabase functions deploy analyze-email
supabase functions deploy audit-generated-questions
supabase functions deploy backfill-email-domains
supabase functions deploy calculate-risk
supabase functions deploy complete-kata
supabase functions deploy generate-recommendations
supabase functions deploy get-private-profile
supabase functions deploy get-ranking
supabase functions deploy migrate-user-pii
supabase functions deploy run-daily-agent-workflows
supabase functions deploy run-incident-investigator
supabase functions deploy secure-register-user
supabase functions deploy ask-sensei
supabase functions deploy vuln-scanner-ai
```

## 21. Funcionalidades implementadas

Implementadas y conectadas:

- Registro seguro con consentimiento y cifrado PII.
- Registro con sector de negocio desde catalogo administrable.
- Login/logout con Supabase Auth.
- Perfil privado descifrado por Edge Function.
- Dashboard usuario.
- Listado de dojos/katas.
- Examen/kata con evaluacion server-side, aprobacion del 75%, puntos recalculados y avance de cinturon.
- Cuestionario adaptativo de riesgo.
- Persistencia de evaluaciones.
- Sensei IA con auditoria y feedback.
- Scanner educativo con IA.
- Ranking.
- Admin interno React para agentes, preguntas, usuarios, proveedores y sectores de negocio.
- Central Admin con proxy Supabase y T-Pot defensivo.

Implementadas en backend pero no plenamente conectadas a UX de usuario:

- Recomendaciones personalizadas con `generate-recommendations`.
- Analisis de correo phishing con `analyze-email`.
- Entrega/apertura de alertas con `alert_deliveries`.
- Sponsors/matching de servicios.
- Persistencia real de T-Pot desde `central-admin-app`.
- Migracion/backfill operativos PII desde UI.

Planeadas o documentadas pero requieren confirmacion/implementacion:

- Certificados PDF.
- Notificaciones email/SMS/push.
- Rachas de actividad.
- Examenes con intentos limitados y espera de 24h.
- Campanas visibles en frontend de usuario.
- Cinturones azul/morado/rojo coherentes en DB, UI y logica.

## 22. Inconsistencias y deuda tecnica

Prioridad alta:

- Revisar historicos existentes si hubo evaluaciones antiguas que escribieron puntaje de riesgo en `users.total_points`.
- Reaplicar backfill de puntos desde `kata_completions` despues de desplegar la mejora.
- Aplicar `016_business_sectors_catalog.sql` y redesplegar `secure-register-user` antes de habilitar el mantenimiento de sectores en produccion.
- Persistir jobs/auditoria/IOCs T-Pot en Supabase, no memoria.
- Proteger `central-admin-app` con autenticacion fuerte si se usa en produccion.
- Sacar/ignorar `.gcloud-config`, archivos de claves y material sensible del repo; rotar secretos si fueron expuestos.

Prioridad media:

- Conectar `generate-recommendations` al resultado de evaluacion.
- Crear pantalla de analisis de email que invoque `analyze-email`.
- Restringir CORS en Edge Functions sensibles a dominios oficiales.
- Separar claves AES y HMAC para PII.
- Implementar rotacion multi-key para PII.
- Agregar pruebas para RLS, Edge Functions y flujos criticos.

Prioridad baja:

- Corregir codificacion de Markdown existentes.
- Actualizar `frontend/README.md`, que aun es generico de CRA.
- Documentar politica de retencion de datos.
- Normalizar idioma entre "Cyber Dojo" y "Ciber Dojo".

## 23. Guia para que una IA agregue funcionalidades

Antes de cambiar codigo:

1. Leer esta guia.
2. Leer `frontend/src/App.tsx` para rutas.
3. Leer `frontend/src/lib/supabase.ts` para tipos.
4. Leer migraciones relacionadas con las tablas que se tocaran.
5. Buscar si ya existe Edge Function para la capacidad deseada.
6. Confirmar RLS y permisos.
7. Confirmar si el dato contiene PII.

Patron recomendado para nueva funcionalidad sensible:

1. Crear o ampliar migracion SQL.
2. Definir RLS primero.
3. Si requiere privilegios, implementar Edge Function con service role.
4. Si toca catalogos editables, usar una funcion RPC transaccional y documentar que tablas dependientes se actualizan.
5. No exponer service role ni secretos en React.
6. Crear tipos TS o ampliar interfaces en `supabase.ts`.
7. Implementar servicio/pantalla frontend.
8. Agregar fallback y mensajes en lenguaje no tecnico.
9. Agregar pruebas o script manual de verificacion.

Patron recomendado para nuevas pantallas:

1. Crear componente en `frontend/src/screens`.
2. Agregar ruta en `App.tsx`.
3. Usar `useAuth()` para sesion/perfil.
4. Usar `supabase.functions.invoke` para operaciones privilegiadas.
5. Usar `supabase.from` solo cuando RLS permite acceso directo.
6. Mantener textos claros para usuarios no tecnicos.

Patron recomendado para nuevas Edge Functions:

1. Validar metodo HTTP.
2. Manejar `OPTIONS`.
3. Validar Authorization si aplica.
4. Validar payload con limites.
5. Usar `SUPABASE_SERVICE_ROLE_KEY` solo dentro de la funcion.
6. No loguear PII, tokens ni payloads completos.
7. Retornar JSON estable.
8. Registrar auditoria si toca PII, seguridad o administracion.

## 24. Roadmap recomendado

Fase 1 - estabilizacion:

- Ejecutar migracion `015` y desplegar `complete-kata`.
- Recalcular `users.total_points` desde `kata_completions`.
- Actualizar README y setup.
- Ejecutar script Supabase de verificacion.
- Sacar secretos/config local del repo.

Fase 2 - cerrar funcionalidades ya construidas:

- Pantalla de recomendaciones post-evaluacion.
- Pantalla de analisis de email sospechoso.
- Campanas activas en frontend.
- Alert deliveries.
- Ranking con privacidad revisada.

Fase 3 - admin y agentes:

- Persistir T-Pot en Supabase.
- Panel de aprobacion/publicacion de katas generadas.
- Programacion real de `run-daily-agent-workflows`.
- Observabilidad de `agent_runs`.

Fase 4 - produccion:

- SSO/MFA/IAP para admin.
- Restriccion CORS.
- Rate limiting persistente.
- Backups y retencion.
- Pruebas automatizadas de RLS.
- Monitoreo de Edge Functions.

## 25. Scripts de verificacion Supabase

El archivo complementario `docs/SUPABASE_VERIFICATION_QUERIES.sql` contiene consultas seguras de solo lectura para validar:

- tablas esperadas;
- columnas clave;
- RLS;
- politicas;
- funciones;
- vistas;
- conteos de datos;
- usuarios admin;
- estado de PII;
- consistencia de katas/preguntas/agentes.

Ejecutar ese script en Supabase SQL Editor y guardar resultados. Si se pegan aqui los resultados, se puede generar una segunda version del documento con estado confirmado contra la base viva.

## 26. Criterios de aceptacion para futuras entregas

Una nueva funcionalidad se considera lista cuando:

- Tiene ruta o punto de entrada claro.
- Tiene contrato de datos documentado.
- Respeta RLS y no filtra PII.
- No usa service role en frontend.
- Maneja errores de red y permisos.
- Tiene texto comprensible para usuarios no tecnicos.
- Tiene verificacion manual o automatizada.
- No rompe registro, login, evaluacion, katas, Sensei ni ranking.

## 27. Resumen para prompt inicial de otra IA

Usar este contexto:

```text
Estas trabajando en Cyber Dojo, una app React/TypeScript + Supabase para entrenamiento gamificado de ciberseguridad de MIPYMEs ecuatorianas. El repo tiene frontend, Supabase migrations/functions y central-admin-app. La seguridad depende de Supabase Auth, RLS y Edge Functions. No expongas service role ni secretos en React. El registro y perfil usan PII cifrada mediante secure-register-user/get-private-profile. Los puntos de gamificacion viven en users.total_points y se recalculan desde kata_completions por complete-kata; el puntaje de riesgo vive en evaluations.total_score y calculate-risk no debe pisar total_points ni belt. Para funcionalidades sensibles crea Edge Functions. Verifica tablas y politicas en supabase/migrations antes de tocar codigo. Mantener lenguaje claro para usuarios no tecnicos. Prioridades actuales: conectar recomendaciones IA y analisis de email, persistir T-Pot, endurecer admin.
```
