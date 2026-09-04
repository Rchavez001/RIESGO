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
  if (req.method !== "GET") return jsonResponse({ error: "Metodo no permitido." }, 405)

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const token = authHeader.replace(/^Bearer\s+/i, "")
    if (!token) return jsonResponse({ error: "No autorizado." }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "No autorizado." }, 401)

    const targetUserId = new URL(req.url).searchParams.get("user_id") || authData.user.id
    const { data: requesterProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", authData.user.id)
      .single()

    if (targetUserId !== authData.user.id && requesterProfile?.role !== "admin") {
      await auditEvent(authData.user.id, "private_profile_denied", targetUserId, {})
      return jsonResponse({ error: "No autorizado." }, 403)
    }

    const { data: profile, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", targetUserId)
      .single()

    if (error || !profile) return jsonResponse({ error: "Perfil no encontrado." }, 404)

    await auditEvent(authData.user.id, "private_profile_read", targetUserId, { self: targetUserId === authData.user.id })

    return jsonResponse({
      id: profile.id,
      email: await decryptOrFallback(profile.email_encrypted, authData.user.email ?? profile.email),
      phone: await decryptOrFallback(profile.phone_encrypted, null),
      full_name: await decryptOrFallback(profile.full_name_encrypted, profile.full_name),
      business_type: profile.business_type,
      role: profile.role,
      belt: profile.belt,
      total_points: profile.total_points,
      current_risk_level: profile.current_risk_level,
      location_city: await decryptOrFallback(profile.location_city_encrypted, profile.location_city),
      location_province: await decryptOrFallback(profile.location_province_encrypted, profile.location_province),
      onboarding_completed: profile.onboarding_completed,
      created_at: profile.created_at,
      last_evaluation_at: profile.last_evaluation_at,
      data_processing_authorized: profile.data_processing_authorized,
      privacy_notice_version: profile.privacy_notice_version,
    })
  } catch (error) {
    console.error("get-private-profile failed:", safeError(error))
    return jsonResponse({ error: "No se pudo cargar el perfil." }, 500)
  }
})

async function decryptOrFallback(payload: EncryptedPayload | null, fallback: string | null) {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return fallback
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
  const raw = getEncryptionKeyBytes()
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
}

function getEncryptionKeyBytes() {
  const value = Deno.env.get("PII_ENCRYPTION_KEY_B64") ?? ""
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error("invalid_pii_key")
  return bytes
}

async function auditEvent(actorUserId: string, eventType: string, targetUserId: string, metadata: Record<string, unknown>) {
  await supabase.from("security_audit_events").insert({
    actor_user_id: actorUserId,
    event_type: eventType,
    target_user_id: targetUserId,
    metadata,
  })
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
