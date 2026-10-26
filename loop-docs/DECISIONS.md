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

### DOC-04 — ¿`manual-central-admin.html` entra en el alcance del loop?  [ABIERTA]
Contexto: la fusión de `docs/iso-y-privacidad` trajo `shield-ecuador-app/manual-central-admin.html`
(565 líneas, manual visual completo de las 15 secciones del panel admin). El alcance ampliado que
aprobó el usuario dice literalmente "los `.md` de la raíz" — este archivo es `.html`, no calza en la
letra de esa instrucción aunque es claramente documentación. Ver `INVENTARIO.md` punto 23.
Opciones: A) Incluirlo en el alcance del loop (se puede editar en iteraciones futuras, igual que un
`.md`). B) Dejarlo fuera (el loop solo lo lee como referencia, nunca lo edita, igual que los PDF/PNG
del documento 6-7).
Recomendación: ninguna — depende de si el HTML autocontenido sigue siendo el formato elegido para
este manual o si conviene migrarlo a `.md` en algún momento (eso sí sería una tarea del loop).
Tareas bloqueadas: ninguna todavía — el `gates.sh` no lo incluye en rutas permitidas hasta que se
decida.
Decisión:

### DOC-05 — Tres documentos distintos se llaman "manual del administrador"  [ABIERTA]
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
Tareas bloqueadas: ninguna todavía.
Decisión:

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
