# Arquitectura de Ciber Dojo

Este documento reemplaza por completo la versión anterior de `ARQUITECTURA_CYBER_DOJO.md`, que contenía información inventada (hosting en Vercel/Netlify, pipeline de GitHub Actions con Sentry/New Relic/PagerDuty, particionamiento de base de datos, vistas materializadas, rate limiting con cifras específicas, y una URL de repositorio incorrecta). Todo lo que sigue está verificado directamente contra el código fuente, `package.json`, migraciones de Supabase y la configuración de despliegue real, con referencia a los archivos exactos revisados. No se incluye nada no verificado.

## 1. Qué es y para quién

Ciber Dojo es una PWA (Progressive Web App) en español para capacitar en ciberseguridad a empleados y dueños de MIPYMEs ecuatorianas sin conocimientos técnicos, usando una metáfora de dojo de karate: cinturones, katas (simulaciones prácticas) y exámenes de ascenso. Fuente: `DOCUMENTO_FUNCIONALIDADES.md` y la estructura de pantallas verificada en `frontend/src/screens/`.

## 2. Componentes reales del sistema

Hay **dos aplicaciones desplegadas de forma independiente en Google Cloud Run**, ambas respaldadas por el mismo proyecto de Supabase, más una capa de proxy que las une bajo un solo dominio:

```
                         Navegador del usuario / admin
                                    |
                                    v
              Cloud Run: "cyberdojo" (frontend/, Node http puro)
              https://cyberdojo-61855290194.us-central1.run.app
              - Sirve el build estático de React (carpeta build/)
              - Sirve TODAS las rutas /* devolviendo index.html (SPA)
              - PROXY: /admin/* y /api/* -> reenvía a cyberdojo-admin
                                    |
                    +---------------+---------------------+
                    |                                      |
                    v                                      v
     Cloud Run: "cyberdojo-admin"                 Supabase (proyecto wbbcjiqzbzswxsmwjqlw)
     (central-admin-app/, Node http puro,          - Postgres + RLS
      Basic Auth)                                  - Supabase Auth
     - Sirve index.html/app.js/styles.css           - 33 Edge Functions (Deno)
     - Proxy interno /api/rest/v1 y /api/auth/v1     - Storage (bucket campaign-ads)
       hacia Supabase, agregando la service_role key
       (nunca expuesta al navegador)
```

Verificado en: `frontend/static-server.js` (servidor y proxy del frontend), `central-admin-app/server.js` y `central-admin-app/app.js` (servidor y proxy del admin), `SECURITY_PRIVACY.md` (confirma que `central-admin-app` ya no sirve la service role key directamente al navegador, sino que actúa como proxy).

### 2.1 Detalle del proxy `/admin` (frontend/static-server.js)

El servidor Node del frontend (`frontend/static-server.js`, sin dependencias externas — usa solo los módulos nativos `fs`, `http`, `https`, `path`) hace lo siguiente en cada request:

- `GET /admin` → redirect 301 a `/admin/`.
- `GET /admin/*` → reenvía (proxy HTTP/HTTPS, preservando método, headers y body) a `https://cyberdojo-admin-61855290194.us-central1.run.app<resto-de-la-ruta>`, host configurable vía la variable de entorno `ADMIN_UPSTREAM_HOST`.
- `GET|POST /api` o `/api/*` → mismo proxy, sin reescribir la ruta.
- Cualquier otra ruta → sirve el archivo estático correspondiente desde `build/`, o `build/index.html` como fallback (comportamiento típico de SPA con `react-router-dom`).

Esto significa que **el panel de administración es accesible en el mismo dominio que la app de usuarios**, en `/admin`, aunque es un proceso, repositorio de código y despliegue de Cloud Run completamente distintos.

### 2.2 Ruta histórica `/admin` del propio React Router (ya eliminada)

El frontend React tenía anteriormente su propia ruta interna `/admin` (`AdminRoute` → `AdminCenterScreen`), que colisionaba con el proxy de nivel servidor descrito arriba cuando la navegación ocurría del lado del cliente (por ejemplo, un `<Navigate>` interno no dispara una petición HTTP nueva, así que nunca llegaba al servidor y en su lugar React Router renderizaba la pantalla vieja). Esa ruta fue eliminada de `frontend/src/App.tsx`; el archivo `frontend/src/screens/AdminCenterScreen.tsx` **sigue existiendo en el repositorio pero no está importado ni enrutado en ningún lugar** — es código huérfano, verificado con búsqueda de todas las referencias a `AdminCenterScreen` en `frontend/src/` (solo aparece en su propio archivo y en su hoja de estilos `admin-tw-compat.css`).

En su lugar, `DashboardOrAdminRedirect` (en `App.tsx`) usa `window.location.href = '/admin'` — una navegación real de navegador — para que la petición sí llegue al servidor y el proxy funcione.

## 3. Stack tecnológico verificado

### 3.1 Frontend (`frontend/package.json`)

| Paquete | Versión declarada |
|---|---|
| react / react-dom | ^19.2.5 |
| react-router-dom | ^7.15.0 |
| framer-motion | ^12.38.0 |
| @supabase/supabase-js | ^2.104.1 |
| zustand | ^5.0.13 |
| three | ^0.184.0 |
| gsap | ^3.15.0 |
| howler | ^2.2.4 |
| lottie-react | ^3.1.1 |
| lucide-react | ^1.11.0 |
| typescript (dev) | ^4.9.5 |
| react-scripts (dev, CRA) | 5.0.1 |
| tailwindcss (dev) | ^4.2.4 |

Scripts relevantes: `start` ejecuta `node static-server.js` (servidor de producción); `start:dev` ejecuta `react-scripts start` (desarrollo); `build` ejecuta `react-scripts build`; `gcp-build` ejecuta `npm run build` — este hook servía para los **buildpacks de Google Cloud Run** cuando `frontend/` no tenía Dockerfile propio. Desde el commit `217140f` (2026-09-28) existe `frontend/Dockerfile` (build multistage `node:20-alpine` que termina en `node static-server.js`), y Cloud Build prioriza ese Dockerfile sobre los buildpacks en cualquier despliegue nuevo (ver sección 8).

### 3.2 Admin (`central-admin-app/package.json`)

Cero dependencias de npm declaradas. `"engines": { "node": "20.x" }`. Scripts: `start` ejecuta `node server.js`, `test` ejecuta `node tests/tpotService.test.js`. Se despliega con **Dockerfile propio** (`central-admin-app/Dockerfile`, base `node:20-alpine`, copia `package.json server.js tpotService.js index.html styles.css app.js cyber-sensei.png`, expone el puerto 8080, comando `node server.js`).

### 3.3 Backend (Supabase)

PostgreSQL gestionado por Supabase, con Row Level Security, PostgREST (API REST automática), Supabase Auth, y 33 Edge Functions en Deno/TypeScript (ver sección 5). Proyecto real: `wbbcjiqzbzswxsmwjqlw` (`https://wbbcjiqzbzswxsmwjqlw.supabase.co`), según `GUIA_LEVANTAMIENTO_PROYECTO.md`.

### 3.4 Repositorio

`https://github.com/Rchavez001/RIESGO.git`, rama `main`, con el proyecto dentro de la subcarpeta `shield-ecuador-app/` — confirmado con `git remote -v` en este mismo trabajo. (La versión anterior de este documento decía `github.com/shield-ecuador/cyber-dojo.git`, que es incorrecta.)

## 4. Organización del código (verificada por listado real de archivos)

```
shield-ecuador-app/
├── frontend/                          # App de usuario (React SPA) — Cloud Run "cyberdojo"
│   ├── static-server.js               # Servidor de producción + proxy /admin y /api (sección 2.1)
│   ├── src/
│   │   ├── App.tsx                    # Rutas (react-router-dom v7), ver sección 4.1
│   │   ├── screens/                   # 15 archivos .tsx (ver 4.1)
│   │   ├── components/                # AdaptiveQuestionnaire, CyberBushido (shell del dojo),
│   │   │                               # DojoWebGLBackdrop (fondo Three.js), TatamiCombatIntro,
│   │   │                               # PageTransition, CyberToast, SenseiPortraitSVG,
│   │   │                               # PWAInstallPrompt, AdminShell, y subcarpeta VulnScanner/
│   │   │                               # (BeltDisplay, VulnCard, SystemDetector, ScanProgress,
│   │   │                               # IADualConsultant, SecurityReport, VulnScanner)
│   │   ├── contexts/                  # AuthContext, ToastContext, DojoAudioContext
│   │   ├── hooks/                     # usePwaInstallPrompt, usePWAInstall
│   │   ├── store/                     # dojoStore.ts (Zustand: belt, xp)
│   │   ├── data/                      # ciberDojo.ts, scanChecks.ts, vulnerableVersions.ts (datos estáticos)
│   │   ├── services/                  # senseiIA.ts, auditorIA.ts, scanOrchestrator.ts (ver 5.2)
│   │   └── lib/supabase.ts            # Cliente Supabase + tipos
│   └── public/                        # PWA: sw.js, íconos, manifest, media (video/imágenes del dojo)
│
├── central-admin-app/                 # Panel de administración — Cloud Run "cyberdojo-admin"
│   ├── server.js                      # Servidor HTTP (Node puro), Basic Auth, proxy a Supabase
│   ├── app.js                         # Lógica del panel (JS de navegador, 13 paneles — sección 6)
│   ├── index.html, styles.css         # Interfaz
│   ├── tpotService.js                 # Lógica de la integración T-Pot (sección "Inteligencia de Amenazas")
│   ├── tests/                         # node tests/tpotService.test.js
│   └── Dockerfile                     # node:20-alpine
│
└── supabase/
    ├── migrations/                    # 001 a 021, ver BASE_DE_DATOS.md
    └── functions/                     # 33 Edge Functions, ver sección 5
```

### 4.1 Pantallas reales y su estado de enrutamiento (`frontend/src/App.tsx`)

Rutas públicas: `/` (LandingPage), `/login` (LoginScreen), `/auth/callback` (AuthCallbackPage), `/reset-password` (ResetPasswordPage), `/dev/kata/:code` (KataExamPage sin autenticación — ruta de desarrollo, comentario explícito en el código: "Dev route: render kata page without auth for testing").

Ruta protegida solo-admin fuera del shell principal: `/tenant-admin` → `TenantAdminPage` (lazy-loaded). **Esta pantalla es un mockup**: mantiene un arreglo `initialTenants` en `useState` con datos de ejemplo ("Manta Market", etc.) y no contiene ninguna llamada a Supabase (`supabase.` o `useEffect`) — verificado por búsqueda en el archivo. No debe documentarse como una funcionalidad multi-tenant operativa; es una maqueta de UI.

Rutas dentro de `ProtectedShell` (requieren sesión; renderizan `AdminShell` si `role==='admin'`, o `DojoShell` en caso contrario):
- `/dashboard` → `DashboardOrAdminRedirect`: si el perfil es admin, hace `window.location.href='/admin'` (navegación real, activa el proxy de sección 2.1); si no, muestra `DashboardScreen`.
- `/dojos` → `DojoListPage`
- `/dojo/:id` → `DojoDetailPage`
- `/kata/:code` → `KataExamPage`
- `/sensei` → `SenseiConsultPage`
- `/escaner` → `VulnScannerPage` (lazy-loaded)
- `/ranking` → `LeaderboardPage`
- `/perfil` → `ProfilePage`

Cualquier otra ruta (`*`) redirige a `/`.

**Código huérfano confirmado:** `frontend/src/screens/AdminCenterScreen.tsx` (ver sección 2.2) existe en el repositorio pero no está importado en ningún archivo activo del árbol de rutas.

## 5. Las 33 Edge Functions y quién las llama realmente

Se verificó, mediante búsqueda de `functions.invoke(` en todo `frontend/src/` y de los nombres de cada función como literal de cadena en `central-admin-app/app.js` y `central-admin-app/server.js`, exactamente qué invoca a cada una de las 33 carpetas reales de `supabase/functions/` (sin contar `_shared`, que no es una función sino código compartido). Esto amplía y corrige la tabla original de 14 funciones (2026-09-08): se sumaron las funciones de los módulos de consentimiento (`073`+), agente de noticias (`run-news-agent`, `quiz-generator`, `import-question-bank`), centro de seguridad (`052`+) y campeonato (`047`), y se corrigió el hallazgo de que **`central-admin-app` sí invoca Edge Functions directamente** — la afirmación anterior de que el panel admin solo usaba el proxy REST de Postgres (sección 2) ya no es cierta para los módulos añadidos después de 2026-09-08.

### 5.1 Funciones de la app de usuario (`frontend/`)

| Función | Invocada desde | Notas |
|---|---|---|
| `secure-register-user` | `frontend/src/contexts/AuthContext.tsx` | Registro de usuario; cifra PII (ver `SECURITY_PRIVACY.md`) |
| `get-private-profile` | `frontend/src/contexts/AuthContext.tsx` | Descifra el perfil del usuario autenticado o de un admin |
| `log-login-event` | `frontend/src/contexts/AuthContext.tsx` | Registra el evento de inicio de sesión; se invoca en segundo plano (no bloquea la navegación si falla) |
| `accept-guest-notice` | `frontend/src/contexts/AuthContext.tsx` | Confirma el aviso del modo invitado (`GuestNoticeModal`, ver `docs/MODO_INVITADO.md`) |
| `calculate-risk` | `frontend/src/components/AdaptiveQuestionnaire.tsx` | Cierre del cuestionario adaptativo |
| `complete-kata` | `frontend/src/screens/KataExamPage.tsx` | Valida respuestas de kata/examen en servidor, otorga puntos y cinturón |
| `get-ranking` | `frontend/src/screens/LeaderboardPage.tsx` | Tabla de posiciones |
| `ask-sensei` | `frontend/src/screens/SenseiConsultPage.tsx` | Chat del Sensei IA |
| `vuln-scanner-ai` | `frontend/src/services/senseiIA.ts` y `frontend/src/services/auditorIA.ts` (ambos usados solo dentro de `components/VulnScanner/`, vía `scanOrchestrator.ts`) | **Precisión importante:** pese al nombre de los archivos que la llaman (`senseiIA.ts`, `auditorIA.ts`), esta función **no tiene relación con el chat del Sensei** (`ask-sensei` es una función distinta) — es el backend del Escáner de Vulnerabilidades (`/escaner`), que aparentemente usa un patrón de "doble consulta IA" (un rol generador, un rol auditor) sobre la misma función Edge |
| `get-consent-notice` | `frontend/src/screens/RegisterScreen.tsx`, `frontend/src/screens/PrivacyPage.tsx`, `frontend/src/components/ReconsentGate.tsx` | Obtiene el aviso de privacidad vigente (registro, panel `/privacidad`, y el gate de re-consentimiento al iniciar sesión) |
| `update-my-consent` | `frontend/src/screens/PrivacyPage.tsx` | Actualiza las preferencias de consentimiento del usuario desde `/privacidad` |
| `request-data-subject-right` | `frontend/src/screens/PrivacyPage.tsx`, `frontend/src/components/ReconsentGate.tsx` | Derechos ARCO (acceso, rectificación, cancelación, oposición) ejercidos por el propio usuario |
| `submit-consent` | `frontend/src/components/ReconsentGate.tsx` | Registra el consentimiento aceptado en el flujo de re-consentimiento (`T20`/REQ-09) |

### 5.2 Funciones solo del panel admin (`central-admin-app/`)

Invocadas vía el helper `supabaseFunctionInvoke(name, body)` de `central-admin-app/app.js` (línea ~1537), que llama a `fetch('/api/functions/v1/${name}', ...)` — una ruta propia de `server.js` (línea 168), distinta del proxy `/api/rest/v1` descrito en la sección 2 para las tablas de Postgres.

| Función | Invocada desde (panel) | Notas |
|---|---|---|
| `audit-generated-questions` | Panel "Preguntas" (`app.js` línea 653, `triggered_by: "questions_panel"`) **y** invocación externa | Ver nota debajo de la tabla — es la única función con las dos vías confirmadas |
| `import-question-bank` | Panel "Preguntas" (`app.js` línea 716) | Importa preguntas desde un archivo |
| `save-provider-key` | Panel "IA y auditoría" (`app.js` líneas 906, 1180, 1289) | Guarda claves de proveedores de IA |
| `run-news-agent` | Panel "Agente noticias" (`app.js` líneas 1588, 1608) | Prepara y ejecuta el agente de noticias |
| `quiz-generator` | Panel "Agente noticias" (`app.js` línea 1718) | Genera preguntas a partir de fuentes de noticias |
| `save-app-secret` | Panel "Agente noticias" (`app.js` línea 4013, secreto `resend_api_key`) | Guarda secretos de la app (ej. clave de Resend para correo) |
| `championship-draw-round1` | Panel de campeonato (`app.js` línea 4054) | Sorteo de la primera ronda del campeonato |
| `check-security-alerts` | Panel "Inteligencia de Amenazas"/centro de seguridad (`app.js` línea 4299) | Revisa alertas configuradas del centro de seguridad |
| `save-security-alert-config` | Centro de seguridad (`app.js` líneas 4452, 4466) | Crea/edita/borra configuración de alertas |
| `security-diagnose` | Centro de seguridad (`app.js` línea 4537) | Diagnóstico de seguridad asistido por IA |
| `security-easm-scan` | Centro de seguridad (`app.js` línea 4614) | Escaneo EASM (superficie de ataque externa) |
| `security-kata-convert` | Centro de seguridad (`app.js` líneas 4679-4730) | Convierte un diagnóstico de seguridad en un kata publicable |
| `admin-consent` | Panel de consentimiento (`app.js`, decenas de llamadas desde la línea 4833 en adelante, vía el helper `privacyCall('/fn/admin-consent/...')`) | Backend completo del módulo de consentimiento LOPDP: documentos, ajustes, transporte de correo, bitácora de auditoría, solicitudes ARCO, cadenas de verificación. Exige sesión con segundo factor TOTP (`aal2`) y rol `privacy_admin`, distinto de la Basic Auth compartida del resto del panel (ver `SECURITY_PRIVACY.md` y `central-admin-app/server.js` líneas 36-53, 279) |

**Nota sobre `audit-generated-questions`:** el código de la función (`supabase/functions/audit-generated-questions/index.ts`) usa `requireAdminOrScheduler`, la misma función que `run-daily-agent-workflows` y `run-incident-investigator` (abajo) usan para aceptar tanto una sesión admin como un secreto de invocación externa — pero a diferencia de esas dos, `central-admin-app` sí la invoca directamente (panel "Preguntas", revisión individual). Es la única función con ambas vías confirmadas en el código.

### 5.3 Funciones sin invocación activa desde ninguna de las dos apps

| Función | Estado | Notas |
|---|---|---|
| `run-incident-investigator` | Sin invocación desde `frontend/src/` ni `central-admin-app/` | Usa `requireAdminOrScheduler` (acepta secreto `x-cron-secret`); diseñada para invocación externa (cron/manual), según `GUIA_LEVANTAMIENTO_PROYECTO.md` sección de troubleshooting |
| `run-daily-agent-workflows` | Sin invocación desde ninguna de las dos apps | Dispatcher diario; mismo patrón `requireAdminOrScheduler` que la anterior |
| `fix-learning-item-balance` | Sin invocación desde ninguna de las dos apps | Corrección manual por lotes de `learning_items` (distinta de `questions`); usa `requireAdminOrScheduler`; sin un panel que la dispare hoy |
| `generate-recommendations` | Solo `frontend/src/screens/AdminCenterScreen.tsx` (huérfano, no enrutado — sección 4.1) | Sin punto de entrada activo actualmente |
| `analyze-email` | Solo `AdminCenterScreen.tsx` (huérfano) | Sin punto de entrada activo actualmente |
| `migrate-user-pii` | Solo `AdminCenterScreen.tsx` (huérfano) | Según `SECURITY_PRIVACY.md`, su uso previsto es invocación manual por lotes vía HTTP con `x-cron-secret`, no una pantalla de usuario |
| `backfill-email-domains` | Solo `AdminCenterScreen.tsx` (huérfano) | Utilidad de migración de datos (llena `users.email_domain` para el ranking, migración 014), uso previsto: manual/una vez |

A diferencia de lo que afirmaba la versión anterior de este documento, `central-admin-app` **sí invoca Edge Functions directamente** — en concreto, los paneles de preguntas, agente de noticias, centro de seguridad, campeonato y consentimiento (sección 5.2). Lo que sigue siendo cierto es que la gestión básica de contenido (dojos, catálogo de ocupaciones, campañas) pasa por el proxy REST de Postgres de la sección 2, no por Edge Functions.

## 6. Módulos del panel de administración (verificado en `central-admin-app/index.html`)

La barra de navegación real tiene 13 paneles, identificados por su atributo `data-panel`:

1. **Resumen** (`overview`)
2. **Dojos y progreso** (`dojos`)
3. **Preguntas** (`questions`)
4. **IA y auditoría** (`ai`)
5. **Agente noticias** (`newsAgent`)
6. **Alertas IA** (`newsAlerts`)
7. **Sensei IA** (`senseiStats`)
8. **Inteligencia de Amenazas** (`threatIntel`) — corresponde a la integración T-Pot documentada en `BASE_DE_DATOS.md` sección 5 (`tpotService.js` es el módulo backend que la soporta)
9. **Preguntas abiertas** (`openQuestions`)
10. **Usuarios** (`users`)
11. **Ocupaciones** (`occupations`) — catálogo `business_sectors` (migración 019)
12. **Propaganda** (`ads`) — campañas (`central_admin_campaigns` y tablas relacionadas, migraciones 007/018/020/021)
13. **Reportes** (`reports`) — gráficos 3D (ECharts + echarts-gl) con drill-down por sector, alimentados por `campaign_impressions` y `app_entry_log`

El detalle funcional de cada panel (qué hace un admin en cada uno, campos, flujos) corresponde a `MANUAL_ADMINISTRADOR.md`, que se reescribirá en el siguiente tramo de este trabajo — este documento cubre arquitectura, no manual de uso.

## 7. Autenticación y autorización (resumen; detalle completo en `BASE_DE_DATOS.md` y `SECURITY_PRIVACY.md`)

- **App de usuario:** Supabase Auth (email/password + magic link vía `signInWithOtp`). Sesión gestionada por el SDK `@supabase/supabase-js` (JWT + refresh token, comportamiento estándar del SDK — no se implementa lógica de expiración/refresh manual en el código revisado).
- **Autorización a nivel de fila:** función `public.is_admin()` (migración 004) y Row Level Security en (casi) todas las tablas — ver la sección de hallazgos de `BASE_DE_DATOS.md` para las excepciones detectadas.
- **Panel admin:** HTTP Basic Auth a nivel del propio servicio Cloud Run `cyberdojo-admin` (credenciales configuradas como variables de entorno del servicio, fuera del control de versiones). Opera bajo un modelo de cierre por defecto (fail-closed, denegando el acceso si faltan variables) y verificación segura contra ataques de temporización (`crypto.timingSafeEqual`). Todo acceso al proxy `/api/rest/v1/` y endpoints T-Pot exige autenticación previa válida antes de adjuntar la `service_role key` hacia Supabase.
- **PII:** cifrado AES-256-GCM a nivel de aplicación (Edge Functions), documentado en detalle en `SECURITY_PRIVACY.md`.

## 8. Despliegue

Ambos servicios corren en **Google Cloud Run**, proyecto `polar-plate-499719-r1`, región `us-central1`:
- `cyberdojo` (frontend) — tiene **Dockerfile propio** (`frontend/Dockerfile`, añadido en el commit `217140f` del 2026-09-28: build multistage `node:20-alpine` que termina en `node static-server.js`, igual que hacían los buildpacks). Cloud Build prioriza un `Dockerfile` presente sobre los buildpacks, así que cualquier despliegue nuevo (`gcloud run deploy --source .`) usa ese `Dockerfile`. `[VERIFICAR]` no se confirmó si la revisión actualmente activa en Cloud Run se desplegó antes o después del 2026-09-28 (buildpacks vs. este Dockerfile) — ver `DOC-07` en `loop-docs/DECISIONS.md`; el comportamiento resultante (build y arranque) es el mismo en ambos casos.
- `cyberdojo-admin` (panel) — build por Dockerfile propio (`central-admin-app/Dockerfile`, `node:20-alpine`).

No se encontró evidencia en el repositorio de un pipeline de CI/CD (GitHub Actions, Cloud Build triggers automáticos u otro) — los despliegues verificados en este proyecto se hicieron con `gcloud run deploy` manual. Si existe un pipeline automatizado fuera del repositorio (por ejemplo, un trigger de Cloud Build configurado directamente en la consola de GCP y no versionado como YAML en el repo), no es visible desde el código fuente y debe confirmarse directamente en la consola de Google Cloud si el auditor lo requiere — este documento no lo afirma ni lo descarta por no tener forma de verificarlo desde el código.

---

*Documento reescrito el 2026-09-08 a partir de lectura directa de `frontend/package.json`, `frontend/src/App.tsx`, `frontend/static-server.js`, `central-admin-app/package.json`, `central-admin-app/Dockerfile`, `central-admin-app/index.html`, listados de archivos reales de `frontend/src/` y `supabase/functions/`, y `git remote -v`. Reemplaza la versión anterior, que contenía afirmaciones no verificadas o directamente falsas (ver introducción).*

*Sección 5 (Edge Functions) actualizada el 2026-10-26: el conteo pasó de 14 a 33 carpetas reales en `supabase/functions/`, y se corrigió la afirmación de que ninguna se invoca desde `central-admin-app` — varios módulos añadidos después del 2026-09-08 (preguntas, agente de noticias, centro de seguridad, campeonato, consentimiento) sí la invocan directamente.*

*Secciones 3.1 y 8 actualizadas el 2026-10-26: `frontend/` sí tiene `Dockerfile` propio desde el commit `217140f` (2026-09-28); ya no se construye solo por buildpacks de Cloud Build. Queda `[VERIFICAR]` si la revisión activa hoy en Cloud Run ya usa ese Dockerfile (ver `DOC-07` en `loop-docs/DECISIONS.md`).*
