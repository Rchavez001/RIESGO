import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader, Shield } from 'lucide-react'
import { KanjiBackground, NeonButton, ScanlineOverlay } from '../components/CyberBushido'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'register'

const FALLBACK_BUSINESS_SECTORS = [
  { code: 'comerciante', label: 'Comerciante' },
  { code: 'restaurante', label: 'Restaurante / Comida' },
  { code: 'ferreteria', label: 'Ferreteria' },
  { code: 'farmacia', label: 'Farmacia' },
  { code: 'agricultor', label: 'Agricultor' },
  { code: 'pescador', label: 'Pescador' },
  { code: 'otro', label: 'Otro' },
]

export function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, signIn, signInWithMagicLink, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>(() => (
    new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login'
  ))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [magicLinkMessage, setMagicLinkMessage] = useState('')
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  const [showDataConsent, setShowDataConsent] = useState(false)
  const [businessSectors, setBusinessSectors] = useState(FALLBACK_BUSINESS_SECTORS)
  const redirectPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'

  React.useEffect(() => {
    if (!authLoading && user) {
      navigate(redirectPath, { replace: true })
    }
  }, [authLoading, navigate, redirectPath, user])

  React.useEffect(() => {
    const search = window.location.search
    const hash = window.location.hash
    const params = new URLSearchParams(search.replace(/^\?/, ''))
    const type = params.get('type')
    const accessToken = params.get('access_token') || new URLSearchParams(hash.replace(/^#/, '')).get('access_token')
    const refreshToken = params.get('refresh_token') || new URLSearchParams(hash.replace(/^#/, '')).get('refresh_token')

    if (type === 'password_recovery' || type === 'recovery') {
      handlePasswordRecoveryRedirect(accessToken, refreshToken)
    }
  }, [])

  React.useEffect(() => {
    async function loadBusinessSectors() {
      const { data, error } = await supabase
        .from('business_sectors')
        .select('code,label')
        .eq('active', true)
        .order('display_order')

      if (!error && data && data.length > 0) {
        setBusinessSectors(data)
      }
    }

    void loadBusinessSectors()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    try {
      if (mode === 'login') {
        if (!showPasswordLogin) {
          await handleMagicLinkSignIn()
          return
        }
        setLoading(true)
        await signIn(email, password)
        navigate(redirectPath, { replace: true })
      } else {
        if (!businessType) throw new Error('Seleccione el tipo de negocio')
        setShowDataConsent(true)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg.includes('Invalid login') ? 'Correo o contrasena incorrectos' : msg)
    } finally {
      setLoading(false)
    }
  }

  async function acceptDataConsent() {
    setError('')
    setShowDataConsent(false)
    setLoading(true)

    try {
      await signUp(email, password, {
        full_name: fullName.trim(),
        business_type: businessType,
        data_processing_authorized: true,
        data_processing_authorized_at: new Date().toISOString(),
      } as any)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function rejectDataConsent() {
    setShowDataConsent(false)
    navigate('/')
  }

  async function handlePasswordRecoveryRedirect(accessToken: string | null, refreshToken: string | null) {
    if (!accessToken) return

    try {
      setLoading(true)
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? accessToken })
      window.location.replace('/reset-password')
    } catch (err) {
      console.error('Error al procesar el enlace de recuperación:', err)
      setError('No se pudo procesar el enlace de recuperación. Intenta abrirlo nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    setError('')
    setResetMessage('')
    if (!email) return setError('Por favor ingresa el correo asociado a la cuenta')
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setResetMessage('Se envió un correo con instrucciones para restablecer la contraseña. Revisa tu bandeja.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar recuperación'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLinkSignIn() {
    setError('')
    setMagicLinkMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      setError('Ingresa un correo electronico valido')
      return
    }

    const now = Date.now()
    if (magicLinkCooldownUntil > now) {
      setMagicLinkMessage('Si el correo esta registrado, recibiras un enlace seguro en unos minutos.')
      return
    }

    setMagicLinkLoading(true)
    try {
      await signInWithMagicLink(normalizedEmail, redirectPath)
      setMagicLinkCooldownUntil(now + 60_000)
      setMagicLinkMessage('Si el correo ya esta registrado, recibiras un enlace seguro. Si eres nuevo, completa el registro.')
    } catch {
      setMagicLinkCooldownUntil(now + 60_000)
      setMagicLinkMessage('Si el correo ya esta registrado, recibiras un enlace seguro. Si eres nuevo, completa el registro.')
    } finally {
      setMagicLinkLoading(false)
    }
  }

  return (
    <ScanlineOverlay>
      <div className="auth-shell cyber-page">
        <KanjiBackground char="門" />
        <form onSubmit={handleSubmit} className="auth-card glass-panel">
          <div className="text-center">
            <div className="torii">⛩</div>
            <p className="mono-label">サイバー道場 · AUTH GATE</p>
            <h1>CIBER DOJO</h1>
          </div>
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Ingresar</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Registro</button>
          </div>

          {mode === 'login' && (
            <div className="auth-guidance">
              Escribe tu correo. Si ya tienes cuenta, te enviaremos un enlace seguro de acceso; si eres nuevo, puedes registrarte aqui mismo.
            </div>
          )}

          {mode === 'register' && (
            <div className="field">
              <label>NOMBRE DEL GUERRERO</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Nombre completo" autoComplete="name" />
            </div>
          )}

          <div className="field">
            <label>CORREO ELECTRONICO</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nombre@empresa.com" autoComplete="email" />
          </div>

          {(mode === 'register' || showPasswordLogin) && (
          <div className="field">
            <label>CONTRASENA</label>
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode === 'register' || showPasswordLogin}
                minLength={mode === 'register' ? 8 : undefined}
                placeholder="********"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                title={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          )}

          {mode === 'login' && (
            <div className="field small">
              <div className="auth-method-toggle">
                <button
                  type="button"
                  className={`auth-method-btn${!showPasswordLogin ? ' active' : ''}`}
                  onClick={() => { setShowPasswordLogin(false); setPassword(''); setError('') }}
                >
                  🔗 Enlace seguro
                  {!showPasswordLogin && <span className="auth-method-badge">Recomendado</span>}
                </button>
                <button
                  type="button"
                  className={`auth-method-btn${showPasswordLogin ? ' active' : ''}`}
                  onClick={() => { setShowPasswordLogin(true); setError('') }}
                >
                  🔑 Contraseña
                </button>
              </div>
              <div className="auth-secondary-links">
                <button type="button" className="link" onClick={() => { setMode('register'); setError(''); setMagicLinkMessage('') }}>
                  Crear cuenta nueva
                </button>
                <button type="button" className="link" onClick={() => { setShowReset((s) => !s); setResetMessage(''); setError('') }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {magicLinkMessage && <div className="form-success">{magicLinkMessage}</div>}
            </div>
          )}

          {showReset && mode === 'login' && (
            <div className="field">
              <label>Recuperar contraseña</label>
              <p className="muted">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.com" />
                <button type="button" className="btn secondary" onClick={handleResetPassword} disabled={loading}>{loading ? 'Enviando...' : 'Enviar'}</button>
              </div>
              {resetMessage && <div className="form-success">{resetMessage}</div>}
            </div>
          )}

          {mode === 'register' && (
            <div className="field">
              <label>TIPO DE NEGOCIO</label>
              <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} required>
                <option value="">Seleccione...</option>
                {businessSectors.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <NeonButton type="submit" className="w-full justify-center" disabled={loading || magicLinkLoading}>
            {(loading || magicLinkLoading) ? <Loader className="animate-spin" size={18} /> : <Shield size={16} />}
            {mode === 'login'
              ? (showPasswordLogin ? 'ABRIR EL DOJO' : 'ENVIAR ENLACE SEGURO')
              : 'FORJAR CUENTA'}
          </NeonButton>
        </form>

        {showDataConsent && createPortal(
          <div className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
            <div className="consent-backdrop" />
            <div className="consent-card glass-panel">
              <div className="mono-label">AUTORIZACION DE DATOS PERSONALES</div>
              <h2 id="consent-title">Tratamiento de datos personales</h2>
              <p>
                Autorizo el tratamiento de mis datos personales para fines internos de la aplicación,
                incluyendo registro, gestión de usuario, operación del servicio y clasificación estadística
                durante la vigencia de mi uso de la aplicación.
              </p>
              <p>
                Declaro conocer que puedo ejercer mis derechos de acceso, rectificación, actualización,
                eliminación y oposición —derechos ARCO—, así como solicitar la modificación o eliminación
                de mis datos personales, escribiendo al correo: <strong>raulchavezdrouet@gmail.com</strong>.
              </p>
              <div className="consent-actions">
                <NeonButton color="cyan" variant="outline" onClick={rejectDataConsent}>
                  No acepto
                </NeonButton>
                <NeonButton color="gold" variant="outline" onClick={() => void acceptDataConsent()}>
                  Acepto y continuar
                </NeonButton>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </ScanlineOverlay>
  )
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
