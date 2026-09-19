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
| 1 | `/` Landing (`CinematicLandingPage` + `CinematicPublicShell` + `SenseiVideoModal`) | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 2 | `/login` `LoginScreen` (+ `OtpCodeStep`) | ⬜ | ⬜ | ⬜ | ⬜ | pending |
| 3 | `/registro` `RegisterScreen` | ⬜ | ⬜ | ⬜ | ⬜ | pending |
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
