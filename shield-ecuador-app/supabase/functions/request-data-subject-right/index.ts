// request-data-subject-right (T13): ver handler.ts. `verify_jwt` usa el valor por defecto (true, H01) —
// no aparece en supabase/config.toml porque no necesita ninguna excepción.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
import { AuthError, requireUser } from '../_shared/auth-guard.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-events.ts'
import { getClientIp } from '../_shared/client-ip.ts'
import { getResendApiKey, ResendSender } from '../_shared/email/resend-sender.ts'
import { SmtpSender } from '../_shared/email/smtp-sender.ts'
import { buildAad, decryptPii, type EncryptedPayload } from '../_shared/crypto.ts'
import { createDataSubjectRequest, DsrError, REQUEST_TYPES, type EmailTransportRow, type NewDsrRow } from './handler.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BodySchema = z.object({
  request_type: z.enum(REQUEST_TYPES),
  details: z.string().max(4000).optional(),
})

const SETTINGS_COLUMNS = 'privacy_email, response_days, settings_version'
const EMAIL_TRANSPORT_COLUMNS = 'transport_version, mode, from_name, from_email, smtp_host, smtp_port, smtp_username, smtp_password_ciphertext, created_by, created_at'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

// SEC-09/D-15: misma AAD que `admin-consent` usa para la contraseña SMTP de cada fila de transporte.
const emailTransportPasswordAad = (transportVersion: number) => buildAad('email_transport_settings', 'password', String(transportVersion))

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const user = await requireUser(req)

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return jsonResponse({ error: 'invalid_input' }, 400)

    // SEC-07: endpoint de escritura del módulo — falla CERRADO si la cuota no se puede establecer.
    const rateLimit = await checkRateLimit({ req, endpoint: 'request-data-subject-right', email: user.userId, failClosed: true })
    if (!rateLimit.allowed) {
      if (rateLimit.reason === 'unavailable') {
        await logSecurityEvent({ req, endpoint: 'request-data-subject-right', event_type: 'rate_limit_unavailable', severity: 'alta' })
        return jsonResponse({ error: 'RATE_LIMIT_UNAVAILABLE' }, 503)
      }
      return jsonResponse({ error: 'rate_limited' }, 429)
    }

    const clientIp = getClientIp(req)
    if (!clientIp) return jsonResponse({ error: 'missing_client_ip' }, 400)

    const result = await createDataSubjectRequest(user, { requestType: parsed.data.request_type, details: parsed.data.details }, clientIp, {
      now: () => new Date(),
      settings: {
        getCurrent: async () => {
          const { data, error } = await db.from('privacy_settings_current').select(SETTINGS_COLUMNS).maybeSingle()
          if (error) throw new Error(`privacy_settings_current: ${error.code ?? 'error'}`)
          return data
        },
      },
      dsr: {
        nextCaseNumber: async () => {
          const { data, error } = await db.rpc('next_case_number')
          if (error) throw new Error(`next_case_number: ${error.code ?? 'error'}`)
          return data as string
        },
        insert: async (row: NewDsrRow) => {
          const { data, error } = await db.from('data_subject_requests').insert(row).select('id, case_number').single()
          if (error) throw new Error(`data_subject_requests insert: ${error.code ?? 'error'}`)
          return data as { id: string; case_number: string }
        },
      },
      emailTransport: {
        getCurrent: async () => {
          const { data, error } = await db.from('email_transport_settings_current').select(EMAIL_TRANSPORT_COLUMNS).maybeSingle()
          if (error) throw new Error(`email_transport_settings_current: ${error.code ?? 'error'}`)
          return data as EmailTransportRow | null
        },
      },
      email: {
        send: async (transport, message) => {
          if (transport.mode === 'resend') {
            return new ResendSender({
              senderName: transport.from_name as string,
              senderEmail: transport.from_email as string,
              getApiKey: () => getResendApiKey(db),
            }).send(message)
          }
          if (!transport.smtp_host || !transport.smtp_port || !transport.smtp_username) {
            return { ok: false, errorCode: 'smtp_fields_missing' }
          }
          return new SmtpSender({
            host: transport.smtp_host as string,
            port: transport.smtp_port as number,
            username: transport.smtp_username as string,
            getPassword: async () => {
              if (!transport.smtp_password_ciphertext) return null
              return await decryptPii(transport.smtp_password_ciphertext as EncryptedPayload, {
                aad: emailTransportPasswordAad(transport.transport_version as number),
                allowLegacy: false,
              })
            },
            fromName: transport.from_name as string,
            fromEmail: transport.from_email as string,
          }).send(message)
        },
      },
      emailOutbox: {
        enqueue: async ({ referenceTable, referenceId }) => {
          const { error } = await db.from('email_outbox').insert({ reference_table: referenceTable, reference_id: referenceId })
          if (error) throw new Error(`email_outbox insert: ${error.code ?? 'error'}`)
        },
      },
      panelUrl: Deno.env.get('ADMIN_PANEL_URL') ?? '',
    })

    return jsonResponse(result, 201)
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse({ error: error.code }, error.status)
    if (error instanceof DsrError) return jsonResponse({ error: error.code }, error.status)
    console.error('request-data-subject-right failed:', error instanceof Error ? error.message : 'unknown')
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
