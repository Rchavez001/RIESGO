# Ciber Dojo — Frontend de Usuario

Aplicación web progresiva (PWA) desarrollada en **React 19 + TypeScript**, estilizada con **Tailwind CSS**, animada con **Framer Motion, Three.js y GSAP**, y respaldada por **Supabase**.

Este servicio se despliega de forma independiente en **Google Cloud Run** bajo el nombre `cyberdojo`.

---

## 1. Stack Tecnológico

| Componente | Versión / Detalle |
|---|---|
| **Framework** | React `^19.2.5` + ReactDOM `^19.2.5` |
| **Enrutamiento** | React Router DOM `^7.15.0` |
| **Lenguaje** | TypeScript `^4.9.5` |
| **Estado Global** | Zustand `^5.0.13` (experiencia y cinturón) + React Context (Auth, Audio, Toast) |
| **Cliente Backend** | `@supabase/supabase-js` `^2.104.1` |
| **Efectos Visuales / 3D** | Three.js `^0.184.0`, Framer Motion `^12.38.0`, GSAP `^3.15.0`, Lucide React |
| **Audio** | Howler.js `^2.2.4` + Web Audio API |
| **Servidor de Producción** | `static-server.js` (Node.js nativo sin dependencias externas) |

---

## 2. Variables de Entorno

Crear un archivo `.env` en el directorio `frontend/` a partir de `.env.example`:

```env
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon_key_de_supabase>
NODE_ENV=development
```

En producción (Cloud Run), `static-server.js` admite opcionalmente:
* `PORT`: Puerto en el que escucha el servidor estático (por defecto `3000`, o asignado por Cloud Run).
* `ADMIN_UPSTREAM_HOST`: Host del servicio de administración para reenviar peticiones a `/admin/*` y `/api/*` (por defecto `cyberdojo-admin-61855290194.us-central1.run.app`).

---

## 3. Scripts Disponibles

En la carpeta `frontend/`, puedes ejecutar:

### `npm run start:dev`
Inicia la aplicación en modo desarrollo local usando `react-scripts start`.  
Abre [http://localhost:3000](http://localhost:3000) en el navegador.

### `npm run build`
Compila la aplicación optimizada para producción dentro del directorio `build/`.

### `npm start`
Inicia el servidor de producción HTTP nativo (`static-server.js`). Sirve los archivos estáticos desde `build/` y redirige el tráfico a `/admin` y `/api` hacia el servicio administrativo en Cloud Run.

### `npm run gcp-build`
Hook utilizado por los Cloud Buildpacks de Google Cloud Run al desplegar el código fuente con `gcloud run deploy`. Ejecuta `npm run build`.

### `npm test`
Ejecuta la suite de pruebas unitarias en modo interactivo/watch. Para una ejecución única en pipelines o scripts:
```bash
npm test -- --watchAll=false
```

---

## 4. Estructura de Código (`src/`)

```
src/
├── components/          # Componentes visuales reutilizables (DojoShell, CyberBushido, DojoWebGLBackdrop, AdminShell)
│   └── VulnScanner/     # Componentes del escáner educativo de vulnerabilidades (/escaner)
├── contexts/            # Proveedores de estado (AuthContext, DojoAudioContext, ToastContext)
├── data/                # Datos y catálogos locales (ciberDojo.ts: citas, módulos, niveles de cinturón)
├── hooks/               # Custom hooks (usePWAInstall, usePwaInstallPrompt)
├── lib/                 # Cliente de Supabase e interfaces TypeScript (supabase.ts)
├── screens/             # Vistas principales de la aplicación:
│   ├── LandingPage.tsx          # Portada pública informativa
│   ├── LoginScreen.tsx          # Acceso por enlace mágico o contraseña + Registro seguro
│   ├── DashboardScreen.tsx      # Panel del guerrero (misiones, alertas, cinturón dinámico)
│   ├── DojoListPage.tsx         # Listado de dojos temáticos
│   ├── DojoDetailPage.tsx       # Pantalla de entrenamiento y preguntas del dojo
│   ├── KataExamPage.tsx         # Exámenes de ascenso de cinturón evaluados en servidor
│   ├── LeaderboardPage.tsx      # Tabla de honor corporativa (excluye dominios públicos)
│   ├── SenseiConsultPage.tsx    # Chat con Sensei IA (Edge Function ask-sensei + fallback local)
│   ├── VulnScannerPage.tsx      # Diagnóstico de seguridad local (/escaner, lazy-loaded)
│   ├── ProfilePage.tsx          # Perfil privado con cifrado ARCO y camino de cinturones
│   ├── AuthCallbackPage.tsx     # Manejador del callback de Magic Link
│   └── ResetPasswordPage.tsx    # Recuperación de contraseña
├── services/            # Servicios de integración frontend (senseiIA, auditorIA, scanOrchestrator)
└── store/               # Store Zustand (dojoStore.ts: experiencia acumulada y cinturón)
```

---

## 5. Arquitectura del Proxy `/admin`

El frontend y el panel de administración operan en el mismo dominio público gracias al servidor `static-server.js`:
* Cualquier petición a `/admin` o `/admin/*` se reenvía vía HTTPS al microservicio `cyberdojo-admin`.
* Cualquier petición a `/api/*` se reenvía hacia el microservicio administrativo (que añade de forma segura la autenticación de servicio hacia Supabase).
* Las rutas SPA del frontend son capturadas por el fallback hacia `build/index.html`.
