import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 50)))

    const { data: completions, error: completionsError } = await supabase
      .from("kata_completions")
      .select("user_id, points_earned, kata_id")
      .not("user_id", "is", null)

    if (completionsError) throw completionsError

    if (!completions || completions.length === 0) {
      return jsonResponse({ ranking: [] })
    }

    const xpByUser = new Map<string, number>()
    const katasByUser = new Map<string, Set<string>>()
    for (const row of completions) {
      const uid = row.user_id
      xpByUser.set(uid, (xpByUser.get(uid) ?? 0) + (row.points_earned ?? 0))
      if (!katasByUser.has(uid)) katasByUser.set(uid, new Set())
      katasByUser.get(uid)!.add(row.kata_id)
    }

    const userIds = Array.from(xpByUser.keys())
    if (userIds.length === 0) return jsonResponse({ ranking: [] })

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email_domain, belt, full_name_encrypted, email_encrypted")
      .in("id", userIds)

    if (usersError) throw usersError
    if (!users || users.length === 0) return jsonResponse({ ranking: [] })

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

      if (!fullName) fullName = "Guerrero"

      const uid = user.id
      ranked.push({
        rank: 0,
        full_name: fullName,
        belt: user.belt ?? "white",
        total_xp: xpByUser.get(uid) ?? 0,
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
