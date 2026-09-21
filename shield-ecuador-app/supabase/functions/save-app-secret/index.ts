// Generic named-secret save, mirroring save-provider-key's pattern but for
// standalone credentials not tied to an ai_providers row (the Resend API
// key for championship match emails is the first user). Same Vault-backed
// storage (set_provider_secret), just keyed through app_secrets by a plain
// name instead of provider_key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_SECRET_NAMES = new Set(['resend_api_key'])

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

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    if (!name) throw new HttpError('Falta "name".', 400)
    // Only known application secrets may be written: an arbitrary name would let a stolen admin session plant
    // entries in Vault / app_secrets.
    if (!ALLOWED_SECRET_NAMES.has(name)) throw new HttpError('Nombre de secreto no permitido.', 400)
    if (!value) throw new HttpError('Falta "value".', 400)

    const { data: existing } = await supabase
      .from('app_secrets')
      .select('name, secret_id')
      .eq('name', name)
      .maybeSingle()

    const { data: newSecretId, error: secretError } = await supabase.rpc('set_provider_secret', {
      p_secret_id: existing?.secret_id ?? null,
      p_new_secret: value,
      p_secret_name: `app_secret_${name}`,
    })
    if (secretError) throw new Error(`No se pudo guardar en Vault: ${secretError.message}`)

    const { error: upsertError } = await supabase
      .from('app_secrets')
      .upsert({ name, secret_id: newSecretId, updated_at: new Date().toISOString() }, { onConflict: 'name' })
    if (upsertError) throw new Error(`No se pudo registrar el secreto: ${upsertError.message}`)

    return jsonResponse({ name, saved: true })
  } catch (error) {
    console.error('Error in save-app-secret:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Missing authorization header', 401)

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
