# Modo invitado — Ciber Dojo

Documento nuevo (2026-10-26, tarea `DOCS-10` de `loop-docs/TASKS.md`). Describe el modo "Probar sin
cuenta" (enlace "Continuar como invitado"): qué guarda, qué aviso muestra, su límite de preguntas y
cómo caduca la sesión. Todo lo escrito aquí está verificado contra el código citado en cada sección.

## 1. Qué es y qué guarda

El modo invitado crea una sesión real de Supabase Auth mediante `signInAnonymously()` — no es un
estado solo del navegador — pero sin ninguna fila en `public.users` detrás. `AuthContext.continueAsGuest`
(`frontend/src/contexts/AuthContext.tsx:212-220`) hace esto en dos pasos:

1. `supabase.auth.signInAnonymously()`.
2. Si eso tiene éxito, invoca la función `accept-guest-notice` para registrar que el invitado vio el
   aviso breve (sección 3). Si esta segunda llamada falla, `continueAsGuest` deshace la sesión con
   `supabase.auth.signOut()` y relanza el error — un invitado nunca queda con sesión activa sin que
   quede evidencia del aviso.

Con esa sesión anónima, el invitado puede practicar únicamente las primeras preguntas del primer dojo
(ver tope en la sección 4); su progreso vive en `learning_progress`, igual que el de un usuario
registrado, mientras la sesión exista. No se guarda ningún otro dato personal del invitado — ningún
perfil, correo ni nombre.

## 2. Aviso breve antes de crear la sesión

Antes de llamar a `signInAnonymously()`, la interfaz muestra `GuestNoticeModal`
(`frontend/src/components/GuestNoticeModal.tsx`), un diálogo modal con foco atrapado (`Tab`/`Escape`)
que el usuario debe cerrar con "Continuar como invitado" o "Cancelar".

El texto del aviso que muestra el modal hoy es **provisional**: el propio código lo marca con la
etiqueta `[PENDIENTE DE VALIDACIÓN LEGAL]` (`GuestNoticeModal.tsx:11-15`) y un comentario que indica
que la persona responsable dará el texto definitivo — no debe citarse en ningún otro documento como
texto final. El aviso actual explica, en resumen: que se puede practicar el primer dojo sin cuenta,
que se registra la aceptación (fecha e IP, cifradas), que la sesión caduca por inactividad, que no se
envían datos a proveedores de IA, y enlaza a `/privacidad` para el aviso completo.

## 3. Evidencia registrada (`accept-guest-notice`)

La función `accept-guest-notice` (`supabase/functions/accept-guest-notice/index.ts`) es el único
endpoint que puede registrar esta aceptación, y solo para una sesión anónima real:

- Exige una sesión con `is_anonymous = true` vía `requireAnonymousGuest`
  (`supabase/functions/_shared/auth-guard.ts:114-119`) — lo opuesto de `requireUser`, que rechaza
  explícitamente las sesiones anónimas (línea 99) para el resto del módulo de consentimiento.
- Aplica límite de tasa con `failClosed: true` (si no se puede establecer la cuota, responde
  `503 RATE_LIMIT_UNAVAILABLE` en vez de permitir la escritura).
- Escribe una fila de evidencia (`insertConsentEvidenceRow`) con finalidad `invitado_basico`, canal
  `invitado`, decisión `granted`, atada al documento de consentimiento publicado vigente — **sin**
  guardar `user_id` como referencia a `public.users` (`storeUserId: false`, porque el invitado no
  tiene fila ahí).

El canal `invitado` y la finalidad `invitado_basico` no existían en la migración `073` original del
módulo de consentimiento; los añadió la migración `083` (sección 5) ampliando el `CHECK` de
`consent_records.channel` sin modificar la `073` (ver `loop-consentimiento/DECISIONS.md`, D-16, que
documenta por qué se eligió esta vía — una sola tabla de evidencia con una sola cadena de integridad —
en vez de una tabla separada solo para invitados).

## 4. Tope de preguntas

El límite es de **10 preguntas** del primer dojo, aplicado en dos capas:

- **Interfaz**: `GUEST_QUESTION_LIMIT = 10` en `frontend/src/screens/DojoDetailPage.tsx:9`, que
  también muestra el aviso "Estás en modo invitado..." y la invitación a registrarse al llegar al
  tope.
- **Servidor**: la función `learning_answer` (`supabase/migrations/076_learning_guest_limit.sql:11-28`)
  cuenta las respuestas ya guardadas y, si la sesión es anónima (`auth.jwt() ->> 'is_anonymous'`) y ya
  hay 10, lanza `RAISE EXCEPTION 'GUEST_LIMIT_REACHED: ...'` en vez de guardar la respuesta 11.
  `GUEST_LIMIT_REACHED: ` al inicio del mensaje es el código estable que el frontend usa para mostrar
  la invitación a registrarse en vez de un error genérico.
- La misma migración bloquea `learning_start_exam` para cualquier sesión anónima
  (`076_learning_guest_limit.sql:39-41`): un invitado nunca puede presentar el examen del dojo, sin
  importar cuántas preguntas respondió.

El límite del servidor existe porque el de la interfaz, por sí solo, no impedía que alguien llamara
directamente a `learning_answer`/`learning_next` con la misma sesión anónima (rol `authenticated`) y
completara las 30 preguntas sin registrarse — así lo documenta el comentario de cabecera de la propia
migración `076`.

## 5. Caducidad de la sesión

La sesión anónima no es permanente. La migración `083`
(`supabase/migrations/083_guest_consent_notice_and_session_expiry.sql:20-28`) define
`public.cleanup_expired_guest_sessions()`, que borra de `auth.users` cualquier fila con
`is_anonymous = true` y `created_at` de hace más de **24 horas** (valor por defecto de esta entrega,
no una decisión legal; ajustable por la persona responsable). Borrar la fila de `auth.users` es lo
que de verdad termina la sesión (revoca sus refresh tokens): `learning_progress`/`learning_attempts`
del invitado se eliminan en cascada (`ON DELETE CASCADE`), mientras que la evidencia de
`consent_records` ya escrita se conserva (`ON DELETE SET NULL` sobre `user_id`).

La misma migración agenda la limpieza cada hora vía `pg_cron`
(`cron.schedule('cleanup-guest-sessions-hourly', '0 * * * *', ...)`), pero solo si la extensión
`pg_cron` está instalada — en el Postgres efímero que usa `gates.sh` para verificar este repositorio
no lo está, así que ahí la limpieza no queda agendada; en el proyecto de Supabase alojado sí lo está,
desde las migraciones `037`/`038`.

## 6. Estado de despliegue

Mientras se desarrollaba este modo, la decisión `D-12` de `loop-consentimiento/DECISIONS.md`
(2026-09-28) estableció que `enable_anonymous_sign_ins` debía permanecer **desactivado en
producción** hasta que el aviso y su evidencia (secciones 2-3 de este documento) estuvieran
implementados y probados. Esa implementación ya existe en el código (migraciones `076`/`083`, función
`accept-guest-notice`, decisión `D-16`), pero, igual que el resto del módulo de consentimiento, aún no
está desplegada: la decisión `DOC-06` de `loop-docs/DECISIONS.md` confirma que en producción solo está
aplicada la migración `073` y que las migraciones `074`-`084` (que incluyen el modo invitado completo)
están **"implementadas, pendientes de despliegue"**. En el entorno local de desarrollo
(`supabase/config.toml:171`), `enable_anonymous_sign_ins = true` ya está activo para poder probar el
flujo descrito en este documento.
