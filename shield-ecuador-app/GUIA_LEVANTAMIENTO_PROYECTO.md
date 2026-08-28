# Guia paso a paso para levantar Ciber Dojo

Esta guia esta escrita para un desarrollador junior que necesita levantar el proyecto desde cero, conectar Supabase y preparar el despliegue en Google Cloud Run.

Proyecto:

- GitHub: https://github.com/Rchavez001/RIESGO
- Supabase project ref: `wbbcjiqzbzswxsmwjqlw`
- Supabase URL: `https://wbbcjiqzbzswxsmwjqlw.supabase.co`
- Google Cloud project: `cool-archery-452216-v7`
- Google Cloud Run consola: https://console.cloud.google.com/run/overview?hl=es&project=cool-archery-452216-v7

## 1. Que contiene el proyecto

El repositorio contiene una aplicacion web llamada **Ciber Dojo**.

Componentes principales:

- `frontend/`: aplicacion React + TypeScript.
- `supabase/migrations/`: estructura de base de datos, RLS, datos iniciales y hardening.
- `supabase/functions/`: Edge Functions de Supabase.
- `SETUP.md`: guia corta previa.
- `GUIA_LEVANTAMIENTO_PROYECTO.md`: este instructivo detallado.

Funciones Supabase incluidas:

- `calculate-risk`: calcula y guarda el resultado de riesgo.
- `complete-kata`: evalua katas en servidor, registra puntos y actualiza cinturon.
- `generate-recommendations`: genera recomendaciones con IA.
- `analyze-email`: analiza correos sospechosos.
- `run-incident-investigator`: investiga incidentes y genera preguntas.
- `audit-generated-questions`: audita preguntas generadas por IA.
- `run-daily-agent-workflows`: dispatcher diario de agentes.

## 2. Requisitos previos

Instala estas herramientas antes de comenzar.

### 2.1 Git

Verifica:

```bash
git --version
```

Si no existe, instala Git desde:

```text
https://git-scm.com/downloads
```

### 2.2 Node.js y npm

El frontend usa React. Recomendado: Node.js LTS.

Verifica:

```bash
node --version
npm --version
```

Si `node` o `npm` no aparecen, instala Node.js desde:

```text
https://nodejs.org/
```

En Windows, si Node esta instalado pero no aparece en la terminal, agrega al `PATH`:

```text
C:\Program Files\nodejs
```

En PowerShell temporalmente puedes usar:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
```

### 2.3 Supabase CLI

Verifica:

```bash
supabase --version
```

Si no esta instalado, instala Supabase CLI segun tu sistema operativo.

Luego inicia sesion:

```bash
supabase login
```

El comando abre el navegador o pide un token. Usa tu cuenta con acceso al proyecto `wbbcjiqzbzswxsmwjqlw`.

### 2.4 Google Cloud CLI

Verifica:

```bash
gcloud --version
```

Si no existe, instala Google Cloud CLI desde:

```text
https://cloud.google.com/sdk/docs/install
```

Luego inicia sesion:

```bash
gcloud auth login
gcloud config set project cool-archery-452216-v7
```

Verifica el proyecto activo:

```bash
gcloud config get-value project
```

Debe devolver:

```text
cool-archery-452216-v7
```

## 3. Clonar el repositorio

Abre una terminal en la carpeta donde quieres trabajar.

```bash
git clone https://github.com/Rchavez001/RIESGO.git
cd RIESGO
```

El proyecto puede estar dentro de una subcarpeta llamada `shield-ecuador-app`. Si existe, entra ahi:

```bash
cd shield-ecuador-app
```

Valida la estructura:

```bash
dir
```

En Windows deberias ver algo parecido a:

```text
frontend
supabase
SETUP.md
DOCUMENTO_FUNCIONALIDADES.md
```

En Linux/macOS:

```bash
ls
```

## 4. Configurar Supabase Cloud

Este proyecto ya tiene un Supabase Cloud asignado:

```text
Project ref: wbbcjiqzbzswxsmwjqlw
Project URL: https://wbbcjiqzbzswxsmwjqlw.supabase.co
```

### 4.1 Enlazar el proyecto local con Supabase Cloud

Desde la carpeta raiz del proyecto, donde esta la carpeta `supabase/`, ejecuta:

```bash
supabase link --project-ref wbbcjiqzbzswxsmwjqlw
```

Si te pide password de base de datos, usa el password del proyecto Supabase.

### 4.2 Aplicar migraciones

Ejecuta:

```bash
supabase db push
```

Esto aplica los archivos en:

```text
supabase/migrations/
```

Orden esperado:

```text
001_initial_schema.sql
002_rls_policies.sql
003_seed_data.sql
004_admin_center.sql
005_security_hardening.sql
...
016_business_sectors_catalog.sql
```

Si falla una migracion:

1. Lee el error completo.
2. Revisa si la tabla, funcion o policy ya existe.
3. No borres datos manualmente sin confirmar.
4. Si estas en ambiente de desarrollo y puedes reiniciar la base, coordina antes con el equipo.

### 4.3 Verificar tablas principales

En Supabase Dashboard:

1. Entra a https://supabase.com/dashboard/project/wbbcjiqzbzswxsmwjqlw
2. Abre `Table Editor`.
3. Verifica que existan estas tablas:

```text
users
evaluations
questions
katas
kata_completions
alerts
email_analysis
domains_whitelist
ai_providers
agent_configs
agent_provider_assignments
incident_investigations
agent_runs
business_sectors
```

### 4.4 Verificar RLS

En Supabase Dashboard:

1. Abre `Authentication` o `Table Editor`.
2. Revisa que las tablas sensibles tengan RLS activo.

Tablas que deben tener RLS:

```text
users
evaluations
kata_completions
email_analysis
alert_deliveries
alerts
katas
questions
domains_whitelist
ai_providers
agent_configs
agent_provider_assignments
incident_investigations
agent_runs
business_sectors
```

No desactives RLS para "probar rapido"; eso rompe el modelo de seguridad.

## 5. Configurar variables de entorno del frontend

Entra a la carpeta del frontend:

```bash
cd frontend
```

Copia el archivo de ejemplo:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Edita `frontend/.env`:

```env
REACT_APP_SUPABASE_URL=https://wbbcjiqzbzswxsmwjqlw.supabase.co
REACT_APP_SUPABASE_ANON_KEY=PEGAR_AQUI_LA_ANON_KEY
NODE_ENV=development
```

La `anon key` se obtiene en Supabase:

1. Abre https://supabase.com/dashboard/project/wbbcjiqzbzswxsmwjqlw/settings/api
2. Busca `Project API keys`.
3. Copia la key `anon public`.
4. Pegala en `REACT_APP_SUPABASE_ANON_KEY`.

Importante:

- La `anon key` si puede vivir en el frontend.
- La `service_role key` nunca debe ir en `.env` del frontend.
- Las keys de IA tampoco deben ir en el frontend.

## 6. Instalar dependencias del frontend

Desde `frontend/` ejecuta:

```bash
npm install
```

Si aparece un error de permisos en cache de npm en Windows, prueba:

```powershell
npm cache verify
npm install
```

Si `npm` no aparece en PowerShell, usa temporalmente:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm install
```

## 7. Levantar frontend local

Desde `frontend/`:

```bash
npm start
```

La app debe abrir en:

```text
http://localhost:3000
```

Si no se abre el navegador, entra manualmente a esa URL.

Si el puerto `3000` esta ocupado, React puede sugerir otro puerto. Acepta con `Y`.

## 8. Probar flujo basico local

Con la app abierta:

1. Entra a `http://localhost:3000`.
2. Registra un usuario nuevo.
3. Inicia sesion.
4. Entra al dashboard.
5. Ejecuta una evaluacion de riesgo.
6. Verifica que se muestre pantalla de resultados.
7. Vuelve al dashboard.
8. Entra a `Katas`.
9. Marca un kata como completado.
10. Entra a `Alertas`.

Si algo falla:

- Abre DevTools del navegador con `F12`.
- Revisa `Console`.
- Revisa `Network`.
- Si una llamada a Supabase devuelve `401`, revisa login y `.env`.
- Si devuelve `403`, revisa RLS o rol del usuario.
- Si una Edge Function falla, revisa logs en Supabase.

## 9. Configurar secrets de Edge Functions

Las Edge Functions usan secrets en Supabase. Estos secrets no van en GitHub.

Desde la raiz del proyecto:

```bash
supabase secrets set DEEPSEEK_API_KEY=tu_deepseek_key
supabase secrets set KIMI_API_KEY=tu_kimi_key
supabase secrets set ANTHROPIC_API_KEY=tu_anthropic_key
supabase secrets set CRON_SECRET=un_valor_largo_y_aleatorio
```

Recomendacion para `CRON_SECRET`:

- Minimo 32 caracteres.
- No usar palabras simples.
- No compartirlo en frontend.

Ejemplo:

```bash
supabase secrets set CRON_SECRET=cd_7dd1820bd1424afbb39c5f0fbc4f8f11
```

Verifica secrets:

```bash
supabase secrets list
```

## 10. Desplegar Edge Functions

Desde la raiz del proyecto:

```bash
supabase functions deploy calculate-risk
supabase functions deploy complete-kata
supabase functions deploy secure-register-user
supabase functions deploy get-private-profile
supabase functions deploy ask-sensei
supabase functions deploy get-ranking
supabase functions deploy vuln-scanner-ai
supabase functions deploy generate-recommendations
supabase functions deploy analyze-email
supabase functions deploy run-incident-investigator
supabase functions deploy audit-generated-questions
supabase functions deploy run-daily-agent-workflows
```

Tambien puedes desplegarlas todas con un script manual:

```bash
for fn in calculate-risk complete-kata secure-register-user get-private-profile ask-sensei get-ranking vuln-scanner-ai generate-recommendations analyze-email run-incident-investigator audit-generated-questions run-daily-agent-workflows; do
  supabase functions deploy "$fn"
done
```

En PowerShell:

```powershell
$functions = @(
  "calculate-risk",
  "complete-kata",
  "secure-register-user",
  "get-private-profile",
  "ask-sensei",
  "get-ranking",
  "vuln-scanner-ai",
  "generate-recommendations",
  "analyze-email",
  "run-incident-investigator",
  "audit-generated-questions",
  "run-daily-agent-workflows"
)

foreach ($fn in $functions) {
  supabase functions deploy $fn
}
```

## 11. Probar Edge Function principal

La funcion mas importante para el flujo de usuario es:

```text
calculate-risk
```

No la pruebes con `curl` anonimo porque ahora exige sesion valida.

Prueba recomendada:

1. Levanta frontend.
2. Inicia sesion.
3. Completa una evaluacion.
4. Verifica en Supabase:
   - tabla `evaluations`;
   - tabla `users`;
   - campos `belt`, `current_risk_level`, `last_evaluation_at`.

## 12. Crear o promover usuario administrador

El centro administrativo solo funciona con usuarios que tengan:

```text
role = admin
```

Primero registra el usuario desde la app. Luego, en Supabase SQL Editor, ejecuta:

```sql
UPDATE public.users
SET role = 'admin'
WHERE email = 'correo_del_admin@dominio.com';
```

Verifica:

```sql
SELECT id, email, role
FROM public.users
WHERE email = 'correo_del_admin@dominio.com';
```

Luego:

1. Cierra sesion en la app.
2. Inicia sesion de nuevo.
3. Debe aparecer el boton `Admin`.

## 13. Build de produccion del frontend

Desde `frontend/`:

```bash
npm run build
```

Debe crear:

```text
frontend/build/
```

Si compila correctamente, veras:

```text
Compiled successfully.
```

Antes de desplegar, ejecuta auditoria de dependencias de produccion:

```bash
npm audit --omit=dev
```

Resultado esperado:

```text
found 0 vulnerabilities
```

Nota:

- `npm audit` sin `--omit=dev` puede reportar vulnerabilidades en herramientas de desarrollo heredadas de `react-scripts`.
- Para produccion, la revision critica es `npm audit --omit=dev`.

## 14. Configurar Google Cloud

El proyecto de Google Cloud es:

```text
cool-archery-452216-v7
```

Configura CLI:

```bash
gcloud auth login
gcloud config set project cool-archery-452216-v7
```

Activa APIs necesarias:

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

Selecciona region. Recomendacion inicial:

```text
us-central1
```

Puedes usar otra region si el proyecto ya tiene una definida.

## 15. Despliegue en Cloud Run

Cloud Run ejecuta contenedores. Para este frontend React hay dos caminos.

### Opcion A: desplegar imagen Docker con Nginx

Esta es la opcion recomendada para produccion.

En `frontend/`, crea un archivo llamado `Dockerfile` si no existe:

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

Crea tambien `frontend/.dockerignore`:

```text
node_modules
build
.env
.git
npm-debug.log
```

Importante:

- Las variables `REACT_APP_*` se incrustan en tiempo de build.
- Antes de construir la imagen, el archivo `.env` debe tener la URL y anon key correctas.

Desde `frontend/`, construye y despliega:

```bash
gcloud run deploy ciber-dojo-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

Cuando pregunte si deseas continuar, responde `Y`.

Al terminar, Cloud Run mostrara una URL parecida a:

```text
https://ciber-dojo-frontend-xxxxxx-uc.a.run.app
```

Guarda esa URL.

### Opcion B: usar Cloud Build desde GitHub

Usa esta opcion si quieres despliegue automatico cada vez que se sube codigo.

Pasos:

1. Entra a Google Cloud Console.
2. Abre Cloud Run:
   https://console.cloud.google.com/run/overview?hl=es&project=cool-archery-452216-v7
3. Crea un servicio nuevo o abre el servicio existente.
4. Selecciona despliegue continuo desde repositorio.
5. Conecta GitHub.
6. Selecciona:
   - repo: `Rchavez001/RIESGO`;
   - rama: `main` o la rama de despliegue;
   - carpeta fuente: `shield-ecuador-app/frontend` si esa es la estructura en GitHub.
7. Usa Dockerfile si existe.
8. Define region, por ejemplo `us-central1`.
9. Permite acceso no autenticado si sera una web publica.

## 16. Configurar Supabase Auth para la URL de Cloud Run

Despues de obtener la URL de Cloud Run, entra a Supabase:

```text
https://supabase.com/dashboard/project/wbbcjiqzbzswxsmwjqlw/auth/url-configuration
```

Configura:

```text
Site URL = URL_DE_CLOUD_RUN
```

Agrega en Redirect URLs:

```text
http://localhost:3000
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
https://URL_DE_CLOUD_RUN
https://URL_DE_CLOUD_RUN/auth/callback
```

Ejemplo:

```text
http://localhost:3000
http://localhost:3000/auth/callback
https://ciber-dojo-frontend-xxxxxx-uc.a.run.app
https://ciber-dojo-frontend-xxxxxx-uc.a.run.app/auth/callback
https://cyberdojo-61855290194.us-central1.run.app/auth/callback
```

La app usa email/password y magic link. Para magic link configura Email Auth con SMTP real de produccion, frecuencia minima de reenvio de 60 segundos o mas y expiracion de OTP/magic link de 900 segundos.

## 17. Variables y secretos en produccion

### Frontend

El frontend solo necesita:

```env
REACT_APP_SUPABASE_URL=https://wbbcjiqzbzswxsmwjqlw.supabase.co
REACT_APP_SUPABASE_ANON_KEY=anon_key_publica
```

No uses:

```text
SUPABASE_SERVICE_ROLE_KEY
DEEPSEEK_API_KEY
KIMI_API_KEY
ANTHROPIC_API_KEY
CRON_SECRET
```

en el frontend.

### Supabase Edge Functions

Estos secrets deben vivir en Supabase:

```text
DEEPSEEK_API_KEY
KIMI_API_KEY
ANTHROPIC_API_KEY
CRON_SECRET
```

## 18. Probar produccion despues del despliegue

Abre la URL de Cloud Run.

Checklist:

- [ ] La pantalla muestra marca `Ciber Dojo`.
- [ ] Login carga sin errores.
- [ ] Registro crea usuario.
- [ ] Dashboard carga perfil.
- [ ] Evaluacion de riesgo finaliza.
- [ ] Se crea registro en `evaluations`.
- [ ] Se actualiza `users.belt`.
- [ ] Se actualiza `users.current_risk_level`.
- [ ] Katas cargan.
- [ ] Alertas cargan.
- [ ] Usuario normal no ve boton admin.
- [ ] Usuario admin si ve boton admin.

## 19. Logs utiles

### 19.1 Frontend local

Ver errores en terminal donde corre:

```bash
npm start
```

### 19.2 Supabase Edge Functions

Ver logs:

```bash
supabase functions logs calculate-risk
supabase functions logs run-incident-investigator
supabase functions logs audit-generated-questions
```

Tambien desde Dashboard:

1. Supabase project.
2. Edge Functions.
3. Selecciona la funcion.
4. Abre logs.

### 19.3 Cloud Run

CLI:

```bash
gcloud run services logs read ciber-dojo-frontend \
  --region us-central1
```

Consola:

1. Abre Cloud Run.
2. Entra al servicio.
3. Abre pestaña `Logs`.

## 20. Problemas comunes y solucion

### Error: `npm no se reconoce como comando`

Solucion Windows:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm --version
```

Si funciona, agrega Node al PATH permanente.

### Error: `.env` no toma cambios

React lee variables al arrancar. Reinicia:

```bash
Ctrl + C
npm start
```

### Error: login no funciona

Revisa:

- `REACT_APP_SUPABASE_URL`;
- `REACT_APP_SUPABASE_ANON_KEY`;
- que el usuario exista en Supabase Auth;
- que Supabase Auth permita email/password.

### Error: `calculate-risk` devuelve 401

Causa probable:

- usuario no autenticado;
- token vencido;
- llamada manual sin `Authorization`.

Solucion:

- cerrar sesion;
- iniciar sesion;
- repetir evaluacion.

### Error: usuario no puede ver datos

Causa probable:

- RLS bloqueando acceso;
- usuario no tiene perfil en tabla `users`;
- `auth.uid()` no coincide con `users.id`.

Consulta util:

```sql
SELECT id, email, role, belt, current_risk_level
FROM public.users
ORDER BY created_at DESC;
```

### Error: boton Admin no aparece

Verifica:

```sql
SELECT email, role
FROM public.users
WHERE email = 'correo_del_admin@dominio.com';
```

Debe decir:

```text
admin
```

### Error: Cloud Run despliega pero muestra pantalla en blanco

Revisa:

- que `.env` existia antes del build;
- que `REACT_APP_SUPABASE_URL` tenga la URL correcta;
- que `REACT_APP_SUPABASE_ANON_KEY` sea la anon key correcta;
- consola del navegador;
- logs de Cloud Run.

### Error: Edge Function administrativa devuelve 403

Las funciones de agentes requieren:

- usuario admin autenticado, o
- header `x-cron-secret` con valor igual a `CRON_SECRET`.

Esto aplica a:

```text
run-incident-investigator
audit-generated-questions
run-daily-agent-workflows
```

## 21. Checklist final para entregar ambiente

### Local

- [ ] Repo clonado.
- [ ] `npm install` ejecutado.
- [ ] `.env` creado en `frontend/`.
- [ ] `npm start` abre app.
- [ ] Registro/login funciona.
- [ ] Evaluacion funciona.

### Supabase

- [ ] Proyecto enlazado con `wbbcjiqzbzswxsmwjqlw`.
- [ ] Migraciones aplicadas.
- [ ] RLS activo.
- [ ] Seeds cargados.
- [ ] Edge Functions desplegadas.
- [ ] Secrets configurados.
- [ ] Usuario admin creado si aplica.

### Google Cloud Run

- [ ] Proyecto activo: `cool-archery-452216-v7`.
- [ ] APIs habilitadas.
- [ ] Servicio Cloud Run creado.
- [ ] URL publica funcionando.
- [ ] Supabase Auth tiene URL de Cloud Run en `Site URL` y redirects.

## 22. Comandos rapidos de referencia

Desde raiz del proyecto:

```bash
supabase link --project-ref wbbcjiqzbzswxsmwjqlw
supabase db push
supabase functions deploy calculate-risk
supabase functions deploy complete-kata
supabase functions deploy secure-register-user
supabase functions deploy get-private-profile
supabase functions deploy ask-sensei
supabase functions deploy get-ranking
supabase functions deploy vuln-scanner-ai
supabase functions deploy generate-recommendations
supabase functions deploy analyze-email
supabase functions deploy run-incident-investigator
supabase functions deploy audit-generated-questions
supabase functions deploy run-daily-agent-workflows
```

Desde `frontend/`:

```bash
npm install
npm start
npm run build
npm audit --omit=dev
```

Google Cloud:

```bash
gcloud auth login
gcloud config set project cool-archery-452216-v7
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud run deploy ciber-dojo-frontend --source . --region us-central1 --allow-unauthenticated
```

## 23. Notas de seguridad para el desarrollador

- Nunca subir `.env` con claves reales.
- Nunca poner `service_role key` en React.
- Nunca desactivar RLS para resolver errores rapido.
- No compartir `CRON_SECRET`.
- No ejecutar SQL destructivo en Supabase Cloud sin backup o aprobacion.
- Antes de deploy, ejecutar:

```bash
npm run build
npm audit --omit=dev
```

Si ambos pasan, el frontend esta listo para despliegue.
