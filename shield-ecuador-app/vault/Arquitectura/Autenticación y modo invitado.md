← [[Índice]] · ver [[Arquitectura/Visión general|Visión general]]

## Login real (password + OTP de respaldo)

`AuthContext.tsx` expone `signIn(email, password)` como camino principal. Si falla, la pantalla de login (`LoginScreen.tsx`) cae automáticamente a un código OTP de 6 dígitos por correo (`sendLoginCode` → `verifyCode`), **sin decirle al usuario cuál fue la causa real del fallo** (contraseña incorrecta vs. cuenta sin contraseña) — evita enumeración de usuarios. Ver [[Decisiones/Registro de decisiones]] para por qué se revirtió el diseño passwordless original.

Todo intento fallido (`login_failed`, `otp_send_failed`, `otp_verify_failed`) se reporta en segundo plano (fire-and-forget) a la función `log-login-event`, que alimenta el feed del [[Módulos/Centro de Seguridad|Centro de Seguridad]]. Nunca bloquea ni ralentiza el login real.

## Registro

`signUp()` llama a la función `secure-register-user` (crea el usuario con la service role, cifra el email/PII, valida sector de negocio) y **luego llama a `signIn()` inmediatamente** — es decir, quien se registra queda autenticado de una vez, no se le pide volver a ingresar. Decisión confirmada explícitamente el 2026-09-17 (dejar como está, no forzar re-login).

## Modo invitado ("Probar sin cuenta")

Desde 2026-09-17: usa `supabase.auth.signInAnonymously()` — una sesión **real** de Supabase Auth pero sin fila en `public.users`. Se activa desde el botón "Probar sin cuenta" en la landing (`CinematicLandingPage.tsx`) o el link "Probar el dojo" del header (`CinematicPublicShell.tsx`).

**Por qué funciona sin construir un sistema paralelo:** el RPC `learning_overview` ya trataba "sin fila en `users`" como cinturón/rango 0, así que el primer dojo (`passwords`, rank 0) sale "unlocked" gratis para cualquier sesión nueva. Hubo que corregir `learning_state` (migración `058_learning_state_guest_fix.sql`) porque ese RPC en particular SÍ lanzaba excepción con `current_rank IS NULL` en vez de tratarlo como 0 — sin el fix, el invitado veía el dojo listado pero no podía responder ni una pregunta.

**El candado real está en el frontend**, no en la base de datos: `GuestGate` (dentro de `ProtectedShell`, en `App.tsx`) intercepta cualquier ruta protegida que no sea `/dojos` o `/dojo/<primer-dojo>` cuando `user.is_anonymous` es true, y muestra `GuestRegisterPrompt` en vez de la pantalla real. La navegación lateral (Sensei, Campeonato, Perfil...) sigue visible y clicable — el bloqueo pasa al hacer clic, no antes.

**Trampa encontrada y corregida:** `LoginScreen`/`RegisterScreen` tenían un guard `if (user) navigate(redirectPath)` que trataba una sesión anónima como "ya logueado" y rebotaba al invitado de vuelta a `/dashboard` (bloqueado) en un loop, antes de que pudiera siquiera ver el formulario de registro. Se corrigió a `if (user && !user.is_anonymous)` en ambas pantallas.

## Archivos clave

- `frontend/src/contexts/AuthContext.tsx` — `signIn`, `sendLoginCode`, `verifyCode`, `signUp`, `continueAsGuest`.
- `frontend/src/App.tsx` — `ProtectedShell`, `isGuestAllowedPath`, `FIRST_DOJO_ID`.
- `frontend/src/components/GuestRegisterPrompt.tsx`
- `supabase/functions/log-login-event/index.ts`
- `supabase/migrations/058_learning_state_guest_fix.sql`
