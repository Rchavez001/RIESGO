import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

type EncryptedPayload = {
  v: number
  alg: "AES-256-GCM"
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
    const limit = Math.max(1, Math.min(200, Number(body.limit ?? 50)))
    const keyVersion = getKeyVersion()

    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, phone, full_name, location_city, location_province, email_encrypted, pii_migration_status")
      .or("pii_migration_status.eq.pending,pii_migration_status.is.null")
      .limit(limit)

    if (error) throw error

    let migrated = 0
    for (const user of users ?? []) {
      const currentEmail = isMaskedEmail(user.email) ? "" : String(user.email ?? "")
      const emailEncrypted = user.email_encrypted ?? (currentEmail ? await encryptString(currentEmail, keyVersion) : null)
      const emailLookupHmac = currentEmail ? await hmacLookup(currentEmail.toLowerCase()) : null
      const emailDomain = currentEmail ? extractDomain(currentEmail) : null

      const updatePayload = {
        email: `${user.id}@private.local`,
        email_encrypted: emailEncrypted,
        email_lookup_hmac: emailLookupHmac,
        email_domain: emailDomain,
        full_name: null,
        phone: null,
        location_city: null,
        location_province: null,
        full_name_encrypted: user.full_name ? await encryptString(String(user.full_name), keyVersion) : null,
        phone_encrypted: user.phone ? await encryptString(String(user.phone), keyVersion) : null,
        location_city_encrypted: user.location_city ? await encryptString(String(user.location_city), keyVersion) : null,
        location_province_encrypted: user.location_province ? await encryptString(String(user.location_province), keyVersion) : null,
        pii_key_version: keyVersion,
        pii_encrypted_at: new Date().toISOString(),
        pii_migration_status: "encrypted",
      }

      const { error: updateError } = await supabase.from("users").update(updatePayload).eq("id", user.id)
      if (updateError) throw updateError
      migrated += 1
    }

    await supabase.from("security_audit_events").insert({
      actor_user_id: requester === "scheduler" ? null : requester,
      event_type: "pii_migration_batch_completed",
      metadata: { migrated, limit, key_version: keyVersion },
    })

    return jsonResponse({ migrated })
  } catch (error) {
    console.error("migrate-user-pii failed:", safeError(error))
    return jsonResponse({ error: "No se pudo ejecutar la migracion de PII." }, getStatus(error))
  }
})

async function requireAdminOrSecret(req: Request) {
  const cronSecret = Deno.env.get("PII_MIGRATION_SECRET") || Deno.env.get("CRON_SECRET")
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

function isMaskedEmail(value: string) {
  return /@private\.local$/i.test(value)
}

function extractDomain(email: string) {
  const atIndex = email.lastIndexOf("@")
  if (atIndex < 0 || atIndex >= email.length - 1) return null
  return email.slice(atIndex + 1).toLowerCase()
}

async function encryptString(value: string, keyVersion: number): Promise<EncryptedPayload> {
  const cryptoKey = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encoded))
  const tag = encrypted.slice(encrypted.length - 16)
  const ct = encrypted.slice(0, encrypted.length - 16)
  return { v: keyVersion, alg: "AES-256-GCM", iv: toBase64(iv), tag: toBase64(tag), ct: toBase64(ct) }
}

async function hmacLookup(value: string) {
  const key = await getHmacKey()
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function getAesKey() {
  return crypto.subtle.importKey("raw", getEncryptionKeyBytes(), "AES-GCM", false, ["encrypt"])
}

async function getHmacKey() {
  return crypto.subtle.importKey("raw", getEncryptionKeyBytes(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
}

function getEncryptionKeyBytes() {
  const value = Deno.env.get("PII_ENCRYPTION_KEY_B64") ?? ""
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error("invalid_pii_key")
  return bytes
}

function getKeyVersion() {
  const version = Number(Deno.env.get("PII_KEY_VERSION") ?? "1")
  if (!Number.isInteger(version) || version < 1) throw new Error("invalid_key_version")
  return version
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}

function toBase64Url(value: Uint8Array) {
  return toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
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
