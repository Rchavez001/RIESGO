// Alternate transport for T12.d (D-05 lets the admin switch resend|smtp). Library: denomailer — pure
// Deno (no Node shim), actively maintained, implicit-TLS support for port 465 out of the box. Chosen
// over hand-rolling the SMTP protocol (EHLO/AUTH/DATA framing is easy to get subtly wrong) and over an
// npm client (extra Node-compat surface for an Edge Function). Justified in PROGRESS.md (T12.c).
//
// Every send() re-validates host/port through ssrf-guard.ts (resolves DNS again, not just at config-save
// time) and refuses to call the transport at all if that fails — the SSRF guard, not denomailer, is what
// stands between an admin-configured host and the network.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import type { EmailMessage, EmailSendResult, EmailSender } from './types.ts'
import { assertSafeSmtpTarget, type ResolveDns } from './ssrf-guard.ts'

export interface SmtpDeliverArgs {
  host: string
  port: number
  username: string
  password: string
  fromName: string
  fromEmail: string
  message: EmailMessage
}

async function deliverWithDenomailer(args: SmtpDeliverArgs): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: args.host,
      port: args.port,
      tls: true,
      auth: { username: args.username, password: args.password },
    },
  })
  try {
    await client.send({
      from: `${args.fromName} <${args.fromEmail}>`,
      to: args.message.to,
      subject: args.message.subject,
      content: 'text/html',
      html: args.message.html,
      ...(args.message.replyTo ? { replyTo: args.message.replyTo } : {}),
    })
  } finally {
    await client.close()
  }
}

export interface SmtpSenderOptions {
  host: string
  port: number
  username: string
  getPassword: () => Promise<string | null>
  fromName: string
  fromEmail: string
  /** Injectable only for tests; real callers use Deno.resolveDns. */
  resolveDns?: ResolveDns
  /** Injectable only for tests; real callers use the denomailer-backed transport. */
  deliver?: (args: SmtpDeliverArgs) => Promise<void>
}

export class SmtpSender implements EmailSender {
  constructor(private readonly options: SmtpSenderOptions) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const target = await assertSafeSmtpTarget(this.options.host, this.options.port, { resolveDns: this.options.resolveDns })
    if (!target.ok) return { ok: false, errorCode: target.errorCode }
    // D-15 (decidida): el llamador (p. ej. send_test_email, T12.d) registra host + resolvedIp en
    // email_transport_tests/admin_audit_log en cada prueba de configuración, para que la revalidación
    // de esta línea quede trazada aunque el envío real falle después.
    const { resolvedIp } = target

    const password = await this.options.getPassword()
    if (!password) return { ok: false, errorCode: 'smtp_password_missing', resolvedIp }

    const deliver = this.options.deliver ?? deliverWithDenomailer
    try {
      await deliver({
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        password,
        fromName: this.options.fromName,
        fromEmail: this.options.fromEmail,
        message,
      })
    } catch {
      // Never surface denomailer's raw error text: it can echo the password or full connection string.
      return { ok: false, errorCode: 'smtp_send_failed', resolvedIp }
    }
    return { ok: true, resolvedIp }
  }
}
