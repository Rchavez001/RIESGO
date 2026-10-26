← [[Índice]]

Bitácora de decisiones de diseño no obvias — el código no siempre explica el *por qué*, esto sí.

## 2026-09-17 — Modo invitado vía sesión anónima, no un sistema paralelo

En vez de construir un camino de datos separado para "invitados" (preguntas de ejemplo, progreso solo en `localStorage`, etc. — como era la demo estática vieja en `/practica`), se usó `supabase.auth.signInAnonymously()`: una sesión real de Supabase Auth. El sistema de cinturones ya trataba "sin fila en `users`" como rango 0, así que el primer dojo sale desbloqueado gratis. El candado para todo lo demás vive en el frontend (`GuestGate`), no en la base de datos. Ver [[Arquitectura/Autenticación y modo invitado]].

**Confirmado explícitamente:** registrarse sigue autenticando automáticamente (no se fuerza re-login manual), incluso para invitados que se convierten — se consideró y se descartó cambiarlo, porque afectaría a *todos* los registros, no solo a invitados.

## 2026-09-16/17 — Login: password primero, OTP como respaldo (no passwordless)

Hubo un diseño passwordless completo (email → código, sin contraseña) implementado y luego **revertido explícitamente por instrucción del usuario**: "EL LOGIN DEBE DE ESTAR MANEJADO POR SUPABASE... dos botones claros Ingreso (correo+clave) y Regístrate". Se confirmó que el login real es password-primero, con OTP solo como fallback automático si la contraseña falla — y que el fallo nunca revela si fue "contraseña incorrecta" o "cuenta sin contraseña" (evita enumeración de usuarios).

## 2026-09-16 — Centro de Seguridad: adaptar el prompt a la realidad, no al revés

El prompt original para construir el Centro de Seguridad asumía un login passwordless + Google OAuth y un panel con tokens visuales que no coincidían con lo que existía. Regla explícita del prompt: parar y reportar contradicciones en vez de improvisar. Se resolvió con el usuario antes de escribir código: panel = `central-admin-app` existente, modelo de auth = ajustar el prompt a la realidad (password + OTP), sistema visual = el tema ya existente del panel, alcance = las 4 fases de una vez.

## 2026-09-16 — RBAC del Centro de Seguridad: reusar `requireAdminOrScheduler`, no crear roles nuevos

`central-admin-app` no tiene sistema de roles por persona (Basic Auth compartida). En vez de construir uno nuevo para el Centro de Seguridad, se reutilizó el mismo patrón `requireAdminOrScheduler` (JWT `role: service_role` o sesión real de admin) que ya usaban el agente de noticias y el campeonato.

## 2026-09 — `learning_state` guardaba `content.difficulty` en escala global, no relativa al cinturón (bug de datos)

Ver [[Módulos/Campeonato]] — descubierto probando con datos reales durante el desarrollo del campeonato, no en revisión de código. Corregido en `051_fix_championship_difficulty_source.sql`.
