# ciberDojo · Aplicación cinematográfica local

La versión de revisión se sirve en `http://localhost:3001`. Utiliza la aplicación React real y conserva sus servicios de autenticación, aprendizaje, consultas, ranking, diagnóstico y desafío al sensei. No se ha desplegado este diseño en Cloud Run ni modificado la base de datos durante esta revisión.

## Pantallas

| Ruta | Experiencia |
| --- | --- |
| `/` | Portada con el mensaje solicitado, video del sensei, siete cinturones tejidos y sección destacada de DoggoTeka |
| `/personajes` | Catálogo filtrable: cinco aliados y cuatro adversarios |
| `/personajes/doggoteka` | Ficha de la mascota, sus tres defensas, selección como compañero e impresión |
| `/personajes/:id` | Fichas de Ren, Kai, Kira, Aria, El Engaño, Malware, El Intruso y Virus Corruptor |
| `/practica` | Demostración sin cuenta; avance independiente guardado en este navegador |
| `/login` | Ingreso real por contraseña o enlace por correo |
| `/login?mode=register` | Registro real, ocupación y consentimiento existentes |
| `/reset-password`, `/auth/callback` | Recuperación y retorno de autenticación existentes |
| `/dashboard` | Progreso real de la cuenta, siguiente dojo, alertas y accesos a herramientas |
| `/dojos` | Siete dojos y condiciones de desbloqueo calculadas por el servidor |
| `/dojo/:id` | Treinta preguntas, compañero seleccionable, explicaciones y reanudación |
| `/kata/:code` | Cinco casos; examen y ascenso validados por el servidor; revisión de las cinco explicaciones |
| `/sensei` | Consulta real al asistente, explicaciones y valoración de la respuesta |
| `/escaner` | Diagnóstico existente del navegador, consulta y descarga del reporte |
| `/ranking` | Tabla de honor conectada al servicio existente |
| `/perfil` | Cuenta, cinturón, puntos y compañero de aprendizaje |

El desafío al sensei, controles de sonido, campañas y acceso de administración conservan sus implementaciones. La consola administrativa es otra aplicación; el servidor de revisión no la publica ni reemplaza su autenticación.

## Separación de datos

El progreso de usuarios registrados sigue almacenándose en Supabase. La preferencia de personaje se guarda en `ciberdojo-companion-v1` en este navegador. La práctica de demostración utiliza las claves anteriores `ciberdojo-cinematic-proposal-v1` y `ciberdojo-demo-route`; no da puntos ni cinturones a una cuenta real. Las respuestas de su banco público de demostración no se usan para calificar los exámenes de cuentas registradas, que siguen validados por el servidor.

## Preparar y ejecutar

1. `python scripts/prepare_cinematic_assets.py`
2. Desde `frontend`: `node node_modules/react-scripts/bin/react-scripts.js build`
3. Desde la raíz: `node proposal/server.cjs`

El servidor solo escucha en `127.0.0.1:3001`, sirve `frontend/build` con rutas de aplicación y rangos de video. El servidor antiguo de la propuesta se conserva en `proposal/standalone-server.cjs` (no ejecutar ambos en el mismo puerto).

## Verificación

- `frontend`: `node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand`.
- Raíz: `node tests/cinematic-app.cjs`.
- Las pruebas de navegador usan un contexto aislado y sustituyen las llamadas de Supabase por respuestas de prueba. Verifican rutas, controles, solicitudes de los servicios y persistencia, sin crear usuarios ni modificar producción. No equivalen a una nueva prueba del proveedor de correo ni de los servicios de inteligencia artificial en vivo.
- Capturas y ficha PDF en `test-results/cinematic/`.

## Arte y comportamiento

El video del sensei y todas las imágenes provienen de archivos aportados por el usuario. La ficha de DoggoTeka conserva su imagen original. Los cinturones son ilustraciones vectoriales con tejido, costuras, pliegues y nudo. No se presenta la ilustración como un modelo 3D ni se ha generado un nuevo video de combate.

El video no tiene sonido automático y se puede pausar. Se respeta la preferencia de movimiento reducido. Las preguntas usan una superficie clara de lectura y los adversarios se explican con lenguaje cotidiano. El diagnóstico del navegador se describe como orientativo: no se presenta como un análisis completo de virus del equipo.
