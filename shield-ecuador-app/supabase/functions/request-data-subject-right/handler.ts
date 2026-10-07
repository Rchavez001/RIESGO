// request-data-subject-right (T13; REQ-10, REQ-11): crea un caso de derechos del titular desde la cuenta
// (channel='app' — el canal 'correo' lo registra un admin a mano desde admin-consent, fuera de esta función).
// Si el envío de cualquiera de los dos avisos (delegado, acuse al titular) falla o el transporte no está
// configurado, el caso queda registrado igual (REQ-21f) y el aviso pendiente en `email_outbox`; T12.d.3
// (`resend_pending_emails`) y la extensión de `rebuildMessage` en admin-consent/index.ts lo reintentan.
import type { VerifiedUser } from '../_shared/auth-guard.ts'
import { getActiveKeyVersion, hmacLookup } from '../_shared/crypto.ts'
import { prepareDsrRow } from '../_shared/consent-evidence.ts'
import {
  buildDelegateNoticeEmail,
  buildSubjectAcknowledgementEmail,
  type DataSubjectRequestType,
} from '../_shared/email/templates.ts'
import type { EmailMessage, EmailSendResult } from '../_shared/email/types.ts'

export const REQUEST_TYPES = [
  'baja', 'acceso', 'rectificacion', 'eliminacion', 'oposicion',
  'suspension', 'portabilidad', 'revocacion', 'decision_automatizada',
] as const satisfies readonly DataSubjectRequestType[]

export interface RequestInput {
  requestType: DataSubjectRequestType
  details?: string
}

export interface CurrentSettings {
  privacy_email: string
  response_days: number
  settings_version: number
}

export interface NewDsrRow {
  id: string
  case_number: string
  user_id: string
  email_ciphertext: unknown
  email_hmac: string
  request_type: DataSubjectRequestType
  details_ciphertext: unknown
  channel: 'app'
  routed_to_email: string
  settings_version: number
  due_at: string
  ip_ciphertext: unknown
  ip_hmac: string | null
  key_version: number
}

export type EmailTransportRow = { mode: 'resend' | 'smtp' } & Record<string, unknown>

/** 'dsr_delegate_notice' | 'dsr_ack': mismos valores que `email_outbox.reference_table` espera reconocer
 *  del lado de `admin-consent`'s `rebuildMessage` (T12.d.3) cuando reintenta un aviso pendiente. */
export type DsrEmailKind = 'dsr_delegate_notice' | 'dsr_ack'

export interface Deps {
  now: () => Date
  settings: { getCurrent: () => Promise<CurrentSettings | null> }
  dsr: {
    nextCaseNumber: () => Promise<string>
    insert: (row: NewDsrRow) => Promise<{ id: string; case_number: string }>
  }
  emailTransport: { getCurrent: () => Promise<EmailTransportRow | null> }
  email: { send: (transport: EmailTransportRow, message: EmailMessage) => Promise<EmailSendResult> }
  emailOutbox: { enqueue: (input: { referenceTable: DsrEmailKind; referenceId: string }) => Promise<void> }
  panelUrl: string
}

export class DsrError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
    this.name = 'DsrError'
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function dueAtIso(receivedAt: Date, responseDays: number): string {
  return new Date(receivedAt.getTime() + responseDays * DAY_MS).toISOString()
}

async function dispatchOrQueue(
  deps: Deps,
  transport: EmailTransportRow | null,
  kind: DsrEmailKind,
  referenceId: string,
  message: EmailMessage,
): Promise<void> {
  if (!transport) {
    await deps.emailOutbox.enqueue({ referenceTable: kind, referenceId })
    return
  }
  const result = await deps.email.send(transport, message)
  if (!result.ok) {
    await deps.emailOutbox.enqueue({ referenceTable: kind, referenceId })
  }
}

export async function createDataSubjectRequest(
  user: VerifiedUser,
  input: RequestInput,
  clientIp: string,
  deps: Deps,
): Promise<{ case_number: string; due_at: string }> {
  if (!user.email) throw new DsrError(403, 'forbidden')

  const settings = await deps.settings.getCurrent()
  if (!settings) throw new DsrError(503, 'settings_unavailable')

  const receivedAt = deps.now()
  const keyVersion = getActiveKeyVersion()
  const prepared = await prepareDsrRow({ email: user.email, details: input.details, ip: clientIp || null, keyVersion })
  const emailHmac = await hmacLookup(user.email.trim().toLowerCase(), 'LOOKUP_HMAC_KEY_B64')
  const ipHmac = clientIp ? await hmacLookup(clientIp, 'LOOKUP_HMAC_KEY_B64') : null
  const caseNumber = await deps.dsr.nextCaseNumber()
  const due = dueAtIso(receivedAt, settings.response_days)

  const row: NewDsrRow = {
    id: prepared.id,
    case_number: caseNumber,
    user_id: user.userId,
    email_ciphertext: prepared.email_ciphertext,
    email_hmac: emailHmac,
    request_type: input.requestType,
    details_ciphertext: prepared.details_ciphertext,
    channel: 'app',
    routed_to_email: settings.privacy_email,
    settings_version: settings.settings_version,
    due_at: due,
    ip_ciphertext: prepared.ip_ciphertext,
    ip_hmac: ipHmac,
    key_version: keyVersion,
  }

  const inserted = await deps.dsr.insert(row)

  const transport = await deps.emailTransport.getCurrent()
  const delegateMessage = buildDelegateNoticeEmail({
    to: settings.privacy_email,
    caseNumber: inserted.case_number,
    requestType: input.requestType,
    dueAt: due,
    panelUrl: deps.panelUrl,
  })
  const ackMessage = buildSubjectAcknowledgementEmail({
    to: user.email,
    caseNumber: inserted.case_number,
    requestType: input.requestType,
    dueAt: due,
  })
  // Los dos avisos se intentan de forma independiente: que uno falle no debe impedir que el otro se
  // encole o se envíe (REQ-21f, "la solicitud se registra igual").
  await dispatchOrQueue(deps, transport, 'dsr_delegate_notice', inserted.id, delegateMessage)
  await dispatchOrQueue(deps, transport, 'dsr_ack', inserted.id, ackMessage)

  return { case_number: inserted.case_number, due_at: due }
}
