import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { renderConsentMarkers, sha256Hex } from "../_shared/consent-render.ts"

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
    const { data: doc, error: docError } = await supabase
      .from("consent_documents")
      .select("id, version, title, content_md, purposes, requires_reconsent")
      .eq("status", "published")
      .maybeSingle()

    if (docError) throw docError
    if (!doc) return jsonResponse({ error: "No hay un aviso de privacidad publicado todavía." }, 404)

    const { data: settings, error: settingsError } = await supabase
      .from("privacy_settings")
      .select("settings_version, controller_name, controller_address, controller_phone, privacy_email, dpo_name, dpo_contact, privacy_policy_url, response_days, response_day_type")
      .eq("is_current", true)
      .maybeSingle()

    if (settingsError) throw settingsError
    if (!settings) return jsonResponse({ error: "La configuración de privacidad no está disponible." }, 500)

    const renderedMd = renderConsentMarkers(doc.content_md, settings)
    const renderedSha256 = await sha256Hex(renderedMd)

    return jsonResponse(
      {
        document_id: doc.id,
        version: doc.version,
        title: doc.title,
        rendered_md: renderedMd,
        rendered_sha256: renderedSha256,
        settings_version: settings.settings_version,
        purposes: doc.purposes,
        requires_reconsent: doc.requires_reconsent,
        privacy_policy_url: settings.privacy_policy_url,
      },
      200,
      { "Cache-Control": "public, max-age=60" },
    )
  } catch (error) {
    console.error("get-consent-notice failed:", error)
    return jsonResponse({ error: "No se pudo obtener el aviso de privacidad." }, 500)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  })
}
