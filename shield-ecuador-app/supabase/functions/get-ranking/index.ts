import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkRateLimit } from "../_shared/rate-limit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com",
  "icloud.com", "aol.com", "protonmail.com", "tutanota.com",
  "mail.com", "msn.com", "live.com", "altavista.com",
  "ymail.com", "zoho.com", "gmx.com", "fastmail.com",
  "rediffmail.com", "rocketmail.com",
])

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "GET") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const token = authHeader.replace(/^Bearer\s+/i, "")
    if (!token) return jsonResponse({ error: "No autorizado." }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "No autorizado." }, 401)

    // The harvest of every registered user's name and company domain must not be one anonymous sign-in away.
    if (authData.user.is_anonymous) return jsonResponse({ error: "Regístrate para ver la tabla de honor." }, 403)
    const allowed = await checkRateLimit({ req, endpoint: "get-ranking", email: authData.user.id, windowSeconds: 300, maxHits: 30 })
    if (!allowed.allowed) return jsonResponse({ error: "Demasiadas consultas. Espera unos minutos." }, 429)

    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50))

    // XP is what learning_exam_answer awards into users.total_points (the number the dashboard shows).
    // The old source (kata_completions) is only written by the legacy complete-kata function, so new
    // exam passes never reached the ranking.
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email_domain, belt, total_points, full_name_encrypted, email_encrypted")
      .gt("total_points", 0)
      .order("total_points", { ascending: false })
      .limit(500)

    if (usersError) throw usersError
    if (!users || users.length === 0) return jsonResponse({ ranking: [] })

    const userIds = users.map((u) => u.id)
    const katasByUser = new Map<string, Set<string>>()
    const addKata = (uid: string, kata: string) => {
      if (!katasByUser.has(uid)) katasByUser.set(uid, new Set())
      katasByUser.get(uid)!.add(kata)
    }
    const { data: attempts, error: attemptsError } = await supabase
      .from("learning_attempts").select("user_id, dojo_id").eq("passed", true).in("user_id", userIds)
    if (attemptsError) throw attemptsError
    for (const row of attempts ?? []) addKata(row.user_id, `dojo:${row.dojo_id}`)
    const { data: legacy } = await supabase.from("kata_completions").select("user_id, kata_id").in("user_id", userIds)
    for (const row of legacy ?? []) addKata(row.user_id, `kata:${row.kata_id}`)

    const ranked: Array<{
      rank: number
      full_name: string
      belt: string
      total_xp: number
      katas_completed: number
      email_domain: string | null
    }> = []

    for (const user of users) {
      let domain = user.email_domain ?? null

      if (!domain && user.email_encrypted) {
        try {
          const email = await decryptEmail(user.email_encrypted)
          if (email) {
            const atIndex = email.lastIndexOf("@")
            if (atIndex >= 0 && atIndex < email.length - 1) {
              domain = email.slice(atIndex + 1).toLowerCase()
            }
          }
        } catch {
          // fall through
        }
      }

      if (!domain || PUBLIC_DOMAINS.has(domain)) continue

      let fullName = ""
      if (user.full_name_encrypted) {
        try {
          fullName = await decryptString(user.full_name_encrypted)
        } catch {
          fullName = "Guerrero"
        }
      }

      fullName = publicName(fullName)

      const uid = user.id
      ranked.push({
        rank: 0,
        full_name: fullName,
        belt: user.belt ?? "white",
        total_xp: user.total_points ?? 0,
        katas_completed: katasByUser.get(uid)?.size ?? 0,
        email_domain: domain,
      })
    }

    ranked.sort((a, b) => b.total_xp - a.total_xp)
    ranked.slice(0, limit).forEach((entry, index) => {
      entry.rank = index + 1
    })

    const topDomain = ranked.length > 0 ? ranked[0].email_domain : null

    return jsonResponse({
      ranking: ranked.slice(0, limit),
      meta: {
        total: ranked.length,
        top_domain: topDomain,
      },
    })
  } catch (error) {
    console.error("get-ranking failed:", safeError(error))
    return jsonResponse({ error: "No se pudo obtener el ranking." }, 500)
  }
})

// Data minimisation: the board is visible to every registered user, so show "Ana P." rather than the full name.
function publicName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "Guerrero"
  const first = parts[0].slice(0, 24)
  return parts.length > 1 ? `${first} ${Array.from(parts[parts.length - 1])[0].toUpperCase()}.` : first
}

type EncryptedPayload = {
  v: number
  alg: string
  iv: string
  tag: string
  ct: string
}

async function decryptEmail(payload: EncryptedPayload) {
  const key = await getAesKey()
  const iv = fromBase64(payload.iv)
  const ct = fromBase64(payload.ct)
  const tag = fromBase64(payload.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct)
  joined.set(tag, ct.length)
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, joined)
  return new TextDecoder().decode(decrypted)
}

async function decryptString(payload: EncryptedPayload) {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return ""
  const key = await getAesKey()
  const iv = fromBase64(payload.iv)
  const ct = fromBase64(payload.ct)
  const tag = fromBase64(payload.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct)
  joined.set(tag, ct.length)
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, joined)
  return new TextDecoder().decode(decrypted)
}

async function getAesKey() {
  const raw = getEncryptionKeyBytes()
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
}

function getEncryptionKeyBytes() {
  const value = Deno.env.get("PII_ENCRYPTION_KEY_B64") ?? ""
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error("invalid_pii_key")
  return bytes
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function safeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: "unknown" }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
