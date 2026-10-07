// admin-consent (T05.a, T14): ver handler.ts. `verify_jwt = true` (valor por defecto; ver supabase/config.toml).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildAad, decryptPii, encryptPii, getActiveKeyVersion, hmacLookup, type EncryptedPayload } from '../_shared/crypto.ts'
import { getResendApiKey, ResendSender } from '../_shared/email/resend-sender.ts'
import { SmtpSender } from '../_shared/email/smtp-sender.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { decryptDsrColumn } from '../_shared/consent-evidence.ts'
import { buildDelegateNoticeEmail, buildSubjectAcknowledgementEmail, type DataSubjectRequestType } from '../_shared/email/templates.ts'
import {
  ApiError,
  handle,
  type ConsentDocumentRow,
  type ConsentDocumentStatus,
  type EmailOutboxRow,
  type EmailTransportRow,
  type NewEmailTransportInput,
  type PublishInput,
} from './handler.ts'

// Solo para insertar en admin_audit_log / leer-escribir consent_documents (sin privilegios para
// `authenticated`, ver 073); el actor sale del JWT verificado por `requireRole`, nunca de esta clave.
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DOC_COLUMNS =
  'id, version, title, content_md, content_sha256, purposes, status, requires_reconsent, change_summary, based_on_id, created_by, created_at, updated_by, updated_at, published_by, published_at, retired_by, retired_at'
const SETTINGS_COLUMNS =
  'settings_version, controller_name, controller_address, controller_phone, privacy_email, dpo_name, dpo_contact, privacy_policy_url, unsubscribe_subject, response_days, ip_retention_days, four_eyes_publish'
const EMAIL_TRANSPORT_COLUMNS =
  'transport_version, mode, from_name, from_email, smtp_host, smtp_port, smtp_username, smtp_password_ciphertext, created_by, created_at'
const EMAIL_OUTBOX_COLUMNS = 'id, reference_table, reference_id, created_at'

// T12.d.1 (D-15): la contraseña SMTP se cifra con su propia AAD atada a `transport_version` — nunca la
// misma clave que `crypto.ts` usa para la versión de clave de cifrado (esa la sigue dando `getActiveKeyVersion()`).
const emailTransportPasswordAad = (transportVersion: number) =>
  buildAad('email_transport_settings', 'password', String(transportVersion))

serve((req) =>
  handle(req, {
    emailHmac: (email) => hmacLookup(email, 'LOOKUP_HMAC_KEY_B64'),
    audit: async (entry) => {
      const { error } = await db.from('admin_audit_log').insert(entry)
      if (error) throw new Error(`admin_audit_log: ${error.code ?? 'error'}`)
    },
    documents: {
      getPublished: async () => {
        const { data, error } = await db.from('consent_documents').select(DOC_COLUMNS).eq('status', 'published').maybeSingle()
        if (error) throw new Error(`consent_documents: ${error.code ?? 'error'}`)
        return data as ConsentDocumentRow | null
      },
      getById: async (id) => {
        const { data, error } = await db.from('consent_documents').select(DOC_COLUMNS).eq('id', id).maybeSingle()
        if (error) throw new Error(`consent_documents: ${error.code ?? 'error'}`)
        return data as ConsentDocumentRow | null
      },
      insert: async (row) => {
        const { data, error } = await db.from('consent_documents').insert(row).select(DOC_COLUMNS).single()
        if (error) {
          if (error.code === '23505') throw new ApiError(409, 'version_exists')
          throw new Error(`consent_documents insert: ${error.code ?? 'error'}`)
        }
        return data as ConsentDocumentRow
      },
      updateIfStatus: async (id: string, expectedStatus: ConsentDocumentStatus, patch) => {
        const { data, error } = await db
          .from('consent_documents')
          .update(patch)
          .eq('id', id)
          .eq('status', expectedStatus)
          .select(DOC_COLUMNS)
          .maybeSingle()
        if (error) {
          // Defensa en profundidad (nota pendiente de T06, 077): hoy `retireDraft` nunca llega a tocar la
          // versión publicada (ya rechaza con 409 `not_draft` antes de llegar aquí; retirar la vigente
          // VIGENTE sin reemplazo solo ocurre dentro de `publish_consent_document`, 080), pero si algún
          // camino futuro llegara a disparar la restricción DEFERRED de 077, que se vea como un 409
          // legible y no como un 500 genérico.
          if (error.message?.includes('sin aviso vigente')) throw new ApiError(409, 'no_gap_on_retire')
          throw new Error(`consent_documents update: ${error.code ?? 'error'}`)
        }
        return data as ConsentDocumentRow | null
      },
      publish: async (input: PublishInput) => {
        const { data, error } = await db.rpc('publish_consent_document', {
          p_draft_id: input.draftId,
          p_actor_id: input.actorId,
          p_actor_role: input.actorRole,
          p_actor_aal: input.actorAal ?? null,
          p_actor_email_hmac: input.actorEmailHmac,
          p_reason: input.reason,
        })
        if (error) {
          const msg = error.message ?? ''
          if (msg.includes('mfa_required')) throw new ApiError(403, 'mfa_required')
          if (msg.includes('forbidden')) throw new ApiError(403, 'forbidden')
          if (msg.includes('reason_required')) throw new ApiError(400, 'reason_required')
          if (msg.includes('not_found')) throw new ApiError(404, 'not_found')
          if (msg.includes('not_draft')) throw new ApiError(409, 'not_draft')
          if (msg.includes('settings_unavailable')) throw new ApiError(503, 'settings_unavailable')
          if (msg.includes('four_eyes_required')) throw new ApiError(403, 'four_eyes_required')
          throw new Error(`publish_consent_document: ${error.code ?? 'error'}`)
        }
        return data as ConsentDocumentRow
      },
    },
    settings: {
      getCurrent: async () => {
        const { data, error } = await db.from('privacy_settings_current').select(SETTINGS_COLUMNS).maybeSingle()
        if (error) throw new Error(`privacy_settings_current: ${error.code ?? 'error'}`)
        return data
      },
    },
    emailTransport: {
      getCurrent: async () => {
        const { data, error } = await db.from('email_transport_settings_current').select(EMAIL_TRANSPORT_COLUMNS).maybeSingle()
        if (error) throw new Error(`email_transport_settings_current: ${error.code ?? 'error'}`)
        return data as EmailTransportRow | null
      },
      insert: async (row: NewEmailTransportInput) => {
        const { data, error } = await db.from('email_transport_settings').insert(row).select(EMAIL_TRANSPORT_COLUMNS).single()
        if (error) throw new Error(`email_transport_settings insert: ${error.code ?? 'error'}`)
        return data as EmailTransportRow
      },
      encryptPassword: (password: string, transportVersion: number) =>
        encryptPii(password, getActiveKeyVersion(), { aad: emailTransportPasswordAad(transportVersion), requireAad: true }),
      decryptPassword: (row: EmailTransportRow) =>
        decryptPii(row.smtp_password_ciphertext as EncryptedPayload, {
          aad: emailTransportPasswordAad(row.transport_version),
          allowLegacy: false,
        }),
      recordTest: async (input) => {
        const { error } = await db.from('email_transport_tests').insert({
          transport_version: input.transportVersion,
          success: input.success,
          error_code: input.errorCode,
          tested_by: input.testedBy,
        })
        if (error) throw new Error(`email_transport_tests insert: ${error.code ?? 'error'}`)
      },
    },
    // T13: `request-data-subject-right` es el único llamador que escribe en `email_outbox` hoy, con dos
    // `reference_table` posibles (`dsr_delegate_notice`/`dsr_ack`), ambas apuntando al mismo
    // `data_subject_requests.id`. Cualquier otra `reference_table` futura (p. ej. la de T15) se añade aquí
    // sin tocar nada más de este resolutor.
    emailOutbox: {
      listPending: async () => {
        const { data, error } = await db
          .from('email_outbox')
          .select(EMAIL_OUTBOX_COLUMNS)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
        if (error) throw new Error(`email_outbox: ${error.code ?? 'error'}`)
        return (data ?? []) as EmailOutboxRow[]
      },
      rebuildMessage: async (row: EmailOutboxRow) => {
        if (row.reference_table !== 'dsr_delegate_notice' && row.reference_table !== 'dsr_ack') return null
        const { data, error } = await db
          .from('data_subject_requests')
          .select('id, case_number, request_type, due_at, routed_to_email, email_ciphertext')
          .eq('id', row.reference_id)
          .maybeSingle()
        if (error) throw new Error(`data_subject_requests: ${error.code ?? 'error'}`)
        if (!data) return null
        const requestType = data.request_type as DataSubjectRequestType
        if (row.reference_table === 'dsr_delegate_notice') {
          return buildDelegateNoticeEmail({
            to: data.routed_to_email, caseNumber: data.case_number, requestType, dueAt: data.due_at,
            panelUrl: Deno.env.get('ADMIN_PANEL_URL') ?? '',
          })
        }
        // dsr_ack: D-06 no aplica aquí (el destinatario ES el titular) — solo el aviso al delegado está
        // obligado a no exponer su correo.
        const email = await decryptDsrColumn(data, 'email_ciphertext')
        if (!email) return null
        return buildSubjectAcknowledgementEmail({ to: email, caseNumber: data.case_number, requestType, dueAt: data.due_at })
      },
      markSent: async (id: string) => {
        const { error } = await db.rpc('mark_email_outbox_sent', { p_outbox_id: id })
        if (error) throw new Error(`mark_email_outbox_sent: ${error.code ?? 'error'}`)
      },
    },
    email: {
      send: async (transport, message) => {
        if (transport.mode === 'resend') {
          return new ResendSender({
            senderName: transport.from_name,
            senderEmail: transport.from_email,
            getApiKey: () => getResendApiKey(db),
          }).send(message)
        }
        if (!transport.smtp_host || !transport.smtp_port || !transport.smtp_username) {
          return { ok: false, errorCode: 'smtp_fields_missing' }
        }
        return new SmtpSender({
          host: transport.smtp_host,
          port: transport.smtp_port,
          username: transport.smtp_username,
          getPassword: async () => {
            if (!transport.smtp_password_ciphertext) return null
            return await decryptPii(transport.smtp_password_ciphertext as EncryptedPayload, {
              aad: emailTransportPasswordAad(transport.transport_version),
              allowLegacy: false,
            })
          },
          fromName: transport.from_name,
          fromEmail: transport.from_email,
        }).send(message)
      },
      checkTestRateLimit: (req, actorEmail) =>
        checkRateLimit({ req, endpoint: 'admin-consent:send-test-email', email: actorEmail, failClosed: true }),
    },
  })
)
