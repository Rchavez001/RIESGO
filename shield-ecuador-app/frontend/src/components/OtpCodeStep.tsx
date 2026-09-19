import React, { useEffect, useRef, useState } from 'react'
import { Loader, Shield } from 'lucide-react'
import { NeonButton } from './CyberBushido'
import { friendlyAuthError } from '../lib/authErrors'

const RESEND_COOLDOWN_SECONDS = 30

interface OtpCodeStepProps {
  email: string
  onVerify: (code: string) => Promise<void>
  onResend: () => Promise<void>
  onEditEmail: () => void
}

// Login fallback: a 6-digit code e-mailed when the password did not work.
export function OtpCodeStep({ email, onVerify, onResend, onEditEmail }: OtpCodeStepProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [resendMessage, setResendMessage] = useState('')
  const liveRegionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (code.trim().length !== 6) {
      setError('El código tiene 6 dígitos.')
      return
    }
    setLoading(true)
    try {
      await onVerify(code.trim())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (/expired/i.test(msg)) setError('Este código ya expiró (dura 15 minutos). Pide uno nuevo.')
      else if (/invalid|token/i.test(msg)) setError('El código no es correcto. Revisa e inténtalo de nuevo.')
      else setError(friendlyAuthError(err, 'No pudimos verificar el código. Inténtalo de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    setResendMessage('')
    try {
      await onResend()
      setResendMessage('Te enviamos un nuevo código a tu correo.')
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err: unknown) {
      setError(friendlyAuthError(err, 'No pudimos reenviar el código. Inténtalo en un momento.'))
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      <p className="muted">
        Te enviamos un código de 6 dígitos a <strong>{email}</strong>. Si no lo ves, revisa la carpeta de correo no deseado.
      </p>

      <div className="field">
        <label htmlFor="otp-code">CÓDIGO DE 6 DÍGITOS</label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // No maxLength attribute: the browser would truncate a pasted "123 456" to "123 45" before
          // the non-digits are stripped, silently dropping a digit. Strip first, then cut to 6.
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          pattern="[0-9]{6}"
          aria-invalid={error ? true : undefined}
          required
          autoFocus
        />
      </div>

      <div aria-live="polite" ref={liveRegionRef}>
        {error && <div className="form-error" role="alert">{error}</div>}
        {resendMessage && !error && <div className="form-success">{resendMessage}</div>}
      </div>

      <div className="field small">
        <div className="auth-secondary-links">
          <button type="button" className="link" onClick={onEditEmail}>Cambiar correo</button>
          <button type="button" className="link" onClick={() => void handleResend()} disabled={resendCooldown > 0}>
            {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
          </button>
        </div>
      </div>

      <NeonButton type="submit" className="auth-submit" disabled={loading || code.length !== 6}>
        {loading ? <Loader className="animate-spin" size={18} /> : <Shield size={16} />}
        Continuar
      </NeonButton>
    </form>
  )
}
