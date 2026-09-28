import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { loadPublishedNotice, NoticeError } from "../_shared/consent-notice.ts"

// Public, unauthenticated: the registration screen (and the public privacy
// policy page) call this before anyone has an account. It needs the service
// role because privacy_settings has no anon SELECT grant at all (correct —
// nothing in it is meant to be public except the few fields returned here).
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "GET") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const notice = await loadPublishedNotice(supabase)

    return jsonResponse(
      {
        document_id: notice.document.id,
        version: notice.document.version,
        title: notice.document.title,
        rendered_md: notice.renderedMd,
        rendered_sha256: notice.renderedSha256,
        settings_version: notice.settings.settings_version,
        purposes: notice.document.purposes,
        requires_reconsent: notice.document.requires_reconsent,
        privacy_policy_url: notice.settings.privacy_policy_url,
        // The registration screen tells a blocked minor (under 15) where their legal representative writes.
        privacy_email: notice.settings.privacy_email,
      },
      200,
      { "Cache-Control": "public, max-age=60" },
    )
  } catch (error) {
    if (error instanceof NoticeError && error.code === "notice_not_published") {
      return jsonResponse({ error: "No hay un aviso de privacidad publicado todavía." }, 404)
    }
    if (error instanceof NoticeError && error.code === "notice_invalid") {
      // Marker NAMES only, never values. A published notice must not have any: publishing is meant to prevent it.
      console.error("get-consent-notice: aviso publicado con marcadores inválidos:", error.markers.join(", "))
      return jsonResponse({ error: "NOTICE_INVALID" }, 500)
    }
    console.error("get-consent-notice failed:", error instanceof Error ? error.message : "unknown")
    return jsonResponse({ error: "No se pudo obtener el aviso de privacidad." }, 500)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  })
}
