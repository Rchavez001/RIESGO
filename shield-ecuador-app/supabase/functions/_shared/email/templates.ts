// Pure rendering of the three fixed email templates REQ-10/REQ-15/REQ-21(f) require. No Supabase/db
// access here on purpose: a caller (request-data-subject-right/T13, admin-consent's
// confirm_email_verification/T15 — neither written yet) builds an EmailMessage with these functions and
// hands it to deps.email.send() or, for the delegate/acknowledgement notices, to email_outbox if the send
// fails. The verification code (REQ-15/REQ-21f) is NEVER queued: if it fails to send, the caller reports
// the failure immediately instead of retrying later.
//
// D-06: the delegate notice never learns the titular's email or IP — DelegateNoticeInput has no field for
// either, so there is nothing to leak even if a caller tries.

import type { EmailMessage } from './types.ts'

export type DataSubjectRequestType =
  | 'baja'
  | 'acceso'
  | 'rectificacion'
  | 'eliminacion'
  | 'oposicion'
  | 'suspension'
  | 'portabilidad'
  | 'revocacion'
  | 'decision_automatizada'

const REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  baja: 'Baja de la cuenta',
  acceso: 'Acceso a datos personales',
  rectificacion: 'Rectificación de datos',
  eliminacion: 'Eliminación de datos',
  oposicion: 'Oposición al tratamiento',
  suspension: 'Suspensión del tratamiento',
  portabilidad: 'Portabilidad de datos',
  revocacion: 'Revocación del consentimiento',
  decision_automatizada: 'Revisión de decisión automatizada',
}

// Same convention as consent-render.ts: the date is what a person reads, so it must not depend on the
// server's time zone. A subject line must never carry an embedded newline (header-injection defense in
// depth), even though today's inputs (case numbers, request types) are server-generated, not user text.
function guayaquilDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}

function singleLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim()
}

export interface DelegateNoticeInput {
  to: string
  caseNumber: string
  requestType: DataSubjectRequestType
  dueAt: string // ISO
  panelUrl: string
}

/** REQ-10: notice to the privacy delegate about a new data-subject-rights case. D-06: case number, type
 *  and due date only — never the titular's email or IP. */
export function buildDelegateNoticeEmail(input: DelegateNoticeInput): EmailMessage {
  const typeLabel = REQUEST_TYPE_LABELS[input.requestType]
  const dueDate = guayaquilDate(input.dueAt)
  return {
    to: input.to,
    subject: singleLine(`Nueva solicitud de derechos — caso ${input.caseNumber}`),
    html: `<p>Se recibió una nueva solicitud de derechos sobre datos personales.</p>
<ul>
<li>Caso: <strong>${input.caseNumber}</strong></li>
<li>Tipo: ${typeLabel}</li>
<li>Fecha límite de respuesta: ${dueDate}</li>
</ul>
<p>Atiéndela desde el panel: <a href="${input.panelUrl}">${input.panelUrl}</a></p>`,
  }
}

export interface SubjectAcknowledgementInput {
  to: string
  caseNumber: string
  requestType: DataSubjectRequestType
  dueAt: string // ISO
}

/** REQ-10: acknowledgement to the titular who filed the request — case number and due date so they can
 *  follow up without repeating the data they already sent in the request itself. */
export function buildSubjectAcknowledgementEmail(input: SubjectAcknowledgementInput): EmailMessage {
  const typeLabel = REQUEST_TYPE_LABELS[input.requestType]
  const dueDate = guayaquilDate(input.dueAt)
  return {
    to: input.to,
    subject: singleLine(`Recibimos tu solicitud — caso ${input.caseNumber}`),
    html: `<p>Recibimos tu solicitud de <strong>${typeLabel}</strong>.</p>
<p>Número de caso: <strong>${input.caseNumber}</strong></p>
<p>Fecha límite de respuesta: ${dueDate}</p>
<p>Guarda este número de caso para dar seguimiento.</p>`,
  }
}

export interface EmailVerificationCodeInput {
  to: string
  code: string // 6 digits, REQ-15
}

/** REQ-15: verification code for a new privacy-contact email. Never queued in email_outbox — a failed
 *  send is reported to the caller right away. */
export function buildEmailVerificationCodeEmail(input: EmailVerificationCodeInput): EmailMessage {
  return {
    to: input.to,
    subject: 'Código de verificación — correo de privacidad',
    html: `<p>Tu código de verificación es:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${input.code}</p>
<p>Vence en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`,
  }
}
