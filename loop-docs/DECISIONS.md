# DECISIONS · Loop de documentación (`shield-ecuador-app/docs`)

Solo un humano completa el campo "Decisión" y cambia el estado a DECIDIDA. El loop puede añadir
preguntas nuevas, nunca decidirlas.

---

### DOC-01 — ¿Qué hacer con `AI_HANDOFF_CYBER_DOJO.md`?  [ABIERTA]
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
Tareas bloqueadas: DOCS-04.
Decisión:

### DOC-02 — ¿Archivar o generalizar `APLICACION_CINEMATICA_LOCAL.md`?  [ABIERTA]
Contexto: instrucciones para un servidor de revisión local (`:3001`) del rediseño cinematográfico,
ya publicado en producción. La tabla de rutas describe `/practica` como una demo que ya no existe
(hoy redirige a `/dojos`).
Opciones: A) Archivar (cumplió su propósito, el rediseño ya se publicó). B) Generalizar el
procedimiento ("cómo levantar una revisión local de cualquier rediseño futuro") y corregir las
rutas desactualizadas.
Recomendación: depende de si se espera otro rediseño cinematográfico pronto — si no, A es más simple.
Tareas bloqueadas: DOCS-05.
Decisión:

### DOC-03 — ¿Archivar o mantener como histórico `DIRECCION_VISUAL_REFERENCIAS.md`?  [ABIERTA]
Contexto: propuesta de dirección de arte para el rediseño cinematográfico, ya implementada.
Opciones: A) Archivar. B) Dejarlo, marcado explícitamente como "registro histórico de una decisión
de dirección de arte ya ejecutada" (útil si alguna vez se repite un ejercicio de dirección visual
y se quiere ver cómo se razonó la vez anterior).
Recomendación: B — tiene valor como referencia de proceso, y archivarlo no ahorra mucho (es corto).
Tareas bloqueadas: DOCS-06.
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
