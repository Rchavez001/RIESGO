// TEMPORAL — T03. Devuelve SOLO las cabeceras de red de la propia petición, para medir qué cadena de
// IP llega a una función en el Supabase hospedado. Se sube, se llama una vez y se borra (ver README).
//   - Solo un administrador (JWT verificado con auth.getUser + users.role = 'admin').
//   - Lista blanca de cabeceras de red: nunca Authorization, apikey, cookies ni cabeceras de cliente.
//   - No escribe nada y NO registra nada (ningún console.*): la respuesta es lo único que sale.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const NETWORK_HEADERS = [
  "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip", "forwarded",
  "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "via",
]

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })

serve(async (req) => {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "sin sesión" }, 401)

  const { data: auth } = await supabase.auth.getUser(token)
  if (!auth?.user) return json({ error: "sesión inválida" }, 401)
  const { data: profile } = await supabase.from("users").select("role").eq("id", auth.user.id).maybeSingle()
  if (profile?.role !== "admin") return json({ error: "solo administradores" }, 403)

  const headers: Record<string, string | null> = {}
  for (const name of NETWORK_HEADERS) headers[name] = req.headers.get(name)
  const chain = (headers["x-forwarded-for"] ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  return json({ headers, xff_entries: chain.length, xff_entries_list: chain })
})
