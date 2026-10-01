// Test double for EmailSender (T12.a): records every message instead of calling a real provider,
// and can be told to fail its next send — used by T13's "envío fallido -> caso registrado + aviso
// pendiente" test and by this module's own tests.
import type { EmailMessage, EmailSendResult, EmailSender } from './types.ts'

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = []
  private failNextWithCode: string | null = null

  failNextWith(errorCode: string): void {
    this.failNextWithCode = errorCode
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.failNextWithCode) {
      const errorCode = this.failNextWithCode
      this.failNextWithCode = null
      return { ok: false, errorCode }
    }
    this.sent.push(message)
    return { ok: true }
  }
}
