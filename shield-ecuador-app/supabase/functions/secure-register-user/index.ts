import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? "")
    const fullName = normalizeText(body.full_name, 120)
    const businessType = normalizeBusinessType(body.business_type)
    const consent = body.data_processing_authorized === true

    await validateRegistration({ email, password, fullName, businessType, consent })

    const keyVersion = getKeyVersion()
    const emailEncrypted = await encryptString(email, keyVersion)
    const fullNameEncrypted = fullName ? await encryptString(fullName, keyVersion) : null
    const emailLookupHmac = await hmacLookup(email)
    const now = new Date().toISOString()

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email_lookup_hmac", emailLookupHmac)
      .maybeSingle()

    if (existing) return jsonResponse({ error: "Ya existe una cuenta con ese correo. Usa Ingresar." }, 409)

    let createdUserId: string | null = null
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        privacy_notice_version: "2026-06-22",
        data_processing_authorized: true,
      },
    })

    if (createError || !created.user) {
      const existingAuthUser = await findAuthUserByEmail(email)
      if (!existingAuthUser?.id) {
        await auditEvent("registration_failed", null, { reason: "auth_create_failed" }, req)
        return jsonResponse({ error: "No se pudo completar el registro. Si ya tienes cuenta, usa Ingresar." }, 400)
      }
      createdUserId = existingAuthUser.id
    } else {
      createdUserId = created.user.id
    }

    const emailDomain = extractDomain(email)
    const maskedEmail = `${createdUserId}@private.local`
    const { error: profileError } = await supabase.from("users").upsert({
      id: createdUserId,
      email: maskedEmail,
      email_encrypted: emailEncrypted,
      email_lookup_hmac: emailLookupHmac,
      email_domain: emailDomain,
      full_name: null,
      full_name_encrypted: fullNameEncrypted,
      business_type: businessType,
      location_city: null,
      location_province: null,
      pii_key_version: keyVersion,
      pii_encrypted_at: now,
      pii_migration_status: "encrypted",
      data_processing_authorized: true,
      data_processing_authorized_at: now,
      privacy_notice_version: "2026-06-22",
      privacy_updated_at: now,
    }, { onConflict: "id" })

    if (createError || !created.user) {
      const { error: passwordUpdateError } = await supabase.auth.admin.updateUserById(createdUserId, {
        password,
        email_confirm: true,
      })
      if (passwordUpdateError) {
        await auditEvent("registration_warning", createdUserId, { reason: "password_update_existing_auth_failed" }, req)
      }
    }

    if (profileError) {
      if (!createError && created.user) await supabase.auth.admin.deleteUser(created.user.id)
      await auditEvent("registration_failed", createdUserId, { reason: "profile_insert_failed" }, req)
      return jsonResponse({ error: "No se pudo completar el registro." }, 400)
    }

    await auditEvent("registration_completed", createdUserId, { pii_encrypted: true, key_version: keyVersion }, req)

    return jsonResponse({ user_id: createdUserId, status: "created" })
  } catch (error) {
    console.error("secure-register-user failed:", safeError(error))
    return jsonResponse({ error: "No se pudo completar el registro." }, 400)
  }
})

async function validateRegistration(input: { email: string; password: string; fullName: string; businessType: string; consent: boolean }) {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("invalid_email")
  if (input.password.length < 8 || input.password.length > 128) throw new Error("invalid_password")
  if (!input.fullName || input.fullName.length < 2) throw new Error("invalid_full_name")
  if (!input.consent) throw new Error("missing_privacy_consent")

  const { data, error } = await supabase
    .from("business_sectors")
    .select("code")
    .eq("code", input.businessType)
    .eq("active", true)
    .maybeSingle()

  if (error || !data) throw new Error("invalid_business_type")
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 254)
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function normalizeBusinessType(value: unknown) {
  const normalized = normalizeText(value, 40).toLowerCase()
  if (normalized.includes("restaurante")) return "restaurante"
  return normalized
}

function extractDomain(email: string) {
  const atIndex = email.lastIndexOf("@")
  if (atIndex < 0 || atIndex >= email.length - 1) return null
  return email.slice(atIndex + 1).toLowerCase()
}

async function findAuthUserByEmail(email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const user = data.users.find((item) => item.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < 1000) return null
  }
  return null
}

async function encryptString(value: string, keyVersion: number): Promise<EncryptedPayload> {
  const cryptoKey = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encoded))
  const tag = encrypted.slice(encrypted.length - 16)
  const ct = encrypted.slice(0, encrypted.length - 16)
  return {
    v: keyVersion,
    alg: "AES-256-GCM",
    iv: toBase64(iv),
    tag: toBase64(tag),
    ct: toBase64(ct),
  }
}

async function hmacLookup(value: string) {
  const key = await getHmacKey()
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function getAesKey() {
  const raw = getEncryptionKeyBytes()
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
}

async function getHmacKey() {
  const raw = getEncryptionKeyBytes()
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
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

async function auditEvent(eventType: string, targetUserId: string | null, metadata: Record<string, unknown>, req: Request) {
  await supabase.from("security_audit_events").insert({
    actor_user_id: null,
    event_type: eventType,
    target_user_id: targetUserId,
    metadata,
    ip_hash: await optionalHash(req.headers.get("x-forwarded-for") ?? ""),
    user_agent_hash: await optionalHash(req.headers.get("user-agent") ?? ""),
  })
}

async function optionalHash(value: string) {
  if (!value) return null
  const key = await getHmacKey()
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value.slice(0, 512)))
  return toBase64Url(new Uint8Array(signature))
}

function safeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: "unknown" }
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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
