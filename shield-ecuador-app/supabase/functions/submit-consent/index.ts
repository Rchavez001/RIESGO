import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { z } from "https://esm.sh/zod@3.23.8"
import { AuthError, requireUser } from "../_shared/auth-guard.ts"
import { checkRateLimit } from "../_shared/rate-limit.ts"
import { logSecurityEvent } from "../_shared/security-events.ts"
import { getClientIp } from "../_shared/client-ip.ts"
import { getActiveKeyVersion } from "../_shared/crypto.ts"
import { loadPublishedNotice, NoticeError } from "../_shared/consent-notice.ts"
import { insertConsentEvidenceRow, parsePurposes, type Purpose } from "../_shared/consent-write.ts"

// REQ-09: re-consent. Only meaningful when the CURRENTLY published document was published with
// requires_reconsent = true — otherwise there is nothing to re-accept (optional purposes are
// update-my-consent's job, T11) and this endpoint refuses rather than silently no-op'ing.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type ConsentDecisionInput = { purpose_code?: unknown; decision?: unknown }

const BodySchema = z.object({
  document_id: z.string().max(200),
  rendered_sha256: z.string().max(200),
  settings_version: z.number(),
  decisions: z.array(z.object({
    purpose_code: z.string().max(100),
    decision: z.string().max(50),
  })).max(200).optional(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

class NoticeChangedError extends Error {}
class MissingRequiredConsentError extends Error {}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  try {
    const user = await requireUser(req)

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return jsonResponse({ error: "invalid_input" }, 400)

    // SEC-07: write endpoint of the module — fails CLOSED if the quota cannot be established.
    const rateLimit = await checkRateLimit({ req, endpoint: "submit-consent", email: user.userId, failClosed: true })
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "unavailable") {
        await logSecurityEvent({ req, endpoint: "submit-consent", event_type: "rate_limit_unavailable", severity: "alta" })
        return jsonResponse({ error: "RATE_LIMIT_UNAVAILABLE" }, 503)
      }
      return jsonResponse({ error: "rate_limited" }, 429)
    }

    const clientIp = getClientIp(req)
    if (!clientIp) return jsonResponse({ error: "missing_client_ip" }, 400)

    const notice = await loadPublishedNotice(supabase)
    if (!notice.document.requires_reconsent) return jsonResponse({ error: "reconsent_not_required" }, 409)

    if (
      parsed.data.document_id !== notice.document.id ||
      parsed.data.settings_version !== notice.settings.settings_version ||
      parsed.data.rendered_sha256 !== notice.renderedSha256
    ) {
      throw new NoticeChangedError()
    }

    const purposes = parsePurposes(notice.document.purposes)
    const decisions = resolveDecisions(purposes, parsed.data.decisions ?? [])

    const keyVersion = getActiveKeyVersion()
    const userAgent = req.headers.get("user-agent") ?? ""
    for (const item of decisions) {
      const { error } = await insertConsentEvidenceRow(supabase, {
        userId: user.userId,
        documentId: notice.document.id,
        documentVersion: notice.document.version,
        renderedSha256: notice.renderedSha256,
        settingsVersion: notice.settings.settings_version,
        purposeCode: item.purpose_code,
        decision: item.decision,
        channel: "reconsentimiento",
        ip: clientIp,
        userAgent,
        keyVersion,
      })
      if (error) {
        await logSecurityEvent({ req, endpoint: "submit-consent", event_type: "reconsent_failed", severity: "alta" })
        return jsonResponse({ error: "reconsent_failed" }, 500)
      }
    }

    return jsonResponse({ document_id: notice.document.id, version: notice.document.version })
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse({ error: error.code }, error.status)
    if (error instanceof NoticeChangedError) return jsonResponse({ error: "notice_changed" }, 409)
    if (error instanceof MissingRequiredConsentError) return jsonResponse({ error: "missing_required_consent" }, 400)
    if (error instanceof NoticeError) {
      if (error.code === "notice_not_published") return jsonResponse({ error: "notice_not_published" }, 404)
      console.error("submit-consent: aviso publicado con marcadores inválidos:", error.markers.join(", "))
      return jsonResponse({ error: "NOTICE_INVALID" }, 500)
    }
    console.error("submit-consent failed:", error instanceof Error ? error.message : "unknown")
    return jsonResponse({ error: "internal_error" }, 500)
  }
})

// Same rule as secure-register-user's validateConsentNotice: every purpose gets an explicit
// decision (missing → denied); the required purpose MUST be granted or the whole call fails
// (REQ-09: "si no acepta la obligatoria, solo puede solicitar baja o cerrar sesión" — that choice
// is the frontend's, this endpoint just refuses to record a partial acceptance).
function resolveDecisions(
  purposes: Purpose[],
  submitted: ConsentDecisionInput[],
): Array<{ purpose_code: string; decision: "granted" | "denied" }> {
  const decisions: Array<{ purpose_code: string; decision: "granted" | "denied" }> = []
  for (const purpose of purposes) {
    const match = submitted.find((item) => item.purpose_code === purpose.code)
    const decision: "granted" | "denied" = match?.decision === "granted" ? "granted" : "denied"
    if (purpose.required && decision !== "granted") throw new MissingRequiredConsentError()
    decisions.push({ purpose_code: purpose.code, decision })
  }
  return decisions
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
