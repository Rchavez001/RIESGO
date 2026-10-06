# Pendiente: enganchar `e2e_local_compensation.cjs` en `gates.sh` (cierra TEST-INT.a, 3er criterio)

**Por qué este archivo existe:** esta sesión no pudo editar `.claude/loops/consentimiento/gates.sh`
directamente — el `Edit` dio "File is in a directory that is denied by your permission settings"
(misma protección del harness que ya documentó D-14 para T12.b en la iteración 28; no es un bloqueo
de modo headless específicamente, pasó igual en esta sesión). Necesita una sesión sin esa restricción
(interactiva, como resolvió D-14) o un humano, que aplique el cambio de abajo EN EL MISMO gesto que
confirme que pasa.

**Lo que SÍ se pudo dejar listo en el árbol real (sin tocar `.claude/`):**
`supabase/tests/consent/e2e_local_compensation.cjs` (ya creado y commiteado) — prueba HTTP contra
Supabase local real que registra un usuario nuevo y comprueba que, si el INSERT en `consent_records`
falla, `secure-register-user` compensó: no queda fila en `users` ni usuario de `auth` con esas
credenciales. Asume que el llamador YA revocó `INSERT ... TO service_role` en `consent_records`
antes de invocarlo y lo restaura después (ver abajo) — el script en sí no toca privilegios.

**Qué falta: el cambio en `gates.sh`.** Dentro de `e2e_local()`, justo después de la llamada a
`node "$TESTS/e2e_local.cjs"` y antes del comentario `# \`publish_consent_document_e2e_local.cjs\`
siembra...`, insertar:

```bash
  # TEST-INT.a (3er criterio): compensación real cuando el INSERT de consent_records falla en
  # Postgres DE VERDAD (no un 500 simulado por el fake de index_test.ts) — revoca el privilegio real,
  # deja que secure-register-user choque contra la restricción real, y lo restaura siempre (éxito o
  # fallo del test).
  local compensation_status=0
  psql_db -c "REVOKE INSERT ON public.consent_records FROM service_role;" \
    || { echo "no se pudo revocar INSERT en consent_records para TEST-INT.a"; return 1; }
  ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node "$TESTS/e2e_local_compensation.cjs" || compensation_status=$?
  psql_db -c "GRANT INSERT ON public.consent_records TO service_role;" \
    || { echo "no se pudo restaurar el GRANT de INSERT en consent_records tras TEST-INT.a"; return 1; }
  [[ "$compensation_status" -eq 0 ]] || return 1
```

**Verificación esperada tras aplicarlo:** `bash .claude/loops/consentimiento/gates.sh --only e2e-local --e2e-local`
en verde, con la nueva línea `OK  inserción de evidencia bloqueada de verdad en Postgres -> 400
genérico...` y las dos de compensación en la salida de `e2e_local_compensation.cjs`. Si pasa:
marcar TEST-INT.a `[x]` en TASKS.md (ya no queda ningún criterio suelto: los otros 2/3 los cubre
`e2e_local.cjs` desde la iteración 31) y borrar este archivo.

**Supuesto a confirmar al aplicarlo:** que `service_role` tiene hoy el privilegio `INSERT` en
`consent_records` por una concesión directa (o heredada de privilegios por defecto al crear la
tabla) que un `REVOKE`/`GRANT` explícito sobre la tabla puede quitar y devolver sin alterar nada
más. No se verificó en esta sesión porque llegar a ese punto requiere la propia edición de
`gates.sh` que está bloqueada; si el supuesto es falso (p. ej. `service_role` hereda el privilegio de
pertenecer a otro rol con `GRANT ALL`, en cuyo caso el `REVOKE` sobre la tabla no bloquea nada), el
test fallará con "compensación" verde pero el 400 nunca llegará a producirse — hay que confirmarlo
con un `\dp consent_records` (psql) antes de confiar en el resultado.
