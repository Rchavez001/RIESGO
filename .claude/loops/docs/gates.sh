#!/usr/bin/env bash
# Puertas de calidad del loop de documentación (shield-ecuador-app/docs). Solo revisa texto: nunca
# ejecuta código del proyecto, nunca toca Supabase/Postgres/Docker, nunca despliega nada. Cada
# puerta imprime `GATE <nombre>: OK|FAIL`; sale con código != 0 si falla alguna.
#
#   bash .claude/loops/docs/gates.sh
#   bash .claude/loops/docs/gates.sh --only "enlaces secretos"   # solo algunas puertas
#   bash .claude/loops/docs/gates.sh --selftest                   # autoprueba: cada puerta inyecta
#                                                                   # su propio fallo controlado
#
# Mismas reglas de invocación que .claude/loops/consentimiento/gates.sh (ver su cabecera): el
# permiso headless concedido es el literal "Bash(bash .claude/loops/docs/gates.sh:*)" — siempre
# sola, sin variables de entorno delante, sin encadenar con && / ; / un cd previo.
set -uo pipefail

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) GATES_ONLY="$2"; shift 2 ;;
    --selftest) GATES_SELFTEST=1; shift ;;
    *) echo "gates.sh: argumento desconocido: $1 (usar --only, --selftest)" >&2; exit 64 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
WORK="$ROOT/loop-docs"
LOGS="$WORK/logs"; mkdir -p "$LOGS"
DOCS_DIR="shield-ecuador-app/docs"
APP_ROOT="shield-ecuador-app"
# Alcance ampliado 2026-10-26: shield-ecuador-app/docs/** (incluye docs/archivo/), loop-docs/**, y
# los .md directamente en la raíz de shield-ecuador-app/ (nunca en subcarpetas: vault/, scripts/,
# frontend/, etc. quedan fuera; manual-central-admin.html queda fuera por ser .html, no .md — ver
# DOC-04 en loop-docs/DECISIONS.md).
ALLOWED_PREFIXES=("$DOCS_DIR" "loop-docs")
is_allowed_root_md() {
  [[ "$1" =~ ^${APP_ROOT}/[^/]+\.md$ ]]
}

FAILED=()
wanted() { [[ -z "${GATES_ONLY:-}" ]] || [[ " ${GATES_ONLY} " == *" $1 "* ]]; }

gate() {
  local name="$1"; shift
  wanted "$name" || return 0
  local log="$LOGS/gate-$name.log" start=$SECONDS
  if ( "$@" ) >"$log" 2>&1; then
    echo "GATE $name: OK ($((SECONDS - start))s)"
  else
    echo "GATE $name: FAIL ($((SECONDS - start))s)  → $log"
    tail -n 20 "$log" | sed 's/^/    | /'
    FAILED+=("$name")
  fi
}

# Archivos a revisar: los que cambiaron en el árbol de trabajo (staged + unstaged + sin
# versionar), nunca todo el repositorio — así cada iteración solo repasa lo que ella misma tocó
# y las puertas corren rápido incluso con cientos de documentos ya existentes.
changed_files() {
  git status --porcelain=1 | awk '{ $1=""; sub(/^ /, ""); print }' | sort -u
}
changed_md_files() {
  changed_files | grep -E '\.md$' || true
}

# ── 1. Ningún archivo modificado fuera de shield-ecuador-app/docs y loop-docs ──────────────────
scope_guard() {
  local f out=()
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local ok=0
    for prefix in "${ALLOWED_PREFIXES[@]}"; do
      [[ "$f" == "$prefix"/* || "$f" == "$prefix" ]] && { ok=1; break; }
    done
    (( ok )) || is_allowed_root_md "$f" && ok=1
    (( ok )) || out+=("$f")
  done < <(changed_files)
  if (( ${#out[@]} > 0 )); then
    echo "Archivos modificados fuera de ${ALLOWED_PREFIXES[*]} y de los .md de la raíz de ${APP_ROOT}:"
    printf '  %s\n' "${out[@]}"
    return 1
  fi
  return 0
}

# ── 2. Enlaces relativos de Markdown resuelven a un archivo real ───────────────────────────────
# [texto](ruta) con ruta relativa (sin http(s)://, sin mailto:, sin anchor-only #...) debe
# resolver, relativo al directorio del propio archivo .md, a algo que exista en el repo.
check_links() {
  local f dir link target rc=0
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    dir="$(dirname "$f")"
    while IFS= read -r link; do
      [[ -z "$link" ]] && continue
      [[ "$link" == http://* || "$link" == https://* || "$link" == mailto:* || "$link" == \#* ]] && continue
      target="${link%%#*}"
      [[ -z "$target" ]] && continue
      if [[ ! -e "$dir/$target" && ! -e "$target" ]]; then
        echo "Enlace roto en $f: [$link] no resuelve a ningún archivo"
        rc=1
      fi
    done < <(grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\((.*)\)$/\1/')
  done < <(changed_md_files)
  return $rc
}

# ── 3. Rutas de código citadas en los documentos cambiados existen de verdad ────────────────────
# Dentro de spans entre backticks que parecen una ruta del repo (contienen "/" y no son una URL ni
# un comando con espacios), confirma que el archivo o directorio exista. Heurística, no exhaustiva
# a propósito: evita falsos positivos sobre fragmentos de código/SQL citados entre backticks que no
# son rutas (p. ej. `SELECT * FROM x`).
check_code_paths() {
  local f path rc=0
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    while IFS= read -r path; do
      [[ -z "$path" ]] && continue
      [[ "$path" == *" "* ]] && continue   # con espacios: probablemente prosa o un comando, no una ruta
      [[ "$path" != */* ]] && continue      # sin "/": no es una ruta de archivo
      [[ "$path" == http://* || "$path" == https://* ]] && continue
      [[ "$path" == *"("* || "$path" == *")"* || "$path" == *"{"* ]] && continue  # sintaxis de código, no ruta
      if [[ ! -e "$path" ]]; then
        echo "Ruta citada en $f no existe en el repo: $path"
        rc=1
      fi
    done < <(grep -oE '`[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+`' "$f" | tr -d '`')
  done < <(changed_md_files)
  return $rc
}

# ── 4. Búsqueda de secretos en los archivos cambiados ───────────────────────────────────────────
# Mismo patrón ya usado en este repo para auditar central-admin-app (claves JWT/API, service_role,
# contraseñas en claro). Nunca debe aparecer en documentación — ni siquiera como ejemplo real.
check_secrets() {
  local f rc=0
  local pattern='eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|service_role|password *[:=] *['"'"'"][^'"'"'"]{4,}'
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    if grep -nE "$pattern" "$f" > /dev/null; then
      echo "Posible secreto en $f:"
      grep -nE "$pattern" "$f" | sed 's/^/  /'
      rc=1
    fi
  done < <(changed_files)
  return $rc
}

# ── 5. Markdown sin errores básicos (bloques de código balanceados) ─────────────────────────────
check_markdown_basic() {
  local f count rc=0
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    count="$(grep -c '^```' "$f" || true)"
    if (( count % 2 != 0 )); then
      echo "Bloque de código sin cerrar en $f (\`\`\` aparece $count veces, debería ser par)"
      rc=1
    fi
  done < <(changed_md_files)
  return $rc
}

if [[ "${GATES_SELFTEST:-0}" == "1" ]]; then
  echo "Autoprueba: cada puerta debe reportar FAIL con un caso inventado, y OK una vez retirado."
  selftest_file="$DOCS_DIR/_gates_selftest.md"
  selftest_outside="fuera-de-alcance-gates-selftest.md"
  cleanup_selftest() {
    rm -f "$selftest_file" "$selftest_outside" "$APP_ROOT/_gates_selftest_root.md" "$APP_ROOT/vault/_gates_selftest.md"
    rmdir "$APP_ROOT/vault" 2>/dev/null || true
  }
  trap cleanup_selftest EXIT

  self_rc=0
  run_case() {
    local label="$1" expect="$2"; shift 2
    local out rc
    out="$("$@" 2>&1)"; rc=$?
    if [[ "$expect" == "fail" && $rc -ne 0 ]] || [[ "$expect" == "ok" && $rc -eq 0 ]]; then
      echo "  OK   $label"
    else
      echo "  FAIL $label (se esperaba $expect, salida: $out)"
      self_rc=1
    fi
  }

  printf 'x\n' > "$selftest_outside"
  run_case "scope: archivo fuera de alcance -> FAIL" fail scope_guard
  rm -f "$selftest_outside"
  run_case "scope: árbol limpio -> OK" ok scope_guard

  root_md_test="$APP_ROOT/_gates_selftest_root.md"
  printf 'x\n' > "$root_md_test"
  run_case "scope: .md en la raíz de $APP_ROOT -> OK" ok scope_guard
  rm -f "$root_md_test"
  vault_test="$APP_ROOT/vault/_gates_selftest.md"
  mkdir -p "$(dirname "$vault_test")"
  printf 'x\n' > "$vault_test"
  run_case "scope: .md en vault/ (subcarpeta de la raíz) -> FAIL" fail scope_guard
  rm -f "$vault_test"
  rmdir "$(dirname "$vault_test")" 2>/dev/null || true

  printf '[roto](./no-existe-de-verdad.md)\n' > "$selftest_file"
  run_case "enlaces: enlace roto -> FAIL" fail check_links
  printf '[inventario](./TPOT_INTEGRATION.md)\n' > "$selftest_file"
  run_case "enlaces: enlace válido -> OK" ok check_links

  printf '`%s/no-existe-de-verdad.md`\n' "$DOCS_DIR" > "$selftest_file"
  run_case "rutas: ruta citada inexistente -> FAIL" fail check_code_paths
  printf '`%s/TPOT_INTEGRATION.md`\n' "$DOCS_DIR" > "$selftest_file"
  run_case "rutas: ruta citada real -> OK" ok check_code_paths

  printf 'password: "abcdef1234"\n' > "$selftest_file"
  run_case "secretos: patrón de contraseña -> FAIL" fail check_secrets
  printf 'texto normal sin secretos\n' > "$selftest_file"
  run_case "secretos: texto limpio -> OK" ok check_secrets

  printf '```\nsin cerrar\n' > "$selftest_file"
  run_case "markdown: bloque de código sin cerrar -> FAIL" fail check_markdown_basic
  printf '```\ncerrado\n```\n' > "$selftest_file"
  run_case "markdown: bloque balanceado -> OK" ok check_markdown_basic

  cleanup_selftest
  trap - EXIT
  if (( self_rc != 0 )); then echo "Autoprueba FALLIDA."; exit 1; fi
  echo "Autoprueba OK: las 5 puertas distinguen el caso roto del caso sano."
  exit 0
fi

gate scope     scope_guard
gate enlaces   check_links
gate rutas     check_code_paths
gate secretos  check_secrets
gate markdown  check_markdown_basic

if (( ${#FAILED[@]} > 0 )); then
  echo ""
  echo "Puertas FALLIDAS: ${FAILED[*]}"
  exit 1
fi
echo ""
echo "Todas las puertas pasaron."
