import React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Loader, ShieldCheck, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeLocalPath } from '../lib/safeRedirect'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'recovery', 'invite', 'email_change']

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = React.useState<'loading' | 'error'>('loading')
  const started = React.useRef(false)

  React.useEffect(() => {
    // A token_hash is single-use: a second run of this effect (re-render, StrictMode) would
    // consume it twice and turn a successful sign-in into an "expired link" error.
    if (started.current) return
    started.current = true

    async function completeEmailLinkSignIn() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const rawType = searchParams.get('type') ?? hashParams.get('type') ?? 'email'
      const type = (OTP_TYPES as string[]).includes(rawType) ? (rawType as EmailOtpType) : 'email'
      const next = type === 'recovery' ? '/reset-password' : safeLocalPath(searchParams.get('next'))
      const tokenHash = searchParams.get('token_hash') ?? hashParams.get('token_hash')
      // Session tokens are read from the URL *fragment* only. From the query string, a crafted
      // /auth/callback?access_token=…&refresh_token=… link would sign the victim into a session
      // the attacker chose, and query strings end up in logs and Referer headers.
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      // Scrub credentials from the address bar/history before any network call.
      window.history.replaceState(null, '', window.location.pathname)

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
          if (error) throw error
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (error) throw error
        } else {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (error) throw error
          if (!session) throw new Error('missing_session')
        }
        navigate(next, { replace: true })
      } catch {
        setStatus('error')
      }
    }

    void completeEmailLinkSignIn()
  }, [navigate, searchParams])

  return (
    <div className="auth-shell cyber-page">
      <div className="auth-card glass-panel callback-card">
        {status === 'loading' ? (
          <div role="status" aria-live="polite">
            <Loader className="animate-spin callback-icon" size={34} aria-hidden="true" />
            <h1>Verificando tu enlace…</h1>
            <p>Un momento, estamos confirmando tu acceso.</p>
          </div>
        ) : (
          <div role="alert">
            <TriangleAlert className="callback-icon callback-icon-warn" size={34} aria-hidden="true" />
            <h1>Este enlace ya no sirve</h1>
            <p>Puede haber expirado o ya se usó. Vuelve a ingresar y pide un código nuevo.</p>
            <Link className="neon-button btn-katana outline cyan auth-submit" to="/login">
              <ShieldCheck size={16} aria-hidden="true" /> Volver a ingresar
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
