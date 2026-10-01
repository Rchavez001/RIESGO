// Run: deno test --allow-env --allow-net loop-consentimiento/diag/diag-network-headers/index_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"

const fakeCalls: string[] = []
let role = "admin"
const fake = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
  const { pathname } = new URL(req.url)
  fakeCalls.push(`${req.method} ${pathname}`)
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
  if (pathname === "/auth/v1/user") return req.headers.get("authorization") === "Bearer token-valido" ? j({ id: "u1", aud: "authenticated" }) : j({ msg: "invalid" }, 401)
  if (pathname === "/rest/v1/users") return (req.headers.get("accept") ?? "").includes("vnd.pgrst.object") ? j({ role }) : j([{ role }])
  return j({}, 404)
})
Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

const logged: unknown[][] = []
const originalLog = console.log, originalError = console.error, originalWarn = console.warn, originalInfo = console.info
console.log = (...a) => { logged.push(a) }; console.error = (...a) => { logged.push(a) }; console.warn = (...a) => { logged.push(a) }; console.info = (...a) => { logged.push(a) }
await import("./index.ts")
// std serve prints "Listening on…" once at startup; anything logged after this point is a real log.
await new Promise((r) => setTimeout(r, 300))
logged.length = 0

const call = async (headers: Record<string, string>) => {
  for (let i = 0; i < 20; i++) {
    try { return await fetch("http://127.0.0.1:8000/", { headers }) } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  throw new Error("la función no arrancó")
}
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({ name: "sin Authorization → 401", ...opts, async fn() {
  const res = await call({}); await res.body?.cancel(); assertEquals(res.status, 401)
} })

Deno.test({ name: "sesión inválida → 401", ...opts, async fn() {
  const res = await call({ authorization: "Bearer token-falso" }); await res.body?.cancel(); assertEquals(res.status, 401)
} })

Deno.test({ name: "usuario que no es admin → 403 y no se devuelve ninguna cabecera", ...opts, async fn() {
  role = "user"
  const res = await call({ authorization: "Bearer token-valido", "x-forwarded-for": "9.9.9.9" })
  const text = await res.text()
  assertEquals(res.status, 403)
  assertEquals(text.includes("9.9.9.9"), false)
  role = "admin"
} })

Deno.test({ name: "admin → solo la lista blanca de cabeceras de red; jamás credenciales ni cookies", ...opts, async fn() {
  const res = await call({
    authorization: "Bearer token-valido", apikey: "clave-secreta-de-cliente", cookie: "sesion=abc123",
    "x-forwarded-for": "9.9.9.9, 203.0.113.9", "x-real-ip": "203.0.113.9", "cf-connecting-ip": "203.0.113.9", "x-client-info": "cliente/1.0",
  })
  const body = await res.json()
  assertEquals(res.status, 200)
  assertEquals(body.headers["x-forwarded-for"], "9.9.9.9, 203.0.113.9")
  assertEquals(body.headers["cf-connecting-ip"], "203.0.113.9")
  assertEquals(body.xff_entries, 2)
  assertEquals(res.headers.get("cache-control"), "no-store")
  const raw = JSON.stringify(body)
  for (const secret of ["token-valido", "clave-secreta-de-cliente", "abc123", "cliente/1.0"]) assertEquals(raw.includes(secret), false, `filtró ${secret}`)
  assertEquals(Object.keys(body.headers).sort(), ["cf-connecting-ip", "forwarded", "true-client-ip", "via", "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-real-ip"])
} })

Deno.test({ name: "no escribe nada y no registra nada (ningún console.*)", ...opts, fn() {
  assertEquals(fakeCalls.filter((c) => !c.startsWith("GET ") ), [], "la función hizo una petición que no es de lectura")
  console.log = originalLog; console.error = originalError; console.warn = originalWarn; console.info = originalInfo
  assertEquals(logged, [])
} })
