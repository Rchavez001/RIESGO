import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Loader, Shield } from 'lucide-react'
import { NeonButton } from '../components/CyberBushido'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../lib/authErrors'

type Phase = 'checking' | 'ready' | 'done' | 'invalid'

const MIN_LENGTH = 8

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    // Recovery tokens are read from the URL *fragment* only (never the query string: a crafted
    // link would sign the victim into a session the attacker chose) and the address bar is
    // scrubbed before any network call. Arriving via /auth/callback (verifyOtp) leaves the
    // recovery session in storage, so a stored non-anonymous session is accepted as well.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const access = hash.get('access_token')
    const refresh = hash.get('refresh_token')
    if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname)

    async function resume() {
      try {
        if (access && refresh) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh })
          if (sessionError) throw sessionError
          setPhase('ready')
          return
        }
        const { data: { session } } = await supabase.auth.getSession()
        // An anonymous guest has no password to reset.
        setPhase(session && !session.user.is_anonymous ? 'ready' : 'invalid')
      } catch {
        setPhase('invalid')
      }
    }

    void resume()
  }, [])

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
    return () => window.clearTimeout(timer)
  }, [phase, navigate])

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      // Best effort: after a reset, any other device stays signed in with the old credentials
      // unless its session is revoked.
      void Promise.resolve(supabase.auth.signOut({ scope: 'others' })).catch(() => {})
      setPhase('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (/same|different/i.test(msg)) setError('La nueva contraseña debe ser distinta de la anterior.')
      else if (/weak|short|at least|characters/i.test(msg)) setError(`Esa contraseña es muy débil. Usa al menos ${MIN_LENGTH} caracteres.`)
      else if (/session|jwt|expired|not authenticated/i.test(msg)) {
        setPhase('invalid')
      } else setError(friendlyAuthError(err, 'No pudimos actualizar tu contraseña. Inténtalo de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell cyber-page">
      <div className="auth-card glass-panel">
        <div className="text-center">
          <KeyRound className="callback-icon" size={34} aria-hidden="true" />
          <h1>Nueva contraseña</h1>
        </div>

        {phase === 'checking' && (
          <div role="status" aria-live="polite" className="callback-card">
            <Loader className="animate-spin callback-icon" size={28} aria-hidden="true" />
            <p>Verificando tu enlace de recuperación…</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div role="alert">
            <p>Este enlace ya no sirve: puede haber expirado o ya se usó. Vuelve a ingresar y pide un código nuevo.</p>
            <Link className="neon-button btn-katana outline cyan auth-submit reset-back" to="/login">
              <Shield size={16} aria-hidden="true" /> Volver a ingresar
            </Link>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={(e) => void submitNewPassword(e)}>
            <p>Elige una contraseña nueva de al menos {MIN_LENGTH} caracteres.</p>
            <div className="field">
              <label htmlFor="new-password">NUEVA CONTRASEÑA</label>
              <div className="password-field">
                <input
                  id="new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  maxLength={128}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  autoFocus
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
            <div className="field">
              <label htmlFor="confirm-password">REPITE LA CONTRASEÑA</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                maxLength={128}
                autoComplete="new-password"
                enterKeyHint="go"
              />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <NeonButton type="submit" className="auth-submit" disabled={busy}>
              {busy ? <Loader className="animate-spin" size={18} /> : <Shield size={16} />}
              Guardar contraseña
            </NeonButton>
          </form>
        )}

        {phase === 'done' && (
          <div role="status" aria-live="polite">
            <p>Listo: tu contraseña se actualizó. Te llevamos a tu panel…</p>
            <Link className="neon-button btn-katana outline cyan auth-submit reset-back" to="/dashboard">
              Ir ahora
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResetPasswordPage
