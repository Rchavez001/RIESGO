import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthError, requireAnonymousGuest } from "../_shared/auth-guard.ts"
import { checkRateLimit } from "../_shared/rate-limit.ts"
import { logSecurityEvent } from "../_shared/security-events.ts"
import { getClientIp } from "../_shared/client-ip.ts"
import { getActiveKeyVersion } from "../_shared/crypto.ts"
import { loadPublishedNotice, NoticeError } from "../_shared/consent-notice.ts"
import { insertConsentEvidenceRow } from "../_shared/consent-write.ts"

// T19b Paso 2B (D-12 opción B, D-16 opción A): única finalidad que puede registrar este
// endpoint, para una sesión anónima real, antes de que exista cualquier perfil en
// `public.users`. El frontend llama a esto justo después de `signInAnonymously()`, nunca antes
// (sin sesión anónima no hay token que verificar) — "sin el aviso breve no se crea la sesión
// anónima" se cumple deshaciendo la sesión si esta llamada falla (ver AuthContext.continueAsGuest).
const PURPOSE_CODE = "invitado_basico"
const CHANNEL = "invitado"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  try {
    const user = await requireAnonymousGuest(req)

    // SEC-07: igual que submit-consent/update-my-consent — endpoint de escritura del módulo,
    // falla CERRADO si la cuota no se puede establecer.
    const rateLimit = await checkRateLimit({ req, endpoint: "accept-guest-notice", email: user.userId, failClosed: true })
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "unavailable") {
        await logSecurityEvent({ req, endpoint: "accept-guest-notice", event_type: "rate_limit_unavailable", severity: "alta" })
        return jsonResponse({ error: "RATE_LIMIT_UNAVAILABLE" }, 503)
      }
      return jsonResponse({ error: "rate_limited" }, 429)
    }

    const clientIp = getClientIp(req)
    if (!clientIp) return jsonResponse({ error: "missing_client_ip" }, 400)

    // El invitado no ve el aviso completo (solo el texto breve con enlace a /privacidad): esto
    // solo fija a qué versión publicada queda atada la evidencia, igual que cualquier otra fila
    // de consent_records. invitado_basico no es una de las finalidades de ese documento — es
    // una finalidad propia de este endpoint, nunca listada en `purposes` ni mostrada en
    // RegisterScreen/ReconsentGate.
    const notice = await loadPublishedNotice(supabase)

    const keyVersion = getActiveKeyVersion()
    const userAgent = req.headers.get("user-agent") ?? ""
    const { error } = await insertConsentEvidenceRow(supabase, {
      userId: user.userId,
      storeUserId: false, // el invitado no tiene fila en public.users; ver _shared/consent-write.ts
      documentId: notice.document.id,
      documentVersion: notice.document.version,
      renderedSha256: notice.renderedSha256,
      settingsVersion: notice.settings.settings_version,
      purposeCode: PURPOSE_CODE,
      decision: "granted",
      channel: CHANNEL,
      ip: clientIp,
      userAgent,
      keyVersion,
    })
    if (error) {
      await logSecurityEvent({ req, endpoint: "accept-guest-notice", event_type: "guest_notice_failed", severity: "alta" })
      return jsonResponse({ error: "guest_notice_failed" }, 500)
    }

    return jsonResponse({ purpose_code: PURPOSE_CODE })
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse({ error: error.code }, error.status)
    if (error instanceof NoticeError) {
      if (error.code === "notice_not_published") return jsonResponse({ error: "notice_not_published" }, 404)
      console.error("accept-guest-notice: aviso publicado con marcadores inválidos:", error.markers.join(", "))
      return jsonResponse({ error: "NOTICE_INVALID" }, 500)
    }
    console.error("accept-guest-notice failed:", error instanceof Error ? error.message : "unknown")
    return jsonResponse({ error: "internal_error" }, 500)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
