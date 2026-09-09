# Manual del Usuario — Ciber Dojo

Este documento reemplaza por completo la versión anterior, que contenía información inventada: correo/teléfono/web/redes sociales de soporte ficticios, un sistema de certificados descargables en PDF que no existe en el código, un sistema de rachas diarias que no existe, y — el error más grave — documentaba el camino de **8 cinturones retirado** (blanco/amarillo/naranja/verde/azul/**morado**/**rojo**/negro) cuando el sistema real, desde la migración 017 de la base de datos, usa **7 cinturones** (blanco/amarillo/naranja/verde/azul/**marrón**/negro). Todo lo que sigue está verificado leyendo directamente `frontend/src/screens/*.tsx`, `frontend/src/components/CyberBushido.tsx` y `frontend/src/data/ciberDojo.ts`.

## 1. Qué es Ciber Dojo

Aplicación web (PWA) en español para enseñar ciberseguridad práctica a empleados y dueños de MIPYMEs ecuatorianas sin conocimientos técnicos, mediante una metáfora de dojo de karate: cinturones, katas (retos prácticos) y exámenes de ascenso.

## 2. Registro (verificado en `frontend/src/screens/LoginScreen.tsx`)

Desde la pantalla de acceso, pestaña "Registro":

- **Nombre del guerrero** (nombre completo)
- **Correo electrónico**
- **Contraseña** (mínimo 8 caracteres)
- **Tipo de negocio** — un `<select>` agrupado por industria (`<optgroup>`), cargado en vivo desde la tabla real `business_sectors` (`.eq('active', true).order('display_order')`) — es decir, la lista de ocupaciones que ve el usuario es exactamente la que un administrador mantiene en el panel "Ocupaciones". Si por alguna razón la consulta a Supabase falla, la app usa una lista de respaldo mínima de 4 opciones (Comerciante, Agricultor/a, Pescador/a, Otro) codificada en el propio archivo, solo como último recurso.

Al enviar el formulario de registro se muestra un modal obligatorio de **autorización de tratamiento de datos personales**, con este texto exacto:

> "Autorizo el tratamiento de mis datos personales para fines internos de la aplicación, incluyendo registro, gestión de usuario, operación del servicio y clasificación estadística durante la vigencia de mi uso de la aplicación."
>
> "Declaro conocer que puedo ejercer mis derechos de acceso, rectificación, actualización, eliminación y oposición —derechos ARCO—, así como solicitar la modificación o eliminación de mis datos personales, escribiendo al correo: **raulchavezdrouet@gmail.com**."

Con botones "No acepto" (regresa a la portada, sin registrar) y "Acepto y continuar" (crea la cuenta). Solo al aceptar se invoca `signUp(...)`, que internamente llama a la Edge Function `secure-register-user` (cifra los datos personales — ver `SECURITY_PRIVACY.md`).

**Nota de precisión:** el correo de contacto para ejercer derechos ARCO que ve el usuario es una dirección personal (`raulchavezdrouet@gmail.com`), no una dirección corporativa tipo `soporte@` o `privacidad@`. Esto es tal como está en el código en este momento — no una inferencia.

## 3. Inicio de sesión (verificado en `LoginScreen.tsx`)

El **método por defecto es un enlace de acceso por correo (magic link)**, marcado en la interfaz como "🔗 Enlace seguro" con una etiqueta "Recomendado". El botón de acceso con contraseña ("🔑 Contraseña") es una alternativa que hay que elegir explícitamente. Detalles reales:

- El enlace mágico usa `signInWithMagicLink`, con `shouldCreateUser=false` a nivel de Supabase Auth (ver `DOCUMENTO_FUNCIONALIDADES.md`), y un mensaje neutral: tanto si el correo existe como si no, la app responde "Si el correo ya está registrado, recibirás un enlace seguro. Si eres nuevo, completa el registro" — **no revela si una cuenta existe o no**, por diseño.
- Hay un enfriamiento (cooldown) de 60 segundos entre solicitudes de enlace, aplicado del lado del cliente.
- **"¿Olvidaste tu contraseña?"** dispara `supabase.auth.resetPasswordForEmail(...)`, que envía un correo con un enlace a `/reset-password` en el mismo dominio.
- La sesión se mantiene por el comportamiento estándar del SDK `@supabase/supabase-js` (JWT + refresh token); no hay lógica propia de expiración/refresco en el código revisado.

## 4. Panel principal / Dashboard (`/dashboard`, verificado en `DashboardScreen.tsx`)

Muestra: saludo con el nombre del usuario, una cita de sabiduría del Sensei (rotativa por día del mes, de un banco de frases local en `data/ciberDojo.ts`), un botón "Comenzar entrenamiento" que abre un modal de bienvenida antes de ir a `/dojos`, 4 tarjetas de estadística, una lista de "Próximas misiones" (katas activas reales, tomadas de la tabla `katas`, o si no hay ninguna, un catálogo local de respaldo), un bloque de "Historial de combate" (alertas activas reales de la tabla `alerts`, o 3 frases de ejemplo si no hay ninguna activa), un consejo fijo del maestro, y 4 insignias de kanji fijas ("logros desbloqueados").

**Hallazgos de precisión sobre este panel** (verificados leyendo el código, no interpretados):
- El encabezado del Dashboard dice literalmente **"CINTURÓN VERDE"** para **cualquier usuario**, sin importar su cinturón real — es texto fijo (`` `BIENVENIDO, ${nombre} · CINTURON VERDE` ``), no una lectura del perfil.
- De las 4 tarjetas de estadística, solo "XP TOTAL" muestra un valor real (del store local de cinturón/experiencia). "KATA HOY" siempre muestra "03", "RACHA" siempre muestra "05" y "RANKING" siempre muestra "#06" — son valores fijos en el código, no calculados.
- Las "insignias de logros desbloqueados" (4 kanji) son siempre las mismas 4, para cualquier usuario — no hay un sistema de logros real detrás.

## 5. Dojos y Katas (combate, verificado en `DojoDetailPage.tsx`, `DojoListPage.tsx`)

- `/dojos` lista los temas de entrenamiento (dojos).
- `/dojo/:id` abre la pantalla de combate de un dojo: presenta preguntas reales cargadas de la tabla `questions` (filtradas por el dojo, `active=true` y `audit_status='approved'`), en un formato de "combate" (barra de vida del guerrero vs. la amenaza) con retroalimentación tras cada respuesta.
- **Selector de personaje**: el usuario puede elegir su avatar de combate entre las imágenes disponibles (flechas/puntos), guardado en `localStorage` bajo la clave `ciberdojo_hero_index` — es una preferencia local del navegador, no se guarda en el perfil del servidor.
- Al completar un dojo se muestra una celebración y, según la implementación en `components/CyberBushido.tsx` (`KataRewardVideo`), un video de recompensa.

## 6. Exámenes de cinturón (`/kata/:code`, verificado en `KataExamPage.tsx`)

Los exámenes de ascenso de cinturón son katas especiales (tabla `katas`, sembradas en la migración 009 con contenido real sobre casos de ciberdelito en Ecuador). El mapeo real cinturón → examen (verificado también en `DojoDetailPage.tsx`):

| Cinturón actual | Examen para ascender |
|---|---|
| Blanco | `EXAM_BLANCO_AMARILLO` |
| Amarillo | `EXAM_AMARILLO_NARANJA` |
| Naranja | `EXAM_NARANJA_VERDE` |
| Verde | `EXAM_VERDE_AZUL` |
| Azul | `EXAM_AZUL_MARRON` |
| Marrón | `EXAM_MARRON_NEGRO` |

Cada examen es una serie de preguntas de opción múltiple con un término técnico explicado en lenguaje simple antes de cada pregunta (`term`/`term_explanation`). **El umbral de aprobación real es 75% de respuestas correctas** — se calcula igual en el cliente (para mostrar el resultado) y en el servidor, dentro de la Edge Function `complete-kata`, que es la que efectivamente decide si se otorga el ascenso (el cliente no puede falsificar una aprobación: el cinturón se actualiza en `users.belt` solo si el servidor confirma `passed=true`). Al aprobar, se reproduce un sonido de celebración y se muestra una animación de cinturón otorgado (`BeltAwardCelebration`).

## 7. Tabla de Honor / Ranking (`/ranking`, verificado en `LeaderboardPage.tsx`)

Ranking real, obtenido de la Edge Function `get-ranking`. Muestra rango, nombre, cinturón, XP total, katas completados, y el dominio de correo del usuario (`email_domain`) — **se excluyen del ranking las cuentas con proveedores de correo públicos** (Gmail, Hotmail, Outlook, Yahoo, iCloud, etc. — lista completa en la migración 014), de forma que solo compiten cuentas con correo corporativo/propio. El podio (top 3) se muestra con una disposición especial; el resto en una tabla. Si aún no hay datos, se muestra un mensaje invitando a completar katas — no se rellena con datos de ejemplo.

*Nota: existe en el código (`data/ciberDojo.ts`) un arreglo adicional de un ranking de ejemplo con nombres ficticios ("Akira Manta", "Lina Quito", etc.); se verificó que **ningún archivo del frontend lo importa ni lo usa** — es un dato huérfano, no algo que el usuario vea.*

## 8. Sensei IA (`/sensei`, verificado en `SenseiConsultPage.tsx`)

Chat con un asistente de IA. Mensaje de bienvenida real mostrado en pantalla: *"Soy el Sensei IA. Pregúntame sobre seguridad digital, ciberdelitos, mensajes falsos, contraseñas, verificación en dos pasos, archivos bloqueados por extorsión, privacidad, fraudes bancarios o conceptos que aparezcan en el dojo."* Cada pregunta se envía a la Edge Function `ask-sensei`; si esa llamada falla, la app tiene una función de respaldo local (`localSenseiAnswer`) que da una respuesta genérica sin IA para no dejar la conversación sin respuesta. Cada consulta puede marcarse como útil/no útil (retroalimentación), que se guarda en `sensei_consultations`.

## 9. Escáner de Vulnerabilidades (`/escaner`, componente `VulnScanner/`)

Pantalla no documentada en el manual anterior. Ofrece un diagnóstico de seguridad ("INSTASEG") con detección del sistema del visitante, progreso de escaneo y un reporte, apoyado en la Edge Function `vuln-scanner-ai` bajo un patrón de doble consulta (un rol generador, un rol auditor, ambos contra la misma función). Ver `ARQUITECTURA_CYBER_DOJO.md` sección 5 para el detalle de qué archivos la invocan.

## 10. Perfil (`/perfil`, verificado en `ProfilePage.tsx`)

Tarjeta con nombre, tipo de negocio, cinturón actual (insignia grande animada), barra de XP (máximo mostrado: 5000), y el **camino del cinturón completo, con los umbrales reales de XP** (`data/ciberDojo.ts`):

| Cinturón | XP requerido |
|---|---|
| Blanco | 0 |
| Amarillo | 600 |
| Naranja | 1300 |
| Verde | 2200 |
| Azul | 3400 |
| Marrón | 6000 |
| Negro | 9000 |

Esta es la tabla correcta y consistente con el esquema de base de datos vigente (7 cinturones) — a diferencia de la tabla de progresión que todavía aparece en el panel "Resumen" del admin, que no se actualizó (ver `MANUAL_ADMINISTRADOR.md`).

## 11. Ventanas emergentes de propaganda

Componente `CampaignAdOverlay` (dentro de `components/CyberBushido.tsx`), conectado de verdad a Supabase: al cargar, pide la siguiente campaña elegible para el usuario vía la función `get_next_campaign_for_user('inicio')` (ver `BASE_DE_DATOS.md`) y, al mostrarla, registra la impresión insertando una fila en `campaign_impressions`. El contenido (imagen, mensaje, enlace) es el que un administrador configuró en el panel "Propaganda" — ver `MANUAL_ADMINISTRADOR.md` sección 12 para el detalle de cómo se crea una campaña y cómo se decide a quién se le muestra (segmentación por sector).

## 12. Instalación como app (PWA)

El componente `PWAInstallPrompt` ofrece instalar Ciber Dojo como aplicación en el dispositivo (Progressive Web App), usando el flujo estándar del navegador (`beforeinstallprompt`).

## 13. Correcciones respecto al manual anterior (para que quede explícito)

Lo siguiente aparecía en la versión anterior de este manual y **no se encontró evidencia de ello en el código fuente actual** — no se afirma que nunca haya existido, solo que no existe hoy:

- Certificados descargables en PDF al completar un cinturón.
- Sistema de rachas diarias con puntos de bonificación (+5/día) y niveles ("Iniciado", "Comprometido", "Dedicado", "Maestro").
- Tabla de puntos por actividad con cifras específicas (25/50/100 puntos por kata según dificultad, medallas en 500/1000/2500/5000/10000 puntos) — los puntos reales por kata están en `katas.points_reward`, definidos individualmente por kata en la base de datos, no en una tabla fija de reglas.
- Datos de contacto: correo `support@cyberdojo.ec`, teléfono `+593 2 1234567`, web `www.cyberdojo.ec`, y cuentas de Facebook/LinkedIn/Instagram — ninguno aparece en el código fuente revisado.
- El camino de 8 cinturones con Morado y Rojo como cinturones separados (retirado desde la migración 017 de la base de datos).

---

*Documento reescrito el 2026-09-08 a partir de la lectura directa de `frontend/src/screens/LoginScreen.tsx`, `DashboardScreen.tsx`, `DojoDetailPage.tsx`, `KataExamPage.tsx`, `LeaderboardPage.tsx`, `SenseiConsultPage.tsx`, `ProfilePage.tsx`, `frontend/src/components/CyberBushido.tsx` y `frontend/src/data/ciberDojo.ts`. Reemplaza la versión anterior, que contenía funcionalidades inventadas y documentaba un sistema de cinturones ya retirado.*