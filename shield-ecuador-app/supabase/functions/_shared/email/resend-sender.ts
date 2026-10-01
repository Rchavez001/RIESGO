// Reuses the Resend integration already live in the project (championship-draw-round1,
// check-security-alerts, security-easm-scan): the API key lives in Vault via `app_secrets`, read
// through `get_decrypted_secret`. Never stored in `email_transport_settings` or in this module
// (REQ-21a, D-05 default mode).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EmailMessage, EmailSendResult, EmailSender } from './types.ts'

export async function getResendApiKey(db: SupabaseClient): Promise<string | null> {
  const { data: secretRow } = await db.from('app_secrets').select('secret_id').eq('name', 'resend_api_key').maybeSingle()
  if (!secretRow) return null
  const { data: apiKey, error } = await db.rpc('get_decrypted_secret', { secret_id: secretRow.secret_id })
  if (error || !apiKey) return null
  return apiKey as string
}

export interface ResendSenderOptions {
  senderName: string
  senderEmail: string
  getApiKey: () => Promise<string | null>
  /** Injectable only for tests; real callers use the global fetch. */
  fetchImpl?: typeof fetch
}

export class ResendSender implements EmailSender {
  constructor(private readonly options: ResendSenderOptions) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = await this.options.getApiKey()
    if (!apiKey) return { ok: false, errorCode: 'resend_key_missing' }

    const doFetch = this.options.fetchImpl ?? fetch
    let response: Response
    try {
      response = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: `${this.options.senderName} <${this.options.senderEmail}>`,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      })
    } catch {
      return { ok: false, errorCode: 'resend_network_error' }
    }
    if (!response.ok) return { ok: false, errorCode: `resend_http_${response.status}` }
    return { ok: true }
  }
}
