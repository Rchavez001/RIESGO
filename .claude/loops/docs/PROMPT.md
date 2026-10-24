# LOOP · Actualización de documentación — `shield-ecuador-app/docs`

Eres responsable de poner al día la documentación bajo `shield-ecuador-app/docs/` (y, cuando haga
falta mantener el índice, archivos de nivel superior que ese índice referencie). Trabajas en
**iteraciones cortas y verificables**. Cada ejecución de este prompt es UNA iteración: completas
**una tarea** (un documento, o una sección de un documento), la verificas, la registras y terminas.

No tienes memoria entre iteraciones. Tu memoria son estos archivos:

| Archivo | Uso |
|---|---|
| `loop-docs/INVENTARIO.md` | Diagnóstico inicial de cada documento (propósito, vigencia, contradicciones, propuesta). Fuente de verdad del estado de partida — no se reescribe, solo se lee. |
| `loop-docs/TASKS.md` | Backlog ordenado con criterios de aceptación. Marca `[x]` al cerrar. |
| `loop-docs/PROGRESS.md` | Bitácora de iteraciones. Añade una entrada al final. Nunca borres entradas. |
| `loop-docs/DECISIONS.md` | Afirmaciones que no se pudieron verificar (`[VERIFICAR]`) y preguntas que requieren decisión humana. |
| `.claude/loops/docs/gates.sh` | Comandos de verificación. Protegido: fuera del alcance de Edit/Write en modo headless. |

---

## Protocolo de la iteración (sigue el orden, sin saltarte pasos)

1. **Orientarte (máx. 5 min de lectura).** Lee `PROGRESS.md` (resumen inicial + últimas 3
   entradas), `DECISIONS.md` y `TASKS.md`. Ejecuta `git status` y `git log --oneline -5`. Si hay
   cambios sin commitear de una iteración previa interrumpida: evalúalos; si pasan los gates, haz
   commit; si no, revísalos y termina esa tarea primero.
2. **Elegir la tarea.** La primera tarea `[ ]` de `TASKS.md` que no esté `⛔ BLOQUEADA`. Si todas
   las tareas ejecutables están hechas y solo quedan `⛔ BLOQUEADA`, ve al paso 7 (BLOQUEADO).
3. **Verificar antes de escribir.** Para cada afirmación técnica que vayas a escribir o corregir,
   confírmala contra el código real, una migración, o `supabase/config.toml` — nunca contra otro
   documento (un documento desactualizado no es evidencia). Si no puedes verificarla con lo que
   tienes a mano, **no la escribas**: márcala `[VERIFICAR]` en el propio documento y añade una
   entrada en `DECISIONS.md` explicando qué falta confirmar y por qué. Nunca inventes un dato para
   rellenar un hueco.
4. **Implementar el cambio mínimo** que cierre la tarea, respetando las REGLAS DURAS de abajo.
5. **Verificar.** Ejecuta `bash .claude/loops/docs/gates.sh`. Si algo falla, corrige y repite (máx.
   3 ciclos). Si tras 3 ciclos sigue fallando: guarda los cambios con
   `git stash push -m "iter-N-fallida-<tarea>"` (nunca `git restore`/`git checkout --`/`git checkout .`),
   anota el nombre del stash en `PROGRESS.md`, marca la tarea `⚠ REINTENTAR` y termina.
6. **Registrar y cerrar.**
   - Marca la tarea `[x]` en `TASKS.md`.
   - Añade a `PROGRESS.md`:
     ```
     ## Iteración N — AAAA-MM-DD — <documento/sección>
     - Cambios: <archivos>
     - Verificado contra: <archivo(s) de código/migración citados>
     - [VERIFICAR] añadidos: <ninguno | detalle, con su entrada en DECISIONS.md>
     - Gates: OK
     ```
   - `git add <ruta1> <ruta2> ...` listando explícitamente cada archivo tocado (nunca `git add -A`
     ni `git add .`) y `git commit -m "docs: <documento> — <resumen corto>"`.
   - Termina tu respuesta con `<promise>ITERACION_OK</promise>`.
7. **Condiciones de salida especiales.**
   - Si TODAS las tareas no bloqueadas están `[x]`: responde con `<promise>LOOP_COMPLETO</promise>`.
   - Si no hay ninguna tarea ejecutable porque todas dependen de una decisión humana: resume en
     `DECISIONS.md` lo que falta decidir y responde con `<promise>BLOQUEADO</promise>`.

---

## REGLAS DURAS (su violación invalida la iteración)

**Alcance de archivos**
- Solo puedes editar archivos bajo `shield-ecuador-app/docs/` y `loop-docs/`. **Nunca** código
  (`.ts`, `.tsx`, `.sql`, `.js`, `.cjs`, configuración, `.env*`, `supabase/migrations/`, etc.).
  Si para cerrar una tarea hiciera falta tocar algo fuera de esos dos directorios, no lo hagas:
  documenta la necesidad en `DECISIONS.md` y termina con `<promise>BLOQUEADO</promise>`.
- Actualiza el índice o `README` de `docs/` (si existe, o créalo si la tarea lo exige y está en
  `TASKS.md`) cuando una tarea cambie la estructura de archivos de `docs/` — nunca lo dejes
  desincronizado.

**Una tarea por iteración**
- Una iteración cierra **un documento o una sección**, nunca varios. No mezcles una corrección de
  `TPOT_INTEGRATION.md` con una de `SUPABASE_VERIFICATION_QUERIES.sql` en el mismo commit.

**Verificación y honestidad**
- Toda afirmación técnica (una ruta, un nombre de función, una variable de entorno, un comportamiento)
  debe poder señalarse a un archivo real. Si no puedes verificarla, usa `[VERIFICAR]` en el texto
  y registra la pregunta en `DECISIONS.md` — nunca la presentes como un hecho confirmado.
- No inventes contenido para rellenar una sección que falta: o se verifica, o queda marcada como
  pendiente.

**Documentos controlados (ISO, legales, políticas)**
- Si un documento tiene (o debería tener) una tabla de control de versiones, una aprobación formal,
  o está marcado como controlado en `TASKS.md`/`INVENTARIO.md`: **no se reescribe directamente**.
  Los cambios van en una sección nueva "Propuesta de cambio — pendiente de aprobación" con su
  propia tabla de control de versiones (fecha, autor, qué cambia, estado `pendiente de aprobación`),
  nunca sobrescribiendo el texto ya aprobado.

**Nada sensible**
- Nunca incluyas claves, tokens, contraseñas, direcciones IP reales, correos reales ni URLs
  internas (de infraestructura, paneles internos, IPs de servidores) en ningún documento. Usa
  ejemplos ficticios (`usuario@ejemplo.test`, `192.0.2.1`) cuando haga falta un ejemplo.

**Estilo**
- Mantén el idioma (español) y el estilo propio de cada documento (tono, formato de encabezados,
  convenciones de la tabla de contenidos) — no reescribas la voz de un documento solo porque la
  tuya sería distinta.

**Bloqueos humanos**
- Nunca levantes ni rebajes un bloqueo `⛔ BLOQUEADA` de `TASKS.md`, ni cambies una pregunta
  `[VERIFICAR]`/pendiente de `DECISIONS.md` a resuelta, salvo que la propia tarea sea
  exclusivamente "incorporar la decisión que ya tomó la persona responsable" y esa decisión ya
  esté escrita en `DECISIONS.md` por un humano.

**Comandos en modo headless** (mismas reglas que `.claude/loops/consentimiento/PROMPT.md`, ver su
cabecera para el detalle completo)
- La ÚNICA forma de verificar es `bash .claude/loops/docs/gates.sh`, sola, en su propia llamada —
  nunca con variables de entorno delante, nunca con ruta absoluta, nunca encadenada con `cd`/`&&`/`;`.
- Nunca en segundo plano (`run_in_background`, `&`): en modo headless, terminar el turno mata
  cualquier tarea en segundo plano y la iteración se pierde sin veredicto.
- Nada de `docker`, `psql`, `supabase ...`, ni ningún comando contra Postgres/Supabase real: este
  loop no tiene ninguna razón para tocar la base de datos ni el stack local — es documentación.

**Economía**
- No lances subagentes (`Agent`) salvo que una búsqueda sea realmente extensa. Lee los archivos
  directamente con `Read`/`Grep`/`Glob`.

---

## Formato para DECISIONS.md

```
### DOC-nn — <pregunta breve o afirmación sin verificar>  [ABIERTA | DECIDIDA AAAA-MM-DD]
Contexto: <qué documento/sección la necesita y por qué>
Opciones: A) … B) … (si aplica)
Recomendación: <si la hay>
Documentos bloqueados: <lista>
Decisión: <vacío hasta que un humano lo complete>
```

Nunca marques una decisión como DECIDIDA tú mismo. Solo un humano edita el campo "Decisión".
