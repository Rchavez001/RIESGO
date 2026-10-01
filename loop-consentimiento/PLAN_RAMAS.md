# Plan de ramas para el trabajo sin commit ajeno al módulo (iteración 5)

**Nada de esto se ejecutó.** Son propuestas para que la persona responsable las revise y apruebe. Respaldo previo: `~/wip-backup-2026-09-28.tgz` (hecho por la persona responsable, copiado fuera de la máquina).

## Hechos que determinan el plan
- `main` es **ancestro** de `feature/consentimiento-lopdp` (main no tiene commits propios que la feature no tenga; la feature va unos commits por delante). Actualizar la feature desde `main` no puede dar conflictos de historia; los conflictos de archivos, según `git diff main..feature`, tampoco: ningún archivo modificado sin commit fue tocado por la feature.
- **Los archivos de la línea base no están en git**: 32 migraciones (030–058, 069–072), `_shared/pii.ts`, 8 funciones, `templates/`, `deno.lock`, `tests/shuffle-options.test.cjs`. La puerta `panel-unit` de `gates.sh` **ejecuta** `tests/shuffle-options.test.cjs` (sin versionar) → sobre un árbol limpio **falla hasta que la línea base se integre en main**.
- **La ruta `/registro` no existe en el código versionado** (T-ruta-registro): solo está en el `App.tsx` modificado, mezclada con UX. `App.tsx` es un archivo **mixto** (UX + 2 líneas del módulo).
- `supabase/config.toml` (línea base) trae `enable_anonymous_sign_ins = true`. D-12: desactivado en producción hasta cerrar T19b. Se commitea tal cual (es lo que hay en el árbol) y **no se despliega**; T99 lo verifica.

## Listas finales por grupo (rutas relativas a la raíz del repo; `S` = `shield-ecuador-app`)

### M — pertenece al módulo (NO va a ninguna rama wip)
Se aplica en `feature/consentimiento-lopdp` con `patches/registro-route.patch` (probado con `git apply --check` contra HEAD):
- `S/frontend/src/App.tsx`: solo `import { RegisterScreen }` + `<Route path="/registro">`.
- `S/frontend/src/screens/LandingPage.tsx`: botón INSCRÍBETE → `/registro`.
Excluidos explícitamente de todos los grupos: `RegisterScreen.tsx`, `AuthContext.tsx`, `register.spec.ts`, estilos del consentimiento (`index.css`): **están limpios**, ya versionados.

### B — `chore/baseline-produccion` (52 entradas)
- `S/supabase/migrations/`: 030–032, 034–058, 069–072 (32 archivos nuevos)
- `S/supabase/functions/`: nuevas `fix-learning-item-balance/`, `import-question-bank/`, `log-login-event/`, `quiz-generator/`, `run-news-agent/`, `security-diagnose/`, `security-easm-scan/`, `security-kata-convert/`, `_shared/pii.ts`; modificadas `_shared/news-agent-core.ts`, `audit-generated-questions/index.ts`, `run-daily-agent-workflows/index.ts`
- `S/supabase/config.toml`, `S/supabase/templates/magic_link.html`, `S/deno.lock`
- `S/central-admin-app/app.js`, `index.html`, `styles.css` (el módulo los modificará después: por eso la línea base debe entrar primero)
- `S/tests/admin/questions.spec.ts`, `S/tests/shuffle-options.test.cjs`
- **Fuera**: `S/supabase/.temp/cli-latest` (ruido: ya está en `.gitignore`, pero se versionó antes).

### A — `wip/ux-redesign` (22 entradas)
- `S/frontend/src/App.tsx` (archivo completo; contiene también las 2 líneas de M: son idénticas a las del parche, así que al fusionar ambas ramas no hay conflicto)
- `S/frontend/src/components/`: `SenseiChallengeModal.tsx`, `senseiChallengeTypes.ts`, `GuestRegisterPrompt.tsx` (nuevo)
- `S/frontend/src/lib/viewAsUser.ts` (nuevo)
- `S/frontend/src/screens/`: `CinematicLandingPage.tsx`, `DojoDetailPage.tsx`, `PracticePage.tsx` (borrado)
- `S/frontend/public/`: `demo/` (4 borrados), `videos/cara-moneda.webp`, `sello-moneda.webp` (modificados), `cara.webm`, `sello.webm` (nuevos)
- `S/tests/frontend/`: `dojo-detail.spec.ts`, `landing.spec.ts`, `scanner.spec.ts`, `shell.spec.ts`
- `S/diagnose_hero.mjs`, `S/diagnose_modal.mjs`
- **Fuera**: `LandingPage.tsx` (su único cambio es de M), `S/imagen/` (77 MB) y `S/videos/` (140 MB): material fuente en bruto (PNG, MP4, ZIP); no van a git ni a una rama, ver D.

### C — `docs/iso-y-privacidad` (24 entradas)
- `S/docs/`: `AI_HANDOFF_CYBER_DOJO.md`, `BANCO_Y_APRENDIZAJE_CIBERDOJO.md` (modificados); `EVALUACION_ISO_42001_TR_24368_CIBERDOJO.{md,html,docx}`, `ISO_CIBERDOJO_INVENTARIO.csv`, 4 PDF de informes/cumplimiento, `OWASP_Top10_Review_Paper_EDITED.docx` (nuevos, ≈ 2,5 MB en total)
- `S/vault/` (8 archivos de Obsidian) y `S/.gitignore` (+ `vault/.obsidian/`)
- `S/scripts/export_iso_review.py`, `S/README-centro-de-seguridad.md`, `S/manual-central-admin.html`
- **Fuera**: `S/docs/~$ALUACION_ISO_42001_TR_24368_CIBERDOJO.docx` (archivo de bloqueo de Word).

### D — a `.gitignore`, no a ramas
Entradas propuestas para el `.gitignore` de la raíz (rama del módulo, un commit `chore: ignorar herramientas locales y material fuente`):
```
# Herramientas y basura local
.vscode/
__pycache__/
*.pyc
~$*

# Skills de diseño instaladas por una herramienta (reproducibles con skills-lock.json)
shield-ecuador-app/frontend/.claude/skills/
shield-ecuador-app/frontend/.agents/

# Material fuente pesado en bruto (arte y vídeo): 217 MB, no pertenece a git
shield-ecuador-app/imagen/
shield-ecuador-app/videos/
```
Pendientes de tu decisión (no van a ningún grupo): `.claude/settings.json` y `.claude/settings.local.json` (permisos locales; `settings.local.json` debería dejar de versionarse con `git rm --cached`), `S/frontend/skills-lock.json` (recomendado versionarlo: es lo que permite reinstalar las skills), `S/supabase/.temp/cli-latest`.

## Comandos — Fase 1: crear las ramas en carpetas aparte (tu carpeta de trabajo NO cambia)
```bash
cd /c/Users/aps-ecuador/Riesgo
WT=/c/Users/aps-ecuador/Riesgo-wt ; S=shield-ecuador-app ; F=$S/frontend
mkdir -p "$WT"

git worktree add -b chore/baseline-produccion "$WT/baseline" main
git worktree add -b wip/ux-redesign            "$WT/ux"       main
git worktree add -b docs/iso-y-privacidad      "$WT/docs"     main

# Copia rutas (modificadas, nuevas y borradas) de tu carpeta de trabajo al worktree indicado. Solo lee tu carpeta.
copy_to() { local wt=$1; shift
  git ls-files -m -o --exclude-standard -z -- "$@" | grep -zv '/~\$' | tar --null -T - -cf - | tar -xf - -C "$wt"
  git ls-files -d -z -- "$@" | xargs -0 -r git -C "$wt" rm -q -- ; }
count_src() { git ls-files -m -o -d --exclude-standard -- "$@" | grep -v '/~\$' | sort -u | wc -l; }

B="$S/supabase/migrations $S/supabase/functions $S/supabase/templates $S/supabase/config.toml $S/deno.lock $S/central-admin-app $S/tests/admin/questions.spec.ts $S/tests/shuffle-options.test.cjs"
A="$F/src/App.tsx $F/src/components $F/src/lib $F/src/screens/CinematicLandingPage.tsx $F/src/screens/DojoDetailPage.tsx $F/src/screens/PracticePage.tsx $F/public $S/tests/frontend/dojo-detail.spec.ts $S/tests/frontend/landing.spec.ts $S/tests/frontend/scanner.spec.ts $S/tests/frontend/shell.spec.ts $S/diagnose_hero.mjs $S/diagnose_modal.mjs"
C="$S/docs $S/vault $S/scripts/export_iso_review.py $S/README-centro-de-seguridad.md $S/manual-central-admin.html $S/.gitignore"

copy_to "$WT/baseline" $B ; copy_to "$WT/ux" $A ; copy_to "$WT/docs" $C

# Revisión (todo es solo lectura): deben salir 52, 22 y 24 entradas
for g in baseline:B ux:A docs:C; do n=${g%%:*}; v=${g##*:}
  git -C "$WT/$n" add -A
  echo "$n: $(git -C "$WT/$n" diff --cached --name-only | wc -l) preparadas, esperadas $(count_src ${!v})"; done
git -C "$WT/baseline" diff --cached --stat | tail -5      # y lo mismo con ux y docs; revisa a mano
```
Cuando lo hayas revisado, los commits (cada uno en su worktree):
```bash
git -C "$WT/baseline" commit -m "chore(baseline): migraciones 030-072, funciones, panel y config de producción sin versionar"
git -C "$WT/ux"       commit -m "wip(ux): rediseño UX/UI y modo invitado (sin verificar)"
git -C "$WT/docs"     commit -m "docs: evaluación ISO 42001, informes de seguridad y vault"
```

## Fase 2: integrar la línea base en main (con tu revisión)
```bash
git worktree add "$WT/main" main
git -C "$WT/main" merge --no-ff chore/baseline-produccion -m "Merge chore/baseline-produccion: línea base de producción"
# Si prefieres revisión en GitHub: sube chore/baseline-produccion tú mismo, abre el PR y luego haz `git fetch`.
```

## Fase 3: dejar la carpeta de trabajo limpia y actualizar la rama del módulo (recién aquí cambia tu carpeta)
Requisitos: haber verificado las fases 1 y 2 y tener el respaldo fuera de la máquina.
```bash
cd /c/Users/aps-ecuador/Riesgo
git status --short | grep -c .                     # antes
# 3a. .gitignore de herramientas locales (sección D): añade las entradas de arriba a .gitignore y commitea
git add .gitignore && git commit -m "chore: ignorar herramientas locales y material fuente"
# 3b. Aparta TODO lo que queda (reversible; no borra nada): incluye modificados y sin versionar, no lo ignorado
git stash push --include-untracked -m "ajeno-2026-09-28"
git status --short | grep -c .                     # debe ser 0 (o solo lo ignorado)
# 3c. Actualiza la rama del módulo desde main
git merge main -m "Merge main (línea base de producción) en feature/consentimiento-lopdp"
# 3d. Ruta /registro (T-ruta-registro)
git apply --check .claude/loops/consentimiento/patches/registro-route.patch && git apply .claude/loops/consentimiento/patches/registro-route.patch
git add shield-ecuador-app/frontend/src/App.tsx shield-ecuador-app/frontend/src/screens/LandingPage.tsx
git commit -m "fix(consent): registrar la ruta /registro [REQ-06]"
```
Después de comprobar que en `main` y en las ramas wip está todo (`git stash show --stat stash@{0}`), `git stash drop` — **no** `git stash pop` (traería de vuelta los archivos que ya están en commits).

## Cómo verificar que `gates.sh` pasa sobre un árbol limpio
- **Rápido (recomendado): justo tras 3b–3d.** La carpeta ya está limpia y conserva `node_modules` (están ignorados): `bash .claude/loops/consentimiento/gates.sh`. Debe salir todo OK con `db-reset` en SKIP. Antes de 3c la puerta `panel-unit` falla por `shuffle-options.test.cjs`: es la prueba de que la línea base era necesaria.
- **Sin tocar nada: worktree limpio.** `git worktree add --detach "$WT/clean" feature/consentimiento-lopdp`, luego `cd "$WT/clean/shield-ecuador-app" && npm ci && (cd frontend && npm ci)` y `cd "$WT/clean" && bash .claude/loops/consentimiento/gates.sh`. Necesita red y unos minutos; `node_modules` no se comparte entre worktrees (no uses enlaces/junctions: borrarlos con `git worktree remove` puede borrar el original).
- Además, contra el commit limpio: `tests/frontend/register.spec.ts` (necesita la app compilada; no está en `gates.sh`) para confirmar que `/registro` ya funciona.
- Limpieza al terminar: `git worktree remove "$WT/clean"`.

## Estado final esperado de `feature/consentimiento-lopdp`
`main` (con la línea base) + los commits del módulo + `.gitignore` + `/registro`. Carpeta de trabajo limpia salvo lo ignorado. El módulo ve `migraciones 030–072`, `pii.ts`, `config.toml` y el panel actual. Sin esto `git add -A` de `PROMPT.md` no es seguro; con el árbol limpio sí. Las ramas `wip/ux-redesign` y `docs/iso-y-privacidad` quedan aparte y se integran cuando decidas; `App.tsx` de UX contiene las mismas 2 líneas de `/registro`, sin conflicto al fusionar.

## (f) Las 3 funciones modificadas de la línea base
`_shared/news-agent-core.ts`, `audit-generated-questions/index.ts`, `run-daily-agent-workflows/index.ts`. **Sí conviene** comparar con lo desplegado antes de fusionar la línea base: una "línea base de producción" que no coincide con producción es una línea base falsa. Es solo lectura contra el proyecto hospedado (descarga el código de las funciones, no datos), pero pide sesión de la CLI (`supabase login`) y **por defecto escribe en `supabase/functions/<nombre>/` y sobrescribiría tus archivos**, así que se haría en una carpeta aparte. **No lo hice: espera tu OK.** Propuesta (una vez lo apruebes): `mkdir -p "$WT/deployed" && cd "$WT/deployed" && supabase functions download <nombre> --project-ref <ref>` para cada una de las 3 (y de las 8 nuevas, para comprobar que lo desplegado coincide con lo que se versiona), y `git diff --no-index` contra la versión de `baseline`. `news-agent-core.ts` no es una función: se compara a través de las que la importan (`run-news-agent`, etc.). Opcional también, solo lectura: `supabase migration list` para ver qué migraciones 030–072 están aplicadas.
