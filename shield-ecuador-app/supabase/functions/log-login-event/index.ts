// Login itself goes straight through Supabase Auth's own client SDK
// (signInWithPassword / signInWithOtp / verifyOtp) — there's no custom
// edge function in that path to hang rate-limiting or logging off of, and
// wrapping the real auth call would mean re-implementing password/OTP
// grants ourselves, which risks locking real users out if anything is
// misconfigured. Instead, the frontend calls this AFTER a failed attempt,
// purely to log it — this never blocks or delays a real login, it only
// gives the Centro de Seguridad visibility into brute-force attempts
// against the login screen (RF-03/RF-04), which until now only covered
// registration.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { checkRateLimit } from "../_shared/rate-limit.ts"
import { logSecurityEvent } from "../_shared/security-events.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const EVENT_SEVERITY: Record<string, "baja" | "media"> = {
  login_failed: "media",
  otp_send_failed: "baja",
  otp_verify_failed: "media",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const eventType = typeof body.event_type === "string" ? body.event_type : ""
    const severity = EVENT_SEVERITY[eventType]
    if (!severity) return jsonResponse({ error: "event_type invalido." }, 400)

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : null

    // Same 10/5min shape as secure-register-user — generous for a real user
    // fumbling their password, tight enough to blunt a script.
    const rateLimit = await checkRateLimit({ req, endpoint: "login", email })
    if (!rateLimit.allowed) {
      await logSecurityEvent({ req, endpoint: "login", event_type: "rate_limit_exceeded", severity: "media", metadata: { reason: rateLimit.reason } })
      return jsonResponse({ logged: false, reason: "rate_limited" }, 429)
    }

    await logSecurityEvent({ req, endpoint: "login", event_type: eventType, severity, metadata: {} })
    return jsonResponse({ logged: true })
  } catch (error) {
    console.error("log-login-event failed:", error)
    // Logging is best-effort by design (mirrors logSecurityEvent's own
    // never-throw rule) — a broken request here must never surface as an
    // error the login screen has to handle.
    return jsonResponse({ logged: false }, 200)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
