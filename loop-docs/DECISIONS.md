# DECISIONS · Loop de documentación (`shield-ecuador-app/docs`)

Solo un humano completa el campo "Decisión" y cambia el estado a DECIDIDA. El loop puede añadir
preguntas nuevas, nunca decidirlas.

---

### DOC-01 — ¿Qué hacer con `AI_HANDOFF_CYBER_DOJO.md`?  [DECIDIDA 2026-10-26]
Contexto: documento de traspaso de 2026-08-27, severamente desactualizado (migraciones, cinturones,
Edge Functions, rutas — ver `INVENTARIO.md` punto 1) y con fuerte solapamiento de alcance con
`ARQUITECTURA_CYBER_DOJO.md`/`DOCUMENTO_FUNCIONALIDADES.md` (raíz de `shield-ecuador-app/`, fuera
de `docs/`).
Opciones: A) fusionar su contenido útil en `ARQUITECTURA_CYBER_DOJO.md`/`DOCUMENTO_FUNCIONALIDADES.md`
y borrar este archivo. B) Archivarlo tal cual (mover a una carpeta `docs/archivo/` o similar, sin
actualizarlo) y escribir un documento de traspaso nuevo, más corto. C) Actualizarlo en su lugar
actual, sección por sección (mucho trabajo: es el documento más largo de los 13, con el mayor
desfase).
Recomendación: B. Reescribirlo completo sería duplicar gran parte de `ARQUITECTURA_CYBER_DOJO.md`;
archivarlo y empezar un traspaso corto y vigente es menos trabajo y da un documento más confiable.
Tareas bloqueadas: DOCS-04 (ahora ejecutable, ver `TASKS.md`).
Decisión: ninguna de las tres tal cual — se queda en su lugar actual (no se archiva), pero se
reescribe **breve**, como documento de traspaso que enlaza a los documentos especializados
(`ARQUITECTURA_CYBER_DOJO.md`, `BASE_DE_DATOS.md`, `DOCUMENTO_FUNCIONALIDADES.md`,
`MANUAL_ADMINISTRADOR.md`) en vez de repetir su contenido. Uso previsto: capacitación del club Phycom.

### DOC-02 — ¿Archivar o generalizar `APLICACION_CINEMATICA_LOCAL.md`?  [DECIDIDA 2026-10-26]
Contexto: instrucciones para un servidor de revisión local (`:3001`) del rediseño cinematográfico,
ya publicado en producción. La tabla de rutas describe `/practica` como una demo que ya no existe
(hoy redirige a `/dojos`).
Opciones: A) Archivar (cumplió su propósito, el rediseño ya se publicó). B) Generalizar el
procedimiento ("cómo levantar una revisión local de cualquier rediseño futuro") y corregir las
rutas desactualizadas.
Recomendación: depende de si se espera otro rediseño cinematográfico pronto — si no, A es más simple.
Tareas bloqueadas: DOCS-05 (ahora ejecutable, ver `TASKS.md`).
Decisión: A — mover a `shield-ecuador-app/docs/archivo/` con un aviso "Documento histórico, no
vigente desde <fecha>" al inicio del archivo (sin reescribir el resto del contenido).

### DOC-03 — ¿Archivar o mantener como histórico `DIRECCION_VISUAL_REFERENCIAS.md`?  [DECIDIDA 2026-10-26]
Contexto: propuesta de dirección de arte para el rediseño cinematográfico, ya implementada.
Opciones: A) Archivar. B) Dejarlo, marcado explícitamente como "registro histórico de una decisión
de dirección de arte ya ejecutada" (útil si alguna vez se repite un ejercicio de dirección visual
y se quiere ver cómo se razonó la vez anterior).
Recomendación: B — tiene valor como referencia de proceso, y archivarlo no ahorra mucho (es corto).
Tareas bloqueadas: DOCS-06 (ahora ejecutable, ver `TASKS.md`).
Decisión: igual que DOC-02 — mover a `shield-ecuador-app/docs/archivo/` con el mismo aviso de
"Documento histórico, no vigente desde <fecha>" (el usuario unificó el tratamiento de ambos
documentos de rediseño cinematográfico: archivo, no permanencia marcada in situ).

### DOC-04 — ¿`manual-central-admin.html` entra en el alcance del loop?  [DECIDIDA 2026-10-26]
Contexto: la fusión de `docs/iso-y-privacidad` trajo `shield-ecuador-app/manual-central-admin.html`
(565 líneas, manual visual completo de las 15 secciones del panel admin). El alcance ampliado que
aprobó el usuario dice literalmente "los `.md` de la raíz" — este archivo es `.html`, no calza en la
letra de esa instrucción aunque es claramente documentación. Ver `INVENTARIO.md` punto 23.
Opciones: A) Incluirlo en el alcance del loop (se puede editar en iteraciones futuras, igual que un
`.md`). B) Dejarlo fuera (el loop solo lo lee como referencia, nunca lo edita, igual que los PDF/PNG
del documento 6-7).
Recomendación: ninguna — depende de si el HTML autocontenido sigue siendo el formato elegido para
este manual o si conviene migrarlo a `.md` en algún momento (eso sí sería una tarea del loop).
Tareas bloqueadas: ninguna.
Decisión: B — queda fuera del alcance del loop por ahora (solo lectura, igual que los PDF/PNG). El
`gates.sh` y el `PROMPT.md` ya lo reflejan así desde que se diseñó el alcance ampliado (no hace
falta tocarlos de nuevo). Puede reabrirse esta decisión más adelante si se decide migrarlo a `.md`.

### DOC-05 — Tres documentos distintos se llaman "manual del administrador"  [DECIDIDA 2026-10-26]
Contexto: `shield-ecuador-app/MANUAL_ADMINISTRADOR.md` (raíz, actualizado T98.b con la sección 14 de
consentimiento), `shield-ecuador-app/manual-central-admin.html` (HTML autocontenido, ver DOC-04), y
`shield-ecuador-app/vault/Manual del administrador.md` (stub que apunta al HTML como "el manual
completo"). Ninguno declara explícitamente cuál es la fuente de verdad para quién. Ver
`INVENTARIO.md` punto 18.
Opciones: A) Declarar `MANUAL_ADMINISTRADOR.md` como la única fuente de verdad y reducir el HTML/vault
a referencias que apunten ahí. B) Declarar el HTML como la fuente de verdad (es visual, pensado para
el club) y reducir `MANUAL_ADMINISTRADOR.md` a un resumen técnico. C) Dejar los tres, pero que el
nuevo índice (`README.md`) aclare el propósito de cada uno sin fusionarlos.
Recomendación: C a corto plazo (no implica reescribir nada ahora) — fusionar de verdad (A o B) es
trabajo mayor que amerita su propia decisión, no una tarea de rutina del loop.
Tareas bloqueadas: DOCS-02 (el índice general debe reflejar esta decisión al redactarse).
Decisión: A — `shield-ecuador-app/MANUAL_ADMINISTRADOR.md` es el manual oficial/vigente. El índice
general (`README.md`, DOCS-02) debe listar `manual-central-admin.html` y
`vault/Manual del administrador.md` indicando explícitamente que no son la fuente de verdad y
remitiendo a `MANUAL_ADMINISTRADOR.md`. No se fusionan ni se reescriben en esta ronda — la decisión
es solo sobre cuál es la referencia vigente, no sobre eliminar los otros dos.

### DOC-06 — ¿Está el módulo de consentimiento (migraciones `073`-`084`) ya aplicado en producción?  [DECIDIDA 2026-10-26]
Contexto: `DOCUMENTO_FUNCIONALIDADES.md` sección 2.6 cita el estado de despliegue del módulo de
consentimiento informado. `SECURITY_PRIVACY.md` (sección "Módulo de consentimiento informado")
afirma que, al redactarse esa sección, el módulo (entonces migraciones `073`-`081`) **no** estaba
aplicado en producción, remitiendo a `loop-consentimiento/PLAN_PRODUCCION_RELEASE.md`. No se
verificó en esta iteración si ese plan ya se ejecutó, ni si las migraciones `082`-`084` (añadidas
después de esa redacción) cambian la conclusión.
Opciones: no aplica — es una pregunta de estado operativo, no una decisión de alcance.
Recomendación: quien tenga acceso al proyecto Supabase de producción (o al estado de
`loop-consentimiento/PLAN_PRODUCCION_RELEASE.md`) puede confirmar el estado actual; una iteración
futura de este loop debería releer ese plan y actualizar `DOCUMENTO_FUNCIONALIDADES.md` sección 2.6
en consecuencia.
Documentos bloqueados: ninguno (el `[VERIFICAR]` queda marcado en el propio texto, no bloquea
ninguna tarea de `TASKS.md`).
Decisión: en producción solo está aplicada la migración `073`. Las migraciones `074`-`084`, las
Edge Functions del módulo, el panel administrativo nuevo (sección 14 de `MANUAL_ADMINISTRADOR.md`)
y el frontend con su rediseño **aún no están desplegados**; se aplicarán en el release (ver
`loop-consentimiento/PLAN_RELEASE_COMPLETO.md` en la rama `feature/consentimiento-lopdp`). Los
documentos deben describir el módulo como **"implementado, pendiente de despliegue"** — nunca como
ya desplegado ni como ausente. Acción concreta para una iteración futura: resolver el `[VERIFICAR]`
de `DOCUMENTO_FUNCIONALIDADES.md` línea 131 ("Estado de despliegue") con esta misma frase, y revisar
que ninguna tarea pendiente (`DOCS-07` a `DOCS-13`) describa el módulo como ya en producción.

### DOC-07 — ¿La revision de Cloud Run que corre hoy `cyberdojo` se construyo por buildpacks o por `frontend/Dockerfile`?  [ABIERTA]
Contexto: `GUIA_LEVANTAMIENTO_PROYECTO.md` sección 15 afirmaba (desde 2026-09-09) que `frontend/`
no tenía `Dockerfile` y que la producción se desplegaba por buildpacks de Cloud Build. Al verificar
en esta iteración (DOCS-05) se encontró que el commit `217140f` (2026-09-28) añadió
`frontend/Dockerfile` — un build multistage `node:20-alpine` que termina ejecutando
`node static-server.js`, igual que hacían los buildpacks. Cloud Build prioriza un `Dockerfile`
presente sobre los buildpacks, así que cualquier despliegue nuevo usará ese `Dockerfile`. No se
pudo confirmar si la revisión actualmente activa en Cloud Run (`cyberdojo`) se desplegó antes o
después del 2026-09-28 — eso requiere revisar el historial de revisiones en la consola de Cloud Run
o `gcloud run revisions list --service cyberdojo`, fuera del alcance de este loop de documentación
(no se ejecutan comandos contra infraestructura real).
Opciones: no aplica — es una pregunta de estado operativo, no una decisión de alcance.
Recomendación: quien tenga acceso a la consola de Cloud Run puede confirmar la fecha de la revisión
activa con `gcloud run revisions list --service cyberdojo --region us-central1` y actualizar la nota
`[VERIFICAR]` de `GUIA_LEVANTAMIENTO_PROYECTO.md` sección 15 en consecuencia. No es crítico: el
comportamiento (build y arranque) es el mismo en ambos casos.
Documentos bloqueados: ninguno (el `[VERIFICAR]` queda marcado en el propio texto).
Decisión: sigue ABIERTA — no se verificó el historial real de revisiones de Cloud Run
(`gcloud run revisions list --service cyberdojo --region us-central1`) en esta sesión; esta
sesión interactiva de Fase 0 no ejecuta comandos contra infraestructura real. Queda para quien
tenga acceso a la consola de Cloud Run/Cloud Build confirmar la fecha y actualizar el `[VERIFICAR]`
de `GUIA_LEVANTAMIENTO_PROYECTO.md` sección 15.

---

## Formato para nuevas entradas

```
### DOC-nn — <pregunta breve>  [ABIERTA | DECIDIDA AAAA-MM-DD]
Contexto: <qué documento/sección la necesita y por qué>
Opciones: A) … B) …
Recomendación: <si la hay>
Tareas bloqueadas: DOCS-nn
Decisión: <vacío hasta que un humano lo complete>
```
