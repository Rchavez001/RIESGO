import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

type EncryptedPayload = {
  v: number
  alg: string
  iv: string
  tag: string
  ct: string
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const requester = await requireAdminOrSecret(req)
    const body = await req.json().catch(() => ({}))
    const limit = Math.max(1, Math.min(500, Number(body.limit ?? 100)))

    const { data: users, error } = await supabase
      .from("users")
      .select("id, email_encrypted, email_domain")
      .is("email_domain", null)
      .not("email_encrypted", "is", null)
      .limit(limit)

    if (error) throw error
    if (!users || users.length === 0) return jsonResponse({ migrated: 0, message: "No users need backfill." })

    let updated = 0
    for (const user of users) {
      try {
        const email = await decryptEmail(user.email_encrypted)
        if (!email) continue
        const atIndex = email.lastIndexOf("@")
        if (atIndex < 0 || atIndex >= email.length - 1) continue
        const domain = email.slice(atIndex + 1).toLowerCase()

        const { error: updateError } = await supabase
          .from("users")
          .update({ email_domain: domain })
          .eq("id", user.id)

        if (updateError) {
          console.error(`Failed to update domain for user ${user.id}:`, updateError)
          continue
        }
        updated += 1
      } catch {
        console.error(`Failed to decrypt email for user ${user.id}`)
      }
    }

    await supabase.from("security_audit_events").insert({
      actor_user_id: requester === "scheduler" ? null : requester,
      event_type: "email_domain_backfill_completed",
      metadata: { processed: users.length, updated },
    })

    return jsonResponse({ migrated: updated, total_processed: users.length })
  } catch (error) {
    console.error("backfill-email-domains failed:", safeError(error))
    return jsonResponse({ error: "No se pudo completar el backfill." }, getStatus(error))
  }
})

async function decryptEmail(payload: EncryptedPayload) {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return null
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
  return crypto.subtle.importKey("raw", getEncryptionKeyBytes(), "AES-GCM", false, ["decrypt"])
}

function getEncryptionKeyBytes() {
  const value = Deno.env.get("PII_ENCRYPTION_KEY_B64") ?? ""
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error("invalid_pii_key")
  return bytes
}

async function requireAdminOrSecret(req: Request) {
  const cronSecret = Deno.env.get("CRON_SECRET")
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return "scheduler"

  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (!token) throw new HttpError("No autorizado.", 401)

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new HttpError("No autorizado.", 401)

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single()

  if (profile?.role !== "admin") throw new HttpError("No autorizado.", 403)
  return authData.user.id
}

class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function getStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500
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
