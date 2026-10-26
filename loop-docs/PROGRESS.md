# PROGRESS · Loop de documentación (`shield-ecuador-app/docs`)

Bitácora de iteraciones. Nunca se borran entradas.

## Resumen al inicio (Fase 0, 2026-10-24)

Sesión interactiva (no headless) preparó: `loop-docs/INVENTARIO.md` (diagnóstico de los 13
archivos de `shield-ecuador-app/docs/`, sin editar ninguno), el diseño del loop
(`.claude/loops/docs/PROMPT.md`, `gates.sh`, `headless-settings.json`), el backlog
(`loop-docs/TASKS.md`) y 3 decisiones abiertas (`DECISIONS.md`, DOC-01 a DOC-03). También se
propuso (sin commitear) un diff a `.claude/loops/consentimiento/run-loop.sh` para que acepte
`LOOP=docs`, y se añadieron las reglas `allow`/`deny` correspondientes a `.claude/settings.json`.

**Nada de esto ejecutó ninguna tarea de `TASKS.md` todavía.** La primera iteración real del loop
headless (`LOOP=docs bash .claude/loops/consentimiento/run-loop.sh`) espera la aprobación de la
persona responsable sobre el inventario y el backlog.

## Iteración 0 — 2026-10-24 — Fase 0 (preparación, sesión interactiva)
- Cambios: `loop-docs/INVENTARIO.md`, `loop-docs/TASKS.md`, `loop-docs/DECISIONS.md`, este archivo,
  `.claude/loops/docs/PROMPT.md`, `.claude/loops/docs/gates.sh`, `.claude/loops/docs/headless-settings.json`,
  `.claude/settings.json` (reglas `allow`/`deny` para el loop nuevo).
- Verificado contra: los 13 archivos de `shield-ecuador-app/docs/`, `App.tsx`,
  `central-admin-app/*.js`, `BASE_DE_DATOS.md`, `supabase/migrations/`.
- [VERIFICAR] añadidos: ninguno (las 3 preguntas abiertas son decisiones de alcance — archivar/
  fusionar — no afirmaciones técnicas sin verificar).
- Gates: `bash .claude/loops/docs/gates.sh --selftest` OK (las 5 puertas distinguen el caso roto
  del caso sano). `bash .claude/loops/docs/gates.sh` sobre el árbol real de esta sesión reporta
  `FAIL` en la puerta `scope` — **esperado**: el propio trabajo de Fase 0 (archivos de
  `.claude/loops/docs/` y el diff de `run-loop.sh`) está, a propósito, fuera del alcance que esa
  puerta exige para las iteraciones normales del loop (solo `shield-ecuador-app/docs` y
  `loop-docs`). Antes del primer commit de una tarea real de `TASKS.md`, el árbol debe quedar
  limpio de estos archivos de infraestructura (commiteados aparte, con rutas explícitas).
- Pendiente para la persona responsable: aprobar `INVENTARIO.md` y `TASKS.md`; decidir DOC-01 a
  DOC-03; commitear (o pedir que se commitee) el diff de `run-loop.sh`.

## Iteración 0b — 2026-10-26 — Fase 0 (ampliación de alcance, sesión interactiva)
- La persona responsable aprobó el inventario y amplió el alcance: (a) `.md` de la raíz de
  `shield-ecuador-app/`, no solo `docs/`; (b) fusión de la rama `docs/iso-y-privacidad`; (c) decidió
  DOC-01/02/03.
- Cambios: fusión `git merge docs/iso-y-privacidad --no-ff` (sin conflictos); ampliación de
  `loop-docs/INVENTARIO.md` (puntos 14-32: 8 `.md` de la raíz + 2 archivos nuevos de la fusión + 7
  documentos controlados + vault + script fuera de alcance); `loop-docs/DECISIONS.md` (DOC-01/02/03
  → DECIDIDA; DOC-04 y DOC-05 nuevas, ABIERTA); `.claude/loops/docs/PROMPT.md` y
  `.claude/loops/docs/gates.sh` (alcance ampliado a los `.md` de la raíz, excluye `vault/`,
  `manual-central-admin.html` y `scripts/`); `loop-docs/TASKS.md` reescrito completo, 15 tareas en
  el orden que fijó la persona responsable; `loop-docs/propuestas/` (placeholder, para las
  propuestas de documentos controlados que pida DOCS-14).
- Verificado contra: `supabase/migrations/` (82 archivos, hasta `084`), `supabase/functions/` (33
  carpetas), `App.tsx`, `GUIA_LEVANTAMIENTO_PROYECTO.md` (se confirmó que su propio commit T98 no
  corrigió el conteo de migraciones/Edge Functions, a pesar de la fecha reciente).
- [VERIFICAR] añadidos: ninguno nuevo (DOC-04/DOC-05 son decisiones de alcance, no afirmaciones
  técnicas sin verificar).
- Gates: `bash .claude/loops/docs/gates.sh --selftest` — los casos de la puerta `scope` para
  `.md` de la raíz y árbol limpio reportan FAIL mientras los archivos de infraestructura de esta
  misma iteración (PROMPT.md, gates.sh, run-loop.sh) sigan sin commitear — **esperado**, mismo caso
  que la Iteración 0. La puerta `rutas` también reporta falsos positivos sobre `INVENTARIO.md`/
  `DECISIONS.md` porque citan nombres de rama (`docs/iso-y-privacidad`, `wip/ux-redesign`) y rutas
  abreviadas relativas a `shield-ecuador-app/` entre backticks, que la heurística de `check_code_paths`
  resuelve solo desde la raíz del repo — limitación conocida y documentada en el propio `gates.sh`
  ("heurística, no exhaustiva a propósito"), no un error introducido ahora. La puerta `secretos`
  también se autodetecta en `gates.sh` (su propio patrón de búsqueda contiene las palabras
  "password"/"service_role") mientras el archivo esté "cambiado"; deja de pasar por la puerta en
  cuanto se commitea (las iteraciones normales nunca pueden editarlo, está en `headless-settings.json`).
- Pendiente para la persona responsable: revisar `TASKS.md` final y el diff de `run-loop.sh`; decidir
  DOC-04 y DOC-05 (no bloquean ninguna tarea todavía); dar el OK antes de ejecutar cualquier tarea.

## Iteración 0c — 2026-10-26 — Fase 0 (cierre: DOC-04/DOC-05 decididas, OK al plan)
- La persona responsable dio el OK al plan completo y decidió las dos preguntas abiertas que
  quedaban: `DOC-04` (`manual-central-admin.html` queda fuera del alcance del loop, solo lectura) y
  `DOC-05` (`MANUAL_ADMINISTRADOR.md` es el manual oficial/vigente; el índice listará los otros dos
  indicando eso, sin fusionarlos).
- Cambios: `loop-docs/DECISIONS.md` (DOC-04 y DOC-05 → DECIDIDA, con el texto exacto de la decisión);
  `loop-docs/TASKS.md` (DOCS-02 incorpora ambas decisiones como parte de su criterio de aceptación;
  cierre "Fuera de alcance" actualizado — ya no quedan preguntas de alcance sin decidir).
- Con esto, **las cinco decisiones de Fase 0 (DOC-01 a DOC-05) están todas cerradas** y ninguna
  tarea de `TASKS.md` queda `⛔ BLOQUEADA`. Fase 0 interactiva terminada.
- Pendiente para la persona responsable: commitear (o pedir que se commitee) el diff de
  `.claude/loops/consentimiento/run-loop.sh` — sigue sin commitear, a propósito, desde la Iteración 0.
  A partir de ahí, la primera iteración real es responsabilidad de quien decida lanzar
  `LOOP=docs bash .claude/loops/consentimiento/run-loop.sh` (headless, fuera de esta sesión
  interactiva).
