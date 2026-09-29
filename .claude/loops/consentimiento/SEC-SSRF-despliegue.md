# SEC-SSRF — comandos de despliegue (propuesta; NADA se ejecutó)

Repite el paso 0 antes de cada función (no solo la primera): el worktree debe estar limpio en el
momento exacto del despliegue, porque `supabase functions deploy` sube la carpeta local, no un commit.

**Re-verificado ahora mismo (worktree `~/Riesgo-wt/main`, commit `c95cc83`, `git status` limpio):**
- `deno info --json` (transitivo): las 3 funciones importan únicamente `_shared/news-agent-core.ts` → `_shared/url-guard.ts`. Ninguna toca `rate-limit.ts`, `crypto.ts`, `consent-evidence.ts` ni nada del módulo. **La condición de parada de la tarea SEC-SSRF no se activa.**
- `deno check` de las 3: compilan (las 3 líneas `Check ... OK`). El comando falla al final con `Could not find "@types/node"` **solo por falta de `node_modules` en el worktree** (no está en `chore/baseline-produccion` ni en ningún commit: es de `npm install`). No es un error de código: `gates.sh` ya corrió `deno-check` sobre las mismas 3 funciones desde la carpeta de trabajo normal (que sí tiene `node_modules`) y salió OK. Para repetir el check limpio: `cd ~/Riesgo-wt/main/shield-ecuador-app && npm install` una vez (no lo hice, cambia el `node_modules/`, no está en el alcance de "solo lectura").

Ref del proyecto: `wbbcjiqzbzswxsmwjqlw` (el mismo de las descargas de la iteración 6).

## Paso 0 — antes de CADA función
```bash
cd ~/Riesgo-wt/main
git status --short                              # debe salir vacío
git log -1 --oneline                             # debe decir c95cc83 (o el commit que apruebes)
cd shield-ecuador-app
```
Si `git status` no sale vacío, o el commit no es el esperado, **detente** — no despliegues.

## Función 1 de 3 — `security-diagnose`
```bash
# Desplegar (worktree limpio, commit anotado arriba)
supabase functions deploy security-diagnose --project-ref wbbcjiqzbzswxsmwjqlw

# Verificación posterior (solo lectura)
mkdir -p ~/Riesgo-wt/verify-security-diagnose
supabase functions download security-diagnose --project-ref wbbcjiqzbzswxsmwjqlw --use-api --workdir ~/Riesgo-wt/verify-security-diagnose
diff -r ~/Riesgo-wt/verify-security-diagnose/supabase/functions ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/security-diagnose ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/news-agent-core.ts ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/url-guard.ts 2>&1 | grep -v "^Only in"
# (si el diff no imprime nada relevante, lo desplegado == main)

# Prueba de humo: revisar el propio panel (Centro de Seguridad → Diagnóstico) con una URL pública
# y con una privada (10.0.0.1, 127.0.0.1, 169.254.169.254): la privada debe rechazarse con el
# mensaje de _shared/url-guard.ts, no con un error genérico. Revisar los logs de la función después:
supabase functions logs security-diagnose --project-ref wbbcjiqzbzswxsmwjqlw
```

## Función 2 de 3 — `security-easm-scan`
```bash
cd ~/Riesgo-wt/main && git status --short && cd shield-ecuador-app   # repetir paso 0
supabase functions deploy security-easm-scan --project-ref wbbcjiqzbzswxsmwjqlw

mkdir -p ~/Riesgo-wt/verify-security-easm-scan
supabase functions download security-easm-scan --project-ref wbbcjiqzbzswxsmwjqlw --use-api --workdir ~/Riesgo-wt/verify-security-easm-scan
diff -r ~/Riesgo-wt/verify-security-easm-scan/supabase/functions ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/security-easm-scan ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/news-agent-core.ts ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/url-guard.ts 2>&1 | grep -v "^Only in"

# Prueba de humo equivalente + logs:
supabase functions logs security-easm-scan --project-ref wbbcjiqzbzswxsmwjqlw
```

## Función 3 de 3 — `security-kata-convert`
```bash
cd ~/Riesgo-wt/main && git status --short && cd shield-ecuador-app   # repetir paso 0
supabase functions deploy security-kata-convert --project-ref wbbcjiqzbzswxsmwjqlw

mkdir -p ~/Riesgo-wt/verify-security-kata-convert
supabase functions download security-kata-convert --project-ref wbbcjiqzbzswxsmwjqlw --use-api --workdir ~/Riesgo-wt/verify-security-kata-convert
diff -r ~/Riesgo-wt/verify-security-kata-convert/supabase/functions ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/security-kata-convert ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/news-agent-core.ts ~/Riesgo-wt/main/shield-ecuador-app/supabase/functions/_shared/url-guard.ts 2>&1 | grep -v "^Only in"

# Prueba de humo equivalente + logs:
supabase functions logs security-kata-convert --project-ref wbbcjiqzbzswxsmwjqlw
```

## Limpieza
```bash
rm -rf ~/Riesgo-wt/verify-security-diagnose ~/Riesgo-wt/verify-security-easm-scan ~/Riesgo-wt/verify-security-kata-convert
```

## Notas
- Una función a la vez, con su verificación, antes de pasar a la siguiente. Si el `diff` de alguna muestra algo más que las carpetas vacías (`Only in ...`), **detente** y repórtalo antes de seguir con la siguiente función.
- No se toca `config.toml` en este despliegue: las 3 funciones ya tienen `verify_jwt = false` en producción (confirmado en la iteración 6); el `config.toml` de `main` coincide.
- Si el proyecto no está enlazado (`supabase link`) en esa sesión de terminal, el flag `--project-ref` alcanza para `deploy`, `download` y `logs`; no hace falta enlazarlo.
