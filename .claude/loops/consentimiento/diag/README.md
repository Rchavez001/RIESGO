# T03 — medir qué IP llega a las funciones en Supabase hospedado

Objetivo: decidir con qué cabecera se identifica al cliente (¿`cf-connecting-ip`?, ¿una posición fija de
`x-forwarded-for`?) para tres cosas: la IP de la evidencia (`_shared/client-ip.ts`), el rate limit y `security_events`.
En local se midió: el proxy AÑADE la IP real al final de `x-forwarded-for` y deja delante lo que envíe el cliente;
`x-real-ip` lo fija el proxy. Falta ver el hospedado (probablemente hay Cloudflare delante).

**Nada de esto se ejecutó contra producción.** Paso 1 es solo lectura en el panel; el paso 2 sube una función.

## Paso 1 — Logs Explorer (sin desplegar nada)
Panel de Supabase → Logs → Logs Explorer → pega la consulta. Sirve cualquier función que ya esté desplegada y reciba
tráfico real (por ejemplo `secure-register-user`, `get-ranking`).

```sql
select
  timestamp,
  request.method as method,
  request.pathname as path,
  response.status_code as status,
  h.cf_connecting_ip,
  h.x_real_ip,
  h.x_forwarded_for,
  h.forwarded,
  h.x_forwarded_proto,
  h.user_agent
from function_edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
  cross join unnest(request.headers) as h
where request.pathname like '%secure-register-user%'
order by timestamp desc
limit 20
```

Si el Explorer dice que alguna columna no existe (el conjunto de cabeceras que se registra lo decide Supabase, no nosotros),
quita esa columna, o mira qué hay realmente con:

```sql
select timestamp, event_message, metadata from function_edge_logs order by timestamp desc limit 3
```
y expande `metadata → request → headers` en el visor.

Cuidado con lo que muestra: `cf_connecting_ip` es la IP real de personas reales. Para decidir basta con mirar 5–10 filas y
NO copiarlas a ningún sitio.

**Límite de este método:** el log muestra las cabeceras en la puerta de Supabase, no necesariamente lo que ve tu función
después de todos los saltos. Si `x_forwarded_for` no aparece en el log, o no se puede saber cuántos valores añadió cada salto,
pasa al paso 2.

## Paso 2 — función de diagnóstico (solo si el paso 1 no alcanza) — REQUIERE TU OK: es producción
`diag-network-headers/index.ts`: solo administradores (JWT verificado + `users.role = 'admin'`), devuelve únicamente una lista
blanca de cabeceras de red de la propia petición, no escribe nada, no registra nada (probado: 5 pruebas Deno).

```bash
# 1. copiar a supabase/functions (desde la raíz del repo)
cp -r .claude/loops/consentimiento/diag/diag-network-headers shield-ecuador-app/supabase/functions/
rm shield-ecuador-app/supabase/functions/diag-network-headers/index_test.ts

# 2. desplegar SOLO esa función
cd shield-ecuador-app && supabase functions deploy diag-network-headers

# 3. llamarla UNA vez con la sesión de un administrador (el access_token de tu sesión en la app;
#    la apikey es la publishable/anon de la app)
curl -s https://wbbcjiqzbzswxsmwjqlw.supabase.co/functions/v1/diag-network-headers \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ACCESS_TOKEN_DE_ADMIN>"
# Repetir enviando una cabecera falsa para ver si se antepone o se reemplaza:
#   -H "X-Forwarded-For: 9.9.9.9"

# 4. BORRAR de inmediato
supabase functions delete diag-network-headers
rm -r supabase/functions/diag-network-headers
supabase functions list        # ya no debe aparecer
```

## Cómo leer el resultado
| Lo que se ve | Decisión |
|---|---|
| `cf-connecting-ip` presente y no cambia al enviar `X-Forwarded-For: 9.9.9.9` | Cabecera de confianza = `cf-connecting-ip` (la fija Cloudflare y sobrescribe lo del cliente). Usarla en `client-ip.ts`, rate limit y `security_events`. |
| No hay `cf-connecting-ip`; el falso aparece DELANTE en `x-forwarded-for` y la IP real DETRÁS | `TRUSTED_PROXY_HOPS` = número de valores que añaden los saltos (medirlo restando: entradas con el falso − entradas sin él es 1; el índice desde el final es el número de saltos). |
| El falso REEMPLAZA a la cadena | La primera entrada ya es de confianza; el riesgo actual no existe en hospedado. Documentarlo y dejar la prueba. |
| `x-real-ip` cambia con el falso | No usarla. |

Después: T03-sec (P0) — hacer que el rate limit y `security_events` usen la cabecera de confianza, no la primera entrada de
`x-forwarded-for`, y unificar `extractClientIp` con `_shared/client-ip.ts`. Con esa medición, sin adivinar la topología.
