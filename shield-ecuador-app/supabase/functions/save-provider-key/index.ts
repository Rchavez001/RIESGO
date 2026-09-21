// Phase 2 of the AI-provider-chain plan: lets an admin paste a real API key
// through the admin UI and store it in Supabase Vault instead of Claude
// setting it as a plain Supabase secret from a key pasted in chat. The raw
// key is never written to any table, returned in any response, or logged.
//
// Admin-only — unlike run-news-agent, there is no scheduler path here: this
// endpoint writes credentials, so only an authenticated admin session or the
// central-admin-app (service role, gated by its own Basic Auth) may call it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { publicHttpUrlProblem } from '../_shared/url-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requireAdmin(req)
    const body = await req.json().catch(() => ({}))

    const providerKey = typeof body.provider_key === 'string' ? body.provider_key.trim() : ''
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    if (!providerKey) throw new HttpError('Falta provider_key', 400)

    const { data: existing } = await supabase
      .from('ai_providers')
      .select('provider_key, api_key_secret_id')
      .eq('provider_key', providerKey)
      .maybeSingle()

    let secretId: string | null = existing?.api_key_secret_id ?? null

    if (apiKey) {
      const { data: newSecretId, error: secretError } = await supabase.rpc('set_provider_secret', {
        p_secret_id: secretId,
        p_new_secret: apiKey,
        p_secret_name: `ai_provider_${providerKey}_key`,
      })
      if (secretError) throw new Error(`No se pudo guardar la clave en Vault: ${secretError.message}`)
      secretId = newSecretId
    } else if (!secretId) {
      throw new HttpError('Falta api_key (este proveedor todavia no tiene una clave guardada).', 400)
    }

    const fields: Record<string, unknown> = { api_key_secret_id: secretId }
    if (typeof body.label === 'string') fields.label = body.label
    if (typeof body.provider_type === 'string') fields.provider_type = body.provider_type
    if (typeof body.model_name === 'string') fields.model_name = body.model_name
    if (typeof body.purpose === 'string') fields.purpose = body.purpose
    if (typeof body.base_url === 'string') {
      // The key and every prompt are sent to this address: only public https endpoints.
      const problem = body.base_url ? publicHttpUrlProblem(body.base_url, { httpsOnly: true }) : null
      if (problem) throw new HttpError(`Base URL no permitida: ${problem}`, 400)
      fields.base_url = body.base_url || null
    }
    if (Number.isFinite(body.default_timeout_seconds)) fields.default_timeout_seconds = body.default_timeout_seconds
    if (typeof body.active === 'boolean') fields.active = body.active

    if (existing) {
      // A plain UPDATE only ever touches the columns we actually pass — the
      // common case here is "just save a new key", which shouldn't require
      // resending label/provider_type/model_name. An upsert's underlying
      // INSERT branch, by contrast, must satisfy every NOT NULL column
      // regardless of whether the row already exists and the conflict path
      // would run instead, which is exactly what broke this before.
      const { error: updateError } = await supabase
        .from('ai_providers')
        .update(fields)
        .eq('provider_key', providerKey)
      if (updateError) throw new Error(`No se pudo actualizar el proveedor: ${updateError.message}`)
    } else {
      if (typeof fields.label !== 'string' || !fields.label) throw new HttpError('Falta "label" para crear un proveedor nuevo.', 400)
      if (typeof fields.provider_type !== 'string' || !fields.provider_type) throw new HttpError('Falta "provider_type" para crear un proveedor nuevo.', 400)
      if (typeof fields.model_name !== 'string' || !fields.model_name) throw new HttpError('Falta "model_name" para crear un proveedor nuevo.', 400)
      const { error: insertError } = await supabase
        .from('ai_providers')
        .insert({ provider_key: providerKey, ...fields })
      if (insertError) throw new Error(`No se pudo crear el proveedor: ${insertError.message}`)
    }

    // Deliberately no api_key / secret value anywhere in this response.
    return jsonResponse({ provider_key: providerKey, saved: true })
  } catch (error) {
    console.error('Error in save-provider-key:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Missing authorization header', 401)

  // Same reasoning as run-news-agent: central-admin-app proxies with the
  // service role key (no per-user Supabase Auth session exists there), and
  // that key already has unrestricted DB access, so trusting its role claim
  // here grants nothing new.
  if (decodeJwtRole(token) === 'service_role') {
    return 'central-admin'
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new HttpError('Invalid session', 401)

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', authData.user.id)
    .single()

  if (profile?.role !== 'admin') throw new HttpError('Admin role required', 403)
  return profile.email ?? authData.user.id
}

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + (4 - payload.length % 4) % 4, '=')
    const decoded = JSON.parse(atob(padded))
    return typeof decoded.role === 'string' ? decoded.role : null
  } catch {
    return null
  }
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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
