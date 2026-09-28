import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkRateLimit } from "../_shared/rate-limit.ts"
import { logSecurityEvent } from "../_shared/security-events.ts"
import { getClientIp } from "../_shared/client-ip.ts"
import { encryptPii, getActiveKeyVersion, hmacLookup } from "../_shared/crypto.ts"
import { encryptConsentColumn } from "../_shared/consent-evidence.ts"
import { renderConsentMarkers, sha256Hex } from "../_shared/consent-render.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Purpose = { code: string; label: string; description?: string; required: boolean; order?: number }
type ConsentDecisionInput = { purpose_code?: unknown; decision?: unknown }

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

// A client-supplied value under any of these keys is a spoofing attempt — REQ-05:
// only the trusted-proxy header (read server-side, see _shared/security-events.ts)
// is ever trusted for the evidence's IP.
const CLIENT_IP_SPOOF_KEYS = ["ip", "client_ip", "ip_address", "clientIp"]

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? "")
    const fullName = normalizeText(body.full_name, 120)
    const businessType = normalizeBusinessType(body.business_type)

    // T10 / SEC-07: registration writes consent evidence, so it fails CLOSED — if the quota
    // cannot be established, nobody registers (and nothing is created) until it can.
    const rateLimit = await checkRateLimit({ req, endpoint: "secure-register-user", email, failClosed: true })
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "unavailable") {
        await logSecurityEvent({
          req, endpoint: "secure-register-user", event_type: "rate_limit_unavailable", severity: "alta",
        })
        return jsonResponse({
          error: "RATE_LIMIT_UNAVAILABLE",
          message: "El registro no está disponible en este momento, intenta en unos minutos",
        }, 503)
      }
      await logSecurityEvent({
        req, endpoint: "secure-register-user", event_type: "rate_limit_exceeded", severity: "media",
        metadata: { reason: rateLimit.reason },
      })
      return jsonResponse({ error: "Demasiados intentos. Espera unos minutos y vuelve a intentar." }, 429)
    }

    if (CLIENT_IP_SPOOF_KEYS.some((key) => body[key] !== undefined)) {
      await logSecurityEvent({
        req, endpoint: "secure-register-user", event_type: "consent_ip_spoof_attempt", severity: "alta",
        metadata: { keys: CLIENT_IP_SPOOF_KEYS.filter((key) => body[key] !== undefined) },
      })
      // Ignored, not fatal — the real IP below is what gets used regardless.
    }

    // REQ-05: the address the trusted proxy appended, not the first X-Forwarded-For entry (client-controlled).
    const clientIp = getClientIp(req)
    if (!clientIp) throw new Error("missing_client_ip")
    const userAgent = req.headers.get("user-agent") ?? ""

    const sector = await validateRegistration({ email, password, fullName, businessType })

    const { document: publishedDoc, settings } = await loadPublishedNoticeAndSettings()
    const purposes = parsePurposes(publishedDoc.purposes)
    const { decisions, renderedSha256 } = await validateConsentNotice(body.consent_notice, publishedDoc, settings, purposes)

    if (body.age_gate !== true) {
      throw new AgeGateError(settings.privacy_email)
    }

    const keyVersion = getActiveKeyVersion()
    const emailEncrypted = await encryptPii(email, keyVersion)
    const fullNameEncrypted = fullName ? await encryptPii(fullName, keyVersion) : null
    const emailLookupHmac = await hmacLookup(email, "LOOKUP_HMAC_KEY_B64")
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
        privacy_notice_version: publishedDoc.version,
        data_processing_authorized: true,
      },
    })

    if (createError || !created.user) {
      const existingAuthUser = await findAuthUserByEmail(email)
      if (!existingAuthUser?.id) {
        await auditEvent("registration_failed", null, { reason: "auth_create_failed" }, req)
        await logSecurityEvent({ req, endpoint: "secure-register-user", event_type: "registration_failed", severity: "media", metadata: { reason: "auth_create_failed" } })
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
      sector,
      location_city: null,
      location_province: null,
      pii_key_version: keyVersion,
      pii_encrypted_at: now,
      pii_migration_status: "encrypted",
      data_processing_authorized: true,
      data_processing_authorized_at: now,
      privacy_notice_version: publishedDoc.version,
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
      await logSecurityEvent({ req, endpoint: "secure-register-user", event_type: "registration_failed", severity: "alta", metadata: { reason: "profile_insert_failed" } })
      return jsonResponse({ error: "No se pudo completar el registro." }, 400)
    }

    // REQ-07: no account may exist without evidence of the required purpose.
    // A failure here compensates by removing what this call just created.
    const consentInsertError = await insertConsentEvidence({
      userId: createdUserId, document: publishedDoc, settings, decisions, renderedSha256,
      ip: clientIp, userAgent, keyVersion,
    })

    if (consentInsertError) {
      await supabase.from("users").delete().eq("id", createdUserId)
      if (!createError && created.user) await supabase.auth.admin.deleteUser(created.user.id)
      await auditEvent("registration_failed", createdUserId, { reason: "consent_evidence_insert_failed" }, req)
      await logSecurityEvent({ req, endpoint: "secure-register-user", event_type: "registration_failed", severity: "critica", metadata: { reason: "consent_evidence_insert_failed" } })
      return jsonResponse({ error: "No se pudo completar el registro." }, 400)
    }

    await auditEvent("registration_completed", createdUserId, { pii_encrypted: true, key_version: keyVersion, consent_document_version: publishedDoc.version }, req)

    return jsonResponse({ user_id: createdUserId, status: "created" })
  } catch (error) {
    if (error instanceof NoticeChangedError) {
      return jsonResponse({ error: "notice_changed", message: "El aviso de privacidad cambió mientras completabas el formulario. Vuelve a revisarlo." }, 409)
    }
    if (error instanceof AgeGateError) {
      return jsonResponse({
        error: "age_gate_failed",
        message: "No podemos crear cuentas para menores de 15 años de forma autónoma. Pide a tu representante legal que escriba a " + error.privacyEmail + " para completar el registro.",
      }, 403)
    }
    console.error("secure-register-user failed:", safeError(error))
    const knownValidationErrors = [
      "invalid_email", "invalid_password", "invalid_full_name", "invalid_business_type",
      "missing_client_ip", "notice_not_published", "settings_unavailable", "missing_required_consent",
    ]
    if (!knownValidationErrors.includes((error as Error)?.message)) {
      await logSecurityEvent({ req, endpoint: "secure-register-user", event_type: "unhandled_exception", severity: "alta", metadata: { name: (error as Error)?.name } })
    }
    return jsonResponse({ error: "No se pudo completar el registro." }, 400)
  }
})

class NoticeChangedError extends Error {}
class AgeGateError extends Error {
  privacyEmail: string
  constructor(privacyEmail: string) { super("age_gate_failed"); this.privacyEmail = privacyEmail }
}

async function loadPublishedNoticeAndSettings() {
  const { data: document, error: docError } = await supabase
    .from("consent_documents")
    .select("id, version, content_md, purposes")
    .eq("status", "published")
    .maybeSingle()
  if (docError || !document) throw new Error("notice_not_published")

  const { data: settings, error: settingsError } = await supabase
    .from("privacy_settings_current")
    .select("settings_version, controller_name, controller_address, controller_phone, privacy_email, dpo_name, dpo_contact, privacy_policy_url, response_days, response_day_type")
    .maybeSingle()
  if (settingsError || !settings) throw new Error("settings_unavailable")

  return { document, settings }
}

function parsePurposes(raw: unknown): Purpose[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Purpose => !!item && typeof item.code === "string")
}

// Recomputes today's rendered text server-side rather than trusting the
// client's claimed hash — a mismatch means the notice changed underneath the
// visitor between page-load and submit (SEC: "verificar que la huella
// coincide con la versión vigente").
async function validateConsentNotice(
  raw: unknown,
  document: { id: string; version: string; content_md: string },
  settings: { settings_version: number; [key: string]: unknown },
  purposes: Purpose[],
): Promise<{ decisions: Array<{ purpose_code: string; decision: "granted" | "denied" }>; renderedSha256: string }> {
  const notice = raw as { document_id?: unknown; rendered_sha256?: unknown; settings_version?: unknown; decisions?: unknown } | null
  if (!notice || typeof notice !== "object") throw new Error("missing_required_consent")

  const renderedMd = renderConsentMarkers(document.content_md, settings as never)
  const expectedHash = await sha256Hex(renderedMd)

  if (notice.document_id !== document.id || notice.settings_version !== settings.settings_version || notice.rendered_sha256 !== expectedHash) {
    throw new NoticeChangedError()
  }

  const submitted = Array.isArray(notice.decisions) ? (notice.decisions as ConsentDecisionInput[]) : []
  const decisions: Array<{ purpose_code: string; decision: "granted" | "denied" }> = []

  for (const purpose of purposes) {
    const match = submitted.find((item) => item.purpose_code === purpose.code)
    const decision: "granted" | "denied" = match?.decision === "granted" ? "granted" : "denied"
    if (purpose.required && decision !== "granted") throw new Error("missing_required_consent")
    decisions.push({ purpose_code: purpose.code, decision })
  }

  return { decisions, renderedSha256: expectedHash }
}

async function insertConsentEvidence(params: {
  userId: string
  document: { id: string; version: string }
  settings: { settings_version: number }
  decisions: Array<{ purpose_code: string; decision: "granted" | "denied" }>
  renderedSha256: string
  ip: string
  userAgent: string
  keyVersion: number
}): Promise<boolean> {
  const userRefHmac = await hmacLookup(params.userId, "LOOKUP_HMAC_KEY_B64")
  // SEC-04: bound to table:column:owner (see _shared/consent-evidence.ts) so the ciphertext cannot be
  // moved to another row or column.
  const ipCiphertext = await encryptConsentColumn(params.ip, params.keyVersion, "ip_ciphertext", userRefHmac)
  const ipHmac = await hmacLookup(params.ip, "LOOKUP_HMAC_KEY_B64")
  const uaCiphertext = params.userAgent
    ? await encryptConsentColumn(params.userAgent, params.keyVersion, "ua_ciphertext", userRefHmac)
    : null
  const uaHmac = params.userAgent ? await hmacLookup(params.userAgent, "LOOKUP_HMAC_KEY_B64") : null

  const rows = params.decisions.map((item) => ({
    user_id: params.userId,
    user_ref_hmac: userRefHmac,
    document_id: params.document.id,
    document_version: params.document.version,
    rendered_sha256: params.renderedSha256,
    settings_version: params.settings.settings_version,
    purpose_code: item.purpose_code,
    decision: item.decision,
    channel: "registro",
    ip_ciphertext: ipCiphertext,
    ip_hmac: ipHmac,
    ua_ciphertext: uaCiphertext,
    ua_hmac: uaHmac,
    key_version: params.keyVersion,
  }))

  const { error } = await supabase.from("consent_records").insert(rows)
  return !!error
}

async function validateRegistration(input: { email: string; password: string; fullName: string; businessType: string }) {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("invalid_email")
  if (input.password.length < 8 || input.password.length > 128) throw new Error("invalid_password")
  if (!input.fullName || input.fullName.length < 2) throw new Error("invalid_full_name")

  const { data, error } = await supabase
    .from("business_sectors")
    .select("code, industry")
    .eq("code", input.businessType)
    .eq("active", true)
    .maybeSingle()

  if (error || !data) throw new Error("invalid_business_type")

  return data.industry ?? null
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

function toBase64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
