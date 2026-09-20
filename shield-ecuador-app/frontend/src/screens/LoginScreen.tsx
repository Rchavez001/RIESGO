import React, { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, Loader, Shield } from 'lucide-react'
import { KanjiBackground, NeonButton, ScanlineOverlay } from '../components/CyberBushido'
import { OtpCodeStep } from '../components/OtpCodeStep'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { safeLocalPath } from '../lib/safeRedirect'
import { friendlyAuthError } from '../lib/authErrors'

type Step = 'password' | 'code'

export function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, signIn, sendLoginCode, verifyCode } = useAuth()
  const [step, setStep] = useState<Step>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fallbackNotice, setFallbackNotice] = useState('')
  const redirectPath = safeLocalPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname)

  React.useEffect(() => {
    // Same reasoning as RegisterScreen: an anonymous guest is still `user`
    // truthy, but must be able to actually reach the login form instead of
    // bouncing back to a guest-gated /dashboard.
    if (!authLoading && user && !user.is_anonymous) {
      navigate(redirectPath, { replace: true })
    }
  }, [authLoading, navigate, redirectPath, user])

  React.useEffect(() => {
    // Supabase puts recovery tokens in the URL *fragment*. They are never read from the query
    // string: a crafted /login?type=recovery&access_token=... link would otherwise sign a victim
    // into an attacker-chosen session, and query strings end up in logs and Referer headers.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const type = hash.get('type')
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')

    if ((type === 'password_recovery' || type === 'recovery') && accessToken && refreshToken) {
      window.history.replaceState(null, '', window.location.pathname) // scrub tokens from the address bar/history first
      void handlePasswordRecoveryRedirect(accessToken, refreshToken)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (new URLSearchParams(location.search).get('mode') === 'register') {
    return <Navigate to="/registro" replace />
  }

  async function handlePasswordRecoveryRedirect(accessToken: string, refreshToken: string) {
    try {
      setLoading(true)
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      window.location.replace('/reset-password')
    } catch {
      console.error('Error al procesar el enlace de recuperación')
      setError('No se pudo procesar el enlace de recuperación. Intenta abrirlo nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  // Password is the primary path. If it fails — wrong password, or an
  // account that was never given a real one — we fall back to emailing a
  // login code instead of just showing "incorrect credentials" and
  // stopping. This never reveals which of those two cases occurred (no
  // account-enumeration signal), it just offers the safer path either way.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFallbackNotice('')
    setLoading(true)

    try {
      await signIn(email, password)
      navigate(redirectPath, { replace: true })
      return
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (!/invalid login/i.test(msg)) {
        setError(friendlyAuthError(err, 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.'))
        setLoading(false)
        return
      }
    }

    try {
      await sendLoginCode(email)
      setFallbackNotice('No pudimos iniciar sesión con esa contraseña.')
      setStep('code')
    } catch (err: unknown) {
      // Never surface Supabase's own text here: "Signups not allowed" would confirm the e-mail has no account.
      setError(friendlyAuthError(err, 'Correo o contraseña incorrectos.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(code: string) {
    await verifyCode(email, code)
    navigate(redirectPath, { replace: true })
  }

  return (
    <ScanlineOverlay>
      <div className="auth-shell cyber-page">
        <KanjiBackground char="門" />
        <div className="auth-card glass-panel">
          <Link className="auth-home-link" to="/">← Volver a ciberDojo</Link>
          <div className="text-center">
            <div className="torii">⛩</div>
            <h1>Entra a tu dojo</h1>
          </div>

          {step === 'password' && (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="field">
                <label htmlFor="login-email">CORREO ELECTRÓNICO</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="nombre@empresa.com"
                  name="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  enterKeyHint="next"
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="login-password">CONTRASEÑA</label>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="********"
                    name="password"
                    autoComplete="current-password"
                    enterKeyHint="go"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}

              <NeonButton type="submit" className="auth-submit" disabled={loading}>
                {loading ? <Loader className="animate-spin" size={18} /> : <Shield size={16} />}
                Ingreso
              </NeonButton>

              <div className="field small">
                <div className="auth-secondary-links">
                  <Link className="link" to="/registro">Crear cuenta nueva</Link>
                </div>
              </div>
            </form>
          )}

          {step === 'code' && (
            <>
              {fallbackNotice && <p className="muted">{fallbackNotice}</p>}
              <OtpCodeStep
                email={email}
                onVerify={handleVerify}
                onResend={() => sendLoginCode(email)}
                onEditEmail={() => { setStep('password'); setError(''); setFallbackNotice('') }}
              />
            </>
          )}
        </div>
      </div>
    </ScanlineOverlay>
  )
}
