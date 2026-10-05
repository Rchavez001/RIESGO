// Email transport abstraction (REQ-21g): the admin panel picks a mode (resend|smtp, migration 079)
// and the rest of the module (acknowledgements, delegate notices, verification codes) calls this
// interface instead of a provider SDK directly. `SmtpSender` arrives in T12.b.

export interface EmailMessage {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export interface EmailSendResult {
  ok: boolean
  /** Stable, non-sensitive reason when ok is false — never the provider's raw error text (may leak secrets/PII). */
  errorCode?: string
  /** SmtpSender only: the IP assertSafeSmtpTarget validated for this attempt (D-15), for the caller to log in the audit trail. Absent when the SSRF check itself rejected the target. */
  resolvedIp?: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>
}
