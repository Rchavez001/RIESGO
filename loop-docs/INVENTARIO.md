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

## Documentos que faltan y deberían existir

1. **Reemplazo del documento 1** (si se archiva): un documento de traspaso/arquitectura vigente que
   mencione el módulo de consentimiento, el modo invitado y el estado real de Edge Functions —
   podría ser la actualización del propio documento 1, o fusionarlo con `ARQUITECTURA_CYBER_DOJO.md`
   (raíz). Decisión humana, no de esta Fase 0.
2. **Doc técnico del modo invitado** (sesión anónima, `GuestNoticeModal`, `accept-guest-notice`,
   `cleanup_expired_guest_sessions`): hoy solo existe disperso en `loop-consentimiento/TASKS.md` y
   comentarios de código; no hay un documento de referencia único, ni en `docs/` ni en la raíz.
3. **Verificación SQL actualizada** (si no se opta por reescribir el documento 10): una versión que
   cubra las tablas de aprendizaje, campañas y consentimiento.
4. **Nota sobre `docs/iso-y-privacidad`**: ningún documento de `docs/` menciona que existe una rama
   separada con la evaluación ISO 42001 real, sin fusionar. Si el objetivo final es tener "toda la
   documentación" en un solo lugar, esa fusión (o al menos una referencia) falta.

---

*Inventario generado el 2026-10-24 en la rama `docs/actualizacion` (worktree `C:\Users\aps-ecuador\Riesgo-docs`), a partir de la lectura de los 13 archivos de `shield-ecuador-app/docs/` y contraste puntual contra `App.tsx`, `central-admin-app/*.js`, `BASE_DE_DATOS.md` y `supabase/migrations/`. Ningún documento fue editado.*
