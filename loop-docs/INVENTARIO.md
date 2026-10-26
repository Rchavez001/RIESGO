# Inventario de `shield-ecuador-app/docs/` — 2026-10-24

Solo lectura: ningún documento se editó para hacer este inventario. 13 archivos (10 `.md`, 1 `.sql`,
1 `.pdf`, 1 `.png`). **Ninguno de los 13 es un documento controlado** (ISO 27001, legal o de
política con tabla de control de versiones) — los documentos de evaluación ISO 42001 reales
(`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.*`, `ISO_CIBERDOJO_INVENTARIO.csv`) **no existen en esta
rama**: viven solo en la rama `docs/iso-y-privacidad`, sin fusionar a `feature/consentimiento-lopdp`
(confirmado: `find`/`ls` sobre este worktree no los encuentra). Primer hallazgo de alcance, antes de
cualquier otra cosa: si "toda la documentación" debe incluir esos documentos controlados, hace falta
fusionar o leer esa rama aparte — no se hizo aquí, fuera del alcance de esta Fase 0.

Metodología: fecha de último commit (`git log -1 --date=short`), lectura completa o por secciones,
y contraste puntual contra el código real (rutas citadas abajo) cuando el documento hace afirmaciones
verificables. "Público" es mi mejor lectura del contenido y el tono, no una clasificación declarada
por el propio documento (ninguno de los 13 declara su público explícitamente).

---

## 1. `AI_HANDOFF_CYBER_DOJO.md`

- **Propósito / público:** documento maestro de traspaso para que otra persona o IA continúe el
  desarrollo sin partir de cero. Público: desarrollador / IA que vaya a tocar código.
- **Último commit:** 2026-09-09 (contenido fechado 2026-08-27 en su propio encabezado).
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:**
  - Dice "22 migraciones (001 a 022)" (línea 20); hoy hay migraciones hasta `084` (`supabase/migrations/084_consent_records_legacy_ip_hmac_nullable.sql`).
  - Dice "7 Edge Functions conectadas... y 7 auxiliares" (línea 21); hoy `supabase/functions/` tiene más de 30 carpetas, incluidas las 7 del módulo de consentimiento (`admin-consent`, `get-consent-notice`, `submit-consent`, `update-my-consent`, `request-data-subject-right`, `accept-guest-notice`, y `secure-register-user` modificada).
  - Rutas de cinturón "white -> yellow -> orange -> green -> blue -> purple -> red -> black" (línea 403, 8 cinturones); la migración `017` (ver `BASE_DE_DATOS.md` sección 1) fusionó `purple`/`red` en `brown` desde entonces — la ruta real es 7 cinturones (`white, yellow, orange, green, blue, brown, black`).
  - Lista de rutas del frontend (líneas 141-164) no incluye `/registro`, `/privacidad`, `/campeonato`, `/campeonato/combate/:matchId` (todas ya en `shield-ecuador-app/frontend/src/App.tsx`).
  - No menciona el módulo de consentimiento, `admin_roles`, TOTP de admin, ni ninguna de las 11 tablas de `supabase/migrations/073`-`084`.
- **Qué falta documentar:** todo el módulo de consentimiento informado LOPDP (D-01 a D-16), el modo invitado, el panel admin de consentimiento, el rediseño cinematográfico y el modo invitado en el frontend (más allá de las rutas).
- **Propuesta:** ⛔ **decisión humana** — fusionar con `ARQUITECTURA_CYBER_DOJO.md`/`DOCUMENTO_FUNCIONALIDADES.md` (ambos en la raíz de `shield-ecuador-app/`, fuera de `docs/`, y con alcance muy solapado: ambos documentan arquitectura/funcionalidades reales) o archivar y reemplazar por un documento nuevo más corto. Reescribirlo entero en su lugar actual sin decidir esto sería duplicar trabajo.

## 2. `APLICACION_CINEMATICA_LOCAL.md`

- **Propósito / público:** instrucciones para levantar un servidor de revisión local (`:3001`) del
  rediseño cinematográfico antes de publicarlo. Público: desarrollador/QA.
- **Último commit:** 2026-09-10.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** la tabla de rutas (línea 13) dice `/practica` =
  "Demostración sin cuenta; avance independiente guardado en este navegador". Hoy
  `shield-ecuador-app/frontend/src/App.tsx` tiene `<Route path="/practica" element={<Navigate to="/dojos" replace />} />`
  — la ruta redirige, no muestra ninguna demostración (el archivo `PracticePage.tsx` que describía
  se borró al fusionar `wip/ux-redesign`, commit `c946441`). No menciona `/registro` ni `/privacidad`.
- **Qué falta documentar:** nada nuevo que no esté ya cubierto — es un documento de un momento
  puntual (la revisión previa a publicar), y ese rediseño **ya está en producción** (confirmado en
  conversaciones previas de este mismo trabajo: "Producción hoy corre ese rediseño").
- **Propuesta:** ⛔ **decisión humana** — archivar (cumplió su propósito de revisión puntual y el
  dato de `/practica` ya quedó obsoleto) o actualizar y re-etiquetar como "cómo levantar una
  revisión local de un rediseño futuro", generalizando el procedimiento.

## 3. `BANCO_Y_APRENDIZAJE_CIBERDOJO.md`

- **Propósito / público:** registro de la publicación del banco de 700 preguntas/300 casos y su
  despliegue a producción (revisión `cyberdojo-00057-gip`). Público: desarrollador/equipo de
  contenido, como acta de un release puntual.
- **Último commit:** 2026-09-09.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ninguna contradicción de contenido pedagógico
  (7 dojos, 700/300, 30 preguntas por dojo, examen de 5 casos con 4 aciertos — todo consistente con
  `BASE_DE_DATOS.md` y el código actual de `learning_dojos`/`learning_progress`). Sí está desactualizada
  la revisión de Cloud Run citada (`cyberdojo-00057-gip`): hubo despliegues posteriores (el merge de
  `wip/ux-redesign`, el módulo de consentimiento, etc.) que no están en este documento — no es un
  error, es que el documento nunca pretendió seguir actualizándose con cada deploy.
- **Qué falta documentar:** nada de este alcance puntual; el estado actual del banco de preguntas
  en general no tiene un documento "vivo" aparte de este acta histórica.
- **Propuesta:** dejar igual (es un acta fechada y correcta para su fecha). Si se quiere un estado
  "vivo" del banco de preguntas, eso es un documento nuevo, no una reescritura de este.

## 4. `DIRECCION_VISUAL_REFERENCIAS.md`

- **Propósito / público:** propuesta de dirección de arte para el rediseño cinematográfico, a partir
  de material de referencia (video del sensei, arte de Kira). Público: diseño/dirección de producto.
- **Último commit:** 2026-09-10.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ninguna contradicción directa — es una propuesta
  ("esta propuesta no modifica la aplicación publicada", línea 3), y el rediseño que propone ya se
  implementó (mismo caso que el documento 2).
- **Qué falta documentar:** nada; es una propuesta de diseño ya ejecutada.
- **Propuesta:** ⛔ **decisión humana** — archivar (cumplió su propósito: el encargo de
  implementación de su última sección ya está hecho) o dejar como registro de las decisiones de
  dirección de arte.

## 5. `FICHA_DOGGOTEKA.md`

- **Propósito / público:** ficha de personaje/diseño de la mascota DoggoTeka. Público: diseño de
  contenido/narrativa, y referencia para quien mantenga `/personajes/doggoteka`.
- **Último commit:** 2026-09-10.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ninguna encontrada — el companion DoggoTeka, la
  ruta `/personajes/doggoteka` y el archivo de origen (`imagen/56d85ecf-e627-4bce-8bdd-afe672b9bf45.webp`)
  siguen vigentes (no se verificó la existencia del archivo de imagen en sí, solo que la ruta y el
  concepto siguen en el código — `DojoCompanion.tsx`/`CyberBushido.tsx`).
- **Qué falta documentar:** nada de su alcance.
- **Propuesta:** dejar igual.

## 6-7. `Ficha-DoggoTeka.pdf` / `Ficha-DoggoTeka.png`

- **Propósito / público:** versión imprimible (PDF) y captura (PNG) de la ficha del documento 5,
  generadas para impresión desde el navegador. Mismo público.
- **Último commit:** 2026-09-10.
- **Documento controlado:** no.
- **Contradice el código actual:** no aplica (son activos binarios, no afirmaciones verificables).
- **Qué falta:** nada.
- **Propuesta:** dejar igual — ligados 1:1 al documento 5; si ese se actualiza con un cambio visual,
  regenerar estos dos.

## 8. `MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md`

- **Propósito / público:** manual de seguridad de la implementación completa (frontend, Supabase,
  Central Admin). Público: auditor de seguridad / desarrollador.
- **Último commit:** 2026-08-27 (encabezado dice "Fecha de revisión: 2026-06-23" — más antiguo que
  su propio commit, probablemente escrito antes y commiteado después).
- **Documento controlado:** no (no tiene tabla de control de versiones ni aprobación formal, a
  diferencia de lo que pediría un documento ISO real).
- **Contradice el código actual, con evidencia:** no se encontró una contradicción directa en lo que
  cubre (la autenticación Basic Auth de `central-admin-app` para T-Pot/dojos/campañas sigue vigente,
  confirmado en `central-admin-app/server.js`). El problema es de **omisión**, no de error: no
  menciona que, desde el módulo de consentimiento, el panel tiene una vía de autenticación distinta
  y más fuerte (Supabase Auth individual + TOTP, `D-01` en `loop-consentimiento/DECISIONS.md`,
  implementado en `central-admin-app/app.js` — ver `privacyLoginForm`/`privacyEnroll` citados en
  `MANUAL_ADMINISTRADOR.md` sección 14). Un lector de este manual hoy concluiría que *todo* el panel
  usa Basic Auth compartida, lo que ya no es cierto para las rutas de consentimiento.
- **Qué falta documentar:** el modelo de seguridad del módulo de consentimiento (identidad
  individual + TOTP, roles `admin_roles`, cifrado `_shared/crypto.ts`, cadenas de hash) — hoy vive
  en `SECURITY_PRIVACY.md` (raíz), no aquí, y este documento no lo referencia.
- **Propuesta:** actualizar — añadir una sección que aclare la excepción del módulo de
  consentimiento a la autenticación Basic Auth general, con referencia a `SECURITY_PRIVACY.md`
  (sin duplicar su contenido).

## 9. `MANUAL_TECNICO_SENSOR_TPOT.md`

- **Propósito / público:** manual técnico del sensor T-Pot (honeypot) y su propósito. Público:
  desarrollador/seguridad que opere la integración T-Pot.
- **Último commit:** 2026-08-27 (mismo encabezado "revisión 2026-06-23" que el documento 8).
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ninguna — verificado que
  `central-admin-app/server.js`/`app.js`/`tpotService.js` siguen implementando exactamente lo
  descrito (endpoints `/api/admin/tpot/*`, variable `TPOT_ELASTIC_URL`, modo demo si falta).
- **Qué falta documentar:** nada de su alcance (el módulo de consentimiento es un dominio
  completamente distinto).
- **Propuesta:** dejar igual.

## 10. `SUPABASE_VERIFICATION_QUERIES.sql`

- **Propósito / público:** consultas de solo lectura para el SQL Editor de Supabase, para confirmar
  que la base viva coincide con el repositorio. Público: desarrollador/quien verifique un despliegue.
- **Último commit:** 2026-08-27.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** la lista de tablas esperadas (líneas 12-41, 20
  tablas) **falta más de la mitad del esquema real**. No incluye: `learning_dojos`,
  `learning_progress`, `learning_items`, `learning_attempts` (migración `026` en adelante),
  `central_admin_campaign_settings`, `central_admin_campaign_audit`, `campaign_impressions`,
  `app_entry_log` (`018`/`020`/`021`), y **ninguna de las 11 tablas del módulo de consentimiento**
  (`consent_documents`, `consent_records`, `admin_audit_log`, `data_subject_requests` y las demás
  de `073`-`084`, ver `BASE_DE_DATOS.md` sección 12). Una verificación que use este archivo hoy
  confirmaría solo una fracción del esquema real.
- **Qué falta documentar:** las tablas de aprendizaje, campañas e invitados, y el módulo completo
  de consentimiento.
- **Propuesta:** actualizar — es la de mayor impacto práctico de las 13 (es una herramienta de
  verificación, no solo texto descriptivo; su desactualización puede dar una falsa sensación de
  que "todo coincide" cuando en realidad no se comprobó buena parte del esquema).

## 11. `TPOT_AI_AGENT.md`

- **Propósito / público:** especificación de los dos agentes de IA de T-Pot (`TpotThreatAnalysisAgent`,
  `TpotAiAuditAgent`): qué sanitizan, qué producen, cómo se audita. Público: desarrollador/seguridad.
- **Último commit:** 2026-08-27.
- **Documento controlado:** no.
- **Contradice el código actual:** no verificado línea por línea contra el código de los agentes en
  sí (fuera del alcance de esta Fase 0 por tiempo); la arquitectura general (sanitización → análisis
  → auditoría → aprobación) coincide con lo ya confirmado en el documento 12/13.
- **Qué falta documentar:** nada de su alcance.
- **Propuesta:** dejar igual (marcar `[VERIFICAR]` si una iteración del loop quiere confirmar el
  JSON de salida exacto contra el código real de los agentes).

## 12. `TPOT_DEPLOYMENT_CHECKLIST.md`

- **Propósito / público:** checklist de despliegue seguro de un sensor T-Pot (red, secretos, Cloud
  Run, pruebas, operación). Público: quien despliegue o mantenga el sensor.
- **Último commit:** 2026-08-27.
- **Documento controlado:** no.
- **Contradice el código actual:** ninguna encontrada; coincide con las variables de entorno y
  endpoints confirmados en el documento 1 (T-Pot, no consentimiento).
- **Qué falta:** nada de su alcance.
- **Propuesta:** dejar igual.

## 13. `TPOT_INTEGRATION.md`

- **Propósito / público:** arquitectura completa de la integración T-Pot (diagrama de flujo,
  variables de entorno, endpoints, seguridad, uso de la UI, troubleshooting). Público: desarrollador.
- **Último commit:** 2026-08-27.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ninguna — los endpoints `/api/admin/tpot/*`
  (líneas 60-72) se confirmaron presentes en `central-admin-app/app.js`/`server.js`;
  `TPOT_ELASTIC_URL`/modo demo confirmado en `server.js` línea 389.
- **Qué falta:** nada de su alcance.
- **Propuesta:** dejar igual.

---

# Ampliación de alcance — 2026-10-26

El usuario aprobó el inventario de arriba y amplió el alcance del loop en tres sentidos: (a) incluir
los `.md` de la raíz de `shield-ecuador-app/` (no solo `shield-ecuador-app/docs/`); (b) fusionar la
rama `docs/iso-y-privacidad` a `docs/actualizacion` e inventariar lo que trae; (c) tratar los
documentos de evaluación/auditoría de esa fusión como documentos controlados. La fusión se hizo sin
conflictos (`git merge docs/iso-y-privacidad --no-ff`, commit de fusión en esta rama). Metodología
igual que arriba: fecha de commit, contraste contra código real cuando el documento hace afirmaciones
verificables.

## 14. `ARQUITECTURA_CYBER_DOJO.md` (raíz)

- **Propósito / público:** arquitectura técnica completa (capas, base de datos, Edge Functions,
  paneles admin). Público: desarrollador.
- **Último commit:** 2026-09-09.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** dice "14 Edge Functions" (líneas 29, 82, 121, 144).
  `supabase/functions/` tiene hoy 33 carpetas (sin contar `_shared`) — confirmado con
  `ls shield-ecuador-app/supabase/functions/`. La sección 5 ("Las 14 Edge Functions y quién las llama
  realmente") no incluye ninguna de las funciones del módulo de consentimiento ni las del agente de
  noticias/campeonato/centro de seguridad agregadas después. Línea 165 afirma "ninguna de las 14
  funciones se invoca desde `central-admin-app`" — ya no es cierto (el panel de consentimiento sí
  llama `admin-consent` con el JWT del admin, ver `MANUAL_ADMINISTRADOR.md` sección 14).
- **Qué falta documentar:** el módulo de consentimiento, el centro de seguridad, el campeonato, el
  agente de noticias y el banco de aprendizaje real — ninguno existía cuando se escribió.
- **Propuesta:** actualizar (prioridad alta dentro de este grupo: la sección 5 completa necesita
  reescribirse, no solo un parche puntual).

## 15. `BASE_DE_DATOS.md` (raíz)

- **Propósito / público:** esquema completo de la base de datos, tabla por tabla. Público: desarrollador.
- **Último commit:** 2026-10-23 (T98 — ya incluye la sección 12 del módulo de consentimiento, 11 tablas `073`-`084`, confirmado en la conversación previa de este mismo trabajo).
- **Documento controlado:** no.
- **Contradice el código actual:** ninguna encontrada — es la fuente de verdad ya vigente para el esquema.
- **Qué falta:** nada de su alcance.
- **Propuesta:** dejar igual.

## 16. `DOCUMENTO_FUNCIONALIDADES.md` (raíz)

- **Propósito / público:** resumen de requisitos funcionales/no funcionales, con trazabilidad a los
  documentos especializados. Público: product owner / nueva persona que se incorpore.
- **Último commit:** 2026-09-09. Su propio pie de página dice: *"Documento reescrito el 2026-09-08...
  no cubría las migraciones 016-021 ni el panel de administración"* — es decir, ya reconoce su propio
  corte temporal.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** línea 119 dice "Migraciones... numeradas (`001` a
  `021`)"; hoy hay 82 archivos de migración, hasta `084`. Sección 2.6 ("Cumplimiento y privacidad",
  líneas 122-125) tiene una sola línea genérica de consentimiento pre-módulo (sin re-consentimiento,
  modo invitado, derechos ARCO ejercibles desde un panel, TOTP) — no refleja el módulo LOPDP completo
  (D-01 a D-16).
- **Qué falta documentar:** módulo de consentimiento, modo invitado, centro de seguridad, campeonato,
  banco de aprendizaje real, agente de noticias — ninguno existía en 016-021.
- **Propuesta:** actualizar.

## 17. `GUIA_LEVANTAMIENTO_PROYECTO.md` (raíz)

- **Propósito / público:** guía paso a paso para levantar el proyecto desde cero (migraciones, Edge
  Functions, variables de entorno). Público: desarrollador nuevo / quien reconstruya el entorno.
- **Último commit:** 2026-10-23 (T98) — **pero el commit no corrigió esto:** sigue diciendo "21
  migraciones, `001` a `021` a la fecha de esta revisión" (línea 22) y "14 Edge Functions de Supabase"
  (línea 23), y la lista de "Orden esperado" (línea 211) tampoco llega a la `082`. Esto confirma que
  la fecha de commit de un archivo no basta para asumirlo vigente — el T98 tocó otra sección de este
  mismo archivo sin actualizar estas dos líneas.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** ver arriba (21 vs. 82 migraciones, 14 vs. 33 Edge
  Functions). No menciona las variables de entorno nuevas del módulo de consentimiento (claves de
  cifrado, secreto TOTP, HMAC de IP).
- **Qué falta documentar:** pasos de arranque del módulo de consentimiento (variables de entorno,
  migraciones `073`-`084`, enrolamiento TOTP del primer admin).
- **Propuesta:** actualizar.

## 18. `MANUAL_ADMINISTRADOR.md` (raíz)

- **Propósito / público:** manual de las secciones del panel `central-admin-app`. Público: quien
  administre la consola (hoy, el club Phycom).
- **Último commit:** 2026-10-23 (T98.b) — incluye una sección 14 completa y detallada sobre el panel
  de consentimiento (TOTP, roles `privacy_editor`/`privacy_admin`/`privacy_auditor`, reconsentimiento,
  evidencia, exportación de expediente), verificada línea por línea contra `central-admin-app/app.js`
  e `index.html`.
- **Documento controlado:** no.
- **Contradice el código actual:** ninguna encontrada.
- **Qué falta:** nada de su alcance propio. **Hallazgo de solapamiento** (no es una contradicción,
  es una duplicación de fuente): la fusión de `docs/iso-y-privacidad` trajo `vault/Manual del
  administrador.md`, que apunta a un tercer documento, `manual-central-admin.html` (raíz, HTML
  autocontenido, 565 líneas), como "el manual completo de las 15 secciones". Hoy hay **tres**
  documentos que pretenden ser "el manual del administrador" (este archivo, el HTML, y el stub del
  vault) sin que ninguno diga explícitamente cuál es la fuente de verdad. Registrado como decisión
  abierta `DOC-05` en `DECISIONS.md` — no se resuelve en esta Fase 0.
- **Propuesta:** dejar igual (su propio contenido está correcto); resolver el solapamiento con
  `manual-central-admin.html` es aparte (`DOC-05`).

## 19. `MANUAL_USUARIO_CYBER_DOJO.md` (raíz)

- **Propósito / público:** manual de usuario final, pantalla por pantalla, con texto real citado de
  la UI. Público: usuario final / quien capacite a usuarios.
- **Último commit:** 2026-09-09.
- **Documento controlado:** no.
- **Contradice el código actual:** no se encontró una afirmación falsa en lo que cubre (es cuidadoso:
  p. ej. aclara que el correo de contacto ARCO es personal, no corporativo, "tal como está en el
  código, no una inferencia"). El problema es de **omisión completa**: no menciona el aviso de
  re-consentimiento al iniciar sesión (`T20`/REQ-09), el modo invitado (`GuestNoticeModal`, tope de 10
  preguntas), ni la página `/privacidad` donde el usuario ejerce sus derechos ARCO — temas que hoy
  son parte central de la experiencia de un usuario nuevo.
- **Qué falta documentar:** re-consentimiento, modo invitado, página `/privacidad` desde la
  perspectiva del usuario final.
- **Propuesta:** actualizar.

## 20. `SECURITY_PRIVACY.md` (raíz)

- **Propósito / público:** documento de seguridad y privacidad de la implementación. Público:
  auditor/desarrollador de seguridad.
- **Último commit:** 2026-10-20 (T98.a) — 5 menciones de "consentimiento", ya cubre el módulo LOPDP.
- **Documento controlado:** no (no tiene tabla de control de versiones; podría considerarse candidato
  a volverse uno, pero esa es una decisión de gobierno de documentos, no de esta Fase 0).
- **Contradice el código actual:** ninguna encontrada.
- **Qué falta:** nada de su alcance detectado en esta revisión rápida.
- **Propuesta:** dejar igual.

## 21. `SETUP.md` (raíz)

- **Propósito / público:** guía corta de instalación/arranque local. Público: desarrollador nuevo.
- **Último commit:** 2026-09-09.
- **Documento controlado:** no.
- **Contradice el código actual, con evidencia:** línea 25 dice "21 migraciones a la fecha de esta
  revisión" y lista hasta la `021` (línea 30); hoy hay 82, hasta la `084`. No menciona ninguna
  variable de entorno del módulo de consentimiento.
- **Qué falta documentar:** variables de entorno y migraciones del módulo de consentimiento.
- **Propuesta:** actualizar.

## 22. `README-centro-de-seguridad.md` (raíz, nuevo por la fusión)

- **Propósito / público:** runbook técnico del submódulo "Centro de Seguridad" del panel admin
  (requisitos RF-01 a RF-08 y dónde vive cada pieza). Público: desarrollador/seguridad.
- **Último commit:** el de la fusión (contenido trae su propio corte temporal de la rama
  `docs/iso-y-privacidad`, sin fecha explícita en el encabezado).
- **Documento controlado:** no (es un runbook técnico, no una evaluación formal).
- **Contradice el código actual:** no verificado línea por línea en esta Fase 0 (son 8 requisitos con
  rutas de código citadas; verificarlos uno por uno es trabajo de iteración, no de inventario).
- **Qué falta:** verificación puntual de las rutas citadas en la tabla RF-01..RF-08.
- **Propuesta:** dejar igual por ahora; si una iteración encuentra una ruta que ya no existe, se marca
  `[VERIFICAR]` o se corrige puntualmente.

## 23. `manual-central-admin.html` (raíz, nuevo por la fusión) — ⚠️ alcance ambiguo

- **Propósito / público:** manual visual completo (HTML autocontenido, con estilos) de las 15
  secciones de `central-admin-app`. Público: club Phycom / quien administre la consola.
- **No es un `.md`.** El alcance ampliado que aprobó el usuario dice literalmente "los `.md` de la
  raíz de `shield-ecuador-app`" — este archivo es `.html`. Es claramente documentación (no código:
  no se ejecuta, es una página estática de referencia), pero no calza en la letra de la instrucción.
  Registrado como decisión abierta `DOC-04` en `DECISIONS.md`: ¿se incluye en el alcance del loop
  (puede editarse/reemplazarse en iteraciones futuras) o se deja fuera (solo lectura, como los PDF/PNG)?
- **Propuesta:** sin decidir (`DOC-04`). Mientras no se decida, **el loop no lo toca** (el `gates.sh`
  de alcance no lo incluye en la lista de rutas permitidas).

## 24-30. Documentos controlados de evaluación/auditoría (fusión de `docs/iso-y-privacidad`)

Siete artefactos, todos en `shield-ecuador-app/docs/`, tratados como **documentos controlados**
(evaluación/auditoría formal con fecha y versión declaradas). Por regla dura del loop, ninguno se
reescribe directamente: cualquier cambio futuro debe ir como propuesta nueva en `loop-docs/propuestas/`,
con su propia tabla de control de versiones y marcada "pendiente de aprobación".

- **`EVALUACION_ISO_42001_TR_24368_CIBERDOJO.md` / `.html` / `.docx`** — mismo documento en tres
  formatos (428 líneas la versión `.md`). Encabezado declara **Fecha: 26 de septiembre de 2026 ·
  Versión: 1.0 · Estado: diagnóstico técnico para revisión de dirección**. Dictamen: alineación
  parcial con ISO/IEC 42001 e ISO/IEC TR 24368, no conformidad integral. El propio documento aclara
  que sus prioridades y responsables "son propuestas; no constituyen compromisos aprobados" — ya se
  declara a sí mismo como no definitivo.
  - **No se verificó línea por línea en esta Fase 0** (es un informe de 428 líneas con hallazgos
    técnicos puntuales; confirmarlos todos es trabajo de iteración, no de inventario).
  - **Propuesta:** dejar igual (documento controlado, versión 1.0 vigente); cualquier actualización
    futura (p. ej. si se cierran brechas que el informe señala) va como propuesta nueva versionada.
- **`ISO_CIBERDOJO_INVENTARIO.csv`** — inventario de archivos revisados para esa evaluación (327
  filas: archivo, bytes, sha256, alcance de revisión). Es un artefacto de evidencia, no un texto
  descriptivo — quedará desactualizado en cuanto cambie cualquier archivo que liste, lo cual es
  normal y esperado para este tipo de documento (es una foto fija del momento de la evaluación).
  - **Propuesta:** dejar igual (es evidencia histórica de la evaluación v1.0, no un documento vivo).
- **`Informe_Seguridad_CiberDojo_.pdf`, `Informe_Profesional_Seguridad_CiberDojo_2026.pdf`,
  `"Informe de Auditoría de Seguridad - CiberDojo.pdf"`, `"Análisis de vulnerabilidades — CiberDojo.pdf"`,
  `"Cumplimiento OWASP Top 10 — CiberDojo.pdf"`, `OWASP_Top10_Review_Paper_EDITED.docx`** — seis
  informes de seguridad/auditoría en PDF/DOCX (binarios, no editables por el loop en ningún caso).
  - **Propuesta:** dejar igual — son entregables finales de una revisión puntual; una actualización
    implicaría un informe nuevo, no una edición del existente.

## 31. `shield-ecuador-app/vault/` — notas de Obsidian (8 archivos, fusión de `docs/iso-y-privacidad`)

- **Propósito / público:** base de conocimiento interna del club (`Índice.md`,
  `Arquitectura/Visión general.md`, `Arquitectura/Autenticación y modo invitado.md`,
  `Decisiones/Registro de decisiones.md`, `Manual del administrador.md` (stub, ver hallazgo del
  documento 18), `Módulos/Agente de noticias.md`, `Módulos/Campeonato.md`, `Módulos/Centro de
  Seguridad.md`). Público: desarrollador del club Phycom, para no repetir investigación ya hecha.
- **Último commit:** el de la fusión; contenido interno referencia decisiones de septiembre 2026
  (modo invitado por sesión anónima, 17 de septiembre).
- **Documentos controlados:** no — son notas informales de orientación, no evaluaciones formales.
- **Contradice el código actual:** no se encontró ninguna contradicción en la revisión rápida — de
  hecho, estas notas están **más al día que varios documentos "oficiales"** de la raíz (mencionan el
  fallback OTP de login, el modo invitado vía sesión anónima, el campeonato con límite de tiempo
  verificado en servidor — todo vigente).
- **Qué falta:** nada evidente; no cubren el módulo de consentimiento LOPDP (anterior a su fecha).
- **Propuesta:** dejar igual. Si se usan como fuente para `GUIA_OPERACION_CLUB.md` (documento nuevo
  pedido por el usuario), citarlas como referencia en vez de duplicar su contenido.

## 32. `shield-ecuador-app/scripts/export_iso_review.py` — fuera de alcance (no es documentación)

- Script Python usado para generar el inventario/evidencia de la evaluación ISO (lee archivos, calcula
  hashes, exporta CSV/HTML). Es **código**, no documentación: el `gates.sh` del loop no lo incluye en
  su lista de rutas permitidas y ninguna tarea de este loop debe tocarlo. Mencionado aquí solo para
  que quede registrado que la fusión lo trajo.

---

## Resumen de propuestas

| # | Documento | Propuesta |
|---|---|---|
| 1 | `AI_HANDOFF_CYBER_DOJO.md` | ⛔ fusionar/archivar (decisión humana) |
| 2 | `APLICACION_CINEMATICA_LOCAL.md` | ⛔ archivar o generalizar (decisión humana) |
| 3 | `BANCO_Y_APRENDIZAJE_CIBERDOJO.md` | Dejar igual |
| 4 | `DIRECCION_VISUAL_REFERENCIAS.md` | ⛔ archivar (decisión humana) |
| 5 | `FICHA_DOGGOTEKA.md` | Dejar igual |
| 6 | `Ficha-DoggoTeka.pdf` | Dejar igual |
| 7 | `Ficha-DoggoTeka.png` | Dejar igual |
| 8 | `MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md` | Actualizar |
| 9 | `MANUAL_TECNICO_SENSOR_TPOT.md` | Dejar igual |
| 10 | `SUPABASE_VERIFICATION_QUERIES.sql` | Actualizar |
| 11 | `TPOT_AI_AGENT.md` | Dejar igual |
| 12 | `TPOT_DEPLOYMENT_CHECKLIST.md` | Dejar igual |
| 13 | `TPOT_INTEGRATION.md` | Dejar igual |
| 14 | `ARQUITECTURA_CYBER_DOJO.md` (raíz) | Actualizar |
| 15 | `BASE_DE_DATOS.md` (raíz) | Dejar igual |
| 16 | `DOCUMENTO_FUNCIONALIDADES.md` (raíz) | Actualizar |
| 17 | `GUIA_LEVANTAMIENTO_PROYECTO.md` (raíz) | Actualizar |
| 18 | `MANUAL_ADMINISTRADOR.md` (raíz) | Dejar igual (ver solapamiento `DOC-05`) |
| 19 | `MANUAL_USUARIO_CYBER_DOJO.md` (raíz) | Actualizar |
| 20 | `SECURITY_PRIVACY.md` (raíz) | Dejar igual |
| 21 | `SETUP.md` (raíz) | Actualizar |
| 22 | `README-centro-de-seguridad.md` (raíz) | Dejar igual (verificación puntual pendiente) |
| 23 | `manual-central-admin.html` (raíz) | ⚠️ alcance sin decidir (`DOC-04`) |
| 24-30 | Evaluación ISO 42001/TR 24368, inventario CSV, 6 informes PDF/DOCX | Documentos controlados — dejar igual, cambios futuros solo como propuesta versionada |
| 31 | `vault/` (8 notas) | Dejar igual |
| 32 | `scripts/export_iso_review.py` | Fuera de alcance (código, no documentación) |

## Documentos que faltan y deberían existir

1. **Reemplazo del documento 1** — **decidido por el usuario (2026-10-26):** actualizar
   `AI_HANDOFF_CYBER_DOJO.md` como documento de traspaso **breve**, que enlace a los documentos
   especializados en vez de repetirlos; servirá para capacitar al club Phycom. Ver `DECISIONS.md`
   `DOC-01` (decidida) y `loop-docs/TASKS.md`.
2. **Doc técnico del modo invitado** — **decidido:** nuevo `shield-ecuador-app/docs/MODO_INVITADO.md`.
3. **Verificación SQL actualizada** — **decidido:** primera tarea del backlog (mayor impacto práctico).
4. **Nota sobre `docs/iso-y-privacidad`** — **resuelto por fusión** (2026-10-26): la rama ya se
   fusionó a `docs/actualizacion`; los documentos 24-31 son el resultado. Ya no falta una nota sobre
   una rama separada — en su lugar, el nuevo `README.md` debe indexarlos como documentos controlados.
5. **Índice general de toda la documentación** — **decidido:** nuevo índice (ver `DECISIONS.md`
   para la ambigüedad sobre su ubicación exacta: no existe hoy ningún `README.md` en la raíz de
   `shield-ecuador-app/`, solo `README-centro-de-seguridad.md`, que es de un submódulo específico).
6. **Guía de operación para el club Phycom** — **decidido:** nuevo
   `shield-ecuador-app/docs/GUIA_OPERACION_CLUB.md` (qué hace cada parte, cómo se despliega, qué
   revisar a diario) — puede apoyarse en `vault/` (documento 31) como fuente, sin duplicarla.

---

*Inventario generado el 2026-10-24 (13 archivos de `shield-ecuador-app/docs/`) y ampliado el
2026-10-26 (8 `.md` de la raíz de `shield-ecuador-app/` + fusión de `docs/iso-y-privacidad`: 2
archivos nuevos en la raíz, 7 documentos controlados, 8 notas de vault, 1 script fuera de alcance),
en la rama `docs/actualizacion` (worktree `C:\Users\aps-ecuador\Riesgo-docs`). Contraste puntual
contra `App.tsx`, `central-admin-app/*.js`, `BASE_DE_DATOS.md` y `supabase/migrations/` (82 archivos,
hasta `084`) y `supabase/functions/` (33 carpetas sin contar `_shared`). Ningún documento fue editado.*
