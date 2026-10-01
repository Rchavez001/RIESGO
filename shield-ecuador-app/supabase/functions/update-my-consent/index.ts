import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { z } from "https://esm.sh/zod@3.23.8"
import { AuthError, requireUser } from "../_shared/auth-guard.ts"
import { checkRateLimit } from "../_shared/rate-limit.ts"
import { logSecurityEvent } from "../_shared/security-events.ts"
import { getClientIp } from "../_shared/client-ip.ts"
import { getActiveKeyVersion } from "../_shared/crypto.ts"
import { loadPublishedNotice, NoticeError } from "../_shared/consent-notice.ts"
import { insertConsentEvidenceRow, parsePurposes } from "../_shared/consent-write.ts"

// REQ-08: "Mi privacidad" lets a user grant/revoke OPTIONAL purposes with one click. The required
// purpose (registro_aprendizaje) can never be changed here — withdrawing it means closing the
// account (baja, T13), not a row in this endpoint.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BodySchema = z.object({
  purpose_code: z.string().max(100),
  action: z.enum(["grant", "revoke"]),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  try {
    const user = await requireUser(req)

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return jsonResponse({ error: "invalid_input" }, 400)

    // SEC-07: write endpoint of the module — fails CLOSED if the quota cannot be established.
    // Keyed by the verified user id (an opaque identity string as far as checkRateLimit's
    // HMAC'd "email" bucket is concerned), on top of the IP bucket it always checks.
    const rateLimit = await checkRateLimit({ req, endpoint: "update-my-consent", email: user.userId, failClosed: true })
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "unavailable") {
        await logSecurityEvent({ req, endpoint: "update-my-consent", event_type: "rate_limit_unavailable", severity: "alta" })
        return jsonResponse({ error: "RATE_LIMIT_UNAVAILABLE" }, 503)
      }
      return jsonResponse({ error: "rate_limited" }, 429)
    }

    const clientIp = getClientIp(req)
    if (!clientIp) return jsonResponse({ error: "missing_client_ip" }, 400)

    const notice = await loadPublishedNotice(supabase)
    const purposes = parsePurposes(notice.document.purposes)
    const purpose = purposes.find((item) => item.code === parsed.data.purpose_code)
    if (!purpose) return jsonResponse({ error: "unknown_purpose" }, 400)
    if (purpose.required) return jsonResponse({ error: "required_purpose" }, 400)

    const decision = parsed.data.action === "grant" ? "granted" : "revoked"
    const { error } = await insertConsentEvidenceRow(supabase, {
      userId: user.userId,
      documentId: notice.document.id,
      documentVersion: notice.document.version,
      renderedSha256: notice.renderedSha256,
      settingsVersion: notice.settings.settings_version,
      purposeCode: purpose.code,
      decision,
      channel: "mi_privacidad",
      ip: clientIp,
      userAgent: req.headers.get("user-agent") ?? "",
      keyVersion: getActiveKeyVersion(),
    })
    if (error) {
      await logSecurityEvent({ req, endpoint: "update-my-consent", event_type: "consent_update_failed", severity: "alta" })
      return jsonResponse({ error: "update_failed" }, 500)
    }

    return jsonResponse({ purpose_code: purpose.code, decision })
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse({ error: error.code }, error.status)
    if (error instanceof NoticeError) {
      if (error.code === "notice_not_published") return jsonResponse({ error: "notice_not_published" }, 404)
      // Marker NAMES only, never values (same rule as get-consent-notice).
      console.error("update-my-consent: aviso publicado con marcadores inválidos:", error.markers.join(", "))
      return jsonResponse({ error: "NOTICE_INVALID" }, 500)
    }
    console.error("update-my-consent failed:", error instanceof Error ? error.message : "unknown")
    return jsonResponse({ error: "internal_error" }, 500)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
