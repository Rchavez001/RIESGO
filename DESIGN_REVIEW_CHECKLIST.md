# DESIGN_REVIEW_CHECKLIST — Auditoría y hardening del front-end (CiberDojo)

Estado persistente del loop. Cada iteración: leer este archivo → tomar la primera fila que no esté en `done` → resolverla → marcarla → commit → terminar el turno. **Una fila por iteración.**

Leyenda: ⬜ pendiente · ✅ verificado/corregido · ➖ no aplica

## Stack detectado (Iteración 0, 2026-09-19)

- **App del estudiante** — `shield-ecuador-app/frontend/`: **web responsive / PWA**. React 19 + TypeScript 4.9 + react-router-dom 7, CRA (`react-scripts` 5), framer-motion, GSAP, three.js, zustand, lucide-react, Supabase JS. CSS a mano (`index.css` 87 KB, `cinematic.css` 31 KB, `learning.css`, `adminshell.css`, `senseiChallenge.css`); Tailwind 4 instalado pero casi sin uso. Servido por `static-server.js` (Node) en Cloud Run.
- **Consola admin** — `shield-ecuador-app/central-admin-app/`: HTML + JS vanilla (`index.html`, `app.js`, `styles.css`), Node `server.js`, Basic Auth. 15 paneles.
- No hay Android nativo, iOS nativo, Flutter ni React Native: aplican las reglas de **web responsive** (Android = Chrome, iOS = Safari/WebKit).

## Entorno de pruebas disponible (límites honestos)

- Playwright 1.62 con **Chromium, Firefox y WebKit** instalados → se prueba con perfiles de dispositivo (Pixel/Galaxy en Chromium; iPhone/iPad en **WebKit = motor de Safari**), emulando viewport, DPR, touch y UA.
- **No hay dispositivos físicos ni Firebase Test Lab ni Safari iOS real** en esta máquina. WebKit-Windows/Playwright reproduce el motor pero no la barra de URL dinámica, la Dynamic Island real ni el teclado virtual de iOS: esos puntos se marcan "verificar en dispositivo real" en la nota de la fila, no como ✅ ciegos.
- Matriz de anchos: 375 / 768 / 1024 / 1440 px, portrait y landscape en móvil/tablet.
- Tests existentes: `src/App.test.tsx`, `AuthContext.test.tsx`, `LearningFlow.test.tsx`, `LoginScreen.test.tsx`, `senseiChallengeEngine.test.ts` (Jest/RTL) y `tests/*.cjs` + `playwright.config.ts` (visual/e2e).

## Hallazgos globales de la Iteración 0 (se resuelven en la fila G1)

1. `public/index.html`: viewport sin `viewport-fit=cover` y **cero** uso de `env(safe-area-inset-*)` → notch/Dynamic Island/barra de gestos sin manejar.
2. `100vh` en ≥10 reglas de `index.css`/`cinematic.css` → en iOS Safari la barra de URL recorta contenido; usar `dvh` con fallback.
3. `static-server.js` sin ningún header de seguridad (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors).
4. Código aparentemente **sin uso** (no importado en ningún lado; se reporta, no se borra sin decisión del dueño): `screens/LandingPage.tsx`, `screens/DashboardScreen.tsx`, `screens/ResultsScreen.tsx`, `components/AdaptiveQuestionnaire.tsx`, `components/TatamiCombatIntro.tsx`, `components/SenseiPortraitSVG.tsx`.
5. Skills: instaladas y usables → `ui-ux-pro-max`, `frontend-design`, `react-best-practices`, `design-review`, `no-ai-design-slop`, `audit-ai-design-slop`. Los repos de las skills "Refactoring UI" / "UX Heuristics" no venían en el prompt (líneas en blanco tras "instalar"), así que **no se instaló nada de fuentes no indicadas**; las heurísticas de Nielsen se aplican manualmente en la columna Presentación.

## Tabla

| # | Pantalla / Componente | Responsive | Presentación HD | Testing | OWASP | Estado |
|---|---|---|---|---|---|---|
| G1 | Base web: `index.html`, `manifest.json`, `static-server.js`, tokens/CSS globales (`index.css`) | ✅ | ✅ | ✅ | ✅ | **done** |
| 1 | `/` Landing (`CinematicLandingPage` + `CinematicPublicShell` + `SenseiVideoModal`) | ✅ | ✅ | ✅ | ✅ | **done** |
| 2 | `/login` `LoginScreen` (+ `OtpCodeStep`) | ✅ | ✅ | ✅ | ✅ | **done** |
| 3 | `/registro` `RegisterScreen` | ✅ | ✅ | ✅ | ✅ | **done** |
| 4 | `/auth/callback` `AuthCallbackPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 5 | `/reset-password` `ResetPasswordPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 6 | `/personajes[/:id]` `CharactersPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 7 | Shell autenticado: `ProtectedShell` + `DojoShell` (`CyberBushido.tsx`) + `GuestRegisterPrompt` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 8 | `/dashboard` `CinematicDashboardScreen` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 9 | `/dojos` `DojoListPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 10 | `/dojo/:id` `DojoDetailPage` (+ `LearningHelpers`, `DojoCompanion`) | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 11 | `/kata/:code` `KataExamPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 12 | `/sensei` `SenseiConsultPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 13 | `SenseiChallengeModal` ("Desafiando al Sensei") | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 14 | `/escaner` `VulnScannerPage` + `components/VulnScanner/*` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 15 | `/ranking` `LeaderboardPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 16 | `/campeonato` `ChampionshipPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 17 | `/campeonato/combate/:id` `ChampionshipMatchPage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 18 | `/perfil` `ProfilePage` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 19 | `/tenant-admin` `TenantAdminPage` + `AdminShell` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 20 | Overlays globales: `PWAInstallPrompt`, `CyberToast`/`ToastContext`, `PageTransition` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A0 | Admin: shell, navegación lateral, auth (`central-admin-app`) | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A1 | Admin › Resumen | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A2 | Admin › Dojos y progreso | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A3 | Admin › Preguntas | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A4 | Admin › IA y auditoría | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A5 | Admin › Agente noticias | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A6 | Admin › Alertas IA | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A7 | Admin › Sensei IA | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A8 | Admin › Inteligencia de Amenazas | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A9 | Admin › Preguntas abiertas | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A10 | Admin › Campeonato | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A11 | Admin › Centro de Seguridad | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A12 | Admin › Usuarios | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A13 | Admin › Ocupaciones | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A14 | Admin › Propaganda | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| A15 | Admin › Reportes | ⬜ | ⬜ | ⬜ | ⬜ | pending |

## Notas por fila (una línea por columna al cerrar cada fila)

### G1 — Base web (2026-09-19) · done
- **Responsive:** `viewport-fit=cover` + tokens `--safe-top/right/bottom/left` aplicados al `body`; 16 reglas `100vh` ahora con fallback `100dvh` (iOS Safari); `text-size-adjust`; manifest ya no fuerza `orientation: portrait` (bloqueaba tablets/escritorio instalados). Pendiente por pantalla: `max-height: 58/70/80/88vh` y elementos `position:fixed` (headers/sidebars) que deben consumir `--safe-*` — se resuelven en las filas 1, 7, 13, 20. **Verificar en iPhone real:** barra de URL dinámica y Dynamic Island (WebKit-Windows no los reproduce).
- **Presentación HD:** título/descr./`apple-mobile-web-app-title` ya dicen CiberDojo (decían "Shield Ecuador"); Google Fonts pasó de `@import` en CSS (cadena bloqueante) a `<link rel=preconnect>` + `<link>` en el HTML; `color-scheme: dark`; JS transferido con brotli: 727 KB → 200 KB.
- **Testing:** nueva suite `tests/frontend/base.spec.ts` + `playwright.frontend.config.ts` (`npm run test:frontend`): 7 perfiles (iPhone SE/14 y iPad en WebKit; Pixel 7 y Galaxy S9+ en Chromium; Desktop Chrome/Safari) × 8 pruebas = **56/56 verdes** (headers, caché, `%` malformado, viewport-fit sin bloquear zoom, sin scroll horizontal y sin violaciones CSP en `/`, `/login`, `/registro`, `/personajes`). Limitación: son perfiles emulados, no dispositivos físicos; rutas autenticadas se cubren en sus filas.
- **OWASP:** A02 — CSP (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`…), HSTS, nosniff, Referrer-Policy, Permissions-Policy; deja de filtrarse el caché (`no-cache` HTML, `immutable` para `/static/`). A03 — `npm audit fix`: 3 vulnerabilidades altas/bajas (react-router, ws) → **0** en dependencias de producción. A10 — `decodeURIComponent` con `%` malformado **tumbaba el proceso Node** (DoS con una sola petición) → ahora 400; el chequeo anti path-traversal usaba `startsWith(root)` (permitía carpetas hermanas con el mismo prefijo) → ahora exige `root + sep`. A04 — bundle sin secretos (solo la anon key pública de Supabase, por diseño). Pendiente para filas posteriores: `_vs_last_report` en `localStorage` (fila 14). Nota: el commit incluye cambios previos sin commitear de `index.css`/`cinematic.css`/`static-server.js`.

### 1 — Landing `/` (2026-09-19) · done
- **Responsive:** el CTA "Ingreso" estaba bajo el pliegue en móvil vertical (y=665 en iPhone SE de 568 px; 671 en iPhone 14) → ahora 473/487 (alto del video en `clamp(190px,30dvh,300px)`, márgenes del titular compactados). En móvil horizontal el header ocupaba 96 px de 340 y el texto tapaba la cara del Sensei → header de 64 px, layout lateral propio (`max-height:520px` + landscape) y CTA a 297 px; se eliminó una costura vertical del degradado. Todos los targets táctiles del header/hero ≥44×44 (nav, "Ingresar", "Pausar ambiente", enlaces de texto y footer). Modal del video: en horizontal el video ocupa la altura completa con la X superpuesta; padding con `--safe-*`. 0 scroll horizontal en 320/375/390/412/750/810/1440 px. **Verificar en iPhone real:** posición respecto a la barra de URL y a la Dynamic Island.
- **Presentación HD:** eyebrows 9–10→11 px, subtítulo de marca 7→9 px, "no necesitas saber de informática" 11→12 px, footer 11→12 px. Pendiente (menor): las imágenes de sección no usan `srcset` (3 imágenes de 40–125 KB; se hace en la fila 20 junto con el resto de assets si el peso lo justifica).
- **Testing:** `tests/frontend/landing.spec.ts` (7 perfiles): targets ≥44 px, CTA sobre el pliegue en móvil vertical, header ≤70 px y CTA alcanzable en horizontal, modal (rol `dialog`, foco en Cerrar, Esc cierra y devuelve el foco, el video cabe entero en el viewport), CTA de fin de video. + `SenseiVideoModal.test.tsx` (4 tests Jest). Suite completa: **Playwright 81/81, Jest 40/40**. Dos hallazgos reales: Safari no da foco a un botón al hacer clic → el modal no podía devolver el foco (ahora recibe `returnFocusTo`); y el aviso de instalar PWA (fila 20) tapa la página en iPad tras unos segundos y bloquea clics.
- **OWASP:** sin `dangerouslySetInnerHTML`/`innerHTML` en la landing (A05). A10: `reportLoginEvent` fallaba con `Cannot read properties of undefined (reading 'catch')` si `invoke` no devolvía promesa — rompía 2 tests de `AuthContext` y podía enmascarar el error real del login → ahora `Promise.resolve` + `try/catch`. Modo invitado: `continueAsGuest` que falla cae a `/registro` sin mensajes técnicos (A10); cada clic crea como máximo una sesión anónima (reutiliza `user`), con el límite de 30/h/IP de Supabase (A04/A07). Commit incluye cambios previos sin commitear de `CinematicLandingPage.tsx` y `AuthContext.tsx` (modo invitado, log de login, video).

### 2 — Login `/login` + `OtpCodeStep` (2026-09-19) · done
- **Responsive:** los inputs medían 15 px → **iOS Safari hace zoom al enfocarlos** y descuadra la página; ahora 16 px (regla global `.field input`, así que también corrige `/registro` y demás formularios; se re-verifica en la fila 3). Targets: enlace "Volver", "Crear cuenta nueva", "Cambiar correo", "Reenviar código" (25 px) y el ojo de la contraseña (36 px) → ≥44 px. El botón "Ingreso"/"Continuar" no ocupaba el ancho (usaba clases Tailwind `w-full` que no se generan) → `.auth-submit`. 0 scroll horizontal 320–1440 px; en horizontal (340 px de alto) la tarjeta hace scroll sin recortarse. **Verificar en iPhone real:** comportamiento con el teclado virtual abierto y el autocompletado de contraseñas/SMS (`autocomplete=one-time-code`).
- **Presentación HD:** faltaban tildes en toda la pantalla (CONTRASENA, ELECTRONICO, codigo, digitos, expiro…) → corregidas; etiquetas 11→12 px y de `--text-muted` a `--text-secondary` (mejor contraste); en el paso del código había dos párrafos repetidos y un "PASO 2 DE 2" sin paso 1 visible → un solo mensaje claro + aviso de carpeta de spam; párrafos con espaciado (se pegaban).
- **Testing:** `tests/frontend/login.spec.ts` (Supabase Auth simulado con `page.route`, nada toca el backend real) × 7 perfiles = 42 pruebas, estables en 2 corridas seguidas: inputs ≥16 px, targets ≥44, flujo contraseña→código, correo sin cuenta, código vencido, solo dígitos, tokens en query ignorados. `helpers.ts › settle()` espera a que termine la animación de `PageTransition` (medir durante ella daba 43 px falsos). `LoginScreen.test.tsx` 5→8 tests (mensajes amigables, sin filtrar "Signups not allowed", pegado "123 456"). Totales: **Playwright 123/123 · Jest 43/43**.
- **OWASP:** A07 — los tokens de recuperación se leían de `?access_token=` en la query (un enlace armado `/login?type=recovery&access_token=…` podía iniciar sesión a la víctima con una sesión elegida por el atacante y los query strings quedan en logs/Referer) y usaba el access token como refresh token de respaldo → ahora solo del fragmento `#`, exige ambos tokens y borra la URL antes de usarlos. A01/enumeración — si el correo no tenía cuenta, el mensaje crudo de Supabase ("Signups not allowed for otp") se mostraba y lo delataba → siempre "Correo o contraseña incorrectos"; nuevo `lib/authErrors.ts` traduce límite de intentos/red y oculta el resto (A10; antes salían textos en inglés del backend). Bug real: `maxLength=6` truncaba un código pegado como "123 456" a 5 dígitos → se filtra primero y se corta después. Pendiente: `AuthCallbackPage` y `ResetPasswordPage` también leen tokens de la query (filas 4 y 5). Commit incluye cambios previos sin commitear de `LoginScreen.tsx` y `OtpCodeStep.tsx`.

### 3 — Registro `/registro` (2026-09-19) · done
- **Responsive:** **bug bloqueante** — el aviso de datos personales (consentimiento) era más alto que la pantalla en iPhone SE y en móvil horizontal: se recortaba por arriba (título cortado) y el botón "Acepto y continuar" quedaba fuera de pantalla sin poder hacer scroll → **no se podía completar el registro en teléfonos chicos**. Ahora el contenedor hace scroll (`overflow-y:auto`) y la tarjeta se centra con `margin:auto` (no recorta el borde superior), con `--safe-*` y `overscroll-behavior:contain`. Inputs 16 px (sin zoom iOS), targets ≥44 px, botón de envío a ancho completo, 0 scroll horizontal 320–1440 px. **Verificar en iPhone real:** teclado abierto sobre el `<select>` de negocio (el selector nativo de iOS es una rueda) y autocompletado de contraseñas nuevas.
- **Presentación HD:** tildes (ELECTRÓNICO, CONTRASEÑA, AUTORIZACIÓN, "Ocultar contraseña"); ayuda "Mínimo 8 caracteres" enlazada con `aria-describedby` (antes solo se enteraba al fallar); los dos párrafos del aviso estaban pegados → espaciado; atributos de teclado móvil (`autocapitalize`, `inputMode=email`, `enterKeyHint`). Pendiente de contenido (no de diseño): el aviso ARCO usa un correo personal (`raulchavezdrouet@gmail.com`) como contacto — conviene un buzón institucional del club.
- **Testing:** `tests/frontend/register.spec.ts` × 7 perfiles (sectores y `secure-register-user` simulados): formulario (targets/fuente/tildes/ayuda), aviso (foco dentro, título a la vista, "Acepto" alcanzable en pantallas bajas), Esc, "No acepto", correo ya registrado, error técnico. **Playwright 165/165 estable en 2 corridas**; se bajó a 3 workers en `playwright.frontend.config.ts` (7 perfiles en paralelo daban falsos timeouts de "estable" en WebKit). Jest 43/43.
- **OWASP:** A10 — los errores del alta mostraban el texto crudo de la función/Supabase (inglés, "Edge Function…") → los mensajes técnicos se sustituyen por uno genérico y los mensajes en español del servidor ("Ya existe una cuenta…") se conservan; límites/red vía `friendlyAuthError`. A07/A04 — `maxLength=128` en contraseña (coincide con el servidor), `minLength/maxLength` en nombre; la contraseña mínima sigue siendo 8 sin reglas de complejidad ni chequeo de filtraciones (**decisión pendiente**: subir política vía `auth.password_requirements` en Supabase). A01 — el consentimiento y `data_processing_authorized_at` los fija el servidor (el cliente solo envía el booleano). Nuevo `hooks/useModalA11y` (foco dentro, trampa de Tab, Esc, devolver foco, bloqueo de scroll) que reutilizarán las filas 13 y 20.

